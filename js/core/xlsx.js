// xlsx.js — чтение и запись таблиц Excel (.xlsx) без сторонних библиотек.
import { readZip } from './zip.js';

// ---------- запись: ZIP без сжатия ----------
const enc = new TextEncoder();
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zipStore(files) {
  const DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;
  const body = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, DATE, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    body.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, DATE, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...body, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

const xmlEsc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const col = (i) => String.fromCharCode(65 + i);
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// rows: массив строк (массивов текста). Возвращает байты файла .xlsx.
export function buildXlsx(rows, { sheetName = 'Слова', widths = [] } = {}) {
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const data = rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => (v === '' || v == null ? '' :
    `<c r="${col(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`)).join('')}</row>`).join('');
  const xml = (s) => enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + s);
  return zipStore([
    { name: '[Content_Types].xml', data: xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`) },
    { name: '_rels/.rels', data: xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: xml(`<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="${xmlEsc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`) },
    { name: 'xl/worksheets/sheet1.xml', data: xml(`<worksheet xmlns="${NS}">${cols}<sheetData>${data}</sheetData></worksheet>`) },
  ]);
}

// ---------- чтение ----------
const parse = (t) => new DOMParser().parseFromString(t, 'application/xml');
const all = (node, name) => [...node.getElementsByTagNameNS('*', name)];
// «B3» -> {r: 2, c: 1}
function ref(r) {
  const m = /^([A-Z]+)(\d+)$/.exec(r || '');
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: +m[2] - 1, c: c - 1 };
}
const textOf = (el) => all(el, 't').filter((t) => !t.parentNode || t.parentNode.localName !== 'rPh').map((t) => t.textContent).join('');

// Возвращает строки первого листа: массив массивов текста.
export async function parseXlsx(buf) {
  const zip = await readZip(buf);
  const wbText = await zip.text('xl/workbook.xml');
  if (!wbText) throw new Error('Не удалось прочитать таблицу: это не файл Excel (.xlsx)');
  let target = 'worksheets/sheet1.xml';
  const first = all(parse(wbText), 'sheet')[0];
  const relsText = await zip.text('xl/_rels/workbook.xml.rels');
  if (first && relsText) {
    const rid = first.getAttribute('r:id') || first.getAttributeNS(REL, 'id');
    const rel = all(parse(relsText), 'Relationship').find((x) => x.getAttribute('Id') === rid);
    if (rel) target = rel.getAttribute('Target');
  }
  const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
  const sheetText = await zip.text(path);
  if (!sheetText) throw new Error('В таблице нет данных на первом листе');
  const ssText = await zip.text('xl/sharedStrings.xml');
  const shared = ssText ? all(parse(ssText), 'si').map(textOf) : [];
  const grid = new Map();
  let maxC = 0;
  for (const c of all(parse(sheetText), 'c')) {
    const p = ref(c.getAttribute('r'));
    if (!p) continue;
    const t = c.getAttribute('t');
    const v = all(c, 'v')[0];
    let val = '';
    if (t === 'inlineStr') val = textOf(c);
    else if (t === 's') val = v ? shared[+v.textContent] ?? '' : '';
    else val = v ? v.textContent : '';
    if (val === '') continue;
    if (!grid.has(p.r)) grid.set(p.r, []);
    grid.get(p.r)[p.c] = String(val);
    maxC = Math.max(maxC, p.c);
  }
  const rowsIdx = [...grid.keys()];
  if (!rowsIdx.length) return [];
  const rows = [];
  for (let r = 0; r <= Math.max(...rowsIdx); r++) {
    const src = grid.get(r) || [];
    rows.push(Array.from({ length: maxC + 1 }, (_, i) => src[i] ?? ''));
  }
  return rows;
}
