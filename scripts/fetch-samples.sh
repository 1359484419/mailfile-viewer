#!/bin/sh
# Download public test files from open-source projects into a separate data-only directory.
# Usage: sh scripts/fetch-samples.sh [target_dir]   (default ../../samples-c23)
# The files are only read as data by the tests; nothing in them is executed.
set -eu
S="${1:-../../samples-c23}"
mkdir -p "$S/pst" "$S/msg" "$S/eml" "$S/tnef" "$S/generated"
dl() { [ -s "$2" ] || curl -sSfL -o "$2" "https://raw.githubusercontent.com/$1"; }   # idempotent
dl epfromer/pst-extractor/master/src/__tests__/testdata/enron.pst "$S/pst/enron.pst"
dl "epfromer/pst-extractor/master/src/__tests__/testdata/pstextractortest@outlook.com.ost" "$S/pst/test.ost"
for f in multi-to.msg strangeDate.msg unicode-header.msg unicode.msg; do dl "TeamMsgExtractor/msg-extractor/master/example-msg-files/$f" "$S/msg/$f"; done
for f in HtmlSampleEmailWithAttachment.msg RtfSampleEmail.msg EmailWith2Attachments.msg; do dl "Sicos1977/MSGReader/master/MsgReaderTests/SampleFiles/$f" "$S/msg/$f"; done
for f in mixed.eml mimetorture.eml calendar-event.eml bounce.eml; do dl "postalsys/postal-mime/master/test/fixtures/$f" "$S/eml/$f"; done
for f in body.tnef one-file.tnef two-files.tnef rtf.tnef umlaut.tnef long-filename.tnef MAPI_ATTACH_DATA_OBJ.tnef unicode-mapi-attr.tnef triples.tnef minimal_attachment.tnef IPM-DistList.tnef; do
  dl "koodaamo/tnefparse/master/tests/examples/$f" "$S/tnef/$f"; done
node test/fixtures/make-olm.mjs "$S/generated/sample.olm"
[ -s "$S/generated/sample.mbox" ] || python3 -I test/fixtures/make_mbox.py "$S/generated/sample.mbox" "$S"/eml/*.eml
echo "samples ready in $S"
