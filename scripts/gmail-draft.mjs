#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import {
  DEFAULT_ACCOUNT,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SOURCE_BYTES,
  MAX_INLINE_FIGURE_BYTES,
  MAX_INLINE_FIGURE_COUNT,
  buildRawMessage,
  resolveSenderPolicy,
  resolveSystemNoteKind,
  resolveSystemNoteMode,
} from './gmail-draft-mime.mjs';
import {
  assertDraftApprovalToken,
  requireDraftApprovalToken,
  sendExactReviewedDraft,
  summarizeDraftSnapshot,
} from './gmail-draft-send.mjs';
import { renderDraftPreview } from './gmail-draft-preview.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const DEFAULT_SIGNATURE_SNAPSHOT_DIR = path.join(
  process.env.HOME || '~',
  '.pi',
  'private',
  'google-signatures',
  'wawco',
  'signature-snapshots',
);
const DEFAULT_PRIVATE_NOAH_SIGNATURE_PATH = path.join(DEFAULT_SIGNATURE_SNAPSHOT_DIR, 'current-noah-signature.html');
const DEFAULT_PRIVATE_KAMP_SIGNATURE_PATH = path.join(DEFAULT_SIGNATURE_SNAPSHOT_DIR, 'current-kamp-signature.html');

function privateSignaturePath(senderPolicy) {
  if (senderPolicy.signatureKey === 'kamp-love') {
    return process.env.WAWCO_KAMP_SIGNATURE_SNAPSHOT_PATH || DEFAULT_PRIVATE_KAMP_SIGNATURE_PATH;
  }
  if (senderPolicy.signatureKey === 'wawco-noah') {
    return process.env.WAWCO_NOAH_SIGNATURE_SNAPSHOT_PATH || DEFAULT_PRIVATE_NOAH_SIGNATURE_PATH;
  }
  throw new Error(`Mail profile ${senderPolicy.id} has no approved signature binding.`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const eq = token.indexOf('=');
    const key = token.slice(2, eq === -1 ? undefined : eq);
    if (key.trim().toLowerCase() === 'system-note' && key !== 'system-note') {
      throw new Error('Use the exact flag --system-note=none.');
    }
    if (key === 'system-note' && eq === -1) {
      throw new Error('Use --system-note=none; space-separated values are not accepted.');
    }
    const next = eq === -1 ? argv[i + 1] : token.slice(eq + 1);
    const isBoolean = eq === -1 && (next === undefined || next.startsWith('--'));
    const value = isBoolean ? true : next;
    if (!isBoolean && eq === -1) i += 1;

    if (args[key] === undefined) {
      args[key] = value;
    } else if (Array.isArray(args[key])) {
      args[key].push(value);
    } else {
      args[key] = [args[key], value];
    }
  }
  return args;
}

function getServiceAccountCredentials() {
  loadEnvFile(path.join(ROOT_DIR, '.env.local'));
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!encoded) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY. Add it to .env.local or export it in the shell.');
  }
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

function getGmail(account) {
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    subject: account,
    scopes: [GMAIL_COMPOSE_SCOPE],
  });
  return google.gmail({ version: 'v1', auth });
}

function base64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function resolveLocalPath(value) {
  return path.resolve(String(value).replace(/^~(?=\/)/, process.env.HOME || '~'));
}

function readBody(args) {
  const inputs = [
    ['body', 'plain'],
    ['body-file', 'plain'],
    ['body-markdown-file', 'markdown'],
  ].filter(([key]) => args[key] !== undefined);
  if (inputs.length > 1) {
    throw new Error('Use exactly one of --body, --body-file, or --body-markdown-file.');
  }
  if (!inputs.length) {
    throw new Error('Missing message body. Use --body, --body-file, or --body-markdown-file.');
  }
  const [key, format] = inputs[0];
  const body = key === 'body'
    ? String(args.body)
    : fs.readFileSync(resolveLocalPath(args[key]), 'utf8');
  return { body, format };
}

const MAX_SIGNATURE_BYTES = 128 * 1024;

function openDirectFile(filePath, label) {
  try {
    return fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error(`${label} must not be a symbolic link: ${filePath}`);
    throw error;
  }
}

function readExactFile(descriptor, expectedStat, label) {
  const content = Buffer.alloc(expectedStat.size);
  let offset = 0;
  while (offset < content.length) {
    const bytesRead = fs.readSync(descriptor, content, offset, content.length - offset, offset);
    if (!bytesRead) throw new Error(`${label} changed or became unreadable while it was being read.`);
    offset += bytesRead;
  }
  const finalStat = fs.fstatSync(descriptor);
  if (finalStat.size !== expectedStat.size) {
    throw new Error(`${label} changed size while it was being read.`);
  }
  return content;
}

function readAttachments(args) {
  const values = args.attach === undefined
    ? []
    : Array.isArray(args.attach)
      ? args.attach
      : [args.attach];
  if (values.length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`At most ${MAX_ATTACHMENT_COUNT} PDF attachments are supported.`);
  }

  const opened = [];
  try {
    let totalBytes = 0;
    for (const value of values) {
      const attachmentPath = path.resolve(String(value).replace(/^~(?=\/)/, process.env.HOME || '~'));
      if (path.extname(attachmentPath).toLowerCase() !== '.pdf') {
        throw new Error(`Only PDF attachments are supported: ${attachmentPath}`);
      }
      const descriptor = openDirectFile(attachmentPath, 'Attachment');
      opened.push({ descriptor, attachmentPath });
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile()) throw new Error(`Attachment must be a direct regular file: ${attachmentPath}`);
      totalBytes += stat.size;
      if (totalBytes > MAX_ATTACHMENT_SOURCE_BYTES) {
        throw new Error('Attachments exceed the 20 MiB helper limit.');
      }
      opened.at(-1).stat = stat;
    }

    return opened.map(({ descriptor, attachmentPath, stat }) => ({
      filename: path.basename(attachmentPath),
      mimeType: 'application/pdf',
      content: readExactFile(descriptor, stat, `Attachment ${path.basename(attachmentPath)}`),
    }));
  } finally {
    for (const { descriptor } of opened) fs.closeSync(descriptor);
  }
}

function argumentValues(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function readInlineFigures(args) {
  const imageValues = argumentValues(args['inline-image']);
  const altValues = argumentValues(args['image-alt']);
  const captionValues = argumentValues(args['image-caption']);
  if (!imageValues.length) {
    if (altValues.length || captionValues.length) {
      throw new Error('--image-alt and --image-caption require at least one --inline-image PNG file.');
    }
    return [];
  }
  if (imageValues.length > MAX_INLINE_FIGURE_COUNT) {
    throw new Error(`System Email Surface supports at most ${MAX_INLINE_FIGURE_COUNT} --inline-image values.`);
  }
  if (altValues.length !== imageValues.length || altValues.some((value) => value === true)) {
    throw new Error('Each --inline-image requires one positionally matching --image-alt value.');
  }
  if (captionValues.length && captionValues.length !== imageValues.length) {
    throw new Error('Supply either no --image-caption values or one positionally matching caption per inline image. Use --image-caption= for an intentionally empty caption.');
  }
  if (imageValues.some((value) => value === true)) throw new Error('--inline-image requires a PNG file path.');
  if (captionValues.some((value) => value === true)) throw new Error('--image-caption requires text when supplied.');

  const opened = [];
  try {
    for (const imageValue of imageValues) {
      const imagePath = resolveLocalPath(imageValue);
      if (path.extname(imagePath).toLowerCase() !== '.png') {
        throw new Error(`Inline figure must use a .png file: ${imagePath}`);
      }
      const descriptor = openDirectFile(imagePath, 'Inline figure');
      opened.push({ descriptor, imagePath });
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile()) throw new Error(`Inline figure must be a direct regular file: ${imagePath}`);
      if (stat.size > MAX_INLINE_FIGURE_BYTES) {
        throw new Error(`Inline figure exceeds the ${MAX_INLINE_FIGURE_BYTES}-byte limit.`);
      }
      opened.at(-1).stat = stat;
    }
    return opened.map(({ descriptor, imagePath, stat }, index) => ({
      filename: path.basename(imagePath),
      mimeType: 'image/png',
      content: readExactFile(descriptor, stat, `Inline figure ${path.basename(imagePath)}`),
      alt: String(altValues[index]),
      caption: captionValues.length ? String(captionValues[index]) : '',
    }));
  } finally {
    for (const { descriptor } of opened) fs.closeSync(descriptor);
  }
}

function readTrustedSignatureHtml(args) {
  const senderPolicy = resolveSenderPolicy(args);
  const systemNoteMode = resolveSystemNoteMode(args['system-note']);
  const systemNoteKind = resolveSystemNoteKind(senderPolicy, systemNoteMode);
  if (systemNoteKind === 'none') return undefined;

  const signaturePath = privateSignaturePath(senderPolicy);
  const label = senderPolicy.signatureKey === 'kamp-love' ? 'Private kamp@ signature snapshot' : 'Private noah@ signature snapshot';
  let descriptor;
  try {
    descriptor = openDirectFile(signaturePath, label);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) {
      throw new Error(`${label} must be a direct mode-0600 regular file.`);
    }
    if (stat.size > MAX_SIGNATURE_BYTES) {
      throw new Error(`${label} exceeds the ${MAX_SIGNATURE_BYTES}-byte limit.`);
    }
    const signatureHtml = readExactFile(descriptor, stat, label).toString('utf8');
    if (!signatureHtml) throw new Error(`${label} is empty.`);
    return signatureHtml;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Missing ${label.toLowerCase()}. Refresh it through the approved signature workflow before creating this draft.`);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

async function buildMessageFromArgs(args) {
  const bodyInput = readBody(args);
  const message = await buildRawMessage(args, bodyInput.body, {
    bodyFormat: bodyInput.format,
    signatureHtml: readTrustedSignatureHtml(args),
    attachments: readAttachments(args),
    inlineFigures: readInlineFigures(args),
  });
  const reviewed = await summarizeDraftSnapshot({
    account: message.account,
    draft: { id: 'local-validation', message: { sizeEstimate: message.rawBuffer.length } },
    raw: message.rawBuffer.toString('base64url'),
  });
  if (reviewed.contentSha256 !== message.summary.contentSha256) {
    throw new Error('Local reviewed MIME content digest does not match the built message.');
  }
  if (JSON.stringify(reviewed.markdownStructure) !== JSON.stringify(message.summary.markdownStructure)
    || JSON.stringify(reviewed.formatWarnings) !== JSON.stringify(message.summary.formatWarnings)) {
    throw new Error('Local reviewed MIME formatting summary does not match the built message.');
  }
  return {
    ...message,
    summary: {
      ...message.summary,
      storedMimeStructure: reviewed.storedMimeStructure,
      reviewedFigureManifests: reviewed.figureManifests,
      policyValidated: true,
    },
  };
}

async function createDraft(args) {
  const message = await buildMessageFromArgs(args);
  if (args['dry-run']) {
    console.log(JSON.stringify({ dryRun: true, ...message.summary }, null, 2));
    return;
  }

  const gmail = getGmail(message.account);
  const requestBody = {
    message: {
      raw: base64Url(message.raw),
    },
  };
  if (args['thread-id']) requestBody.message.threadId = String(args['thread-id']);

  const response = await gmail.users.drafts.create({ userId: 'me', requestBody });
  console.log(JSON.stringify({
    account: message.account,
    fromEmail: message.fromEmail,
    mailProfile: message.summary.mailProfile,
    draftId: response.data.id,
    messageId: response.data.message?.id,
    threadId: response.data.message?.threadId,
  }, null, 2));
}

async function previewDraft(args) {
  const out = args.out;
  if (!out || Array.isArray(out)) throw new Error('Preview requires one --out path.');
  if (args.force !== undefined && args.force !== true) throw new Error('Use bare --force without a value.');
  const message = await buildMessageFromArgs(args);
  const outputPath = resolveLocalPath(out);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const openFlags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_NOFOLLOW
    | (args.force ? fs.constants.O_TRUNC : fs.constants.O_EXCL);
  let descriptor;
  try {
    descriptor = fs.openSync(outputPath, openFlags, 0o600);
    fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(descriptor, renderDraftPreview(message), { encoding: 'utf8' });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Preview already exists: ${outputPath}. Choose another path or use bare --force.`);
    }
    if (error?.code === 'ELOOP') {
      throw new Error(`Preview output must not be a symbolic link: ${outputPath}.`);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  console.log(JSON.stringify({
    preview: true,
    outputPath,
    ...message.summary,
  }, null, 2));
}

function requireDraftId(args) {
  const draftId = String(args['draft-id'] || '').trim();
  if (!draftId || Array.isArray(args['draft-id'])) throw new Error('Use one --draft-id value.');
  return draftId;
}

async function fetchDraftSnapshot(gmail, draftId, senderPolicy) {
  const response = await gmail.users.drafts.get({ userId: 'me', id: draftId, format: 'raw' });
  const raw = response.data.message?.raw;
  const summary = await summarizeDraftSnapshot({ account: senderPolicy.account, expectedSenderPolicy: senderPolicy, draft: response.data, raw });
  return { raw, summary };
}

async function reviewDraft(args) {
  const basePolicy = resolveSenderPolicy(args, { requireExplicitHelloProfile: true });
  const senderPolicy = { ...basePolicy, effectiveSystemNoteKind: resolveSystemNoteKind(basePolicy, resolveSystemNoteMode(args['system-note'])) };
  const draftId = requireDraftId(args);
  const gmail = getGmail(senderPolicy.account);
  const { summary } = await fetchDraftSnapshot(gmail, draftId, senderPolicy);
  console.log(JSON.stringify({ reviewed: true, ...summary }, null, 2));
}

async function sendReviewedDraft(args) {
  const basePolicy = resolveSenderPolicy(args, { requireExplicitHelloProfile: true });
  const senderPolicy = { ...basePolicy, effectiveSystemNoteKind: resolveSystemNoteKind(basePolicy, resolveSystemNoteMode(args['system-note'])) };
  const account = senderPolicy.account;
  const draftId = requireDraftId(args);
  const approvalToken = requireDraftApprovalToken(args['approval-token']);
  const gmail = getGmail(account);
  const { raw, summary } = await fetchDraftSnapshot(gmail, draftId, senderPolicy);
  assertDraftApprovalToken(summary.approvalToken, approvalToken);

  try {
    const response = await sendExactReviewedDraft({
      gmail,
      draftId,
      raw,
      approvalToken,
      threadId: summary.threadId,
    });
    console.log(JSON.stringify({
      sent: true,
      account,
      fromEmail: summary.fromEmail,
      draftId,
      approvedPayloadSha256: summary.approvalToken,
      to: summary.to,
      cc: summary.cc,
      bcc: summary.bcc,
      subject: summary.subject,
      attachmentNames: summary.attachmentNames,
      inlineFigures: summary.figureManifests.map((figure) => figure.filename),
      messageId: response.data.id,
      threadId: response.data.threadId,
      labelIds: response.data.labelIds || [],
    }, null, 2));
  } catch (error) {
    throw new Error(`Send result is uncertain for draft ${draftId}. Do not retry automatically. Check Gmail Sent before another attempt. Gmail reported: ${error.message || error}`);
  }
}

function printHelp() {
  console.log(`Gmail draft helper for WAWCO. Creates drafts and sends a reviewed draft only after an exact-payload approval check.

Usage:
  npm run mail:draft -- preview --to person@example.com --subject 'Subject' --body-markdown-file ./body.md --out /tmp/email-preview.html
  npm run mail:draft -- create --to person@example.com --subject 'Subject' --body-markdown-file ./body.md
  npm run mail:draft -- review --draft-id DRAFT_ID
  npm run mail:draft -- send --draft-id DRAFT_ID --approval-token SHA256_FROM_REVIEW

Options:
  --account email         Gmail account to impersonate. Default: ${DEFAULT_ACCOUNT}
  --mail-profile name     Approved sender profile. Use kamp-love for Kamp Love mail.
  --from-email email      From identity. A distinct address requires an approved mail profile.
  --from-name name        Display name. Default: Noah Glynn
  --to email[,email]      Required. Repeatable or comma-delimited.
  --cc email[,email]      Optional. Repeatable or comma-delimited.
  --bcc email[,email]     Optional additional Bcc. Repeatable or comma-delimited.
                          Agent drafts automatically Bcc noah@whatarewecapableof.com.
  --subject text          Required.
  --body text             Plain-text body.
  --body-file path        Plain-text body file.
  --body-markdown-file    Restricted Markdown body file. Produces HTML and plain-text alternatives.
  --out path              Local HTML output path required by preview.
  --force                 Allow preview to overwrite its exact --out path.
  --attach path           Attach a PDF. Repeatable.
  --inline-image path     Embed a local PNG through CID MIME. Markdown only; repeat at most twice.
  --image-alt text        Required positional one-line alt text; repeat once per inline image.
  --image-caption text    Optional positional caption. Supply none or one per image; use = for empty.
  --reply                 Require complete reply-thread fields.
  --thread-id id          Optional Gmail thread ID; required with --reply.
  --in-reply-to id        Optional Message-ID header; required with --reply.
  --references ids        Optional References header; required with --reply.
  --system-note=none      Suppress the noah@ quiet-editorial system note for this draft.
  --dry-run               Validate and print summary without creating a draft.
  --draft-id id           Existing Gmail draft to review or send.
  --approval-token hash   Exact payload SHA-256 emitted by the review command.

Policy:
  Every agent-authored draft automatically Bccs noah@whatarewecapableof.com.
  The quiet-editorial note and current noah@ signature are automatic for noah@.
  The kamp-love profile uses hello@ as the Gmail account, sends from kamp@, and
  adds the Kamp Love automated-system note plus its approved signature. Other
  accounts remain plain text. Sending is allowed only after Noah reviews the exact draft and explicitly
  approves sending it. Run review immediately before send; send fails closed if
  the draft payload changed. A send error is uncertain and must not be retried
  until Gmail Sent is checked.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'help';
  if (command === 'help' || args.help) {
    printHelp();
    return;
  }
  if (command === 'preview') {
    await previewDraft(args);
    return;
  }
  if (command === 'create') {
    await createDraft(args);
    return;
  }
  if (command === 'review') {
    await reviewDraft(args);
    return;
  }
  if (command === 'send') {
    await sendReviewedDraft(args);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
