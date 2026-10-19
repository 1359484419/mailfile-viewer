// TNEF (winmail.dat / ATT00001.dat) parser, written from the public spec [MS-OXTNEF].
import { compressedRtfToContent } from './rtf.js';
import { codepageToLabel, decodeBytes, guessMime, stripNul, toU8, isoDate } from './util.js';

export const TNEF_SIGNATURE = 0x223e9f78;

const LVL_MESSAGE = 1;
const LVL_ATTACHMENT = 2;

// Attribute ids (low 16 bits of the attribute tag)
const ATT = {
  From: 0x8000, Subject: 0x8004, DateSent: 0x8005, DateRecd: 0x8006, MessageId: 0x8009, Body: 0x800c,
  AttachData: 0x800f, AttachTitle: 0x8010, AttachMetaFile: 0x8011, AttachCreateDate: 0x8012,
  AttachRendData: 0x9002, MsgProps: 0x9003, RecipTable: 0x9004, Attachment: 0x9005, OemCodepage: 0x9007,
  MessageClass: 0x8008,
};

// MAPI property ids
const PR = {
  SUBJECT: 0x0037, CLIENT_SUBMIT_TIME: 0x0039, MESSAGE_DELIVERY_TIME: 0x0e06, SENDER_NAME: 0x0c1a,
  SENDER_EMAIL: 0x0c1f, SENDER_SMTP: 0x5d01, SENT_REPR_NAME: 0x0042, SENT_REPR_EMAIL: 0x0065, BODY: 0x1000,
  RTF_COMPRESSED: 0x1009, BODY_HTML: 0x1013, INTERNET_MESSAGE_ID: 0x1035, TRANSPORT_HEADERS: 0x007d,
  DISPLAY_TO: 0x0e04, DISPLAY_CC: 0x0e03, INTERNET_CPID: 0x3fde, MESSAGE_CLASS: 0x001a,
  ATTACH_DATA: 0x3701, ATTACH_FILENAME: 0x3704, ATTACH_LONG_FILENAME: 0x3707, ATTACH_MIME_TAG: 0x370e,
  ATTACH_CONTENT_ID: 0x3712, DISPLAY_NAME: 0x3001, EMAIL_ADDRESS: 0x3003, SMTP_ADDRESS: 0x39fe,
  RECIPIENT_TYPE: 0x0c15, ATTACH_METHOD: 0x3705,
};

const T = {
  SHORT: 0x0002, LONG: 0x0003, FLOAT: 0x0004, DOUBLE: 0x0005, CURRENCY: 0x0006, APPTIME: 0x0007, ERROR: 0x000a,
  BOOLEAN: 0x000b, OBJECT: 0x000d, I8: 0x0014, STRING8: 0x001e, UNICODE: 0x001f, SYSTIME: 0x0040, CLSID: 0x0048,
  BINARY: 0x0102, NULL: 0x0001, UNSPECIFIED: 0x0000, MV: 0x1000,
};

const pad4 = (n) => (n + 3) & ~3;

function filetimeToIso(lo, hi) {
  const ms = (hi * 4294967296 + lo) / 10000 - 11644473600000;
  return isoDate(new Date(ms));
}

class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = 0;
  }
  get left() { return this.b.length - this.p; }
  u8() { return this.b[this.p++]; }
  u16() { const x = this.v.getUint16(this.p, true); this.p += 2; return x; }
  u32() { const x = this.v.getUint32(this.p, true); this.p += 4; return x; }
  bytes(n) {
    if (n > this.left) throw new Error('TNEF: truncated data');
    const x = this.b.subarray(this.p, this.p + n); this.p += n; return x;
  }
}

/** Parse a MAPI property list (attMsgProps / attAttachment / one recipient row). */
export function parseMapiProps(bytes, ansiLabel = 'windows-1252', r = null) {
  r = r || new Reader(bytes);
  const props = new Map();
  const count = r.u32();
  for (let i = 0; i < count && r.left >= 4; i++) {
    const type = r.u16();
    const id = r.u16();
    let name = null;
    if (id >= 0x8000) {
      r.bytes(16); // property set GUID
      const kind = r.u32();
      if (kind === 0) name = r.u32();
      else {
        const len = r.u32();
        name = stripNul(decodeBytes(r.bytes(len), 'utf-16le'));
        r.bytes(pad4(len) - len);
      }
    }
    const base = type & ~T.MV;
    const isMv = (type & T.MV) !== 0;
    const varLen = base === T.STRING8 || base === T.UNICODE || base === T.BINARY || base === T.OBJECT;
    const n = isMv || varLen ? r.u32() : 1;
    const values = [];
    for (let k = 0; k < n; k++) {
      let val;
      switch (base) {
        case T.SHORT: val = r.v.getInt16(r.p, true); r.p += 4; break;
        case T.BOOLEAN: val = r.u16() !== 0; r.p += 2; break;
        case T.LONG: val = r.v.getInt32(r.p, true); r.p += 4; break;
        case T.ERROR: val = r.u32(); break;
        case T.FLOAT: val = r.v.getFloat32(r.p, true); r.p += 4; break;
        case T.DOUBLE: case T.APPTIME: val = r.v.getFloat64(r.p, true); r.p += 8; break;
        case T.CURRENCY: case T.I8: { const lo = r.u32(); const hi = r.u32(); val = hi * 4294967296 + lo; break; }
        case T.SYSTIME: { const lo = r.u32(); const hi = r.u32(); val = filetimeToIso(lo, hi); break; }
        case T.CLSID: val = r.bytes(16); break;
        case T.STRING8: case T.UNICODE: case T.BINARY: case T.OBJECT: {
          const len = r.u32();
          const raw = r.bytes(len);
          r.bytes(Math.min(pad4(len) - len, r.left));
          if (base === T.STRING8) val = stripNul(decodeBytes(raw, ansiLabel));
          else if (base === T.UNICODE) val = stripNul(decodeBytes(raw, 'utf-16le'));
          else val = raw;
          break;
        }
        case T.NULL: case T.UNSPECIFIED: val = null; break;
        default: throw new Error(`TNEF: unsupported MAPI type 0x${type.toString(16)}`);
      }
      values.push(val);
    }
    props.set(name !== null ? `named:${name}` : id, { type, value: isMv ? values : values[0] });
  }
  return props;
}

function pv(props, id) {
  const p = props && props.get(id);
  return p ? p.value : undefined;
}

function parseDate14(bytes) {
  if (bytes.length < 12) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const [y, mo, d, h, mi, s] = [0, 2, 4, 6, 8, 10].map((o) => v.getUint16(o, true));
  if (!y) return null;
  return isoDate(new Date(Date.UTC(y, mo - 1, d, h, mi, s)));
}

function parseTriple(bytes, label) {
  // TRP header: trpid(2) cbgrtrp(2) cch(2) cb(2), then name (cch), then address (cb)
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const cch = v.getUint16(4, true);
    const cb = v.getUint16(6, true);
    const name = stripNul(decodeBytes(bytes.subarray(8, 8 + cch), label));
    const addr = stripNul(decodeBytes(bytes.subarray(8 + pad4(cch) > 8 + cch ? 8 + cch : 8 + cch, 8 + cch + cb), label));
    return { name, address: addr.replace(/^SMTP:/i, '') };
  } catch {
    return null;
  }
}

export function isTnef(bytes) {
  return bytes.length >= 4 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === TNEF_SIGNATURE;
}

export function parseTnef(data, meta = {}) {
  const bytes = toU8(data);
  if (!isTnef(bytes)) throw new Error('Not a TNEF (winmail.dat) file');
  const r = new Reader(bytes);
  r.u32(); // signature
  r.u16(); // legacy key
  let label = 'windows-1252';
  const msg = { attrs: {}, props: null, recipients: [] };
  const atts = [];
  let cur = null;
  const warnings = [];

  while (r.left >= 9) {
    const level = r.u8();
    const tag = r.u32();
    const len = r.u32();
    if (len > r.left) { warnings.push('truncated attribute'); break; }
    const data = r.bytes(len);
    if (r.left >= 2) r.u16(); // checksum (not enforced: many real files have bad sums)
    const id = tag & 0xffff;
    try {
      if (level === LVL_MESSAGE) {
        if (id === ATT.OemCodepage && len >= 4) label = codepageToLabel(new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true));
        else if (id === ATT.MsgProps) msg.props = parseMapiProps(data, label);
        else if (id === ATT.RecipTable) {
          const rr = new Reader(data);
          const rows = rr.u32();
          for (let i = 0; i < rows && rr.left > 0; i++) {
            const p = parseMapiProps(null, label, rr);
            msg.recipients.push(p);
          }
        } else msg.attrs[id] = data;
      } else if (level === LVL_ATTACHMENT) {
        if (id === ATT.AttachRendData) { cur = { attrs: {}, props: null }; atts.push(cur); }
        if (!cur) { cur = { attrs: {}, props: null }; atts.push(cur); }
        if (id === ATT.Attachment) cur.props = parseMapiProps(data, label);
        else cur.attrs[id] = data;
      } else {
        warnings.push(`unknown level ${level}`);
      }
    } catch (e) {
      warnings.push(e.message);
    }
  }

  const p = msg.props;
  const a = msg.attrs;
  const subject = pv(p, PR.SUBJECT) ?? (a[ATT.Subject] ? stripNul(decodeBytes(a[ATT.Subject], label)) : '');
  let from = null;
  const sName = pv(p, PR.SENDER_NAME) || pv(p, PR.SENT_REPR_NAME);
  const sAddr = pv(p, PR.SENDER_SMTP) || pv(p, PR.SENDER_EMAIL) || pv(p, PR.SENT_REPR_EMAIL);
  if (sName || sAddr) from = { name: sName || '', address: sAddr || '' };
  else if (a[ATT.From]) from = parseTriple(a[ATT.From], label);

  const date = pv(p, PR.CLIENT_SUBMIT_TIME) || pv(p, PR.MESSAGE_DELIVERY_TIME)
    || (a[ATT.DateSent] && parseDate14(a[ATT.DateSent])) || (a[ATT.DateRecd] && parseDate14(a[ATT.DateRecd])) || null;

  let text = pv(p, PR.BODY) || (a[ATT.Body] ? stripNul(decodeBytes(a[ATT.Body], label)) : '');
  let html = '';
  const htmlProp = pv(p, PR.BODY_HTML);
  if (htmlProp) {
    if (typeof htmlProp === 'string') html = htmlProp;
    else {
      const cp = pv(p, PR.INTERNET_CPID);
      html = stripNul(decodeBytes(htmlProp, cp ? codepageToLabel(cp) : 'utf-8'));
    }
  }
  let rtfText = '';
  const rtf = pv(p, PR.RTF_COMPRESSED);
  if (!html && rtf && rtf.length) {
    const c = compressedRtfToContent(rtf);
    if (c?.fromHtml) html = c.html;
    else if (c?.text) rtfText = c.text;
  }
  if (!text && rtfText) text = rtfText;

  const recips = { to: [], cc: [], bcc: [] };
  for (const rp of msg.recipients) {
    const t = pv(rp, PR.RECIPIENT_TYPE);
    const entry = { name: pv(rp, PR.DISPLAY_NAME) || '', address: pv(rp, PR.SMTP_ADDRESS) || pv(rp, PR.EMAIL_ADDRESS) || '' };
    (t === 2 ? recips.cc : t === 3 ? recips.bcc : recips.to).push(entry);
  }

  const attachments = atts
    .map((at, i) => {
      const ap = at.props;
      let content = at.attrs[ATT.AttachData];
      const obj = pv(ap, PR.ATTACH_DATA);
      let embedded = false;
      if ((!content || !content.length) && obj && obj.length) {
        const t = ap.get(PR.ATTACH_DATA).type;
        // PT_OBJECT data starts with a 16-byte interface id
        content = t === T.OBJECT ? obj.subarray(16) : obj;
        embedded = t === T.OBJECT && isTnef(content);
      }
      if (!content) return null;
      let name = pv(ap, PR.ATTACH_LONG_FILENAME) || pv(ap, PR.ATTACH_FILENAME)
        || (at.attrs[ATT.AttachTitle] ? stripNul(decodeBytes(at.attrs[ATT.AttachTitle], label)) : '')
        || pv(ap, PR.DISPLAY_NAME) || `attachment-${i + 1}${embedded ? '.dat' : ''}`;
      if (embedded && !/\.(dat|tnef)$/i.test(name)) name += '.dat';
      const data = content;
      return {
        name,
        mimeType: pv(ap, PR.ATTACH_MIME_TAG) || guessMime(name),
        size: data.length,
        contentId: pv(ap, PR.ATTACH_CONTENT_ID) || '',
        inline: false,
        embedded,
        getData: async () => data,
      };
    })
    .filter(Boolean);

  return {
    source: 'tnef',
    folder: meta.folder || '',
    messageClass: pv(p, PR.MESSAGE_CLASS) || (a[ATT.MessageClass] ? stripNul(decodeBytes(a[ATT.MessageClass], label)) : ''),
    subject,
    from,
    to: recips.to.length ? recips.to : [],
    cc: recips.cc,
    bcc: recips.bcc,
    date,
    messageId: pv(p, PR.INTERNET_MESSAGE_ID) || '',
    headers: pv(p, PR.TRANSPORT_HEADERS) || '',
    text,
    html,
    attachments,
    size: bytes.length,
    warnings,
  };
}
