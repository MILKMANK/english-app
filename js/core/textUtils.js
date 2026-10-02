// textUtils.js — что считать словом и как делить текст на предложения.

// Слово: латинские буквы; внутри допускаются ' ’ - между буквами (don't, well-known).
const WORD_RE = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

// Нормализация: нижний регистр, ’ -> ', отрезаем 's (John's -> john, it's -> it).
export function normalizeWord(raw) {
  return raw.toLowerCase().replace(/’/g, "'").replace(/'s$/, '');
}

// Разбивает текст на куски: слова и всё остальное (пробелы, знаки). Склейка всех кусков = исходный текст.
export function tokenize(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    if (m.index > last) out.push({ type: 'sep', text: text.slice(last, m.index) });
    out.push({ type: 'word', text: m[0], norm: normalizeWord(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'sep', text: text.slice(last) });
  return out;
}

// Сокращения, после которых точка НЕ заканчивает предложение.
const ABBR = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|vs|etc|No|Mt|Gen|Col|Capt|Lt|Sgt|Rev|Hon|Inc|Ltd|Co)\.|\b(?:e\.g|i\.e|U\.S|U\.K|a\.m|p\.m)\.|\b[A-Z]\.)\s*$/;

// Делит текст на предложения: [{text, start, end}]. Использует Intl.Segmenter,
// затем склеивает куски, ошибочно разрезанные после сокращений (Mr. Smith).
export function splitSentences(text) {
  const parts = [];
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    for (const seg of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)) {
      parts.push({ start: seg.index, end: seg.index + seg.segment.length });
    }
  } else {
    for (const m of text.matchAll(/[^.!?]+(?:[.!?]+["”’')\]]*|$)\s*/g)) {
      parts.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  const merged = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    if (prev && ABBR.test(text.slice(prev.start, prev.end))) prev.end = p.end;
    else merged.push({ ...p });
  }
  return merged
    .map((p) => {
      const raw = text.slice(p.start, p.end);
      const lead = raw.length - raw.trimStart().length;
      const t = raw.trim();
      return { text: t, start: p.start + lead, end: p.start + lead + t.length };
    })
    .filter((p) => p.text.length > 0);
}

// Предложение, в котором лежит позиция index (для клика по слову).
export function sentenceAt(sentences, index) {
  return sentences.find((s) => index >= s.start && index <= s.end) || null;
}

// Делит длинный текст на куски не длиннее max символов по границам слов.
export function chunkText(text, max) {
  if (text.length <= max) return [text];
  const chunks = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > max) { chunks.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
