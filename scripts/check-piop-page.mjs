#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { publicPrivateDataBoundary, readAuthoritativeCatalog } from './piop-catalog-authority.mjs';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || !value) fail('usage: node scripts/check-piop-page.mjs --catalog skills.json [--page piop/index.html] [--script js/piop.js] [--css css/piop.css]');
    args[key] = value;
  }
  return args;
}

function requireText(source, value, label) {
  if (!source.includes(String(value))) fail(`missing ${label}: ${value}`);
}

function forbidText(source, value, label) {
  if (source.includes(String(value))) fail(`${label}: ${value}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function packageBlock(page, id) {
  const marker = `<article class="skill-package" id="skill-${id}">`;
  const start = page.indexOf(marker);
  if (start === -1) fail(`missing package article: ${id}`);
  const end = page.indexOf('</article>', start);
  if (end === -1) fail(`unterminated package article: ${id}`);
  return page.slice(start, end + '</article>'.length);
}

const args = parseArgs(process.argv.slice(2));
if (!args.catalog) fail('a catalog is required');
const pagePath = path.resolve(args.page || 'piop/index.html');
const scriptPath = path.resolve(args.script || 'js/piop.js');
const cssPath = path.resolve(args.css || 'css/piop.css');
let catalog;
try {
  ({ catalog } = readAuthoritativeCatalog(args.catalog));
} catch (error) {
  fail(error.message);
}
const page = fs.readFileSync(pagePath, 'utf8');
const script = fs.readFileSync(scriptPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const publicSources = [page, script, css];
const packages = catalog.packages.filter((entry) => entry.status === 'verified-private');
if (!packages.length) fail('catalog has no verified private releases');

let skillCount = 0;
for (const entry of packages) {
  const block = packageBlock(page, entry.id);
  requireText(block, escapeHtml(entry.name), `package name ${entry.id}`);
  requireText(block, escapeHtml(entry.description), `package description ${entry.id}`);
  requireText(block, `v${escapeHtml(entry.version)}`, `package version ${entry.id}`);
  requireText(block, escapeHtml(entry.external_access), `external-access boundary ${entry.id}`);
  requireText(block, escapeHtml(entry.credentials), `credential boundary ${entry.id}`);
  requireText(block, escapeHtml(publicPrivateDataBoundary(entry.private_data)), `package/private-data boundary ${entry.id}`);
  requireText(block, `data-skill-id="${entry.id}"`, `selection control ${entry.id}`);
  requireText(block, 'hidden aria-pressed="false"', `progressive-enhancement state ${entry.id}`);
  for (const source of publicSources) {
    forbidText(source, entry.repo, `public source exposes private repository ${entry.id}`);
    forbidText(source, entry.install, `public source exposes direct install command ${entry.id}`);
    forbidText(source, entry.release_archive_sha256, `public source exposes release digest ${entry.id}`);
  }
  for (const skill of entry.resources.skills) {
    skillCount += 1;
    requireText(block, escapeHtml(entry.skill_descriptions[skill]), `skill description ${entry.id}/${skill}`);
  }
}

for (const entry of catalog.packages.filter((item) => item.status !== 'verified-private')) {
  forbidText(page, `id="skill-${entry.id}"`, `page includes non-released package ${entry.id}`);
}

requireText(page, `${packages.length} PACKAGES / ${skillCount} SKILLS`, 'catalog totals');
requireText(page, 'Private GitHub is the source authority.', 'source-authority boundary');
requireText(page, 'recipient-specific ZIP', 'recipient-specific fulfillment boundary');
requireText(page, 'private Google Drive', 'private delivery boundary');
requireText(page, 'A GitHub account is not required', 'recipient GitHub boundary');
requireText(page, 'Payment does not change fulfillment priority, package access, or repository permissions.', 'payment boundary');
requireText(page, 'id="install-list-summary" hidden', 'progressive-enhancement summary state');
requireText(page, 'The selection tool requires JavaScript.', 'no-script fallback');
requireText(page, 'id="email-skill-request"', 'email request action');
requireText(script, 'PiOp skill set request', 'request output');
requireText(script, 'recipient-specific verified ZIP', 'request delivery model');

const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) fail(`duplicate HTML ids: ${[...new Set(duplicateIds)].join(', ')}`);

const formActions = [...page.matchAll(/<form\b[^>]*\baction="([^"]+)"/g)].map((match) => match[1]);
if (formActions.length !== 0) fail(`unexpected form actions: ${formActions.join(', ')}`);
if (/\b(?:fetch\s*\(|XMLHttpRequest\b|sendBeacon\s*\()/.test(script)) {
  fail('public script contains a direct network-send primitive');
}

const forbidden = [
  '/private/piop-recipient-directory',
  'invitees.json',
  'newsletter_eligible',
  'approval_token',
  'STRIPE_SECRET_KEY',
  'git:github.com/',
  'https://github.com/youlikemodernart/',
  'data-copy-command',
  'Copy install command',
  'Check GitHub invitations',
];
for (const value of forbidden) {
  for (const source of publicSources) forbidText(source, value, 'public source contains forbidden source or private marker');
}

console.log(`PASS piop_page_check packages=${packages.length} skills=${skillCount} ids=${ids.length} fulfillment=private-drive authority=sha256-locked`);
