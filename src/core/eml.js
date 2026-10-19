// RFC 5322 / MIME (.eml) parsing via postal-mime (MIT).
import * as pm from 'postal-mime';
import { decodeBytes, isoDate, toU8, guessMime } from './util.js';

const PostalMime = pm.default?.default || pm.default;

function rawHeaderBlock(bytes) {
  const max = Math.min(bytes.length, 256 * 1024);
  for (let i = 0; i < max - 1; i++) {
    if (bytes[i] === 10 && (bytes[i + 1] === 10 || (bytes[i + 1] === 13 && bytes[i + 2] === 10))) {
      return decodeBytes(bytes.subarray(0, i), 'utf-8');
    }
  }
  return decodeBytes(bytes.subarray(0, max), 'utf-8');
}

function normAddr(a) {
  if (!a) return null;
  if (a.group) return a.group.map(normAddr);
  return { name: a.name || '', address: a.address || '' };
}

function normList(l) {
  return (l || []).flatMap((a) => {
    const n = normAddr(a);
    return Array.isArray(n) ? n : n ? [n] : [];
  });
}

export async function parseEml(data, meta = {}) {
  const bytes = toU8(data);
  const parsed = await PostalMime.parse(bytes.slice().buffer, { attachmentEncoding: 'arraybuffer' });
  const attachments = (parsed.attachments || []).map((a, i) => {
    const content = new Uint8Array(a.content);
    return {
      name: a.filename || `attachment-${i + 1}${a.mimeType === 'message/rfc822' ? '.eml' : ''}`,
      mimeType: a.mimeType || guessMime(a.filename),
      size: content.length,
      contentId: a.contentId ? a.contentId.replace(/^<|>$/g, '') : '',
      inline: a.disposition === 'inline' || !!a.related,
      getData: async () => content,
    };
  });
  return {
    source: 'eml',
    folder: meta.folder || '',
    subject: parsed.subject || '',
    from: normAddr(parsed.from) || null,
    to: normList(parsed.to),
    cc: normList(parsed.cc),
    bcc: normList(parsed.bcc),
    date: isoDate(parsed.date),
    messageId: parsed.messageId || '',
    headers: rawHeaderBlock(bytes),
    text: parsed.text || '',
    html: parsed.html || '',
    attachments,
    raw: bytes,
    size: bytes.length,
  };
}
