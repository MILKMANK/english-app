// icons.js — иконки (SVG, цвет берут от кнопки).
const svg = (d, size = 20, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// крупные иконки навигации
export const ARROW_LEFT = svg('<path d="M19 12H5M11 6l-6 6 6 6"/>', 26, 2.5);
export const CHEVRON_LEFT = svg('<path d="M15 5l-7 7 7 7"/>', 26, 2.5);
export const CHEVRON_RIGHT = svg('<path d="M9 5l7 7-7 7"/>', 26, 2.5);
// остальные
export const GEAR = svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 24);
export const SEARCH = svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', 18);
export const CHEVRON_DOWN = svg('<path d="M6 9l6 6 6-6"/>', 18, 2.2);
export const CLOSE = svg('<path d="M6 6l12 12M18 6L6 18"/>', 14, 2.6);
export const PLUS = svg('<path d="M12 5v14M5 12h14"/>', 18, 2.5);
export const PENCIL = svg('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>');
export const TRASH = svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>');
