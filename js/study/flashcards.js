// flashcards.js — карточки. Прямые: английское слово -> перевод. Наоборот: перевод -> слово.
// Три ответа: «Знаю» (успех), «С трудом» (без изменений), «Не помню» (ступень ниже). Слово из порции до 20 карточек.
// «С трудом» и «Не помню» возвращают слово в этой же порции через 5–8 карточек (не больше двух раз).
import * as db from '../core/db.js';
import { tokenize, esc } from '../core/textUtils.js';
import { ARROW_LEFT } from '../core/icons.js';
import { buildBatch, review, requeue, refreshArchive } from '../vocabulary/srs.js';

const highlight = (sentence, word) => tokenize(sentence).map((t) => (t.type === 'word' && t.norm === word ? `<mark>${esc(t.text)}</mark>` : esc(t.text))).join('');

export async function startFlashcards(container, { reverse = false, onExit }) {
  const mode = reverse ? 'rcards' : 'cards';
  let queue = [], counts = new Map(), res = { know: 0, hard: 0, no: 0 };
  let flipped = false, busy = false, started = false, more = false, sentence = null, stopped = false;

  const pickSentence = () => {
    const w = queue[0];
    sentence = w && w.sentences.length ? w.sentences[Math.floor(Math.random() * w.sentences.length)] : null;
  };
  async function load() {
    await refreshArchive();
    queue = buildBatch(await db.getAllWords(), mode);
    counts = new Map(); res = { know: 0, hard: 0, no: 0 };
    started = queue.length > 0; flipped = false; more = false;
    pickSentence();
  }
  const top = (right = '') => `<div class="fc-top"><button class="nav-btn" data-fc="exit" aria-label="Назад" title="Назад">${ARROW_LEFT}</button><span class="muted">${right}</span></div>`;

  // Слово (или его перевод) всегда в одном и том же месте карточки: сверху; всё остальное — под ним.
  function render() {
    if (stopped) return;
    if (!queue.length) {
      container.innerHTML = `<div class="fc">${top()}
        <div class="fc-card"><div class="fc-word">${started ? (more ? 'Порция пройдена!' : 'На сегодня всё') : ''}</div><div class="fc-under muted">${started
          ? `Знаю: ${res.know} · С трудом: ${res.hard} · Не помню: ${res.no}` : 'Нет слов для повторения сегодня в этом режиме'}</div></div>
        <div class="fc-btns">${more ? '<button class="btn ghost" data-fc="more">Ещё порцию</button>' : ''}<button class="btn" data-fc="exit">К счётчикам</button></div></div>`;
      return;
    }
    const w = queue[0];
    const trs = esc(w.translations.join(', '));
    const front = reverse ? trs : esc(w.word);
    const back = reverse ? esc(w.word) : trs;
    const sent = sentence ? `<div class="fc-sent">${highlight(sentence.en, w.word)}<div class="muted">${esc(sentence.ru)}</div></div>` : '';
    container.innerHTML = `<div class="fc">${top(`Осталось: ${queue.length}`)}
      <div class="fc-card" data-fc="flip">
        <div class="fc-word">${flipped ? back : front}</div>
        <div class="fc-under">${flipped ? sent : `<span class="muted small">Нажмите, чтобы увидеть ${reverse ? 'слово' : 'перевод'}</span>`}</div></div>
      <div class="fc-btns fc-three">${flipped ? '<button class="btn ghost" data-fc="no">Не помню</button><button class="btn ghost" data-fc="hard">С трудом</button><button class="btn" data-fc="know">Знаю</button>' : ''}</div></div>`;
  }

  async function answer(kind) {
    if (busy || !flipped || !queue.length) return;
    busy = true;
    try {
      const w = queue.shift();
      const fresh = (await db.getWord(w.word)) || w;
      const upd = review(fresh, mode, kind === 'know' ? 'ok' : kind);
      if (kind !== 'hard') await db.putWord(upd);
      res[kind]++;
      if (kind !== 'know') requeue(queue, upd, counts);
      if (!queue.length) more = buildBatch(await db.getAllWords(), mode).length > 0;
      flipped = false;
      pickSentence();
      render();
    } finally { busy = false; }
  }

  const flip = () => { if (!flipped && queue.length) { flipped = true; render(); } };
  container.onclick = async (e) => {
    const a = e.target.closest('[data-fc]');
    if (!a) return;
    const act = a.dataset.fc;
    if (act === 'flip') flip();
    else if (act === 'know' || act === 'hard' || act === 'no') answer(act);
    else if (act === 'more') { await load(); render(); }
    else if (act === 'exit') { stop(); onExit(); }
  };
  const onKey = (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight') answer('know');
    else if (e.key === 'ArrowDown') answer('hard');
    else if (e.key === 'ArrowLeft') answer('no');
  };
  document.addEventListener('keydown', onKey);
  function stop() { stopped = true; document.removeEventListener('keydown', onKey); container.onclick = null; }

  await load();
  render();
  return stop;
}
