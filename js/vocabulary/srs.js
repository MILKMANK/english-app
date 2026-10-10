// srs.js — ступени слов и расписание повторов (одна общая шкала у слова).
// Ступень 0 — новое; 1…5 — повтор через 1 · 3 · 7 · 14 · 30 дней; 6 — освоено.
// Подняться на ступень можно после 2 успехов в РАЗНЫХ режимах (карточки, карточки наоборот, квиз, квиз наоборот, контекст).
// Ошибка опускает на ступень (не ниже 1) и возвращает слово завтра. «С трудом» ничего не меняет.
import * as db from '../core/db.js';

export const MODES = ['cards', 'rcards', 'quiz', 'rquiz', 'ctx'];
export const INTERVALS = [0, 1, 3, 7, 14, 30]; // дней до повтора после достижения ступени 1…5
export const MAX_LEVEL = 6;
export const BATCH = 20;       // слов в одной порции
export const NEW_RESERVE = 6;  // мест под новые слова в порции (если они есть)
export const LEVEL_TITLES = ['Новое: ещё не учили', 'Ступень 1: начато, повтор через 1 день', 'Ступень 2: повтор через 3 дня', 'Ступень 3: повтор через 7 дней',
  'Ступень 4: повтор через 14 дней', 'Ступень 5: повтор через 30 дней', 'Ступень 6: освоено'];
export const STATUS_INFO = {
  new: { label: 'Новое', color: '#3b82f6' },
  learning: { label: 'В процессе', color: '#f59e0b' },
  learned: { label: 'Изучено', color: '#22c55e' },
};

// Номер календарного дня по местному времени.
export const dayNumber = (t = Date.now()) => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 86400000);
export const today = () => dayNumber();
const statusOf = (level) => (level === 0 ? 'new' : level >= MAX_LEVEL ? 'learned' : 'learning');

// Слова старой версии (без ступеней): статус -> примерная ступень.
export const levelOf = (w) => (typeof w.level === 'number' ? w.level : w.status === 'learned' ? 3 : w.status === 'learning' ? 1 : 0);
export const creditsOf = (w) => (Array.isArray(w.credits) ? w.credits : []);
export const dueOf = (w) => (w.due === undefined ? 0 : w.due);

// Успех/ошибка по слову в режиме mode. kind: 'ok' | 'hard' | 'no'. Возвращает обновлённое слово.
export function review(w, mode, kind, day = today()) {
  let level = levelOf(w), credits = creditsOf(w), due = dueOf(w);
  if (kind === 'hard') return w;
  if (kind === 'no') { level = Math.max(1, level - 1); credits = []; due = day + 1; }
  else if (level === 0) { level = 1; credits = []; due = day + 1; }             // первый успех «начинает» слово
  else if (!credits.includes(mode)) {
    credits = [...credits, mode];
    if (credits.length >= 2) { level++; credits = []; due = level >= MAX_LEVEL ? null : day + INTERVALS[level]; }
    else due = day + 1;                                                           // ждёт успеха в другом режиме
  }
  return { ...w, level, credits, due, status: statusOf(level), archivedUntil: null };
}

// Подходит ли слово для показа в режиме сегодня.
export const eligible = (w, mode, day = today()) => levelOf(w) < MAX_LEVEL && (dueOf(w) ?? 0) <= day && !creditsOf(w).includes(mode);

// Порция до 20 слов: сначала подошедшие по сроку, плюс новые (не меньше 6 мест под них, если они есть).
export function buildBatch(words, mode, day = today(), canAsk = () => true) {
  const a = words.filter((w) => eligible(w, mode, day) && canAsk(w));
  const reviews = a.filter((w) => levelOf(w) > 0).sort((x, y) => dueOf(x) - dueOf(y) || x.word.localeCompare(y.word));
  const fresh = a.filter((w) => levelOf(w) === 0).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0) || x.word.localeCompare(y.word));
  const rv = reviews.slice(0, BATCH - Math.min(fresh.length, NEW_RESERVE));
  return [...rv, ...fresh.slice(0, BATCH - rv.length)];
}

// Слово вернётся в этой же порции через 5–8 карточек, но не больше двух раз.
export function requeue(queue, w, counts) {
  const n = counts.get(w.word) || 0;
  if (n >= 2) return false;
  counts.set(w.word, n + 1);
  queue.splice(Math.min(queue.length, 5 + Math.floor(Math.random() * 4)), 0, w);
  return true;
}

export function stats(words, day = today()) {
  const s = { total: words.length, learned: 0, learning: 0, new: 0, due: 0 };
  for (const w of words) {
    const l = levelOf(w);
    if (l === 0) s.new++;
    else if (l >= MAX_LEVEL) s.learned++;
    else { s.learning++; if (dueOf(w) <= day) s.due++; }
  }
  return s;
}

// Перенос слов старой версии на ступени (выполняется при запуске и при открытии разделов).
export function migrated(w, day = today()) {
  if (typeof w.level === 'number') return null;
  const level = levelOf(w);
  const due = level === 0 ? 0 : level === 3 && w.archivedUntil ? Math.max(day, dayNumber(w.archivedUntil)) : day;
  return { ...w, level, credits: [], due, status: statusOf(level), archivedUntil: null };
}
export async function refreshArchive() {
  for (const w of await db.getAllWords()) { const m = migrated(w); if (m) await db.putWordExact(m); }
}
