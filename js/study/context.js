// context.js — «Контекст»: предложение с пропуском и 4 варианта слова (2×2).
// Вопросы — слова списка 1 (не в архиве). Верно: слово «изучено» + архив на месяц.
// Неверно: и правильное, и выбранное по ошибке слово становятся «в процессе» и уходят в конец списка 1.
// После ответа внизу появляется шторка с результатом и переводами; текст вопроса при этом не двигается.
import * as db from '../core/db.js';
import { tokenize, esc } from '../core/textUtils.js';
import { markTranslation, markTranslationAny } from '../core/translator.js';
import { buildBatch, today, refreshArchive } from '../vocabulary/srs.js';
import { CHECK, CROSS, shuffle, topBar, messageScreen, block, sheet, applyAnswer } from './shared.js';

export const BLANK = '_____';
export const MIN_WORDS = 4; // правильный ответ + 3 неверных
const MAX_TR = 3;           // сколько переводов показывать в шторке

// Предложение с пропуском вместо слова (простой текст); null, если слова в предложении нет.
export function blankSentence(en, word) {
  let found = false;
  const text = tokenize(en).map((t) => { if (t.type === 'word' && t.norm === word) { found = true; return BLANK; } return t.text; }).join('');
  return found ? text : null;
}
// Первые три перевода; первым идёт тот, который употреблён в переводе предложения.
export function orderTranslations(translations, ru, limit = MAX_TR) {
  const variants = [...new Set(translations.flatMap((t) => t.split(/[,;]/)).map((x) => x.trim()).filter(Boolean))];
  const used = ru ? variants.find((v) => markTranslation(ru, v)) : null;
  return (used ? [used, ...variants.filter((v) => v !== used)] : variants).slice(0, limit);
}

const sentHtml = (en, word, fn) => tokenize(en).map((t) => (t.type === 'word' && t.norm === word ? fn(t) : esc(t.text))).join('');
const usableSentences = (w) => w.sentences.filter((s) => blankSentence(s.en, w.word));

function buildQuestion(w, all) {
  const sents = usableSentences(w);
  const sentence = sents[Math.floor(Math.random() * sents.length)];
  const inSentence = new Set(tokenize(sentence.en).filter((t) => t.type === 'word').map((t) => t.norm));
  const others = all.filter((x) => x.word !== w.word);
  const pref = others.filter((x) => !inSentence.has(x.word)); // чтобы неверный вариант не стоял в самом предложении
  const wrong = shuffle(pref.length >= 3 ? pref : others).slice(0, 3).map((x) => x.word);
  return { word: w.word, sentence, options: shuffle([w.word, ...wrong]), longestWrong: wrong.reduce((a, b) => (b.length > a.length ? b : a), '') };
}

export async function startContext(container, { onExit }) {
  let all = [], queue = [], counts = new Map();
  let q = null, answered = null, busy = false, started = false, more = false, right = 0, wrong = 0, stopped = false;
  const canAsk = (w) => usableSentences(w).length > 0;
  async function reload() {
    await refreshArchive();
    all = await db.getAllWords();
    queue = buildBatch(all, 'ctx', today(), canAsk);
    counts = new Map(); started = queue.length > 0; more = false; right = 0; wrong = 0;
  }
  const byWord = (word) => all.find((x) => x.word === word);
  const top = topBar;
  const message = messageScreen;
  function render() {
    if (stopped) return;
    if (all.length < MIN_WORDS) { container.innerHTML = message('', `Для квиза нужно минимум ${MIN_WORDS} слова в словаре (сейчас ${all.length})`); return; }
    if (!q) {
      container.innerHTML = message(started ? (more ? 'Порция пройдена!' : 'На сегодня всё') : '', started ? `Верно: ${right} · Ошибок: ${wrong}`
        : 'Нет слов для повторения сегодня в этом режиме', more);
      return;
    }
    const { word, sentence } = q;
    // В зоне предложения невидимо лежит самая длинная версия (с зачёркнутой ошибкой): высота зоны не меняется при ответе.
    const ghost = sentHtml(sentence.en, word, (t) => `<s class="rd">${esc(q.longestWrong)}</s> <b class="g">${esc(t.text)}</b>`); // те же стили, что у настоящего ответа
    let cur, ruHtml = '', bot;
    if (!answered) {
      cur = sentHtml(sentence.en, word, () => `<span class="blank">${BLANK}</span>`);
      bot = `<div class="qz-opts">${q.options.map((o) => `<button class="btn ghost" data-opt="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
    } else {
      const ok = answered.chosen === q.word;
      cur = sentHtml(sentence.en, word, (t) => (ok ? '' : `<s class="rd">${esc(answered.chosen)}</s> `) + `<b class="g">${esc(t.text)}</b>`);
      const m = markTranslationAny(sentence.ru, byWord(word).translations);
      ruHtml = m ? esc(sentence.ru.slice(0, m.start)) + '<b class="g">' + esc(sentence.ru.slice(m.start, m.end)) + '</b>' + esc(sentence.ru.slice(m.end)) : esc(sentence.ru);
      const trOk = `<b>${esc(word)}</b> — ${esc(orderTranslations(byWord(word).translations, sentence.ru).join(', '))}`;
      const good = block(CHECK, 'ok', ok ? 'Перевод' : 'Правильно', trOk);
      const bad = ok ? '' : block(CROSS, 'bad', 'Вы выбрали', `<b>${esc(answered.chosen)}</b> — ${esc(orderTranslations(byWord(answered.chosen).translations, null).join(', '))}`);
      bot = sheet(ok, bad + good);
    }
    container.innerHTML = `<div class="fc">${top(`Осталось: ${queue.length}`)}
      <div class="qz-mid"><div class="qz-qs"><span class="gh">${ghost}</span><span class="re">${cur}</span></div><div class="qz-qr">${ruHtml}</div></div>
      <div class="qz-bot">${bot}</div></div>`;
  }

  async function next() {
    if (!queue.length) { q = null; more = buildBatch(await db.getAllWords(), 'ctx', today(), canAsk).length > 0; }
    else q = buildQuestion(queue[0], all);
    answered = null;
    render();
  }

  async function choose(opt) {
    if (busy || answered || !q) return;
    busy = true;
    try {
      const ok = await applyAnswer(queue, counts, q.word, opt, 'ctx');
      if (ok) right++; else wrong++;
      answered = { chosen: opt };
      render();
    } finally { busy = false; }
  }

  container.onclick = (e) => {
    const o = e.target.closest('[data-opt]');
    if (o) return choose(o.dataset.opt);
    const a = e.target.closest('[data-fc]');
    if (!a) return;
    if (a.dataset.fc === 'next') next();
    else if (a.dataset.fc === 'more') { reload().then(next); }
    else if (a.dataset.fc === 'exit') { stop(); onExit(); }
  };
  const onKey = (e) => {
    if (answered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); }
    else if (!answered && q && /^[1-4]$/.test(e.key)) choose(q.options[+e.key - 1]);
  };
  document.addEventListener('keydown', onKey);
  function stop() { stopped = true; document.removeEventListener('keydown', onKey); container.onclick = null; }

  await reload();
  await next();
  return stop;
}
