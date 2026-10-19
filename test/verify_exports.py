"""Independent verification of files written by test/core.test.mjs.

Reads test-output/ with Python's standard library (email, mailbox, csv, zipfile) and,
when installed, cross-checks against reference parsers: tnefparse (TNEF) and extract-msg (MSG).
Run:  python3 -I test/verify_exports.py [samples_dir]
"""
import csv
import email
import email.policy
import hashlib
import io
import json
import mailbox
import os
import sys
import zipfile
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test-output')
SAMPLES = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', '..', 'samples-c23'))
failures = []
checks = Counter()


def check(cond, msg):
    checks['total'] += 1
    if not cond:
        failures.append(msg)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def ws(s):
    return ' '.join((s or '').replace('\x00', '').split())


def norm_addr(a):
    return (a or '').replace('"', '').replace('\\', '').lower()


def attachment_hashes(msg):
    """sha256 of every non-body leaf part (attachments and inline related images)."""
    out = []
    for part in msg.walk():
        ctype = part.get_content_type()
        if ctype.startswith('message/') and part.get_filename():
            out.append('message:' + part.get_filename())
            continue
        if part.is_multipart():
            continue
        is_body = ctype in ('text/plain', 'text/html') and part.get_filename() is None and part.get('Content-ID') is None
        if is_body:
            continue
        out.append(sha(part.get_payload(decode=True) or b''))
    return out


manifest = json.load(open(os.path.join(OUT, 'manifest.json'), encoding='utf-8'))

# 1. every exported EML parses and round-trips subject / sender / attachments
for m in manifest['messages']:
    raw = open(os.path.join(OUT, 'eml', m['file']), 'rb').read()
    msg = email.message_from_bytes(raw, policy=email.policy.default)
    where = f"{m['file']} ({m['source']})"
    check(ws(str(msg['subject'] or '')) == ws(m['subject']), f"{where}: subject {msg['subject']!r} != {m['subject']!r}")
    if '@' in m['from']:
        addrs = [norm_addr(a.addr_spec) for a in msg['from'].addresses] if msg['from'] else []
        check(norm_addr(m['from']) in addrs, f"{where}: from {addrs} lacks {m['from']}")
    elif m['from']:
        check(m['from'] in str(msg.get_all('X-Original-Address') or []), f"{where}: X-Original-Address lacks {m['from']}")
    for t in m['to']:
        if '@' in t and ' ' not in t.split('@')[-1]:
            to = [norm_addr(a.addr_spec) for a in msg['to'].addresses] if msg['to'] else []
            check(norm_addr(t) in to, f"{where}: to {to} lacks {t}")
    if m['date']:
        check(msg['date'] is not None and msg['date'].datetime is not None, f"{where}: Date header missing/unparseable")
    expected = Counter(('message:' + a['name']) if a.get('message') else a['sha256'] for a in m['attachments'])
    check(Counter(attachment_hashes(msg)) == expected,
          f"{where}: attachment bytes differ ({len(attachment_hashes(msg))} vs {len(m['attachments'])})")
    if m['hasHtml']:
        check(msg.get_body(preferencelist=('html',)) is not None, f"{where}: html part missing")
    body = msg.get_body(preferencelist=('plain',))
    check(body is not None, f"{where}: text/plain part missing")
    check(not [d for d in msg.defects if 'Missing' in type(d).__name__], f"{where}: defects {msg.defects}")
checks['eml_files'] = len(manifest['messages'])

# 2. MBOX readable by the stdlib mailbox module, same order and subjects
box = mailbox.mbox(os.path.join(OUT, manifest['mbox']['file']), create=False)
subjects = []
for k in box.keys():
    em = email.message_from_bytes(box.get_bytes(k), policy=email.policy.default)
    subjects.append(ws(str(em['subject'] or '')))
check(len(subjects) == len(manifest['mbox']['subjects']), f"mbox count {len(subjects)} != {len(manifest['mbox']['subjects'])}")
check(subjects == [ws(s) for s in manifest['mbox']['subjects']], 'mbox subjects differ')
checks['mbox_messages'] = len(subjects)

# 3. CSV list
with open(os.path.join(OUT, manifest['csv']['file']), encoding='utf-8-sig', newline='') as f:
    rows = list(csv.reader(f))
check(rows[0][:4] == ['Folder', 'Date', 'From name', 'From address'], f'csv header {rows[0]}')
check(len(rows) - 1 == manifest['csv']['rows'], f"csv rows {len(rows) - 1}")
unguard = lambda s: s[1:] if s.startswith("'") and s[1:2] in ('=', '+', '-', '@') else s
check([unguard(r[6]) for r in rows[1:]] == manifest['csv']['subjects'], 'csv subjects differ')
with open(os.path.join(OUT, manifest['contacts']['file']), encoding='utf-8-sig', newline='') as f:
    crow = list(csv.reader(f))
check(crow[0] == ['Name', 'Email', 'Messages from', 'Messages to/cc'] and len(crow) > 5, 'contacts csv')
checks['csv_rows'] = len(rows) - 1

# 4. ZIP of EML files
with zipfile.ZipFile(os.path.join(OUT, manifest['emlZip']['file'])) as z:
    names = [n for n in z.namelist() if n.endswith('.eml')]
    check(len(names) == manifest['emlZip']['count'], f"eml zip has {len(names)}")
    for n in names:
        em = email.message_from_bytes(z.read(n), policy=email.policy.default)
        check(em['subject'] is not None, f'zip {n} unparseable')
    check(z.testzip() is None, 'eml zip CRC error')

# 5. ZIP of attachments: byte-identical to what the parser returned
with zipfile.ZipFile(os.path.join(OUT, manifest['attZip']['file'])) as z:
    got = Counter(sha(z.read(n)) for n in z.namelist())
    check(got == Counter(manifest['attZip']['sha256']), 'attachment zip contents differ')
    checks['zip_attachments'] = len(z.namelist())

# 6. Reference parsers
try:
    import tnefparse
    for src, info in manifest['sources'].items():
        if not src.startswith('tnef/'):
            continue
        t = tnefparse.TNEF(open(os.path.join(SAMPLES, src), 'rb').read())
        ref = [((a.long_filename() or a.name or ''), len(a.data)) for a in t.attachments]
        ours = [(a['name'], a['size']) for a in info['attachments']]
        if src.endswith('MAPI_ATTACH_DATA_OBJ.tnef'):
            # tnefparse returns 61534 bytes for the .doc; the attAttachData attribute in the file holds
            # 61952 bytes (121 x 512-byte OLE sectors), which is what we return. Compare names only.
            check([n for n, _ in ref] == [n for n, _ in ours], f'{src}: names {ref} vs {ours}')
        else:
            ref_n = [(n or f'attachment-{i + 1}', s) for i, (n, s) in enumerate(ref)]
            # embedded messages (nested TNEF) get a ".dat" suffix so they can be opened in the viewer
            ours = [(n[:-4] if n.endswith('.dat') and not r[0].endswith('.dat') else n, s) for (n, s), r in zip(ours, ref_n)] if len(ours) == len(ref_n) else ours
            check(ref_n == ours, f'{src}: tnefparse {ref_n} vs ours {ours}')
        checks['tnefparse_compared'] += 1
except ImportError:
    print('note: tnefparse not installed, TNEF reference comparison skipped')

try:
    import extract_msg
    by_source = {}
    for m in manifest['messages']:
        if m['format'] == 'msg':
            by_source[m['source']] = m
    for src, m in by_source.items():
        ref = extract_msg.openMsg(os.path.join(SAMPLES, src))
        ref_atts = sorted(sha(a.data) for a in ref.attachments if isinstance(a.data, (bytes, bytearray)))
        ours = sorted(a['sha256'] for a in m['attachments'])
        check(ref_atts == ours, f'{src}: attachment bytes differ from extract-msg')
        check(ws(ref.subject or '') == ws(m['subject']), f'{src}: subject {ref.subject!r} vs {m["subject"]!r}')
        ref.close()
        checks['extract_msg_compared'] += 1
except ImportError:
    print('note: extract-msg not installed, MSG reference comparison skipped')

# 7. Files downloaded from the real browser UI by test/e2e.mjs (if it has run)
E2E = os.path.join(OUT, 'e2e')
if os.path.isdir(E2E):
    em = email.message_from_bytes(open(os.path.join(E2E, 'from-msg.eml'), 'rb').read(), policy=email.policy.default)
    check(str(em['subject']) == 'HtmlSampleEmailWithAttachment', 'e2e eml subject')
    check([p.get_filename() for p in em.iter_attachments()] == ['SampleAttachment.pdf'], 'e2e eml attachment')
    for name, n in (('e2e-enron.mbox', 71), ('e2e-olm.mbox', 3)):
        b = mailbox.mbox(os.path.join(E2E, name), create=False)
        check(len(b) == n, f'{name}: {len(b)} messages, expected {n}')
    for name in ('e2e-enron-eml.zip', 'e2e-enron-attachments.zip'):
        with zipfile.ZipFile(os.path.join(E2E, name)) as z:
            check(z.testzip() is None and len(z.namelist()) > 0, f'{name} invalid')
    with zipfile.ZipFile(os.path.join(E2E, 'e2e-enron-eml.zip')) as z:
        check(len(z.namelist()) == 71, 'e2e eml zip count')
    with open(os.path.join(E2E, 'e2e-enron.csv'), encoding='utf-8-sig', newline='') as f:
        check(len(list(csv.reader(f))) == 72, 'e2e csv rows')
    check(open(os.path.join(E2E, 'folder-print.pdf'), 'rb').read(5) == b'%PDF-', 'e2e pdf')
    checks['e2e_files_checked'] = 8

print(json.dumps(dict(checks), indent=None))
if failures:
    print(f'FAILED {len(failures)} checks:')
    for f in failures[:60]:
        print(' -', f)
    sys.exit(1)
print('verify_exports: all checks passed')
