// ui.js — общая закреплённая шапка для главных экранов: заголовок + счётчик + шестерёнка, сортировка, поиск.
import { esc } from './textUtils.js';
import { GEAR, SEARCH, CHEVRON_DOWN, CLOSE } from './icons.js';

export const gearButton = () => `<button class="nav-btn" data-go="settings" id="gear" aria-label="Настройки" title="Настройки">${GEAR}</button>`;

// Строка заголовка: название, счётчик (если нужен), свои кнопки, шестерёнка справа.
export const titleRow = (title, { count = true, actions = '' } = {}) =>
  `<div class="pin-row"><div class="pin-title"><span>${esc(title)}</span>${count ? '<span class="pill" id="cnt"></span>' : ''}</div>${actions}${gearButton()}</div>`;

export const sortSelect = (options, value) =>
  `<div class="sel"><select id="sort" aria-label="Сортировка">${Object.entries(options).map(([k, v]) => `<option value="${k}"${k === value ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select><span class="chev">${CHEVRON_DOWN}</span></div>`;

export const searchBox = (placeholder, value = '') =>
  `<div class="srch"><span class="lead">${SEARCH}</span><input id="q" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(placeholder)}" value="${esc(value)}"><button class="clr" id="qx" type="button" aria-label="Очистить поиск"${value ? '' : ' hidden'}>${CLOSE}</button></div>`;

// Подвешивает обработчики сортировки и поиска.
export function bindPin(container, { onSort, onQuery }) {
  const q = container.querySelector('#q'), x = container.querySelector('#qx');
  container.querySelector('#sort').onchange = (e) => onSort(e.target.value);
  q.oninput = () => { x.hidden = !q.value; onQuery(q.value); };
  x.onclick = () => { q.value = ''; x.hidden = true; onQuery(''); q.focus(); };
}

// Счётчик в шапке: «48» или при поиске «3 из 48».
export function setCount(container, shown, total, searching) {
  const el = container.querySelector('#cnt');
  if (el) el.textContent = searching ? `${shown} из ${total}` : String(total);
}

// Подсветка найденного фрагмента.
export function hit(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark class="hit">' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}
