// Shared helpers used by parsers, exporters and the UI. Pure functions, no DOM access.

export function toU8(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new TypeError('Expected binary data');
}

const CODEPAGES = {
  932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5', 874: 'windows-874',
  1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253',
  1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257',
  1258: 'windows-1258', 20127: 'us-ascii', 20866: 'koi8-r', 21866: 'koi8-u',
  28591: 'iso-8859-1', 28592: 'iso-8859-2', 28595: 'iso-8859-5', 28597: 'iso-8859-7',
  50220: 'iso-2022-jp', 50221: 'iso-2022-jp', 50222: 'iso-2022-jp', 51932: 'euc-jp',
  65001: 'utf-8', 1200: 'utf-16le', 437: 'ibm866',
};

export function codepageToLabel(cp) {
  return CODEPAGES[cp] || 'windows-1252';
}

export function decodeBytes(bytes, label = 'utf-8') {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function stripNul(s) {
  return (s || '').replace(/\u0000+$/g, '');
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function textToHtml(text) {
  return '<pre style="white-space:pre-wrap;word-wrap:break-word;font:inherit">' + escapeHtml(text) + '</pre>';
}

export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function safeFileName(name, fallback = 'file') {
  const n = String(name || '').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
  return (n || fallback).slice(0, 150);
}

export function guessMime(name) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  return ({
    pdf: 'application/pdf', txt: 'text/plain', htm: 'text/html', html: 'text/html', csv: 'text/csv',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip', ics: 'text/calendar', eml: 'message/rfc822', msg: 'application/vnd.ms-outlook',
    rtf: 'application/rtf', xml: 'application/xml', json: 'application/json',
  })[ext] || 'application/octet-stream';
}

export function formatAddress(a) {
  if (!a) return '';
  if (typeof a === 'string') return a;
  if (a.name && a.address && a.name !== a.address) return `${a.name} <${a.address}>`;
  return a.address || a.name || '';
}

export function formatAddressList(list) {
  return (list || []).map(formatAddress).filter(Boolean).join(', ');
}

// Parse a display string like "A <a@x>, b@y; C" into address objects.
export function parseAddressString(s) {
  if (!s) return [];
  return String(s)
    .split(/[;,](?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^"?(.*?)"?\s*<([^>]+)>$/);
      if (m) return { name: m[1].trim(), address: m[2].trim() };
      return p.includes('@') ? { name: '', address: p } : { name: p, address: '' };
    });
}

export function isoDate(d) {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString();
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function concatBytes(chunks) {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export const yieldToUi = () => new Promise((r) => setTimeout(r, 0));
