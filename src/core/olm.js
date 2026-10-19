// .olm (Outlook for Mac export) = ZIP container with one XML file per message plus
// attachment files. Element names follow the OPFMessageCopy* schema used in those exports.
import { XMLParser } from 'fast-xml-parser';
import { readZipDirectory } from './zipread.js';
import { decodeBytes, guessMime, isoDate, yieldToUi } from './util.js';

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name) => ['email', 'emailAddress', 'messageAttachment'].includes(name),
});

function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && '#text' in node) return String(node['#text']);
  return '';
}

function addresses(node) {
  if (!node) return [];
  const list = node.emailAddress || [];
  return list.map((a) => ({
    name: a['@OPFContactEmailAddressName'] || '',
    address: a['@OPFContactEmailAddressAddress'] || '',
  }));
}

function folderFromPath(path) {
  const parts = path.split('/');
  const i = parts.findIndex((p) => p === 'com.microsoft.__Messages');
  if (i >= 0) {
    const rest = parts.slice(i + 1, -1).filter((p) => p !== 'com.microsoft.__Attachments');
    const account = i > 1 ? parts[i - 1] : '';
    return [account, ...rest].filter(Boolean).join('/') || 'Messages';
  }
  return parts.slice(0, -1).join('/') || 'Messages';
}

export async function parseOlm(data, opts = {}) {
  const zip = readZipDirectory(data);
  const byName = new Map(zip.entries.map((e) => [e.name, e]));
  const byBase = new Map();
  for (const e of zip.entries) byBase.set(e.name.split('/').pop(), e);
  const folders = new Map();
  let count = 0;
  const limit = opts.limit ?? Infinity;
  let truncated = false;

  const candidates = zip.entries.filter((e) => /\.xml$/i.test(e.name) && /com\.microsoft\.__Messages\//.test(e.name));
  for (const entry of candidates) {
    if (count >= limit) { truncated = true; break; }
    let doc;
    try {
      doc = xml.parse(decodeBytes(zip.read(entry), 'utf-8'));
    } catch {
      continue;
    }
    const emails = doc?.emails?.email || [];
    for (const em of emails) {
      if (count >= limit) { truncated = true; break; }
      const folder = folderFromPath(entry.name);
      const fromList = addresses(em.OPFMessageCopyFromAddresses).concat(addresses(em.OPFMessageCopySenderAddress));
      const attNodes = em.OPFMessageCopyAttachmentList?.messageAttachment || [];
      const attachments = attNodes.map((a, i) => {
        const url = a['@OPFAttachmentURL'] || '';
        const name = a['@OPFAttachmentName'] || url.split('/').pop() || `attachment-${i + 1}`;
        const ze = byName.get(url) || byName.get(url.replace(/^\/+/, '')) || byBase.get(url.split('/').pop());
        return {
          name,
          mimeType: a['@OPFAttachmentContentType'] || guessMime(name),
          size: Number(a['@OPFAttachmentContentFileSize']) || ze?.usize || 0,
          contentId: a['@OPFAttachmentContentID'] || '',
          inline: false,
          missing: !ze,
          getData: async () => (ze ? zip.read(ze) : new Uint8Array(0)),
        };
      });
      const htmlBody = textOf(em.OPFMessageCopyHTMLBody) || '';
      const body = textOf(em.OPFMessageCopyBody) || '';
      const looksHtml = /<\w+[^>]*>/.test(body);
      const msg = {
        source: 'olm',
        folder,
        subject: textOf(em.OPFMessageCopySubject),
        from: fromList[0] || null,
        to: addresses(em.OPFMessageCopyToAddresses),
        cc: addresses(em.OPFMessageCopyCCAddresses),
        bcc: addresses(em.OPFMessageCopyBCCAddresses),
        date: isoDate(textOf(em.OPFMessageCopySentTime) || textOf(em.OPFMessageCopyReceivedTime)),
        messageId: textOf(em.OPFMessageCopyMessageID),
        headers: textOf(em.OPFMessageCopyInternetHeaders) || '',
        html: htmlBody || (looksHtml ? body : ''),
        text: looksHtml ? '' : body,
        attachments,
        size: entry.usize,
      };
      if (!folders.has(folder)) folders.set(folder, { path: folder, messages: [] });
      folders.get(folder).messages.push(msg);
      count++;
      if (count % 200 === 0) { opts.onProgress?.(count); await yieldToUi(); }
    }
  }
  opts.onProgress?.(count);
  return { format: 'olm', folders: [...folders.values()], truncated, count };
}
