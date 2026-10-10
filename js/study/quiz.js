// quiz.js — «Квиз» (слово → выбрать из 4 переводов) и «Квиз наоборот» (русское слово → выбрать из 4 английских).
// Дизайн как у «Контекста»: слово сверху, кнопки 2×2, шторка с результатом. Статусы — общие правила (shared.js).
import * as db from '../core/db.js';
import { tokenize, esc } from '../core/textUtils.js';
import { markTranslationAny } from '../core/translator.js';
import { activeQueue, refreshArchive } from '../vocabulary/srs.js';
import { orderTranslations } from './context.js';
import { CHECK, CROSS, shuffle, topBar, messageScreen, block, sheet, applyAnswer } from './shared.js';

export const MIN_WORDS = 4;

// Варианты перевода слова (запись может содержать список через запятую).
export const variantsOf = (w) => [...new Set(w.translations.flatMap((t) => t.split(/[,;]/)).map((x) => x.trim()).filter(Boolean))];
export const labelOf = (w) => variantsOf(w)[0];
const lower = (a) => a.map((x) => x.toLowerCase());
// Слова, у которых есть общий перевод, путать нельзя: в одном вопросе они не встречаются вместе.
const conflict = (a, b) => { const va = lower(variantsOf(a)); return lower(variantsOf(b)).some((x) => va.includes(x)); };

// Три неверных варианта для слова w (в прямом квизе подписи должны быть разными).
export function pickDistractors(w, all, reverse) {
  const pool = shuffle(all.filter((x) => x.word !== w.word && variantsOf(x).length && !conflict(w, x)));
  const out = [], seen = new Set([labelOf(w).toLowerCase()]);
  for (const x of pool) {
    const key = reverse ? x.word : labelOf(x).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(x);
    if (out.length === 3) return out;
  }
  return null; // не хватает разных слов
}

const sentHtml = (en, word) => tokenize(en).map((t) => (t.type === 'word' && t.norm === word ? `<b class="g">${esc(t.text)}</b>` : esc(t.text))).join('');

export async function startQuiz(container, { reverse = false, onExit }) {
  await refreshArchive();
  const all = (await db.getAllWords()).filter((w) => variantsOf(w).length);
  const queue = activeQueue(all).filter((w) => pickDistractors(w, all, reverse));
  let q = null, answered = null, busy = false, started = queue.length > 0, right = 0, wrong = 0, stopped = false;
  const byWord = (word) => all.find((x) => x.word === word);

  function render() {
    if (stopped) return;
    if (all.length < MIN_WORDS) { container.innerHTML = messageScreen('', `Для квиза нужно минимум ${MIN_WORDS} слова с переводами (сейчас ${all.length})`); return; }
    if (!q) {
      container.innerHTML = messageScreen(started ? 'Готово!' : '', started ? `Верно: ${right} · Ошибок: ${wrong}`
        : 'Нет слов для квиза: все слова изучены, лежат в архиве или у них нет достаточно разных переводов');
      return;
    }
    const w = byWord(q.word);
    const shownWord = reverse ? labelOf(w) : w.word; // что показываем сверху
    let ex = '', bot;
    if (!answered) {
      bot = `<div class="qz-opts">${q.options.map((o, i) => `<button class="btn ghost" data-opt="${i}">${esc(o.text)}</button>`).join('')}</div>`;
    } else {
      const ok = answered.index === q.correct;
      const chosen = q.options[answered.index];
      const cw = byWord(chosen.word);
      // прямой квиз: «перевод — слово», сначала то, что выбрано; наоборот: «слово — переводы»
      const fmt = (word, label) => (reverse ? `<b>${esc(word.word)}</b> — ${esc(orderTranslations(word.translations, null).join(', '))}` : `<b>${esc(label)}</b> — ${esc(word.word)}`);
      const good = block(CHECK, 'ok', ok ? 'Перевод' : 'Правильно', fmt(w, labelOf(w)));
      const bad = ok ? '' : block(CROSS, 'bad', 'Вы выбрали', fmt(cw, chosen.text));
      bot = sheet(ok, bad + good);
      if (q.sentence) {
        const m = markTranslationAny(q.sentence.ru, w.translations);
        const ru = m ? esc(q.sentence.ru.slice(0, m.start)) + '<b class="g">' + esc(q.sentence.ru.slice(m.start, m.end)) + '</b>' + esc(q.sentence.ru.slice(m.end)) : esc(q.sentence.ru);
        ex = `<div class="qz-ex">${sentHtml(q.sentence.en, w.word)}<div class="ru">${ru}</div></div>`;
      }
    }
    container.innerHTML = `<div class="fc">${topBar(`Осталось: ${queue.length}`)}
      <div class="qz-mid"><div class="qz-word">${esc(shownWord)}</div>${ex}</div>
      <div class="qz-bot">${bot}</div></div>`;
  }

  function next() {
    if (!queue.length) q = null;
    else {
      const w = queue[0];
      const wrongs = pickDistractors(w, all, reverse);
      const options = shuffle([w, ...wrongs]).map((x) => ({ word: x.word, text: reverse ? x.word : labelOf(x) }));
      q = { word: w.word, options, correct: options.findIndex((o) => o.word === w.word), sentence: w.sentences.length ? w.sentences[Math.floor(Math.random() * w.sentences.length)] : null };
    }
    answered = null;
    render();
  }

  async function choose(i) {
    if (busy || answered || !q || !q.options[i]) return;
    busy = true;
    try {
      const ok = await applyAnswer(queue, q.word, q.options[i].word);
      if (ok) right++; else wrong++;
      answered = { index: i };
      render();
    } finally { busy = false; }
  }

  container.onclick = (e) => {
    const o = e.target.closest('[data-opt]');
    if (o) return choose(+o.dataset.opt);
    const a = e.target.closest('[data-fc]');
    if (!a) return;
    if (a.dataset.fc === 'next') next();
    else if (a.dataset.fc === 'exit') { stop(); onExit(); }
  };
  const onKey = (e) => {
    if (answered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); }
    else if (!answered && q && /^[1-4]$/.test(e.key)) choose(+e.key - 1);
  };
  document.addEventListener('keydown', onKey);
  function stop() { stopped = true; document.removeEventListener('keydown', onKey); container.onclick = null; }

  next();
  return stop;
}
