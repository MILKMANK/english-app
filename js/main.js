// main.js — точка входа: навигация, первичное заполнение базы, раздел «Настройки» с проверкой модулей.
import * as db from './core/db.js';
import { createTranslator, markTranslation, PROVIDER_LABELS } from './core/translator.js';
import { renderWordsTable } from './vocabulary/wordsTable.js';
import { tokenize, splitSentences } from './core/textUtils.js';
import { SEED_WORDS } from './core/seed.js';

const translator = createTranslator({
  getCache: db.getCache, setCache: db.setCache, getEmail: () => db.getSetting('email', ''),
  getProvider: () => db.getSetting('provider', 'mymemory'),
});
const view = document.getElementById('view');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function seedOnce() {
  if (await db.getSetting('seeded', false)) return;
  for (const w of SEED_WORDS) await db.addSentence(w);
  await db.setSetting('seeded', true);
}

const screens = {
  read: async () => `<h1>Чтение</h1><p class="muted">Загрузка книг и кликабельный текст появятся на этапе 2.</p>`,

  vocab: async () => '<h1>Словарь</h1><div id="words"></div>',

  study: async () => `<h1>Учить</h1><p class="muted">Счётчики, карточки и квиз появятся на этапах 3–5.</p>`,

  settings: async () => {
    const provider = await db.getSetting('provider', 'mymemory');
    return `
    <h1>Настройки</h1>
    <h2>Email для переводчика</h2>
    <p class="muted">Нужен MyMemory для увеличенного дневного лимита. Никуда, кроме переводчика, не отправляется.</p>
    <input id="email" type="email" placeholder="you@example.com" value="${esc(await db.getSetting('email', ''))}">
    <button class="btn" id="saveEmail">Сохранить</button> <span id="saved" class="muted"></span>
    <h2>Переводчик</h2>
    <select id="provider">${Object.entries(PROVIDER_LABELS).map(([k, v]) => `<option value="${k}"${k === provider ? ' selected' : ''}>${v}</option>`).join('')}</select>
    <button class="btn" id="clearCache">Очистить кэш переводов</button> <span id="cleared" class="muted"></span>
    <h2>Диагностика шрифта</h2>
    <p id="fontinfo" class="muted">Проверяю…</p>
    <p style="font-weight:400">Montserrat 400: Привет, hello</p><p style="font-weight:600">Montserrat 600: Привет, hello</p><p style="font-weight:700">Montserrat 700: Привет, hello</p>
    <h2>Проверка переводчика</h2>
    <input id="tw" placeholder="Слово, например: reluctant">
    <input id="ts" placeholder="Предложение с этим словом">
    <button class="btn" id="tgo">Перевести</button>
    <div id="tout" class="card" style="display:none"></div>`;
  },
};

async function checkFont() {
  const el = document.getElementById('fontinfo');
  const weights = [400, 600, 700];
  await Promise.all(weights.map((w) => document.fonts.load(`${w} 16px Montserrat`, 'Aa Яя').catch(() => [])));
  const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Montserrat');
  const loaded = faces.filter((f) => f.status === 'loaded').length;
  const bad = faces.filter((f) => f.status === 'error').length;
  el.textContent = loaded === 6 ? 'Montserrat загружен полностью (6 из 6 файлов).'
    : `Загружено файлов: ${loaded} из 6, не найдено: ${bad}. Проверьте имена файлов в папке fonts (нужны montserrat-latin-400-normal.woff2, ...-600-..., ...-700-... и такие же cyrillic).`;
}

function bindSettings() {
  checkFont();
  document.getElementById('provider').onchange = (e) => db.setSetting('provider', e.target.value);
  document.getElementById('clearCache').onclick = async () => {
    await db.clearCache();
    document.getElementById('cleared').textContent = 'Кэш очищен';
  };
  document.getElementById('saveEmail').onclick = async () => {
    await db.setSetting('email', document.getElementById('email').value.trim());
    document.getElementById('saved').textContent = 'Сохранено';
  };
  document.getElementById('tgo').onclick = async () => {
    const out = document.getElementById('tout');
    const word = document.getElementById('tw').value.trim();
    const sent = document.getElementById('ts').value.trim();
    out.style.display = 'block';
    out.textContent = 'Перевожу…';
    try {
      const toks = tokenize(sent).filter((t) => t.type === 'word').map((t) => t.norm);
      const w = await translator.translateWord(word);
      let html = `<b>${esc(word)}</b> → ${esc(w.text)} <span class="muted">(${PROVIDER_LABELS[w.provider]}, ${w.cached ? 'из кэша' : 'из сети'})</span>`;
      if (sent) {
        const s = await translator.translateSentence(sent);
        const m = markTranslation(s.text, w.text);
        const ru = m ? esc(s.text.slice(0, m.start)) + '<mark>' + esc(s.text.slice(m.start, m.end)) + '</mark>' + esc(s.text.slice(m.end)) : esc(s.text);
        html += `<p>${ru}</p><p class="muted">Слов: ${toks.length}, предложений: ${splitSentences(sent).length}</p>`;
      }
      out.innerHTML = html;
    } catch (e) {
      out.innerHTML = `<span class="err">${esc(e.message)}</span>`;
    }
  };
}

async function show(tab) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  view.innerHTML = await screens[tab]();
  if (tab === 'settings') bindSettings();
  if (tab === 'vocab') await renderWordsTable(document.getElementById('words'));
  localStorage.setItem('tab', tab);
}

async function start() {
  try { await seedOnce(); } catch (e) { view.innerHTML = `<p class="err">Ошибка базы: ${esc(e.message)}</p>`; return; }
  document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  await show(localStorage.getItem('tab') || 'read');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
start();
