// wordsTable.js — раздел «Словарь»: слова, переводы, предложения, статусы, сортировка, правка и удаление.
import * as db from '../core/db.js';
import { tokenize, esc } from '../core/textUtils.js';
import { markTranslationAny } from '../core/translator.js';
import { STATUS_INFO, isArchived, refreshArchive } from './srs.js';

const svg = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const TRASH = svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>');
const PENCIL = svg('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>');

export const SORTS = { az: 'A → Z', za: 'Z → A', newest: 'Сначала новые', oldest: 'Сначала старые', status: 'По статусу' };

export function sortWords(words, mode) {
  const alpha = (x, y) => x.word.localeCompare(y.word);
  const rank = { new: 0, learning: 1, learned: 2 };
  const a = [...words];
  if (mode === 'za') return a.sort((x, y) => alpha(y, x));
  if (mode === 'newest') return a.sort((x, y) => y.createdAt - x.createdAt || alpha(x, y));
  if (mode === 'oldest') return a.sort((x, y) => x.createdAt - y.createdAt || alpha(x, y));
  if (mode === 'status') return a.sort((x, y) => rank[x.status] - rank[y.status] || alpha(x, y));
  return a.sort(alpha);
}

function highlight(sentence, word) {
  return tokenize(sentence).map((t) => (t.type === 'word' && t.norm === word ? `<mark>${esc(t.text)}</mark>` : esc(t.text))).join('');
}
function highlightRu(sentence, translations) {
  const m = markTranslationAny(sentence, translations);
  if (!m) return esc(sentence);
  return esc(sentence.slice(0, m.start)) + '<mark>' + esc(sentence.slice(m.start, m.end)) + '</mark>' + esc(sentence.slice(m.end));
}
function statusTitle(w) {
  const label = STATUS_INFO[w.status].label;
  return isArchived(w) ? `${label} (в архиве до ${new Date(w.archivedUntil).toLocaleDateString('ru-RU')})` : label;
}

export async function renderWordsTable(container) {
  await refreshArchive();
  const mode = await db.getSetting('vocabSort', 'az');
  const words = sortWords(await db.getAllWords(), mode);
  container.innerHTML = `
    <select id="sort" aria-label="Сортировка">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}"${k === mode ? ' selected' : ''}>${v}</option>`).join('')}</select>
    <p class="muted">Слов в базе: ${words.length} · ${Object.values(STATUS_INFO).map((i) => `<span class="dot" style="background:${i.color}"></span>${i.label.toLowerCase()}`).join(' ')}</p>
    ${words.map((w) => `
    <div class="card">
      <div class="word-head">
        <div><b>${esc(w.word)}</b> — ${esc(w.translations.join(', '))}</div>
        <div class="word-actions">
          <span class="dot" style="background:${STATUS_INFO[w.status].color}" title="${esc(statusTitle(w))}"></span>
          <button class="icon-btn" data-edit="${esc(w.word)}" title="Изменить переводы" aria-label="Изменить переводы">${PENCIL}</button>
          <button class="icon-btn" data-del="${esc(w.word)}" title="Удалить слово" aria-label="Удалить слово">${TRASH}</button>
        </div>
      </div>
      ${w.sentences.map((s) => `<div class="sent"><div>${highlight(s.en, w.word)}</div><div class="muted">${highlightRu(s.ru, w.translations)}</div></div>`).join('')}
    </div>`).join('')}`;

  container.querySelector('#sort').onchange = async (e) => { await db.setSetting('vocabSort', e.target.value); renderWordsTable(container); };
  container.onclick = async (e) => {
    const del = e.target.closest('[data-del]');
    const edit = e.target.closest('[data-edit]');
    if (del) {
      const word = del.dataset.del;
      const w = words.find((x) => x.word === word);
      if (!confirm(`Удалить слово «${word}» и все его предложения (${w ? w.sentences.length : 0})?`)) return;
      await db.deleteWord(word);
      await renderWordsTable(container);
    } else if (edit) {
      const w = words.find((x) => x.word === edit.dataset.edit);
      const input = prompt(`Переводы слова «${w.word}» (через запятую)`, w.translations.join(', '));
      if (input === null) return;
      const list = [...new Set(input.split(/[,;]/).map((x) => x.trim()).filter(Boolean))];
      if (!list.length) return; // пустой список не сохраняем
      await db.putWord({ ...w, translations: list });
      await renderWordsTable(container);
    }
  };
}
