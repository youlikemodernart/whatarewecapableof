#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ADMIN_USER_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user';
const DOMAIN = 'whatarewecapableof.com';
const DEFAULT_SUBJECT = 'hello@whatarewecapableof.com';
const ALLOWED_ADMIN_SUBJECTS = new Set(['hello@whatarewecapableof.com', 'noah@whatarewecapableof.com']);
const DEFAULT_RECEIPT_DIR = path.join(os.homedir(), '.pi/private/wawco-google/workspace-admin');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
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

loadEnvFile(path.join(ROOT_DIR, '.env.local'));

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
    const next = eq === -1 ? argv[i + 1] : token.slice(eq + 1);
    const isBoolean = eq === -1 && (next === undefined || next.startsWith('--'));
    const value = isBoolean ? true : next;
    if (!isBoolean && eq === -1) i += 1;

    if (args[key] === undefined) args[key] = value;
    else if (Array.isArray(args[key])) args[key].push(value);
    else args[key] = [args[key], value];
  }
  return args;
}

function expandHome(value) {
  return String(value).replace(/^~(?=$|\/)/, os.homedir());
}

function requireArg(args, key, description = key) {
  const value = args[key];
  if (value === undefined || value === true || String(value).trim() === '') {
    throw new Error(`Missing --${key} (${description}).`);
  }
  return String(value).trim();
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sha(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 12);
}

function redactError(error) {
  const detail = error?.response?.data?.error || error?.response?.data || error?.errors || error?.message || String(error);
  const text = typeof detail === 'string' ? detail : detail?.message || JSON.stringify(detail);
  return text
    .replace(/ya29\.[0-9A-Za-z_.-]+/g, '<redacted:access-token>')
    .replace(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<redacted:jwt-like>')
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '<redacted:pem>')
    .slice(0, 2500);
}

function getServiceAccountCredentials() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!encoded) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY. Add it to .env.local or export it in the shell.');
  }
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

function getDirectory(subject = DEFAULT_SUBJECT) {
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    subject,
    scopes: [ADMIN_USER_SCOPE],
  });
  return { directory: google.admin({ version: 'directory_v1', auth }), credentials, subject };
}

function assertWorkspaceUser(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(normalized)) throw new Error(`Invalid user email: ${email}`);
  if (!normalized.endsWith(`@${DOMAIN}`)) throw new Error(`Refusing non-WAWCO user: ${email}`);
  return normalized;
}

function getAdminSubject(args) {
  const subject = assertWorkspaceUser(args.subject || DEFAULT_SUBJECT);
  if (!ALLOWED_ADMIN_SUBJECTS.has(subject)) {
    throw new Error(`Refusing unapproved Admin Directory impersonation subject: ${subject}`);
  }
  return subject;
}

function isInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertPrivatePath(filePath, label) {
  const expanded = path.resolve(expandHome(filePath));
  const allowedRoots = [
    path.join(os.homedir(), '.pi/private'),
    path.join(ROOT_DIR, '.pi/private'),
  ].map((root) => path.resolve(root));
  if (!allowedRoots.some((root) => isInside(expanded, root))) {
    throw new Error(`Refusing ${label} outside ~/.pi/private or project .pi/private: ${expanded}`);
  }
  return expanded;
}

function assertRecoveryEmail(email) {
  const normalized = String(email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error(`Invalid recovery email: ${email}`);
  if (normalized.toLowerCase().endsWith(`@${DOMAIN}`)) {
    throw new Error('Recovery email should be external, not another WAWCO address.');
  }
  return normalized;
}

function assertSafePasswordOut(filePath) {
  const expanded = assertPrivatePath(filePath, 'temporary password file');
  if (fs.existsSync(expanded)) throw new Error(`Refusing to overwrite existing password file: ${expanded}`);
  return expanded;
}

function assertSafeReceiptPath(filePath) {
  return assertPrivatePath(filePath, 'receipt');
}

function defaultReceiptPath(prefix) {
  return path.join(DEFAULT_RECEIPT_DIR, `${prefix}-${timestamp()}.json`);
}

function makeTempPassword(email) {
  const local = String(email).split('@')[0].replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || 'user';
  return `Wawco!${local}!${crypto.randomBytes(7).toString('hex')}A7`;
}

function summarizeUser(user = {}) {
  return {
    ok: true,
    idHash: sha(user.id),
    primaryEmail: user.primaryEmail || null,
    namePresent: Boolean(user.name?.fullName),
    isAdmin: Boolean(user.isAdmin),
    isDelegatedAdmin: Boolean(user.isDelegatedAdmin),
    suspended: Boolean(user.suspended),
    suspensionReason: user.suspensionReason || null,
    archived: Boolean(user.archived),
    changePasswordAtNextLogin: Boolean(user.changePasswordAtNextLogin),
    agreedToTerms: Boolean(user.agreedToTerms),
    isMailboxSetup: user.isMailboxSetup === undefined ? null : Boolean(user.isMailboxSetup),
    orgUnitPath: user.orgUnitPath || null,
    customerIdHash: sha(user.customerId),
    creationTime: user.creationTime || null,
    lastLoginTime: user.lastLoginTime || null,
    recoveryEmail: user.recoveryEmail || null,
    recoveryEmailPresent: Boolean(user.recoveryEmail),
    recoveryPhonePresent: Boolean(user.recoveryPhone),
    aliasesCount: Array.isArray(user.aliases) ? user.aliases.length : 0,
    nonEditableAliasesCount: Array.isArray(user.nonEditableAliases) ? user.nonEditableAliases.length : 0,
    emailsCount: Array.isArray(user.emails) ? user.emails.length : 0,
  };
}

function receiptBase(credentials, subject) {
  return {
    checkedAt: new Date().toISOString(),
    serviceAccount: credentials.client_email,
    serviceAccountClientId: credentials.client_id,
    projectId: credentials.project_id,
    privateKeyIdHash: sha(credentials.private_key_id),
    subject,
  };
}

function writeReceipt(receiptPath, data) {
  const expanded = assertSafeReceiptPath(receiptPath);
  fs.mkdirSync(path.dirname(expanded), { recursive: true, mode: 0o700 });
  fs.writeFileSync(expanded, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return expanded;
}

async function getUser(directory, userKey, projection = 'full') {
  const response = await directory.users.get({ userKey, projection });
  return response.data || {};
}

function ensureNonAdmin(user) {
  if (user.isAdmin || user.isDelegatedAdmin) {
    throw new Error(`Refusing to mutate admin user: ${user.primaryEmail || user.id || 'unknown user'}`);
  }
}

function ensureWritableUser(user, options = {}) {
  ensureNonAdmin(user);
  if (user.archived) throw new Error(`Refusing to mutate archived user: ${user.primaryEmail || user.id}`);
  if (user.suspended && !options.allowSuspendedReset) {
    throw new Error(`Refusing to mutate suspended user without --allow-suspended-reset: ${user.primaryEmail || user.id}`);
  }
}

function requireWriteConfirmation(args, expectedConfirm, expectedWrite) {
  if (args.confirm !== expectedConfirm) {
    throw new Error(`Missing --confirm ${expectedConfirm}`);
  }
  if (args['i-understand-live-write'] !== expectedWrite) {
    throw new Error(`Missing --i-understand-live-write ${expectedWrite}`);
  }
}

async function status(args) {
  const userKey = assertWorkspaceUser(requireArg(args, 'user', 'WAWCO user email'));
  const { directory, credentials, subject } = getDirectory(getAdminSubject(args));
  const receiptPath = args.receipt ? expandHome(args.receipt) : null;
  const user = await getUser(directory, userKey, 'full');
  const receipt = {
    ...receiptBase(credentials, subject),
    command: 'status',
    userKey,
    user: summarizeUser(user),
    summary: {
      userGetOk: true,
      active: !user.suspended && !user.archived,
      nonAdmin: !user.isAdmin && !user.isDelegatedAdmin,
      recoveryEmailPresent: Boolean(user.recoveryEmail),
      changePasswordAtNextLogin: Boolean(user.changePasswordAtNextLogin),
      mailboxSetup: user.isMailboxSetup === undefined ? null : Boolean(user.isMailboxSetup),
    },
  };
  const out = receiptPath ? { receipt: writeReceipt(receiptPath, receipt), ...receipt } : receipt;
  console.log(JSON.stringify(out, null, 2));
}

async function reset(args) {
  const userKey = assertWorkspaceUser(requireArg(args, 'user', 'WAWCO user email'));
  const recoveryEmail = assertRecoveryEmail(requireArg(args, 'recovery-email', 'external recovery email'));
  requireWriteConfirmation(args, 'RESET-WAWCO-USER', 'USER-PASSWORD-RESET');

  const receiptPath = expandHome(args.receipt || defaultReceiptPath('reset-user'));
  const { directory, credentials, subject } = getDirectory(getAdminSubject(args));
  const before = await getUser(directory, userKey, 'full');
  if ((before.primaryEmail || '').toLowerCase() !== userKey) {
    throw new Error(`Refusing alias-targeted reset. Requested ${userKey}, resolved primary ${(before.primaryEmail || '').toLowerCase() || 'unknown'}.`);
  }
  ensureWritableUser(before, { allowSuspendedReset: args['allow-suspended-reset'] === true });

  if (args['dry-run']) {
    const receipt = {
      ...receiptBase(credentials, subject),
      command: 'reset',
      dryRun: true,
      userKey,
      intendedChange: {
        setRecoveryEmail: recoveryEmail,
        resetPassword: true,
        changePasswordAtNextLogin: true,
      },
      before: summarizeUser(before),
    };
    const out = args.receipt ? { receipt: writeReceipt(receiptPath, receipt), ...receipt } : receipt;
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (!args['print-password'] && !args['password-out']) {
    throw new Error('Write command needs --print-password or --password-out ~/.pi/private/.../temp-password.txt so the temporary password can be handed off safely.');
  }
  const passwordOut = args['password-out'] ? assertSafePasswordOut(args['password-out']) : null;

  const temporaryPassword = makeTempPassword(userKey);
  const patchResponse = await directory.users.patch({
    userKey,
    requestBody: {
      recoveryEmail,
      password: temporaryPassword,
      changePasswordAtNextLogin: true,
    },
  });
  const after = await getUser(directory, userKey, 'full');
  const receipt = {
    ...receiptBase(credentials, subject),
    command: 'reset',
    approvalBoundary: 'Admin Directory users.patch for one WAWCO user: set recoveryEmail, reset password, changePasswordAtNextLogin true.',
    userKey,
    recoveryEmail,
    temporaryPasswordHash: sha(temporaryPassword),
    before: summarizeUser(before),
    patch: { ok: true, responseUserHash: sha(patchResponse.data?.id), rawPasswordStored: false },
    after: summarizeUser(after),
    summary: {
      recoveryEmailSet: after.recoveryEmail === recoveryEmail,
      changePasswordAtNextLogin: after.changePasswordAtNextLogin === true,
      userActive: !after.suspended && !after.archived,
      mailboxSetup: after.isMailboxSetup === undefined ? null : Boolean(after.isMailboxSetup),
      nonAdmin: !after.isAdmin && !after.isDelegatedAdmin,
    },
  };
  const writtenReceipt = writeReceipt(receiptPath, receipt);
  if (passwordOut) {
    fs.mkdirSync(path.dirname(passwordOut), { recursive: true, mode: 0o700 });
    fs.writeFileSync(passwordOut, `${temporaryPassword}\n`, { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({
    receipt: writtenReceipt,
    userKey,
    recoveryEmail,
    temporaryPassword: args['print-password'] ? temporaryPassword : undefined,
    temporaryPasswordPath: passwordOut,
    summary: receipt.summary,
  }, null, 2));
}

async function createUser(args) {
  const userKey = assertWorkspaceUser(requireArg(args, 'user', 'new WAWCO user email'));
  const givenName = requireArg(args, 'given-name', 'given name');
  const familyName = requireArg(args, 'family-name', 'family name');
  const recoveryEmail = assertRecoveryEmail(requireArg(args, 'recovery-email', 'external recovery email'));
  requireWriteConfirmation(args, 'CREATE-WAWCO-USER', 'USER-CREATE');

  const receiptPath = expandHome(args.receipt || defaultReceiptPath('create-user'));
  const { directory, credentials, subject } = getDirectory(getAdminSubject(args));

  let existing = null;
  try {
    existing = await getUser(directory, userKey, 'full');
  } catch (error) {
    const message = redactError(error);
    if (!/Resource Not Found|notFound|Not Found/i.test(message)) throw error;
  }
  if (existing) throw new Error(`Refusing to create existing user: ${userKey}`);

  if (args['dry-run']) {
    const receipt = {
      ...receiptBase(credentials, subject),
      command: 'create',
      dryRun: true,
      userKey,
      intendedChange: {
        primaryEmail: userKey,
        givenName,
        familyName,
        setRecoveryEmail: recoveryEmail,
        setTemporaryPassword: true,
        changePasswordAtNextLogin: true,
      },
      note: 'Dry run did not create a user, assign a license, create groups, create aliases, or send sign-in instructions.',
    };
    const out = args.receipt ? { receipt: writeReceipt(receiptPath, receipt), ...receipt } : receipt;
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (!args['print-password'] && !args['password-out']) {
    throw new Error('Write command needs --print-password or --password-out ~/.pi/private/.../temp-password.txt so the temporary password can be handed off safely.');
  }
  const passwordOut = args['password-out'] ? assertSafePasswordOut(args['password-out']) : null;

  const temporaryPassword = makeTempPassword(userKey);
  const insertResponse = await directory.users.insert({
    requestBody: {
      primaryEmail: userKey,
      name: { givenName, familyName },
      recoveryEmail,
      password: temporaryPassword,
      changePasswordAtNextLogin: true,
    },
  });
  const after = await getUser(directory, userKey, 'full');
  const receipt = {
    ...receiptBase(credentials, subject),
    command: 'create',
    approvalBoundary: 'Admin Directory users.insert for one WAWCO user only. No groups, aliases, roles, license edits, sends, or app permissions.',
    userKey,
    recoveryEmail,
    temporaryPasswordHash: sha(temporaryPassword),
    insert: { ok: true, responseUserHash: sha(insertResponse.data?.id), rawPasswordStored: false },
    after: summarizeUser(after),
    summary: {
      created: after.primaryEmail?.toLowerCase() === userKey,
      recoveryEmailSet: after.recoveryEmail === recoveryEmail,
      changePasswordAtNextLogin: after.changePasswordAtNextLogin === true,
      userActive: !after.suspended && !after.archived,
      mailboxSetup: after.isMailboxSetup === undefined ? null : Boolean(after.isMailboxSetup),
      nonAdmin: !after.isAdmin && !after.isDelegatedAdmin,
    },
    caveat: 'Google Workspace may assign a license automatically depending on tenant settings. Verify in Admin Console if licensing matters.',
  };
  const writtenReceipt = writeReceipt(receiptPath, receipt);
  if (passwordOut) {
    fs.mkdirSync(path.dirname(passwordOut), { recursive: true, mode: 0o700 });
    fs.writeFileSync(passwordOut, `${temporaryPassword}\n`, { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({
    receipt: writtenReceipt,
    userKey,
    recoveryEmail,
    temporaryPassword: args['print-password'] ? temporaryPassword : undefined,
    temporaryPasswordPath: passwordOut,
    summary: receipt.summary,
  }, null, 2));
}

function printHelp() {
  console.log(`WAWCO Workspace Admin helper. Uses the WAWCO service-account DWD route from .env.local.

Usage:
  npm run workspace:admin -- status --user user@whatarewecapableof.com
  npm run workspace:admin -- reset --user user@whatarewecapableof.com --recovery-email person@example.com --confirm RESET-WAWCO-USER --i-understand-live-write USER-PASSWORD-RESET --password-out ~/.pi/private/wawco-google/workspace-admin/user-temp-password.txt
  npm run workspace:admin -- create --user name@whatarewecapableof.com --given-name First --family-name Last --recovery-email person@example.com --confirm CREATE-WAWCO-USER --i-understand-live-write USER-CREATE --password-out ~/.pi/private/wawco-google/workspace-admin/name-temp-password.txt

Commands:
  status    Read one user's Admin Directory metadata. No mutation.
  reset     Set recovery email, reset temporary password, and require password change at next login.
  create    Create one standard WAWCO user with recovery email and temporary password.

Safety rules:
  - Refuses non-${DOMAIN} users.
  - Refuses admin or delegated-admin mutation targets.
  - Refuses archived-user mutation targets.
  - Refuses suspended-user mutation targets unless --allow-suspended-reset is explicitly present.
  - Reset/create require explicit --confirm and --i-understand-live-write flags.
  - Reset/create require --password-out ~/.pi/private/... or explicitly approved --print-password so the temp password is intentionally handled.
  - Receipts must stay under ~/.pi/private or project .pi/private and store only a temporary password hash, never the raw password.
  - This helper does not send email, create groups, create aliases, change roles, change licenses, or resend Documenso invitations.

Common options:
  --subject email        Admin subject to impersonate. Allowlist: ${Array.from(ALLOWED_ADMIN_SUBJECTS).join(', ')}. Default: ${DEFAULT_SUBJECT}
  --receipt path        Private JSON receipt path under ~/.pi/private or project .pi/private. Default: ${DEFAULT_RECEIPT_DIR}/<command>-<timestamp>.json
  --dry-run             For write commands, validate target and print or write intended change without mutation.
  --print-password      Print the generated temporary password to stdout only when Noah explicitly approves terminal/chat output.
  --password-out path   Write the generated temporary password to a .pi/private file.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'help';
  if (command === 'help' || args.help) {
    printHelp();
    return;
  }
  if (command === 'status') return status(args);
  if (command === 'reset') return reset(args);
  if (command === 'create') return createUser(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(redactError(error));
  process.exit(1);
});
