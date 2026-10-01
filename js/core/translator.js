// translator.js — перевод с кэшем. Провайдеры лежат в PROVIDERS; чтобы добавить нового — добавьте объект с request().
import { chunkText } from './textUtils.js';

export class TranslateError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const MAX_Q = 450;

async function call(fetchFn, url) {
  let res;
  try { res = await fetchFn(url); }
  catch { throw new TranslateError('network', 'Нет соединения с переводчиком'); }
  if (res.status === 429) throw new TranslateError('limit', 'Лимит переводов исчерпан');
  if (!res.ok) throw new TranslateError('http', 'Ошибка переводчика: ' + res.status);
  try { return await res.json(); }
  catch { throw new TranslateError('empty', 'Переводчик вернул непонятный ответ'); }
}

const PROVIDERS = {
  mymemory: {
    label: 'MyMemory',
    async request(q, { email, fetchFn }) {
      const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(q) +
        '&langpair=en|ru' + (email ? '&de=' + encodeURIComponent(email) : '');
      const j = await call(fetchFn, url);
      const text = (j.responseData && j.responseData.translatedText) || '';
      if (Number(j.responseStatus) === 429 || /MYMEMORY WARNING/i.test(text)) {
        throw new TranslateError('limit', 'Дневной лимит переводов исчерпан');
      }
      if (Number(j.responseStatus) !== 200 || !text) throw new TranslateError('empty', 'Перевод не найден');
      return text;
    },
  },
  google: {
    label: 'Google (неофициальный)',
    async request(q, { fetchFn }) {
      const j = await call(fetchFn, 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=' + encodeURIComponent(q));
      const text = Array.isArray(j && j[0]) ? j[0].map((s) => (s && s[0]) || '').join('').trim() : '';
      if (!text) throw new TranslateError('empty', 'Перевод не найден');
      return text;
    },
  },
};
export const PROVIDER_LABELS = Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, v.label]));

export function createTranslator({ getCache, setCache, getEmail, getProvider = async () => 'mymemory', fetchFn = (...a) => fetch(...a) }) {
  async function translate(kind, text) {
    const clean = text.trim();
    let name = await getProvider();
    if (!PROVIDERS[name]) name = 'mymemory';
    // провайдер входит в ключ кэша: переводы разных сервисов не смешиваются
    const key = `${name}:${kind}:` + (kind === 'w' ? clean.toLowerCase() : clean);
    const hit = await getCache(key);
    if (hit) return { text: hit, cached: true, provider: name };
    const ctx = { email: ((await getEmail()) || '').trim(), fetchFn };
    const parts = [];
    for (const chunk of chunkText(clean, MAX_Q)) parts.push(await PROVIDERS[name].request(chunk, ctx));
    let result = parts.join(' ');
    if (kind === 'w') result = result.toLowerCase();
    await setCache(key, result);
    return { text: result, cached: false, provider: name };
  }
  return {
    translateWord: (w) => translate('w', w),
    translateSentence: (s) => translate('s', s),
  };
}

// Ищет в переводе предложения слово, соответствующее переводу слова (по основе).
export function markTranslation(sentenceRu, wordRu) {
  const first = (wordRu || '').split(/[,;/]/)[0].trim().toLowerCase();
  if (first.length < 3) return null;
  const n = first.length >= 7 ? 5 : first.length >= 5 ? 4 : first.length - 1;
  const stem = first.slice(0, Math.max(3, n)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(?<![\\p{L}])' + stem + '[\\p{L}]*', 'iu').exec(sentenceRu);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}
