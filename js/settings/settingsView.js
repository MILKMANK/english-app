// settingsView.js — «Настройки» (открываются шестерёнкой): импорт и экспорт слов, резервная копия, переводчик, проверки.
import * as db from '../core/db.js';
import { esc, tokenize, splitSentences } from '../core/textUtils.js';
import { markTranslation, PROVIDER_LABELS } from '../core/translator.js';
import { downloadBackup, restoreFromFile } from '../core/backup.js';
import { ARROW_LEFT } from '../core/icons.js';
import { readTable, buildPlan, runImport, exportWords } from '../vocabulary/importExport.js';

export async function mountSettings(container, { translator, onBack }) {
  const provider = await db.getSetting('provider', 'mymemory');
  container.innerHTML = `
    <div class="pin nob"><div class="pin-row"><button class="nav-btn" id="setBack" aria-label="Назад" title="Назад">${ARROW_LEFT}</button><div class="pin-title"><span>Настройки</span></div></div></div>

    <section class="sec"><h2>Импорт и экспорт слов</h2><div id="impPanel"></div></section>

    <section class="sec"><h2>Резервная копия</h2>
      <p class="muted">Слова, книги и место, где остановились. Делайте копию время от времени: данные хранятся только в этом браузере.</p>
      <div class="btn-row"><button class="btn" id="backupBtn">Скачать копию</button>
      <label class="btn ghost">Восстановить из копии<input id="restoreFile" type="file" accept=".json,application/json" hidden></label></div>
      <p id="backupMsg" class="muted"></p></section>

    <section class="sec"><h2>Переводчик</h2>
      <p class="muted">Email нужен MyMemory для увеличенного дневного лимита. Никуда, кроме переводчика, не отправляется.</p>
      <input id="email" type="email" placeholder="you@example.com" value="${esc(await db.getSetting('email', ''))}">
      <div class="btn-row"><button class="btn" id="saveEmail">Сохранить</button><span id="saved" class="muted"></span></div>
      <select id="provider" class="plain">${Object.entries(PROVIDER_LABELS).map(([k, v]) => `<option value="${k}"${k === provider ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <div class="btn-row"><button class="btn ghost" id="clearCache">Очистить кэш переводов</button><span id="cleared" class="muted"></span></div></section>

    <section class="sec"><h2>Проверка переводчика</h2>
      <input id="tw" placeholder="Слово, например: reluctant">
      <input id="ts" placeholder="Предложение с этим словом">
      <button class="btn" id="tgo">Перевести</button>
      <div id="tout" class="card" style="display:none"></div></section>

    <section class="sec"><h2>Диагностика шрифта</h2>
      <p id="fontinfo" class="muted">Проверяю…</p>
      <p style="font-weight:400">Montserrat 400: Привет, hello</p><p style="font-weight:600">Montserrat 600: Привет, hello</p><p style="font-weight:700">Montserrat 700: Привет, hello</p></section>`;
  const $ = (s) => container.querySelector(s);
  $('#setBack').onclick = onBack;

  // ---------- импорт / экспорт ----------
  const panel = $('#impPanel');
  let stopFlag = false;
  const fmt = (n) => n.toLocaleString('ru-RU');
  const idle = (note = '') => {
    panel.innerHTML = `<p class="muted">Таблица Excel (.xlsx) или CSV. 1-й столбец — английское слово, 2-й — переводы (через запятую, точку с запятой и т.п., можно пусто), 3-й — предложение (можно пусто), 4-й — перевод предложения (необязательно). Недостающее переведёт переводчик. Все новые слова получат статус «новое».</p>
      <div class="btn-row"><label class="btn">Импорт из таблицы<input id="impFile" type="file" accept=".xlsx,.csv,.tsv,.txt" hidden></label><button class="btn ghost" id="expBtn">Экспорт в Excel</button></div>
      <p id="impMsg" class="muted">${note}</p>`;
    $('#impFile').onchange = onFile;
    $('#expBtn').onclick = async () => {
      const m = $('#impMsg'); m.className = 'muted'; m.textContent = 'Готовлю файл…';
      try { const r = await exportWords(); m.textContent = r === 'cancelled' ? '' : 'Файл сохранён'; }
      catch (e) { m.className = 'err'; m.textContent = 'Не удалось сделать файл: ' + e.message; }
    };
  };
  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const m = $('#impMsg'); m.className = 'muted'; m.textContent = 'Читаю таблицу…';
    try {
      const rows = await readTable(file);
      const existing = new Map((await db.getAllWords()).map((w) => [w.word, w]));
      const plan = buildPlan(rows, existing);
      if (!plan.entries.length) { idle(''); $('#impMsg').className = 'err'; $('#impMsg').textContent = 'В таблице не нашлось слов: проверьте, что английские слова в первом столбце'; return; }
      preview(file.name, plan);
    } catch (err) { m.className = 'err'; m.textContent = err.message; }
  }
  function preview(name, plan) {
    const s = plan.summary;
    panel.innerHTML = `<div class="muted">Файл ${esc(name)}</div>
      <p>Строк: <b>${fmt(s.rows)}</b> · новых слов: <b>${fmt(s.newWords)}</b> · уже в словаре: <b>${fmt(s.existingWords)}</b></p>
      <p class="muted">${s.requests ? `Нужно запросов к переводчику: ${fmt(s.requests)} (около ${fmt(s.chars)} символов).` : 'Переводчик не понадобится.'}</p>
      <div class="btn-row"><button class="btn" id="impStart">Начать импорт</button><button class="btn ghost" id="impCancel">Отмена</button></div>`;
    $('#impCancel').onclick = () => idle();
    $('#impStart').onclick = () => start(plan);
  }
  async function start(plan) {
    stopFlag = false;
    const prov = await translator.currentProvider();
    panel.innerHTML = `<div>Импортировано <b id="impDone">0</b> из ${fmt(plan.entries.length)}</div><div class="bar"><i id="impBar" style="width:0%"></i></div>
      <p class="muted">Переводчик: ${esc(PROVIDER_LABELS[prov])}</p><div class="btn-row"><button class="btn ghost" id="impStop">Остановить</button></div>`;
    $('#impStop').onclick = () => { stopFlag = true; $('#impStop').disabled = true; };
    const res = await runImport(plan.entries, {
      translator, shouldStop: () => stopFlag,
      onProgress: (d, t) => { const el = $('#impDone'); if (!el) return; el.textContent = fmt(d); $('#impBar').style.width = Math.round((d / t) * 100) + '%'; },
    });
    done(res);
  }
  function done(res) {
    const warn = res.stoppedBy === 'limit' ? 'Переводчик остановил работу (исчерпан лимит). Повторите импорт позже: уже добавленные строки будут пропущены.'
      : res.stoppedBy === 'network' ? 'Пропало соединение с переводчиком. Повторите импорт: уже добавленные строки будут пропущены.'
      : res.stoppedBy === 'user' ? 'Импорт остановлен. Повторите его позже: уже добавленные строки будут пропущены.' : '';
    panel.innerHTML = `<div><b>${res.stoppedBy ? 'Импорт прерван' : 'Готово'}</b>${res.stoppedBy ? ` (обработано ${fmt(res.done)} из ${fmt(res.total)})` : ''}</div>
      <p class="muted">Добавлено новых слов: <b>${fmt(res.newWords)}</b> · дополнено: <b>${fmt(res.extended)}</b> · предложений: <b>${fmt(res.sentences)}</b></p>
      ${warn ? `<p class="err">${warn}</p>` : ''}
      ${res.failures.length ? `<p class="err">Не удалось: ${res.failures.length}</p><div id="impFail" hidden>${res.failures.map((f) => `<div class="muted">строка ${f.row}: ${esc(f.word)} — ${esc(f.reason)}</div>`).join('')}</div>` : ''}
      <div class="btn-row">${res.failures.length ? '<button class="btn ghost" id="impShow">Показать список</button>' : ''}<button class="btn" id="impClose">Закрыть</button></div>`;
    const show = $('#impShow');
    if (show) show.onclick = () => { $('#impFail').hidden = !$('#impFail').hidden; };
    $('#impClose').onclick = () => idle();
  }
  idle();

  // ---------- резервная копия ----------
  const msg = $('#backupMsg');
  $('#backupBtn').onclick = async () => {
    msg.className = 'muted'; msg.textContent = 'Готовлю копию…';
    try { const r = await downloadBackup(); msg.textContent = r === 'cancelled' ? '' : 'Копия сохранена'; }
    catch (e) { msg.className = 'err'; msg.textContent = 'Не удалось сделать копию: ' + e.message; }
  };
  $('#restoreFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    msg.className = 'muted'; msg.textContent = 'Восстанавливаю…';
    try { const r = await restoreFromFile(f); msg.textContent = `Готово: слов в копии ${r.words}, добавлено книг ${r.books}`; }
    catch (err) { msg.className = 'err'; msg.textContent = err.message; }
    e.target.value = '';
  };

  // ---------- переводчик ----------
  $('#provider').onchange = (e) => db.setSetting('provider', e.target.value);
  $('#clearCache').onclick = async () => { await db.clearCache(); $('#cleared').textContent = 'Кэш очищен'; };
  $('#saveEmail').onclick = async () => { await db.setSetting('email', $('#email').value.trim()); $('#saved').textContent = 'Сохранено'; };
  $('#tgo').onclick = async () => {
    const out = $('#tout'), word = $('#tw').value.trim(), sent = $('#ts').value.trim();
    out.style.display = 'block'; out.textContent = 'Перевожу…';
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
    } catch (e2) { out.innerHTML = `<span class="err">${esc(e2.message)}</span>`; }
  };

  // ---------- шрифт ----------
  const el = $('#fontinfo');
  await Promise.all([400, 600, 700].map((w) => document.fonts.load(`${w} 16px Montserrat`, 'Aa Яя').catch(() => [])));
  const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Montserrat');
  const loaded = faces.filter((f) => f.status === 'loaded').length, bad = faces.filter((f) => f.status === 'error').length;
  el.textContent = loaded === 6 ? 'Montserrat загружен полностью (6 из 6 файлов).'
    : `Загружено файлов: ${loaded} из 6, не найдено: ${bad}. Проверьте имена файлов в папке fonts (нужны montserrat-latin-400-normal.woff2, ...-600-..., ...-700-... и такие же cyrillic).`;
}
