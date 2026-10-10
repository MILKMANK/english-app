// library.js — список книг: закреплённая шапка (счётчик, «+ Книга», сортировка, поиск), статусы, счётчики слов.
import * as db from '../core/db.js';
import { esc, WORD_RE } from '../core/textUtils.js';
import { loadFile } from './fileLoader.js';
import { titleRow, sortSelect, searchBox, bindPin, setCount, hit } from '../core/ui.js';
import { PLUS, PENCIL, TRASH } from '../core/icons.js';

export const BOOK_STATUS = {
  new: { label: 'Новая', color: '#3b82f6' },
  reading: { label: 'В процессе', color: '#f59e0b' },
  read: { label: 'Прочитана', color: '#22c55e' },
};
export const SORTS = { az: 'A → Z', za: 'Z → A', newest: 'Сначала новые', oldest: 'Сначала старые', status: 'По статусу' };

// Сколько слов в тексте (все слова, с повторами).
export const countWords = (chapters) => chapters.reduce((n, c) => n + (c.text.match(WORD_RE) || []).length, 0);

export function sortBooks(items, mode) {
  const alpha = (x, y) => x.title.localeCompare(y.title);
  const rank = { new: 0, reading: 1, read: 2 };
  const a = [...items];
  if (mode === 'za') return a.sort((x, y) => alpha(y, x));
  if (mode === 'newest') return a.sort((x, y) => y.addedAt - x.addedAt || alpha(x, y));
  if (mode === 'oldest') return a.sort((x, y) => x.addedAt - y.addedAt || alpha(x, y));
  if (mode === 'status') return a.sort((x, y) => rank[x.status] - rank[y.status] || alpha(x, y));
  return a.sort(alpha);
}
export const filterBooks = (items, query) => {
  const q = query.trim().toLowerCase();
  return q ? items.filter((b) => b.title.toLowerCase().includes(q)) : items;
};
const fmt = (n) => n.toLocaleString('ru-RU');
const legend = () => `<div class="legend">${Object.values(BOOK_STATUS).map((i) => `<span class="dot" style="background:${i.color}"></span>${i.label.toLowerCase()}`).join(' ')}</div>`;

export async function renderLibrary(container, { openBook }) {
  let mode = await db.getSetting('bookSort', 'az');
  let query = '';
  let items = [];

  async function load() {
    const [books, words] = [await db.listBooks(), await db.getAllWords()];
    const dict = new Map(); // id книги -> сколько слов добавлено в словарь из неё
    for (const w of words) for (const id of new Set(w.sentences.map((s) => s.bookId).filter((x) => x != null))) dict.set(id, (dict.get(id) || 0) + 1);
    items = [];
    for (const b of books) {
      let status = b.status;
      if (!status) { // книга из старой версии: «в процессе», если уже есть сохранённая позиция чтения
        const pr = await db.getSetting('progress:' + b.id, null);
        status = pr && (pr.chapter > 0 || pr.para > 0) ? 'reading' : 'new';
        db.updateBook(b.id, { status });
      }
      items.push({ ...b, status, wc: b.wordCount ?? null, dict: dict.get(b.id) || 0 });
    }
  }

  const upload = `<label class="up-btn">${PLUS}<span>Книга</span><input id="file" type="file" accept=".epub,.txt,.docx" hidden></label>`;
  container.innerHTML = `<div class="pin">${titleRow('Чтение', { actions: upload })}${sortSelect(SORTS, mode)}${searchBox('Поиск по названию книги')}</div><div id="msg"></div><div id="blist"></div>`;
  const list = container.querySelector('#blist');
  const msg = container.querySelector('#msg');

  function draw() {
    const shown = sortBooks(filterBooks(items, query), mode);
    const q = query.trim();
    setCount(container, shown.length, items.length, !!q);
    if (!shown.length) { list.innerHTML = `<div class="empty">${q ? `Ничего не найдено по запросу «${esc(q)}»` : 'Пока нет книг. Нажмите «+ Книга», чтобы загрузить EPUB, TXT или DOCX.'}</div>`; return; }
    list.innerHTML = legend() + shown.map((b) => `
      <div class="card book" data-open="${b.id}">
        <div class="word-head">
          <div class="wt"><b>${hit(b.title, q)}</b></div>
          <div class="word-actions">
            <span class="dot" style="background:${BOOK_STATUS[b.status].color}" title="${BOOK_STATUS[b.status].label}"></span>
            <button class="icon-btn" data-rename="${b.id}" title="Изменить название" aria-label="Изменить название">${PENCIL}</button>
            <button class="icon-btn" data-delbook="${b.id}" title="Удалить книгу" aria-label="Удалить книгу">${TRASH}</button>
          </div>
        </div>
        <div class="muted meta">${b.chapterCount} гл. · ${b.wc == null ? '… ' : fmt(b.wc)} слов · в словаре ${b.dict} слов</div>
      </div>`).join('');
  }

  bindPin(container, {
    onSort: async (v) => { mode = v; await db.setSetting('bookSort', v); draw(); },
    onQuery: (v) => { query = v; draw(); },
  });

  list.onclick = async (e) => {
    const ren = e.target.closest('[data-rename]');
    if (ren) {
      const id = +ren.dataset.rename;
      const b = items.find((x) => x.id === id);
      const name = prompt('Название книги', b ? b.title : '');
      if (name && name.trim()) { await db.renameBook(id, name.trim()); b.title = name.trim(); draw(); }
      return;
    }
    const del = e.target.closest('[data-delbook]');
    if (del) {
      const id = +del.dataset.delbook;
      const b = items.find((x) => x.id === id);
      if (confirm(`Удалить книгу «${b ? b.title : ''}»? Слова из словаря останутся.`)) { await db.deleteBook(id); items = items.filter((x) => x.id !== id); draw(); }
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) openBook(+open.dataset.open);
  };

  container.querySelector('#file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    msg.innerHTML = '<p class="muted">Обрабатываю файл…</p>';
    try {
      const { title, chapters } = await loadFile(file);
      const id = await db.saveBook({ title, chapters, wordCount: countWords(chapters), status: 'new' });
      await db.setSetting('progress:' + id, { chapter: 0, para: 0 });
      await openBook(id);
    } catch (err) {
      msg.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
    e.target.value = '';
  };

  await load();
  draw();

  // Для книг, загруженных раньше, считаем слова в фоне и запоминаем.
  for (const it of items) {
    if (it.wc != null) continue;
    if (!container.isConnected) return;
    const full = await db.getBook(it.id);
    if (!full) continue;
    it.wc = countWords(full.chapters);
    await db.updateBook(it.id, { wordCount: it.wc });
    if (container.isConnected) draw();
  }
}
