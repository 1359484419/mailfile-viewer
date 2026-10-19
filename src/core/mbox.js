// mbox reading (mboxo/mboxrd "From " separated) into EML messages.
import { parseEml } from './eml.js';
import { yieldToUi } from './util.js';

function isFromLine(bytes, i) {
  return bytes[i] === 0x46 && bytes[i + 1] === 0x72 && bytes[i + 2] === 0x6f && bytes[i + 3] === 0x6d && bytes[i + 4] === 0x20;
}

export function splitMbox(bytes) {
  const starts = [];
  if (isFromLine(bytes, 0)) starts.push(0);
  for (let i = 0; i < bytes.length - 5; i++) {
    if (bytes[i] === 10 && isFromLine(bytes, i + 1)) starts.push(i + 1);
  }
  const parts = [];
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k];
    let e = k + 1 < starts.length ? starts[k + 1] : bytes.length;
    let nl = s;
    while (nl < e && bytes[nl] !== 10) nl++;
    const body = bytes.subarray(nl + 1, e);
    // undo mboxrd quoting: ">From " -> "From " (and ">>From " -> ">From ")
    const text = unquote(body);
    parts.push(text);
  }
  return parts;
}

function unquote(b) {
  const out = new Uint8Array(b.length);
  let o = 0;
  let lineStart = true;
  for (let i = 0; i < b.length; i++) {
    if (lineStart && b[i] === 0x3e) {
      let j = i;
      while (b[j] === 0x3e) j++;
      lineStart = false;
      if (isFromLine(b, j)) continue; // drop exactly one leading '>'
    }
    out[o++] = b[i];
    lineStart = b[i] === 10;
  }
  return out.subarray(0, o);
}

export async function parseMbox(bytes, opts = {}) {
  const parts = splitMbox(bytes);
  const messages = [];
  const limit = opts.limit ?? Infinity;
  for (const p of parts) {
    if (messages.length >= limit) break;
    messages.push(await parseEml(p, { folder: opts.folder || 'Mailbox' }));
    if (messages.length % 200 === 0) { opts.onProgress?.(messages.length); await yieldToUi(); }
  }
  return { format: 'mbox', folders: [{ path: opts.folder || 'Mailbox', messages }], truncated: parts.length > messages.length, count: messages.length };
}
