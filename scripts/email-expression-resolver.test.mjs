import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadOrganizationEmailProfile } from './email-expression-profile.mjs';
import { resolveEmailPresentation } from './email-expression-resolver.mjs';
import { LEGACY_WAWCO_PRESENTATION, renderMarkdownEmail } from './gmail-draft-markdown.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WAWCO_PROFILE = path.join(ROOT, 'email-expression', 'profiles', 'wawco', 'profile.json');
const COMPREHENSIVE = path.join(ROOT, 'test', 'fixtures', 'organization-email-expression', 'system-email-surface-v1', 'comprehensive-message.md');

function clone(value) { return JSON.parse(JSON.stringify(value)); }

test('accepted WAWCO profile resolves exactly to the legacy presentation contract', () => {
  const validated = loadOrganizationEmailProfile(WAWCO_PROFILE);
  const first = resolveEmailPresentation(validated);
  const second = resolveEmailPresentation(validated);
  assert.deepEqual(first.presentation, LEGACY_WAWCO_PRESENTATION);
  assert.equal(first.record.profileId, 'wawco.email.house');
  assert.equal(first.record.profileVersion, '1.2.0');
  assert.equal(first.record.resolvedPresentationSha256, second.record.resolvedPresentationSha256);
  assert.ok(Object.isFrozen(first.presentation));
});

test('profile-resolved WAWCO HTML and plain text are byte-identical to the legacy path', () => {
  const source = fs.readFileSync(COMPREHENSIVE, 'utf8');
  const { presentation } = resolveEmailPresentation(loadOrganizationEmailProfile(WAWCO_PROFILE));
  const legacy = renderMarkdownEmail(source);
  const profiled = renderMarkdownEmail(source, { presentation });
  assert.equal(profiled.html, legacy.html);
  assert.equal(profiled.plainText, legacy.plainText);
  assert.deepEqual(profiled.markdownStructure, legacy.markdownStructure);
  assert.deepEqual(profiled.formatWarnings, legacy.formatWarnings);
});

test('all existing Markdown fixtures preserve legacy success, failure, and output behavior', () => {
  const fixtureRoot = path.join(ROOT, 'test', 'fixtures', 'organization-email-expression', 'system-email-surface-v1');
  const files = fs.readdirSync(fixtureRoot, { recursive: true })
    .filter((name) => String(name).endsWith('.md'))
    .map((name) => path.join(fixtureRoot, name));
  assert.ok(files.length >= 12);
  const { presentation } = resolveEmailPresentation(loadOrganizationEmailProfile(WAWCO_PROFILE));
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    let legacy;
    let profiled;
    try { legacy = { output: renderMarkdownEmail(source) }; } catch (error) { legacy = { error: error.message }; }
    try { profiled = { output: renderMarkdownEmail(source, { presentation }) }; } catch (error) { profiled = { error: error.message }; }
    assert.deepEqual(profiled, legacy, `fixture parity failed: ${file}`);
  }
});

test('profile-resolved figure output is byte-identical to the legacy path', () => {
  const source = '# Figure check\n\nBody.';
  const figures = [{ cid: 'fixture-1@local', alt: 'Landscape fixture', caption: 'Caption.', width: 1600, height: 900 }];
  const { presentation } = resolveEmailPresentation(loadOrganizationEmailProfile(WAWCO_PROFILE));
  const legacy = renderMarkdownEmail(source, { figures });
  const profiled = renderMarkdownEmail(source, { figures, presentation });
  assert.equal(profiled.html, legacy.html);
  assert.equal(profiled.plainText, legacy.plainText);
});

test('provisional profiles without complete rendering ownership cannot drive the renderer', () => {
  const provisional = clone(loadOrganizationEmailProfile(WAWCO_PROFILE).profile);
  provisional.status = 'provisional';
  delete provisional.visual.rendering;
  assert.throws(() => resolveEmailPresentation(provisional, { allowProvisional: true }), /missing visual\.rendering/);
});

test('profile component limits cannot exceed renderer hard ceilings', () => {
  const candidate = clone(loadOrganizationEmailProfile(WAWCO_PROFILE).profile);
  candidate.components.inlineFigures.maxCount = 3;
  assert.throws(() => resolveEmailPresentation(candidate), /exceeds renderer hard ceiling 2/);
});

test('disabled profile components reject matching Markdown structures', () => {
  const candidate = clone(loadOrganizationEmailProfile(WAWCO_PROFILE).profile);
  candidate.components.blockquote = false;
  const { presentation } = resolveEmailPresentation(candidate);
  assert.throws(() => renderMarkdownEmail('> Quoted text', { presentation }), /does not permit blockquotes/);
});
