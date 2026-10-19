// Build: bundle the app with esbuild, render the static pages, write sitemap/robots into docs/.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, TRADEMARK_EN, TRADEMARK_JA, TRADEMARK_DE } from '../site/pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, process.env.OUT_DIR || 'docs');
const SITE_URL = (process.env.SITE_URL || 'https://1359484419.github.io/mailfile-viewer/').replace(/\/?$/, '/');
const REPO_URL = 'https://github.com/1359484419/mailfile-viewer';

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });

const result = await build({
  metafile: true,
  entryPoints: [path.join(root, 'src/app/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  sourcemap: false,
  target: ['es2020', 'safari14'],
  outfile: path.join(out, 'assets/app.js'),
  inject: [path.join(root, 'src/shims/buffer-global.js')],
  alias: { zlib: path.join(root, 'src/shims/zlib.js'), fs: path.join(root, 'src/shims/fs.js'), string_decoder: path.join(root, 'node_modules/string_decoder/lib/string_decoder.js'), 'iconv-lite': path.join(root, 'node_modules/iconv-lite') },
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  platform: 'browser',
  legalComments: 'linked',
  logLevel: 'warning',
});
fs.copyFileSync(path.join(root, 'site/style.css'), path.join(out, 'assets/style.css'));

// Third-party license file for every npm package that ended up in the bundle
const pkgs = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g);
  if (m) pkgs.add(m[m.length - 1].replace(/^node_modules\//, '').replace(/\/$/, ''));
}
const notices = [];
for (const name of [...pkgs].sort()) {
  const dir = path.join(root, 'node_modules', name);
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const lic = fs.readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  notices.push(`${'='.repeat(72)}\n${name}@${pj.version} — ${pj.license || 'see package'}\n${'='.repeat(72)}\n${lic ? fs.readFileSync(path.join(dir, lic), 'utf8').trim() : `License: ${pj.license} (no license file shipped in the npm package)`}\n`);
}
fs.writeFileSync(path.join(out, 'assets/THIRD_PARTY_LICENSES.txt'), `Third-party software bundled in app.js\n\n${notices.join('\n')}`);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const navLabels = {
  en: [['', 'Home'], ['msg-viewer/', 'MSG'], ['winmail-dat-opener/', 'winmail.dat'], ['pst-viewer/', 'PST / OST'], ['olm-converter/', 'OLM'], ['eml-mbox-viewer/', 'EML / MBOX'], ['privacy/', 'Privacy']],
};
const tm = { en: TRADEMARK_EN, ja: TRADEMARK_JA, de: TRADEMARK_DE };
const badge = { en: 'Files stay on your device · no upload · no tracking', ja: 'ファイルは端末から出ません・アップロードなし・追跡なし', de: 'Dateien bleiben auf Ihrem Gerät · kein Upload · kein Tracking' };
const footMore = { en: 'Open source (MIT).', ja: 'オープンソース（MIT ライセンス）。', de: 'Open Source (MIT-Lizenz).' };
const homeAlternates = [['en', ''], ['ja', 'ja/'], ['de', 'de/']];

function rel(fromPath, toPath) {
  const depth = fromPath.split('/').filter(Boolean).length;
  return ('../'.repeat(depth) + toPath) || './';
}

function renderPage(p) {
  const canonical = SITE_URL + p.path;
  const isHome = ['', 'ja/', 'de/'].includes(p.path);
  const alternates = isHome
    ? homeAlternates.map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="${SITE_URL + h}">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${SITE_URL}">`
    : '';
  const nav = navLabels.en.map(([h, label]) => `<a href="${rel(p.path, h)}"${h === p.path ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const langs = homeAlternates.map(([l, h]) => `<a href="${rel(p.path, h)}" hreflang="${l}" lang="${l}">${l === 'en' ? 'English' : l === 'ja' ? '日本語' : 'Deutsch'}</a>`).join('');
  const assets = rel(p.path, 'assets/');
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: 'MailFile Viewer', url: canonical,
    applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', inLanguage: p.lang,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: p.description,
  };
  return `<!doctype html>
<html lang="${p.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${canonical}">
${alternates}
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; frame-src 'self' blob: data: about:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta name="theme-color" content="#1f5fbf">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231f5fbf'/%3E%3Cpath d='M7 10h18v12H7z' fill='none' stroke='white' stroke-width='2'/%3E%3Cpath d='M7 10l9 7 9-7' fill='none' stroke='white' stroke-width='2'/%3E%3C/svg%3E">
<link rel="stylesheet" href="${assets}style.css">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
<header class="site-head"><div class="wrap"><a class="brand" href="${rel(p.path, p.lang === 'en' ? '' : p.lang + '/')}">MailFile Viewer</a><nav class="site-nav" aria-label="Formats">${nav}</nav><div class="langs">${langs}</div></div></header>
<main class="wrap">
<div class="hero"><h1>${p.h1}</h1><p>${p.lead}</p><span class="badge">${badge[p.lang]}</span></div>
${p.noTool ? '' : '<div id="app"><noscript>This tool needs JavaScript to read files locally in your browser.</noscript></div>'}
${p.body}
</main>
<footer class="site-foot"><div class="wrap"><p>${tm[p.lang]}</p><p>${footMore[p.lang]} <a href="${REPO_URL}" rel="noopener">GitHub</a> · <a href="${rel(p.path, 'privacy/')}">Privacy</a></p></div></footer>
${p.noTool ? '' : `<script type="module" src="${assets}app.js"></script>`}
</body>
</html>
`;
}

for (const p of PAGES) {
  const dir = path.join(out, p.path);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), renderPage(p));
}
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((p) => `  <url><loc>${SITE_URL + p.path}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
fs.writeFileSync(path.join(out, '404.html'), renderPage({ path: '404/', lang: 'en', noTool: true, title: 'Page not found — MailFile Viewer', description: 'Page not found.', h1: 'Page not found', lead: '<a href="/mailfile-viewer/">Go to the email file viewer</a>', body: '' }).replace(/<link rel="canonical"[^>]*>\n/, '<meta name="robots" content="noindex">\n'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`built ${PAGES.length} pages -> ${path.relative(root, out)} (site ${SITE_URL})`);
