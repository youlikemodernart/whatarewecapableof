#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readAuthoritativeProduct } from './piop-product-authority.mjs';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || !value) fail('usage: node scripts/check-piop-page.mjs --product scripts/data/piop-product.json [--page piop/index.html] [--script js/piop.js] [--css css/piop.css]');
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

const args = parseArgs(process.argv.slice(2));
if (!args.product) fail('a product inventory is required');
const pagePath = path.resolve(args.page || 'piop/index.html');
const scriptPath = path.resolve(args.script || 'js/piop.js');
const cssPath = path.resolve(args.css || 'css/piop.css');
let product;
try {
  ({ product } = readAuthoritativeProduct(args.product));
} catch (error) {
  fail(error.message);
}
const page = fs.readFileSync(pagePath, 'utf8');
const script = fs.readFileSync(scriptPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const publicSources = [page, script, css];

for (const entry of product.foundation) {
  requireText(page, `${escapeHtml(entry.name)} <span class="inventory-version">v${escapeHtml(entry.version)}</span>`, `Foundation entry ${entry.id}`);
  requireText(page, escapeHtml(entry.purpose), `Foundation purpose ${entry.id}`);
  requireText(page, `Adds: ${escapeHtml(entry.adds)}.`, `Foundation resources ${entry.id}`);
}
for (const entry of product.modules) {
  requireText(page, `${escapeHtml(entry.name)} <span class="inventory-version">v${escapeHtml(entry.version)}</span>`, `Module entry ${entry.id}`);
  requireText(page, escapeHtml(entry.purpose), `Module purpose ${entry.id}`);
  requireText(page, `Adds: ${escapeHtml(entry.adds)}.`, `Module resources ${entry.id}`);
  requireText(page, `Ready requires: ${escapeHtml(entry.readiness)}.`, `Module readiness ${entry.id}`);
}
for (const entry of product.operator_only) forbidText(page, entry.name, `operator-only surface rendered ${entry.id}`);

requireText(page, 'GRAPH-DRIVEN / REVIEWED BUNDLES', 'current Skills Library model');
requireText(page, 'PiOp selects skills from its reviewed capability graph according to what a recipient needs.', 'graph selection explanation');
requireText(page, 'It does not install anything, grant account access, select a profile, or authorize an external action.', 'graph authority boundary');
requireText(page, 'recipient-specific ZIP', 'recipient-specific fulfillment boundary');
requireText(page, 'private Google Drive', 'private delivery boundary');
requireText(page, 'A GitHub account is not required', 'recipient GitHub boundary');
requireText(page, 'id="is-terminal"', 'IS Terminal section');
requireText(page, 'IS is the native macOS vehicle for using Pi and PiOp as a persistent working environment.', 'IS relationship statement');
requireText(page, 'IS 0.1.7.14', 'canonical IS release');
requireText(page, 'PiOp Foundation continues to work in an ordinary terminal.', 'ordinary-terminal fallback');
requireText(page, 'Payment does not change fulfillment priority, package access, or repository permissions.', 'payment boundary');
requireText(page, 'action="https://fin.whatarewecapableof.com/api/piop/checkout"', 'checkout action');
requireText(page, 'Monthly support continues until you cancel.', 'monthly support boundary');

const staleInterfaceMarkers = [
  '5 PACKAGES / 7 SKILLS',
  'skill-install-toggle',
  'install-list-summary',
  'install-review',
  'PiOp skill set request',
  'Private GitHub is the source authority.',
  'released Library catalog',
  'verified-private',
];
for (const value of staleInterfaceMarkers) {
  for (const source of [page, script]) forbidText(source, value, 'public interface contains stale catalog marker');
}
const privateSourceMarkers = [
  'git:github.com/',
  'https://github.com/youlikemodernart/',
  'data-copy-command',
  'Copy install command',
  'Check GitHub invitations',
];
for (const value of privateSourceMarkers) {
  for (const source of publicSources) forbidText(source, value, 'public source contains private-source marker');
}

const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) fail(`duplicate HTML ids: ${[...new Set(duplicateIds)].join(', ')}`);

const formActions = [...page.matchAll(/<form\b[^>]*\baction="([^"]+)"/g)].map((match) => match[1]);
if (formActions.length !== 1 || formActions[0] !== 'https://fin.whatarewecapableof.com/api/piop/checkout') {
  fail(`unexpected form actions: ${formActions.join(', ') || '(none)'}`);
}
if (/\b(?:fetch\s*\(|XMLHttpRequest\b|sendBeacon\s*\()/.test(script)) {
  fail('public script contains a direct network-send primitive');
}

console.log(`PASS piop_page_check foundation=${product.foundation.length} modules=${product.modules.length} ids=${ids.length} skills=graph-driven fulfillment=private-drive catalog=retired`);
