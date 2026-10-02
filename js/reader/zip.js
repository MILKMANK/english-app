// zip.js — минимальное чтение ZIP (EPUB и DOCX — это ZIP). Использует встроенную в браузер распаковку.

async function inflate(data) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Браузер слишком старый для чтения этого файла (нужен iOS 16.4+ или свежий Chrome/Firefox)');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Файл повреждён или это не EPUB/DOCX');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true), n = dv.getUint16(p + 28, true);
    const e = dv.getUint16(p + 30, true), c = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    entries.set(dec.decode(u8.subarray(p + 46, p + 46 + n)), { flags, method, csize, off });
    p += 46 + n + e + c;
  }
  // Имена в EPUB бывают записаны и с пробелами, и с %20 — пробуем оба варианта.
  const lookup = (name) => {
    if (entries.has(name)) return entries.get(name);
    let dec = name; try { dec = decodeURI(name); } catch { /* оставляем */ }
    return entries.get(dec) || entries.get(encodeURI(dec)) || null;
  };
  async function read(name) {
    const en = lookup(name);
    if (!en) return null;
    if (en.flags & 1) throw new Error('Файл зашифрован');
    const ln = dv.getUint16(en.off + 26, true), le = dv.getUint16(en.off + 28, true);
    const start = en.off + 30 + ln + le;
    const data = u8.subarray(start, start + en.csize);
    if (en.method === 0) return data;
    if (en.method === 8) return inflate(data);
    throw new Error('Неподдерживаемый способ сжатия в файле');
  }
  return {
    has: (name) => !!lookup(name),
    names: () => [...entries.keys()],
    read,
    text: async (name) => { const d = await read(name); return d ? dec.decode(d) : null; },
  };
}
