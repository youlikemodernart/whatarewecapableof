import { escapeHtml } from './gmail-draft-mime.mjs';

function metadataRow(label, value) {
  return `<div class="meta-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function headingSummary(structure) {
  if (!structure) return 'Not applicable';
  return [1, 2, 3, 4, 5, 6].map((level) => `H${level}: ${structure[`h${level}Count`]}`).join(', ');
}

function listSummary(structure) {
  if (!structure) return 'Not applicable';
  return `Bullet: ${structure.bulletListCount}, ordered: ${structure.orderedListCount}, items: ${structure.listItemCount}`;
}

function renderFormatWarnings(warnings = []) {
  if (!warnings.length) return '';
  const items = warnings.map((warning) => `<li><code>${escapeHtml(warning.code)}</code>: ${escapeHtml(warning.message)}</li>`).join('');
  return `<section class="format-warnings" aria-labelledby="format-warnings-label"><h2 id="format-warnings-label">Formatting review required</h2><ul>${items}</ul></section>`;
}

export function renderDraftPreview(message) {
  const summary = message.summary;
  const renderedBody = message.previewHtmlBody || message.htmlBody || `<pre class="plain-only">${escapeHtml(message.body)}</pre>`;
  const imageDisabledBody = summary.inlineFigureCount
    ? renderedBody.replace(/src="data:image\/png;base64,[^"]+"/g, 'src="cid:wawco-disabled-preview"')
    : '';
  const metadata = [
    metadataRow('From', summary.fromEmail || summary.account),
    metadataRow('Gmail account', summary.account),
    metadataRow('Mail profile', summary.mailProfile || 'None'),
    metadataRow('To', summary.to.join(', ')),
    metadataRow('Cc', summary.cc.join(', ') || 'None'),
    metadataRow('Bcc', summary.defaultBccApplied ? summary.defaultBcc : 'Already included'),
    metadataRow('Subject', summary.subject),
    metadataRow('Input', summary.bodyFormat),
    metadataRow('MIME', summary.mimeType),
    metadataRow('System note', summary.systemNote),
    metadataRow('Signature', summary.signatureHtml),
    metadataRow('Attachments', summary.attachmentNames.join(', ') || 'None'),
    metadataRow('Data tables', String(summary.tableCount || 0)),
    metadataRow('Highlights', String(summary.highlightCount || 0)),
    metadataRow('Headings', headingSummary(summary.markdownStructure)),
    metadataRow('Paragraphs', summary.markdownStructure ? String(summary.markdownStructure.paragraphCount) : 'Not applicable'),
    metadataRow('Lists', listSummary(summary.markdownStructure)),
    metadataRow('Soft breaks', summary.markdownStructure ? String(summary.markdownStructure.softbreakCount) : 'Not applicable'),
    metadataRow('Hard breaks', summary.markdownStructure ? String(summary.markdownStructure.hardbreakCount) : 'Not applicable'),
    metadataRow('Format warnings', String(summary.formatWarnings?.length || 0)),
    metadataRow('Inline figures', summary.figureManifests?.map((figure) => figure.filename).join(', ') || 'None'),
  ].join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: cid:; font-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>Email preview: ${escapeHtml(summary.subject)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f6f7; color: #202124; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    main { width: min(1120px, calc(100% - 32px)); margin: 32px auto 64px; }
    h1 { margin: 0 0 8px; font-size: 24px; line-height: 30px; }
    .lede { margin: 0 0 24px; color: #5f6368; font-size: 14px; line-height: 20px; }
    .meta { margin: 0 0 24px; padding: 16px 20px; background: #fff; border: 1px solid #dadce0; border-radius: 8px; }
    .format-warnings { margin: 0 0 24px; padding: 16px 20px; background: #fff8e1; border: 1px solid #e0a100; border-radius: 8px; }
    .format-warnings h2 { margin: 0 0 8px; font-size: 16px; line-height: 22px; }
    .format-warnings ul { margin: 0; padding-left: 20px; font-size: 14px; line-height: 21px; }
    .format-warnings code { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 12px; }
    .meta dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 32px; margin: 0; }
    .meta-row { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; padding: 8px 0; border-bottom: 1px solid #eef0f1; }
    .meta-row:nth-last-child(-n+2) { border-bottom: 0; }
    dt { color: #5f6368; font-size: 13px; }
    dd { margin: 0; overflow-wrap: anywhere; font-size: 13px; }
    .panels { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr); gap: 24px; align-items: start; }
    .panel { min-width: 0; }
    .panel-label { margin: 0 0 8px; color: #5f6368; font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
    .email-surface, .text-surface { background: #fff; border: 1px solid #dadce0; border-radius: 8px; }
    .email-surface { padding: 32px; overflow: hidden; }
    .text-surface { margin: 0; padding: 20px; white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/20px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; }
    .plain-only { margin: 0; white-space: pre-wrap; font: 16px/24px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .degraded { margin-top: 24px; }
    .degraded-note { margin: 0 0 10px; color: #5f6368; font-size: 13px; line-height: 20px; }
    @media (max-width: 820px) {
      main { width: min(100% - 20px, 680px); margin-top: 20px; }
      .meta dl, .panels { grid-template-columns: 1fr; }
      .meta-row { grid-template-columns: 90px minmax(0, 1fr); }
      .email-surface { padding: 22px; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Email preview</h1>
    <p class="lede">Structurally faithful local rendering of the generated HTML fragment and plain-text alternative. This page does not emulate Gmail, Apple Mail, or Outlook.</p>
    <section class="meta" aria-label="Message metadata"><dl>${metadata}</dl></section>
    ${renderFormatWarnings(summary.formatWarnings)}
    <div class="panels">
      <section class="panel" aria-labelledby="html-label">
        <h2 class="panel-label" id="html-label">HTML alternative</h2>
        <div class="email-surface">${renderedBody}</div>
      </section>
      <section class="panel" aria-labelledby="text-label">
        <h2 class="panel-label" id="text-label">Plain-text alternative</h2>
        <pre class="text-surface">${escapeHtml(message.body)}</pre>
      </section>
    </div>
    ${imageDisabledBody ? `<section class="degraded" aria-labelledby="disabled-label">
      <h2 class="panel-label" id="disabled-label">Image-disabled structural simulation</h2>
      <p class="degraded-note">The figure sources are deliberately unresolved so alt text, caption order, and the absence of a reserved image frame can be inspected. This does not emulate a named mail client.</p>
      <div class="email-surface">${imageDisabledBody}</div>
    </section>` : ''}
  </main>
</body>
</html>`;
}
