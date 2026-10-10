// wordsTable.js — раздел «Словарь»: закреплённая шапка (счётчик, сортировка, поиск), слова, переводы, предложения.
import * as db from '../core/db.js';
import { tokenize, esc } from '../core/textUtils.js';
import { markTranslationAny } from '../core/translator.js';
import { titleRow, sortSelect, searchBox, bindPin, setCount, hit } from '../core/ui.js';
import { PENCIL, TRASH } from '../core/icons.js';
import { STATUS_INFO, isArchived, refreshArchive } from './srs.js';

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

// Поиск по английскому слову и по переводам.
export function filterWords(words, query) {
  const q = query.trim().toLowerCase();
  if (!q) return words;
  return words.filter((w) => w.word.toLowerCase().includes(q) || w.translations.some((t) => t.toLowerCase().includes(q)));
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
const legend = () => `<div class="legend">${Object.values(STATUS_INFO).map((i) => `<span class="dot" style="background:${i.color}"></span>${i.label.toLowerCase()}`).join(' ')}</div>`;

export async function renderWordsTable(container) {
  await refreshArchive();
  let mode = await db.getSetting('vocabSort', 'az');
  let query = '';
  let words = await db.getAllWords();
  container.innerHTML = `<div class="pin">${titleRow('Словарь')}${sortSelect(SORTS, mode)}${searchBox('Поиск: слово или перевод')}</div><div id="wlist"></div>`;
  const list = container.querySelector('#wlist');

  function draw() {
    const shown = sortWords(filterWords(words, query), mode);
    const q = query.trim();
    setCount(container, shown.length, words.length, !!q);
    if (!shown.length) { list.innerHTML = `<div class="empty">${q ? `Ничего не найдено по запросу «${esc(q)}»` : 'В словаре пока нет слов'}</div>`; return; }
    list.innerHTML = legend() + shown.map((w) => `
    <div class="card">
      <div class="word-head">
        <div class="wt"><b>${hit(w.word, q)}</b> — ${hit(w.translations.join(', '), q)}</div>
        <div class="word-actions">
          <span class="dot" style="background:${STATUS_INFO[w.status].color}" title="${esc(statusTitle(w))}"></span>
          <button class="icon-btn" data-edit="${esc(w.word)}" title="Изменить переводы" aria-label="Изменить переводы">${PENCIL}</button>
          <button class="icon-btn" data-del="${esc(w.word)}" title="Удалить слово" aria-label="Удалить слово">${TRASH}</button>
        </div>
      </div>
      ${w.sentences.map((s) => `<div class="sent"><div class="en">${highlight(s.en, w.word)}</div><div class="ru muted">${highlightRu(s.ru, w.translations)}</div></div>`).join('')}
    </div>`).join('');
  }

  bindPin(container, {
    onSort: async (v) => { mode = v; await db.setSetting('vocabSort', v); draw(); },
    onQuery: (v) => { query = v; draw(); },
  });
  list.onclick = async (e) => {
    const del = e.target.closest('[data-del]');
    const edit = e.target.closest('[data-edit]');
    if (del) {
      const word = del.dataset.del;
      const w = words.find((x) => x.word === word);
      if (!confirm(`Удалить слово «${word}» и все его предложения (${w ? w.sentences.length : 0})?`)) return;
      await db.deleteWord(word);
      words = await db.getAllWords();
      draw();
    } else if (edit) {
      const w = words.find((x) => x.word === edit.dataset.edit);
      const input = prompt(`Переводы слова «${w.word}» (через запятую)`, w.translations.join(', '));
      if (input === null) return;
      const listTr = [...new Set(input.split(/[,;]/).map((x) => x.trim()).filter(Boolean))];
      if (!listTr.length) return; // пустой список не сохраняем
      await db.putWord({ ...w, translations: listTr });
      words = await db.getAllWords();
      draw();
    }
  };
  draw();
}
