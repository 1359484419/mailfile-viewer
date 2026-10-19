// Exporters: EML (RFC 5322 MIME), MBOX (mboxrd), CSV (message list / contacts), ZIP bundles.
import { zipSync } from 'fflate';
import { concatBytes, formatAddressList, htmlToText, safeFileName } from './util.js';

const enc = new TextEncoder();
const CRLF = '\r\n';

function b64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  const all = btoa(s);
  return all.replace(/.{1,76}/g, '$&\r\n');
}

const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);

export function encodeWord(s) {
  s = String(s ?? '').replace(/[\r\n]+/g, ' ');
  if (isAscii(s)) return s;
  // Split into chunks of <= 45 bytes of UTF-8 so each encoded-word stays under 75 chars.
  const words = [];
  let cur = '';
  for (const ch of s) {
    if (enc.encode(cur + ch).length > 45) { words.push(cur); cur = ''; }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${b64(enc.encode(w)).replace(/\r\n/g, '')}?=`).join('\r\n ');
}

const DOT_ATOM = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;

function encodePhrase(name) {
  if (!isAscii(name)) return encodeWord(name);
  return /[()<>@,;:\\".[\]]/.test(name) ? `"${name.replace(/(["\\])/g, '\\$1')}"` : name;
}

/** addr-spec with the local part quoted when needed; null when it is not an internet address (e.g. Exchange X.500 DN). */
export function encodeAddrSpec(addr) {
  const at = addr.lastIndexOf('@');
  if (at <= 0 || at === addr.length - 1 || /[\s<>]/.test(addr.slice(at + 1))) return null;
  const local = addr.slice(0, at);
  const domain = addr.slice(at + 1);
  return (DOT_ATOM.test(local) ? local : `"${local.replace(/(["\\])/g, '\\$1')}"`) + '@' + domain;
}

function encodeAddress(a) {
  if (!a) return '';
  const addr = (a.address || '').trim();
  const name = (a.name || '').trim();
  const spec = addr ? encodeAddrSpec(addr) : null;
  if (!spec) {
    // RFC 6854 empty group keeps the display name without inventing an address
    const label = name || addr;
    return label ? `${encodePhrase(label)}:;` : '';
  }
  if (!name || name === addr) return spec;
  return `${encodePhrase(name)} <${spec}>`;
}

function encodeAddressList(list) {
  return (list || []).map(encodeAddress).filter(Boolean).join(',\r\n ');
}

function nonInternetAddresses(msg) {
  return [msg.from, ...(msg.to || []), ...(msg.cc || [])].filter((a) => a && a.address && !encodeAddrSpec(a.address.trim())).map((a) => a.address);
}

function rfc2822Date(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n) => String(n).padStart(2, '0');
  return `${days[d.getUTCDay()]}, ${p(d.getUTCDate())} ${mons[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

let boundaryCounter = 0;
function boundary() {
  boundaryCounter++;
  return `----=_mfv_${Date.now().toString(36)}_${boundaryCounter}_${Math.random().toString(36).slice(2, 10)}`;
}

function filenameParams(name) {
  const safe = safeFileName(name, 'attachment');
  if (isAscii(safe)) return `filename="${safe.replace(/"/g, '')}"`;
  return `filename="${encodeWord(safe).replace(/\r\n /g, '')}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function textPart(type, content) {
  return `Content-Type: ${type}; charset=UTF-8${CRLF}Content-Transfer-Encoding: base64${CRLF}${CRLF}${b64(enc.encode(content))}`;
}

async function attachmentPart(att) {
  const data = await att.getData();
  const type = att.mimeType || 'application/octet-stream';
  const safe = safeFileName(att.name, 'attachment');
  const nameParam = isAscii(safe) ? safe.replace(/"/g, '') : encodeWord(safe).replace(/\r\n /g, '');
  let h = `Content-Type: ${type}; name="${nameParam}"${CRLF}`;
  h += `Content-Disposition: ${att.inline && att.contentId ? 'inline' : 'attachment'}; ${filenameParams(att.name)}${CRLF}`;
  if (att.contentId) h += `Content-ID: <${att.contentId}>${CRLF}`;
  if (/^message\//i.test(type)) {
    // message/* bodies must stay 7bit/8bit (RFC 2046 5.2.1): embed raw bytes with CRLF line ends
    const eightBit = data.some((c) => c > 127);
    h += `Content-Transfer-Encoding: ${eightBit ? '8bit' : '7bit'}${CRLF}${CRLF}`;
    return [h, toCrlf(data)];
  }
  h += `Content-Transfer-Encoding: base64${CRLF}${CRLF}`;
  return h + b64(data);
}

function toCrlf(data) {
  const out = new Uint8Array(data.length * 2 + 2);
  let o = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 10 && (i === 0 || data[i - 1] !== 13)) out[o++] = 13;
    out[o++] = data[i];
  }
  if (o < 2 || out[o - 2] !== 13 || out[o - 1] !== 10) { out[o++] = 13; out[o++] = 10; }
  return out.subarray(0, o);
}

// A part is a string or an array of (string | Uint8Array) pieces.
function multipart(type, parts, extra = '') {
  const b = boundary();
  const pieces = [`Content-Type: ${type}; boundary="${b}"${extra}${CRLF}${CRLF}`];
  for (const p of parts) pieces.push(`--${b}${CRLF}`, ...[].concat(p), CRLF);
  pieces.push(`--${b}--${CRLF}`);
  return pieces;
}

function piecesToBytes(pieces) {
  return concatBytes(pieces.map((p) => (typeof p === 'string' ? enc.encode(p) : p)));
}

/** Build an RFC 5322 message from the common model. Returns Uint8Array. */
export async function buildEml(msg, { preferRaw = true } = {}) {
  if (preferRaw && msg.raw) return msg.raw;
  const head = [];
  if (msg.from && (msg.from.address || msg.from.name)) head.push(`From: ${encodeAddress(msg.from)}`);
  if (msg.to?.length) head.push(`To: ${encodeAddressList(msg.to)}`);
  if (msg.cc?.length) head.push(`Cc: ${encodeAddressList(msg.cc)}`);
  if (msg.bcc?.length) head.push(`Bcc: ${encodeAddressList(msg.bcc)}`);
  head.push(`Subject: ${encodeWord(msg.subject || '')}`);
  const date = rfc2822Date(msg.date);
  if (date) head.push(`Date: ${date}`);
  if (msg.messageId) {
    const id = msg.messageId.trim();
    head.push(`Message-ID: ${id.startsWith('<') ? id : `<${id}>`}`);
  }
  for (const x of nonInternetAddresses(msg).slice(0, 20)) head.push(`X-Original-Address: ${encodeWord(x)}`);
  head.push('MIME-Version: 1.0');
  head.push('X-Converted-By: MailFile Viewer (local browser conversion)');

  const html = msg.html || '';
  const text = msg.text || (html ? htmlToText(html) : '');
  const atts = msg.attachments || [];
  const related = html ? atts.filter((a) => a.contentId && html.includes(`cid:${a.contentId}`)) : [];
  const others = atts.filter((a) => !related.includes(a));

  let bodyPart;
  if (html) {
    let htmlPart = textPart('text/html', html);
    if (related.length) {
      const rel = [htmlPart];
      for (const a of related) rel.push(await attachmentPart({ ...a, inline: true }));
      htmlPart = multipart('multipart/related', rel, '; type="text/html"');
    }
    bodyPart = multipart('multipart/alternative', [textPart('text/plain', text), htmlPart]);
  } else {
    bodyPart = textPart('text/plain', text);
  }
  let body;
  if (others.length) {
    const parts = [bodyPart];
    for (const a of others) parts.push(await attachmentPart(a));
    body = multipart('multipart/mixed', parts);
  } else {
    body = bodyPart;
  }
  return piecesToBytes([head.join(CRLF) + CRLF, ...[].concat(body)]);
}

function mboxFromLine(msg) {
  const addr = (msg.from && msg.from.address) || 'MAILER-DAEMON';
  const d = msg.date ? new Date(msg.date) : new Date(0);
  return `From ${addr.replace(/\s/g, '')} ${d.toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) ([\d:]+) GMT$/, '$1 $3 $2 $5 $4')}\n`;
}

/** mboxrd encode: quote any line matching /^>*From / with an extra '>'. */
export function mboxQuote(bytes) {
  const out = [];
  let lineStart = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i === bytes.length || bytes[i] === 10) {
      const line = bytes.subarray(lineStart, Math.min(i + 1, bytes.length));
      let j = 0;
      while (line[j] === 0x3e) j++;
      if (line[j] === 0x46 && line[j + 1] === 0x72 && line[j + 2] === 0x6f && line[j + 3] === 0x6d && line[j + 4] === 0x20) out.push(Uint8Array.of(0x3e));
      out.push(line);
      lineStart = i + 1;
    }
  }
  return concatBytes(out);
}

export async function buildMbox(messages, onProgress) {
  const chunks = [];
  let i = 0;
  for (const m of messages) {
    const eml = await buildEml(m);
    // normalise CRLF -> LF inside the mbox for compatibility with Unix readers
    const lf = new Uint8Array(eml.length);
    let o = 0;
    for (let k = 0; k < eml.length; k++) if (!(eml[k] === 13 && eml[k + 1] === 10)) lf[o++] = eml[k];
    chunks.push(enc.encode(mboxFromLine(m)), mboxQuote(lf.subarray(0, o)));
    if (lf[o - 1] !== 10) chunks.push(enc.encode('\n'));
    chunks.push(enc.encode('\n'));
    onProgress?.(++i);
  }
  return concatBytes(chunks);
}

function csvCell(v) {
  const s = String(v ?? '');
  // neutralise spreadsheet formula injection
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function buildCsv(messages) {
  const rows = [['Folder', 'Date', 'From name', 'From address', 'To', 'Cc', 'Subject', 'Attachments', 'Attachment names']];
  for (const m of messages) {
    const atts = m.attachments || [];
    rows.push([
      m.folder || '', m.date || '', m.from?.name || '', m.from?.address || '', formatAddressList(m.to), formatAddressList(m.cc),
      m.subject || '', atts.length, atts.map((a) => a.name).join('; '),
    ]);
  }
  return enc.encode('\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
}

export function buildContactsCsv(messages) {
  const seen = new Map();
  const add = (a, role) => {
    if (!a || !a.address) return;
    const k = a.address.toLowerCase();
    const e = seen.get(k) || { name: a.name || '', address: a.address, sent: 0, received: 0 };
    if (!e.name && a.name) e.name = a.name;
    if (role === 'from') e.sent++; else e.received++;
    seen.set(k, e);
  };
  for (const m of messages) {
    add(m.from, 'from');
    for (const a of [...(m.to || []), ...(m.cc || [])]) add(a, 'to');
  }
  const rows = [['Name', 'Email', 'Messages from', 'Messages to/cc']];
  for (const e of [...seen.values()].sort((a, b) => (b.sent + b.received) - (a.sent + a.received))) rows.push([e.name, e.address, e.sent, e.received]);
  return enc.encode('\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
}

function uniqueName(used, name) {
  let n = name;
  let i = 1;
  while (used.has(n.toLowerCase())) {
    const dot = name.lastIndexOf('.');
    n = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
    i++;
  }
  used.add(n.toLowerCase());
  return n;
}

export function emlFileName(m, index) {
  const d = m.date ? m.date.slice(0, 10) : 'undated';
  return safeFileName(`${String(index + 1).padStart(5, '0')} ${d} ${m.subject || 'no subject'}`.slice(0, 120)) + '.eml';
}

export async function buildEmlZip(messages, onProgress) {
  const files = {};
  const used = new Set();
  let i = 0;
  for (const m of messages) {
    const folder = safeFileName(m.folder || 'Messages').replace(/_/g, '-');
    files[uniqueName(used, `${folder}/${emlFileName(m, i)}`)] = [await buildEml(m), { level: 6 }];
    onProgress?.(++i);
  }
  return zipSync(files);
}

export async function buildAttachmentZip(messages, onProgress) {
  const files = {};
  const used = new Set();
  let i = 0;
  for (const m of messages) {
    for (const a of m.attachments || []) {
      const data = await a.getData();
      files[uniqueName(used, safeFileName(a.name, 'attachment'))] = [data, { level: 0 }];
    }
    onProgress?.(++i);
  }
  return zipSync(files);
}
