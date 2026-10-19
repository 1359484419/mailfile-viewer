# MailFile Viewer

Open and convert email files **entirely in your browser**: `.msg`, `.eml`, `winmail.dat` / `ATT00001.dat` (TNEF),
`.pst`, `.ost`, `.olm` and `.mbox`. Read messages, download attachments, and export to EML, MBOX, CSV or PDF (via the
browser's print dialog). Static site, no backend, MIT licensed.

## What it does

| Input | View | Export |
|---|---|---|
| `.msg` (OLE compound file) | HTML / text / RTF-only bodies, recipients, attachments, embedded messages | EML, PDF, attachments |
| `.eml` | full MIME, any charset, inline `cid:` images, headers tab | EML, MBOX, PDF, attachments |
| `winmail.dat`, `ATT00001.dat` (TNEF) | body (text, HTML, HTML recovered from compressed RTF), long/Unicode attachment names | EML, PDF, attachments |
| `.pst` / `.ost` (ANSI, Unicode, OST 2013 4K pages) | folder tree, list, search, lazy body/attachment decoding | EML (zip), MBOX, CSV list, contacts CSV, PDF, attachments (zip) |
| `.olm` (ZIP + XML) | folders, list, search, attachments | same as PST |
| `.mbox` | list, search | same as PST |

Everything is free in this version. The pages reserve a "Pro — coming soon" note; there are no payment buttons or
links.

## Privacy

* Files are read with the browser File API and parsed in the same tab. There is no upload endpoint and no server code.
* No analytics, no third-party scripts, no cookies. All JavaScript is bundled into `docs/assets/app.js` (no CDN).
* The pages ship a Content-Security-Policy (`connect-src 'self'`, `script-src 'self'`).
* HTML email is rendered in a sandboxed iframe (no scripts, forms or plugins) with its own CSP; remote images are blocked
  until the user clicks "Load remote images". The e2e test asserts that opening all sample files makes **zero**
  requests to other origins.
* The "report a parsing problem" link pre-fills a GitHub issue with the error code and user agent only, never the file.

## Architecture

```
src/core/harness.js   harness: format detection, size gate, timing, error classification, event log
src/core/eml.js       postal-mime (MIT-0)
src/core/msg.js       @kenjiuno/msgreader (Apache-2.0)
src/core/tnef.js      TNEF parser written from [MS-OXTNEF]
src/core/rtf.js       LZFu decompression + RTF -> HTML de-encapsulation ([MS-OXRTFEX]) / text
src/core/pst.js       pst-extractor (MIT); lazy getters for bodies/attachments
src/core/olm.js       lazy ZIP reader (zipread.js, ZIP64) + fast-xml-parser
src/core/mbox.js      mboxo/mboxrd reader
src/core/export.js    EML (RFC 5322/2045/2047/6854), MBOX (mboxrd), CSV (formula-injection safe), ZIP (fflate)
src/app/              UI + i18n (en / ja / de)
src/shims/            browser shims for pst-extractor's zlib/fs/Buffer use
site/                 page content (9 pages) and CSS
scripts/build.mjs     esbuild bundle + static pages + sitemap.xml + robots.txt -> docs/
```

Parsers never touch the DOM or the network; the harness (`createHarness`) wraps them with detection, a device-size gate
(`deviceLimitBytes`), progress events, timing and typed errors (`encrypted`, `truncated`, `unknown-format`, …). The
`archiveLimit` option is the hook for a future free/Pro message cap (currently unlimited).

## Run locally

```sh
npm install
npm run build            # writes docs/
npm run serve            # http://localhost:8765/
```

`SITE_URL` (default `https://1359484419.github.io/mailfile-viewer/`) controls canonical URLs and the sitemap.
GitHub Pages: publish the `docs/` folder of the default branch.

## Tests

Test files come from open-source projects' test suites (pst-extractor, msg-extractor, MSGReader, postal-mime,
tnefparse) plus generated fixtures (`test/fixtures/make-olm.mjs`, `test/fixtures/make_mbox.py`). They are downloaded
into a separate data-only directory and are not committed:

```sh
sh scripts/fetch-samples.sh ../../samples-c23     # idempotent
python3 -m venv ../../venv-c23 && ../../venv-c23/bin/pip install tnefparse==1.4.0 extract-msg   # optional reference parsers

node --test test/core.test.mjs                    # parse every sample, write exports to test-output/
../../venv-c23/bin/python -I test/verify_exports.py   # re-read exports with Python email/mailbox/csv/zipfile,
                                                      # compare with tnefparse + extract-msg
npm run build && node test/e2e.mjs                # real Chrome via Playwright: upload, view, download, export,
                                                  # privacy (no 3rd-party requests), SEO meta, mobile width
../../venv-c23/bin/python -I test/verify_exports.py   # again, now also checks files downloaded in the browser
```

`SAMPLES_DIR` overrides the sample location; `PW_CHANNEL=""` uses Playwright's bundled Chromium instead of installed
Chrome.

## Known limitations

* The whole file is loaded into memory: roughly 1–2 GB on desktop, a few hundred MB on mobile. No streaming yet.
* Parsing runs on the main thread (with periodic yields), not in a Web Worker.
* Password-protected / "high encryption" PST files are refused.
* OLM support follows the published OPFMessageCopy* XML layout and is tested with a generated fixture, not yet with a
  real Outlook for Mac export. Calendar/contacts/notes inside OLM/PST are not converted (mail only).
* PDF export uses the browser print dialog ("Save as PDF"); there is no direct PDF file generation.
* Exchange-internal (X.500) sender addresses without an SMTP address are written as RFC 6854 empty groups plus an
  `X-Original-Address` header.

## Trademarks

Outlook, Microsoft and Exchange are trademarks of Microsoft Corporation. This project is independent and not
affiliated with or endorsed by Microsoft. File-format names are used only to describe compatibility.

## License

MIT, see `LICENSE`. Bundled third-party licenses are collected into `docs/assets/THIRD_PARTY_LICENSES.txt` at build time.
