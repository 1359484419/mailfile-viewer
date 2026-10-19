// Compressed RTF (LZFu) decompression and RTF -> HTML / text conversion.
// HTML de-encapsulation follows the public spec [MS-OXRTFEX] ("\fromhtml1" RTF bodies).
import * as drtf from '@kenjiuno/decompressrtf';
import { codepageToLabel, decodeBytes, escapeHtml } from './util.js';

const decompressFn = drtf.decompressRTF || drtf.default?.decompressRTF;

export function decompressRtf(bytes) {
  if (!bytes || bytes.length < 16) return null;
  try {
    const out = decompressFn(Array.from(bytes));
    return Uint8Array.from(out);
  } catch {
    return null;
  }
}

// Skip these destination groups entirely when producing text.
const SKIP_DEST = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr',
  'footerl', 'footerr', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata',
  'colorschememapping', 'latentstyles', 'datastore', 'filetbl', 'revtbl', 'pgdsctbl', 'fldinst',
]);

function tokenize(rtf) {
  const tokens = [];
  let i = 0;
  const n = rtf.length;
  while (i < n) {
    const c = rtf[i];
    if (c === '{') { tokens.push({ t: '{' }); i++; continue; }
    if (c === '}') { tokens.push({ t: '}' }); i++; continue; }
    if (c === '\\') {
      const d = rtf[i + 1];
      if (d === undefined) break;
      if (d === "'") {
        tokens.push({ t: 'hex', v: parseInt(rtf.substr(i + 2, 2), 16) });
        i += 4; continue;
      }
      if (/[a-zA-Z]/.test(d)) {
        let j = i + 1;
        while (j < n && /[a-zA-Z]/.test(rtf[j])) j++;
        const word = rtf.slice(i + 1, j);
        let k = j;
        if (rtf[k] === '-' || /[0-9]/.test(rtf[k] || '')) {
          k++;
          while (k < n && /[0-9]/.test(rtf[k])) k++;
        }
        const param = k > j ? parseInt(rtf.slice(j, k), 10) : null;
        if (rtf[k] === ' ') k++;
        tokens.push({ t: 'cw', w: word, p: param });
        i = k; continue;
      }
      // control symbol
      tokens.push({ t: 'sym', v: d });
      i += 2; continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    let j = i;
    while (j < n && rtf[j] !== '\\' && rtf[j] !== '{' && rtf[j] !== '}' && rtf[j] !== '\r' && rtf[j] !== '\n') j++;
    tokens.push({ t: 'text', v: rtf.slice(i, j) });
    i = j;
  }
  return tokens;
}

/**
 * Convert RTF bytes into { html, text, fromHtml }.
 * If the RTF encapsulates HTML (\fromhtml1) the original HTML is reconstructed,
 * otherwise plain text is extracted and wrapped.
 */
export function rtfToContent(rtfBytes) {
  const rtf = decodeBytes(rtfBytes, 'latin1');
  const fromHtml = /\\fromhtml1/.test(rtf.slice(0, 2000));
  const cpMatch = rtf.match(/\\ansicpg(\d+)/);
  const label = codepageToLabel(cpMatch ? Number(cpMatch[1]) : 1252);
  const tokens = tokenize(rtf);

  let out = '';
  let pendingBytes = [];
  const flushBytes = () => {
    if (pendingBytes.length) { out += decodeBytes(Uint8Array.from(pendingBytes), label); pendingBytes = []; }
  };
  const emit = (s) => { flushBytes(); out += s; };

  const stack = [];
  let st = { skip: false, tag: false, htmlrtf: false, uc: 1, dest: false };
  let skipChars = 0;
  let firstInGroup = false;

  const active = () => {
    if (st.skip) return false;
    if (fromHtml) return st.tag || !st.htmlrtf;
    return true;
  };

  for (const tk of tokens) {
    if (tk.t === '{') {
      stack.push(st); st = { ...st, dest: false }; firstInGroup = true; skipChars = 0; continue;
    }
    if (tk.t === '}') {
      flushBytes();
      st = stack.pop() || st; firstInGroup = false; continue;
    }
    const wasFirst = firstInGroup;
    firstInGroup = false;
    if (tk.t === 'sym') {
      if (tk.v === '*') { st.dest = true; firstInGroup = wasFirst; continue; }
      if (!active()) continue;
      if (tk.v === '\\' || tk.v === '{' || tk.v === '}') emit(tk.v);
      else if (tk.v === '~') emit(' ');
      else if (tk.v === '_') emit('-');
      continue;
    }
    if (tk.t === 'cw') {
      const w = tk.w;
      if (w === 'htmltag' && (st.dest || wasFirst)) { st.tag = true; st.skip = false; continue; }
      if (w === 'mhtmltag' && (st.dest || wasFirst)) { st.skip = true; continue; }
      if (st.dest && !st.tag && (wasFirst || true) && w !== 'htmltag') { st.skip = true; continue; }
      if (SKIP_DEST.has(w)) { st.skip = true; continue; }
      if (w === 'htmlrtf') { st.htmlrtf = tk.p !== 0; continue; }
      if (w === 'uc') { st.uc = tk.p ?? 1; continue; }
      if (!active()) continue;
      if (w === 'u') {
        let cp = tk.p; if (cp < 0) cp += 65536;
        emit(String.fromCharCode(cp)); skipChars = st.uc; continue;
      }
      if (w === 'par' || w === 'line') { emit(fromHtml ? '\r\n' : '\n'); continue; }
      if (w === 'tab') { emit('\t'); continue; }
      if (w === 'lquote') emit('‘'); else if (w === 'rquote') emit('’');
      else if (w === 'ldblquote') emit('“'); else if (w === 'rdblquote') emit('”');
      else if (w === 'bullet') emit('•'); else if (w === 'emdash') emit('—'); else if (w === 'endash') emit('–');
      continue;
    }
    if (tk.t === 'hex') {
      if (skipChars > 0) { skipChars--; continue; }
      if (!active()) continue;
      pendingBytes.push(tk.v); continue;
    }
    if (tk.t === 'text') {
      let v = tk.v;
      if (skipChars > 0) { const k = Math.min(skipChars, v.length); v = v.slice(k); skipChars -= k; }
      if (!active() || !v) continue;
      emit(v);
    }
  }
  flushBytes();

  if (fromHtml) return { fromHtml: true, html: out, text: null };
  const text = out.replace(/\n{3,}/g, '\n\n').trim();
  return { fromHtml: false, html: null, text };
}

export function compressedRtfToContent(bytes) {
  const raw = decompressRtf(bytes);
  if (!raw) return null;
  const c = rtfToContent(raw);
  if (!c.fromHtml && c.text) c.html = '<pre style="white-space:pre-wrap;font:inherit">' + escapeHtml(c.text) + '</pre>';
  return c;
}
