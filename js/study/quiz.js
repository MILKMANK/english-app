// quiz.js — квиз: предложение с пропуском и 4 варианта слова.
// Вопросы — слова списка 1 (не в архиве). Верно: слово «изучено» + архив на месяц.
// Неверно: и правильное, и выбранное по ошибке слово становятся «в процессе» и уходят в конец списка 1.
import * as db from '../core/db.js';
import { tokenize, esc } from '../core/textUtils.js';
import { ARROW_LEFT } from '../core/icons.js';
import { activeQueue, markKnown, markRepeat, refreshArchive } from '../vocabulary/srs.js';

export const BLANK = '_____';
export const MIN_WORDS = 4; // правильный ответ + 3 неверных

// Предложение с пропуском вместо слова (простой текст); null, если слова в предложении нет.
export function blankSentence(en, word) {
  let found = false;
  const text = tokenize(en).map((t) => { if (t.type === 'word' && t.norm === word) { found = true; return BLANK; } return t.text; }).join('');
  return found ? text : null;
}
const sentenceHtml = (en, word, filled) => tokenize(en).map((t) => {
  if (t.type !== 'word' || t.norm !== word) return esc(t.text);
  return filled ? `<mark>${esc(t.text)}</mark>` : `<span class="blank">${BLANK}</span>`;
}).join('');

const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const usableSentences = (w) => w.sentences.filter((s) => blankSentence(s.en, w.word));

function buildQuestion(w, all) {
  const sents = usableSentences(w);
  const sentence = sents[Math.floor(Math.random() * sents.length)];
  const inSentence = new Set(tokenize(sentence.en).filter((t) => t.type === 'word').map((t) => t.norm));
  const others = all.filter((x) => x.word !== w.word);
  const pref = others.filter((x) => !inSentence.has(x.word)); // чтобы неверный вариант не стоял в самом предложении
  const wrong = shuffle(pref.length >= 3 ? pref : others).slice(0, 3).map((x) => x.word);
  return { word: w.word, sentence, options: shuffle([w.word, ...wrong]) };
}

export async function startQuiz(container, { onExit }) {
  await refreshArchive();
  const all = await db.getAllWords();
  const queue = activeQueue(all).filter((w) => usableSentences(w).length);
  let q = null, answered = null, busy = false, started = queue.length > 0, right = 0, wrong = 0, stopped = false;
  const trOf = (word) => { const w = all.find((x) => x.word === word); return w ? w.translations.join(', ') : ''; };
  const top = (t = '') => `<div class="fc-top"><button class="nav-btn" data-fc="exit" aria-label="Назад" title="Назад">${ARROW_LEFT}</button><span class="muted">${t}</span></div>`;
  const message = (title, text) => `<div class="fc">${top()}<div class="fc-card"><div class="fc-word">${title}</div><div class="fc-under muted">${text}</div></div>
    <div class="fc-btns"><button class="btn" data-fc="exit">К счётчикам</button></div></div>`;

  function render() {
    if (stopped) return;
    if (all.length < MIN_WORDS) { container.innerHTML = message('', `Для квиза нужно минимум ${MIN_WORDS} слова в словаре (сейчас ${all.length})`); return; }
    if (!q) {
      container.innerHTML = message(started ? 'Готово!' : '', started ? `Верно: ${right} · Ошибок: ${wrong}`
        : 'Нет слов для квиза: все слова изучены, лежат в архиве или у них нет подходящих предложений');
      return;
    }
    if (!answered) {
      container.innerHTML = `<div class="fc">${top(`Осталось: ${queue.length}`)}
        <div class="fc-card qz"><div class="qz-sent">${sentenceHtml(q.sentence.en, q.word, false)}</div></div>
        <div class="fc-btns qz-opts">${q.options.map((o, i) => `<button class="btn ghost" data-opt="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`;
      return;
    }
    const ok = answered.chosen === q.word;
    container.innerHTML = `<div class="fc">${top(`Осталось: ${queue.length}`)}
      <div class="fc-card qz">
        <div class="qz-verdict ${ok ? 'ok' : 'bad'}">${ok ? 'Верно!' : 'Неверно'}</div>
        <div class="qz-sent">${sentenceHtml(q.sentence.en, q.word, true)}</div>
        <div class="muted qz-ru">${esc(q.sentence.ru)}</div>
        <div class="qz-tr"><b>${esc(q.word)}</b> — ${esc(trOf(q.word))}</div>
        ${ok ? '' : `<div class="qz-tr muted">Вы выбрали: <b>${esc(answered.chosen)}</b> — ${esc(trOf(answered.chosen))}</div>`}
      </div>
      <div class="fc-btns"><button class="btn" data-fc="next">Дальше</button></div></div>`;
  }

  function next() {
    q = queue.length ? buildQuestion(queue[0], all) : null;
    answered = null;
    render();
  }

  async function choose(opt) {
    if (busy || answered || !q) return;
    busy = true;
    try {
      const head = queue.shift();
      const fresh = (await db.getWord(q.word)) || head;
      if (opt === q.word) {
        await db.putWord(markKnown(fresh));
        right++;
      } else {
        const upd = markRepeat(fresh);
        await db.putWord(upd);
        queue.push(upd); // слово сразу в конец списка 1
        wrong++;
        const picked = await db.getWord(opt); // выбранное по ошибке слово тоже становится «в процессе»
        if (picked) {
          const u2 = markRepeat(picked);
          await db.putWord(u2);
          const i = queue.findIndex((x) => x.word === opt);
          if (i >= 0) { queue.splice(i, 1); queue.push(u2); }
        }
      }
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
    else if (a.dataset.fc === 'exit') { stop(); onExit(); }
  };
  const onKey = (e) => {
    if (answered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); }
    else if (!answered && q && /^[1-4]$/.test(e.key)) choose(q.options[+e.key - 1]);
  };
  document.addEventListener('keydown', onKey);
  function stop() { stopped = true; document.removeEventListener('keydown', onKey); container.onclick = null; }

  next();
  return stop;
}
