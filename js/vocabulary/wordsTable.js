// wordsTable.js — раздел «Словарь»: слова, переводы, предложения с переводом, удаление.
import * as db from '../core/db.js';
import { tokenize } from '../core/textUtils.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TRASH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';

// Английское предложение с выделенным словом.
function highlight(sentence, word) {
  return tokenize(sentence).map((t) => (t.type === 'word' && t.norm === word ? `<mark>${esc(t.text)}</mark>` : esc(t.text))).join('');
}

export async function renderWordsTable(container) {
  const words = (await db.getAllWords()).sort((a, b) => a.word.localeCompare(b.word));
  container.innerHTML = `<p class="muted">Слов в базе: ${words.length}</p>` + words.map((w) => `
    <div class="card">
      <div class="word-head">
        <div><b>${esc(w.word)}</b> — ${esc(w.translations.join(', '))}</div>
        <button class="icon-btn" data-del="${esc(w.word)}" title="Удалить слово" aria-label="Удалить слово">${TRASH}</button>
      </div>
      ${w.sentences.map((s) => `<div class="sent"><div>${highlight(s.en, w.word)}</div><div class="muted">${esc(s.ru)}</div></div>`).join('')}
    </div>`).join('');

  container.onclick = async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const word = btn.dataset.del;
    const w = words.find((x) => x.word === word);
    if (!confirm(`Удалить слово «${word}» и все его предложения (${w ? w.sentences.length : 0})?`)) return;
    await db.deleteWord(word);
    await renderWordsTable(container);
  };
}
