#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
export const DEFAULT_WAWCO_PROFILE_PATH = path.join(ROOT_DIR, 'email-expression', 'profiles', 'wawco', 'profile.json');
const PROFILE_KEYS = ['schemaVersion', 'profileId', 'profileVersion', 'status', 'organization', 'scope', 'visual', 'components', 'voice', 'antiRules', 'privateBindingSlots', 'evidence'];
const VISUAL_KEYS = ['surfaceId', 'measurePx', 'bodyFont', 'monoFont', 'bodySizePx', 'bodyLineHeightPx', 'colors'];
const COLOR_KEYS = ['text', 'mutedText', 'link', 'rule', 'surfaceMuted', 'highlight', 'highlightText'];
const COMPONENT_KEYS = ['headings', 'lists', 'blockquote', 'code', 'smallTables', 'inlineFigures', 'highlights'];
const VOICE_KEYS = ['posture', 'tone', 'rhythm', 'diction', 'structure', 'greeting', 'signoff', 'cta', 'avoid', 'unknowns'];
const EVIDENCE_KEYS = ['reviewedBy', 'reviewedAt', 'sourcePointers', 'knownGaps'];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requireClosedObject(value, keys, label, { optional = [] } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value);
  const allowed = new Set([...keys, ...optional]);
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  const unknown = actual.filter((key) => !allowed.has(key));
  if (missing.length || unknown.length) {
    throw new Error(`${label} has missing or unknown fields. Required: ${keys.join(', ')}; optional: ${optional.join(', ') || '(none)'}.`);
  }
}

function requireStringArray(value, label, { nonempty = false } = {}) {
  if (!Array.isArray(value) || (nonempty && !value.length) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must be ${nonempty ? 'a nonempty' : 'an'} array of nonempty strings.`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates.`);
}

function requireNullableString(value, label) {
  if (value !== null && typeof value !== 'string') throw new Error(`${label} must be a string or null.`);
}

function requireComponentLimit(value, label) {
  requireClosedObject(value, ['enabled', 'maxCount'], label);
  if (typeof value.enabled !== 'boolean') throw new Error(`${label}.enabled must be boolean.`);
  if (!Number.isInteger(value.maxCount) || value.maxCount < 0 || value.maxCount > 20) throw new Error(`${label}.maxCount must be an integer from 0 to 20.`);
  if (!value.enabled && value.maxCount !== 0) throw new Error(`${label}.maxCount must be zero when disabled.`);
}

function requireIntegerRange(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
}

function validateTextRole(value, label) {
  requireClosedObject(value, ['sizePx', 'lineHeightPx', 'weight'], label);
  requireIntegerRange(value.sizePx, `${label}.sizePx`, 10, 40);
  requireIntegerRange(value.lineHeightPx, `${label}.lineHeightPx`, 12, 48);
  if (![400, 500, 600, 700].includes(value.weight)) throw new Error(`${label}.weight is unsupported.`);
}

function validateRenderingProfile(value) {
  requireClosedObject(value, ['typography', 'spacing', 'rules', 'figures', 'highlightPalettes'], 'Profile visual.rendering');
  const typeKeys = ['h1', 'h2', 'h3', 'inlineCode', 'codeBlock', 'table', 'tableHeader', 'caption'];
  requireClosedObject(value.typography, typeKeys, 'Profile visual.rendering.typography');
  for (const key of typeKeys) validateTextRole(value.typography[key], `Profile visual.rendering.typography.${key}`);
  const spacingKeys = ['paragraphAfterPx', 'h1AfterPx', 'h2BeforePx', 'h2AfterPx', 'h3BeforePx', 'h3AfterPx', 'listAfterPx', 'blockquoteAfterPx', 'ruleVerticalPx', 'tableAfterPx', 'figureBeforePx', 'figureAfterPx', 'captionBeforePx'];
  requireClosedObject(value.spacing, spacingKeys, 'Profile visual.rendering.spacing');
  for (const key of spacingKeys) requireIntegerRange(value.spacing[key], `Profile visual.rendering.spacing.${key}`, 0, 64);
  requireClosedObject(value.rules, ['strongRule', 'quoteRule', 'quoteWidthPx', 'codeRadiusPx', 'inlineCodeRadiusPx'], 'Profile visual.rendering.rules');
  for (const key of ['strongRule', 'quoteRule']) if (!/^#[0-9a-f]{6}$/i.test(value.rules[key])) throw new Error(`Profile visual.rendering.rules.${key} must be six-digit hex.`);
  requireIntegerRange(value.rules.quoteWidthPx, 'Profile visual.rendering.rules.quoteWidthPx', 1, 8);
  requireIntegerRange(value.rules.codeRadiusPx, 'Profile visual.rendering.rules.codeRadiusPx', 0, 16);
  requireIntegerRange(value.rules.inlineCodeRadiusPx, 'Profile visual.rendering.rules.inlineCodeRadiusPx', 0, 16);
  const figureKeys = ['landscapeMaxPx', 'squareMaxPx', 'portraitMaxPx', 'tallMaxPx'];
  requireClosedObject(value.figures, figureKeys, 'Profile visual.rendering.figures');
  for (const key of figureKeys) requireIntegerRange(value.figures[key], `Profile visual.rendering.figures.${key}`, 120, 680);
  requireClosedObject(value.highlightPalettes, ['default', 'hotPink'], 'Profile visual.rendering.highlightPalettes');
  for (const key of ['default', 'hotPink']) if (!/^#[0-9a-f]{6}$/i.test(value.highlightPalettes[key])) throw new Error(`Profile visual.rendering.highlightPalettes.${key} must be six-digit hex.`);
}

export function validateOrganizationEmailProfile(profile) {
  requireClosedObject(profile, PROFILE_KEYS, 'Profile');
  if (profile.schemaVersion !== '1.0') throw new Error('Profile schemaVersion must be 1.0.');
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(profile.profileId)) throw new Error('Profile profileId is invalid.');
  if (!/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(profile.profileVersion)) throw new Error('Profile profileVersion must be SemVer.');
  if (!['provisional', 'testing', 'accepted', 'deprecated'].includes(profile.status)) throw new Error('Profile status is unsupported.');
  if (typeof profile.organization !== 'string' || !profile.organization.trim()) throw new Error('Profile organization is required.');
  requireStringArray(profile.scope, 'Profile scope', { nonempty: true });

  requireClosedObject(profile.visual, VISUAL_KEYS, 'Profile visual', { optional: ['rendering'] });
  if (!/^[a-z0-9.-]+$/.test(profile.visual.surfaceId)) throw new Error('Profile visual.surfaceId is invalid.');
  if (!Number.isInteger(profile.visual.measurePx) || profile.visual.measurePx < 320 || profile.visual.measurePx > 680) throw new Error('Profile visual.measurePx must be 320 to 680.');
  if (!['system-sans', 'georgia-serif'].includes(profile.visual.bodyFont)) throw new Error('Profile visual.bodyFont is unsupported.');
  if (profile.visual.monoFont !== 'system-mono') throw new Error('Profile visual.monoFont must be system-mono.');
  if (!Number.isInteger(profile.visual.bodySizePx) || profile.visual.bodySizePx < 14 || profile.visual.bodySizePx > 20) throw new Error('Profile visual.bodySizePx must be 14 to 20.');
  if (!Number.isInteger(profile.visual.bodyLineHeightPx) || profile.visual.bodyLineHeightPx < 18 || profile.visual.bodyLineHeightPx > 32) throw new Error('Profile visual.bodyLineHeightPx must be 18 to 32.');
  requireClosedObject(profile.visual.colors, COLOR_KEYS, 'Profile visual.colors');
  for (const [role, value] of Object.entries(profile.visual.colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Profile color ${role} must be six-digit hex.`);
  }
  if (profile.visual.rendering !== undefined) validateRenderingProfile(profile.visual.rendering);

  requireClosedObject(profile.components, COMPONENT_KEYS, 'Profile components');
  for (const key of ['headings', 'lists', 'blockquote', 'code']) {
    if (typeof profile.components[key] !== 'boolean') throw new Error(`Profile components.${key} must be boolean.`);
  }
  for (const key of ['smallTables', 'inlineFigures', 'highlights']) requireComponentLimit(profile.components[key], `Profile components.${key}`);

  requireClosedObject(profile.voice, VOICE_KEYS, 'Profile voice');
  for (const key of ['posture', 'tone', 'rhythm', 'diction', 'structure', 'avoid', 'unknowns']) {
    requireStringArray(profile.voice[key], `Profile voice.${key}`);
  }
  requireNullableString(profile.voice.greeting, 'Profile voice.greeting');
  requireNullableString(profile.voice.signoff, 'Profile voice.signoff');
  requireNullableString(profile.voice.cta, 'Profile voice.cta');
  requireStringArray(profile.antiRules, 'Profile antiRules');
  requireStringArray(profile.privateBindingSlots, 'Profile privateBindingSlots');
  for (const slot of profile.privateBindingSlots) {
    if (!['sender-policy', 'signature', 'postal-address', 'private-assets'].includes(slot)) throw new Error(`Unsupported private binding slot: ${slot}`);
  }

  requireClosedObject(profile.evidence, EVIDENCE_KEYS, 'Profile evidence');
  requireNullableString(profile.evidence.reviewedBy, 'Profile evidence.reviewedBy');
  requireNullableString(profile.evidence.reviewedAt, 'Profile evidence.reviewedAt');
  if (profile.evidence.reviewedAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(profile.evidence.reviewedAt)) throw new Error('Profile evidence.reviewedAt must be YYYY-MM-DD or null.');
  requireStringArray(profile.evidence.sourcePointers, 'Profile evidence.sourcePointers');
  requireStringArray(profile.evidence.knownGaps, 'Profile evidence.knownGaps');
  if (profile.status === 'accepted' && (!profile.evidence.reviewedBy || !profile.evidence.reviewedAt)) throw new Error('Accepted profiles require reviewedBy and reviewedAt.');

  const canonical = canonicalJson(profile);
  return {
    profile,
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    status: profile.status,
    profileSha256: crypto.createHash('sha256').update(canonical).digest('hex'),
    canonicalBytes: Buffer.byteLength(canonical),
  };
}

export function loadOrganizationEmailProfile(profilePath = DEFAULT_WAWCO_PROFILE_PATH) {
  const exactPath = path.resolve(String(profilePath));
  const descriptor = fs.openSync(exactPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error(`Email profile must be a direct regular file: ${exactPath}`);
    if (stat.size > 128 * 1024) throw new Error(`Email profile exceeds 131072 bytes: ${exactPath}`);
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (!read) throw new Error(`Email profile became unreadable while reading: ${exactPath}`);
      offset += read;
    }
    let parsed;
    try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw new Error(`Email profile is not valid JSON: ${exactPath}`); }
    return { ...validateOrganizationEmailProfile(parsed), path: exactPath };
  } finally {
    fs.closeSync(descriptor);
  }
}

function printHelp() {
  console.log(`Organization email profile validator.\n\nUsage:\n  node scripts/email-expression-profile.mjs validate [profile.json]\n  node scripts/email-expression-profile.mjs show [profile.json]\n\nDefaults to: ${DEFAULT_WAWCO_PROFILE_PATH}`);
}

function main() {
  const [command = 'help', suppliedPath] = process.argv.slice(2);
  if (command === 'help' || command === '--help') return printHelp();
  if (!['validate', 'show'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const result = loadOrganizationEmailProfile(suppliedPath || DEFAULT_WAWCO_PROFILE_PATH);
  const summary = {
    valid: true,
    path: result.path,
    profileId: result.profileId,
    profileVersion: result.profileVersion,
    status: result.status,
    profileSha256: result.profileSha256,
    canonicalBytes: result.canonicalBytes,
  };
  console.log(JSON.stringify(command === 'show' ? { ...summary, profile: result.profile } : summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message || error); process.exit(1); }
}
