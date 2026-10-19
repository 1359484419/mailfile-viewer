// Outlook item (.msg, OLE compound file) parsing via @kenjiuno/msgreader (Apache-2.0).
import * as mr from '@kenjiuno/msgreader';
import { compressedRtfToContent } from './rtf.js';
import { decodeBytes, guessMime, isoDate, parseAddressString, toU8, codepageToLabel } from './util.js';

const MsgReader = mr.default?.default || mr.default || mr.MsgReader;

function headerValue(headers, name) {
  if (!headers) return '';
  const re = new RegExp('^' + name + ':[ \\t]*(.*(?:\\r?\\n[ \\t].*)*)', 'im');
  const m = headers.match(re);
  return m ? m[1].replace(/\r?\n[ \t]+/g, ' ').trim() : '';
}

function buildMessage(reader, fields, meta) {
  const recips = fields.recipients || [];
  const pick = (type) => recips
    .filter((r) => (r.recipType || 'to') === type)
    .map((r) => ({ name: r.name || '', address: r.smtpAddress || r.email || '' }));

  let html = '';
  let text = fields.body || '';
  if (fields.bodyHtml) html = fields.bodyHtml;
  else if (fields.html && fields.html.length) {
    const cp = fields.internetCodepage || fields.messageCodepage;
    const m = decodeBytes(fields.html.subarray(0, 2048), 'latin1').match(/charset=["']?([\w-]+)/i);
    html = decodeBytes(fields.html, m ? m[1] : cp ? codepageToLabel(cp) : 'utf-8');
  }
  if (!html && fields.compressedRtf && fields.compressedRtf.length) {
    const c = compressedRtfToContent(fields.compressedRtf);
    if (c) {
      if (c.fromHtml) html = c.html;
      else if (!text) text = c.text;
      else html = '';
    }
  }

  const headers = fields.headers || '';
  let date = isoDate(fields.clientSubmitTime || fields.messageDeliveryTime || headerValue(headers, 'Date'));

  const attachments = (fields.attachments || []).map((att, i) => {
    let name = att.fileName || att.fileNameShort || att.name || `attachment-${i + 1}`;
    if (att.innerMsgContent) name = (att.name || att.innerMsgContentFields?.subject || `message-${i + 1}`) + '.msg';
    return {
      name,
      mimeType: att.attachMimeTag || guessMime(name),
      size: att.contentLength || 0,
      contentId: att.pidContentId || '',
      inline: !!att.attachmentHidden,
      embedded: !!att.innerMsgContent,
      getData: async () => {
        const a = reader.getAttachment(att);
        return toU8(a.content);
      },
    };
  });

  return {
    source: 'msg',
    folder: meta.folder || '',
    messageClass: fields.messageClass || '',
    subject: fields.subject || '',
    from: {
      name: fields.senderName || '',
      address: fields.senderSmtpAddress || fields.sentRepresentingSmtpAddress || fields.senderEmail || '',
    },
    to: pick('to'),
    cc: pick('cc'),
    bcc: pick('bcc'),
    date,
    messageId: fields.messageId || headerValue(headers, 'Message-ID'),
    headers,
    text,
    html,
    attachments,
    size: meta.size || 0,
  };
}

export function parseMsg(data, meta = {}) {
  const bytes = toU8(data);
  const ab = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
  const reader = new MsgReader(ab);
  const fields = reader.getFileData();
  if (fields.error) throw new Error('MSG: ' + fields.error);
  const msg = buildMessage(reader, fields, { ...meta, size: bytes.length });
  if (!msg.to.length && msg.headers) msg.to = parseAddressString(headerValue(msg.headers, 'To'));
  return msg;
}
