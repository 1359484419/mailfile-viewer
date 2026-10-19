// Page content. Kept deliberately small (9 pages); every page embeds the working tool.
export const TRADEMARK_EN = 'Outlook, Microsoft and Exchange are trademarks of Microsoft Corporation. MailFile Viewer is an independent open-source project and is not affiliated with, endorsed by or sponsored by Microsoft. Format names are used only to describe compatibility.';
export const TRADEMARK_JA = 'Outlook、Microsoft、Exchange は Microsoft Corporation の商標です。MailFile Viewer は独立したオープンソースプロジェクトであり、Microsoft とは提携・承認・後援の関係にありません。形式名は互換性の説明のためにのみ使用しています。';
export const TRADEMARK_DE = 'Outlook, Microsoft und Exchange sind Marken der Microsoft Corporation. MailFile Viewer ist ein unabhängiges Open-Source-Projekt und steht in keiner Verbindung zu Microsoft. Formatnamen dienen ausschließlich der Beschreibung der Kompatibilität.';

const faq = (items) => `<section class="faq"><h2>${items.title}</h2>${items.q.map(([q, a]) => `<details><summary>${q}</summary><div>${a}</div></details>`).join('')}</section>`;

const formatsTable = `<table class="fmt">
<thead><tr><th>File</th><th>What it is</th><th>View</th><th>Export to</th></tr></thead>
<tbody>
<tr><td>.msg</td><td>Single item saved from Outlook for Windows (OLE compound file)</td><td>Yes, incl. RTF-only bodies</td><td>EML, PDF (print), attachments</td></tr>
<tr><td>.eml</td><td>Standard internet message (RFC 5322 / MIME)</td><td>Yes</td><td>EML, MBOX, PDF, attachments</td></tr>
<tr><td>winmail.dat / ATT00001.dat</td><td>TNEF wrapper sent by Exchange in “rich text” mode</td><td>Yes, plus the hidden attachments</td><td>EML, PDF, attachments</td></tr>
<tr><td>.pst / .ost</td><td>Personal folders / offline cache (ANSI, Unicode, 4K-page OST)</td><td>Folder tree, list, search</td><td>EML (zip), MBOX, CSV, contacts CSV, PDF, attachments</td></tr>
<tr><td>.olm</td><td>Export archive from Outlook for Mac (ZIP + XML)</td><td>Folder tree, list, search</td><td>EML (zip), MBOX, CSV, PDF, attachments</td></tr>
<tr><td>.mbox</td><td>Unix mailbox used by Thunderbird, Apple Mail, Google Takeout</td><td>Yes</td><td>EML (zip), CSV, PDF, attachments</td></tr>
</tbody></table>`;

export const PAGES = [
  {
    path: '', lang: 'en',
    title: 'MailFile Viewer — open MSG, EML, winmail.dat, PST and OLM in your browser',
    description: 'Free private viewer and converter for .msg, .eml, winmail.dat, .pst, .ost and .olm files. Export to EML, MBOX, CSV or PDF in your browser. No upload.',
    h1: 'Open email files right in your browser',
    lead: 'View and convert .msg, .eml, winmail.dat, .pst, .ost, .olm and .mbox files. Everything runs on your device — your mail is never uploaded.',
    body: `
<section><h2>What you can do</h2>
<ul class="ticks">
<li>Read a single saved message (.msg, .eml) or a whole mailbox archive (.pst, .ost, .olm, .mbox) with folders, search and attachments.</li>
<li>Unpack <code>winmail.dat</code> / <code>ATT00001.dat</code> and get the real attachments out.</li>
<li>Convert to standard formats: EML files in a ZIP, an MBOX mailbox for Thunderbird or Apple Mail, a CSV list of messages, a contacts CSV, or a PDF through your browser’s “Save as PDF”.</li>
<li>Download every attachment of a folder at once as a ZIP.</li>
</ul></section>
<section><h2>Supported files</h2>${formatsTable}</section>
<section><h2>How private is it?</h2>
<p>The page is a static site. When you pick a file the browser reads it into memory and the parsers run in this tab — there is no server that receives your mail, no analytics script and no third-party tracker. Remote images inside messages are blocked until you allow them, so opening an old newsletter does not ping the sender. You can disconnect from the internet after the page has loaded and it still works. Details on the <a href="privacy/">privacy page</a>.</p></section>
<section class="pro"><h2>Pro — coming soon</h2><p>Everything on this page is free. A future Pro version is planned for very large archives (multi-gigabyte PST streaming to disk), batch PDF files and priority fixes for problem files. There is nothing to buy yet.</p></section>
${faq({ title: 'Questions', q: [
  ['Do I need Outlook or a Microsoft 365 subscription?', 'No. The file formats are read directly by open-source parsers running in your browser. It works on Windows, macOS, Linux and ChromeOS.'],
  ['How large a file can I open?', 'The whole file is loaded into the browser’s memory, so the practical limit depends on your device: around 1–2&nbsp;GB on a typical laptop with Chrome, Edge or Firefox, and a few hundred MB on phones and tablets. Very large PST files are best split first.'],
  ['Can it open password-protected PST files?', 'No. Encrypted or password-protected PST files are not supported and the tool will tell you so.'],
  ['What happens to embedded messages?', 'An email attached inside another email (or inside winmail.dat) shows an “Open” button and opens as its own message.'],
] })}`,
  },
  {
    path: 'msg-viewer/', lang: 'en',
    title: 'MSG file viewer — open .msg emails online without installing anything',
    description: 'Open .msg email files in your browser on Mac, Windows, Linux or Chromebook. Read the message, download attachments, convert MSG to EML or PDF. Runs locally, no upload.',
    h1: 'Open .msg files without installing anything',
    lead: 'Drop a .msg file to read it, save the attachments, or convert it to .eml or PDF. The file stays on your computer.',
    body: `
<section><h2>About .msg files</h2>
<p>A .msg file is a single email, meeting request or contact that someone dragged out of Outlook for Windows. Inside it is an OLE “compound file” — a little file system holding MAPI properties for the sender, recipients, body and each attachment. Mac and Linux mail apps cannot read it, which is why people end up with “I can’t open this attachment” problems when a colleague forwards a message as an attachment.</p>
<p>This viewer reads the compound file directly. It shows the HTML body when there is one, falls back to the plain-text body, and if the message was only stored as compressed RTF it decompresses the RTF and extracts the original HTML or text.</p></section>
<section><h2>Converting MSG to EML</h2>
<p>Click <b>Save .eml</b> to get a standards-based copy you can open in Apple Mail, Thunderbird or any mail client. The converter writes a proper MIME message: sender, recipients, date and subject headers (UTF-8 encoded where needed), both plain-text and HTML alternatives, inline images and every attachment. Messages that are attached to the .msg are turned into nested .eml files.</p></section>
<section><h2>MSG to PDF</h2>
<p>Use <b>Print / PDF</b> and choose “Save as PDF” in the print dialog. The printout includes a header block (from, to, cc, date, attachment names) followed by the message body. Remote images are left out so the PDF is created without contacting any server.</p></section>
${faq({ title: 'MSG questions', q: [
  ['The body is empty or garbled — why?', 'Some very old .msg files store text in a legacy code page. The viewer uses the code page recorded in the file; if it is wrong, please report the problem (without sending the file) using the link that appears with the error.'],
  ['Can I open .oft templates?', 'Templates use the same container format and usually open, but this is not tested extensively.'],
] })}`,
  },
  {
    path: 'winmail-dat-opener/', lang: 'en',
    title: 'winmail.dat opener — extract attachments from winmail.dat and ATT00001.dat',
    description: 'Got a winmail.dat or ATT00001.dat attachment? Open it in your browser to read the message and download the real attachments. Free, private, works on iPhone and Mac.',
    h1: 'Open winmail.dat and get your attachments back',
    lead: 'Received a mysterious winmail.dat or ATT00001.dat? Drop it here to see the message and download the files hidden inside.',
    body: `
<section><h2>Why you got a winmail.dat</h2>
<p>When an Exchange or Outlook user sends mail in “Rich Text” format, the server wraps the formatting and the attachments in a container called TNEF (Transport Neutral Encapsulation Format) and attaches it as <code>winmail.dat</code>. Apple Mail, Gmail, Thunderbird and most phones do not understand TNEF, so the recipient sees one useless .dat file instead of the PDF or spreadsheet that was actually sent.</p></section>
<section><h2>What this opener extracts</h2>
<ul class="ticks">
<li>All attached files with their original long file names, including names with accents or non-Latin characters.</li>
<li>The message body — plain text, HTML, or HTML recovered from compressed RTF.</li>
<li>Embedded messages (an email attached inside the TNEF) which you can open with one click.</li>
<li>Subject, sender and date when the sender’s server included them.</li>
</ul>
<p>If you received the whole email as a <code>.eml</code> file with winmail.dat inside, open the .eml: the winmail.dat shows up as an attachment with an <b>Open</b> button.</p></section>
<section><h2>How to stop receiving winmail.dat</h2>
<p>The fix is on the sender’s side: ask them to send in HTML or plain-text format instead of Rich Text, or their administrator can set the remote domain’s TNEF setting to off. Until then, this page lets you read what they send.</p></section>
${faq({ title: 'winmail.dat questions', q: [
  ['Does it work on iPhone and Android?', 'Yes. Save the winmail.dat attachment to Files, open this page in Safari or Chrome and choose the file. Downloads go to your Files / Downloads folder.'],
  ['The winmail.dat only contains formatting, no files', 'That happens: some TNEF attachments carry only the rich-text body. The viewer then shows just the message text.'],
] })}`,
  },
  {
    path: 'pst-viewer/', lang: 'en',
    title: 'PST and OST viewer — browse and convert .pst/.ost to EML, MBOX, CSV',
    description: 'Browse .pst and .ost mailbox files in your browser. Search folders, read messages, save attachments and export to EML, MBOX, CSV or PDF. Nothing is uploaded.',
    h1: 'Browse PST and OST files without Outlook',
    lead: 'Open a .pst or .ost archive, browse its folders and messages, and export them to EML, MBOX, CSV or PDF — all inside your browser.',
    body: `
<section><h2>Supported PST and OST variants</h2>
<ul class="ticks">
<li>ANSI PST (Outlook 97–2002) and Unicode PST (Outlook 2003 and later).</li>
<li>OST offline caches including the 4&nbsp;KB-page format written by Outlook 2013 and newer.</li>
<li>Folders, sub-folders, emails, meeting requests, attachments and messages attached to messages.</li>
</ul>
<p>Not supported: password-protected or “high encryption” PST files, and badly corrupted files (try your mail program’s repair tool first).</p></section>
<section><h2>Exporting a PST</h2>
<ol>
<li>Open the file and pick a folder on the left (or search across everything).</li>
<li>Choose the scope — current folder or all loaded messages — and a format.</li>
<li><b>EML (.zip)</b> keeps one standard file per message, organised by folder; <b>MBOX</b> can be imported into Thunderbird (ImportExportTools NG) or Apple Mail; <b>CSV</b> gives a spreadsheet of date, sender, recipients, subject and attachment names; <b>Contacts (CSV)</b> lists every address with message counts.</li>
</ol></section>
<section><h2>Size and speed</h2>
<p>The archive is read into memory, then folders are indexed; message bodies and attachments are decoded only when you open or export them. A 15&nbsp;MB test archive with 70 messages indexes in well under a second on a laptop. For multi-gigabyte PST files use a desktop browser with plenty of free memory.</p></section>
${faq({ title: 'PST questions', q: [
  ['Is my PST uploaded anywhere?', 'No. The page has no backend. You can verify this in your browser’s developer tools: opening a file creates no network requests.'],
  ['Why are some sender addresses shown as long Exchange paths?', 'Messages sent inside an Exchange organisation store an internal (X.500) address. When the SMTP address is present in the file it is used instead.'],
] })}`,
  },
  {
    path: 'olm-converter/', lang: 'en',
    title: 'OLM converter — open Mac .olm archives and convert to MBOX or EML',
    description: 'Open .olm export files from Outlook for Mac on any computer. Browse folders, read messages and convert OLM to MBOX, EML, CSV or PDF in the browser without uploading.',
    h1: 'Open .olm archives on any computer',
    lead: 'Moving away from Outlook for Mac? Open the .olm export here and convert it to MBOX or EML for Apple Mail, Thunderbird or Gmail import.',
    body: `
<section><h2>What is inside an .olm file</h2>
<p>An .olm export is a ZIP archive. Each message is stored as a small XML document (subject, addresses, sent time, HTML body and an attachment list) and attachments sit next to it as ordinary files. Because it is not a mailbox format that other programs read, the usual advice is to re-import it into Outlook — which does not help if you no longer have a Mac with Outlook.</p>
<p>This converter reads the ZIP directory directly and only decompresses what it needs, then maps the XML into regular messages with folders.</p></section>
<section><h2>OLM to MBOX or EML</h2>
<ul class="ticks">
<li><b>MBOX</b>: one file per export; Apple Mail (File → Import Mailboxes) and Thunderbird import it directly.</li>
<li><b>EML (.zip)</b>: one .eml per message, grouped by folder — good for archiving or for uploading to another mail service.</li>
<li><b>CSV</b>: a spreadsheet overview for searching or legal review.</li>
</ul></section>
<section><h2>Limits</h2>
<p>Calendar, contacts, notes and tasks inside the OLM are not converted yet — only mail. Very large exports (several GB) need a desktop browser with enough memory.</p></section>`,
  },
  {
    path: 'eml-mbox-viewer/', lang: 'en',
    title: 'EML and MBOX viewer — read .eml files and mbox mailboxes online',
    description: 'Read .eml messages and .mbox mailboxes (Thunderbird, Apple Mail, Google Takeout) in your browser. Search, save attachments, export to CSV or PDF. No upload.',
    h1: 'Read .eml files and MBOX mailboxes',
    lead: 'Open saved .eml messages or whole .mbox files (Thunderbird, Apple Mail, Google Takeout) to read, search and export them — privately, in your browser.',
    body: `
<section><h2>EML files</h2>
<p>An .eml file is the raw internet message: headers, then MIME parts for text, HTML and attachments. The viewer decodes quoted-printable, base64 and encoded-word headers in any charset (including ISO-2022-JP and Shift_JIS), shows inline images, and lists every attachment. The <b>Headers</b> tab shows the original header block — useful for checking where a suspicious message really came from.</p></section>
<section><h2>MBOX files</h2>
<p>MBOX stores many messages in one text file separated by “From ” lines. Google Takeout exports Gmail this way. Open the .mbox to browse it as a list, search by sender or subject (optionally in message bodies), save single messages as .eml, export the list to CSV, or pull out all attachments as a ZIP.</p></section>
${faq({ title: 'EML / MBOX questions', q: [
  ['My Google Takeout mbox is several gigabytes', 'Large files are read into memory; a desktop browser with 8&nbsp;GB+ RAM handles about 1–2&nbsp;GB comfortably. Split bigger files first.'],
  ['Are scripts in HTML emails executed?', 'No. Messages are shown in a sandboxed frame with scripts disabled and a strict content security policy.'],
] })}`,
  },
  {
    path: 'privacy/', lang: 'en', noTool: true,
    title: 'Privacy and how MailFile Viewer works',
    description: 'How MailFile Viewer processes email files locally in your browser: no uploads, no analytics, no trackers, open-source parsers and sandboxed message display.',
    h1: 'Privacy and how it works',
    lead: 'Short version: your files never leave your device, and this site does not track you.',
    body: `
<section><h2>Local processing</h2>
<p>MailFile Viewer is a set of static files (HTML, CSS and one JavaScript bundle) hosted on GitHub Pages. When you choose a file, the browser’s File API gives the page the bytes and the parsers run in the same tab. There is no upload endpoint and no backend at all. After the page has loaded you can go offline and keep working.</p></section>
<section><h2>No tracking</h2>
<p>The site includes no analytics, advertising or third-party scripts, sets no cookies and does not use local storage for your mail. Fonts are system fonts. The hosting provider (GitHub) may keep standard server logs of page requests, as for any website; those logs never include your files.</p></section>
<section><h2>Safe display</h2>
<p>HTML email is rendered in a sandboxed frame with scripts, forms and plugins disabled and a content security policy that blocks network access. Remote images stay blocked unless you click “Load remote images” for that message, which prevents tracking pixels from reporting that you opened it.</p></section>
<section><h2>Open source</h2>
<p>The code is MIT-licensed. Parsing uses these open-source libraries: <a href="https://github.com/epfromer/pst-extractor" rel="noopener">pst-extractor</a> (MIT) for PST/OST, <a href="https://github.com/HiraokaHyperTools/msgreader" rel="noopener">@kenjiuno/msgreader</a> (Apache-2.0) for MSG, <a href="https://github.com/postalsys/postal-mime" rel="noopener">postal-mime</a> (MIT-0) for EML, <a href="https://github.com/101arrowz/fflate" rel="noopener">fflate</a> (MIT) for ZIP, <a href="https://github.com/NaturalIntelligence/fast-xml-parser" rel="noopener">fast-xml-parser</a> (MIT) for OLM XML. The TNEF and RTF decoders are written from Microsoft’s published open specifications [MS-OXTNEF] and [MS-OXRTFEX].</p></section>
<section><h2>Reporting problems</h2>
<p>If a file fails to open, the error message has a link that pre-fills a GitHub issue with the error code and your browser version only. Please never attach private email to a public issue.</p></section>`,
  },
  {
    path: 'ja/', lang: 'ja',
    title: 'MailFile Viewer — MSG・EML・winmail.dat・PST・OLM をブラウザで開く',
    description: '.msg、.eml、winmail.dat、.pst、.ost、.olm ファイルをブラウザだけで閲覧・変換。EML・MBOX・CSV・PDF に書き出し可能。ファイルはアップロードされません。',
    h1: 'メールファイルをブラウザでそのまま開く',
    lead: '.msg・.eml・winmail.dat・.pst・.ost・.olm・.mbox を閲覧・変換できます。処理はすべてお使いの端末内で行われ、メールがアップロードされることはありません。',
    body: `
<section><h2>できること</h2>
<ul class="ticks">
<li>単体メール（.msg・.eml）やメールボックス全体（.pst・.ost・.olm・.mbox）を、フォルダー・検索・添付ファイル付きで閲覧。</li>
<li><code>winmail.dat</code>／<code>ATT00001.dat</code> を開いて、中に埋もれた本来の添付ファイルを取り出す。</li>
<li>標準形式へ変換：EML（ZIP まとめ）、Thunderbird や Apple Mail で読める MBOX、メール一覧 CSV、連絡先 CSV、ブラウザの「PDF として保存」による PDF。</li>
<li>フォルダー内の添付ファイルを ZIP で一括ダウンロード。</li>
</ul></section>
<section><h2>日本語メールへの対応</h2>
<p>ISO-2022-JP（JIS）、Shift_JIS、EUC-JP、UTF-8 の件名・本文・添付ファイル名をデコードします。古い .msg や winmail.dat ではファイル内に記録されたコードページを使って文字化けを防ぎます。CSV は Excel で文字化けしないよう BOM 付き UTF-8 で書き出します。</p></section>
<section><h2>プライバシー</h2>
<p>このサイトは静的ファイルのみで構成され、サーバー側の処理はありません。アクセス解析やトラッキングのスクリプトも入っていません。HTML メールはスクリプト無効のサンドボックス内で表示し、外部画像は許可するまでブロックします。</p></section>
<section class="pro"><h2>Pro 版（準備中）</h2><p>現在の機能はすべて無料です。数 GB 規模の PST のストリーミング処理や PDF 一括出力などを Pro 版として予定していますが、まだ販売はしていません。</p></section>
${faq({ title: 'よくある質問', q: [
  ['Outlook や Microsoft 365 は必要ですか？', '不要です。Windows・Mac・Linux・Chromebook のブラウザで動作します。'],
  ['どのくらい大きなファイルを開けますか？', 'ファイル全体をメモリに読み込むため端末次第です。一般的なノート PC なら 1〜2 GB 程度、スマートフォンでは数百 MB が目安です。'],
  ['パスワード付き PST は開けますか？', '暗号化・パスワード保護された PST には対応していません。'],
] })}`,
  },
  {
    path: 'de/', lang: 'de',
    title: 'MailFile Viewer — MSG, EML, winmail.dat, PST und OLM im Browser öffnen',
    description: '.msg-, .eml-, winmail.dat-, .pst-, .ost- und .olm-Dateien direkt im Browser öffnen und nach EML, MBOX, CSV oder PDF konvertieren. Kein Upload, keine Installation.',
    h1: 'E-Mail-Dateien direkt im Browser öffnen',
    lead: '.msg, .eml, winmail.dat, .pst, .ost, .olm und .mbox ansehen und umwandeln. Alles läuft auf Ihrem Gerät – Ihre E-Mails werden nicht hochgeladen.',
    body: `
<section><h2>Funktionen</h2>
<ul class="ticks">
<li>Einzelne Nachrichten (.msg, .eml) oder ganze Postfach-Archive (.pst, .ost, .olm, .mbox) mit Ordnern, Suche und Anhängen lesen.</li>
<li><code>winmail.dat</code> bzw. <code>ATT00001.dat</code> öffnen und die eigentlichen Anhänge herausholen.</li>
<li>In Standardformate umwandeln: EML-Dateien als ZIP, MBOX für Thunderbird oder Apple Mail, Nachrichtenliste als CSV, Kontakte als CSV oder PDF über „Als PDF speichern“.</li>
<li>Alle Anhänge eines Ordners auf einmal als ZIP herunterladen.</li>
</ul></section>
<section><h2>Datenschutz (DSGVO-freundlich)</h2>
<p>Die Seite besteht nur aus statischen Dateien. Es gibt keinen Server, der Ihre E-Mails empfängt, keine Analyse-Skripte, keine Cookies und keine Tracker. Damit eignet sich das Tool auch für vertrauliche Geschäftskorrespondenz, die nicht an Online-Konverter übertragen werden darf. HTML-Mails werden in einem abgesicherten Rahmen ohne Skripte angezeigt; externe Bilder bleiben blockiert, bis Sie sie freigeben.</p></section>
<section class="pro"><h2>Pro – demnächst</h2><p>Alle Funktionen auf dieser Seite sind kostenlos. Eine Pro-Version für sehr große Archive und Stapel-PDF ist geplant; derzeit gibt es nichts zu kaufen.</p></section>
${faq({ title: 'Häufige Fragen', q: [
  ['Brauche ich Outlook oder Microsoft 365?', 'Nein. Die Dateiformate werden von Open-Source-Parsern direkt im Browser gelesen – unter Windows, macOS, Linux und ChromeOS.'],
  ['Wie groß dürfen Dateien sein?', 'Die Datei wird komplett in den Arbeitsspeicher geladen. Auf einem üblichen Laptop sind 1–2 GB machbar, auf Smartphones einige hundert MB.'],
  ['Werden passwortgeschützte PST-Dateien unterstützt?', 'Nein, verschlüsselte PST-Dateien können nicht geöffnet werden.'],
] })}`,
  },
];
