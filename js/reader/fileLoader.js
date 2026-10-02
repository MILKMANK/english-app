// fileLoader.js — EPUB / TXT / DOCX -> { title, chapters: [{ title, text }] }, абзацы в text разделены "\n\n".
import { readZip } from './zip.js';
import { splitSentences } from '../core/textUtils.js';

const MAX_WORDS = 4000;  // глава длиннее режется
const CHUNK = 3000;      // размер части при нарезке
const TINY = 120;        // главы короче сливаются со следующей

const wc = (p) => p.split(/\s+/).filter(Boolean).length;
const clean = (s) => s.replace(/[\u00AD\u200B\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
const parseXml = (t) => new DOMParser().parseFromString(t, 'application/xml');
function parseHtmlish(t) {
  const x = new DOMParser().parseFromString(t, 'application/xhtml+xml');
  return x.getElementsByTagName('parsererror').length ? new DOMParser().parseFromString(t, 'text/html') : x;
}
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
function resolve(dir, href) {
  let h = href; try { h = decodeURIComponent(href); } catch { /* оставляем как есть */ }
  const out = [];
  for (const part of (dir + h).split('/')) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
  return out.join('/');
}

// Слишком длинный абзац (бывает в TXT без переносов) режем по предложениям.
function breakHuge(p) {
  if (wc(p) <= 1500) return [p];
  const out = []; let cur = '';
  for (const s of splitSentences(p)) {
    if (cur && wc(cur + ' ' + s.text) > 300) { out.push(cur); cur = s.text; } else cur = cur ? cur + ' ' + s.text : s.text;
  }
  if (cur) out.push(cur);
  return out;
}

// Общая постобработка: слить крошечные главы, порезать огромные, дать названия.
function finalize(sections) {
  const secs = sections.map((s) => ({ title: s.title || '', paras: s.paras.flatMap(breakHuge) })).filter((s) => s.paras.length);
  const words = (s) => s.paras.reduce((n, p) => n + wc(p), 0);
  const merged = []; let carry = null;
  secs.forEach((s, i) => {
    let cur = s;
    if (carry) { cur = { title: s.title, paras: [carry.title, ...carry.paras, ...s.paras].filter(Boolean) }; carry = null; }
    if (words(cur) < TINY && i < secs.length - 1) carry = cur; else merged.push(cur);
  });
  if (carry) merged.push(carry);
  const res = [];
  for (const s of merged) {
    if (words(s) <= MAX_WORDS) { res.push(s); continue; }
    let part = [], n = 0, k = 1;
    const label = (k) => (s.title ? `${s.title} (${k})` : `Часть ${k}`);
    for (const p of s.paras) {
      if (n + wc(p) > CHUNK && part.length) { res.push({ title: label(k++), paras: part }); part = []; n = 0; }
      part.push(p); n += wc(p);
    }
    if (part.length) res.push({ title: label(k), paras: part });
  }
  return res.map((s, i) => ({ title: s.title || `Часть ${i + 1}`, text: s.paras.join('\n\n') }));
}

// ---------- TXT ----------
const HEADING = /^(chapter|part|book|section)\s+[\w.-]+(\s*[:.–—-].*)?$|^(prologue|epilogue|preface|introduction)$/i;
function loadTxt(buf) {
  let raw;
  try { raw = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { raw = new TextDecoder('windows-1252').decode(buf); }
  raw = raw.replace(/\r\n?/g, '\n');
  const blocks = raw.split(/\n[ \t]*\n/).map((b) => b.trim()).filter(Boolean);
  const paras = blocks.length < 3
    ? raw.split('\n').map(clean).filter(Boolean)           // абзац = строка
    : blocks.map((b) => clean(b.replace(/\n/g, ' ')));     // строки внутри абзаца склеиваем
  const sections = []; let cur = { title: '', paras: [] };
  for (const p of paras) {
    if (p.length <= 80 && HEADING.test(p)) { if (cur.title || cur.paras.length) sections.push(cur); cur = { title: p, paras: [] }; }
    else cur.paras.push(p);
  }
  sections.push(cur);
  return { title: '', sections };
}

// ---------- DOCX ----------
function paragraphText(p) {
  let s = '';
  (function walk(n) {
    for (const c of n.childNodes) {
      if (c.nodeType !== 1) continue;
      if (c.nodeName === 'w:t') s += c.textContent;
      else if (c.nodeName === 'w:tab' || c.nodeName === 'w:br' || c.nodeName === 'w:cr') s += ' ';
      else walk(c);
    }
  })(p);
  return s;
}
async function loadDocx(buf) {
  const zip = await readZip(buf);
  const xml = await zip.text('word/document.xml');
  if (!xml) throw new Error('Не удалось прочитать DOCX');
  const doc = parseXml(xml);
  const sections = []; let cur = { title: '', paras: [] };
  for (const p of doc.getElementsByTagName('w:p')) {
    const st = p.getElementsByTagName('w:pStyle')[0];
    const style = (st ? st.getAttribute('w:val') : '').replace(/\s/g, '');
    const text = clean(paragraphText(p));
    if (!text) continue;
    if (/^(Heading1|Heading2|Title)$/i.test(style)) { if (cur.title || cur.paras.length) sections.push(cur); cur = { title: text, paras: [] }; }
    else cur.paras.push(text);
  }
  sections.push(cur);
  const core = await zip.text('docProps/core.xml');
  const t = core && parseXml(core).getElementsByTagName('dc:title')[0];
  return { title: t ? t.textContent : '', sections };
}

// ---------- EPUB ----------
const LEAF = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'PRE', 'DT', 'DD', 'FIGCAPTION', 'TD', 'TH']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'IMG', 'NAV']);
const BLOCKISH = 'p,div,h1,h2,h3,h4,h5,h6,li,ul,ol,blockquote,pre,table,section,article';
function blocks(node, out) {
  for (const ch of node.childNodes) {
    if (ch.nodeType === 3) { const t = clean(ch.nodeValue); if (t) out.push(t); continue; }
    if (ch.nodeType !== 1) continue;
    const tag = ch.nodeName.toUpperCase();
    if (SKIP.has(tag)) continue;
    if (LEAF.has(tag) || !ch.querySelector(BLOCKISH)) { const t = clean(ch.textContent); if (t) out.push(t); }
    else blocks(ch, out);
  }
}
async function loadEpub(buf) {
  const zip = await readZip(buf);
  const enc = await zip.text('META-INF/encryption.xml');
  if (enc && /EncryptionMethod[^>]*Algorithm="(?!http:\/\/www\.idpf\.org\/2008\/embedding|http:\/\/ns\.adobe\.com\/pdf\/enc#RC)/.test(enc)) {
    throw new Error('Эта книга защищена DRM (куплена в магазине), такие файлы открыть нельзя');
  }
  const container = await zip.text('META-INF/container.xml');
  const opfPath = container && parseXml(container).getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
  const opfText = opfPath && (await zip.text(opfPath));
  if (!opfText) throw new Error('Не удалось прочитать структуру EPUB');
  const opf = parseXml(opfText);
  const dir = dirOf(opfPath);
  const manifest = new Map();
  for (const it of opf.getElementsByTagName('item')) {
    manifest.set(it.getAttribute('id'), { href: resolve(dir, it.getAttribute('href') || ''), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' });
  }
  const t = opf.getElementsByTagName('dc:title')[0];

  // оглавление: название главы по имени файла
  const toc = new Map();
  const items = [...manifest.values()];
  const nav = items.find((m) => /\bnav\b/.test(m.props));
  const ncx = items.find((m) => m.type === 'application/x-dtbncx+xml');
  const add = (base, href, label) => {
    if (!href || !label) return;
    const key = resolve(dirOf(base), href.split('#')[0]);
    if (!toc.has(key)) toc.set(key, clean(label));
  };
  if (nav) {
    const nt = await zip.text(nav.href);
    if (nt) for (const a of parseHtmlish(nt).getElementsByTagName('a')) add(nav.href, a.getAttribute('href'), a.textContent);
  } else if (ncx) {
    const nt = await zip.text(ncx.href);
    if (nt) for (const np of parseXml(nt).getElementsByTagName('navPoint')) {
      add(ncx.href, np.getElementsByTagName('content')[0]?.getAttribute('src'), np.getElementsByTagName('text')[0]?.textContent);
    }
  }

  const sections = [];
  for (const ref of opf.getElementsByTagName('itemref')) {
    const m = manifest.get(ref.getAttribute('idref'));
    if (!m || !/html/.test(m.type)) continue;
    const html = await zip.text(m.href);
    if (!html) continue;
    const d = parseHtmlish(html);
    const body = d.getElementsByTagName('body')[0] || d.documentElement;
    const paras = [];
    blocks(body, paras);
    const h = body.querySelector('h1,h2,h3');
    const title = toc.get(m.href) || clean(h ? h.textContent : '');
    if (paras.length && title && paras[0].toLowerCase() === title.toLowerCase()) paras.shift();
    sections.push({ title, paras });
  }
  return { title: t ? t.textContent : '', sections };
}

export async function loadFile(file) {
  const name = file.name || '';
  const ext = ((name.match(/\.([^.]+)$/) || [])[1] || '').toLowerCase();
  const base = name.replace(/\.[^.]+$/, '');
  if (ext === 'doc') throw new Error('Старый формат .doc не поддерживается. Сохраните файл как .docx и загрузите снова');
  if (!['txt', 'docx', 'epub'].includes(ext)) throw new Error('Поддерживаются только файлы EPUB, TXT и DOCX');
  const buf = await file.arrayBuffer();
  const r = ext === 'txt' ? loadTxt(buf) : ext === 'docx' ? await loadDocx(buf) : await loadEpub(buf);
  const chapters = finalize(r.sections);
  if (!chapters.length) throw new Error('В файле не найден текст');
  return { title: clean(r.title || '') || base, chapters };
}
