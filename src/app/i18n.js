const STRINGS = {
  en: {
    drop: 'Drop email files here', or: 'or', choose: 'Choose files',
    dropHint: '.msg · .eml · winmail.dat · .pst · .ost · .olm · .mbox — processed on this device, never uploaded',
    reading: 'Reading', loaded: 'Loaded', messages: 'messages', search: 'Search subject, sender, recipients…',
    searchBodies: 'Also search message bodies', exportAs: 'Export', exportScope: 'Scope',
    scopeFolder: 'Current folder', scopeAll: 'All loaded messages', scopeSelected: 'Selected message',
    expEml: 'EML files (.zip)', expMbox: 'MBOX mailbox', expCsv: 'Message list (CSV)', expContacts: 'Contacts (CSV)',
    expAtt: 'All attachments (.zip)', expPdf: 'Print / Save as PDF',
    from: 'From', to: 'To', cc: 'Cc', date: 'Date', subject: 'Subject', attachments: 'Attachments',
    noSubject: '(no subject)', download: 'Download', open: 'Open', saveEml: 'Save .eml', printPdf: 'Print / PDF',
    tabMessage: 'Message', tabText: 'Plain text', tabHeaders: 'Headers', remoteImages: 'Load remote images',
    remoteBlocked: 'Remote images are blocked to protect your privacy.', noHeaders: 'No internet headers stored in this item.',
    selectMessage: 'Select a message to read it.', empty: 'No messages match.', showMore: 'Show more',
    folders: 'Folders', close: 'Remove file', clearAll: 'Close all', working: 'Working…', done: 'Done',
    errTitle: 'Could not open this file', report: 'Report a parsing problem (no file is sent)', truncated: 'Only the first {n} messages were loaded.',
    back: 'Back', exportedN: 'Exported {n} messages', notEmbedded: 'Embedded item',
  },
  ja: {
    drop: 'メールファイルをここにドロップ', or: 'または', choose: 'ファイルを選択',
    dropHint: '.msg・.eml・winmail.dat・.pst・.ost・.olm・.mbox — この端末内で処理し、アップロードしません',
    reading: '読み込み中', loaded: '読み込み完了', messages: '件', search: '件名・差出人・宛先で検索…',
    searchBodies: '本文も検索', exportAs: 'エクスポート', exportScope: '対象',
    scopeFolder: '現在のフォルダー', scopeAll: '読み込んだ全メール', scopeSelected: '選択中のメール',
    expEml: 'EML ファイル (.zip)', expMbox: 'MBOX メールボックス', expCsv: 'メール一覧 (CSV)', expContacts: '連絡先 (CSV)',
    expAtt: '添付ファイル一括 (.zip)', expPdf: '印刷 / PDF 保存',
    from: '差出人', to: '宛先', cc: 'CC', date: '日時', subject: '件名', attachments: '添付ファイル',
    noSubject: '（件名なし）', download: 'ダウンロード', open: '開く', saveEml: '.eml で保存', printPdf: '印刷 / PDF',
    tabMessage: 'メッセージ', tabText: 'テキスト', tabHeaders: 'ヘッダー', remoteImages: '外部画像を表示',
    remoteBlocked: 'プライバシー保護のため外部画像はブロックしています。', noHeaders: 'このアイテムにはインターネットヘッダーがありません。',
    selectMessage: 'メールを選択すると表示されます。', empty: '該当するメールはありません。', showMore: 'さらに表示',
    folders: 'フォルダー', close: 'ファイルを閉じる', clearAll: 'すべて閉じる', working: '処理中…', done: '完了',
    errTitle: 'このファイルを開けませんでした', report: '解析エラーを報告（ファイルは送信されません）', truncated: '最初の {n} 件のみ読み込みました。',
    back: '戻る', exportedN: '{n} 件をエクスポートしました', notEmbedded: '埋め込みアイテム',
  },
  de: {
    drop: 'E-Mail-Dateien hier ablegen', or: 'oder', choose: 'Dateien auswählen',
    dropHint: '.msg · .eml · winmail.dat · .pst · .ost · .olm · .mbox — Verarbeitung auf diesem Gerät, kein Upload',
    reading: 'Wird gelesen', loaded: 'Geladen', messages: 'Nachrichten', search: 'Betreff, Absender, Empfänger suchen…',
    searchBodies: 'Auch Nachrichtentext durchsuchen', exportAs: 'Exportieren', exportScope: 'Umfang',
    scopeFolder: 'Aktueller Ordner', scopeAll: 'Alle geladenen Nachrichten', scopeSelected: 'Ausgewählte Nachricht',
    expEml: 'EML-Dateien (.zip)', expMbox: 'MBOX-Postfach', expCsv: 'Nachrichtenliste (CSV)', expContacts: 'Kontakte (CSV)',
    expAtt: 'Alle Anhänge (.zip)', expPdf: 'Drucken / Als PDF speichern',
    from: 'Von', to: 'An', cc: 'Cc', date: 'Datum', subject: 'Betreff', attachments: 'Anhänge',
    noSubject: '(kein Betreff)', download: 'Herunterladen', open: 'Öffnen', saveEml: 'Als .eml speichern', printPdf: 'Drucken / PDF',
    tabMessage: 'Nachricht', tabText: 'Nur Text', tabHeaders: 'Header', remoteImages: 'Externe Bilder laden',
    remoteBlocked: 'Externe Bilder sind zum Schutz Ihrer Privatsphäre blockiert.', noHeaders: 'Dieses Element enthält keine Internet-Header.',
    selectMessage: 'Wählen Sie eine Nachricht aus.', empty: 'Keine passenden Nachrichten.', showMore: 'Mehr anzeigen',
    folders: 'Ordner', close: 'Datei schließen', clearAll: 'Alle schließen', working: 'Wird verarbeitet…', done: 'Fertig',
    errTitle: 'Datei konnte nicht geöffnet werden', report: 'Parser-Problem melden (es wird keine Datei gesendet)', truncated: 'Nur die ersten {n} Nachrichten wurden geladen.',
    back: 'Zurück', exportedN: '{n} Nachrichten exportiert', notEmbedded: 'Eingebettetes Element',
  },
};

export function makeT(lang) {
  const dict = STRINGS[lang] || STRINGS.en;
  return (key, vars) => {
    let s = dict[key] ?? STRINGS.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  };
}
