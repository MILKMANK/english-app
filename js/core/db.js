// db.js — вся работа с IndexedDB (локальная база в браузере).
// Хранилища: words (слова), books (книги), cache (кэш переводов), settings (настройки).

const DB_NAME = 'english-app';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('words', { keyPath: 'word' });
      d.createObjectStore('books', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('cache', { keyPath: 'key' });
      d.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Одна операция в одной транзакции. fn получает store и возвращает request.
async function run(store, mode, fn) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    let result;
    const rq = fn(t.objectStore(store));
    if (rq) rq.onsuccess = () => { result = rq.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// ---------- Слова ----------
// Запись слова: { word, translations:[], sentences:[{en, ru, bookId, addedAt}],
//   status:'new'|'learning'|'learned', archivedUntil:null|timestamp, createdAt, updatedAt }

export const getWord = (word) => run('words', 'readonly', (s) => s.get(word));
export const getAllWords = () => run('words', 'readonly', (s) => s.getAll());
export const putWord = (w) => run('words', 'readwrite', (s) => s.put({ ...w, updatedAt: Date.now() }));
export const deleteWord = (word) => run('words', 'readwrite', (s) => s.delete(word));

// «Запомнить»: создаёт слово или добавляет к нему перевод и предложение.
// Всё в одной транзакции. Одинаковые переводы и предложения не дублируются.
export async function addSentence({ word, translation, en, ru, bookId = null }) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction('words', 'readwrite');
    const s = t.objectStore('words');
    let out;
    const g = s.get(word);
    g.onsuccess = () => {
      const now = Date.now();
      let w = g.result;
      const isNew = !w;
      if (isNew) {
        w = { word, translations: [], sentences: [], status: 'new', archivedUntil: null, createdAt: now, updatedAt: now };
      }
      if (translation && !w.translations.includes(translation)) w.translations.push(translation);
      let added = false;
      if (en && !w.sentences.some((x) => x.en === en)) {
        w.sentences.push({ en, ru: ru || '', bookId, addedAt: now });
        added = true;
      }
      w.updatedAt = now;
      s.put(w);
      out = { word: w, isNew, added };
    };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// ---------- Кэш переводов ----------
export async function getCache(key) {
  const r = await run('cache', 'readonly', (s) => s.get(key));
  return r ? r.value : null;
}
export const setCache = (key, value) => run('cache', 'readwrite', (s) => s.put({ key, value, at: Date.now() }));

export const clearCache = () => run('cache', 'readwrite', (s) => s.clear());

// ---------- Настройки ----------
export async function getSetting(key, fallback = null) {
  const r = await run('settings', 'readonly', (s) => s.get(key));
  return r ? r.value : fallback;
}
export const setSetting = (key, value) => run('settings', 'readwrite', (s) => s.put({ key, value }));

// ---------- Книги (используются с этапа 2) ----------
// Книга: { id, title, chapters:[{title, text}], progress:{chapter, scroll}, addedAt }
export const saveBook = (b) => run('books', 'readwrite', (s) => s.put({ addedAt: Date.now(), ...b }));
export const getBook = (id) => run('books', 'readonly', (s) => s.get(id));
export async function renameBook(id, title) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction('books', 'readwrite');
    const s = t.objectStore('books');
    const g = s.get(id);
    g.onsuccess = () => { if (g.result) s.put({ ...g.result, title }); };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
export const deleteBook = (id) => run('books', 'readwrite', (s) => s.delete(id));
export async function listBooks() {
  const all = await run('books', 'readonly', (s) => s.getAll());
  return all.map(({ chapters, ...meta }) => ({ ...meta, chapterCount: chapters.length }));
}
