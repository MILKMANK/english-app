// readerView.js — раздел «Чтение»: библиотека книг и читалка с кликабельными словами.
import * as db from '../core/db.js';
import { renderLibrary, countWords } from './library.js';
import { tokenize, splitSentences, sentenceAt, esc } from '../core/textUtils.js';
import { createPopup } from './wordPopup.js';
import { ARROW_LEFT, CHEVRON_LEFT, CHEVRON_RIGHT } from '../core/icons.js';

// Как открывать слово: 'double' — двойной клик/тап, 'single' — одиночный.
export const CLICK_MODE = 'double';
const DOUBLE_MS = 350;

export function mountReader(container, { translator }) {
  let book = null, chapter = 0, paras = [], spans = new Map(), known = new Map();
  const sentCache = new Map();
  let scrollTimer = null, alive = true;
  const popup = createPopup({ translator, onSaved: (norm) => {
    known.set(norm, true);
    (spans.get(norm) || []).forEach((sp) => sp.classList.add('k', 'kb'));
    if (book && chapter === book.chapters.length - 1) paintEnd(); // обновить счётчик в конце книги
  } });

  // ---------- библиотека ----------
  async function showLibrary() {
    await db.setSetting('currentBook', null);
    popup.close();
    book = null;
    window.scrollTo(0, 0);
    await renderLibrary(container, { openBook });
  }

  // ---------- читалка ----------
  async function openBook(id) {
    book = await db.getBook(id);
    if (!book) return showLibrary();
    await db.setSetting('currentBook', id);
    if (book.status !== 'reading' && book.status !== 'read') { book.status = 'reading'; await db.updateBook(id, { status: 'reading' }); } // открыли — значит читаем
    known = new Map();
    for (const w of await db.getAllWords()) known.set(w.word, w.sentences.some((s) => s.bookId === id));
    const pr = await db.getSetting('progress:' + id, { chapter: 0, para: 0 });
    container.onclick = null;
    container.innerHTML = `
      <div class="rbar">
        <button class="nav-btn" id="back" title="В библиотеку" aria-label="В библиотеку">${ARROW_LEFT}</button>
        <button class="nav-btn" id="prev" title="Предыдущая глава" aria-label="Предыдущая глава">${CHEVRON_LEFT}</button>
        <select id="chsel">${book.chapters.map((c, i) => `<option value="${i}">${esc(c.title)}</option>`).join('')}</select>
        <button class="nav-btn" id="next" title="Следующая глава" aria-label="Следующая глава">${CHEVRON_RIGHT}</button>
      </div>
      <article id="text"></article>`;
    container.querySelector('#back').onclick = showLibrary;
    container.querySelector('#prev').onclick = () => goChapter(chapter - 1);
    container.querySelector('#next').onclick = () => goChapter(chapter + 1);
    container.querySelector('#chsel').onchange = (e) => goChapter(+e.target.value);
    bindTaps(container.querySelector('#text'));
    renderChapter(Math.min(pr.chapter, book.chapters.length - 1), pr.para);
  }

  function goChapter(i) {
    if (i < 0 || i >= book.chapters.length) return;
    popup.close();
    renderChapter(i, 0);
    window.scrollTo(0, 0);
  }

  function renderChapter(i, startPara) {
    chapter = i;
    const c = book.chapters[i];
    paras = c.text.split('\n\n');
    sentCache.clear();
    const html = paras.map((p, pi) => {
      let off = 0, h = '';
      for (const t of tokenize(p)) {
        if (t.type === 'word') {
          const k = known.has(t.norm) ? (known.get(t.norm) ? ' k kb' : ' k') : '';
          h += `<span class="w${k}" data-n="${esc(t.norm)}" data-o="${off}">${esc(t.text)}</span>`;
        } else h += esc(t.text);
        off += t.text.length;
      }
      return `<p data-p="${pi}">${h}</p>`;
    }).join('');
    const last = i === book.chapters.length - 1;
    const text = container.querySelector('#text');
    const endBlock = `<div class="book-end"><div class="muted small" id="endStats"></div><button class="read-btn" id="readBtn"></button><div class="muted small" id="readHint"></div></div>`;
    text.innerHTML = `<h2 class="ch">${esc(c.title)}</h2>${html}${last ? endBlock : '<button class="btn" id="nextBottom">Следующая глава →</button>'}`;
    const nb = text.querySelector('#nextBottom');
    if (nb) nb.onclick = () => goChapter(chapter + 1);
    if (last) paintEnd();
    container.querySelector('#chsel').value = String(i);
    spans = new Map();
    text.querySelectorAll('.w').forEach((sp) => {
      const n = sp.dataset.n;
      if (!spans.has(n)) spans.set(n, []);
      spans.get(n).push(sp);
    });
    db.setSetting('progress:' + book.id, { chapter: i, para: startPara || 0 });
    if (startPara) {
      const el = text.querySelector(`p[data-p="${startPara}"]`);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - barHeight() - 8);
    }
  }

  // Блок в конце книги: счётчики слов и кнопка «Прочитано» (повторное нажатие возвращает «в процессе»).
  function paintEnd() {
    const btn = container.querySelector('#readBtn');
    if (!btn) return;
    if (book.wordCount == null) { book.wordCount = countWords(book.chapters); db.updateBook(book.id, { wordCount: book.wordCount }); }
    const inDict = [...known.values()].filter(Boolean).length;
    container.querySelector('#endStats').textContent = `Слов в книге: ${book.wordCount.toLocaleString('ru-RU')} · добавлено в словарь: ${inDict}`;
    const done = book.status === 'read';
    btn.textContent = done ? '✓ Прочитано' : 'Прочитано';
    btn.classList.toggle('done', done);
    container.querySelector('#readHint').textContent = done ? 'Нажмите ещё раз, чтобы вернуть «В процессе»' : '';
    btn.onclick = async () => {
      book.status = book.status === 'read' ? 'reading' : 'read';
      await db.updateBook(book.id, { status: book.status });
      paintEnd();
    };
  }

  const barHeight = () => { const b = container.querySelector('.rbar'); return b ? b.offsetHeight : 0; };

  // ---------- клики ----------
  function bindTaps(text) {
    let down = null, lastTap = null;
    text.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now(), el: e.target.closest('.w') }; });
    text.addEventListener('pointercancel', () => { down = null; });
    text.addEventListener('pointerup', (e) => {
      const d = down; down = null;
      if (!d) return;
      const el = e.target.closest('.w');
      if (!el || el !== d.el) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || Date.now() - d.t > 600) return; // это был скролл
      const now = Date.now();
      if (CLICK_MODE === 'single') return openWord(el);
      if (lastTap && lastTap.el === el && now - lastTap.t < DOUBLE_MS) { lastTap = null; openWord(el); }
      else { lastTap = { el, t: now }; prefetch(el); }
    });
  }

  function wordContext(el) {
    const pi = +el.closest('p').dataset.p;
    const text = paras[pi];
    if (!sentCache.has(pi)) sentCache.set(pi, splitSentences(text));
    const off = +el.dataset.o;
    const s = sentenceAt(sentCache.get(pi), off);
    return {
      norm: el.dataset.n, shown: el.textContent,
      sentence: s ? s.text : text, relStart: s ? off - s.start : off, relLen: el.textContent.length,
      bookId: book.id, anchor: el,
    };
  }
  const openWord = (el) => popup.open(wordContext(el));

  // Первый тап двойного: запускаем перевод заранее, ко второму тапу он уже в пути (или в кэше).
  function prefetch(el) {
    const c = wordContext(el);
    if (!known.has(c.norm)) translator.translateWord(c.norm).catch(() => {});
    translator.translateSentence(c.sentence).catch(() => {});
  }

  // ---------- позиция чтения ----------
  function onScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(saveProgress, 400);
  }
  function saveProgress() {
    if (!book || !alive) return;
    const limit = barHeight() + 4;
    let idx = 0;
    for (const p of container.querySelectorAll('#text p')) {
      if (p.getBoundingClientRect().bottom > limit) { idx = +p.dataset.p; break; }
    }
    db.setSetting('progress:' + book.id, { chapter, para: idx });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  (async () => {
    const cur = await db.getSetting('currentBook', null);
    if (cur) await openBook(cur); else await showLibrary();
  })();

  return function cleanup() {
    alive = false;
    clearTimeout(scrollTimer);
    window.removeEventListener('scroll', onScroll);
    popup.destroy();
  };
}
