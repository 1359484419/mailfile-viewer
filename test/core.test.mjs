// Core parser + exporter tests against real open-source sample files.
// Samples: SAMPLES_DIR (default ../../samples-c23), see README "Tests". Outputs go to test-output/
// and are re-checked independently by test/verify_exports.py (Python stdlib email/mailbox/csv/zipfile,
// plus tnefparse and extract-msg as reference parsers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHarness, detectFormat } from '../src/core/harness.js';
import { buildEml, buildMbox, buildCsv, buildContactsCsv, buildEmlZip, buildAttachmentZip, encodeWord } from '../src/core/export.js';
import { parseMbox } from '../src/core/mbox.js';
import { rtfToContent } from '../src/core/rtf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = path.resolve(root, process.env.SAMPLES_DIR || '../../samples-c23');
const OUT = path.join(root, 'test-output');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'eml'), { recursive: true });

const h = createHarness();
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const manifest = { messages: [], mbox: null, csv: null, contacts: null, emlZip: null, attZip: null, sources: {} };
const list = (dir) => fs.readdirSync(path.join(SAMPLES, dir)).filter((f) => !f.startsWith('.')).sort().map((f) => path.join(SAMPLES, dir, f));
const read = (p) => new Uint8Array(fs.readFileSync(p));
const msgs = (r) => r.folders.flatMap((f) => f.messages);

let emlCounter = 0;
async function exportAndRecord(m, sourceFile) {
  const eml = await buildEml(m, { preferRaw: false });
  const file = `${String(emlCounter++).padStart(4, '0')}.eml`;
  fs.writeFileSync(path.join(OUT, 'eml', file), eml);
  const atts = [];
  for (const a of m.attachments || []) {
    const d = await a.getData();
    atts.push({ name: a.name, size: d.length, sha256: sha(d), cid: a.contentId || '', message: /^message\//i.test(a.mimeType || '') });
  }
  manifest.messages.push({
    file, source: path.relative(SAMPLES, sourceFile), format: m.source, subject: m.subject || '', from: m.from?.address || '',
    to: (m.to || []).map((x) => x.address).filter(Boolean), date: m.date, hasHtml: !!m.html,
    textSnippet: (m.text || '').replace(/\s+/g, ' ').trim().slice(0, 40), attachments: atts,
  });
  return eml;
}

test('format detection by magic bytes', () => {
  assert.equal(detectFormat(read(path.join(SAMPLES, 'msg/multi-to.msg')), 'x'), 'msg');
  assert.equal(detectFormat(read(path.join(SAMPLES, 'tnef/one-file.tnef')), 'x'), 'tnef');
  assert.equal(detectFormat(read(path.join(SAMPLES, 'pst/enron.pst')), 'x'), 'pst');
  assert.equal(detectFormat(read(path.join(SAMPLES, 'pst/test.ost')), 'x'), 'pst');
  assert.equal(detectFormat(read(path.join(SAMPLES, 'generated/sample.olm')), 'x.olm'), 'olm');
  assert.equal(detectFormat(read(path.join(SAMPLES, 'generated/sample.mbox')), 'x'), 'mbox');
  assert.equal(detectFormat(read(path.join(SAMPLES, 'eml/bounce.eml')), 'x'), 'eml');
  assert.equal(detectFormat(new TextEncoder().encode('hello world'), 'x.bin'), null);
});

test('EML samples parse', async () => {
  for (const f of list('eml')) {
    const r = await h.open(read(f), path.basename(f));
    assert.equal(r.count, 1);
    await exportAndRecord(msgs(r)[0], f);
  }
  const cal = msgs(await h.open(read(path.join(SAMPLES, 'eml/calendar-event.eml')), 'c.eml'))[0];
  assert.match(cal.subject, /Invitation: Test event/);
  assert.ok(cal.attachments.some((a) => a.name === 'invite.ics'));
  const torture = msgs(await h.open(read(path.join(SAMPLES, 'eml/mimetorture.eml')), 't.eml'))[0];
  assert.ok(torture.attachments.length >= 8, 'mime torture attachments');
});

test('MSG samples parse (fields match extract-msg reference values)', async () => {
  for (const f of list('msg')) {
    const r = await h.open(read(f), path.basename(f));
    await exportAndRecord(msgs(r)[0], f);
  }
  const m = msgs(await h.open(read(path.join(SAMPLES, 'msg/multi-to.msg')), 'a.msg'))[0];
  assert.equal(m.subject, 'Test: multiple To recipients');
  assert.equal(m.from.address, 'bob@example.com');
  assert.equal(m.date, '2021-05-28T12:08:21.000Z'); // extract-msg: 2021-05-28 05:08:21 PDT
  assert.ok(m.to.some((x) => x.address === 'alice@example.com'));
  const u = msgs(await h.open(read(path.join(SAMPLES, 'msg/unicode.msg')), 'u.msg'))[0];
  assert.deepEqual(u.attachments.map((a) => a.name), ['import OleFileIO.tif', 'raised value error.tif']);
  const rtf = msgs(await h.open(read(path.join(SAMPLES, 'msg/RtfSampleEmail.msg')), 'r.msg'))[0];
  assert.ok(rtf.text.length > 1000);
  const two = msgs(await h.open(read(path.join(SAMPLES, 'msg/EmailWith2Attachments.msg')), 'e.msg'))[0];
  assert.equal(two.attachments.length, 2);
  assert.ok(two.html.length > 100);
});

test('TNEF (winmail.dat) samples parse', async () => {
  for (const f of list('tnef')) {
    const r = await h.open(read(f), path.basename(f));
    const m = msgs(r)[0];
    manifest.sources[path.relative(SAMPLES, f)] = { attachments: await Promise.all(m.attachments.map(async (a) => ({ name: a.name, size: (await a.getData()).length }))) };
    await exportAndRecord(m, f);
  }
  const two = msgs(await h.open(read(path.join(SAMPLES, 'tnef/two-files.tnef')), 'winmail.dat'))[0];
  assert.deepEqual(two.attachments.map((a) => [a.name, a.size]), [['AUTHORS', 244], ['README', 893]]);
  assert.equal(two.subject, 'two files');
  const um = msgs(await h.open(read(path.join(SAMPLES, 'tnef/umlaut.tnef')), 'winmail.dat'))[0];
  assert.ok(um.attachments.some((a) => a.name === 'UmlautAnhang-äüö.txt'));
  assert.ok(um.html.includes('<'), 'html body recovered');
  const body = msgs(await h.open(read(path.join(SAMPLES, 'tnef/body.tnef')), 'winmail.dat'))[0];
  assert.match(body.html, /Bill of Rights|Congress/i);
  const rtf = msgs(await h.open(read(path.join(SAMPLES, 'tnef/rtf.tnef')), 'winmail.dat'))[0];
  assert.ok(rtf.text.length > 50, 'text from compressed RTF');
  // embedded message: attAttachData is only a placeholder, the real message is a nested TNEF in PR_ATTACH_DATA_OBJ
  const dl = msgs(await h.open(read(path.join(SAMPLES, 'tnef/IPM-DistList.tnef')), 'winmail.dat'))[0];
  const emb = dl.attachments[0];
  assert.ok(emb.embedded && /\.dat$/.test(emb.name), `embedded attachment: ${emb.name}`);
  const inner = await emb.getData();
  assert.equal(new DataView(inner.buffer, inner.byteOffset, 4).getUint32(0, true), 0x223e9f78);
  const innerMsg = msgs(await h.open(inner, emb.name))[0];
  assert.ok(innerMsg, 'nested TNEF opens');
});

test('PST and OST archives parse', async () => {
  const pst = await h.open(read(path.join(SAMPLES, 'pst/enron.pst')), 'enron.pst');
  assert.equal(pst.count, 71);
  assert.equal(pst.format, 'pst-unicode');
  const all = msgs(pst);
  assert.ok(all.some((m) => m.subject === "Power Mart '01 - Register online for your FREE exhibition pass!"));
  const oba = all.find((m) => m.subject === "New OBA's");
  assert.equal(oba.attachments.length, 11);
  assert.equal(oba.attachments[0].name, 'OBA_27602_Citizens.doc');
  const doc = await oba.attachments[0].getData();
  assert.equal(doc.length, 53760);
  assert.deepEqual([...doc.subarray(0, 4)], [0xd0, 0xcf, 0x11, 0xe0]);
  for (const m of all) await exportAndRecord(m, path.join(SAMPLES, 'pst/enron.pst'));

  const ost = await h.open(read(path.join(SAMPLES, 'pst/test.ost')), 'test.ost');
  assert.equal(ost.count, 47);
  assert.equal(ost.format, 'pst-4k');
  const ostMsgs = msgs(ost);
  const od = ostMsgs.find((m) => /OneDrive/.test(m.subject));
  assert.ok(od && od.html.length > 1000, 'OST html body (compressed 4K blocks)');
  for (const m of ostMsgs) await exportAndRecord(m, path.join(SAMPLES, 'pst/test.ost'));

  // archive-level exports, verified by Python afterwards
  const mbox = await buildMbox(all);
  fs.writeFileSync(path.join(OUT, 'enron.mbox'), mbox);
  manifest.mbox = { file: 'enron.mbox', subjects: all.map((m) => m.subject || '') };
  const back = await parseMbox(mbox);
  assert.equal(back.count, all.length, 'mbox round trip count');
  const ws = (x) => (x || '').replace(/\s+/g, ' ').trim(); // postal-mime collapses runs of spaces when unfolding
  assert.deepEqual(msgs(back).map((m) => ws(m.subject)), all.map((m) => ws(m.subject)));

  fs.writeFileSync(path.join(OUT, 'enron.csv'), buildCsv(all));
  manifest.csv = { file: 'enron.csv', rows: all.length, subjects: all.map((m) => m.subject || '') };
  fs.writeFileSync(path.join(OUT, 'enron-contacts.csv'), buildContactsCsv(all));
  manifest.contacts = { file: 'enron-contacts.csv' };
  fs.writeFileSync(path.join(OUT, 'ost-eml.zip'), await buildEmlZip(ostMsgs));
  manifest.emlZip = { file: 'ost-eml.zip', count: ostMsgs.length };
  fs.writeFileSync(path.join(OUT, 'enron-attachments.zip'), await buildAttachmentZip(all));
  const attHashes = [];
  for (const m of all) for (const a of m.attachments) attHashes.push(sha(await a.getData()));
  manifest.attZip = { file: 'enron-attachments.zip', sha256: attHashes };
});

test('OLM archive parses (synthetic fixture)', async () => {
  const r = await h.open(read(path.join(SAMPLES, 'generated/sample.olm')), 'sample.olm');
  assert.equal(r.count, 3);
  const paths = r.folders.map((f) => f.path).sort();
  assert.deepEqual(paths, ['test.user@example.com/Inbox', 'test.user@example.com/Sent Items']);
  const inv = msgs(r).find((m) => m.subject.startsWith('Rechnung'));
  assert.equal(inv.subject, 'Rechnung für März / 請求書');
  assert.equal(inv.from.name, 'Jörg Müller');
  assert.equal(inv.cc[0].name, '山田 太郎');
  assert.equal(inv.attachments[0].name, 'Rechnung-März.pdf');
  const pdf = new TextDecoder().decode(await inv.attachments[0].getData());
  assert.ok(pdf.startsWith('%PDF-1.4'));
  for (const m of msgs(r)) await exportAndRecord(m, path.join(SAMPLES, 'generated/sample.olm'));
});

test('MBOX input parses', async () => {
  const r = await h.open(read(path.join(SAMPLES, 'generated/sample.mbox')), 'sample.mbox');
  assert.equal(r.count, 4);
  assert.ok(msgs(r).some((m) => /MIME Torture/.test(m.subject)));
});

test('harness rejects and classifies bad input', async () => {
  const small = createHarness({ maxBytes: 10 });
  await assert.rejects(small.open(new Uint8Array(100), 'big.pst'), (e) => e.code === 'too-large');
  await assert.rejects(h.open(new TextEncoder().encode('\x00\x01garbage'), 'x.bin'), (e) => e.code === 'unknown-format');
  const broken = read(path.join(SAMPLES, 'pst/enron.pst')).slice(0, 4096);
  await assert.rejects(h.open(broken, 'broken.pst'), (e) => ['truncated', 'parse-failed'].includes(e.code));
  assert.ok(h.log.some((e) => e.type === 'error'));
  assert.ok(h.log.some((e) => e.type === 'done' && e.format === 'pst'));
});

test('RTF de-encapsulation and header encoding helpers', () => {
  const rtf = '{\\rtf1\\ansi\\ansicpg1252\\fromhtml1 {\\*\\htmltag19 <html>}{\\*\\htmltag34 <body>}\\htmlrtf {\\htmlrtf0 Hello \\\'e9t\\\'e9\\par}{\\*\\htmltag42 </body>}{\\*\\htmltag27 </html>}}';
  const c = rtfToContent(new TextEncoder().encode(rtf));
  assert.equal(c.fromHtml, true);
  assert.match(c.html, /<html><body>.*Hello été/s);
  assert.equal(encodeWord('plain'), 'plain');
  assert.match(encodeWord('Grüße'), /^=\?UTF-8\?B\?/);
});

test.after(() => {
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
});
