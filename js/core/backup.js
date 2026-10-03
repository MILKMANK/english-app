// backup.js — резервная копия (слова, книги, позиции чтения) и слияние данных.
// mergeWord пригодится и для синхронизации через Dropbox.
import * as db from './db.js';

// Склеивает две версии одного слова: переводы и предложения объединяются,
// статус и архив берутся у версии, изменённой позже.
export function mergeWord(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  const remoteNewer = (remote.updatedAt || 0) > (local.updatedAt || 0);
  const [newer, older] = remoteNewer ? [remote, local] : [local, remote];
  const byEn = new Map();
  for (const s of [...older.sentences, ...newer.sentences]) {
    const ex = byEn.get(s.en);
    byEn.set(s.en, ex ? { ...ex, ...s, ru: s.ru || ex.ru, addedAt: Math.min(ex.addedAt ?? s.addedAt, s.addedAt ?? ex.addedAt) } : { ...s });
  }
  return {
    ...older, ...newer,
    translations: [...new Set([...newer.translations, ...older.translations])],
    sentences: [...byEn.values()],
    createdAt: Math.min(local.createdAt ?? Infinity, remote.createdAt ?? Infinity),
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
  };
}

const bookKey = (b) => `${b.title}|${b.chapters.length}|${b.chapters[0] ? b.chapters[0].text.length : 0}`;

export async function buildBackup() {
  const books = await db.getAllBooks();
  const progress = {};
  for (const b of books) progress[b.id] = await db.getSetting('progress:' + b.id, null);
  return { app: 'english-app', version: 1, exportedAt: Date.now(), words: await db.getAllWords(), books, progress };
}

export async function importBackup(data) {
  if (!data || data.app !== 'english-app' || !Array.isArray(data.words)) throw new Error('Это не файл резервной копии приложения');
  // книги: добавляем те, которых ещё нет; запоминаем соответствие старых и новых id
  const existing = new Map((await db.getAllBooks()).map((b) => [bookKey(b), b.id]));
  const idMap = new Map();
  let addedBooks = 0;
  for (const b of data.books || []) {
    const key = bookKey(b);
    if (existing.has(key)) { idMap.set(b.id, existing.get(key)); continue; }
    const { id, ...rest } = b;
    const newId = await db.saveBook(rest);
    existing.set(key, newId); idMap.set(id, newId); addedBooks++;
    const pr = data.progress && data.progress[id];
    if (pr) await db.setSetting('progress:' + newId, pr);
  }
  for (const w of data.words) {
    const remote = { ...w, sentences: w.sentences.map((s) => ({ ...s, bookId: idMap.has(s.bookId) ? idMap.get(s.bookId) : null })) };
    await db.putWordExact(mergeWord(await db.getWord(w.word), remote));
  }
  return { words: data.words.length, books: addedBooks };
}

export async function restoreFromFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('Не удалось прочитать файл: это не резервная копия'); }
  return importBackup(data);
}

// Скачивает копию. На iPhone открывает меню «Поделиться» (сохранить в Файлы), на компьютере — обычная загрузка.
export async function downloadBackup() {
  const name = `english-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(await buildBackup())], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
