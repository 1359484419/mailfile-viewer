// End-to-end test of the built site (docs/) in a real Chrome via Playwright.
// Uses the locally installed Google Chrome (channel "chrome"); set PW_CHANNEL="" to use Playwright's Chromium.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(root, 'docs');
const SAMPLES = path.resolve(root, process.env.SAMPLES_DIR || '../../samples-c23');
const OUT = path.join(root, 'test-output', 'e2e');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/mailfile-viewer/, '');
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DOCS, path.normalize(p));
  if (!f.startsWith(DOCS) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const BASE = `${origin}/mailfile-viewer/`;

const channel = process.env.PW_CHANNEL ?? 'chrome';
const browser = await chromium.launch(channel ? { channel } : {});
const results = [];
const step = async (name, fn) => {
  const t = Date.now();
  try { await fn(); results.push(`ok   ${name} (${Date.now() - t} ms)`); } catch (e) { results.push(`FAIL ${name}: ${e.message.split("\n")[0]} @ ${(e.stack.match(/e2e\.mjs:\d+/g) || []).join(",")}`); }
};

const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const external = [];
const consoleErrors = [];
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) external.push(u); });
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(e.message));

async function upload(file) {
  await page.setInputFiles('#mfv-input', file);
  await page.waitForFunction(() => /Loaded|Could not/.test(document.querySelector('#mfv-status')?.textContent + document.querySelector('#mfv-error')?.textContent), null, { timeout: 30000 });
}
async function download(trigger, name) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), trigger()]);
  const target = path.join(OUT, name || dl.suggestedFilename());
  await dl.saveAs(target);
  return { file: target, suggested: dl.suggestedFilename(), bytes: fs.readFileSync(target) };
}
async function clearAll() {
  const btn = page.getByRole('button', { name: 'Close all' });
  if (await btn.count()) await btn.click();
}

await page.goto(BASE);

await step('MSG: view, download attachment, save .eml', async () => {
  await upload(path.join(SAMPLES, 'msg/HtmlSampleEmailWithAttachment.msg'));
  await page.waitForSelector('.reader h2.subject');
  assert.equal(await page.textContent('.reader h2.subject'), 'HtmlSampleEmailWithAttachment');
  assert.match(await page.textContent('.atts'), /SampleAttachment\.pdf/);
  const att = await download(() => page.locator('.att', { hasText: 'SampleAttachment.pdf' }).getByRole('button', { name: 'Download' }).click(), 'msg-attachment.pdf');
  assert.equal(att.bytes.length, 169480);
  assert.equal(att.bytes.subarray(0, 5).toString(), '%PDF-');
  const frame = page.frameLocator('iframe.msg-frame');
  await frame.locator('body').waitFor();
  assert.ok((await frame.locator('body').innerText()).length > 20, 'html body rendered in sandbox');
  const eml = await download(() => page.click('#mfv-save-eml'), 'from-msg.eml');
  assert.match(eml.bytes.toString('latin1'), /^From: /m);
  await page.getByRole('tab', { name: 'Headers' }).click();
  await page.waitForSelector('pre.headers');
  await clearAll();
});

await step('winmail.dat: extract attachments', async () => {
  const tmp = path.join(OUT, 'winmail.dat');
  fs.copyFileSync(path.join(SAMPLES, 'tnef/two-files.tnef'), tmp);
  await upload(tmp);
  await page.waitForSelector('.atts');
  const names = await page.locator('.att-name').allTextContents();
  assert.deepEqual(names, ['AUTHORS', 'README']);
  const readme = await download(() => page.locator('.att', { hasText: 'README' }).getByRole('button', { name: 'Download' }).click(), 'tnef-README');
  assert.equal(readme.bytes.length, 893);
  await clearAll();
});

await step('EML with embedded message: open nested item', async () => {
  await upload(path.join(SAMPLES, 'eml/bounce.eml'));
  await page.locator('.att', { hasText: '.eml' }).getByRole('button', { name: 'Open' }).click();
  await page.waitForFunction(() => window.__mfv.state.sources.length === 2);
  await clearAll();
});

await step('PST: browse folders, search, export MBOX/CSV/EML zip/attachments, print view', async () => {
  await upload(path.join(SAMPLES, 'pst/enron.pst'));
  assert.match(await page.textContent('#mfv-status'), /71 messages/);
  const folders = await page.locator('.folders .folder').count();
  assert.ok(folders >= 2, `folders: ${folders}`);
  await page.fill('#mfv-search', 'New OBA');
  await page.waitForFunction(() => document.querySelectorAll('.msgs .msg').length >= 1 && document.querySelectorAll('.msgs .msg').length < 10);
  await page.locator('.msgs .msg', { hasText: "New OBA's" }).click();
  await page.waitForSelector('.atts');
  assert.equal(await page.locator('.att').count(), 11);
  await page.fill('#mfv-search', '');
  await page.waitForFunction(() => window.__mfv.state.query === '' && document.querySelectorAll('.msgs .msg').length >= 1);
  await page.selectOption('#mfv-scope', 'all');
  await page.selectOption('#mfv-format', 'mbox');
  const mbox = await download(() => page.click('#mfv-export'), 'e2e-enron.mbox');
  assert.equal((mbox.bytes.toString('latin1').match(/^From /gm) || []).length, 71);
  await page.selectOption('#mfv-format', 'csv');
  const csv = await download(() => page.click('#mfv-export'), 'e2e-enron.csv');
  assert.ok(csv.bytes.toString('utf8').split('\r\n').length >= 72);
  await page.selectOption('#mfv-format', 'eml');
  const zip = await download(() => page.click('#mfv-export'), 'e2e-enron-eml.zip');
  assert.equal(zip.bytes.subarray(0, 2).toString(), 'PK');
  await page.selectOption('#mfv-format', 'att');
  const az = await download(() => page.click('#mfv-export'), 'e2e-enron-attachments.zip');
  assert.equal(az.bytes.subarray(0, 2).toString(), 'PK');
  // print / PDF: the print document is built into a hidden same-origin frame
  await page.selectOption('#mfv-scope', 'folder');
  await page.selectOption('#mfv-format', 'pdf');
  await page.evaluate(() => { window.__printed = 0; });
  await page.click('#mfv-export');
  await page.waitForSelector('#mfv-print-frame', { state: 'attached' });
  const printHtml = await page.$eval('#mfv-print-frame', (f) => f.srcdoc);
  assert.ok((printHtml.match(/class="pm"/g) || []).length >= 1);
  const pdfPage = await ctx.newPage();
  await pdfPage.setContent(printHtml);
  const pdf = await pdfPage.pdf({ format: 'A4' });
  fs.writeFileSync(path.join(OUT, 'folder-print.pdf'), pdf);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  await pdfPage.close();
  await clearAll();
});

await step('OST (4K pages) opens', async () => {
  await upload(path.join(SAMPLES, 'pst/test.ost'));
  assert.match(await page.textContent('#mfv-status'), /47 messages/);
  await page.locator('.msgs .msg').first().click();
  await page.waitForSelector('iframe.msg-frame, pre.plain');
  await clearAll();
});

await step('OLM opens with folders and attachment download', async () => {
  await upload(path.join(SAMPLES, 'generated/sample.olm'));
  assert.match(await page.textContent('#mfv-status'), /3 messages/);
  const labels = await page.locator('.folders .folder span:first-child').allTextContents();
  assert.ok(labels.some((l) => l.endsWith('Inbox')) && labels.some((l) => l.endsWith('Sent Items')), labels.join('|'));
  await page.locator('.msgs .msg', { hasText: 'Rechnung' }).click();
  const pdf = await download(() => page.locator('.att', { hasText: 'Rechnung-März.pdf' }).getByRole('button', { name: 'Download' }).click(), 'olm-att.pdf');
  assert.equal(pdf.bytes.subarray(0, 8).toString(), '%PDF-1.4');
  await page.selectOption('#mfv-scope', 'all');
  await page.selectOption('#mfv-format', 'mbox');
  await download(() => page.click('#mfv-export'), 'e2e-olm.mbox');
  await clearAll();
});

await step('MBOX opens', async () => {
  await upload(path.join(SAMPLES, 'generated/sample.mbox'));
  assert.match(await page.textContent('#mfv-status'), /4 messages/);
  await clearAll();
});

await step('unknown file shows error with report link', async () => {
  const bad = path.join(OUT, 'random.bin');
  fs.writeFileSync(bad, crypto.randomBytes(2048));
  await upload(bad);
  assert.match(await page.textContent('#mfv-error'), /Could not open this file/);
  assert.ok(await page.locator('#mfv-error a[href*="github.com"]').count());
});

await step('remote images blocked by default', async () => {
  await upload(path.join(SAMPLES, 'eml/calendar-event.eml'));
  await page.waitForSelector('iframe.msg-frame');
  const csp = await page.$eval('iframe.msg-frame', (f) => f.srcdoc.match(/Content-Security-Policy" content="([^"]+)/)[1]);
  assert.match(csp, /img-src data:;/);
  await clearAll();
});

await step('no third-party requests and no console errors', async () => {
  assert.deepEqual(external, []);
  // CSP violation reports from inside email HTML (e.g. web fonts) prove blocking works; anything else is a bug
  const cspBlocks = consoleErrors.filter((e) => /violates the following Content Security Policy/.test(e));
  assert.deepEqual(consoleErrors.filter((e) => !cspBlocks.includes(e)), []);
  results.push(`info ${cspBlocks.length} remote resources inside emails were blocked by CSP`);
});

// SEO / mobile checks for every page
const sitemap = fs.readFileSync(path.join(DOCS, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
await step('sitemap, robots, page count <= 10', async () => {
  assert.ok(urls.length >= 8 && urls.length <= 10, `pages: ${urls.length}`);
  assert.match(fs.readFileSync(path.join(DOCS, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/.+sitemap\.xml/);
});
const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mp = await mobile.newPage();
for (const u of urls) {
  const local = u.replace(/^https:\/\/[^/]+\/mailfile-viewer\//, BASE);
  await step(`page ${u.replace(/^https:\/\/[^/]+/, '')}: meta + mobile width`, async () => {
    await mp.goto(local);
    const info = await mp.evaluate(() => ({
      title: document.title, desc: document.querySelector('meta[name=description]')?.content || '',
      canonical: document.querySelector('link[rel=canonical]')?.href || '', h1: document.querySelectorAll('h1').length,
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, lang: document.documentElement.lang,
      viewport: !!document.querySelector('meta[name=viewport]'),
    }));
    assert.ok(info.title.length >= 20 && info.title.length <= 90, `title length ${info.title.length}`);
    assert.ok(info.desc.length >= 70 && info.desc.length <= 170, `description length ${info.desc.length}`);
    assert.equal(info.canonical, u);
    assert.equal(info.h1, 1);
    assert.ok(info.viewport);
    assert.ok(info.sw <= info.cw, `horizontal overflow ${info.sw} > ${info.cw}`);
    assert.ok(!/outlook|microsoft|quicken|quickbooks|intuit/i.test(info.title), 'trademark in title');
  });
}
await step('mobile: PST loaded has no horizontal scroll', async () => {
  await mp.goto(BASE);
  await mp.setInputFiles('#mfv-input', path.join(SAMPLES, 'pst/enron.pst'));
  await mp.waitForFunction(() => /Loaded/.test(document.querySelector('#mfv-status').textContent));
  await mp.locator('.msgs .msg').first().click();
  await mp.waitForSelector('.reader h2.subject');
  await mp.screenshot({ path: path.join(OUT, 'mobile-pst.png'), fullPage: false });
  const o = await mp.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(o[0] <= o[1], `overflow ${o}`);
});
await step('ja / de pages use localized tool UI', async () => {
  await mp.goto(BASE + 'ja/');
  assert.match(await mp.textContent('#mfv-drop'), /メールファイルをここにドロップ/);
  await mp.setInputFiles('#mfv-input', path.join(SAMPLES, 'generated/sample.olm'));
  await mp.waitForFunction(() => /読み込み完了/.test(document.querySelector('#mfv-status').textContent));
  await mp.goto(BASE + 'de/');
  assert.match(await mp.textContent('#mfv-drop'), /E-Mail-Dateien hier ablegen/);
});
await page.goto(BASE);
await page.setInputFiles('#mfv-input', path.join(SAMPLES, 'pst/enron.pst'));
await page.waitForFunction(() => /Loaded/.test(document.querySelector('#mfv-status').textContent));
await page.locator('.msgs .msg').first().click();
await page.screenshot({ path: path.join(OUT, 'desktop-pst.png') });

await browser.close();
server.close();
console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\n${results.length - failed.length}/${results.length} e2e steps passed`);
process.exit(failed.length ? 1 : 0);
