import { createHash } from 'node:crypto';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import sanitizeHtml from 'sanitize-html';
import {
  encodeMarkdownStructure,
  figureDisplayDimensions,
  renderMarkdownEmail,
} from './gmail-draft-markdown.mjs';
import {
  DEFAULT_WAWCO_PROFILE_PATH,
  loadOrganizationEmailProfile,
} from './email-expression-profile.mjs';
import { resolveEmailPresentation } from './email-expression-resolver.mjs';
import {
  DEFAULT_ACCOUNT,
  NOAH_ACCOUNT,
  HELLO_ACCOUNT,
  KAMP_FROM_ADDRESS,
  KAMP_MAIL_PROFILE,
  DEFAULT_AGENT_BCC,
  resolveMailProfile,
} from './gmail-mail-profiles.mjs';

export {
  DEFAULT_ACCOUNT,
  NOAH_ACCOUNT,
  HELLO_ACCOUNT,
  KAMP_FROM_ADDRESS,
  KAMP_MAIL_PROFILE,
  DEFAULT_AGENT_BCC,
};
export const QUIET_EDITORIAL_SYSTEM_NOTE = [
  "Drafted with our system. Replies go to Noah's inbox.",
  '',
  'This note may be more direct or structured than a typical email. Thanks!',
].join('\r\n');
export const KAMP_AUTOMATED_SYSTEM_NOTE = [
  'This email was prepared and sent through an automated system operated by What are we capable of? for Kamp Love.',
  '',
  'Replies go to Noah Glynn at the Kamp Love technology and design inbox.',
].join('\r\n');
export const MAX_ENCODED_MESSAGE_BYTES = 24 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 20;
export const MAX_ATTACHMENT_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_INLINE_FIGURE_COUNT = 2;
export const MAX_INLINE_FIGURE_BYTES = 2 * 1024 * 1024;
export const MAX_INLINE_FIGURE_DIMENSION = 2400;
export const MAX_INLINE_FIGURE_PIXELS = 8_000_000;
export const DRAFT_HELPER_VERSION = 'v1';
export const DRAFT_HELPER_HEADER = 'X-WAWCO-Draft-Helper';
export const CONTENT_SHA256_HEADER = 'X-WAWCO-Content-SHA256';
export const BODY_FORMAT_HEADER = 'X-WAWCO-Body-Format';
export const SYSTEM_NOTE_HEADER = 'X-WAWCO-System-Note';
export const SIGNATURE_HEADER = 'X-WAWCO-Signature';
export const FIGURE_HEADER = 'X-WAWCO-Inline-Figure';
export const MARKDOWN_STRUCTURE_HEADER = 'X-WAWCO-Markdown-Structure';
export const MAIL_PROFILE_HEADER = 'X-WAWCO-Mail-Profile';
export const MAIL_PROFILE_VERSION_HEADER = 'X-WAWCO-Mail-Profile-Version';
export const MAIL_PROFILE_POLICY_SHA256_HEADER = 'X-WAWCO-Mail-Profile-Policy-SHA256';
export const EXPRESSION_PROFILE_HEADER = 'X-WAWCO-Expression-Profile';
export const EXPRESSION_PROFILE_VERSION_HEADER = 'X-WAWCO-Expression-Profile-Version';
export const EXPRESSION_PROFILE_SHA256_HEADER = 'X-WAWCO-Expression-Profile-SHA256';

const SAFE_SIGNATURE_STYLE_VALUES = {
  color: [/^(?:#[0-9a-f]{3,8}|[a-z]+)$/i],
  'font-family': [/^[a-z0-9 ,"'_-]+$/i],
  'font-size': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/],
  'font-weight': [/^(?:normal|bold|[1-9]00)$/],
  'line-height': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)?$/],
  'text-decoration': [/^(?:none|underline)$/],
};

export function asArray(value) {
  if (value === undefined || value === null || value === false) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseRecipients(value, flagName) {
  const recipients = asArray(value)
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  if (flagName === 'to' && recipients.length === 0) throw new Error('Missing --to recipient.');
  for (const recipient of recipients) {
    if (/[\r\n\0]/.test(recipient)) throw new Error(`Invalid control character in --${flagName} recipient.`);
  }
  return recipients;
}

export function sanitizeHeaderValue(value) {
  return String(value ?? '').replace(/[\r\n\0]+/g, ' ').trim();
}

export function normalizeBody(body) {
  return String(body ?? '').replace(/\r\n|\r|\n/g, '\r\n');
}

export function resolveSystemNoteMode(value) {
  if (value === undefined) return 'default';
  if (value !== 'none') {
    throw new Error('Unsupported --system-note value. Omit the flag or use --system-note=none.');
  }
  return 'none';
}

export function resolveSenderPolicy(args = {}, options = {}) {
  const profile = resolveMailProfile(args, options);
  return {
    ...profile,
    mailProfile: profile.id === 'wawco-house' || profile.id === 'legacy-plain-account' ? '' : profile.id,
  };
}

export function resolveSystemNoteKind(senderPolicy, systemNoteMode) {
  if (systemNoteMode === 'none') return 'none';
  return senderPolicy.systemNoteKind || 'none';
}

export function shouldApplySystemNote(account, systemNoteMode, options = {}) {
  const senderPolicy = {
    account: String(account).toLowerCase(),
    fromEmail: String(options.fromEmail || account).toLowerCase(),
    mailProfile: String(options.mailProfile || '').toLowerCase(),
  };
  return resolveSystemNoteKind(senderPolicy, systemNoteMode) !== 'none';
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeTrustedSignatureHtml(value) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.includes('\u0000')) {
    throw new Error('Trusted signature HTML must be a non-null string without NUL bytes.');
  }
  const sanitized = sanitizeHtml(value, {
    allowedTags: ['div', 'span', 'a', 'br'],
    allowedAttributes: {
      div: ['style'],
      span: ['style'],
      a: ['href', 'style'],
      br: [],
    },
    allowedSchemes: ['https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    allowedStyles: { '*': SAFE_SIGNATURE_STYLE_VALUES },
    disallowedTagsMode: 'discard',
  });
  if (!sanitized.trim()) throw new Error('Trusted signature HTML is empty after email-safe sanitization.');
  return sanitized;
}

function appendSystemNote(plainTextBody, noteText) {
  if (!plainTextBody) return noteText;
  const separator = plainTextBody.endsWith('\r\n\r\n')
    ? ''
    : plainTextBody.endsWith('\r\n')
      ? '\r\n'
      : '\r\n\r\n';
  return `${plainTextBody}${separator}${noteText}`;
}

const BODY_TEXT_STYLE = "margin:0 0 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;mso-line-height-rule:exactly;";
const NOTE_TEXT_STYLE = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;mso-line-height-rule:exactly;";

function htmlParagraphs(value) {
  const paragraphs = String(value).split(/\r\n(?:\r\n)+/);
  return paragraphs
    .map((paragraph) => `<div style="${BODY_TEXT_STYLE}">${escapeHtml(paragraph).replace(/\r\n/g, '<br>')}</div>`)
    .join('\r\n');
}

export function renderSystemEmailHtml(body, { systemNoteKind = 'quiet-editorial', signatureHtml = '', bodyHtml = '' } = {}) {
  const noteLines = systemNoteKind === 'kamp-automated'
    ? [
      'This email was prepared and sent through an automated system operated by What are we capable of? for Kamp Love.',
      'Replies go to Noah Glynn at the Kamp Love technology and design inbox.',
    ]
    : [
      'Drafted with our system. Replies go to Noah&#39;s inbox.',
      'This note may be more direct or structured than a typical email. Thanks!',
    ];
  const systemNote = [
    `<div data-wawco-system-note="${systemNoteKind}" style="margin:0 0 24px 0;padding:0;">`,
    "  <div style=\"margin:0 0 12px 0;font-family:ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;font-size:12px;line-height:24px;letter-spacing:0.04em;text-transform:uppercase;\">System note</div>",
    `  <div style="margin:0 0 24px 0;${NOTE_TEXT_STYLE}">${noteLines[0]}</div>`,
    `  <div style="margin:0;${NOTE_TEXT_STYLE}">${noteLines[1]}</div>`,
    '</div>',
  ].join('\r\n');

  return [bodyHtml || htmlParagraphs(body), systemNote, signatureHtml].filter(Boolean).join('\r\n');
}

export function renderQuietEditorialHtml(body, options = {}) {
  return renderSystemEmailHtml(body, { ...options, systemNoteKind: 'quiet-editorial' });
}

function validateReplyIntent(args, senderPolicy) {
  if (senderPolicy.account !== NOAH_ACCOUNT && senderPolicy.mailProfile !== KAMP_MAIL_PROFILE) return false;
  const replyFields = [
    ['thread-id', '--thread-id'],
    ['in-reply-to', '--in-reply-to'],
    ['references', '--references'],
  ];
  const hasThreadingField = replyFields.some(([argument]) => String(args[argument] || '').trim());
  if (args.reply === undefined && !hasThreadingField) return false;
  if (args.reply !== undefined && args.reply !== true) throw new Error('Use bare --reply without a value.');
  for (const [argument, label] of replyFields) {
    if (!String(args[argument] || '').trim()) {
      throw new Error(`A reply requires ${label}.`);
    }
  }
  return true;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function normalizedDigestText(value) {
  return String(value ?? '').replace(/\r\n|\r/g, '\n').replace(/\n+$/g, '');
}

function updateSemanticDigest(hash, label, value) {
  const buffer = Buffer.isBuffer(value)
    ? value
    : Buffer.from(normalizedDigestText(value), 'utf8');
  hash.update(`${label}:${buffer.length}\n`, 'utf8');
  hash.update(buffer);
  hash.update('\n', 'utf8');
}

export function semanticContentSha256({ plainTextBody, htmlBody, attachments = [], markdownStructure = '' }) {
  const hash = createHash('sha256');
  updateSemanticDigest(hash, 'contract', 'wawco-email-content-v1');
  updateSemanticDigest(hash, 'text', plainTextBody);
  updateSemanticDigest(hash, 'html', htmlBody || '');
  if (markdownStructure) updateSemanticDigest(hash, 'markdown-structure', markdownStructure);
  attachments.forEach((attachment, index) => {
    updateSemanticDigest(hash, `attachment-${index}-filename`, String(attachment.filename || '').normalize('NFC'));
    updateSemanticDigest(hash, `attachment-${index}-mime`, String(attachment.mimeType || '').toLowerCase());
    updateSemanticDigest(hash, `attachment-${index}-content`, attachment.content);
  });
  return hash.digest('hex');
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function pngCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function inspectInlinePng(content, label = 'Inline figure') {
  if (!Buffer.isBuffer(content)) throw new Error(`${label} must provide Buffer content.`);
  if (content.length > MAX_INLINE_FIGURE_BYTES) {
    throw new Error(`${label} exceeds the ${MAX_INLINE_FIGURE_BYTES}-byte limit.`);
  }
  if (content.length < 57 || !content.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${label} must be a complete PNG-signature-checked image/png file.`);
  }

  let offset = 8;
  let chunkIndex = 0;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let hasIhdr = false;
  let hasPlte = false;
  let hasIdat = false;
  let idatBytes = 0;
  let idatClosed = false;
  let hasIend = false;
  let hasTransparencyChunk = false;
  while (offset < content.length) {
    if (offset + 12 > content.length) throw new Error(`${label} has a truncated PNG chunk header.`);
    const chunkLength = content.readUInt32BE(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > content.length) throw new Error(`${label} has a truncated PNG chunk.`);
    const typeBytes = content.subarray(offset + 4, offset + 8);
    const chunkType = typeBytes.toString('ascii');
    if (!/^[A-Za-z]{4}$/.test(chunkType)) throw new Error(`${label} has an invalid PNG chunk type.`);
    const expectedCrc = content.readUInt32BE(dataEnd);
    const actualCrc = pngCrc32(content.subarray(offset + 4, dataEnd));
    if (expectedCrc !== actualCrc) throw new Error(`${label} has an invalid PNG ${chunkType} CRC.`);

    if (chunkIndex === 0 && chunkType !== 'IHDR') throw new Error(`${label} must begin with a PNG IHDR chunk.`);
    if (chunkType === 'IHDR') {
      if (hasIhdr || chunkIndex !== 0 || chunkLength !== 13) throw new Error(`${label} has an invalid PNG IHDR chunk.`);
      hasIhdr = true;
      width = content.readUInt32BE(dataStart);
      height = content.readUInt32BE(dataStart + 4);
      bitDepth = content[dataStart + 8];
      colorType = content[dataStart + 9];
      const validDepths = {
        0: new Set([1, 2, 4, 8, 16]),
        2: new Set([8, 16]),
        3: new Set([1, 2, 4, 8]),
        4: new Set([8, 16]),
        6: new Set([8, 16]),
      };
      if (!validDepths[colorType]?.has(bitDepth)) throw new Error(`${label} has an unsupported PNG color type or bit depth.`);
      if (content[dataStart + 10] !== 0 || content[dataStart + 11] !== 0 || ![0, 1].includes(content[dataStart + 12])) {
        throw new Error(`${label} has unsupported PNG compression, filtering, or interlace settings.`);
      }
      if (!width || !height || width > MAX_INLINE_FIGURE_DIMENSION || height > MAX_INLINE_FIGURE_DIMENSION) {
        throw new Error(`${label} dimensions must be between 1 and ${MAX_INLINE_FIGURE_DIMENSION} pixels.`);
      }
      if (width * height > MAX_INLINE_FIGURE_PIXELS) {
        throw new Error(`${label} exceeds the ${MAX_INLINE_FIGURE_PIXELS}-pixel limit.`);
      }
    } else if (!hasIhdr) {
      throw new Error(`${label} contains PNG data before IHDR.`);
    } else if (chunkType === 'PLTE') {
      if (hasIdat || chunkLength === 0 || chunkLength % 3 !== 0 || chunkLength > 768) throw new Error(`${label} has an invalid PNG PLTE chunk.`);
      hasPlte = true;
    } else if (chunkType === 'IDAT') {
      if (idatClosed) throw new Error(`${label} has non-consecutive PNG IDAT chunks.`);
      if (colorType === 3 && !hasPlte) throw new Error(`${label} indexed PNG is missing PLTE before IDAT.`);
      hasIdat = true;
      idatBytes += chunkLength;
    } else if (chunkType === 'IEND') {
      if (chunkLength !== 0 || !hasIdat || idatBytes === 0) throw new Error(`${label} has an invalid PNG IEND or missing image data.`);
      hasIend = true;
      offset = chunkEnd;
      if (offset !== content.length) throw new Error(`${label} contains trailing bytes after PNG IEND.`);
      break;
    } else {
      if (hasIdat) idatClosed = true;
      if (chunkType[0] === chunkType[0].toUpperCase()) throw new Error(`${label} contains unsupported critical PNG chunk ${chunkType}.`);
      if (chunkType === 'tRNS') {
        if ([4, 6].includes(colorType)) throw new Error(`${label} contains an invalid PNG tRNS chunk for an alpha color type.`);
        hasTransparencyChunk = true;
      }
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  if (!hasIhdr || !hasIdat || !hasIend) throw new Error(`${label} is missing required PNG IHDR, IDAT, or IEND chunks.`);
  const hasAlphaChannel = colorType === 4 || colorType === 6;
  return { width, height, transparency: hasAlphaChannel || hasTransparencyChunk ? 'present' : 'none' };
}

function normalizeInlineFigures(figures = [], figureCaps) {
  if (!Array.isArray(figures)) throw new Error('Inline figures must be an array.');
  if (figures.length > MAX_INLINE_FIGURE_COUNT) {
    throw new Error(`System Email Surface supports at most ${MAX_INLINE_FIGURE_COUNT} inline PNG figures.`);
  }
  const normalized = figures.map((figure, index) => {
    const filename = String(figure?.filename || '').normalize('NFC').trim();
    if (!filename || /[\r\n\0/\\]/.test(filename) || !filename.toLowerCase().endsWith('.png')) {
      throw new Error(`Inline figure requires a safe .png basename: ${filename || '(empty)'}`);
    }
    if (String(figure?.mimeType || '').toLowerCase() !== 'image/png') {
      throw new Error(`Inline figure ${filename} must declare image/png.`);
    }
    const alt = String(figure?.alt || '').replace(/\s+/g, ' ').trim();
    if (!alt || alt.length > 300 || /[\r\n\0]/.test(String(figure?.alt || ''))) {
      throw new Error(`Inline figure ${index + 1} requires one-line alt text between 1 and 300 characters.`);
    }
    const caption = String(figure?.caption || '').replace(/\s+/g, ' ').trim();
    if (caption.length > 500 || /[\r\n\0]/.test(String(figure?.caption || ''))) {
      throw new Error(`Inline figure ${index + 1} caption must be one line of at most 500 characters.`);
    }
    if (!Buffer.isBuffer(figure?.content)) throw new Error(`Inline figure ${filename} must provide Buffer content.`);
    const content = Buffer.from(figure.content);
    const { width, height, transparency } = inspectInlinePng(content, `Inline figure ${filename}`);
    const { displayWidth, displayHeight, sizingClass } = figureDisplayDimensions({ width, height }, figureCaps);
    const digest = sha256(content);
    return {
      filename,
      mimeType: 'image/png',
      content,
      bytes: content.length,
      sha256: digest,
      width,
      height,
      displayWidth,
      displayHeight,
      sizingClass,
      transparency,
      alt,
      caption,
      cid: figures.length === 1
        ? `wawco-${digest.slice(0, 16)}@local`
        : `wawco-${digest.slice(0, 16)}-${index + 1}@local`,
    };
  });
  if (new Set(normalized.map((figure) => figure.sha256)).size !== normalized.length) {
    throw new Error('A two-figure sequence requires two distinct PNG files.');
  }
  return normalized;
}

function normalizeAttachments(attachments = []) {
  if (!Array.isArray(attachments)) throw new Error('Attachments must be an array.');
  if (attachments.length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`At most ${MAX_ATTACHMENT_COUNT} PDF attachments are supported.`);
  }
  let totalBytes = 0;
  return attachments.map((attachment) => {
    const filename = String(attachment?.filename || '').trim();
    if (!filename || /[\r\n\0/\\]/.test(filename)) {
      throw new Error(`Attachment requires a safe basename: ${filename || '(empty)'}`);
    }
    if (!Buffer.isBuffer(attachment?.content)) throw new Error(`Attachment ${filename} must provide Buffer content.`);
    const requestedMimeType = String(attachment?.mimeType || '').toLowerCase();
    const detectedMimeType = attachment.content.subarray(0, 5).toString('ascii') === '%PDF-'
      ? 'application/pdf'
      : 'application/octet-stream';
    if (requestedMimeType !== 'application/pdf' || detectedMimeType !== 'application/pdf') {
      throw new Error(`Attachment ${filename} must be a PDF-signature-checked application/pdf part.`);
    }
    totalBytes += attachment.content.length;
    if (totalBytes > MAX_ATTACHMENT_SOURCE_BYTES) {
      throw new Error('Attachments exceed the 20 MiB helper limit.');
    }
    return {
      filename,
      mimeType: detectedMimeType,
      content: Buffer.from(attachment.content),
      bytes: attachment.content.length,
      sha256: sha256(attachment.content),
    };
  });
}

async function serializeMessage({
  account,
  fromEmail,
  fromName,
  senderPolicy,
  expressionRecord,
  to,
  cc,
  bcc,
  subject,
  args,
  plainTextBody,
  htmlBody,
  inlineFigures,
  attachments,
  bodyFormat,
  systemNote,
  signatureStatus,
  contentDigest,
  markdownStructureHeader,
  serializer = {},
}) {
  const headers = {
    [DRAFT_HELPER_HEADER]: DRAFT_HELPER_VERSION,
    [CONTENT_SHA256_HEADER]: contentDigest,
    [BODY_FORMAT_HEADER]: bodyFormat,
    [SYSTEM_NOTE_HEADER]: systemNote,
    [SIGNATURE_HEADER]: signatureStatus,
    [FIGURE_HEADER]: inlineFigures.length === 2 ? 'sequence-2-cid-png' : inlineFigures.length === 1 ? 'single-cid-png' : 'none',
    [MARKDOWN_STRUCTURE_HEADER]: markdownStructureHeader || 'none',
    [MAIL_PROFILE_HEADER]: senderPolicy.id,
    [MAIL_PROFILE_VERSION_HEADER]: senderPolicy.version,
    [MAIL_PROFILE_POLICY_SHA256_HEADER]: senderPolicy.policySha256 || 'legacy-plain-account',
  };
  if (expressionRecord) {
    headers[EXPRESSION_PROFILE_HEADER] = expressionRecord.profileId;
    headers[EXPRESSION_PROFILE_VERSION_HEADER] = expressionRecord.profileVersion;
    headers[EXPRESSION_PROFILE_SHA256_HEADER] = expressionRecord.profileSha256;
  }
  const mail = new MailComposer({
    from: { name: fromName, address: fromEmail },
    to,
    cc,
    bcc,
    subject,
    text: plainTextBody,
    html: htmlBody || undefined,
    attachments: [
      ...inlineFigures.map((figure) => ({
        filename: figure.filename,
        content: figure.content,
        contentType: figure.mimeType,
        contentDisposition: 'inline',
        cid: figure.cid,
      })),
      ...attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.mimeType,
        contentDisposition: 'attachment',
      })),
    ],
    inReplyTo: args['in-reply-to'] || undefined,
    references: args.references || undefined,
    headers,
    date: serializer.date,
    messageId: serializer.messageId,
    baseBoundary: serializer.baseBoundary,
    boundaryPrefix: '--_WAWCO',
    textEncoding: 'quoted-printable',
    newline: 'windows',
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const compiled = mail.compile();
  compiled.keepBcc = true;
  const rawBuffer = await compiled.build();
  if (rawBuffer.length > MAX_ENCODED_MESSAGE_BYTES) {
    throw new Error(`Encoded message is ${rawBuffer.length} bytes and exceeds the ${MAX_ENCODED_MESSAGE_BYTES}-byte helper limit.`);
  }
  return rawBuffer;
}

function resolveExpressionForSender(senderPolicy) {
  if (senderPolicy.id !== 'wawco-house') return null;
  const validated = loadOrganizationEmailProfile(DEFAULT_WAWCO_PROFILE_PATH);
  if (validated.profileId !== 'wawco.email.house') throw new Error('The WAWCO sender policy requires the exact wawco.email.house expression profile.');
  const resolved = resolveEmailPresentation(validated);
  return { ...resolved, profile: validated.profile };
}

export function buildRawMessage(args, body, {
  boundary,
  signatureHtml,
  attachments,
  inlineFigure,
  inlineFigures,
  bodyFormat = 'plain',
  serializer = {},
} = {}) {
  const senderPolicy = resolveSenderPolicy(args);
  const expressionResolution = resolveExpressionForSender(senderPolicy);
  const presentation = expressionResolution?.presentation;
  const { account, fromEmail, fromName } = senderPolicy;
  const to = parseRecipients(args.to, 'to');
  const cc = parseRecipients(args.cc, 'cc');
  const bcc = parseRecipients(args.bcc, 'bcc');
  const visibleAndHiddenRecipients = [...to, ...cc, ...bcc].map((recipient) => recipient.toLowerCase());
  const defaultBccApplied = !visibleAndHiddenRecipients.includes(DEFAULT_AGENT_BCC.toLowerCase());
  if (defaultBccApplied) bcc.push(DEFAULT_AGENT_BCC);
  const subject = sanitizeHeaderValue(args.subject || '');
  if (!subject) throw new Error('Missing --subject.');
  if (!['plain', 'markdown'].includes(bodyFormat)) {
    throw new Error(`Unsupported body format: ${bodyFormat}`);
  }

  const normalizedBody = normalizeBody(body);
  if (inlineFigure && inlineFigures) throw new Error('Use inlineFigure or inlineFigures, not both.');
  const normalizedFigures = normalizeInlineFigures(inlineFigures || (inlineFigure ? [inlineFigure] : []), presentation?.figureCaps);
  if (normalizedFigures.length && bodyFormat !== 'markdown') {
    throw new Error('Inline figures require --body-markdown-file.');
  }
  const renderedBody = bodyFormat === 'markdown'
    ? renderMarkdownEmail(normalizedBody, { figures: normalizedFigures, presentation })
    : {
      plainText: normalizedBody,
      html: null,
      tableCount: 0,
      highlightCount: 0,
      inlineFigureCount: 0,
      markdownStructure: null,
      formatWarnings: [],
    };
  const markdownStructureHeader = renderedBody.markdownStructure
    ? encodeMarkdownStructure(renderedBody.markdownStructure)
    : '';
  const renderedPlainText = normalizeBody(renderedBody.plainText);
  const reply = validateReplyIntent(args, senderPolicy);
  const systemNoteMode = resolveSystemNoteMode(args['system-note']);
  const systemNote = resolveSystemNoteKind(senderPolicy, systemNoteMode);
  const systemNoteApplied = systemNote !== 'none';
  const safeSignatureHtml = sanitizeTrustedSignatureHtml(signatureHtml);
  if (safeSignatureHtml && !systemNoteApplied) {
    throw new Error('Trusted signature HTML is only permitted for approved system-note mail profiles.');
  }
  const systemNoteText = systemNote === 'kamp-automated' ? KAMP_AUTOMATED_SYSTEM_NOTE : QUIET_EDITORIAL_SYSTEM_NOTE;
  const plainTextBody = systemNoteApplied ? appendSystemNote(renderedPlainText, systemNoteText) : renderedPlainText;
  const htmlBody = renderedBody.html
    ? systemNoteApplied
      ? renderSystemEmailHtml('', { systemNoteKind: systemNote, bodyHtml: renderedBody.html, signatureHtml: safeSignatureHtml })
      : renderedBody.html
    : systemNoteApplied
      ? renderSystemEmailHtml(normalizedBody, { systemNoteKind: systemNote, signatureHtml: safeSignatureHtml })
      : null;
  const normalizedAttachments = normalizeAttachments(attachments);
  const attachmentManifest = normalizedAttachments.map(({ filename, mimeType, bytes, sha256: digest }) => ({
    filename,
    mimeType,
    bytes,
    sha256: digest,
  }));
  const figureManifests = normalizedFigures.map((figure) => ({
    filename: figure.filename,
    mimeType: figure.mimeType,
    bytes: figure.bytes,
    sha256: figure.sha256,
    width: figure.width,
    height: figure.height,
    displayWidth: figure.displayWidth,
    displayHeight: figure.displayHeight,
    sizingClass: figure.sizingClass,
    transparency: figure.transparency,
    alt: figure.alt,
    caption: figure.caption,
    cid: figure.cid,
  }));
  const figureManifest = figureManifests[0] || null;
  const signatureStatus = safeSignatureHtml ? 'provided' : 'none';
  const contentDigest = semanticContentSha256({
    plainTextBody,
    htmlBody,
    attachments: [...normalizedFigures, ...normalizedAttachments],
    markdownStructure: markdownStructureHeader,
  });

  const effectiveSerializer = {
    ...serializer,
    baseBoundary: serializer.baseBoundary || boundary,
  };

  return serializeMessage({
    account,
    fromEmail,
    fromName,
    senderPolicy,
    expressionRecord: expressionResolution?.record || null,
    to,
    cc,
    bcc,
    subject,
    args,
    plainTextBody,
    htmlBody,
    inlineFigures: normalizedFigures,
    attachments: normalizedAttachments,
    bodyFormat,
    systemNote,
    signatureStatus,
    contentDigest,
    markdownStructureHeader,
    serializer: effectiveSerializer,
  }).then((rawBuffer) => ({
    account,
    fromEmail,
    body: plainTextBody,
    htmlBody,
    previewHtmlBody: normalizedFigures.reduce(
      (preview, figure) => preview.replace(`cid:${figure.cid}`, `data:image/png;base64,${figure.content.toString('base64')}`),
      htmlBody,
    ),
    raw: rawBuffer.toString('utf8'),
    rawBuffer,
    summary: {
      account,
      fromEmail,
      mailProfile: senderPolicy.mailProfile || null,
      mailProfileId: senderPolicy.id,
      mailProfileVersion: senderPolicy.version,
      mailProfilePolicySha256: senderPolicy.policySha256 || null,
      expressionProfileId: expressionResolution?.record.profileId || null,
      expressionProfileVersion: expressionResolution?.record.profileVersion || null,
      expressionProfileSha256: expressionResolution?.record.profileSha256 || null,
      to,
      cc,
      bccCount: bcc.length,
      defaultBcc: DEFAULT_AGENT_BCC,
      defaultBccApplied,
      subject,
      reply,
      threadId: args['thread-id'] || null,
      hasInReplyTo: Boolean(args['in-reply-to']),
      hasReferences: Boolean(args.references),
      bodyChars: plainTextBody.length,
      bodyFormat,
      systemNote,
      signatureHtml: signatureStatus,
      contentSha256: contentDigest,
      mimeType: normalizedAttachments.length
        ? 'multipart/mixed'
        : htmlBody
          ? 'multipart/alternative'
          : 'text/plain',
      attachmentCount: normalizedAttachments.length,
      attachmentNames: normalizedAttachments.map((attachment) => attachment.filename),
      attachmentBytes: normalizedAttachments.reduce((sum, attachment) => sum + attachment.bytes, 0),
      attachmentManifest,
      tableCount: renderedBody.tableCount || 0,
      highlightCount: renderedBody.highlightCount || 0,
      inlineFigureCount: normalizedFigures.length,
      markdownStructure: renderedBody.markdownStructure,
      formatWarnings: renderedBody.formatWarnings,
      figureManifest,
      figureManifests,
      encodedMessageBytes: rawBuffer.length,
    },
  }));
}
