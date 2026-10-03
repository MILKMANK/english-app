// statsPanel.js — раздел «Учить»: счётчики слов. Кнопки игр появятся на следующих этапах.
import * as db from '../core/db.js';
import { stats, refreshArchive, STATUS_INFO } from './srs.js';

const TOTAL_COLOR = '#9ca3af';

export async function renderStats(container) {
  await refreshArchive();
  const s = stats(await db.getAllWords());
  const tile = (n, label, color, note = '') => `<div class="tile"><div class="tile-n">${color ? `<span class="dot" style="background:${color}"></span>` : ''}${n}</div>
    <div class="muted">${label}</div>${note ? `<div class="muted small">${note}</div>` : ''}</div>`;
  container.innerHTML = `<div class="tiles">
      ${tile(s.total, 'Всего слов', TOTAL_COLOR)}
      ${tile(s.learned, 'Изучено', STATUS_INFO.learned.color, s.archived ? `в архиве: ${s.archived}` : '')}
      ${tile(s.learning, 'В процессе', STATUS_INFO.learning.color)}
      ${tile(s.new, 'Новые', STATUS_INFO.new.color)}
    </div>`;
}
