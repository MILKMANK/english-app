// seed.js — 16 тестовых слов уровня B2. Добавляются один раз при первом запуске.
// Удалить можно в разделе «Словарь» (с этапа 3).
export const SEED_WORDS = [
  ['reluctant', 'неохотный', 'She was reluctant to admit that she had made a mistake.', 'Она неохотно признала, что совершила ошибку.'],
  ['comprehensive', 'всесторонний', 'The report gives a comprehensive overview of the problem.', 'В отчёте дан всесторонний обзор проблемы.'],
  ['acknowledge', 'признавать', 'He refused to acknowledge that he was wrong.', 'Он отказался признавать, что был неправ.'],
  ['deliberate', 'преднамеренный', 'It was a deliberate attempt to mislead the public.', 'Это была преднамеренная попытка ввести общественность в заблуждение.'],
  ['pursue', 'заниматься, добиваться', 'She decided to pursue a career in medicine.', 'Она решила посвятить себя карьере в медицине.'],
  ['overcome', 'преодолевать', 'He managed to overcome his fear of public speaking.', 'Ему удалось преодолеть страх публичных выступлений.'],
  ['tolerate', 'терпеть', "I can't tolerate this noise any longer.", 'Я больше не могу терпеть этот шум.'],
  ['prevail', 'преобладать, побеждать', 'Common sense will prevail in the end.', 'В конце концов здравый смысл победит.'],
  ['cope', 'справляться', 'How do you cope with so much stress?', 'Как ты справляешься с таким количеством стресса?'],
  ['controversial', 'спорный', 'The decision was highly controversial.', 'Это решение было крайне спорным.'],
  ['estimate', 'оценивать', 'Experts estimate that the repairs will cost thousands of euros.', 'Эксперты оценивают, что ремонт будет стоить тысячи евро.'],
  ['genuine', 'искренний, подлинный', 'She showed genuine concern for his health.', 'Она проявила искреннее беспокойство о его здоровье.'],
  ['inevitable', 'неизбежный', 'Change is inevitable in any growing company.', 'Перемены неизбежны в любой растущей компании.'],
  ['thrive', 'процветать', 'Small businesses can thrive in this area.', 'Малый бизнес может процветать в этом районе.'],
  ['ambiguous', 'двусмысленный', 'The wording of the contract is ambiguous.', 'Формулировка договора двусмысленна.'],
  ['enhance', 'улучшать, усиливать', 'The new software will enhance the security of the system.', 'Новое программное обеспечение повысит безопасность системы.'],
].map(([word, translation, en, ru]) => ({ word, translation, en, ru }));
