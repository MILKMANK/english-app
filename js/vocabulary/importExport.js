// importExport.js — импорт слов из таблицы (Excel/CSV) и экспорт всех слов и предложений в Excel.
// Таблица: 1-й столбец — английское слово, 2-й — переводы (через запятую, точку с запятой, точку и т.п.),
// 3-й — предложение, 4-й (необязательно) — готовый перевод предложения. Пустые 2-й и 3-й столбцы дополняются.
import * as db from '../core/db.js';
import { normalizeWord } from '../core/textUtils.js';
import { buildXlsx, parseXlsx } from '../core/xlsx.js';
import { deliverFile } from '../core/download.js';
import { STATUS_INFO } from './srs.js';

// ---------- разбор ячеек ----------
export function splitTranslations(s) {
  const parts = String(s ?? '').split(/[,;.:/|\\\n\r\t，；、。]+|\s[–—-]\s/).map((x) => x.trim()).filter(Boolean);
  return [...new Set(parts)];
}
export function normalizeImportWord(raw) {
  const t = String(raw).trim().replace(/\s+/g, ' ');
  return /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(t) ? normalizeWord(t) : t.toLowerCase();
}
const HEADER = /^(english|word|words|слово|слова|англ\S*)$/i;
const isHeader = (row) => { const a = String(row[0] || '').trim(); return HEADER.test(a) || /[А-Яа-яЁё]/.test(a); };

// CSV: разделитель определяется сам (, ; или табуляция), кавычки поддерживаются.
export function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, '');
  const head = src.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export async function readTable(file) {
  const ext = ((file.name.match(/\.([^.]+)$/) || [])[1] || '').toLowerCase();
  if (ext === 'xlsx') return parseXlsx(await file.arrayBuffer());
  if (ext === 'xls') throw new Error('Старый формат .xls не поддерживается. Сохраните таблицу как .xlsx или .csv');
  if (['csv', 'tsv', 'txt'].includes(ext)) {
    const buf = await file.arrayBuffer();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('windows-1251').decode(buf); }
    return parseCsv(text);
  }
  throw new Error('Поддерживаются таблицы Excel (.xlsx) и CSV');
}

// ---------- план импорта ----------
// existing: Map слово -> запись из базы. Возвращает { entries, summary }.
export function buildPlan(rows, existing) {
  const skip = rows.length && isHeader(rows[0]) ? 1 : 0;
  const entries = [];
  rows.slice(skip).forEach((r, i) => {
    const raw = String(r[0] ?? '').trim();
    if (!raw) return;
    const word = normalizeImportWord(raw);
    const sentence = String(r[2] ?? '').trim().replace(/\s+/g, ' ');
    entries.push({ row: skip + i + 1, word, translations: splitTranslations(r[1]), sentence: sentence || word, sentenceGiven: !!sentence, sentenceRu: String(r[3] ?? '').trim() || null });
  });
  // переводы одного слова из разных строк объединяются
  const union = new Map();
  for (const e of entries) union.set(e.word, [...new Set([...(union.get(e.word) || []), ...e.translations])]);
  entries.forEach((e) => { e.translations = union.get(e.word); });
  const words = [...union.keys()];
  const needWord = new Set(), needSent = new Set();
  for (const e of entries) {
    const ex = existing.get(e.word);
    if (!e.translations.length && !(ex && ex.translations.length)) needWord.add(e.word);
    if (e.sentenceGiven && !e.sentenceRu && !(ex && ex.sentences.some((s) => s.en === e.sentence))) needSent.add(e.sentence);
  }
  const chars = [...needWord, ...needSent].reduce((n, s) => n + s.length, 0);
  return { entries, summary: {
    rows: entries.length, newWords: words.filter((w) => !existing.has(w)).length, existingWords: words.filter((w) => existing.has(w)).length,
    requests: needWord.size + needSent.size, chars,
  } };
}

// ---------- выполнение ----------
// ctx: { translator, onProgress(done, total), shouldStop() }
export async function runImport(entries, { translator, onProgress = () => {}, shouldStop = () => false }) {
  const res = { total: entries.length, done: 0, newWords: 0, extended: 0, sentences: 0, failures: [], stoppedBy: null };
  for (const e of entries) {
    if (shouldStop()) { res.stoppedBy = 'user'; break; }
    try {
      const ex = await db.getWord(e.word);
      let trs = e.translations;
      if (!trs.length && !(ex && ex.translations.length)) trs = [(await translator.translateWord(e.word)).text];
      const sentExists = !!(ex && ex.sentences.some((s) => s.en === e.sentence));
      let ru = e.sentenceRu, addSentence = true;
      if (!sentExists && !ru) {
        if (!e.sentenceGiven) ru = trs[0] || (ex && ex.translations[0]) || ''; // предложение = слово: перевод = перевод слова
        else {
          try { ru = (await translator.translateSentence(e.sentence)).text; }
          catch (err) {
            if (err.code === 'limit' || err.code === 'network') throw err;
            addSentence = false; ru = '';
            res.failures.push({ row: e.row, word: e.word, reason: 'предложение не переведено, слово добавлено без него' });
          }
        }
      }
      const out = await db.addSentence({ word: e.word, translations: trs, en: addSentence ? e.sentence : '', ru, bookId: null });
      if (!ex) res.newWords++;
      else if (out.added || trs.some((t) => !ex.translations.includes(t))) res.extended++;
      if (out.added) res.sentences++;
    } catch (err) {
      if (err.code === 'limit' || err.code === 'network') { res.stoppedBy = err.code; break; }
      res.failures.push({ row: e.row, word: e.word, reason: err.message || 'ошибка' });
    }
    res.done++;
    onProgress(res.done, res.total);
  }
  return res;
}

// ---------- экспорт ----------
export function exportRows(words) {
  const rows = [['English', 'Переводы', 'Предложение', 'Перевод предложения', 'Статус']];
  for (const w of [...words].sort((a, b) => a.word.localeCompare(b.word))) {
    const tr = w.translations.join(', '), st = STATUS_INFO[w.status] ? STATUS_INFO[w.status].label : '';
    if (!w.sentences.length) rows.push([w.word, tr, '', '', st]);
    else for (const s of w.sentences) rows.push([w.word, tr, s.en, s.ru || '', st]);
  }
  return rows;
}
export async function exportWords() {
  const bytes = buildXlsx(exportRows(await db.getAllWords()), { widths: [22, 34, 70, 70, 14] });
  const name = `english-words-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return deliverFile(new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
