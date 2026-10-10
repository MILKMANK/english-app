// main.js — точка входа: нижнее меню (Словарь · Чтение · Учить), шестерёнка настроек, первичное заполнение базы.
import * as db from './core/db.js';
import { createTranslator } from './core/translator.js';
import { renderWordsTable } from './vocabulary/wordsTable.js';
import { mountReader } from './reader/readerView.js';
import { mountStudy } from './study/studyView.js';
import { mountSettings } from './settings/settingsView.js';
import { SEED_WORDS } from './core/seed.js';

const translator = createTranslator({
  getCache: db.getCache, setCache: db.setCache, getEmail: () => db.getSetting('email', ''),
  getProvider: () => db.getSetting('provider', 'mymemory'),
  setProvider: (v) => db.setSetting('provider', v),
});
const view = document.getElementById('view');
const tabs = document.getElementById('tabs');
const TABS = ['vocab', 'read', 'study']; // порядок в меню: слева словарь, по центру чтение, справа учить

async function seedOnce() {
  if (await db.getSetting('seeded', false)) return;
  for (const w of SEED_WORDS) await db.addSentence(w);
  await db.setSetting('seeded', true);
}

const isIosBrowserTab = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone;
const IOS_NOTICE = `<div class="notice">Вы открыли сайт в браузере Safari. Слова и книги, сохранённые в приложении с иконки на экране «Домой», здесь не видны: у них отдельное хранилище. Открывайте приложение только с иконки.</div>`;

let cleanup = null;
// Экраны: каждый рисуется в свой контейнер и может вернуть функцию очистки.
const screens = {
  vocab: async (c) => { await renderWordsTable(c); },
  read: async (c) => mountReader(c, { translator }),
  study: async (c) => mountStudy(c),
  settings: async (c) => mountSettings(c, { translator, onBack: () => show(lastTab()) }),
};
const lastTab = () => { const t = localStorage.getItem('tab'); return TABS.includes(t) ? t : 'read'; };

async function show(tab) {
  if (cleanup) { cleanup(); cleanup = null; }
  const isSettings = tab === 'settings';
  tabs.hidden = isSettings; // в настройках нижнего меню нет: выход стрелкой «назад»
  document.body.classList.toggle('no-tabs', isSettings);
  tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (!isSettings) localStorage.setItem('tab', tab);
  view.innerHTML = (isIosBrowserTab() ? IOS_NOTICE : '') + '<div id="screen"></div>';
  window.scrollTo(0, 0);
  const r = await screens[tab](document.getElementById('screen'));
  if (typeof r === 'function') cleanup = r;
}

async function start() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); // просим браузер не удалять данные сам
  try { await seedOnce(); } catch (e) { view.innerHTML = `<p class="err">Ошибка базы: ${e.message}</p>`; return; }
  tabs.querySelectorAll('button').forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  view.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) show(g.dataset.go); }); // шестерёнка в шапке
  await show(lastTab());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
start();
