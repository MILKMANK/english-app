// studyView.js — раздел «Учить»: счётчики и запуск игр.
import { renderStats } from '../vocabulary/statsPanel.js';
import { titleRow } from '../core/ui.js';
import { startFlashcards } from './flashcards.js';
import { startQuiz } from './quiz.js';
import { startContext } from './context.js';

export function mountStudy(container) {
  let stop = null;
  async function home() {
    if (stop) { stop(); stop = null; }
    container.innerHTML = `<div class="pin nob">${titleRow('Учить', { count: false })}</div><div id="stats"></div>
      <div class="games">
        <button class="btn game" data-g="cards">Карточки</button>
        <button class="btn game" data-g="rcards">Карточки наоборот</button>
        <button class="btn game" data-g="quiz">Квиз</button>
        <button class="btn game" data-g="rquiz">Квиз наоборот</button>
        <button class="btn game" data-g="context">Контекст</button>
      </div>`;
    await renderStats(container.querySelector('#stats'));
    container.onclick = async (e) => {
      const g = e.target.closest('[data-g]');
      if (!g) return;
      container.onclick = null;
      const opts = { onExit: home };
      const kind = g.dataset.g;
      if (kind === 'quiz' || kind === 'rquiz') stop = await startQuiz(container, { ...opts, reverse: kind === 'rquiz' });
      else if (kind === 'context') stop = await startContext(container, opts);
      else stop = await startFlashcards(container, { ...opts, reverse: kind === 'rcards' });
    };
  }
  home();
  return () => { if (stop) stop(); container.onclick = null; };
}
