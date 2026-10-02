// wordPopup.js — нижнее окно: перевод слова, предложение, перевод предложения, «Запомнить» / «Закрыть».
import * as db from '../core/db.js';
import { esc } from '../core/textUtils.js';
import { markTranslationAny } from '../core/translator.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export function createPopup({ translator, onSaved }) {
  const el = document.createElement('div');
  el.id = 'popup';
  el.hidden = true;
  document.body.appendChild(el);
  let token = 0;
  let s = null; // текущее состояние

  const ro = new ResizeObserver(() => document.body.style.setProperty('--popup-h', el.hidden ? '0px' : el.offsetHeight + 'px'));
  ro.observe(el);

  function sentenceHtml() {
    const { sentence, relStart, relLen } = s;
    return esc(sentence.slice(0, relStart)) + '<b class="hl">' + esc(sentence.slice(relStart, relStart + relLen)) + '</b>' + esc(sentence.slice(relStart + relLen));
  }
  function translationHtml() {
    if (s.sentTr == null) return s.sentLoading ? '…' : '';
    const m = markTranslationAny(s.sentTr, s.trList);
    if (!m) return esc(s.sentTr);
    return esc(s.sentTr.slice(0, m.start)) + '<b class="hl">' + esc(s.sentTr.slice(m.start, m.end)) + '</b>' + esc(s.sentTr.slice(m.end));
  }
  function render() {
    const canSave = !s.saved && s.trList.length && s.sentTr != null;
    el.innerHTML = `
      <div class="pw-word"><b>${esc(s.norm)}</b>${s.inDict ? ' <span class="muted">· в словаре</span>' : ''}</div>
      <div class="pw-tr">${s.trList.length ? esc(s.trList.join(', ')) : s.wordLoading ? '…' : ''}</div>
      <div class="pw-sent">${sentenceHtml()}</div>
      <div class="pw-sent pw-ru">${translationHtml()}</div>
      ${s.errors.length ? `<div class="err">${esc(s.errors[0])}</div>` : ''}
      <div class="pw-btns">
        ${s.errors.length ? '<button class="btn" data-act="retry">Повторить</button>' : ''}
        <button class="btn" data-act="save" ${canSave ? '' : 'disabled'}>${s.saved ? '✓ Сохранено' : 'Запомнить'}</button>
        <button class="btn ghost" data-act="close">Закрыть</button>
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

  async function open(o) {
    const my = ++token;
    s = { ...o, trList: [], newTr: null, sentTr: null, saved: false, inDict: false, errors: [], wordLoading: false, sentLoading: false };
    el.hidden = false;
    const existing = await db.getWord(o.norm);
    if (my !== token) return;
    if (existing) {
      s.inDict = true;
      s.trList = [...existing.translations];
      const same = existing.sentences.find((x) => x.en === o.sentence);
      if (same) { s.sentTr = same.ru; s.saved = true; }
    }
    s.wordLoading = !s.trList.length;
    s.sentLoading = s.sentTr == null;
    render();
    keepVisible();

    const fail = (e) => { if (my === token) { s.errors.push(e.message || 'Ошибка перевода'); } };
    const jobs = [];
    if (s.wordLoading) {
      jobs.push(translator.translateWord(o.norm).then((r) => { if (my === token) { s.trList = [r.text]; s.newTr = r.text; } }, fail)
        .finally(() => { if (my === token) { s.wordLoading = false; render(); } }));
    }
    if (s.sentLoading) {
      jobs.push(translator.translateSentence(o.sentence).then((r) => { if (my === token) s.sentTr = r.text; }, fail)
        .finally(() => { if (my === token) { s.sentLoading = false; render(); } }));
    }
    await Promise.all(jobs);
    if (my === token) { render(); keepVisible(); }
  }

  function close() { token++; el.hidden = true; el.innerHTML = ''; s = null; }

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (!act || !s) return;
    if (act.dataset.act === 'close') close();
    else if (act.dataset.act === 'retry') { const o = s; close(); open({ norm: o.norm, shown: o.shown, sentence: o.sentence, relStart: o.relStart, relLen: o.relLen, bookId: o.bookId, anchor: o.anchor }); }
    else if (act.dataset.act === 'save' && !s.saved) {
      const cur = s;
      cur.saved = true; render();
      try {
        await db.addSentence({ word: cur.norm, translation: cur.newTr, en: cur.sentence, ru: cur.sentTr, bookId: cur.bookId });
        onSaved(cur.norm);
      } catch (err) { cur.saved = false; cur.errors.push('Не удалось сохранить: ' + err.message); if (s === cur) render(); }
    }
  });

  return { open, close, destroy() { close(); ro.disconnect(); el.remove(); document.body.style.removeProperty('--popup-h'); } };
}
