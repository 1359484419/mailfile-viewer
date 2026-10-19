// Browser UI. All parsing happens in this tab through the harness; no network calls.
import { createHarness, deviceLimitBytes } from '../core/harness.js';
import { buildEml, buildMbox, buildCsv, buildContactsCsv, buildEmlZip, buildAttachmentZip, emlFileName } from '../core/export.js';
import { escapeHtml, formatAddress, formatAddressList, formatBytes, htmlToText, safeFileName } from '../core/util.js';
import { makeT } from './i18n.js';

const lang = document.documentElement.lang?.slice(0, 2) || 'en';
const t = makeT(lang);
const ISSUES_URL = 'https://github.com/1359484419/mailfile-viewer/issues/new?labels=parse-failure&title=';

const state = {
  sources: [], // { id, name, result }
  current: null, // { sourceId, folderPath|null }
  selected: null, // message
  query: '',
  searchBodies: false,
  shown: 300,
  remoteImages: false,
  tab: 'message',
};

const statusLog = [];
const harness = createHarness({
  maxBytes: Math.max(deviceLimitBytes(), 64 * 1024 ** 2),
  onEvent: (e) => {
    statusLog.push(e);
    if (e.type === 'progress') setStatus(`${t('reading')} ${e.name}: ${e.count} ${t('messages')}`);
  },
});
window.__mfv = { harness, state, statusLog }; // exposed for automated tests and debugging

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};

function setStatus(msg, kind = '') {
  const s = $('#mfv-status');
  if (!s) return;
  s.textContent = msg;
  s.dataset.kind = kind;
}

function saveBlob(bytes, name, type = 'application/octet-stream') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ---------- layout ---------- */

function mount() {
  const root = $('#app');
  if (!root) return;
  root.innerHTML = '';
  const input = el('input', { type: 'file', id: 'mfv-input', multiple: true, accept: '.msg,.eml,.dat,.tnef,.pst,.ost,.olm,.mbox,.mbx,.zip,application/vnd.ms-outlook,message/rfc822', class: 'visually-hidden' });
  input.addEventListener('change', () => { openFiles([...input.files]); input.value = ''; });
  const drop = el('label', { class: 'dropzone', for: 'mfv-input', id: 'mfv-drop' },
    el('strong', {}, t('drop')), el('span', { class: 'drop-or' }, t('or')), el('span', { class: 'btn btn-primary' }, t('choose')),
    el('small', {}, t('dropHint')));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => openFiles([...e.dataTransfer.files]));
  root.append(input, drop, el('div', { id: 'mfv-status', role: 'status', 'aria-live': 'polite' }), el('div', { id: 'mfv-error' }), el('div', { id: 'mfv-work', hidden: true }));
}

async function openFiles(files) {
  for (const f of files) {
    setStatus(`${t('reading')} ${f.name}…`);
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      await openBytes(buf, f.name);
    } catch (e) {
      showError(f.name, e);
    }
  }
}

async function openBytes(bytes, name) {
  $('#mfv-error').innerHTML = '';
  const result = await harness.open(bytes, name);
  const src = { id: `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`, name, result };
  state.sources.push(src);
  const withMail = result.folders.filter((f) => f.messages.length);
  const firstWithMail = withMail.find((f) => /(^|\/)(inbox|posteingang|受信トレイ)$/i.test(f.path))
    || withMail.slice().sort((a, b) => b.messages.length - a.messages.length)[0] || result.folders[0];
  state.current = { sourceId: src.id, folderPath: result.kind === 'single' ? null : firstWithMail?.path ?? null };
  state.selected = result.kind === 'single' ? result.folders[0].messages[0] : null;
  state.shown = 300;
  let msg = `${t('loaded')} ${name}: ${result.count} ${t('messages')} (${result.ms} ms)`;
  if (result.truncated) msg += ' ' + t('truncated', { n: result.count });
  setStatus(msg, 'ok');
  render();
}

function showError(name, e) {
  setStatus('');
  const box = $('#mfv-error');
  const title = encodeURIComponent(`Cannot open ${name.split('.').pop()} file: ${e.code || 'error'}`);
  const body = encodeURIComponent(`Format: ${name.split('.').pop()}\nError code: ${e.code || ''}\nMessage: ${e.message}\nBrowser: ${navigator.userAgent}\n\n(Please do not attach private emails.)`);
  box.innerHTML = '';
  box.append(el('div', { class: 'alert' },
    el('strong', {}, `${t('errTitle')}: ${name}`), el('p', {}, e.message),
    el('a', { href: `${ISSUES_URL}${title}&body=${body}`, target: '_blank', rel: 'noopener' }, t('report'))));
}

/* ---------- message collections ---------- */

function currentSource() {
  return state.sources.find((s) => s.id === state.current?.sourceId) || null;
}

function allMessages() {
  return state.sources.flatMap((s) => s.result.folders.flatMap((f) => f.messages));
}

function folderMessages() {
  const src = currentSource();
  if (!src) return [];
  if (state.current.folderPath == null) return src.result.folders.flatMap((f) => f.messages);
  return src.result.folders.find((f) => f.path === state.current.folderPath)?.messages || [];
}

function matches(m, q) {
  if (!q) return true;
  const hay = [m.subject, formatAddress(m.from), formatAddressList(m.to), formatAddressList(m.cc)].join(' ').toLowerCase();
  if (hay.includes(q)) return true;
  if (state.searchBodies) {
    try { return (m.text || htmlToText(m.html) || '').toLowerCase().includes(q); } catch { return false; }
  }
  return false;
}

function visibleMessages() {
  const q = state.query.trim().toLowerCase();
  const list = q ? allMessages().filter((m) => matches(m, q)) : folderMessages();
  return list;
}

/* ---------- render ---------- */

function render() {
  const work = $('#mfv-work');
  if (!state.sources.length) { work.hidden = true; return; }
  work.hidden = false;
  work.innerHTML = '';
  const single = state.sources.length === 1 && state.sources[0].result.kind === 'single';
  work.className = single ? 'work single' : 'work';
  work.append(renderToolbar());
  const panes = el('div', { class: 'panes' });
  if (!single) panes.append(renderFolders(), renderList());
  panes.append(renderReader());
  work.append(panes);
  if (state.selected) fillBody();
}

function renderToolbar() {
  const search = el('input', { type: 'search', id: 'mfv-search', placeholder: t('search'), value: state.query, 'aria-label': t('search') });
  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.query = search.value; state.shown = 300; rerenderList(); }, 200);
  });
  const bodies = el('label', { class: 'check' }, el('input', { type: 'checkbox', id: 'mfv-bodies', checked: state.searchBodies || false, onchange: (e) => { state.searchBodies = e.target.checked; rerenderList(); } }), t('searchBodies'));
  const scope = el('select', { id: 'mfv-scope', 'aria-label': t('exportScope') },
    el('option', { value: 'folder' }, t('scopeFolder')), el('option', { value: 'all' }, t('scopeAll')), el('option', { value: 'selected' }, t('scopeSelected')));
  const fmt = el('select', { id: 'mfv-format', 'aria-label': t('exportAs') },
    el('option', { value: 'eml' }, t('expEml')), el('option', { value: 'mbox' }, t('expMbox')), el('option', { value: 'csv' }, t('expCsv')),
    el('option', { value: 'contacts' }, t('expContacts')), el('option', { value: 'att' }, t('expAtt')), el('option', { value: 'pdf' }, t('expPdf')));
  const go = el('button', { class: 'btn btn-primary', id: 'mfv-export', onclick: () => doExport(fmt.value, scope.value) }, t('exportAs'));
  const clear = el('button', { class: 'btn', onclick: () => { state.sources = []; state.selected = null; state.current = null; setStatus(''); render(); } }, t('clearAll'));
  return el('div', { class: 'toolbar' }, el('div', { class: 'tb-search' }, search, bodies), el('div', { class: 'tb-export' }, scope, fmt, go, clear));
}

function renderFolders() {
  const nav = el('nav', { class: 'folders', 'aria-label': t('folders') });
  for (const src of state.sources) {
    const head = el('div', { class: 'src-head' }, el('span', { class: 'src-name', title: src.name }, src.name),
      el('button', { class: 'icon-btn', title: t('close'), 'aria-label': t('close'), onclick: () => removeSource(src.id) }, '×'));
    nav.append(head);
    const ul = el('ul');
    const folders = src.result.kind === 'single' ? [{ path: null, label: src.result.format.toUpperCase(), count: 1 }]
      : src.result.folders.filter((f) => f.messages.length).map((f) => ({ path: f.path, label: shortFolder(f.path), count: f.messages.length }));
    for (const f of folders) {
      const active = state.current?.sourceId === src.id && state.current.folderPath === f.path && !state.query;
      ul.append(el('li', {}, el('button', {
        class: 'folder' + (active ? ' active' : ''), title: f.path || '',
        onclick: () => { state.current = { sourceId: src.id, folderPath: f.path }; state.query = ''; state.shown = 300; render(); },
      }, el('span', {}, f.label), el('span', { class: 'count' }, f.count))));
    }
    nav.append(ul);
  }
  return nav;
}

function shortFolder(p) {
  const parts = String(p || '').split('/').filter(Boolean);
  const trimmed = parts.length > 1 && /^(top of |root|personal folders|オフライン|persönliche)/i.test(parts[0]) ? parts.slice(1) : parts;
  return trimmed.slice(-2).join(' / ') || p;
}

function removeSource(id) {
  state.sources = state.sources.filter((s) => s.id !== id);
  if (state.current?.sourceId === id) {
    const s = state.sources[0];
    state.current = s ? { sourceId: s.id, folderPath: s.result.kind === 'single' ? null : s.result.folders.find((f) => f.messages.length)?.path ?? null } : null;
    state.selected = null;
  }
  render();
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(lang, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderList() {
  const wrap = el('section', { class: 'list', id: 'mfv-list' });
  fillList(wrap);
  return wrap;
}

function rerenderList() {
  const wrap = $('#mfv-list');
  if (wrap) { wrap.innerHTML = ''; fillList(wrap); }
}

function fillList(wrap) {
  const msgs = visibleMessages().slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!msgs.length) { wrap.append(el('p', { class: 'muted pad' }, t('empty'))); return; }
  const ul = el('ul', { class: 'msgs' });
  for (const m of msgs.slice(0, state.shown)) {
    const attN = m.attachmentCount ?? m.attachments?.length ?? 0;
    ul.append(el('li', {}, el('button', {
      class: 'msg' + (state.selected === m ? ' active' : ''),
      onclick: () => { state.selected = m; state.tab = 'message'; render(); if (window.matchMedia('(max-width: 760px)').matches) $('#mfv-reader')?.scrollIntoView(); },
    },
    el('span', { class: 'm-from' }, m.from?.name || m.from?.address || '—'),
    el('span', { class: 'm-date' }, fmtDate(m.date)),
    el('span', { class: 'm-subj' }, (attN ? '📎 ' : '') + (m.subject || t('noSubject'))))));
  }
  wrap.append(ul);
  if (msgs.length > state.shown) wrap.append(el('button', { class: 'btn more', onclick: () => { state.shown += 500; rerenderList(); } }, `${t('showMore')} (${msgs.length - state.shown})`));
}

function renderReader() {
  const box = el('article', { class: 'reader', id: 'mfv-reader' });
  const m = state.selected;
  if (!m) { box.append(el('p', { class: 'muted pad' }, t('selectMessage'))); return box; }
  const meta = el('dl', { class: 'meta' });
  const row = (k, v) => v && meta.append(el('dt', {}, k), el('dd', {}, v));
  row(t('from'), formatAddress(m.from));
  row(t('to'), formatAddressList(m.to));
  row(t('cc'), formatAddressList(m.cc));
  row(t('date'), m.date ? new Date(m.date).toLocaleString(lang) : '');
  const actions = el('div', { class: 'actions' },
    el('button', { class: 'btn', id: 'mfv-save-eml', onclick: async () => saveBlob(await buildEml(m), emlFileName(m, 0).replace(/^\d+ /, ''), 'message/rfc822') }, t('saveEml')),
    el('button', { class: 'btn', id: 'mfv-print', onclick: () => printMessages([m]) }, t('printPdf')));
  const tabs = el('div', { class: 'tabs', role: 'tablist' }, ...['message', 'text', 'headers'].map((k) => el('button', {
    role: 'tab', 'aria-selected': state.tab === k ? 'true' : 'false', class: 'tab', 'data-tab': k,
    onclick: () => { state.tab = k; render(); },
  }, t(k === 'message' ? 'tabMessage' : k === 'text' ? 'tabText' : 'tabHeaders'))));
  box.append(el('h2', { class: 'subject' }, m.subject || t('noSubject')), meta, actions, renderAttachments(m), tabs, el('div', { id: 'mfv-body', class: 'body' }));
  return box;
}

function canOpenInline(a) {
  return /\.(msg|eml|dat|tnef)$/i.test(a.name) || a.mimeType === 'message/rfc822' || a.mimeType === 'application/ms-tnef' || a.mimeType === 'application/vnd.ms-tnef';
}

function renderAttachments(m) {
  const atts = m.attachments || [];
  if (!atts.length) return el('div');
  const ul = el('ul', { class: 'atts', 'aria-label': t('attachments') });
  for (const a of atts) {
    const li = el('li', { class: 'att' }, el('span', { class: 'att-name', title: a.name }, a.name), el('span', { class: 'muted' }, formatBytes(a.size)),
      el('button', { class: 'btn btn-sm', onclick: async () => saveBlob(await a.getData(), safeFileName(a.name), a.mimeType) }, t('download')));
    if (canOpenInline(a)) {
      li.append(el('button', { class: 'btn btn-sm', onclick: async () => {
        try { await openBytes(await a.getData(), a.name); } catch (e) { showError(a.name, e); }
      } }, t('open')));
    }
    ul.append(li);
  }
  return el('div', {}, el('h3', { class: 'h-small' }, `${t('attachments')} (${atts.length})`), ul);
}

function bytesToDataUri(bytes, type) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${type || 'application/octet-stream'};base64,${btoa(s)}`;
}

async function inlineCidImages(html, m) {
  if (!/cid:/i.test(html)) return html;
  for (const a of m.attachments || []) {
    const keys = [a.contentId, a.name].filter(Boolean);
    for (const k of keys) {
      const needle = `cid:${k}`;
      if (html.includes(needle)) {
        if (a.size > 5 * 1024 * 1024) continue;
        const uri = bytesToDataUri(await a.getData(), a.mimeType);
        html = html.split(needle).join(uri);
      }
    }
  }
  return html;
}

function cspFor(remote) {
  const img = remote ? "data: https: http:" : 'data:';
  return `default-src 'none'; img-src ${img}; style-src 'unsafe-inline' ${remote ? 'https: http:' : ''}; font-src data:; script-src 'none'; form-action 'none'; frame-src 'none'`;
}

function stripActive(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<(iframe|object|embed|form)[\s\S]*?(<\/\1>|\/?>)/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

async function messageDocument(m, { remote = false, forPrint = false } = {}) {
  let content = m.html ? await inlineCidImages(stripActive(m.html), m) : `<pre class="mfv-plain">${escapeHtml(m.text || '')}</pre>`;
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${cspFor(remote)}"><base target="_blank">
<style>body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;margin:${forPrint ? 0 : 12}px;color:#111;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}pre.mfv-plain{white-space:pre-wrap;font:inherit}table{max-width:100%}</style>`;
  return `<!doctype html><html><head>${head}</head><body>${content}</body></html>`;
}

async function fillBody() {
  const m = state.selected;
  const body = $('#mfv-body');
  if (!body || !m) return;
  body.innerHTML = '';
  if (state.tab === 'headers') {
    body.append(el('pre', { class: 'headers' }, m.headers || t('noHeaders')));
    return;
  }
  if (state.tab === 'text') {
    body.append(el('pre', { class: 'plain' }, m.text || htmlToText(m.html)));
    return;
  }
  const hasRemote = /<img[^>]+src=["']?https?:/i.test(m.html || '') || /url\(\s*['"]?https?:/i.test(m.html || '');
  if (hasRemote && !state.remoteImages) {
    body.append(el('div', { class: 'notice' }, t('remoteBlocked'), ' ',
      el('button', { class: 'btn btn-sm', onclick: () => { state.remoteImages = true; fillBody(); } }, t('remoteImages'))));
  }
  const frame = el('iframe', { class: 'msg-frame', title: m.subject || 'message', sandbox: 'allow-popups allow-popups-to-escape-sandbox', referrerpolicy: 'no-referrer' });
  body.append(frame);
  frame.srcdoc = await messageDocument(m, { remote: state.remoteImages });
  frame.addEventListener('load', () => {
    // height can only be measured when same-origin; fall back to a tall frame
    frame.style.height = Math.max(400, Math.min(window.innerHeight * 1.5, 2400)) + 'px';
  });
}

/* ---------- printing (PDF via the browser print dialog) ---------- */

export async function printDocumentHtml(messages) {
  const parts = [];
  for (const m of messages.slice(0, 500)) {
    const html = m.html ? await inlineCidImages(stripActive(m.html), m) : `<pre class="plain">${escapeHtml(m.text || '')}</pre>`;
    const bodyOnly = html.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '');
    const atts = (m.attachments || []).map((a) => escapeHtml(a.name)).join(', ');
    parts.push(`<section class="pm"><h1>${escapeHtml(m.subject || t('noSubject'))}</h1><table class="ph">
<tr><th>${t('from')}</th><td>${escapeHtml(formatAddress(m.from))}</td></tr>
<tr><th>${t('to')}</th><td>${escapeHtml(formatAddressList(m.to))}</td></tr>
${m.cc?.length ? `<tr><th>${t('cc')}</th><td>${escapeHtml(formatAddressList(m.cc))}</td></tr>` : ''}
<tr><th>${t('date')}</th><td>${m.date ? escapeHtml(new Date(m.date).toLocaleString(lang)) : ''}</td></tr>
${atts ? `<tr><th>${t('attachments')}</th><td>${atts}</td></tr>` : ''}</table><div class="pb">${bodyOnly}</div></section>`);
  }
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${cspFor(false)}"><title>${escapeHtml(messages[0]?.subject || 'Email')}</title>
<style>body{font:12pt/1.45 -apple-system,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;color:#000;margin:0}.pm{page-break-after:always;padding:0 0 12pt}.pm:last-child{page-break-after:auto}
h1{font-size:16pt;margin:0 0 8pt}.ph{border-collapse:collapse;margin-bottom:10pt;font-size:10pt}.ph th{text-align:left;padding:2pt 10pt 2pt 0;color:#444;vertical-align:top}.ph td{padding:2pt 0}
.pb{border-top:1px solid #999;padding-top:10pt}img{max-width:100%}pre.plain{white-space:pre-wrap;font:inherit}@page{margin:16mm}</style></head><body>${parts.join('\n')}</body></html>`;
}

async function printMessages(messages) {
  setStatus(t('working'));
  const html = await printDocumentHtml(messages);
  let frame = $('#mfv-print-frame');
  if (frame) frame.remove();
  frame = el('iframe', { id: 'mfv-print-frame', sandbox: 'allow-same-origin allow-modals', 'aria-hidden': 'true', tabindex: '-1' });
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.append(frame);
  frame.addEventListener('load', () => {
    setStatus('');
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* print blocked */ }
  }, { once: true });
  frame.srcdoc = html;
}

/* ---------- export ---------- */

async function doExport(format, scope) {
  const msgs = scope === 'selected' ? (state.selected ? [state.selected] : []) : scope === 'all' ? allMessages() : visibleMessages();
  if (!msgs.length) { setStatus(t('empty')); return; }
  const base = safeFileName((currentSource()?.name || 'mail').replace(/\.[^.]+$/, ''));
  const progress = (i) => { if (i % 50 === 0) setStatus(`${t('working')} ${i}/${msgs.length}`); };
  setStatus(t('working'));
  try {
    if (format === 'eml') {
      if (msgs.length === 1) saveBlob(await buildEml(msgs[0]), emlFileName(msgs[0], 0).replace(/^\d+ /, ''), 'message/rfc822');
      else saveBlob(await buildEmlZip(msgs, progress), `${base}-eml.zip`, 'application/zip');
    } else if (format === 'mbox') saveBlob(await buildMbox(msgs, progress), `${base}.mbox`, 'application/mbox');
    else if (format === 'csv') saveBlob(buildCsv(msgs), `${base}-messages.csv`, 'text/csv');
    else if (format === 'contacts') saveBlob(buildContactsCsv(msgs), `${base}-contacts.csv`, 'text/csv');
    else if (format === 'att') saveBlob(await buildAttachmentZip(msgs, progress), `${base}-attachments.zip`, 'application/zip');
    else if (format === 'pdf') { await printMessages(msgs); return; }
    setStatus(t('exportedN', { n: msgs.length }), 'ok');
  } catch (e) {
    setStatus(`${t('errTitle')}: ${e.message}`, 'err');
  }
}

mount();
