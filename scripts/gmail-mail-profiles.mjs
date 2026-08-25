import crypto from 'node:crypto';

export const DEFAULT_ACCOUNT = 'noah@whatarewecapableof.com';
export const NOAH_ACCOUNT = DEFAULT_ACCOUNT;
export const HELLO_ACCOUNT = 'hello@whatarewecapableof.com';
export const KAMP_FROM_ADDRESS = 'kamp@whatarewecapableof.com';
export const KAMP_MAIL_PROFILE = 'kamp-love';
export const DEFAULT_AGENT_BCC = NOAH_ACCOUNT;
export const DEFAULT_MAIL_PROFILE = 'wawco-house';

const PROFILE_RECORDS = Object.freeze({
  [DEFAULT_MAIL_PROFILE]: Object.freeze({
    id: DEFAULT_MAIL_PROFILE,
    version: '1.0.0',
    account: NOAH_ACCOUNT,
    fromEmail: NOAH_ACCOUNT,
    fromName: 'Noah Glynn',
    fromNameOverrideAllowed: true,
    systemNoteKind: 'quiet-editorial',
    signatureKey: 'wawco-noah',
    signatureRequired: true,
    defaultBcc: DEFAULT_AGENT_BCC,
    replyEnabled: true,
  }),
  [KAMP_MAIL_PROFILE]: Object.freeze({
    id: KAMP_MAIL_PROFILE,
    version: '1.0.0',
    account: HELLO_ACCOUNT,
    fromEmail: KAMP_FROM_ADDRESS,
    fromName: 'Noah Glynn',
    fromNameOverrideAllowed: false,
    systemNoteKind: 'kamp-automated',
    signatureKey: 'kamp-love',
    signatureRequired: true,
    defaultBcc: DEFAULT_AGENT_BCC,
    replyEnabled: true,
  }),
});

function clean(value) { return String(value ?? '').replace(/[\r\n\0]+/g, ' ').trim(); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function mailProfileDigest(profile) {
  return crypto.createHash('sha256').update(canonical(profile)).digest('hex');
}

export function listMailProfiles() {
  return Object.values(PROFILE_RECORDS).map((profile) => ({ ...profile, policySha256: mailProfileDigest(profile) }));
}

export function getMailProfile(id) {
  const profile = PROFILE_RECORDS[clean(id).toLowerCase()];
  if (!profile) throw new Error(`Unsupported --mail-profile: ${clean(id).toLowerCase() || '(empty)'}`);
  return { ...profile, policySha256: mailProfileDigest(profile) };
}

export function resolveMailProfile(args = {}, { requireExplicitHelloProfile = false } = {}) {
  const supplied = clean(args['mail-profile']).toLowerCase();
  const requestedAccountOnly = args.account === undefined ? '' : clean(args.account).toLowerCase();
  if (!supplied && requestedAccountOnly && requestedAccountOnly !== NOAH_ACCOUNT) {
    if (requestedAccountOnly === HELLO_ACCOUNT && requireExplicitHelloProfile) {
      throw new Error(`The ${HELLO_ACCOUNT} Gmail account requires an explicit approved --mail-profile.`);
    }
    const requestedFrom = args['from-email'] === undefined ? requestedAccountOnly : clean(args['from-email']).toLowerCase();
    if (requestedFrom !== requestedAccountOnly) throw new Error('A distinct --from-email requires an approved --mail-profile.');
    return {
      id: 'legacy-plain-account',
      version: '1.0.0',
      account: requestedAccountOnly,
      fromEmail: requestedFrom,
      fromName: clean(args['from-name'] || 'Noah Glynn'),
      fromNameOverrideAllowed: true,
      systemNoteKind: 'none',
      signatureKey: 'none',
      signatureRequired: false,
      defaultBcc: DEFAULT_AGENT_BCC,
      replyEnabled: false,
      policySha256: '',
    };
  }
  const profile = getMailProfile(supplied || DEFAULT_MAIL_PROFILE);
  const requestedAccount = args.account === undefined ? profile.account : clean(args.account).toLowerCase();
  const requestedFrom = args['from-email'] === undefined ? profile.fromEmail : clean(args['from-email']).toLowerCase();
  const requestedName = args['from-name'] === undefined ? profile.fromName : clean(args['from-name']);
  if (requestedAccount !== profile.account) throw new Error(`The ${profile.id} profile must use ${profile.account} as its Gmail account.`);
  if (requestedFrom !== profile.fromEmail) throw new Error(`The ${profile.id} profile must send from ${profile.fromEmail}.`);
  if (!profile.fromNameOverrideAllowed && requestedName !== profile.fromName) throw new Error(`The ${profile.id} profile must use ${profile.fromName} as its display name.`);
  return { ...profile, fromName: requestedName };
}

export function inferLegacyMailProfile({ account, fromEmail, systemNote }) {
  const normalizedAccount = clean(account).toLowerCase();
  const normalizedFrom = clean(fromEmail).toLowerCase();
  if (normalizedAccount === NOAH_ACCOUNT && normalizedFrom === NOAH_ACCOUNT && systemNote === 'quiet-editorial') return getMailProfile(DEFAULT_MAIL_PROFILE);
  if (normalizedAccount === HELLO_ACCOUNT && normalizedFrom === KAMP_FROM_ADDRESS && systemNote === 'kamp-automated') return getMailProfile(KAMP_MAIL_PROFILE);
  if (systemNote === 'none' && normalizedAccount === normalizedFrom && normalizedAccount && normalizedAccount !== NOAH_ACCOUNT) {
    return {
      id: 'legacy-plain-account',
      version: '1.0.0',
      account: normalizedAccount,
      fromEmail: normalizedFrom,
      fromName: '',
      fromNameOverrideAllowed: true,
      systemNoteKind: 'none',
      signatureKey: 'none',
      signatureRequired: false,
      defaultBcc: DEFAULT_AGENT_BCC,
      replyEnabled: false,
      policySha256: '',
    };
  }
  throw new Error('Reviewed MIME does not match an approved or legacy sender profile.');
}
