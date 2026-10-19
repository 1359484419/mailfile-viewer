// PST / OST archive reading via pst-extractor (MIT). Messages are exposed with lazy
// getters so large archives only decode bodies and attachments on demand.
import { Buffer } from 'buffer';
import * as pe from 'pst-extractor';
import { rtfToContent } from './rtf.js';
import { guessMime, isoDate, parseAddressString, toU8, yieldToUi, concatBytes } from './util.js';

const { PSTFile } = pe.default && pe.default.PSTFile ? pe.default : pe;

function readStream(stream) {
  if (!stream) return new Uint8Array(0);
  const size = 8176;
  const buf = Buffer.alloc(size);
  const chunks = [];
  let n;
  do {
    n = stream.read(buf);
    if (n > 0) chunks.push(Uint8Array.from(buf.subarray(0, n)));
  } while (n === size);
  return concatBytes(chunks);
}

function recipients(m) {
  const out = { to: [], cc: [], bcc: [] };
  let n = 0;
  try { n = m.numberOfRecipients; } catch { n = 0; }
  for (let i = 0; i < n; i++) {
    let r;
    try { r = m.getRecipient(i); } catch { r = null; }
    if (!r) continue;
    const addr = r.smtpAddress || (/@/.test(r.emailAddress) ? r.emailAddress : '') || r.emailAddress || '';
    const e = { name: r.displayName || '', address: addr };
    (r.recipientType === 2 ? out.cc : r.recipientType === 3 ? out.bcc : out.to).push(e);
  }
  if (!out.to.length && m.displayTo) out.to = parseAddressString(m.displayTo);
  if (!out.cc.length && m.displayCC) out.cc = parseAddressString(m.displayCC);
  return out;
}

function smtpOf(m) {
  let smtp = '';
  try { smtp = m.getStringItem(0x5d01) || (m.senderAddrtype === 'EX' ? m.getStringItem(0x5d02) : ''); } catch { smtp = ''; }
  return smtp || m.senderEmailAddress || '';
}

/** Convert a PSTMessage into the common message model (bodies/attachments lazy). */
export function wrapPstMessage(m, folder, toEml) {
  const rc = recipients(m);
  const msg = {
    source: 'pst',
    folder,
    messageClass: m.messageClass || '',
    subject: m.subject || '',
    from: { name: m.senderName || '', address: smtpOf(m) },
    to: rc.to,
    cc: rc.cc,
    bcc: rc.bcc,
    date: isoDate(m.clientSubmitTime || m.messageDeliveryTime),
    messageId: m.internetMessageId || '',
    attachmentCount: m.numberOfAttachments || 0,
    size: (() => { try { return m.messageSize.toNumber(); } catch { return 0; } })(),
  };
  let body = null;
  const loadBody = () => {
    if (body) return body;
    let html = '';
    let text = '';
    try { html = m.bodyHTML || ''; } catch { html = ''; }
    try { text = m.body || ''; } catch { text = ''; }
    if (!html && !text) {
      try {
        // bodyRTF is already LZFu-decompressed by pst-extractor
        const rtf = m.bodyRTF;
        if (rtf) {
          const c = rtfToContent(Uint8Array.from(rtf, (ch) => ch.charCodeAt(0) & 0xff));
          if (c.fromHtml) html = c.html; else text = c.text || '';
        }
      } catch { /* ignore */ }
    }
    body = { html, text, headers: (() => { try { return m.transportMessageHeaders || ''; } catch { return ''; } })() };
    return body;
  };
  let atts = null;
  Object.defineProperties(msg, {
    html: { enumerable: true, get: () => loadBody().html },
    text: { enumerable: true, get: () => loadBody().text },
    headers: { enumerable: true, get: () => loadBody().headers },
    attachments: {
      enumerable: true,
      get: () => {
        if (atts) return atts;
        atts = [];
        for (let i = 0; i < msg.attachmentCount; i++) {
          let a;
          try { a = m.getAttachment(i); } catch { continue; }
          const embedded = a.attachMethod === 5;
          let name = a.longFilename || a.filename || a.displayName || `attachment-${i + 1}`;
          if (embedded) {
            name = (a.displayName || 'attached message') + '.eml';
          }
          atts.push({
            name,
            mimeType: embedded ? 'message/rfc822' : a.mimeTag || guessMime(name),
            size: a.filesize || a.size || 0,
            contentId: a.contentId || '',
            inline: false,
            embedded,
            getData: async () => {
              if (embedded) {
                const em = a.embeddedPSTMessage;
                if (!em) return new Uint8Array(0);
                return toEml(wrapPstMessage(em, folder, toEml));
              }
              return readStream(a.fileInputStream);
            },
          });
        }
        return atts;
      },
    },
  });
  return msg;
}

/**
 * Open a PST/OST buffer and return { folders: [{path, messages}] }.
 * opts: { limit, onProgress(count), toEml }
 */
export async function parsePst(data, opts = {}) {
  const bytes = toU8(data);
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pst = new PSTFile(buf);
  const folders = [];
  let count = 0;
  const limit = opts.limit ?? Infinity;
  let truncated = false;

  async function walk(folder, path) {
    const entry = { path, messages: [] };
    if (path) folders.push(entry);
    if (folder.contentCount > 0) {
      let child = folder.getNextChild();
      while (child) {
        if (count >= limit) { truncated = true; break; }
        if (typeof child.subject === 'string' && child.messageClass !== undefined) {
          entry.messages.push(wrapPstMessage(child, path, opts.toEml));
          count++;
          if (count % 200 === 0) { opts.onProgress?.(count); await yieldToUi(); }
        }
        child = folder.getNextChild();
      }
    }
    if (folder.hasSubfolders) {
      for (const sub of folder.getSubFolders()) {
        await walk(sub, path ? `${path}/${sub.displayName}` : sub.displayName || 'Folder');
      }
    }
  }
  await walk(pst.getRootFolder(), '');
  opts.onProgress?.(count);
  return {
    format: pst.pstFileType === 23 ? 'pst-unicode' : pst.pstFileType === 36 ? 'pst-4k' : 'pst-ansi',
    encrypted: pst.encryptionType,
    folders: folders.filter((f) => f.messages.length || true),
    truncated,
    count,
  };
}
