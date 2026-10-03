// wordPopup.js — нижнее окно: перевод слова, предложение, перевод предложения, «Запомнить», ↻ (другой переводчик), ✕.
import * as db from '../core/db.js';
import { esc } from '../core/textUtils.js';
import { markTranslationAny, PROVIDER_LABELS } from '../core/translator.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export function createPopup({ translator, onSaved }) {
  const el = document.createElement('div');
  el.id = 'popup';
  el.hidden = true;
  document.body.appendChild(el);
  let token = 0;
  let s = null; // состояние открытого окна

  const ro = new ResizeObserver(() => document.body.style.setProperty('--popup-h', el.hidden ? '0px' : el.offsetHeight + 'px'));
  ro.observe(el);

  // Переводы слова: свежий (если есть) и сохранённые в словаре.
  const trList = () => [...new Set([...(s.newTr ? [s.newTr] : []), ...s.stored])];

  function sentenceHtml() {
    const { sentence, relStart, relLen } = s;
    return esc(sentence.slice(0, relStart)) + '<b class="hl">' + esc(sentence.slice(relStart, relStart + relLen)) + '</b>' + esc(sentence.slice(relStart + relLen));
  }
  function translationHtml() {
    if (s.sentTr == null) return s.sentLoading ? '…' : '';
    const m = markTranslationAny(s.sentTr, trList());
    if (!m) return esc(s.sentTr);
    return esc(s.sentTr.slice(0, m.start)) + '<b class="hl">' + esc(s.sentTr.slice(m.start, m.end)) + '</b>' + esc(s.sentTr.slice(m.end));
  }
  function render() {
    const list = trList();
    const canSave = !s.saved && list.length && s.sentTr != null;
    el.innerHTML = `
      <div class="pw-head">
        <div class="pw-word"><b>${esc(s.norm)}</b>${s.inDict ? ' <span class="muted">· в словаре</span>' : ''}</div>
        <div class="pw-top">
          <button class="pw-x" data-act="switch" aria-label="Другой переводчик" title="Другой переводчик">↻</button>
          <button class="pw-x" data-act="close" aria-label="Закрыть" title="Закрыть">✕</button>
        </div>
      </div>
      <div class="pw-tr">${list.length ? esc(list.join(', ')) : s.wordLoading ? '…' : ''}</div>
      <div class="pw-sent">${sentenceHtml()}</div>
      <div class="pw-sent pw-ru">${translationHtml()}</div>
      ${s.errors.length ? `<div class="err">${esc(s.errors[0])}</div>` : ''}
      <div class="pw-btns">
        <span class="muted small pw-prov">${esc(PROVIDER_LABELS[s.provider] || '')}</span>
        ${s.errors.length ? '<button class="btn" data-act="retry">Повторить</button>' : ''}
        <button class="btn" data-act="save" ${canSave ? '' : 'disabled'}>${s.saved ? '✓ Сохранено' : 'Запомнить'}</button>
      </div>`;
  }

  // Прокручиваем текст так, чтобы окно не закрывало выбранное слово.
  async function keepVisible() {
    await nextFrame(); await nextFrame();
    if (!s || !s.anchor || el.hidden) return;
    const r = s.anchor.getBoundingClientRect();
    const limit = window.innerHeight - el.offsetHeight - 24;
    if (r.bottom > limit) window.scrollBy(0, r.bottom - limit + 16);
  }

  // Запрашивает недостающие переводы; каждый появляется в окне, как только готов.
  async function fetchTranslations(my) {
    const fail = (e) => { if (my === token) s.errors.push(e.message || 'Ошибка перевода'); };
    const jobs = [];
    if (s.wordLoading) {
      jobs.push(translator.translateWord(s.norm).then((r) => { if (my === token) { s.newTr = r.text; s.provider = r.provider; } }, fail)
        .finally(() => { if (my === token) { s.wordLoading = false; render(); } }));
    }
    if (s.sentLoading) {
      jobs.push(translator.translateSentence(s.sentence).then((r) => { if (my === token) { s.sentTr = r.text; s.provider = r.provider; } }, fail)
        .finally(() => { if (my === token) { s.sentLoading = false; render(); } }));
    }
    await Promise.all(jobs);
    if (my === token) { render(); keepVisible(); }
  }

  async function open(o) {
    const my = ++token;
    s = { ...o, stored: [], newTr: null, sentTr: null, saved: false, inDict: false, refreshed: false, errors: [], wordLoading: false, sentLoading: false, provider: await translator.currentProvider() };
    el.hidden = false;
    const existing = await db.getWord(o.norm);
    if (my !== token) return;
    if (existing) {
      s.inDict = true;
      s.stored = [...existing.translations];
      const same = existing.sentences.find((x) => x.en === o.sentence);
      if (same) { s.sentTr = same.ru; s.saved = true; }
    }
    s.wordLoading = !s.stored.length;
    s.sentLoading = s.sentTr == null;
    render();
    keepVisible();
    await fetchTranslations(my);
  }

  // ↻: переключаем переводчик (выбор запоминается) и переводим заново.
  async function switchProvider() {
    if (!s) return;
    const my = ++token;
    const cur = s;
    cur.provider = await translator.switchProvider();
    if (my !== token) return;
    Object.assign(cur, { errors: [], newTr: null, sentTr: null, saved: false, refreshed: true, wordLoading: true, sentLoading: true });
    render();
    await fetchTranslations(my);
  }

  function close() { token++; el.hidden = true; el.innerHTML = ''; s = null; }

  // Тап в любом месте вне окна (и не по слову) закрывает его. Прокрутка не считается тапом.
  let tap = null;
  const onDown = (e) => { tap = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    const d = tap; tap = null;
    if (!d || !s || el.hidden || el.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.w')) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
    close();
  };
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointerup', onUp);

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (!act || !s) return;
    const a = act.dataset.act;
    if (a === 'close') close();
    else if (a === 'switch') switchProvider();
    else if (a === 'retry') { const o = s; close(); open({ norm: o.norm, shown: o.shown, sentence: o.sentence, relStart: o.relStart, relLen: o.relLen, bookId: o.bookId, anchor: o.anchor }); }
    else if (a === 'save' && !s.saved) {
      const cur = s;
      cur.saved = true; render();
      try {
        await db.addSentence({ word: cur.norm, translation: cur.newTr, en: cur.sentence, ru: cur.sentTr, bookId: cur.bookId, updateRu: cur.refreshed });
        cur.stored = [...new Set([...cur.stored, ...(cur.newTr ? [cur.newTr] : [])])]; // теперь перевод «в словаре»
        cur.inDict = true;
        onSaved(cur.norm);
        if (s === cur) render();
      } catch (err) { cur.saved = false; cur.errors.push('Не удалось сохранить: ' + err.message); if (s === cur) render(); }
    }
  });

  return { open, close, destroy() { close(); document.removeEventListener('pointerdown', onDown); document.removeEventListener('pointerup', onUp); ro.disconnect(); el.remove(); document.body.style.removeProperty('--popup-h'); } };
}
