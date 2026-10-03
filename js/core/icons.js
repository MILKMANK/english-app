// icons.js — крупные иконки навигации (SVG, цвет берут от кнопки).
const svg = (d) => `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ARROW_LEFT = svg('<path d="M19 12H5M11 6l-6 6 6 6"/>');
export const CHEVRON_LEFT = svg('<path d="M15 5l-7 7 7 7"/>');
export const CHEVRON_RIGHT = svg('<path d="M9 5l7 7-7 7"/>');
