// readerView.js — раздел «Чтение»: библиотека книг и читалка с кликабельными словами.
import * as db from '../core/db.js';
import { loadFile } from './fileLoader.js';
import { tokenize, splitSentences, sentenceAt, esc } from '../core/textUtils.js';
import { createPopup } from './wordPopup.js';

// Как открывать слово: 'double' — двойной клик/тап, 'single' — одиночный.
export const CLICK_MODE = 'double';
const DOUBLE_MS = 350;
const PENCIL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>';
const TRASH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';

export function mountReader(container, { translator }) {
  let book = null, chapter = 0, paras = [], spans = new Map(), known = new Map();
  const sentCache = new Map();
  let scrollTimer = null, alive = true;
  const popup = createPopup({ translator, onSaved: (norm) => {
    known.set(norm, true);
    (spans.get(norm) || []).forEach((sp) => sp.classList.add('k', 'kb'));
  } });

  // ---------- библиотека ----------
  async function showLibrary() {
    await db.setSetting('currentBook', null);
    popup.close();
    const books = (await db.listBooks()).sort((a, b) => b.addedAt - a.addedAt);
    const rows = [];
    for (const b of books) {
      const pr = await db.getSetting('progress:' + b.id, null);
      rows.push(`<div class="card book" data-open="${b.id}">
        <div><b>${esc(b.title)}</b><div class="muted">глав: ${b.chapterCount}${pr ? ` · остановились на гл. ${pr.chapter + 1}` : ''}</div></div>
        <div class="word-actions"><button class="icon-btn" data-rename="${b.id}" title="Изменить название" aria-label="Изменить название">${PENCIL}</button>
        <button class="icon-btn" data-delbook="${b.id}" title="Удалить книгу" aria-label="Удалить книгу">${TRASH}</button></div></div>`);
    }
    container.innerHTML = `<h1>Чтение</h1>
      <label class="btn">Загрузить книгу<input id="file" type="file" accept=".epub,.txt,.docx" hidden></label>
      <p class="muted">EPUB, TXT или DOCX. Книга сохраняется на этом устройстве.</p>
      <div id="msg"></div>${rows.join('') || '<p class="muted">Пока нет книг.</p>'}`;
    container.querySelector('#file').onchange = onFile;
    container.onclick = async (e) => {
      const ren = e.target.closest('[data-rename]');
      if (ren) {
        const id = +ren.dataset.rename;
        const b = books.find((x) => x.id === id);
        const name = prompt('Название книги', b ? b.title : '');
        if (name && name.trim()) { await db.renameBook(id, name.trim()); showLibrary(); }
        return;
      }
      const del = e.target.closest('[data-delbook]');
      if (del) {
        const id = +del.dataset.delbook;
        const b = books.find((x) => x.id === id);
        if (confirm(`Удалить книгу «${b ? b.title : ''}»? Слова из словаря останутся.`)) { await db.deleteBook(id); showLibrary(); }
        return;
      }
      const open = e.target.closest('[data-open]');
      if (open) openBook(+open.dataset.open);
    };
  }

  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const msg = container.querySelector('#msg');
    msg.innerHTML = '<p class="muted">Обрабатываю файл…</p>';
    try {
      const { title, chapters } = await loadFile(file);
      const id = await db.saveBook({ title, chapters });
      await db.setSetting('progress:' + id, { chapter: 0, para: 0 });
      await openBook(id);
    } catch (err) {
      msg.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
  }

  // ---------- читалка ----------
  async function openBook(id) {
    book = await db.getBook(id);
    if (!book) return showLibrary();
    await db.setSetting('currentBook', id);
    known = new Map();
    for (const w of await db.getAllWords()) known.set(w.word, w.sentences.some((s) => s.bookId === id));
    const pr = await db.getSetting('progress:' + id, { chapter: 0, para: 0 });
    container.onclick = null;
    container.innerHTML = `
      <div class="rbar">
        <button class="icon-btn" id="back" title="В библиотеку">←</button>
        <button class="icon-btn" id="prev" title="Предыдущая глава">‹</button>
        <select id="chsel">${book.chapters.map((c, i) => `<option value="${i}">${esc(c.title)}</option>`).join('')}</select>
        <button class="icon-btn" id="next" title="Следующая глава">›</button>
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
    text.innerHTML = `<h2 class="ch">${esc(c.title)}</h2>${html}${last ? '' : '<button class="btn" id="nextBottom">Следующая глава →</button>'}`;
    const nb = text.querySelector('#nextBottom');
    if (nb) nb.onclick = () => goChapter(chapter + 1);
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
      else lastTap = { el, t: now };
    });
  }

  function openWord(el) {
    const pi = +el.closest('p').dataset.p;
    const text = paras[pi];
    if (!sentCache.has(pi)) sentCache.set(pi, splitSentences(text));
    const off = +el.dataset.o;
    const s = sentenceAt(sentCache.get(pi), off);
    popup.open({
      norm: el.dataset.n, shown: el.textContent,
      sentence: s ? s.text : text, relStart: s ? off - s.start : off, relLen: el.textContent.length,
      bookId: book.id, anchor: el,
    });
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
