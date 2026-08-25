import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';

import {
  BODY_FORMAT_HEADER,
  CONTENT_SHA256_HEADER,
  DEFAULT_ACCOUNT,
  DEFAULT_AGENT_BCC,
  DRAFT_HELPER_HEADER,
  DRAFT_HELPER_VERSION,
  FIGURE_HEADER,
  EXPRESSION_PROFILE_HEADER,
  EXPRESSION_PROFILE_VERSION_HEADER,
  EXPRESSION_PROFILE_SHA256_HEADER,
  HELLO_ACCOUNT,
  KAMP_AUTOMATED_SYSTEM_NOTE,
  KAMP_FROM_ADDRESS,
  QUIET_EDITORIAL_SYSTEM_NOTE,
  SIGNATURE_HEADER,
  SYSTEM_NOTE_HEADER,
  buildRawMessage,
  inspectInlinePng,
  resolveSenderPolicy,
  sanitizeTrustedSignatureHtml,
  semanticContentSha256,
} from './gmail-draft-mime.mjs';
import {
  decodeMarkdownStructure,
  encodeMarkdownStructure,
  figureDisplayDimensions,
  formatWarningsFromMarkdownStructure,
  HIGHLIGHT_PALETTE,
  MAX_HIGHLIGHT_CHARS,
  MAX_HIGHLIGHT_COUNT,
  renderMarkdownEmail,
} from './gmail-draft-markdown.mjs';
import {
  assertDraftApprovalToken,
  draftPayloadSha256,
  requireDraftApprovalToken,
  sendExactReviewedDraft,
  summarizeDraftSnapshot,
} from './gmail-draft-send.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const TEST_PNG_2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR42mMU91vGwMAAAAS2AQ2IIkhTAAAAAElFTkSuQmCC',
  'base64',
);

function testCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function replacePngChunkType(buffer, fromType, toType) {
  const output = Buffer.from(buffer);
  let offset = 8;
  while (offset + 12 <= output.length) {
    const length = output.readUInt32BE(offset);
    const dataEnd = offset + 8 + length;
    if (dataEnd + 4 > output.length) break;
    if (output.subarray(offset + 4, offset + 8).toString('ascii') === fromType) {
      output.write(toType, offset + 4, 4, 'ascii');
      output.writeUInt32BE(testCrc32(output.subarray(offset + 4, dataEnd)), dataEnd);
      return output;
    }
    offset = dataEnd + 4;
  }
  throw new Error(`Missing PNG chunk ${fromType}`);
}

function makePrivateSignatureFixture(mode = 0o600) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wawco-signature-fixture-'));
  const signaturePath = path.join(directory, 'current-noah-signature.html');
  fs.writeFileSync(signaturePath, '<div data-signature-fixture="private">Private signature fixture</div>', { mode: 0o600 });
  fs.chmodSync(signaturePath, mode);
  return { directory, signaturePath };
}

function messageArgs(overrides = {}) {
  return {
    to: 'recipient@example.invalid',
    subject: 'MIME policy test',
    ...overrides,
  };
}

async function buildPolicyFixtureRaw({
  account = 'hello@whatarewecapableof.com',
  fromEmail = account,
  text = 'Policy fixture',
  html = null,
  attachments = [],
  bodyFormat = html ? 'markdown' : 'plain',
  systemNote = 'none',
  signatureStatus = 'none',
  figureMode = 'none',
} = {}) {
  const normalizedAttachments = attachments.map((attachment) => ({
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    content: attachment.content,
  }));
  const contentDigest = semanticContentSha256({
    plainTextBody: text,
    htmlBody: html || '',
    attachments: normalizedAttachments,
  });
  const mail = new MailComposer({
    from: fromEmail,
    to: 'recipient@example.invalid',
    bcc: DEFAULT_AGENT_BCC,
    subject: 'Reviewed policy fixture',
    text,
    html: html || undefined,
    attachments: normalizedAttachments.map((attachment, index) => ({
      filename: attachment.filename,
      contentType: attachment.mimeType,
      content: attachment.content,
      contentDisposition: attachments[index].disposition || 'attachment',
      cid: attachments[index].cid,
    })),
    headers: {
      [DRAFT_HELPER_HEADER]: DRAFT_HELPER_VERSION,
      [CONTENT_SHA256_HEADER]: contentDigest,
      [BODY_FORMAT_HEADER]: bodyFormat,
      [SYSTEM_NOTE_HEADER]: systemNote,
      [SIGNATURE_HEADER]: signatureStatus,
      [FIGURE_HEADER]: figureMode,
    },
    newline: 'windows',
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const compiled = mail.compile();
  compiled.keepBcc = true;
  return (await compiled.build()).toString('base64url');
}

test('noah@ defaults to a multipart quiet-editorial system note', async () => {
  const message = await buildRawMessage(messageArgs({
    reply: true,
    cc: 'cc@example.invalid',
    bcc: 'bcc@example.invalid',
    'thread-id': 'thread-123',
    'in-reply-to': '<message-123@example.invalid>',
    references: '<root@example.invalid> <message-123@example.invalid>',
  }), 'First line\nSecond line', { boundary: 'test-boundary' });

  assert.equal(message.account, DEFAULT_ACCOUNT);
  assert.equal(message.summary.systemNote, 'quiet-editorial');
  assert.equal(message.summary.mailProfileId, 'wawco-house');
  assert.equal(message.summary.expressionProfileId, 'wawco.email.house');
  assert.equal(message.summary.expressionProfileVersion, '1.2.0');
  assert.match(message.summary.expressionProfileSha256, /^[a-f0-9]{64}$/);
  assert.equal(message.summary.mailProfileVersion, '1.0.0');
  assert.match(message.summary.mailProfilePolicySha256, /^[a-f0-9]{64}$/);
  assert.equal(message.summary.mimeType, 'multipart/alternative');
  assert.equal(message.summary.signatureHtml, 'none');
  assert.equal(message.summary.reply, true);
  assert.equal(message.summary.threadId, 'thread-123');
  assert.equal(message.summary.bccCount, 2);
  assert.equal(message.summary.defaultBcc, DEFAULT_AGENT_BCC);
  assert.equal(message.summary.defaultBccApplied, true);
  assert.equal(message.summary.hasInReplyTo, true);
  assert.equal(message.summary.hasReferences, true);
  assert.match(message.raw, /In-Reply-To: <message-123@example\.invalid>/);
  assert.match(message.raw, /References: <root@example\.invalid> <message-123@example\.invalid>/);
  assert.match(message.raw, /Content-Type: multipart\/alternative;\r\n boundary="--_WAWCO-test-boundary-Part_1"/);
  assert.match(message.raw, /----_WAWCO-test-boundary-Part_1\r\nContent-Type: text\/plain; charset=utf-8/);
  assert.match(message.raw, /----_WAWCO-test-boundary-Part_1\r\nContent-Type: text\/html; charset=utf-8/);
  assert.ok(message.body.includes(QUIET_EDITORIAL_SYSTEM_NOTE));
  assert.match(message.htmlBody, /System note/);
  assert.match(message.htmlBody, /Drafted with our system/);
});

test('kamp-love profile uses the hello@ mailbox, kamp@ From identity, automated note, and approved signature', async () => {
  const signatureFixture = '<div><a href="mailto:kamp@whatarewecapableof.com">Kamp signature fixture</a></div>';
  const message = await buildRawMessage(messageArgs({ 'mail-profile': 'kamp-love' }), 'Kamp body', {
    boundary: 'kamp-profile-boundary',
    signatureHtml: signatureFixture,
  });

  assert.equal(message.account, HELLO_ACCOUNT);
  assert.equal(message.fromEmail, KAMP_FROM_ADDRESS);
  assert.equal(message.summary.mailProfile, 'kamp-love');
  assert.equal(message.summary.mailProfileId, 'kamp-love');
  assert.equal(message.summary.expressionProfileId, null);
  assert.equal(message.summary.mailProfileVersion, '1.0.0');
  assert.match(message.summary.mailProfilePolicySha256, /^[a-f0-9]{64}$/);
  assert.equal(message.summary.systemNote, 'kamp-automated');
  assert.equal(message.summary.signatureHtml, 'provided');
  assert.ok(message.body.includes(KAMP_AUTOMATED_SYSTEM_NOTE));
  assert.match(message.raw, /From: Noah Glynn <kamp@whatarewecapableof\.com>/);
  assert.match(message.htmlBody, /data-wawco-system-note="kamp-automated"/);

  const reviewed = await summarizeDraftSnapshot({
    account: HELLO_ACCOUNT,
    draft: { id: 'kamp-local', message: { sizeEstimate: message.rawBuffer.length } },
    raw: message.rawBuffer.toString('base64url'),
  });
  assert.equal(reviewed.fromEmail, KAMP_FROM_ADDRESS);
  assert.equal(reviewed.systemNote, 'kamp-automated');
  assert.equal(reviewed.signatureHtml, 'provided');
});

test('stored MIME review binds the current accepted WAWCO expression profile', async () => {
  const message = await buildRawMessage(messageArgs(), 'WAWCO profile body', { signatureHtml: '<div>Signature</div>' });
  const reviewed = await summarizeDraftSnapshot({
    account: DEFAULT_ACCOUNT,
    draft: { id: 'wawco-expression-bound', message: { sizeEstimate: message.rawBuffer.length } },
    raw: message.rawBuffer.toString('base64url'),
  });
  assert.equal(reviewed.expressionProfileId, 'wawco.email.house');
  assert.equal(reviewed.expressionProfileVersion, '1.2.0');
  assert.equal(reviewed.expressionProfileSha256, message.summary.expressionProfileSha256);

  const tampered = Buffer.from(message.rawBuffer.toString('utf8').replace(
    new RegExp(`(${EXPRESSION_PROFILE_VERSION_HEADER}:\\s*)1\\.2\\.0`, 'i'),
    (_, prefix) => `${prefix}9.9.9`,
  ), 'utf8');
  await assert.rejects(
    summarizeDraftSnapshot({
      account: DEFAULT_ACCOUNT,
      draft: { id: 'wawco-expression-tampered', message: { sizeEstimate: tampered.length } },
      raw: tampered.toString('base64url'),
    }),
    /expression profile does not match/,
  );
});

test('stored MIME review binds the canonical explicitly selected mail profile', async () => {
  const message = await buildRawMessage(messageArgs({ 'mail-profile': 'kamp-love' }), 'Kamp body', {
    signatureHtml: '<div>Kamp signature fixture</div>',
  });
  const expected = resolveSenderPolicy({ 'mail-profile': 'kamp-love' });
  const reviewed = await summarizeDraftSnapshot({
    account: expected.account,
    expectedSenderPolicy: { ...expected, effectiveSystemNoteKind: 'kamp-automated' },
    draft: { id: 'kamp-policy-bound', message: { sizeEstimate: message.rawBuffer.length } },
    raw: message.rawBuffer.toString('base64url'),
  });
  assert.equal(reviewed.mailProfileId, 'kamp-love');
  await assert.rejects(
    summarizeDraftSnapshot({
      account: expected.account,
      expectedSenderPolicy: { ...expected, id: 'wawco-house', effectiveSystemNoteKind: 'kamp-automated' },
      draft: { id: 'kamp-policy-wrong', message: { sizeEstimate: message.rawBuffer.length } },
      raw: message.rawBuffer.toString('base64url'),
    }),
    /profile ID does not match/,
  );
});

test('stored MIME review binds an allowed WAWCO display-name override to the explicit effective policy', async () => {
  const args = messageArgs({ 'from-name': 'Noah G.\r\nInjected' });
  const message = await buildRawMessage(args, 'WAWCO body', { signatureHtml: '<div>Signature</div>' });
  const expected = resolveSenderPolicy(args);
  const reviewed = await summarizeDraftSnapshot({
    account: expected.account,
    expectedSenderPolicy: { ...expected, effectiveSystemNoteKind: 'quiet-editorial' },
    draft: { id: 'wawco-name-bound', message: { sizeEstimate: message.rawBuffer.length } },
    raw: message.rawBuffer.toString('base64url'),
  });
  assert.equal(reviewed.fromName, 'Noah G. Injected');
  await assert.rejects(
    summarizeDraftSnapshot({
      account: expected.account,
      expectedSenderPolicy: { ...expected, fromName: 'Different Name', effectiveSystemNoteKind: 'quiet-editorial' },
      draft: { id: 'wawco-name-wrong', message: { sizeEstimate: message.rawBuffer.length } },
      raw: message.rawBuffer.toString('base64url'),
    }),
    /display name does not match/,
  );
});

test('hello account fails closed at review and send policy resolution without kamp-love', () => {
  assert.throws(() => resolveSenderPolicy({ account: HELLO_ACCOUNT }, { requireExplicitHelloProfile: true }), /requires an explicit approved --mail-profile/);
});

test('distinct From identities fail closed without the approved kamp-love profile', async () => {
  assert.throws(
    () => buildRawMessage(messageArgs({ account: HELLO_ACCOUNT, 'from-email': KAMP_FROM_ADDRESS }), 'Body'),
    /requires an explicit approved --mail-profile|requires an approved --mail-profile/,
  );
  assert.throws(
    () => buildRawMessage(messageArgs({ 'mail-profile': 'kamp-love', account: DEFAULT_ACCOUNT }), 'Body'),
    /must use hello@whatarewecapableof\.com/,
  );
});

test('a reply fails closed without complete Gmail thread fields', async () => {
  for (const [args, error] of [
    [messageArgs({ 'thread-id': 'thread-123', references: '<root@example.invalid> <parent@example.invalid>' }), /reply requires --in-reply-to/],
    [messageArgs({ reply: true, 'in-reply-to': '<parent@example.invalid>', references: '<root@example.invalid> <parent@example.invalid>' }), /reply requires --thread-id/],
    [messageArgs({ reply: true, 'thread-id': 'thread-123', references: '<root@example.invalid> <parent@example.invalid>' }), /reply requires --in-reply-to/],
    [messageArgs({ reply: true, 'thread-id': 'thread-123', 'in-reply-to': '<parent@example.invalid>' }), /reply requires --references/],
    [messageArgs({ reply: 'true', 'thread-id': 'thread-123', 'in-reply-to': '<parent@example.invalid>', references: '<root@example.invalid> <parent@example.invalid>' }), /Use bare --reply/],
  ]) {
    assert.throws(() => buildRawMessage(args, 'Reply body'), error);
  }
});

test('complete threading fields imply reply intent even without --reply', async () => {
  const message = await buildRawMessage(messageArgs({
    'thread-id': 'thread-123',
    'in-reply-to': '<parent@example.invalid>',
    references: '<root@example.invalid> <parent@example.invalid>',
  }), 'Reply body');

  assert.equal(message.summary.reply, true);
  assert.equal(message.summary.threadId, 'thread-123');
  assert.equal(message.summary.hasInReplyTo, true);
  assert.equal(message.summary.hasReferences, true);
});

test('noah@ HTML is a transparent fragment and preserves a trusted signature tail', async () => {
  const signatureFixture = '<div data-signature-fixture="tail"><a href="https://example.invalid/">Signature fixture</a></div>';
  const message = await buildRawMessage(messageArgs(), '<script>body</script>', {
    boundary: 'transparent-signature-boundary',
    signatureHtml: signatureFixture,
  });

  assert.equal(message.summary.signatureHtml, 'provided');
  assert.doesNotMatch(message.htmlBody, /<!doctype|<html\b|<head\b|<body\b|<table\b/i);
  assert.doesNotMatch(message.htmlBody, /background(?:-color)?|#(?:fff|ffffff|000|000000)/i);
  assert.match(message.htmlBody, /&lt;script&gt;body&lt;\/script&gt;/);
  assert.ok(message.htmlBody.indexOf('System note') < message.htmlBody.indexOf('Signature fixture'));
  assert.match(message.htmlBody, /<a href="https:\/\/example\.invalid\/">Signature fixture<\/a>/);
  assert.doesNotMatch(message.htmlBody, /data-signature-fixture|target=|<script|onerror=/i);
});

test('trusted signature sanitizer strips active content, unsafe URLs, and unsupported styles', async () => {
  const dirty = [
    '<div onclick="steal()" style="color:#123456;font-family:Arial;position:fixed;background-image:url(https://tracker.invalid/pixel)">',
    '<script>alert(1)</script>',
    '<img src="https://tracker.invalid/pixel.png" onerror="steal()">',
    '<a href="javascript:alert(1)" target="_blank">Unsafe link</a>',
    '<a href="//tracker.invalid/path">Protocol-relative link</a>',
    '<a href="mailto:hello@example.invalid" style="text-decoration:underline">Safe mail link</a>',
    '<span style="font-size:16px;line-height:1.5;behavior:url(x)">Safe text</span>',
    '</div>',
  ].join('');

  const sanitized = sanitizeTrustedSignatureHtml(dirty);
  assert.doesNotMatch(sanitized, /<script|<img|onclick=|onerror=|target=|javascript:|tracker\.invalid|position:|background|behavior:/i);
  assert.match(sanitized, /style="color:#123456;font-family:Arial"/);
  assert.match(sanitized, /href="mailto:hello@example\.invalid"/);
  assert.match(sanitized, /style="font-size:16px;line-height:1.5"/);
  assert.throws(() => sanitizeTrustedSignatureHtml('<script>alert(1)</script>'), /empty after email-safe sanitization/);
  assert.throws(() => sanitizeTrustedSignatureHtml('safe\0unsafe'), /without NUL bytes/);
});

test('trusted signature HTML is rejected outside noah@ system-note MIME', async () => {
  const signatureFixture = '<div data-signature-fixture="tail">Signature fixture</div>';

  assert.throws(
    () => buildRawMessage(messageArgs({ account: 'hello@whatarewecapableof.com' }), 'Plain body', { signatureHtml: signatureFixture }),
    /Trusted signature HTML is only permitted/,
  );
  assert.throws(
    () => buildRawMessage(messageArgs({ 'system-note': 'none' }), 'Plain body', { signatureHtml: signatureFixture }),
    /Trusted signature HTML is only permitted/,
  );
});

test('noah@ --system-note=none keeps the original plain-text payload', async () => {
  const message = await buildRawMessage(messageArgs({ 'system-note': 'none' }), 'Plain body');

  assert.equal(message.summary.systemNote, 'none');
  assert.equal(message.summary.mimeType, 'text/plain');
  assert.equal(message.htmlBody, null);
  assert.doesNotMatch(message.raw, /Drafted with our system/);
  assert.match(message.raw, /Content-Type: text\/plain; charset=utf-8/);
  assert.match(message.raw, /Content-Transfer-Encoding: 7bit/);
  assert.equal(message.body, 'Plain body');
});

test('hello@ retains plain-text semantics through RFC-capable serialization', async () => {
  const message = await buildRawMessage(messageArgs({
    account: 'hello@whatarewecapableof.com',
    'from-name': 'What are we capable of?',
    cc: 'cc@example.invalid',
    bcc: 'bcc@example.invalid',
    'in-reply-to': '<message-hello@example.invalid>',
    references: '<root@example.invalid> <message-hello@example.invalid>',
  }), 'Hello\nWorld', {
    serializer: {
      date: new Date('2026-07-23T12:00:00Z'),
      messageId: '<message-test@example.invalid>',
      baseBoundary: 'hello-plain-test',
    },
  });

  assert.match(message.raw, /From: "What are we capable of\?" <hello@whatarewecapableof\.com>/);
  assert.match(message.raw, /To: recipient@example\.invalid/);
  assert.match(message.raw, /Cc: cc@example\.invalid/);
  assert.match(message.raw, /Bcc: bcc@example\.invalid, noah@whatarewecapableof\.com/);
  assert.match(message.raw, /In-Reply-To: <message-hello@example\.invalid>/);
  assert.match(message.raw, /References: <root@example\.invalid> <message-hello@example\.invalid>/);
  assert.match(message.raw, /Message-ID: <message-test@example\.invalid>/);
  assert.match(message.raw, /Content-Type: text\/plain; charset=utf-8/);
  assert.match(message.raw, /\r\n\r\nHello\r\nWorld\r\n$/);
  assert.equal(message.summary.systemNote, 'none');
  assert.equal(message.summary.mimeType, 'text/plain');
  assert.equal(message.htmlBody, null);
});

test('Unicode display names, subjects, bodies, and PDF filenames receive RFC-safe encodings', async () => {
  const message = await buildRawMessage(messageArgs({
    account: 'hello@whatarewecapableof.com',
    'from-name': 'Noah Glynn ✓',
    subject: 'Résumé ✓',
  }), 'Hello, Zoë ✓', {
    attachments: [{
      filename: 'résumé-✓.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('%PDF-test'),
    }],
    serializer: {
      date: new Date('2026-07-23T12:00:00Z'),
      messageId: '<unicode-test@example.invalid>',
      baseBoundary: 'unicode-test',
    },
  });

  assert.match(message.raw, /From: =\?UTF-8\?Q\?Noah_Glynn_=E2=9C=93\?=/);
  assert.match(message.raw, /Subject: =\?UTF-8\?Q\?R=C3=A9sum=C3=A9_=E2=9C=93\?=/);
  assert.match(message.raw, /Content-Transfer-Encoding: quoted-printable\r\n\r\nHello, Zo=C3=AB =E2=9C=93/);
  assert.match(message.raw, /name="=\?UTF-8\?Q\?r=C3=A9sum=C3=A9-=E2=9C=93=2Epdf\?="/);
  assert.match(message.raw, /filename\*0\*=utf-8''r%C3%A9sum%C3%A9-%E2%9C%93\.pdf/);
  assert.deepEqual(message.summary.attachmentNames, ['résumé-✓.pdf']);
  assert.equal(message.summary.subject, 'Résumé ✓');
});

test('non-noah accounts never gain the system note and may use the structured Markdown surface', async () => {
  const plain = await buildRawMessage(messageArgs({ account: 'other@whatarewecapableof.com' }), 'Plain body');
  assert.equal(plain.summary.systemNote, 'none');
  assert.equal(plain.summary.mimeType, 'text/plain');
  assert.doesNotMatch(plain.raw, /Drafted with our system/);

  const markdown = await buildRawMessage(
    messageArgs({ account: 'hello@whatarewecapableof.com' }),
    '## Structured body\n\nSafe content.',
    { bodyFormat: 'markdown', boundary: 'hello-markdown' },
  );
  assert.equal(markdown.summary.systemNote, 'none');
  assert.equal(markdown.summary.signatureHtml, 'none');
  assert.equal(markdown.summary.mimeType, 'multipart/alternative');
  assert.match(markdown.htmlBody, /<h2[^>]*>Structured body<\/h2>/);
});

test('every agent draft defaults to a Noah Bcc without duplicating an existing recipient', async () => {
  const defaulted = await buildRawMessage(messageArgs(), 'Plain body');
  assert.equal(defaulted.summary.defaultBcc, DEFAULT_AGENT_BCC);
  assert.equal(defaulted.summary.defaultBccApplied, true);
  assert.equal(defaulted.summary.bccCount, 1);
  assert.match(defaulted.raw, /Bcc: noah@whatarewecapableof\.com/);

  const alreadyVisible = await buildRawMessage(messageArgs({ cc: DEFAULT_AGENT_BCC }), 'Plain body');
  assert.equal(alreadyVisible.summary.defaultBccApplied, false);
  assert.equal(alreadyVisible.summary.bccCount, 0);
});

test('quiet-editorial HTML escapes body text before rendering', async () => {
  const message = await buildRawMessage(messageArgs(), '<script>& "quoted" \'single\'');

  assert.match(message.htmlBody, /&lt;script&gt;&amp; &quot;quoted&quot; &#39;single&#39;/);
  assert.doesNotMatch(message.htmlBody, /<script>/);
});

test('restricted Markdown renders intentional HTML and plain-text alternatives', async () => {
  const markdown = [
    '# Setup',
    '',
    'Use **PiOp** in this order:',
    '',
    '- Accept the invitation',
    '- Run `pi --version`',
    '',
    '```bash',
    'pi install git:github.com/example/tool@v1.0.0',
    '```',
    '',
    '> Quoted context',
    '',
    '[Read the guide](https://example.invalid/guide)',
  ].join('\n');
  const message = await buildRawMessage(messageArgs(), markdown, {
    bodyFormat: 'markdown',
    boundary: 'markdown-boundary',
  });

  assert.equal(message.summary.bodyFormat, 'markdown');
  assert.equal(message.summary.mimeType, 'multipart/alternative');
  assert.match(message.htmlBody, /<h1[^>]*>Setup<\/h1>/);
  assert.match(message.htmlBody, /<strong[^>]*>PiOp<\/strong>/);
  assert.match(message.htmlBody, /<ul[^>]*>/);
  assert.match(message.htmlBody, /<pre[^>]*>.*pi install/s);
  assert.match(message.htmlBody, /href="https:\/\/example\.invalid\/guide"/);
  assert.match(message.htmlBody, /<!--\[if mso\]><table role="presentation" width="640"/);
  assert.match(message.htmlBody, /width="100%"[^>]*max-width:640px/);
  assert.match(message.htmlBody, /<blockquote[^>]*border-left:2px solid #bdc1c6/);
  assert.doesNotMatch(message.htmlBody, /```|\*\*PiOp\*\*|# Setup/);
  assert.match(message.body, /^Setup\r?\n/m);
  assert.match(message.body, /- Accept the invitation/);
  assert.match(message.body, /pi install git:github\.com\/example\/tool@v1\.0\.0/);
  assert.match(message.body, /Read the guide <https:\/\/example\.invalid\/guide>/);
  assert.doesNotMatch(message.body, /```|\*\*PiOp\*\*|# Setup/);
  assert.match(message.body, /Drafted with our system/);
});

test('Markdown structure distinguishes soft breaks, hard breaks, and paragraph boundaries', () => {
  const soft = renderMarkdownEmail('Alpha\nBeta');
  assert.equal(soft.markdownStructure.paragraphCount, 1);
  assert.equal(soft.markdownStructure.softbreakCount, 1);
  assert.equal(soft.markdownStructure.hardbreakCount, 0);
  assert.equal(soft.formatWarnings.length, 1);
  assert.equal(soft.formatWarnings[0].code, 'markdown-softbreaks-render-as-spaces');
  assert.doesNotMatch(soft.html, /Alpha<br>/);
  assert.match(soft.plainText, /Alpha Beta/);

  const hard = renderMarkdownEmail('Alpha  \nBeta');
  assert.equal(hard.markdownStructure.softbreakCount, 0);
  assert.equal(hard.markdownStructure.hardbreakCount, 1);
  assert.deepEqual(hard.formatWarnings, []);
  assert.match(hard.html, /Alpha<br>/);
  assert.match(hard.plainText, /Alpha\nBeta/);

  const backslashHard = renderMarkdownEmail(['Alpha\\', 'Beta'].join('\n'));
  assert.equal(backslashHard.markdownStructure.softbreakCount, 0);
  assert.equal(backslashHard.markdownStructure.hardbreakCount, 1);
  assert.deepEqual(backslashHard.formatWarnings, []);
  assert.match(backslashHard.html, /Alpha<br>/);
  assert.match(backslashHard.plainText, /Alpha\nBeta/);

  const paragraphs = renderMarkdownEmail('Alpha\n\nBeta');
  assert.equal(paragraphs.markdownStructure.paragraphCount, 2);
  assert.equal(paragraphs.markdownStructure.softbreakCount, 0);
  assert.deepEqual(paragraphs.formatWarnings, []);
});

test('Markdown structure makes bare section labels and explicit headings distinguishable', () => {
  const bare = renderMarkdownEmail('Mailchimp\n\nBody one.\n\nKlaviyo\n\nBody two.');
  assert.equal(bare.markdownStructure.h2Count, 0);
  assert.equal(bare.markdownStructure.paragraphCount, 4);

  const headed = renderMarkdownEmail('## Mailchimp\n\nBody one.\n\n## Klaviyo\n\nBody two.');
  assert.equal(headed.markdownStructure.h2Count, 2);
  assert.equal(headed.markdownStructure.paragraphCount, 2);
});

test('Markdown structure metadata is canonical, bounded, and produces deterministic warnings', () => {
  const rendered = renderMarkdownEmail('## Address\n\nUnitus\n5605 North Glenwood Street');
  const encoded = encodeMarkdownStructure(rendered.markdownStructure);
  assert.deepEqual(decodeMarkdownStructure(encoded), rendered.markdownStructure);
  assert.deepEqual(formatWarningsFromMarkdownStructure(decodeMarkdownStructure(encoded)), rendered.formatWarnings);
  assert.throws(() => decodeMarkdownStructure('not+base64url'), /malformed/);

  const reordered = { softbreakCount: 1, ...rendered.markdownStructure };
  assert.throws(() => encodeMarkdownStructure(reordered), /noncanonical fields/);
  const negative = { ...rendered.markdownStructure, hardbreakCount: -1 };
  assert.throws(() => encodeMarkdownStructure(negative), /nonnegative safe integer/);
});

test('Markdown structure and warnings survive the reviewed MIME boundary', async () => {
  const message = await buildRawMessage(
    messageArgs({ account: 'hello@whatarewecapableof.com', 'system-note': 'none' }),
    'Unitus\n5605 North Glenwood Street',
    { bodyFormat: 'markdown', boundary: 'markdown-structure-review' },
  );
  const reviewed = await summarizeDraftSnapshot({
    account: 'hello@whatarewecapableof.com',
    draft: { id: 'markdown-structure', message: { sizeEstimate: message.rawBuffer.length } },
    raw: message.rawBuffer.toString('base64url'),
  });

  assert.deepEqual(reviewed.markdownStructure, message.summary.markdownStructure);
  assert.deepEqual(reviewed.formatWarnings, message.summary.formatWarnings);
  assert.equal(reviewed.markdownStructure.softbreakCount, 1);
  assert.equal(reviewed.formatWarnings[0].code, 'markdown-softbreaks-render-as-spaces');

  const headerPattern = /X-Wawco-Markdown-Structure:\r\n [^\r\n]+\r\n/;
  assert.match(message.raw, headerPattern);
  const originalHeader = message.raw.match(headerPattern)[0];
  const lowercaseHeaderRaw = Buffer.from(
    message.raw.replace('X-Wawco-Markdown-Structure:', 'x-wawco-markdown-structure:'),
    'utf8',
  ).toString('base64url');
  const lowercaseHeader = await summarizeDraftSnapshot({
    account: 'hello@whatarewecapableof.com',
    draft: { id: 'lowercase-structure-header' },
    raw: lowercaseHeaderRaw,
  });
  assert.deepEqual(lowercaseHeader.markdownStructure, message.summary.markdownStructure);

  const duplicateHeaderRaw = Buffer.from(
    message.raw.replace(originalHeader, `${originalHeader}${originalHeader}`),
    'utf8',
  ).toString('base64url');
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'duplicate-structure' }, raw: duplicateHeaderRaw }),
    /Markdown structure header is missing, malformed, or oversized/,
  );

  const malformedRaw = Buffer.from(
    message.raw.replace(headerPattern, 'X-Wawco-Markdown-Structure: not+base64url\r\n'),
    'utf8',
  ).toString('base64url');
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'malformed-structure' }, raw: malformedRaw }),
    /Markdown structure header is missing, malformed, or oversized/,
  );

  const strippedRaw = Buffer.from(message.raw.replace(headerPattern, ''), 'utf8').toString('base64url');
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'stripped-structure' }, raw: strippedRaw }),
    /X-WAWCO-Content-SHA256 does not match/,
  );

  const legacyRaw = await buildPolicyFixtureRaw({ text: 'Legacy body', html: '<div>Legacy body</div>' });
  const legacy = await summarizeDraftSnapshot({
    account: 'hello@whatarewecapableof.com',
    draft: { id: 'legacy-markdown' },
    raw: legacyRaw,
  });
  assert.equal(legacy.markdownStructure, null);
  assert.equal(legacy.formatWarnings[0].code, 'markdown-structure-unavailable');
});

test('v1.4 highlights render default and named palette colors with plain-text fallback', async () => {
  const markdown = [
    'The primary result is ==$98,218.48 in ecommerce revenue==.',
    '',
    'A second result uses =={hot-pink}a named special emphasis==.',
    '',
    'Unsafe-looking text stays literal: ==<script>alert(1)</script>==.',
  ].join('\n');
  const message = await buildRawMessage(messageArgs({ 'system-note': 'none' }), markdown, {
    bodyFormat: 'markdown',
    boundary: 'highlight-component',
  });

  assert.equal(message.summary.highlightCount, 3);
  assert.match(message.htmlBody, /<span style="background:#ffe08a;color:#202124;padding:1px 2px;">\$98,218\.48 in ecommerce revenue<\/span>/);
  assert.match(message.htmlBody, /<span style="background:#ff4fd8;color:#202124;padding:1px 2px;">a named special emphasis<\/span>/);
  assert.match(message.htmlBody, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(message.htmlBody, /<script>/);
  assert.match(message.body, /The primary result is \$98,218\.48 in ecommerce revenue\./);
  assert.match(message.body, /A second result uses a named special emphasis\./);
  assert.doesNotMatch(message.body, /==|\{hot-pink\}/);

  const summary = await summarizeDraftSnapshot({
    account: DEFAULT_ACCOUNT,
    draft: { id: 'highlight-draft', message: { sizeEstimate: message.rawBuffer.length } },
    raw: message.rawBuffer.toString('base64url'),
  });
  assert.equal(summary.bodyFormat, 'markdown');
  assert.equal(summary.contentSha256, message.summary.contentSha256);
});

test('v1.4 highlight palette renders every allowlisted candidate color', async () => {
  const markdown = Object.keys(HIGHLIGHT_PALETTE)
    .map((name) => `=={${name}}${name} sample text==`)
    .join('\n\n');
  const message = await buildRawMessage(messageArgs({ 'system-note': 'none' }), markdown, {
    bodyFormat: 'markdown',
    boundary: 'highlight-palette',
  });

  assert.equal(message.summary.highlightCount, Object.keys(HIGHLIGHT_PALETTE).length);
  for (const [name, color] of Object.entries(HIGHLIGHT_PALETTE)) {
    assert.match(message.htmlBody, new RegExp(`background:${color};[^>]+>${name} sample text<\\/span>`));
    assert.match(message.body, new RegExp(`^${name} sample text$`, 'm'));
  }
});

test('v1.4 highlights enforce palette, length, count, and inline boundaries', () => {
  assert.throws(
    () => buildRawMessage(messageArgs(), '=={unknown}Unsupported==', { bodyFormat: 'markdown' }),
    /unsupported palette name: unknown/,
  );
  assert.throws(
    () => buildRawMessage(messageArgs(), `==${'x'.repeat(MAX_HIGHLIGHT_CHARS + 1)}==`, { bodyFormat: 'markdown' }),
    new RegExp(`at most ${MAX_HIGHLIGHT_CHARS} characters`),
  );
  assert.throws(
    () => buildRawMessage(
      messageArgs(),
      Array.from({ length: MAX_HIGHLIGHT_COUNT + 1 }, (_, index) => `==item ${index + 1}==`).join(' '),
      { bodyFormat: 'markdown' },
    ),
    new RegExp(`at most ${MAX_HIGHLIGHT_COUNT} highlights`),
  );

  const unclosed = buildRawMessage(messageArgs({ 'system-note': 'none' }), 'Literal ==unclosed marker.', { bodyFormat: 'markdown' });
  return Promise.resolve(unclosed).then((message) => {
    assert.equal(message.summary.highlightCount, 0);
    assert.match(message.body, /Literal ==unclosed marker\./);
  });
});

test('v1.1 data tables render semantic HTML and a useful plain-text fallback', async () => {
  const message = await buildRawMessage(
    messageArgs({ 'system-note': 'none' }),
    [
      '| Component | Version | State |',
      '| --- | --- | --- |',
      '| Core text | 1.0 | Approved |',
      '| Data table | 1.1 | Candidate |',
    ].join('\n'),
    { bodyFormat: 'markdown', boundary: 'table-component' },
  );

  assert.equal(message.summary.tableCount, 1);
  assert.match(message.htmlBody, /<table width="100%"/);
  assert.match(message.htmlBody, /<thead>/);
  assert.match(message.htmlBody, /<th scope="col"[^>]*padding:9px 8px[^>]*border-bottom:1px solid #5f6368[^>]*>Component<\/th>/);
  assert.match(message.htmlBody, /overflow-wrap:break-word;word-break:normal/);
  assert.doesNotMatch(message.htmlBody, /overflow-wrap:anywhere|word-break:break-word/);
  assert.match(message.htmlBody, /<tbody>/);
  assert.match(message.body, /Component \| Version \| State/);
  assert.match(message.body, /--- \| --- \| ---/);
  assert.match(message.body, /Data table \| 1\.1 \| Candidate/);
});

test('v1.1 data tables enforce bounded counts, columns, rows, and cell text', () => {
  const fourColumns = ['| A | B | C | D |', '|---|---|---|---|', '|1|2|3|4|'].join('\n');
  assert.throws(
    () => buildRawMessage(messageArgs(), fourColumns, { bodyFormat: 'markdown' }),
    /at most 3 columns\. Use stacked key-value records for four or more fields/,
  );

  const tooManyRows = [
    '| A |',
    '|---|',
    ...Array.from({ length: 21 }, (_, index) => `| ${index + 1} |`),
  ].join('\n');
  assert.throws(
    () => buildRawMessage(messageArgs(), tooManyRows, { bodyFormat: 'markdown' }),
    /at most 20 body rows/,
  );

  const table = '| A |\n|---|\n| 1 |';
  assert.throws(
    () => buildRawMessage(messageArgs(), [table, table, table].join('\n\n'), { bodyFormat: 'markdown' }),
    /at most 2 data tables/,
  );

  const longCell = `| A |\n|---|\n| ${'x'.repeat(501)} |`;
  assert.throws(
    () => buildRawMessage(messageArgs(), longCell, { bodyFormat: 'markdown' }),
    /at most 500 characters/,
  );
});

test('v1.2 embeds one source-bound PNG figure with alt text, caption, and plain fallback', async () => {
  const message = await buildRawMessage(
    messageArgs({ 'system-note': 'none' }),
    '## Figure test\n\nThe image follows.',
    {
      bodyFormat: 'markdown',
      boundary: 'figure-component',
      inlineFigure: {
        filename: 'figure.png',
        mimeType: 'image/png',
        content: TEST_PNG,
        alt: 'One-pixel compatibility fixture',
        caption: 'A local inline image with a real text caption.',
      },
    },
  );

  assert.equal(message.summary.inlineFigureCount, 1);
  assert.equal(message.summary.figureManifest.filename, 'figure.png');
  assert.equal(message.summary.figureManifest.width, 1);
  assert.equal(message.summary.figureManifest.height, 1);
  assert.equal(message.summary.figureManifest.displayWidth, 1);
  assert.equal(message.summary.figureManifest.displayHeight, 1);
  assert.equal(message.summary.figureManifest.sizingClass, 'square');
  assert.equal(message.summary.figureManifest.transparency, 'present');
  assert.equal(message.summary.figureManifest.bytes, TEST_PNG.length);
  assert.match(message.htmlBody, /<img src="cid:wawco-[^"]+"/);
  assert.match(message.htmlBody, /alt="One-pixel compatibility fixture"/);
  assert.doesNotMatch(message.htmlBody, /<img[^>]*\sheight="/);
  assert.match(message.htmlBody, />A local inline image with a real text caption\.<\/td>/);
  assert.match(message.body, /\[Image: One-pixel compatibility fixture\]/);
  assert.match(message.body, /A local inline image with a real text caption\./);
  assert.match(message.raw, /Content-Type: multipart\/related/);
  assert.match(message.raw, /Content-Disposition: inline; filename=figure\.png/);
  assert.match(message.previewHtmlBody, /src="data:image\/png;base64,/);
  assert.doesNotMatch(message.previewHtmlBody, /src="cid:/);

  const summary = await summarizeDraftSnapshot({
    account: DEFAULT_ACCOUNT,
    draft: { id: 'figure-draft', message: { sizeEstimate: message.rawBuffer.length } },
    raw: message.rawBuffer.toString('base64url'),
  });
  assert.equal(summary.inlineFigureMode, 'single-cid-png');
  assert.equal(summary.inlineFigureCount, 1);
  assert.equal(summary.figureManifest.sha256, message.summary.figureManifest.sha256);
  assert.equal(summary.figureManifest.displayWidth, 1);
  assert.equal(summary.figureManifest.transparency, 'present');
  assert.equal(summary.contentSha256, message.summary.contentSha256);
});

test('v1.2 uses aspect-ratio-aware display caps without upscaling', () => {
  assert.deepEqual(figureDisplayDimensions({ width: 1600, height: 900 }), {
    displayWidth: 640,
    displayHeight: 360,
    sizingClass: 'landscape',
  });
  assert.deepEqual(figureDisplayDimensions({ width: 1200, height: 1200 }), {
    displayWidth: 520,
    displayHeight: 520,
    sizingClass: 'square',
  });
  assert.deepEqual(figureDisplayDimensions({ width: 1200, height: 1500 }), {
    displayWidth: 440,
    displayHeight: 550,
    sizingClass: 'portrait',
  });
  assert.deepEqual(figureDisplayDimensions({ width: 900, height: 1600 }), {
    displayWidth: 360,
    displayHeight: 640,
    sizingClass: 'tall',
  });
  assert.deepEqual(figureDisplayDimensions({ width: 320, height: 180 }), {
    displayWidth: 320,
    displayHeight: 180,
    sizingClass: 'landscape',
  });
  assert.throws(() => figureDisplayDimensions({ width: 0, height: 1 }), /positive integer dimensions/);
});

test('v1.2 rejects structurally incomplete or corrupt PNG files', () => {
  const truncatedIhdr = TEST_PNG.subarray(0, 24);
  assert.throws(() => inspectInlinePng(truncatedIhdr), /complete PNG-signature-checked/);
  assert.throws(
    () => buildRawMessage(messageArgs(), 'Truncated PNG', {
      bodyFormat: 'markdown',
      inlineFigure: { filename: 'truncated.png', mimeType: 'image/png', content: truncatedIhdr, alt: 'Truncated image' },
    }),
    /complete PNG-signature-checked/,
  );

  const invalidCrc = Buffer.from(TEST_PNG);
  invalidCrc[16] ^= 1;
  assert.throws(() => inspectInlinePng(invalidCrc), /invalid PNG IHDR CRC/);

  const invalidColorType = Buffer.from(TEST_PNG);
  invalidColorType[25] = 1;
  invalidColorType.writeUInt32BE(testCrc32(invalidColorType.subarray(12, 29)), 29);
  assert.throws(() => inspectInlinePng(invalidColorType), /unsupported PNG color type or bit depth/);

  const missingIend = TEST_PNG.subarray(0, TEST_PNG.length - 12);
  assert.throws(() => inspectInlinePng(missingIend), /complete PNG|missing required PNG IHDR, IDAT, or IEND/);

  const truncatedChunk = TEST_PNG.subarray(0, TEST_PNG.length - 5);
  assert.throws(() => inspectInlinePng(truncatedChunk), /complete PNG|truncated PNG chunk/);

  const missingIdat = replacePngChunkType(TEST_PNG, 'IDAT', 'iDAT');
  assert.throws(() => inspectInlinePng(missingIdat), /invalid PNG IEND or missing image data/);

  const unsupportedCritical = replacePngChunkType(TEST_PNG, 'IDAT', 'ABCD');
  assert.throws(() => inspectInlinePng(unsupportedCritical), /unsupported critical PNG chunk ABCD/);

  const trailingBytes = Buffer.concat([TEST_PNG, Buffer.from([0])]);
  assert.throws(() => inspectInlinePng(trailingBytes), /trailing bytes after PNG IEND/);
});

test('v1.3 embeds and reviews a bounded two-figure vertical sequence in order', async () => {
  const message = await buildRawMessage(
    messageArgs({ account: 'hello@whatarewecapableof.com', 'system-note': 'none' }),
    'Two-figure sequence fixture',
    {
      bodyFormat: 'markdown',
      boundary: 'two-figure-sequence',
      attachments: [{ filename: 'sequence.pdf', mimeType: 'application/pdf', content: Buffer.from('%PDF-sequence') }],
      inlineFigures: [
        {
          filename: 'first.png',
          mimeType: 'image/png',
          content: TEST_PNG,
          alt: 'First sequence image',
          caption: 'First caption.',
        },
        {
          filename: 'second.png',
          mimeType: 'image/png',
          content: TEST_PNG_2,
          alt: 'Second sequence image',
          caption: '',
        },
      ],
    },
  );

  assert.equal(message.summary.inlineFigureCount, 2);
  assert.equal(message.summary.figureManifest.filename, 'first.png');
  assert.deepEqual(message.summary.figureManifests.map((figure) => figure.filename), ['first.png', 'second.png']);
  assert.notEqual(message.summary.figureManifests[0].cid, message.summary.figureManifests[1].cid);
  assert.match(message.htmlBody, /data-wawco-figure-index="1"[\s\S]*data-wawco-figure-index="2"/);
  assert.match(message.body, /\[Image: First sequence image\][\s\S]*\[Image: Second sequence image\]/);
  assert.match(message.raw, /X-WAWCO-Inline-Figure: sequence-2-cid-png/i);

  const summary = await summarizeDraftSnapshot({
    account: 'hello@whatarewecapableof.com',
    draft: { id: 'two-figures', message: { sizeEstimate: message.rawBuffer.length } },
    raw: message.rawBuffer.toString('base64url'),
  });
  assert.equal(summary.inlineFigureMode, 'sequence-2-cid-png');
  assert.equal(summary.inlineFigureCount, 2);
  assert.deepEqual(summary.figureManifests.map((figure) => figure.alt), ['First sequence image', 'Second sequence image']);
  assert.deepEqual(summary.figureManifests.map((figure) => figure.caption), ['First caption.', '']);
  assert.equal(
    summary.storedMimeStructure,
    'multipart/mixed(multipart/alternative(text/plain,multipart/related(text/html,image/png,image/png)),application/pdf)',
  );
  assert.equal(summary.attachmentManifest[0].filename, 'sequence.pdf');
  assert.equal(summary.contentSha256, message.summary.contentSha256);

  const secondCid = message.summary.figureManifests[1].cid;
  const mismatchedSecondRaw = Buffer.from(
    message.raw.replace(`cid:${secondCid}`, 'cid:other-second@local'),
    'utf8',
  ).toString('base64url');
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'bad-second' }, raw: mismatchedSecondRaw }),
    /CID 2 does not match/,
  );

  const reversedHtml = [
    '<table role="presentation" data-wawco-inline-figure="v1" data-wawco-figure-index="2">',
    '<tr><td><img src="cid:second@local" alt="Second" width="2"></td></tr>',
    '</table>',
    '<table role="presentation" data-wawco-inline-figure="v1" data-wawco-figure-index="1">',
    '<tr><td><img src="cid:first@local" alt="First" width="1"></td></tr>',
    '</table>',
  ].join('');
  const reversedRaw = await buildPolicyFixtureRaw({
    text: '[Image: First]\n\n[Image: Second]',
    html: reversedHtml,
    figureMode: 'sequence-2-cid-png',
    attachments: [
      { filename: 'first.png', mimeType: 'image/png', content: TEST_PNG, disposition: 'inline', cid: 'first@local' },
      { filename: 'second.png', mimeType: 'image/png', content: TEST_PNG_2, disposition: 'inline', cid: 'second@local' },
    ],
  });
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'reversed-html' }, raw: reversedRaw }),
    /not in declared document order/,
  );

  assert.throws(
    () => buildRawMessage(messageArgs(), 'Too many figures', {
      bodyFormat: 'markdown',
      inlineFigures: [
        { filename: 'one.png', mimeType: 'image/png', content: TEST_PNG, alt: 'One' },
        { filename: 'two.png', mimeType: 'image/png', content: TEST_PNG_2, alt: 'Two' },
        { filename: 'three.png', mimeType: 'image/png', content: TEST_PNG, alt: 'Three' },
      ],
    }),
    /at most 2 inline PNG figures/,
  );
  assert.throws(
    () => buildRawMessage(messageArgs(), 'Duplicate figures', {
      bodyFormat: 'markdown',
      inlineFigures: [
        { filename: 'one.png', mimeType: 'image/png', content: TEST_PNG, alt: 'One' },
        { filename: 'duplicate.png', mimeType: 'image/png', content: TEST_PNG, alt: 'Duplicate' },
      ],
    }),
    /requires two distinct PNG files/,
  );
});

test('v1.2 final review requires and reports the combined mixed-alternative-related MIME tree', async () => {
  const message = await buildRawMessage(
    messageArgs({ account: 'hello@whatarewecapableof.com', 'system-note': 'none' }),
    'Combined figure and PDF fixture',
    {
      bodyFormat: 'markdown',
      boundary: 'combined-components',
      inlineFigure: {
        filename: 'figure.png',
        mimeType: 'image/png',
        content: TEST_PNG,
        alt: 'Combined fixture image',
        caption: 'Combined fixture caption.',
      },
      attachments: [{
        filename: 'sample.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('%PDF-combined'),
      }],
    },
  );
  const summary = await summarizeDraftSnapshot({
    account: 'hello@whatarewecapableof.com',
    draft: { id: 'combined', message: { sizeEstimate: message.rawBuffer.length } },
    raw: message.rawBuffer.toString('base64url'),
  });

  assert.equal(
    summary.storedMimeStructure,
    'multipart/mixed(multipart/alternative(text/plain,multipart/related(text/html,image/png)),application/pdf)',
  );
  assert.equal(summary.figureManifest.alt, 'Combined fixture image');
  assert.equal(summary.figureManifest.caption, 'Combined fixture caption.');
  assert.equal(summary.attachmentManifest[0].filename, 'sample.pdf');
  assert.equal(summary.contentSha256, message.summary.contentSha256);
});

test('v1.2 final review rejects flattened text, HTML, PNG, and PDF siblings', async () => {
  const cid = 'wawco-flat@local';
  const text = 'Flat fixture\n\n[Image: Flat fixture image]\nFlat fixture caption.';
  const html = [
    '<div>Flat fixture</div>',
    '<table role="presentation" data-wawco-inline-figure="v1" data-wawco-figure-index="1">',
    '<tr><td><img src="cid:wawco-flat@local" alt="Flat fixture image" width="1"></td></tr>',
    '<tr><td data-wawco-figure-caption="v1" data-wawco-figure-index="1">Flat fixture caption.</td></tr>',
    '</table>',
  ].join('');
  const pdf = Buffer.from('%PDF-flat');
  const digest = semanticContentSha256({
    plainTextBody: text,
    htmlBody: html,
    attachments: [
      { filename: 'figure.png', mimeType: 'image/png', content: TEST_PNG },
      { filename: 'sample.pdf', mimeType: 'application/pdf', content: pdf },
    ],
  });
  const boundary = 'flat-components';
  const rawBuffer = Buffer.from([
    'From: hello@whatarewecapableof.com',
    'To: recipient@example.invalid',
    `Bcc: ${DEFAULT_AGENT_BCC}`,
    'Subject: Flattened MIME fixture',
    'MIME-Version: 1.0',
    `${DRAFT_HELPER_HEADER}: ${DRAFT_HELPER_VERSION}`,
    `${CONTENT_SHA256_HEADER}: ${digest}`,
    `${BODY_FORMAT_HEADER}: markdown`,
    `${SYSTEM_NOTE_HEADER}: none`,
    `${SIGNATURE_HEADER}: none`,
    `${FIGURE_HEADER}: single-cid-png`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    `--${boundary}`,
    'Content-Type: image/png; name="figure.png"',
    'Content-Transfer-Encoding: base64',
    `Content-ID: <${cid}>`,
    'Content-Disposition: inline; filename="figure.png"',
    '',
    TEST_PNG.toString('base64'),
    `--${boundary}`,
    'Content-Type: application/pdf; name="sample.pdf"',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="sample.pdf"',
    '',
    pdf.toString('base64'),
    `--${boundary}--`,
    '',
  ].join('\r\n'), 'utf8');

  await assert.rejects(
    summarizeDraftSnapshot({
      account: 'hello@whatarewecapableof.com',
      draft: { id: 'flat-components', message: { sizeEstimate: rawBuffer.length } },
      raw: rawBuffer.toString('base64url'),
    }),
    /multipart\/mixed MIME must contain one body entity followed by the reviewed PDFs/,
  );
});

test('v1.2 rejects missing alt text, non-PNG content, unsafe filenames, and plain-body figures', () => {
  const base = {
    filename: 'figure.png',
    mimeType: 'image/png',
    content: TEST_PNG,
    alt: 'Useful alt text',
  };
  assert.throws(
    () => buildRawMessage(messageArgs(), 'Body', { bodyFormat: 'markdown', inlineFigure: { ...base, alt: '' } }),
    /requires one-line alt text/,
  );
  assert.throws(
    () => buildRawMessage(messageArgs(), 'Body', {
      bodyFormat: 'markdown',
      inlineFigure: { ...base, content: Buffer.from('not a PNG') },
    }),
    /PNG-signature-checked/,
  );
  assert.throws(
    () => buildRawMessage(messageArgs(), 'Body', {
      bodyFormat: 'markdown',
      inlineFigure: { ...base, filename: '../figure.png' },
    }),
    /safe \.png basename/,
  );
  assert.throws(
    () => buildRawMessage(messageArgs(), 'Body', { bodyFormat: 'plain', inlineFigure: base }),
    /require --body-markdown-file/,
  );
});

test('Markdown rejects raw HTML, embedded images, and unsafe link schemes', async () => {
  for (const [source, expected] of [
    ['<strong>Raw HTML</strong>', /do not permit raw HTML/],
    ['![Tracking image](https://example.invalid/pixel.png)', /do not permit embedded images/],
    ['[Unsafe](javascript:alert(1))', /unsupported URL scheme/],
    ['[Relative](\/private-path)', /unsupported URL scheme/],
    ['[Fragment](#section)', /unsupported URL scheme/],
  ]) {
    assert.throws(
      () => buildRawMessage(messageArgs(), source, { bodyFormat: 'markdown' }),
      expected,
    );
  }
});

test('Markdown link validation ignores code literals while still rejecting real unsafe links', async () => {
  const message = await buildRawMessage(
    messageArgs({ 'system-note': 'none' }),
    [
      '`[inline code](/relative)`',
      '',
      '```text',
      '[fenced code](javascript:alert(1))',
      '```',
    ].join('\n'),
    { bodyFormat: 'markdown', boundary: 'markdown-code-links' },
  );

  assert.match(message.htmlBody, /\[inline code\]\(\/relative\)/);
  assert.match(message.htmlBody, /\[fenced code\]\(javascript:alert\(1\)\)/);
  assert.doesNotMatch(message.htmlBody, /href="(?:\/relative|javascript:)/);
});

test('Markdown remains multipart when the system note is explicitly suppressed', async () => {
  const message = await buildRawMessage(
    messageArgs({ 'system-note': 'none' }),
    '## Heading\n\nPlain paragraph.',
    { bodyFormat: 'markdown', boundary: 'markdown-without-note' },
  );

  assert.equal(message.summary.systemNote, 'none');
  assert.equal(message.summary.mimeType, 'multipart/alternative');
  assert.equal(message.summary.signatureHtml, 'none');
  assert.match(message.htmlBody, /<h2[^>]*>Heading<\/h2>/);
  assert.doesNotMatch(message.raw, /Drafted with our system/);
});

test('CLI preview writes a local HTML review page for Markdown without Gmail access', async () => {
  const signatureFixture = makePrivateSignatureFixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wawco-email-preview-'));
  const markdownPath = path.join(directory, 'message.md');
  const previewPath = path.join(directory, 'preview.html');
  fs.writeFileSync(markdownPath, '# Preview heading\n\n- First item\n- Second item\n\nSponsor address\n5605 North Glenwood Street\n');

  try {
    const result = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs',
      'preview',
      '--to',
      'preview@example.invalid',
      '--subject',
      'Markdown preview test',
      '--body-markdown-file',
      markdownPath,
      '--out',
      previewPath,
    ], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: {
        ...process.env,
        GOOGLE_SERVICE_ACCOUNT_KEY: 'not-a-service-account',
        WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH: signatureFixture.signaturePath,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.preview, true);
    assert.equal(summary.bodyFormat, 'markdown');
    assert.equal(summary.mimeType, 'multipart/alternative');
    assert.equal(summary.markdownStructure.h1Count, 1);
    assert.equal(summary.markdownStructure.softbreakCount, 1);
    assert.equal(summary.formatWarnings[0].code, 'markdown-softbreaks-render-as-spaces');
    const preview = fs.readFileSync(previewPath, 'utf8');
    assert.match(preview, /Email preview/);
    assert.match(preview, /Markdown preview test/);
    assert.match(preview, /<h1[^>]*>Preview heading<\/h1>/);
    assert.match(preview, /Plain-text alternative/);
    assert.match(preview, /- First item/);
    assert.match(preview, /Content-Security-Policy/);
    assert.match(preview, /default-src 'none'/);
    assert.match(preview, /does not emulate Gmail, Apple Mail, or Outlook/);
    assert.match(preview, /Formatting review required/);
    assert.match(preview, /markdown-softbreaks-render-as-spaces/);
    assert.match(preview, /H1: 1, H2: 0/);
    assert.equal(fs.statSync(previewPath).mode & 0o777, 0o600);

    const dryRun = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs', 'create', '--dry-run',
      '--to', 'preview@example.invalid',
      '--subject', 'Markdown dry-run structure test',
      '--body-markdown-file', markdownPath,
    ], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: { ...process.env, WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH: signatureFixture.signaturePath },
    });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const dryRunSummary = JSON.parse(dryRun.stdout);
    assert.deepEqual(dryRunSummary.markdownStructure, summary.markdownStructure);
    assert.deepEqual(dryRunSummary.formatWarnings, summary.formatWarnings);

    const repeated = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs', 'preview',
      '--to', 'preview@example.invalid',
      '--subject', 'Markdown preview test',
      '--body-markdown-file', markdownPath,
      '--out', previewPath,
    ], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: { ...process.env, WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH: signatureFixture.signaturePath },
    });
    assert.equal(repeated.status, 1, repeated.stderr);
    assert.match(repeated.stderr, /Preview already exists/);

    const valuedForce = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs', 'preview',
      '--to', 'preview@example.invalid',
      '--subject', 'Markdown preview test',
      '--body-markdown-file', markdownPath,
      '--out', previewPath,
      '--force=true',
    ], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: { ...process.env, WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH: signatureFixture.signaturePath },
    });
    assert.equal(valuedForce.status, 1, valuedForce.stderr);
    assert.match(valuedForce.stderr, /Use bare --force/);

    const forced = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs', 'preview',
      '--to', 'preview@example.invalid',
      '--subject', 'Markdown preview test',
      '--body-markdown-file', markdownPath,
      '--out', previewPath,
      '--force',
    ], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: { ...process.env, WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH: signatureFixture.signaturePath },
    });
    assert.equal(forced.status, 0, forced.stderr);
    assert.equal(fs.statSync(previewPath).mode & 0o777, 0o600);

    const victimPath = path.join(directory, 'victim.txt');
    const linkedPreviewPath = path.join(directory, 'linked-preview.html');
    fs.writeFileSync(victimPath, 'do not replace');
    fs.symlinkSync(victimPath, linkedPreviewPath);
    const symlinkForce = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs', 'preview',
      '--to', 'preview@example.invalid',
      '--subject', 'Markdown preview test',
      '--body-markdown-file', markdownPath,
      '--out', linkedPreviewPath,
      '--force',
    ], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: { ...process.env, WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH: signatureFixture.signaturePath },
    });
    assert.equal(symlinkForce.status, 1, symlinkForce.stderr);
    assert.match(symlinkForce.stderr, /must not be a symbolic link/);
    assert.equal(fs.readFileSync(victimPath, 'utf8'), 'do not replace');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(signatureFixture.directory, { recursive: true, force: true });
  }
});

test('CLI preview validates one direct PNG figure and embeds a private data-URI preview', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wawco-inline-figure-'));
  const markdownPath = path.join(directory, 'message.md');
  const figurePath = path.join(directory, 'figure.png');
  const secondFigurePath = path.join(directory, 'second.png');
  const previewPath = path.join(directory, 'preview.html');
  fs.writeFileSync(markdownPath, '| Component | State |\n|---|---|\n| Figure | Candidate |\n');
  fs.writeFileSync(figurePath, TEST_PNG);
  fs.writeFileSync(secondFigurePath, TEST_PNG_2);

  const baseArgs = [
    'scripts/gmail-draft.mjs', 'preview',
    '--to', 'preview@example.invalid',
    '--subject', 'Inline figure preview',
    '--body-markdown-file', markdownPath,
    '--system-note=none',
    '--inline-image', figurePath,
    '--image-alt', 'One-pixel fixture',
    '--image-caption', 'A real text caption.',
    '--out', previewPath,
  ];

  try {
    const result = spawnSync(process.execPath, baseArgs, { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.tableCount, 1);
    assert.equal(summary.inlineFigureCount, 1);
    assert.equal(summary.figureManifest.filename, 'figure.png');
    assert.equal(summary.figureManifest.alt, 'One-pixel fixture');
    assert.equal(summary.policyValidated, true);
    const preview = fs.readFileSync(previewPath, 'utf8');
    assert.equal((preview.match(/src="data:image\/png;base64,/g) || []).length, 1);
    assert.equal((preview.match(/src="cid:wawco-disabled-preview"/g) || []).length, 1);
    assert.match(preview, /A real text caption\./);
    assert.match(preview, /Component \| State/);
    assert.match(preview, /Image-disabled structural simulation/);
    assert.match(preview, /src="cid:wawco-disabled-preview"/);

    const sequencePreviewPath = path.join(directory, 'sequence.html');
    const sequence = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs', 'preview',
      '--to', 'preview@example.invalid', '--subject', 'Two figure sequence',
      '--body-markdown-file', markdownPath, '--system-note=none',
      '--inline-image', figurePath, '--inline-image', secondFigurePath,
      '--image-alt', 'First fixture', '--image-alt', 'Second fixture',
      '--image-caption', 'First caption', '--image-caption=',
      '--out', sequencePreviewPath,
    ], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.equal(sequence.status, 0, sequence.stderr);
    const sequenceSummary = JSON.parse(sequence.stdout);
    assert.equal(sequenceSummary.inlineFigureCount, 2);
    assert.deepEqual(sequenceSummary.figureManifests.map((figure) => figure.filename), ['figure.png', 'second.png']);
    assert.deepEqual(sequenceSummary.reviewedFigureManifests, sequenceSummary.figureManifests);
    assert.equal(sequenceSummary.storedMimeStructure, 'multipart/alternative(text/plain,multipart/related(text/html,image/png,image/png))');
    const sequencePreview = fs.readFileSync(sequencePreviewPath, 'utf8');
    assert.equal((sequencePreview.match(/src="data:image\/png;base64,/g) || []).length, 2);
    assert.match(sequencePreview, /First caption/);

    const mismatchedCaption = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs', 'create', '--dry-run',
      '--to', 'preview@example.invalid', '--subject', 'Mismatched captions',
      '--body-markdown-file', markdownPath, '--system-note=none',
      '--inline-image', figurePath, '--inline-image', secondFigurePath,
      '--image-alt', 'First fixture', '--image-alt', 'Second fixture',
      '--image-caption', 'Only one caption',
    ], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.equal(mismatchedCaption.status, 1, mismatchedCaption.stderr);
    assert.match(mismatchedCaption.stderr, /one positionally matching caption per inline image/);

    const symlinkPath = path.join(directory, 'linked.png');
    fs.symlinkSync(figurePath, symlinkPath);
    const symlinkArgs = [...baseArgs];
    symlinkArgs[symlinkArgs.indexOf(figurePath)] = symlinkPath;
    symlinkArgs[symlinkArgs.indexOf(previewPath)] = path.join(directory, 'symlink.html');
    const symlinked = spawnSync(process.execPath, symlinkArgs, { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.equal(symlinked.status, 1, symlinked.stderr);
    assert.match(symlinked.stderr, /must not be a symbolic link/);

    const oversizedPath = path.join(directory, 'oversized.png');
    fs.writeFileSync(oversizedPath, TEST_PNG);
    fs.truncateSync(oversizedPath, (2 * 1024 * 1024) + 1);
    const oversized = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs', 'create', '--dry-run',
      '--to', 'preview@example.invalid', '--subject', 'Oversized figure',
      '--body-markdown-file', markdownPath, '--system-note=none',
      '--inline-image', oversizedPath, '--image-alt', 'Oversized fixture',
    ], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.equal(oversized.status, 1, oversized.stderr);
    assert.match(oversized.stderr, /exceeds the 2097152-byte limit/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI accepts exactly one body input format', async () => {
  const fixture = makePrivateSignatureFixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wawco-email-body-input-'));
  const markdownPath = path.join(directory, 'message.md');
  fs.writeFileSync(markdownPath, '# Message');
  try {
    const result = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs',
      'create',
      '--dry-run',
      '--to',
      'preview@example.invalid',
      '--subject',
      'Conflicting body input test',
      '--body',
      'Plain body',
      '--body-markdown-file',
      markdownPath,
    ], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: {
        ...process.env,
        GOOGLE_SERVICE_ACCOUNT_KEY: 'not-a-service-account',
        WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH: fixture.signaturePath,
      },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /exactly one of --body, --body-file, or --body-markdown-file/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('header values remain CRLF-sanitized', async () => {
  const message = await buildRawMessage(messageArgs({
    'from-name': 'Noah\r\nCc: injected@example.invalid',
    subject: 'Subject\r\nBcc: injected@example.invalid',
  }), 'Plain body');

  assert.doesNotMatch(message.raw, /\r\nCc: injected@example\.invalid/);
  assert.doesNotMatch(message.raw, /\r\nBcc: injected@example\.invalid/);
  assert.match(message.raw, /Subject: Subject Bcc: injected@example\.invalid/);
});

test('only the literal system-note value none suppresses the default', async () => {
  for (const value of ['quiet-editorial', 'NONE', ' none ', ['none', 'none'], true]) {
    assert.throws(
      () => buildRawMessage(messageArgs({ 'system-note': value }), 'Plain body'),
      /Unsupported --system-note value/,
    );
  }
});

test('CLI dry-run reports the default note and private signature without parsing credentials or creating a draft', async () => {
  const fixture = makePrivateSignatureFixture();
  try {
    const result = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs',
      'create',
      '--dry-run',
      '--to',
      'dry-run@example.invalid',
      '--subject',
      'Dry-run policy test',
      '--body',
      'Dry-run body',
    ], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: {
        ...process.env,
        GOOGLE_SERVICE_ACCOUNT_KEY: 'not-a-service-account',
        WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH: fixture.signaturePath,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.dryRun, true);
    assert.equal(summary.account, DEFAULT_ACCOUNT);
    assert.equal(summary.systemNote, 'quiet-editorial');
    assert.equal(summary.signatureHtml, 'provided');
    assert.equal(summary.mimeType, 'multipart/alternative');
    assert.equal(summary.defaultBcc, DEFAULT_AGENT_BCC);
    assert.equal(summary.defaultBccApplied, true);
    assert.equal(summary.bccCount, 1);
    assert.equal(summary.markdownStructure, null);
    assert.deepEqual(summary.formatWarnings, []);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('CLI rejects private noah signature snapshots that are not direct mode-0600 files', async () => {
  for (const mode of [0o400, 0o700]) {
    const fixture = makePrivateSignatureFixture(mode);
    try {
      const result = spawnSync(process.execPath, [
        'scripts/gmail-draft.mjs',
        'create',
        '--dry-run',
        '--to',
        'dry-run@example.invalid',
        '--subject',
        'Snapshot permission test',
        '--body',
        'Dry-run body',
      ], {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        env: {
          ...process.env,
          GOOGLE_SERVICE_ACCOUNT_KEY: 'not-a-service-account',
          WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH: fixture.signaturePath,
        },
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /direct mode-0600 regular file/);
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  }

  const fixture = makePrivateSignatureFixture();
  const symlinkPath = path.join(fixture.directory, 'signature-link.html');
  fs.symlinkSync(fixture.signaturePath, symlinkPath);
  try {
    const result = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs', 'create', '--dry-run',
      '--to', 'dry-run@example.invalid',
      '--subject', 'Snapshot symlink test',
      '--body', 'Dry-run body',
    ], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: { ...process.env, WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH: symlinkPath },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /must not be a symbolic link/);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('CLI accepts only the equals-form system-note override', async () => {
  const accepted = spawnSync(process.execPath, [
    'scripts/gmail-draft.mjs',
    'create',
    '--dry-run',
    '--to',
    'dry-run@example.invalid',
    '--subject',
    'Exact override test',
    '--body',
    'Body',
    '--system-note=none',
  ], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: {
      ...process.env,
      GOOGLE_SERVICE_ACCOUNT_KEY: 'not-a-service-account',
      WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH: path.join(os.tmpdir(), 'nonexistent-wawco-signature.html'),
    },
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).systemNote, 'none');

  const rejectedForms = [
    ['--system-note', 'none'],
    ['--system-note=none', '--system-note=none'],
    ['--System-Note=none'],
    ['--SYSTEM-NOTE=none'],
    ['--system-note =none'],
    ['-- system-note=none'],
  ];
  for (const rejectedForm of rejectedForms) {
    const rejected = spawnSync(process.execPath, [
      'scripts/gmail-draft.mjs',
      'create',
      '--dry-run',
      '--to',
      'dry-run@example.invalid',
      '--subject',
      'Rejected override test',
      '--body',
      'Body',
      ...rejectedForm,
    ], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: { ...process.env, GOOGLE_SERVICE_ACCOUNT_KEY: 'not-a-service-account' },
    });
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.match(rejected.stderr, /(Use (the exact flag )?|use )--system-note=none/);
  }
});

test('CLI rejects oversized or symlinked attachments before reading their content', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wawco-attachment-boundary-'));
  const oversizedPath = path.join(directory, 'oversized.pdf');
  const targetPath = path.join(directory, 'target.pdf');
  const symlinkPath = path.join(directory, 'linked.pdf');
  const descriptor = fs.openSync(oversizedPath, 'w');
  fs.ftruncateSync(descriptor, (20 * 1024 * 1024) + 1);
  fs.closeSync(descriptor);
  fs.writeFileSync(targetPath, '%PDF-test');
  fs.symlinkSync(targetPath, symlinkPath);

  const baseArgs = [
    'scripts/gmail-draft.mjs', 'create', '--dry-run',
    '--account', 'hello@whatarewecapableof.com',
    '--to', 'recipient@example.invalid',
    '--subject', 'Attachment boundary test',
    '--body', 'Body',
  ];
  try {
    const oversized = spawnSync(process.execPath, [...baseArgs, '--attach', oversizedPath], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: process.env,
    });
    assert.equal(oversized.status, 1, oversized.stderr);
    assert.match(oversized.stderr, /exceed the 20 MiB helper limit/);

    const symlinked = spawnSync(process.execPath, [...baseArgs, '--attach', symlinkPath], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: process.env,
    });
    assert.equal(symlinked.status, 1, symlinked.stderr);
    assert.match(symlinked.stderr, /Attachment must not be a symbolic link/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('PDF attachments produce mixed MIME, PDF-signature checks, and a manifest', async () => {
  const message = await buildRawMessage(messageArgs(), 'Invoice summary', {
    boundary: 'attachment-boundary',
    attachments: [{
      filename: 'INVOICE-01.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('%PDF-test'),
    }],
  });

  assert.equal(message.summary.mimeType, 'multipart/mixed');
  assert.equal(message.summary.attachmentCount, 1);
  assert.deepEqual(message.summary.attachmentNames, ['INVOICE-01.pdf']);
  assert.equal(message.summary.attachmentManifest[0].mimeType, 'application/pdf');
  assert.equal(message.summary.attachmentManifest[0].bytes, 9);
  assert.match(message.summary.attachmentManifest[0].sha256, /^[a-f0-9]{64}$/);
  assert.ok(message.summary.encodedMessageBytes > message.summary.attachmentBytes);
  assert.match(message.raw, /Content-Type: multipart\/mixed;\r\n boundary="--_WAWCO-attachment-boundary-Part_1"/);
  assert.match(message.raw, /Content-Type: multipart\/alternative;\r\n boundary="--_WAWCO-attachment-boundary-Part_2"/);
  assert.match(message.raw, /Content-Type: application\/pdf; name=INVOICE-01\.pdf/);
  assert.match(message.raw, /Content-Disposition: attachment; filename=INVOICE-01\.pdf/);
  assert.match(message.raw, /JVBERi10ZXN0/);
});

test('attachment validation rejects disguised files and isolates serialized bytes from caller mutation', async () => {
  assert.throws(
    () => buildRawMessage(messageArgs(), 'Body', {
      attachments: [{
        filename: 'disguised.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('not a PDF'),
      }],
    }),
    /PDF-signature-checked application\/pdf/,
  );

  const source = Buffer.from('%PDF-original');
  const pending = buildRawMessage(messageArgs(), 'Body', {
    boundary: 'immutable-attachment',
    attachments: [{ filename: 'original.pdf', mimeType: 'application/pdf', content: source }],
  });
  source.fill(0x58);
  const message = await pending;
  assert.match(message.raw, /JVBERi1vcmlnaW5hbA==/);
  assert.doesNotMatch(message.raw, /WFhYWFhY/);
  assert.equal(message.summary.attachmentBytes, 13);
  assert.ok(message.summary.encodedMessageBytes > message.summary.attachmentBytes);
});

test('review summary validates helper provenance, fingerprints exact MIME, and exposes attachment digests', async () => {
  const built = await buildRawMessage(messageArgs({
    to: 'Chelsea <chelsea@example.invalid>',
    subject: 'Approved invoice',
  }), 'Private body', {
    signatureHtml: '<div>Approved signature</div>',
    boundary: 'review-summary',
    attachments: [{
      filename: 'INVOICE-01.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('%PDF-test'),
    }],
  });
  const raw = built.rawBuffer.toString('base64url');
  const draft = {
    id: 'draft-123',
    message: {
      id: 'message-123',
      threadId: 'thread-123',
      sizeEstimate: built.rawBuffer.length,
    },
  };

  const summary = await summarizeDraftSnapshot({ account: DEFAULT_ACCOUNT, draft, raw });
  assert.equal(summary.approvalToken, draftPayloadSha256(raw));
  assert.equal(summary.to, '"Chelsea" <chelsea@example.invalid>');
  assert.equal(summary.bcc, DEFAULT_AGENT_BCC);
  assert.equal(summary.subject, 'Approved invoice');
  assert.equal(summary.helperVersion, DRAFT_HELPER_VERSION);
  assert.equal(summary.contentSha256, built.summary.contentSha256);
  assert.deepEqual(summary.attachmentNames, ['INVOICE-01.pdf']);
  assert.equal(summary.attachmentBytes, 9);
  assert.deepEqual(summary.attachmentManifest, built.summary.attachmentManifest);
  assert.equal(summary.encodedMessageBytes, built.rawBuffer.length);
  assert.doesNotMatch(JSON.stringify(summary), /Private body|Approved signature/);
});

test('review rejects remote or mismatched inline-image sources before digest approval', async () => {
  const built = await buildRawMessage(
    messageArgs({ account: 'hello@whatarewecapableof.com', 'system-note': 'none' }),
    'Figure policy fixture',
    {
      bodyFormat: 'markdown',
      inlineFigure: {
        filename: 'figure.png',
        mimeType: 'image/png',
        content: TEST_PNG,
        alt: 'Policy fixture image',
        caption: 'Caption',
      },
    },
  );
  const cidSource = `cid:${built.summary.figureManifest.cid}`;

  const remoteRaw = Buffer.from(
    built.raw.replace(cidSource, 'https://tracker.invalid/pixel.png'),
    'utf8',
  ).toString('base64url');
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'remote-image' }, raw: remoteRaw }),
    /CID 1 does not match/,
  );

  const mismatchedRaw = Buffer.from(
    built.raw.replace(cidSource, 'cid:other-figure@local'),
    'utf8',
  ).toString('base64url');
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'mismatched-image' }, raw: mismatchedRaw }),
    /CID 1 does not match/,
  );
});

test('review rejects non-helper MIME and helper-marked unsafe HTML or attachments', async () => {
  const arbitraryRaw = Buffer.from([
    'From: hello@whatarewecapableof.com',
    'To: recipient@example.invalid',
    `Bcc: ${DEFAULT_AGENT_BCC}`,
    'Subject: Arbitrary draft',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<img src="https://tracker.invalid/pixel.png">',
  ].join('\r\n')).toString('base64url');
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'arbitrary' }, raw: arbitraryRaw }),
    /not an approved X-WAWCO-Draft-Helper: v1 message/,
  );

  const unsafeHtmlRaw = await buildPolicyFixtureRaw({
    html: '<div>Body</div><img src="https://tracker.invalid/pixel.png">',
  });
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'unsafe-html' }, raw: unsafeHtmlRaw }),
    /unapproved image or figure component/,
  );

  const fragmentLinkRaw = await buildPolicyFixtureRaw({
    html: '<div><a href="#section">In-document link</a></div>',
  });
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'fragment-link' }, raw: fragmentLinkRaw }),
    /unsupported URL scheme: #section/,
  );

  const unquotedLinkRaw = await buildPolicyFixtureRaw({
    html: '<div><a href=javascript:alert(1)>Unsafe</a></div>',
  });
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'unquoted-link' }, raw: unquotedLinkRaw }),
    /unsupported URL scheme/,
  );

  const unquotedStyleRaw = await buildPolicyFixtureRaw({
    html: '<div style=background-image:url(https://tracker.invalid/pixel.png)>Unsafe</div>',
  });
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'unquoted-style' }, raw: unquotedStyleRaw }),
    /unsafe style value/,
  );

  for (const [id, html, expected] of [
    ['quoted-link', '<a href="javascript:alert(1)">Unsafe</a>', /unsupported URL scheme/],
    ['resource-attribute', '<div background="https://tracker.invalid/pixel.png">Unsafe</div>', /unsupported background attribute/],
    ['entity-style', '<div style="background:url&#40;https://tracker.invalid/pixel.png&#41;">Unsafe</div>', /unsafe style value/],
    ['unknown-tag', '<section>Unsafe</section>', /unsupported <section> markup/],
    ['unknown-attribute', '<div data-extra="unsafe">Unsafe</div>', /unsupported data-extra attribute/],
    ['unknown-style', '<div style="position:absolute">Unsafe</div>', /unsupported style property: position/],
  ]) {
    const raw = await buildPolicyFixtureRaw({ html });
    await assert.rejects(
      summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id }, raw }),
      expected,
    );
  }

  const unsafeAttachmentRaw = await buildPolicyFixtureRaw({
    attachments: [{
      filename: 'payload.exe',
      mimeType: 'application/octet-stream',
      content: Buffer.from('MZ-not-safe'),
    }],
  });
  await assert.rejects(
    summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'unsafe-attachment' }, raw: unsafeAttachmentRaw }),
    /safe PDF basename/,
  );
});

test('review exposes same-name PDF mutations through attachment digests', async () => {
  const firstRaw = await buildPolicyFixtureRaw({
    attachments: [{ filename: 'same.pdf', mimeType: 'application/pdf', content: Buffer.from('%PDF-AAAA') }],
  });
  const secondRaw = await buildPolicyFixtureRaw({
    attachments: [{ filename: 'same.pdf', mimeType: 'application/pdf', content: Buffer.from('%PDF-BBBB') }],
  });
  const first = await summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'first' }, raw: firstRaw });
  const second = await summarizeDraftSnapshot({ account: 'hello@whatarewecapableof.com', draft: { id: 'second' }, raw: secondRaw });

  assert.equal(first.attachmentManifest[0].filename, second.attachmentManifest[0].filename);
  assert.equal(first.attachmentManifest[0].bytes, second.attachmentManifest[0].bytes);
  assert.notEqual(first.attachmentManifest[0].sha256, second.attachmentManifest[0].sha256);
  assert.notEqual(first.contentSha256, second.contentSha256);
  assert.notEqual(first.approvalToken, second.approvalToken);
});

test('exact-send helper submits reviewed raw MIME and preserves the Gmail thread in the same drafts.send request', async () => {
  const raw = await buildPolicyFixtureRaw();
  const approvalToken = draftPayloadSha256(raw);
  const calls = [];
  const gmail = {
    users: {
      drafts: {
        send: async (request) => {
          calls.push(request);
          return { data: { id: 'sent-message' } };
        },
      },
    },
  };

  await sendExactReviewedDraft({
    gmail,
    draftId: 'draft-123',
    raw,
    approvalToken,
    threadId: 'thread-123',
  });
  assert.deepEqual(calls, [{
    userId: 'me',
    requestBody: {
      id: 'draft-123',
      message: { raw, threadId: 'thread-123' },
    },
  }]);

  const changedRaw = await buildPolicyFixtureRaw({ text: 'Changed after review' });
  await assert.rejects(
    sendExactReviewedDraft({
      gmail,
      draftId: 'draft-123',
      raw: changedRaw,
      approvalToken,
      threadId: 'thread-123',
    }),
    /Draft changed after review/,
  );
  assert.equal(calls.length, 1);
});

test('exact-send helper omits an empty thread ID for a new-message draft', async () => {
  const raw = await buildPolicyFixtureRaw();
  const approvalToken = draftPayloadSha256(raw);
  const calls = [];
  const gmail = {
    users: {
      drafts: {
        send: async (request) => {
          calls.push(request);
          return { data: { id: 'sent-message' } };
        },
      },
    },
  };

  await sendExactReviewedDraft({ gmail, draftId: 'draft-123', raw, approvalToken, threadId: '   ' });
  assert.deepEqual(calls[0].requestBody.message, { raw });
});

test('send approval token fails closed when missing, malformed, or stale', async () => {
  const raw = Buffer.from('exact reviewed MIME').toString('base64url');
  const actual = draftPayloadSha256(raw);
  assert.equal(requireDraftApprovalToken(actual), actual);
  assert.doesNotThrow(() => assertDraftApprovalToken(actual, actual));
  const stale = `${actual.slice(0, -1)}${actual.endsWith('0') ? '1' : '0'}`;
  for (const supplied of ['', 'SEND', actual.toUpperCase(), stale]) {
    assert.throws(
      () => assertDraftApprovalToken(actual, supplied),
      /(exact lowercase 64-character|Draft changed after review)/,
    );
  }
});

test('CLI send without an approval token fails before credential or Gmail access', async () => {
  const result = spawnSync(process.execPath, [
    'scripts/gmail-draft.mjs',
    'send',
    '--draft-id',
    'draft-123',
  ], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env, GOOGLE_SERVICE_ACCOUNT_KEY: 'not-a-service-account' },
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /exact lowercase 64-character --approval-token/);
  assert.doesNotMatch(result.stderr, /JSON|service account|Gmail/);
});

test('source retains compose scope and sends existing drafts only through the exact-raw approval path', async () => {
  const cliSource = fs.readFileSync(path.join(ROOT_DIR, 'scripts/gmail-draft.mjs'), 'utf8');
  const sendSource = fs.readFileSync(path.join(ROOT_DIR, 'scripts/gmail-draft-send.mjs'), 'utf8');

  assert.match(cliSource, /https:\/\/www\.googleapis\.com\/auth\/gmail\.compose/);
  assert.match(cliSource, /gmail\.users\.drafts\.create/);
  assert.match(cliSource, /sendExactReviewedDraft/);
  assert.match(cliSource, /assertDraftApprovalToken/);
  assert.match(cliSource, /Do not retry automatically/);
  assert.match(cliSource, /readTrustedSignatureHtml/);
  assert.match(sendSource, /gmail\.users\.drafts\.send/);
  assert.match(sendSource, /message\.threadId = normalizedThreadId/);
  assert.doesNotMatch(`${cliSource}\n${sendSource}`, /\.messages\.send/);
});
