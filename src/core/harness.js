// Harness layer: wraps every parser with format detection, size gating, timing,
// error classification and an in-memory event log. Parsers stay free of these concerns.
// Nothing here talks to the network: the log lives only in this page/session.
import { parseEml } from './eml.js';
import { parseMsg } from './msg.js';
import { parseTnef, isTnef } from './tnef.js';
import { parsePst } from './pst.js';
import { parseOlm } from './olm.js';
import { parseMbox } from './mbox.js';
import { buildEml } from './export.js';
import { toU8 } from './util.js';

export const FORMATS = {
  eml: { label: 'EML message', kind: 'single' },
  msg: { label: 'MSG item', kind: 'single' },
  tnef: { label: 'TNEF / winmail.dat', kind: 'single' },
  pst: { label: 'PST / OST archive', kind: 'archive' },
  olm: { label: 'OLM archive', kind: 'archive' },
  mbox: { label: 'MBOX mailbox', kind: 'archive' },
};

export function detectFormat(bytes, name = '') {
  const b = toU8(bytes);
  const ext = String(name).toLowerCase().split('.').pop();
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'msg';
  if (isTnef(b)) return 'tnef';
  if (b.length >= 4 && b[0] === 0x21 && b[1] === 0x42 && b[2] === 0x44 && b[3] === 0x4e) return 'pst';
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5)) return 'olm';
  if (b.length >= 5 && String.fromCharCode(...b.subarray(0, 5)) === 'From ') return 'mbox';
  const head = new TextDecoder('latin1').decode(b.subarray(0, 4096));
  if (/^[\x20-\x7e]+:\s/m.test(head) && /^(from|to|subject|date|received|return-path|message-id|mime-version):/im.test(head)) return 'eml';
  if (ext === 'eml' || ext === 'mht' || ext === 'txt') return 'eml';
  return null;
}

export class ParseError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}

function classify(err, format) {
  const m = String(err?.message || err);
  if (/encrypted/i.test(m)) return new ParseError('encrypted', 'This file is encrypted or password-protected, which is not supported.', err);
  if (/Invalid file header|Unrecognised PST/i.test(m)) return new ParseError('unsupported-version', 'This PST/OST version is not recognised.', err);
  if (/truncated|out of range|offset|RangeError/i.test(m)) return new ParseError('truncated', 'The file looks truncated or damaged.', err);
  return new ParseError('parse-failed', `Could not read this ${format ? FORMATS[format]?.label || format : 'file'}: ${m}`, err);
}

/**
 * Create a harness instance. Options:
 *  - maxBytes: refuse files larger than this (device capability gate)
 *  - archiveLimit: cap number of messages loaded from archives (free-tier hook)
 *  - onEvent(evt): observer for monitoring (UI status line, tests)
 */
export function createHarness(options = {}) {
  const log = [];
  const cfg = { maxBytes: 4 * 1024 ** 3, archiveLimit: Infinity, ...options };
  const emit = (evt) => {
    const e = { t: Date.now(), ...evt };
    log.push(e);
    if (log.length > 500) log.shift();
    cfg.onEvent?.(e);
  };

  async function open(input, name = 'file', hooks = {}) {
    const bytes = toU8(input);
    if (bytes.length > cfg.maxBytes) {
      const err = new ParseError('too-large', `This file is ${(bytes.length / 1024 ** 3).toFixed(1)} GB; this device/browser limit is ${(cfg.maxBytes / 1024 ** 3).toFixed(1)} GB.`);
      emit({ type: 'rejected', name, code: err.code });
      throw err;
    }
    const format = hooks.format || detectFormat(bytes, name);
    if (!format) {
      const err = new ParseError('unknown-format', 'Unrecognised file. Supported: .msg, .eml, winmail.dat, .pst, .ost, .olm, .mbox');
      emit({ type: 'rejected', name, code: err.code });
      throw err;
    }
    const started = performance.now();
    emit({ type: 'start', name, format, size: bytes.length });
    try {
      let result;
      const progress = (n) => { emit({ type: 'progress', name, count: n }); hooks.onProgress?.(n); };
      if (FORMATS[format].kind === 'single') {
        let msg;
        if (format === 'eml') msg = await parseEml(bytes, { folder: name });
        else if (format === 'msg') msg = parseMsg(bytes, { folder: name });
        else msg = parseTnef(bytes, { folder: name });
        msg.folder = name;
        result = { format, kind: 'single', folders: [{ path: name, messages: [msg] }], count: 1, truncated: false };
      } else {
        const opts = { limit: cfg.archiveLimit, onProgress: progress, toEml: buildEml, folder: name };
        const r = format === 'pst' ? await parsePst(bytes, opts) : format === 'olm' ? await parseOlm(bytes, opts) : await parseMbox(bytes, opts);
        result = { ...r, format: r.format || format, kind: 'archive' };
      }
      result.name = name;
      result.size = bytes.length;
      result.ms = Math.round(performance.now() - started);
      emit({ type: 'done', name, format, count: result.count, ms: result.ms });
      return result;
    } catch (err) {
      const e = err instanceof ParseError ? err : classify(err, format);
      emit({ type: 'error', name, format, code: e.code, message: e.message });
      throw e;
    }
  }

  return { open, log, config: cfg };
}

/** Rough per-device recommendation for the largest file to open in this tab. */
export function deviceLimitBytes(nav = globalThis.navigator) {
  const mem = nav?.deviceMemory; // GB, Chromium only
  const ua = nav?.userAgent || '';
  const mobile = /iPhone|iPad|Android/i.test(ua);
  if (mobile) return 512 * 1024 ** 2;
  if (mem && mem <= 4) return 1024 ** 3;
  return 2 * 1024 ** 3;
}
