// flashcards.js — карточки. Прямые: английское слово -> перевод. Наоборот: перевод -> английское слово.
// Берутся слова списка 1 (новые и «в процессе», не в архиве) по порядку. «Знаю» -> изучено + архив на месяц,
// «Повторить» -> «в процессе» и в конец списка.
import * as db from '../core/db.js';
import { tokenize, esc } from '../core/textUtils.js';
import { ARROW_LEFT } from '../core/icons.js';
import { activeQueue, markKnown, markRepeat, refreshArchive } from '../vocabulary/srs.js';

const highlight = (sentence, word) => tokenize(sentence).map((t) => (t.type === 'word' && t.norm === word ? `<mark>${esc(t.text)}</mark>` : esc(t.text))).join('');

export async function startFlashcards(container, { reverse = false, onExit }) {
  await refreshArchive();
  const queue = activeQueue(await db.getAllWords());
  let flipped = false, busy = false, known = 0, repeat = 0, started = queue.length > 0, sentence = null, stopped = false;

  const pickSentence = () => {
    const w = queue[0];
    sentence = w && w.sentences.length ? w.sentences[Math.floor(Math.random() * w.sentences.length)] : null;
  };
  const top = (right = '') => `<div class="fc-top"><button class="nav-btn" data-fc="exit" aria-label="Назад" title="Назад">${ARROW_LEFT}</button><span class="muted">${right}</span></div>`;

  // Слово (или его перевод) всегда в одном и том же месте карточки: сверху; всё остальное — под ним.
  function render() {
    if (stopped) return;
    if (!queue.length) {
      container.innerHTML = `<div class="fc">${top()}
        <div class="fc-card"><div class="fc-word">${started ? 'Готово!' : ''}</div><div class="fc-under muted">${started
          ? `Знаю: ${known} · Повторить: ${repeat}` : 'Нет слов для повторения: все слова изучены или лежат в архиве'}</div></div>
        <div class="fc-btns"><button class="btn" data-fc="exit">К счётчикам</button></div></div>`;
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
      <div class="fc-btns">${flipped ? '<button class="btn ghost" data-fc="repeat">Повторить</button><button class="btn" data-fc="know">Знаю</button>' : ''}</div></div>`;
  }

  async function answer(isKnown) {
    if (busy || !flipped || !queue.length) return;
    busy = true;
    try {
      const w = queue.shift();
      const fresh = (await db.getWord(w.word)) || w;
      const upd = isKnown ? markKnown(fresh) : markRepeat(fresh);
      await db.putWord(upd);
      if (isKnown) known++; else { repeat++; queue.push(upd); } // «повторить» — в конец списка
      flipped = false;
      pickSentence();
      render();
    } finally { busy = false; }
  }

  const flip = () => { if (!flipped && queue.length) { flipped = true; render(); } };
  container.onclick = (e) => {
    const a = e.target.closest('[data-fc]');
    if (!a) return;
    const act = a.dataset.fc;
    if (act === 'flip') flip();
    else if (act === 'know') answer(true);
    else if (act === 'repeat') answer(false);
    else if (act === 'exit') { stop(); onExit(); }
  };
  const onKey = (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight') answer(true);
    else if (e.key === 'ArrowLeft') answer(false);
  };
  document.addEventListener('keydown', onKey);
  function stop() { stopped = true; document.removeEventListener('keydown', onKey); container.onclick = null; }

  pickSentence();
  render();
  return stop;
}
