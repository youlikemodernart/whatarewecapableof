import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_WAWCO_PROFILE_PATH,
  loadOrganizationEmailProfile,
  validateOrganizationEmailProfile,
} from './email-expression-profile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function clone(value) { return JSON.parse(JSON.stringify(value)); }

const accepted = loadOrganizationEmailProfile(DEFAULT_WAWCO_PROFILE_PATH);

test('accepted WAWCO profile validates with a stable digest after representative-message review', () => {
  const second = loadOrganizationEmailProfile(DEFAULT_WAWCO_PROFILE_PATH);
  assert.equal(accepted.profileId, 'wawco.email.house');
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.profileSha256, second.profileSha256);
  assert.match(accepted.profileSha256, /^[a-f0-9]{64}$/);
  assert.equal(accepted.profileVersion, '1.2.0');
  assert.ok(accepted.profile.voice.posture.includes('Translate internal system state into recipient-facing language.'));
  assert.ok(accepted.profile.voice.structure.includes('Prefer a natural update over a taxonomy of statuses.'));
  assert.ok(accepted.profile.antiRules.includes('Do not expose the full semantic structure of the work merely because the system can articulate it.'));
});

test('provisional profiles validate without binding a sibling organization profile', () => {
  const candidate = clone(accepted.profile);
  candidate.profileId = 'example.email.provisional';
  candidate.status = 'provisional';
  candidate.visual.surfaceId = 'example.email.surface';
  candidate.voice.unknowns = ['signoff'];
  candidate.antiRules = ['Do not reuse another organization profile.'];
  const result = validateOrganizationEmailProfile(candidate);
  assert.equal(result.profileId, 'example.email.provisional');
  assert.equal(result.status, 'provisional');
  assert.deepEqual(result.profile.voice.unknowns, ['signoff']);
});

test('unknown keys fail closed', () => {
  const candidate = clone(accepted.profile);
  candidate.visual.arbitraryCss = 'body { color: red; }';
  assert.throws(() => validateOrganizationEmailProfile(candidate), /missing or unknown fields/);
});

test('accepted profiles require review evidence', () => {
  const candidate = clone(accepted.profile);
  candidate.status = 'accepted';
  candidate.evidence.reviewedBy = null;
  assert.throws(() => validateOrganizationEmailProfile(candidate), /require reviewedBy/);
});

test('disabled components require zero maxCount', () => {
  const candidate = clone(accepted.profile);
  candidate.components.highlights = { enabled: false, maxCount: 20 };
  assert.throws(() => validateOrganizationEmailProfile(candidate), /must be zero when disabled/);
});

test('private bindings reject unrecognized authority slots', () => {
  const candidate = clone(accepted.profile);
  candidate.privateBindingSlots.push('oauth-token');
  assert.throws(() => validateOrganizationEmailProfile(candidate), /Unsupported private binding slot/);
});

test('profile files cannot be symlinks', () => {
  const directory = fs.mkdtempSync('/tmp/email-expression-profile-');
  const link = path.join(directory, 'profile.json');
  fs.symlinkSync(DEFAULT_WAWCO_PROFILE_PATH, link);
  assert.throws(() => loadOrganizationEmailProfile(link), /ELOOP|symbolic link/i);
  fs.rmSync(directory, { recursive: true, force: true });
});
