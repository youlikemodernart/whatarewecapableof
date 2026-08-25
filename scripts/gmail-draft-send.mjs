import crypto from 'node:crypto';
import { MailParser, simpleParser } from 'mailparser';
import { parseDocument } from 'htmlparser2';
import {
  decodeMarkdownStructure,
  figureDisplayDimensions,
  formatWarningsFromMarkdownStructure,
} from './gmail-draft-markdown.mjs';
import {
  BODY_FORMAT_HEADER,
  CONTENT_SHA256_HEADER,
  DEFAULT_AGENT_BCC,
  DRAFT_HELPER_HEADER,
  DRAFT_HELPER_VERSION,
  FIGURE_HEADER,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SOURCE_BYTES,
  MAX_ENCODED_MESSAGE_BYTES,
  MAX_INLINE_FIGURE_BYTES,
  MAX_INLINE_FIGURE_COUNT,
  MARKDOWN_STRUCTURE_HEADER,
  MAIL_PROFILE_HEADER,
  MAIL_PROFILE_VERSION_HEADER,
  MAIL_PROFILE_POLICY_SHA256_HEADER,
  EXPRESSION_PROFILE_HEADER,
  EXPRESSION_PROFILE_VERSION_HEADER,
  EXPRESSION_PROFILE_SHA256_HEADER,
  HELLO_ACCOUNT,
  KAMP_AUTOMATED_SYSTEM_NOTE,
  KAMP_FROM_ADDRESS,
  NOAH_ACCOUNT,
  QUIET_EDITORIAL_SYSTEM_NOTE,
  SIGNATURE_HEADER,
  SYSTEM_NOTE_HEADER,
  inspectInlinePng,
  semanticContentSha256,
} from './gmail-draft-mime.mjs';
import {
  getMailProfile,
  inferLegacyMailProfile,
} from './gmail-mail-profiles.mjs';
import {
  DEFAULT_WAWCO_PROFILE_PATH,
  loadOrganizationEmailProfile,
} from './email-expression-profile.mjs';

const ALLOWED_HTML_TAGS = new Set([
  'a', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul',
]);
const ALLOWED_HTML_ATTRIBUTES = {
  a: new Set(['href', 'title', 'style']),
  blockquote: new Set(['style']),
  br: new Set(),
  code: new Set(['style']),
  div: new Set(['style', 'data-wawco-system-note']),
  em: new Set(['style']),
  h1: new Set(['style']),
  h2: new Set(['style']),
  h3: new Set(['style']),
  h4: new Set(['style']),
  h5: new Set(['style']),
  h6: new Set(['style']),
  hr: new Set(['style']),
  img: new Set(['src', 'alt', 'width', 'height', 'style']),
  li: new Set(['style']),
  ol: new Set(['start', 'style']),
  p: new Set(['style']),
  pre: new Set(['style']),
  span: new Set(['style']),
  strong: new Set(['style']),
  table: new Set(['role', 'data-wawco-inline-figure', 'data-wawco-figure-index', 'width', 'cellpadding', 'cellspacing', 'border', 'style']),
  tbody: new Set(),
  td: new Set(['data-wawco-figure-caption', 'data-wawco-figure-index', 'align', 'valign', 'style']),
  th: new Set(['scope', 'align', 'valign', 'style']),
  thead: new Set(),
  tr: new Set(),
  ul: new Set(['style']),
};
const ALLOWED_STYLE_PROPERTIES = new Set([
  'background', 'border', 'border-bottom', 'border-collapse', 'border-left', 'border-radius',
  'border-spacing', 'border-top', 'color', 'display', 'font-family', 'font-size', 'font-style',
  'font-weight', 'height', 'letter-spacing', 'line-height', 'margin', 'max-width',
  'mso-line-height-rule', 'outline', 'overflow-wrap', 'padding', 'text-decoration',
  'text-transform', 'white-space', 'width', 'word-break',
]);

function decodeRawDraft(raw) {
  const encoded = String(raw || '').trim();
  if (!encoded) throw new Error('Draft snapshot is missing its raw MIME payload.');
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) {
    throw new Error('Draft snapshot contains malformed base64url MIME data.');
  }
  const rawBuffer = Buffer.from(encoded, 'base64url');
  if (!rawBuffer.length) throw new Error('Draft snapshot decoded to an empty MIME payload.');
  if (rawBuffer.length > MAX_ENCODED_MESSAGE_BYTES) {
    throw new Error(`Reviewed MIME is ${rawBuffer.length} bytes and exceeds the ${MAX_ENCODED_MESSAGE_BYTES}-byte helper limit.`);
  }
  return rawBuffer;
}

function parsedHeader(parsed, name) {
  return String(parsed.headers.get(String(name).toLowerCase()) || '').trim();
}

function addressList(addressObject) {
  return (addressObject?.value || [])
    .map((entry) => String(entry?.address || '').trim().toLowerCase())
    .filter(Boolean);
}

function displayAddresses(addressObject) {
  return String(addressObject?.text || '');
}

function assertDigest(expected, actual, label) {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error(`${label} is missing or malformed.`);
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(actual, 'utf8');
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new Error(`${label} does not match the reviewed MIME content.`);
  }
}

function normalizeContentId(value) {
  return String(value || '').trim().replace(/^<|>$/g, '');
}

function assertSafeStyle(style) {
  const source = String(style || '');
  if (!source || /[\0\r\n<>`()\\]/.test(source) || /(?:url|expression|@import|javascript|data:|cid:)/i.test(source)) {
    throw new Error('Reviewed HTML contains an unsafe style value.');
  }
  for (const declaration of source.split(';')) {
    if (!declaration.trim()) continue;
    const separator = declaration.indexOf(':');
    if (separator <= 0 || !declaration.slice(separator + 1).trim()) {
      throw new Error('Reviewed HTML contains a malformed style declaration.');
    }
    const property = declaration.slice(0, separator).trim().toLowerCase();
    if (!ALLOWED_STYLE_PROPERTIES.has(property)) {
      throw new Error(`Reviewed HTML contains unsupported style property: ${property || '(empty)'}.`);
    }
  }
}

function nodeText(node) {
  if (!node) return '';
  if (node.type === 'text') return String(node.data || '');
  return (node.children || []).map(nodeText).join('');
}

function descendantNodes(node, predicate) {
  const matches = [];
  const stack = [...(node?.children || [])];
  while (stack.length) {
    const child = stack.pop();
    if (predicate(child)) matches.push(child);
    stack.push(...(child?.children || []));
  }
  return matches;
}

function assertReviewedHtml(html, { inlineFigures = [] } = {}) {
  if (!html) {
    if (inlineFigures.length) throw new Error('Reviewed inline figures require an HTML alternative.');
    return [];
  }

  const document = parseDocument(String(html), { decodeEntities: true });
  const images = [];
  const figureContainers = [];
  const captions = [];
  const visit = (node) => {
    if (node?.name) {
      const tag = String(node.name).toLowerCase();
      if (!ALLOWED_HTML_TAGS.has(tag)) {
        throw new Error(`Reviewed HTML contains unsupported <${tag}> markup.`);
      }
      const allowedAttributes = ALLOWED_HTML_ATTRIBUTES[tag];
      for (const [name, value] of Object.entries(node.attribs || {})) {
        const attribute = name.toLowerCase();
        if (!allowedAttributes.has(attribute)) {
          throw new Error(`Reviewed HTML contains unsupported ${attribute} attribute on <${tag}>.`);
        }
        if (attribute === 'style') assertSafeStyle(value);
        if (attribute === 'href' && !/^(?:https?:|mailto:)/i.test(value)) {
          throw new Error(`Reviewed HTML link uses an unsupported URL scheme: ${value || '(empty)'}`);
        }
      }
      if (tag === 'img') images.push(node);
      if (tag === 'table' && node.attribs?.['data-wawco-inline-figure'] !== undefined) figureContainers.push(node);
      if (tag === 'td' && node.attribs?.['data-wawco-figure-caption'] !== undefined) captions.push(node);
    }
    for (const child of node?.children || []) visit(child);
  };
  for (const child of document.children || []) visit(child);

  if (!inlineFigures.length) {
    if (images.length || figureContainers.length || captions.length) {
      throw new Error('Reviewed HTML contains an unapproved image or figure component.');
    }
    return [];
  }
  if (images.length !== inlineFigures.length || figureContainers.length !== inlineFigures.length) {
    throw new Error(`Reviewed HTML must contain exactly ${inlineFigures.length} approved source-bound inline figure component(s).`);
  }

  const documentIndexes = figureContainers.map((container) => Number(container.attribs?.['data-wawco-figure-index']));
  if (documentIndexes.some((index, position) => index !== position + 1)) {
    throw new Error('Reviewed inline-figure components are not in declared document order.');
  }

  const containersByIndex = new Map();
  for (const container of figureContainers) {
    const index = Number(container.attribs?.['data-wawco-figure-index']);
    if (container.attribs?.['data-wawco-inline-figure'] !== 'v1' || !Number.isInteger(index) || index < 1 || index > inlineFigures.length || containersByIndex.has(index)) {
      throw new Error('Reviewed HTML contains an invalid or duplicate inline-figure index marker.');
    }
    containersByIndex.set(index, container);
  }

  const usedImages = new Set();
  const usedCaptions = new Set();
  const reviewed = [];
  for (let offset = 0; offset < inlineFigures.length; offset += 1) {
    const index = offset + 1;
    const inlineFigure = inlineFigures[offset];
    const container = containersByIndex.get(index);
    if (!container) throw new Error(`Reviewed HTML is missing inline-figure component ${index}.`);
    const componentImages = descendantNodes(container, (node) => String(node?.name || '').toLowerCase() === 'img');
    const componentCaptions = descendantNodes(container, (node) => String(node?.name || '').toLowerCase() === 'td' && node.attribs?.['data-wawco-figure-caption'] !== undefined);
    if (componentImages.length !== 1 || componentCaptions.length > 1) {
      throw new Error(`Reviewed inline-figure component ${index} must contain one image and at most one caption.`);
    }
    const image = componentImages[0];
    const captionNode = componentCaptions[0] || null;
    usedImages.add(image);
    if (captionNode) {
      if (captionNode.attribs?.['data-wawco-figure-caption'] !== 'v1' || Number(captionNode.attribs?.['data-wawco-figure-index']) !== index) {
        throw new Error(`Reviewed inline-figure caption ${index} has an invalid marker.`);
      }
      usedCaptions.add(captionNode);
    }

    const src = String(image.attribs?.src || '');
    const alt = String(image.attribs?.alt || '').replace(/\s+/g, ' ').trim();
    const width = String(image.attribs?.width || '');
    const height = image.attribs?.height;
    if (src !== `cid:${inlineFigure.cid}`) throw new Error(`Reviewed inline-image CID ${index} does not match its MIME part.`);
    if (!alt || alt.length > 300) throw new Error(`Reviewed inline image ${index} is missing bounded alt text.`);
    if (!/^\d+$/.test(width)) {
      throw new Error(`Reviewed inline image ${index} requires a numeric width attribute.`);
    }
    if (height !== undefined) {
      throw new Error(`Reviewed inline image ${index} must omit the height attribute so a blocked image does not reserve a large empty frame.`);
    }
    const { displayWidth, displayHeight, sizingClass } = figureDisplayDimensions(inlineFigure);
    if (Number(width) !== displayWidth) {
      throw new Error(`Reviewed inline-image display width ${index} does not match its PNG dimensions.`);
    }
    const caption = captionNode ? nodeText(captionNode).replace(/\s+/g, ' ').trim() : '';
    if (caption.length > 500) throw new Error(`Reviewed inline-figure caption ${index} exceeds 500 characters.`);
    reviewed.push({ alt, caption, displayWidth, displayHeight, sizingClass });
  }
  if (usedImages.size !== images.length || usedCaptions.size !== captions.length) {
    throw new Error('Reviewed HTML contains an image or caption outside its indexed figure component.');
  }
  return reviewed;
}

function normalizePolicyText(value) {
  return String(value || '').replace(/\r\n|\r/g, '\n');
}

function parseMimeTree(rawBuffer) {
  return new Promise((resolve, reject) => {
    const parser = new MailParser({
      skipHtmlToText: true,
      skipTextToHtml: true,
      maxHtmlLengthToParse: 2 * 1024 * 1024,
      keepCidLinks: true,
    });
    let reading = false;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const readAvailable = () => {
      if (settled) return;
      reading = true;
      let item;
      while ((item = parser.read()) !== null) {
        if (item.type === 'attachment') {
          item.content.once('error', fail);
          item.content.resume();
          item.content.once('end', () => {
            item.release();
            reading = false;
            readAvailable();
          });
          return;
        }
      }
      reading = false;
    };
    parser.on('error', fail);
    parser.on('readable', () => {
      if (!reading) readAvailable();
    });
    parser.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(parser.tree);
    });
    parser.end(rawBuffer);
  });
}

function mimeShape(node) {
  const type = String(node?.contentType || '').toLowerCase();
  const children = node?.children || [];
  return children.length ? `${type}(${children.map(mimeShape).join(',')})` : type;
}

function assertMimeStructure(tree, { hasHtml, figureCount, pdfCount }) {
  const requireType = (node, type, label) => {
    if (String(node?.contentType || '').toLowerCase() !== type) {
      throw new Error(`Reviewed MIME has an unsupported ${label} structure; expected ${type}.`);
    }
  };
  let bodyNode = tree;
  if (pdfCount) {
    requireType(tree, 'multipart/mixed', 'outer');
    if ((tree.children || []).length !== pdfCount + 1) {
      throw new Error('Reviewed multipart/mixed MIME must contain one body entity followed by the reviewed PDFs.');
    }
    bodyNode = tree.children[0];
    for (const pdfNode of tree.children.slice(1)) {
      requireType(pdfNode, 'application/pdf', 'PDF attachment');
      if (String(pdfNode.disposition || '').toLowerCase() !== 'attachment') {
        throw new Error('Reviewed PDF MIME parts must use attachment disposition outside the body entity.');
      }
    }
  } else if (String(tree?.contentType || '').toLowerCase() === 'multipart/mixed') {
    throw new Error('Reviewed MIME uses an unnecessary or flattened multipart/mixed body.');
  }

  if (!hasHtml) {
    if (figureCount) throw new Error('Reviewed inline figures require an HTML MIME entity.');
    requireType(bodyNode, 'text/plain', 'body');
    if ((bodyNode.children || []).length) throw new Error('Reviewed plain-text MIME body cannot contain child entities.');
    return mimeShape(tree);
  }

  requireType(bodyNode, 'multipart/alternative', 'body');
  const alternatives = bodyNode.children || [];
  if (alternatives.length !== 2) {
    throw new Error('Reviewed multipart/alternative MIME must contain exactly plain-text and HTML alternatives.');
  }
  requireType(alternatives[0], 'text/plain', 'first alternative');
  if (!figureCount) {
    requireType(alternatives[1], 'text/html', 'second alternative');
    if ((alternatives[1].children || []).length) throw new Error('Reviewed HTML alternative cannot contain child entities without a figure.');
    return mimeShape(tree);
  }

  const related = alternatives[1];
  requireType(related, 'multipart/related', 'figure alternative');
  const relatedParts = related.children || [];
  if (relatedParts.length !== figureCount + 1) {
    throw new Error(`Reviewed multipart/related figure sequence must contain exactly HTML and ${figureCount} inline PNG part(s).`);
  }
  requireType(relatedParts[0], 'text/html', 'related HTML part');
  for (const figurePart of relatedParts.slice(1)) {
    requireType(figurePart, 'image/png', 'related inline figure part');
    if (String(figurePart.disposition || '').toLowerCase() !== 'inline') {
      throw new Error('Reviewed related PNG parts must use inline disposition.');
    }
  }
  return mimeShape(tree);
}

export function draftPayloadSha256(raw) {
  return crypto.createHash('sha256').update(decodeRawDraft(raw)).digest('hex');
}

export function requireDraftApprovalToken(suppliedToken) {
  const supplied = String(suppliedToken || '').trim();
  if (!/^[a-f0-9]{64}$/.test(supplied)) {
    throw new Error('Send requires the exact lowercase 64-character --approval-token from the review command.');
  }
  return supplied;
}

export function assertDraftApprovalToken(actualToken, suppliedToken) {
  const actual = String(actualToken || '').trim();
  const supplied = requireDraftApprovalToken(suppliedToken);
  const left = Buffer.from(actual, 'utf8');
  const right = Buffer.from(supplied, 'utf8');
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new Error('Draft changed after review or the approval token is wrong. Review the draft again before sending.');
  }
}

export async function sendExactReviewedDraft({ gmail, draftId, raw, approvalToken, threadId }) {
  assertDraftApprovalToken(draftPayloadSha256(raw), approvalToken);
  const message = { raw };
  const normalizedThreadId = String(threadId || '').trim();
  // Gmail requires threadId in the Message resource, in addition to reply MIME headers,
  // when drafts.send replaces the stored draft content with reviewed raw MIME.
  if (normalizedThreadId) message.threadId = normalizedThreadId;
  return gmail.users.drafts.send({
    userId: 'me',
    requestBody: {
      id: draftId,
      message,
    },
  });
}

export async function summarizeDraftSnapshot({ account, expectedSenderPolicy = null, draft, raw }) {
  const rawBuffer = decodeRawDraft(raw);
  const [parsed, mimeTree] = await Promise.all([
    simpleParser(rawBuffer, {
      skipHtmlToText: true,
      skipTextToHtml: true,
      maxHtmlLengthToParse: 2 * 1024 * 1024,
      keepCidLinks: true,
    }),
    parseMimeTree(rawBuffer),
  ]);

  const helperVersion = parsedHeader(parsed, DRAFT_HELPER_HEADER);
  if (helperVersion !== DRAFT_HELPER_VERSION) {
    throw new Error(`Draft is not an approved ${DRAFT_HELPER_HEADER}: ${DRAFT_HELPER_VERSION} message.`);
  }
  const bodyFormat = parsedHeader(parsed, BODY_FORMAT_HEADER);
  if (!['plain', 'markdown'].includes(bodyFormat)) throw new Error('Draft has an unsupported or missing WAWCO body-format marker.');
  const systemNote = parsedHeader(parsed, SYSTEM_NOTE_HEADER);
  if (!['quiet-editorial', 'kamp-automated', 'none'].includes(systemNote)) throw new Error('Draft has an unsupported or missing WAWCO system-note marker.');
  const signatureStatus = parsedHeader(parsed, SIGNATURE_HEADER);
  if (!['provided', 'none'].includes(signatureStatus)) throw new Error('Draft has an unsupported or missing WAWCO signature marker.');
  const figureMode = parsedHeader(parsed, FIGURE_HEADER);
  if (!['single-cid-png', 'sequence-2-cid-png', 'none'].includes(figureMode)) throw new Error('Draft has an unsupported or missing WAWCO inline-figure marker.');
  const markdownStructureHeader = parsedHeader(parsed, MARKDOWN_STRUCTURE_HEADER);
  let markdownStructure = null;
  let formatWarnings = [];
  if (bodyFormat === 'markdown') {
    if (markdownStructureHeader && markdownStructureHeader !== 'none') {
      markdownStructure = decodeMarkdownStructure(markdownStructureHeader);
      formatWarnings = formatWarningsFromMarkdownStructure(markdownStructure);
    } else {
      formatWarnings = [{
        code: 'markdown-structure-unavailable',
        severity: 'warning',
        count: 0,
        message: 'This stored Markdown draft predates deterministic structure reporting. Inspect both rendered alternatives before approval.',
      }];
    }
  } else if (markdownStructureHeader && markdownStructureHeader !== 'none') {
    throw new Error('Reviewed plain-text MIME cannot claim a Markdown structure summary.');
  }

  const normalizedAccount = String(account || '').trim().toLowerCase();
  const fromAddresses = addressList(parsed.from);
  if (fromAddresses.length !== 1) throw new Error('Reviewed MIME must contain exactly one From address.');
  const actualFromAddress = fromAddresses[0];
  const actualFromName = String(parsed.from?.value?.[0]?.name || '').trim();
  const profileIdHeader = parsedHeader(parsed, MAIL_PROFILE_HEADER);
  const profileVersionHeader = parsedHeader(parsed, MAIL_PROFILE_VERSION_HEADER);
  const profilePolicySha256Header = parsedHeader(parsed, MAIL_PROFILE_POLICY_SHA256_HEADER);
  if ([profileIdHeader, profileVersionHeader, profilePolicySha256Header].some(Boolean)
    && ![profileIdHeader, profileVersionHeader, profilePolicySha256Header].every(Boolean)) {
    throw new Error('Reviewed MIME has an incomplete mail-profile marker set.');
  }
  let resolvedMailProfile;
  if (profileIdHeader && profileIdHeader !== 'legacy-plain-account') {
    resolvedMailProfile = getMailProfile(profileIdHeader);
    if (profileVersionHeader !== resolvedMailProfile.version || profilePolicySha256Header !== resolvedMailProfile.policySha256) {
      throw new Error('Reviewed MIME mail-profile version or policy digest does not match the canonical profile table.');
    }
  } else {
    resolvedMailProfile = inferLegacyMailProfile({ account: normalizedAccount, fromEmail: actualFromAddress, systemNote });
    if (profileIdHeader && profileIdHeader !== resolvedMailProfile.id) throw new Error('Reviewed MIME legacy profile marker does not match its sender policy.');
  }
  if (resolvedMailProfile.account !== normalizedAccount || resolvedMailProfile.fromEmail !== actualFromAddress) {
    throw new Error('Reviewed MIME From address does not match the selected Gmail account or approved sender profile.');
  }
  if (expectedSenderPolicy) {
    const expectedSystemNote = expectedSenderPolicy.effectiveSystemNoteKind ?? expectedSenderPolicy.systemNoteKind;
    for (const [label, actual, expected] of [
      ['profile ID', resolvedMailProfile.id, expectedSenderPolicy.id],
      ['profile version', resolvedMailProfile.version, expectedSenderPolicy.version],
      ['account', resolvedMailProfile.account, expectedSenderPolicy.account],
      ['From address', resolvedMailProfile.fromEmail, expectedSenderPolicy.fromEmail],
      ['display name', actualFromName, expectedSenderPolicy.fromName],
      ['system-note mode', systemNote, expectedSystemNote],
    ]) {
      if (actual !== expected) throw new Error(`Reviewed MIME ${label} does not match the explicitly selected mail profile.`);
    }
    if (expectedSenderPolicy.policySha256 && resolvedMailProfile.policySha256 !== expectedSenderPolicy.policySha256) {
      throw new Error('Reviewed MIME sender-policy digest does not match the explicitly selected mail profile.');
    }
  }
  const expressionProfileId = parsedHeader(parsed, EXPRESSION_PROFILE_HEADER);
  const expressionProfileVersion = parsedHeader(parsed, EXPRESSION_PROFILE_VERSION_HEADER);
  const expressionProfileSha256 = parsedHeader(parsed, EXPRESSION_PROFILE_SHA256_HEADER);
  if ([expressionProfileId, expressionProfileVersion, expressionProfileSha256].some(Boolean)
    && ![expressionProfileId, expressionProfileVersion, expressionProfileSha256].every(Boolean)) {
    throw new Error('Reviewed MIME has an incomplete expression-profile marker set.');
  }
  if (expressionProfileId) {
    const accepted = loadOrganizationEmailProfile(DEFAULT_WAWCO_PROFILE_PATH);
    if (accepted.status !== 'accepted'
      || expressionProfileId !== accepted.profileId
      || expressionProfileVersion !== accepted.profileVersion
      || expressionProfileSha256 !== accepted.profileSha256) {
      throw new Error('Reviewed MIME expression profile does not match the current accepted WAWCO profile.');
    }
    if (resolvedMailProfile.id !== 'wawco-house') {
      throw new Error('Reviewed MIME cannot apply the WAWCO expression profile outside the WAWCO house sender policy.');
    }
  }
  const expectedFromAddress = resolvedMailProfile.fromEmail;
  const recipients = [...addressList(parsed.to), ...addressList(parsed.cc), ...addressList(parsed.bcc)];
  if (!recipients.includes(resolvedMailProfile.defaultBcc.toLowerCase())) {
    throw new Error(`Reviewed MIME must include ${resolvedMailProfile.defaultBcc} as a To, Cc, or Bcc recipient.`);
  }

  const htmlBody = typeof parsed.html === 'string' ? parsed.html : '';
  const plainTextBody = String(parsed.text || '');
  if (bodyFormat === 'markdown' && !htmlBody) throw new Error('Reviewed Markdown MIME is missing its HTML alternative.');
  if (bodyFormat === 'plain' && systemNote === 'none' && htmlBody) {
    throw new Error('Reviewed plain-text MIME without a system note unexpectedly contains an HTML alternative.');
  }
  if (figureMode !== 'none' && bodyFormat !== 'markdown') {
    throw new Error('Reviewed inline figure requires a Markdown body marker.');
  }

  if (systemNote === 'quiet-editorial') {
    if (normalizedAccount !== NOAH_ACCOUNT || signatureStatus !== 'provided') {
      throw new Error('Quiet-editorial reviewed MIME requires the Noah account and approved signature marker.');
    }
    if (!normalizePolicyText(plainTextBody).includes(normalizePolicyText(QUIET_EDITORIAL_SYSTEM_NOTE))) {
      throw new Error('Reviewed MIME is missing the required quiet-editorial plain-text system note.');
    }
    if (!/data-wawco-system-note="quiet-editorial"/i.test(htmlBody)) {
      throw new Error('Reviewed MIME is missing the required quiet-editorial HTML system note.');
    }
  } else if (systemNote === 'kamp-automated') {
    if (normalizedAccount !== HELLO_ACCOUNT || signatureStatus !== 'provided') {
      throw new Error('Kamp automated reviewed MIME requires the hello@ account and approved Kamp signature marker.');
    }
    if (!normalizePolicyText(plainTextBody).includes(normalizePolicyText(KAMP_AUTOMATED_SYSTEM_NOTE))) {
      throw new Error('Reviewed MIME is missing the required Kamp automated plain-text system note.');
    }
    if (!/data-wawco-system-note="kamp-automated"/i.test(htmlBody)) {
      throw new Error('Reviewed MIME is missing the required Kamp automated HTML system note.');
    }
  } else if (signatureStatus !== 'none') {
    throw new Error('Reviewed MIME cannot claim a signature when its system note is suppressed.');
  }

  if (parsed.attachments.length > MAX_ATTACHMENT_COUNT + MAX_INLINE_FIGURE_COUNT) {
    throw new Error(`Reviewed MIME exceeds the ${MAX_ATTACHMENT_COUNT}-PDF plus ${MAX_INLINE_FIGURE_COUNT}-inline-figure limit.`);
  }

  const semanticParts = [];
  const attachments = [];
  const inlineFigures = [];
  for (const part of parsed.attachments) {
    const filename = String(part.filename || '').normalize('NFC');
    const mimeType = String(part.contentType || '').toLowerCase();
    const cid = normalizeContentId(part.contentId);
    const disposition = String(part.contentDisposition || '').toLowerCase();
    if (mimeType === 'image/png' || cid || disposition === 'inline') {
      if (!filename || /[\r\n\0/\\]/.test(filename) || !filename.toLowerCase().endsWith('.png')) {
        throw new Error(`Reviewed inline figure requires a safe PNG basename: ${filename || '(empty)'}`);
      }
      if (mimeType !== 'image/png' || disposition !== 'inline' || !cid || !/^[a-z0-9._@-]+$/i.test(cid)) {
        throw new Error(`Reviewed inline figure ${filename} requires image/png, inline disposition, and a safe Content-ID.`);
      }
      if (part.content.length > MAX_INLINE_FIGURE_BYTES) {
        throw new Error(`Reviewed inline figure ${filename} exceeds the ${MAX_INLINE_FIGURE_BYTES}-byte limit.`);
      }
      const { width, height, transparency } = inspectInlinePng(part.content, `Reviewed inline figure ${filename}`);
      const normalized = {
        filename,
        mimeType,
        content: part.content,
        bytes: part.content.length,
        sha256: crypto.createHash('sha256').update(part.content).digest('hex'),
        width,
        height,
        transparency,
        cid,
      };
      inlineFigures.push(normalized);
      semanticParts.push(normalized);
      continue;
    }
    if (!filename || /[\r\n\0/\\]/.test(filename) || !filename.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Reviewed attachment requires a safe PDF basename: ${filename || '(empty)'}`);
    }
    if (mimeType !== 'application/pdf' || part.content.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error(`Reviewed attachment ${filename} must be a PDF-signature-checked application/pdf part.`);
    }
    const normalized = {
      filename,
      mimeType,
      content: part.content,
      bytes: part.content.length,
      sha256: crypto.createHash('sha256').update(part.content).digest('hex'),
    };
    attachments.push(normalized);
    semanticParts.push(normalized);
  }

  if (attachments.length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`Reviewed MIME exceeds the ${MAX_ATTACHMENT_COUNT}-PDF attachment limit.`);
  }
  const expectedFigureCount = figureMode === 'sequence-2-cid-png' ? 2 : figureMode === 'single-cid-png' ? 1 : 0;
  if (inlineFigures.length !== expectedFigureCount) {
    throw new Error(`Reviewed MIME must contain exactly ${expectedFigureCount} approved inline PNG figure(s).`);
  }
  if (figureMode === 'none' && inlineFigures.length) {
    throw new Error('Reviewed MIME contains an inline figure without its approved policy marker.');
  }
  if (new Set(inlineFigures.map((figure) => figure.cid)).size !== inlineFigures.length) {
    throw new Error('Reviewed inline figures must use unique Content-ID values.');
  }
  const reviewedFigureText = assertReviewedHtml(htmlBody, { inlineFigures });
  const storedMimeStructure = assertMimeStructure(mimeTree, {
    hasHtml: Boolean(htmlBody),
    figureCount: inlineFigures.length,
    pdfCount: attachments.length,
  });

  const attachmentBytes = attachments.reduce((sum, attachment) => sum + attachment.bytes, 0);
  if (attachmentBytes > MAX_ATTACHMENT_SOURCE_BYTES) {
    throw new Error('Reviewed PDF attachments exceed the 20 MiB helper limit.');
  }

  const expectedContentDigest = parsedHeader(parsed, CONTENT_SHA256_HEADER);
  const actualContentDigest = semanticContentSha256({
    plainTextBody,
    htmlBody,
    attachments: semanticParts,
    markdownStructure: markdownStructure ? markdownStructureHeader : '',
  });
  assertDigest(expectedContentDigest, actualContentDigest, CONTENT_SHA256_HEADER);

  const message = draft?.message || {};
  const approvalToken = crypto.createHash('sha256').update(rawBuffer).digest('hex');
  const attachmentManifest = attachments.map(({ filename, mimeType, bytes, sha256 }) => ({
    filename,
    mimeType,
    bytes,
    sha256,
  }));
  const figureManifests = inlineFigures.map((inlineFigure, index) => ({
    filename: inlineFigure.filename,
    mimeType: inlineFigure.mimeType,
    bytes: inlineFigure.bytes,
    sha256: inlineFigure.sha256,
    width: inlineFigure.width,
    height: inlineFigure.height,
    displayWidth: reviewedFigureText[index].displayWidth,
    displayHeight: reviewedFigureText[index].displayHeight,
    sizingClass: reviewedFigureText[index].sizingClass,
    transparency: inlineFigure.transparency,
    cid: inlineFigure.cid,
    alt: reviewedFigureText[index].alt,
    caption: reviewedFigureText[index].caption,
  }));
  const figureManifest = figureManifests[0] || null;
  return {
    account: String(account || ''),
    fromEmail: expectedFromAddress,
    fromName: actualFromName,
    mailProfileId: resolvedMailProfile.id,
    mailProfileVersion: resolvedMailProfile.version,
    mailProfilePolicySha256: resolvedMailProfile.policySha256 || null,
    expressionProfileId: expressionProfileId || null,
    expressionProfileVersion: expressionProfileVersion || null,
    expressionProfileSha256: expressionProfileSha256 || null,
    draftId: String(draft?.id || ''),
    messageId: String(message.id || ''),
    threadId: String(message.threadId || ''),
    to: displayAddresses(parsed.to),
    cc: displayAddresses(parsed.cc),
    bcc: displayAddresses(parsed.bcc),
    subject: String(parsed.subject || ''),
    bodyFormat,
    systemNote,
    signatureHtml: signatureStatus,
    helperVersion,
    contentSha256: expectedContentDigest,
    markdownStructure,
    formatWarnings,
    inlineFigureMode: figureMode,
    inlineFigureCount: inlineFigures.length,
    figureManifest,
    figureManifests,
    storedMimeStructure,
    attachmentCount: attachments.length,
    attachmentNames: attachments.map((attachment) => attachment.filename),
    attachmentBytes,
    attachmentManifest,
    encodedMessageBytes: rawBuffer.length,
    estimatedMessageBytes: Number(message.sizeEstimate || 0),
    approvalToken,
  };
}
