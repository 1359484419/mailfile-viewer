// Minimal lazy ZIP reader (central directory + per-entry inflate) with ZIP64 support.
// Entries are decompressed only when requested, so big .olm exports are not fully inflated.
import { inflateSync } from 'fflate';
import { decodeBytes } from './util.js';

export function readZipDirectory(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP: end of central directory not found');
  let count = v.getUint16(eocd + 10, true);
  let cdOffset = v.getUint32(eocd + 16, true);
  // ZIP64 locator sits right before the EOCD record
  if ((cdOffset === 0xffffffff || count === 0xffff) && eocd >= 20 && v.getUint32(eocd - 20, true) === 0x07064b50) {
    const z64 = Number(v.getBigUint64(eocd - 12, true));
    count = Number(v.getBigUint64(z64 + 32, true));
    cdOffset = Number(v.getBigUint64(z64 + 48, true));
  }
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP: bad central directory');
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    let csize = v.getUint32(p + 20, true);
    let usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true);
    const xlen = v.getUint16(p + 30, true);
    const clen = v.getUint16(p + 32, true);
    let local = v.getUint32(p + 42, true);
    const nameBytes = bytes.subarray(p + 46, p + 46 + nlen);
    const name = decodeBytes(nameBytes, flags & 0x800 ? 'utf-8' : 'utf-8');
    // ZIP64 extra field
    let x = p + 46 + nlen;
    const xend = x + xlen;
    while (x + 4 <= xend) {
      const id = v.getUint16(x, true);
      const sz = v.getUint16(x + 2, true);
      if (id === 0x0001) {
        let q = x + 4;
        if (usize === 0xffffffff) { usize = Number(v.getBigUint64(q, true)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(v.getBigUint64(q, true)); q += 8; }
        if (local === 0xffffffff) { local = Number(v.getBigUint64(q, true)); q += 8; }
      }
      x += 4 + sz;
    }
    entries.push({ name, method, csize, usize, local, flags });
    p = xend + clen;
  }
  const read = (entry) => {
    const lp = entry.local;
    if (v.getUint32(lp, true) !== 0x04034b50) throw new Error('ZIP: bad local header');
    const start = lp + 30 + v.getUint16(lp + 26, true) + v.getUint16(lp + 28, true);
    const comp = bytes.subarray(start, start + entry.csize);
    if (entry.flags & 1) throw new Error('ZIP: encrypted entries are not supported');
    if (entry.method === 0) return comp;
    if (entry.method === 8) return inflateSync(comp, { out: new Uint8Array(entry.usize) });
    throw new Error(`ZIP: unsupported compression method ${entry.method}`);
  };
  return { entries, read };
}
