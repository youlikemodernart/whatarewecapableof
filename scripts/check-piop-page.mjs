#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || !value) fail('usage: node scripts/check-piop-page.mjs --catalog skills.json [--page piop/index.html]');
    args[key] = value;
  }
  return args;
}

function requireText(page, value, label) {
  if (!page.includes(String(value))) fail(`page missing ${label}: ${value}`);
}

const args = parseArgs(process.argv.slice(2));
if (!args.catalog) fail('a catalog is required');
const pagePath = path.resolve(args.page || 'piop/index.html');
const catalog = JSON.parse(fs.readFileSync(path.resolve(args.catalog), 'utf8'));
const page = fs.readFileSync(pagePath, 'utf8');

let skillCount = 0;
for (const entry of catalog.packages) {
  requireText(page, `id="skill-${entry.id}"`, `package id ${entry.id}`);
  requireText(page, entry.name, `package name ${entry.id}`);
  requireText(page, entry.description, `package description ${entry.id}`);
  requireText(page, `v${entry.version}`, `package version ${entry.id}`);
  requireText(page, entry.repo, `package repository ${entry.id}`);
  requireText(page, entry.install.replaceAll('&', '&amp;').replaceAll('"', '&quot;'), `install command ${entry.id}`);
  for (const skill of entry.resources.skills) {
    skillCount += 1;
    requireText(page, entry.skill_descriptions[skill], `skill description ${entry.id}/${skill}`);
  }
}
requireText(page, `${catalog.packages.length} PACKAGES / ${skillCount} SKILLS`, 'catalog totals');

const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) fail(`duplicate HTML ids: ${[...new Set(duplicateIds)].join(', ')}`);

const requiredBoundaries = [
  'the source repositories are private',
  'Payment does not grant access or change repository permissions.',
  'action="https://fin.whatarewecapableof.com/api/piop/checkout"',
  'Monthly support continues until you cancel.',
];
for (const boundary of requiredBoundaries) requireText(page, boundary, 'public boundary statement');

const forbidden = ['/private/piop-recipient-directory', 'invitees.json', 'newsletter_eligible', 'approval_token', 'STRIPE_SECRET_KEY'];
for (const value of forbidden) if (page.includes(value)) fail(`public page contains forbidden private marker: ${value}`);

console.log(`PASS piop_page_check packages=${catalog.packages.length} skills=${skillCount} ids=${ids.length}`);
