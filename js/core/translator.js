// translator.js — перевод через MyMemory + кэш. Провайдер меняется правкой функции request().
import { chunkText } from './textUtils.js';

export class TranslateError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const MAX_Q = 450; // MyMemory принимает до ~500 байт в запросе

export function createTranslator({ getCache, setCache, getEmail, fetchFn = (...a) => fetch(...a) }) {
  // ---- единственное место, зависящее от провайдера ----
  async function request(q) {
    const email = ((await getEmail()) || '').trim();
    const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(q) +
      '&langpair=en|ru' + (email ? '&de=' + encodeURIComponent(email) : '');
    let res;
    try { res = await fetchFn(url); }
    catch { throw new TranslateError('network', 'Нет соединения с переводчиком'); }
    if (res.status === 429) throw new TranslateError('limit', 'Дневной лимит переводов исчерпан');
    if (!res.ok) throw new TranslateError('http', 'Ошибка переводчика: ' + res.status);
    const j = await res.json();
    const text = (j.responseData && j.responseData.translatedText) || '';
    if (Number(j.responseStatus) === 429 || /MYMEMORY WARNING/i.test(text)) {
      throw new TranslateError('limit', 'Дневной лимит переводов исчерпан');
    }
    if (Number(j.responseStatus) !== 200 || !text) throw new TranslateError('empty', 'Перевод не найден');
    return text;
  }

  async function translate(kind, text) {
    const clean = text.trim();
    const key = kind + ':' + (kind === 'w' ? clean.toLowerCase() : clean);
    const hit = await getCache(key);
    if (hit) return { text: hit, cached: true };
    const parts = [];
    for (const chunk of chunkText(clean, MAX_Q)) parts.push(await request(chunk));
    let result = parts.join(' ');
    if (kind === 'w') result = result.toLowerCase();
    await setCache(key, result); // в кэш попадает только успешный перевод
    return { text: result, cached: false };
  }

  return {
    translateWord: (w) => translate('w', w),
    translateSentence: (s) => translate('s', s),
  };
}

// Ищет в переводе предложения слово, соответствующее переводу слова (по основе).
// Возвращает {start, end} или null. Подсветка приблизительная: русская морфология.
export function markTranslation(sentenceRu, wordRu) {
  const first = (wordRu || '').split(/[,;/]/)[0].trim().toLowerCase();
  if (first.length < 3) return null;
  const n = first.length >= 7 ? 5 : first.length >= 5 ? 4 : first.length - 1;
  const stem = first.slice(0, Math.max(3, n)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(?<![\\p{L}])' + stem + '[\\p{L}]*', 'iu').exec(sentenceRu);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}
