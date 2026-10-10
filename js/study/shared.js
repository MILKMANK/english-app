// shared.js — общее для «Контекста» и «Квиза»: верхняя строка, шторка с результатом, смена статусов после ответа.
import * as db from '../core/db.js';
import { esc } from '../core/textUtils.js';
import { ARROW_LEFT } from '../core/icons.js';
import { markKnown, markRepeat } from '../vocabulary/srs.js';

export const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
export const CROSS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

export const topBar = (t = '') => `<div class="fc-top"><button class="nav-btn" data-fc="exit" aria-label="Назад" title="Назад">${ARROW_LEFT}</button><span class="muted">${t}</span></div>`;

// Экран-сообщение (мало слов, игра закончена и т.п.)
export const messageScreen = (title, text) => `<div class="fc">${topBar()}<div class="fc-card"><div class="fc-word">${title}</div><div class="fc-under muted">${text}</div></div>
  <div class="fc-btns"><button class="btn" data-fc="exit">К счётчикам</button></div></div>`;

// Цветной блок в шторке: label — подпись, html — готовое содержимое.
export const block = (icon, cls, label, html) => `<div class="qz-cmp ${cls}">${icon}<div><small>${label}</small>${html}</div></div>`;

// Шторка с результатом: кружок и «Верно!»/«Неверно», блоки, кнопка «Дальше».
export const sheet = (ok, blocksHtml) => `<div class="qz-sheet ${ok ? 'ok' : 'bad'}"><div class="qz-head ${ok ? 'g' : 'rd'}"><span class="qdot"></span>${ok ? 'Верно!' : 'Неверно'}</div>
  <div class="qz-cmps">${blocksHtml}</div><button class="btn qz-next" data-fc="next">Дальше</button></div>`;

// Правила статусов (общие для всех игр, пока не решена общая механика изучения):
// верно — слово «изучено» и уходит в архив на месяц; неверно — правильное и выбранное по ошибке слова
// становятся «в процессе» и уходят в конец списка. queue — очередь сессии (меняется на месте).
export async function applyAnswer(queue, correctWord, chosenWord) {
  const head = queue.shift();
  const fresh = (await db.getWord(correctWord)) || head;
  if (chosenWord === correctWord) { await db.putWord(markKnown(fresh)); return true; }
  const upd = markRepeat(fresh);
  await db.putWord(upd);
  queue.push(upd); // слово сразу в конец списка 1
  const picked = await db.getWord(chosenWord);
  if (picked) {
    const u2 = markRepeat(picked);
    await db.putWord(u2);
    const i = queue.findIndex((x) => x.word === chosenWord);
    if (i >= 0) { queue.splice(i, 1); queue.push(u2); }
  }
  return false;
}

export { esc };
