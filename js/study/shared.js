// shared.js — общее для «Контекста» и «Квиза»: верхняя строка, шторка с результатом, смена статусов после ответа.
import * as db from '../core/db.js';
import { esc } from '../core/textUtils.js';
import { ARROW_LEFT } from '../core/icons.js';
import { review, requeue } from '../vocabulary/srs.js';

export const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
export const CROSS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

export const topBar = (t = '') => `<div class="fc-top"><button class="nav-btn" data-fc="exit" aria-label="Назад" title="Назад">${ARROW_LEFT}</button><span class="muted">${t}</span></div>`;

// Экран-сообщение (мало слов, игра закончена и т.п.)
export const messageScreen = (title, text, more = false) => `<div class="fc">${topBar()}<div class="fc-card"><div class="fc-word">${title}</div><div class="fc-under muted">${text}</div></div>
  <div class="fc-btns">${more ? '<button class="btn ghost" data-fc="more">Ещё порцию</button>' : ''}<button class="btn" data-fc="exit">К счётчикам</button></div></div>`;

// Цветной блок в шторке: label — подпись, html — готовое содержимое.
export const block = (icon, cls, label, html) => `<div class="qz-cmp ${cls}">${icon}<div><small>${label}</small>${html}</div></div>`;

// Шторка с результатом: кружок и «Верно!»/«Неверно», блоки, кнопка «Дальше».
export const sheet = (ok, blocksHtml) => `<div class="qz-sheet ${ok ? 'ok' : 'bad'}"><div class="qz-head ${ok ? 'g' : 'rd'}"><span class="qdot"></span>${ok ? 'Верно!' : 'Неверно'}</div>
  <div class="qz-cmps">${blocksHtml}</div><button class="btn qz-next" data-fc="next">Дальше</button></div>`;

// Ответ в игре с вариантами: верно — успех в этом режиме; ошибка — «не помню» для правильного слова
// (оно вернётся в порции через 5–8 вопросов, максимум дважды) и для выбранного по ошибке слова.
// queue — очередь порции (меняется на месте), counts — сколько раз слово уже возвращали.
export async function applyAnswer(queue, counts, correctWord, chosenWord, mode) {
  const head = queue.shift();
  const fresh = (await db.getWord(correctWord)) || head;
  if (chosenWord === correctWord) { await db.putWord(review(fresh, mode, 'ok')); return true; }
  const upd = review(fresh, mode, 'no');
  await db.putWord(upd);
  requeue(queue, upd, counts);
  const picked = await db.getWord(chosenWord);
  if (picked) await db.putWord(review(picked, mode, 'no'));
  return false;
}

export { esc };
