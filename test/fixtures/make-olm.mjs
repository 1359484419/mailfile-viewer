// Generates a synthetic .olm archive (ZIP + OPFMessageCopy* XML) for tests.
// Usage: node test/fixtures/make-olm.mjs <out.olm>
import fs from 'node:fs';
import { zipSync, strToU8 } from 'fflate';

const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const addr = (tag, list) => `<${tag}>${list.map(([n, a]) => `<emailAddress OPFContactEmailAddressAddress="${x(a)}" OPFContactEmailAddressName="${x(n)}" OPFContactEmailAddressType="0"/>`).join('')}</${tag}>`;
function message({ subject, from, to, cc = [], sent, html, atts = [], id }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<emails><email>
<OPFMessageCopySubject>${x(subject)}</OPFMessageCopySubject>
<OPFMessageCopySentTime>${sent}</OPFMessageCopySentTime>
<OPFMessageCopyReceivedTime>${sent}</OPFMessageCopyReceivedTime>
${addr('OPFMessageCopyFromAddresses', [from])}
${addr('OPFMessageCopySenderAddress', [from])}
${addr('OPFMessageCopyToAddresses', to)}
${cc.length ? addr('OPFMessageCopyCCAddresses', cc) : ''}
<OPFMessageCopyMessageID>${x(id)}</OPFMessageCopyMessageID>
<OPFMessageCopyHTMLBody>${x(html)}</OPFMessageCopyHTMLBody>
${atts.length ? `<OPFMessageCopyAttachmentList>${atts.map((a) => `<messageAttachment OPFAttachmentContentExtension="${a.name.split('.').pop()}" OPFAttachmentContentFileSize="${a.data.length}" OPFAttachmentContentID="" OPFAttachmentContentType="${a.type}" OPFAttachmentName="${x(a.name)}" OPFAttachmentURL="${x(a.url)}"/>`).join('')}</OPFMessageCopyAttachmentList>` : ''}
</email></emails>`;
}

const acct = 'Accounts/test.user@example.com/com.microsoft.__Messages';
const pdf = strToU8('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const csv = strToU8('a,b\n1,2\n');
const files = {
  'Categories.xml': strToU8('<?xml version="1.0"?><categories/>'),
  [`${acct}/Inbox/message_00000.xml`]: strToU8(message({
    subject: 'Rechnung für März / 請求書', from: ['Jörg Müller', 'joerg@example.de'], to: [['Test User', 'test.user@example.com']],
    cc: [['山田 太郎', 'yamada@example.jp']], sent: '2024-03-05T09:15:00', id: '<olm-1@example.de>',
    html: '<html><body><p>Hallo, anbei die Rechnung.</p><p>よろしくお願いします。</p></body></html>',
    atts: [{ name: 'Rechnung-März.pdf', type: 'application/pdf', data: pdf, url: `${acct}/Inbox/com.microsoft.__Attachments/Rechnung-März.pdf` }],
  })),
  [`${acct}/Inbox/com.microsoft.__Attachments/Rechnung-März.pdf`]: pdf,
  [`${acct}/Inbox/message_00001.xml`]: strToU8(message({
    subject: 'Quarterly numbers', from: ['Alice Example', 'alice@example.com'], to: [['Test User', 'test.user@example.com'], ['Bob', 'bob@example.com']],
    sent: '2024-04-01T16:00:00', id: '<olm-2@example.com>', html: '<p>Numbers attached.</p><p>From the team</p>',
    atts: [{ name: 'numbers.csv', type: 'text/csv', data: csv, url: `${acct}/Inbox/com.microsoft.__Attachments/numbers.csv` }],
  })),
  [`${acct}/Inbox/com.microsoft.__Attachments/numbers.csv`]: csv,
  [`${acct}/Sent Items/message_00000.xml`]: strToU8(message({
    subject: 'Re: Quarterly numbers', from: ['Test User', 'test.user@example.com'], to: [['Alice Example', 'alice@example.com']],
    sent: '2024-04-02T08:30:00', id: '<olm-3@example.com>', html: '<p>Thanks!</p>\n<p>From Test</p>',
  })),
};
fs.writeFileSync(process.argv[2], zipSync(files, { level: 6 }));
console.log('wrote', process.argv[2]);
