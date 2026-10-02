// srs.js — статусы слов и архив. Чистые функции + одна функция работы с базой (refreshArchive).
// Статусы: new (ещё не проходили), learning (в процессе), learned (изучено, лежит в архиве месяц).
// Список 1 = слова не в архиве со статусом new/learning, по порядку queuedAt. Список 2 = архив (learned + archivedUntil в будущем).
import * as db from '../core/db.js';

export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
export const STATUS_INFO = {
  new: { label: 'Новое', color: '#3b82f6' },
  learning: { label: 'В процессе', color: '#f59e0b' },
  learned: { label: 'Изучено', color: '#22c55e' },
};

export const isArchived = (w, now = Date.now()) => w.status === 'learned' && !!w.archivedUntil && w.archivedUntil > now;
export const queuedAt = (w) => (w.queuedAt != null ? w.queuedAt : w.createdAt || 0);

// «Знаю» / верный ответ в квизе: изучено, уходит в архив на месяц.
export const markKnown = (w, now = Date.now()) => ({ ...w, status: 'learned', archivedUntil: now + MONTH_MS });
// «Повторить» / неверный ответ: в процессе, в конец списка 1.
export const markRepeat = (w, now = Date.now()) => ({ ...w, status: 'learning', archivedUntil: null, queuedAt: now });
// Архив закончился: слово возвращается «в процессе» в конец списка 1. Если срок не вышел — null.
export function releaseIfExpired(w, now = Date.now()) {
  if (w.status === 'learned' && w.archivedUntil && w.archivedUntil <= now) return { ...w, status: 'learning', archivedUntil: null, queuedAt: now };
  return null;
}

export function activeQueue(words, now = Date.now()) {
  return words.filter((w) => !isArchived(w, now) && (w.status === 'new' || w.status === 'learning')).sort((a, b) => queuedAt(a) - queuedAt(b));
}

export function stats(words, now = Date.now()) {
  const s = { total: words.length, learned: 0, learning: 0, new: 0, archived: 0 };
  for (const w of words) {
    s[w.status] = (s[w.status] || 0) + 1;
    if (isArchived(w, now)) s.archived++;
  }
  return s;
}

export async function refreshArchive(now = Date.now()) {
  let n = 0;
  for (const w of await db.getAllWords()) {
    const u = releaseIfExpired(w, now);
    if (u) { await db.putWord(u); n++; }
  }
  return n;
}
