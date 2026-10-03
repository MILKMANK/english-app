// studyView.js — раздел «Учить»: счётчики и запуск игр.
import { renderStats } from '../vocabulary/statsPanel.js';
import { startFlashcards } from './flashcards.js';

export function mountStudy(container) {
  let stop = null;
  async function home() {
    if (stop) { stop(); stop = null; }
    container.innerHTML = `<h1>Учить</h1><div id="stats"></div><h2>Игры</h2>
      <div class="games">
        <button class="btn game" data-g="cards">Карточки</button>
        <button class="btn game" data-g="rcards">Карточки наоборот</button>
        <button class="btn game" disabled>Квиз (скоро)</button>
      </div>`;
    await renderStats(container.querySelector('#stats'));
    container.onclick = async (e) => {
      const g = e.target.closest('[data-g]');
      if (g) { container.onclick = null; stop = await startFlashcards(container, { reverse: g.dataset.g === 'rcards', onExit: home }); }
    };
  }
  home();
  return () => { if (stop) stop(); container.onclick = null; };
}
