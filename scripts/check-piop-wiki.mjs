#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readAuthoritativeProduct } from './piop-product-authority.mjs';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
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

const pagePath = path.resolve(process.argv[2] || 'piop/index.html');
const dataPath = path.resolve(process.argv[3] || 'scripts/data/piop-skills.json');
const productPath = path.resolve(process.argv[4] || 'scripts/data/piop-product.json');
const page = fs.readFileSync(pagePath, 'utf8');
const directory = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
let product;
try {
  ({ product } = readAuthoritativeProduct(productPath));
} catch (error) {
  fail(error.message);
}

if (directory.skills.length !== 152) fail('public directory count mismatch');
requireText(page, '<link rel="canonical" href="https://whatarewecapableof.com/piop/">', 'canonical route');
requireText(page, '<meta name="robots" content="noindex, nofollow, noarchive">', 'noindex boundary');
requireText(page, '<b>152 skills</b>', 'public directory total');
requireText(page, 'Directory listing only.', 'directory authority boundary');
requireText(page, 'Graph-driven skill selection', 'graph model');
requireText(page, 'id="is-terminal"', 'IS Terminal section');
requireText(page, 'IS 0.1.7.15', 'current IS release');
requireText(page, 'Developer ID signed, notarized, stapled, and Gatekeeper verified', 'IS trust statement');
requireText(page, 'It works in an ordinary terminal; IS is recommended rather than required.', 'IS optional-host boundary');
requireText(page, 'This reference does not install IS or establish access.', 'IS install and access boundary');
requireText(page, `PiOp ${product.product_version} stable.`, 'current PiOp release');

for (const entry of directory.skills) {
  requireText(page, `id="skill-${entry.id}"`, `skill entry ${entry.id}`);
  requireText(page, `<code>${entry.id}</code>`, `skill id ${entry.id}`);
  requireText(page, escapeHtml(entry.display_name), `display name ${entry.id}`);
  requireText(page, escapeHtml(entry.description), `description ${entry.id}`);
  if (entry.status === 'under-review') requireText(page.slice(page.indexOf(`id="skill-${entry.id}"`)), 'under review', `review label ${entry.id}`);
}
for (const entry of product.foundation) {
  requireText(page, `${escapeHtml(entry.name)} <span class="inventory-version">v${escapeHtml(entry.version)}</span>`, `Foundation entry ${entry.id}`);
}
for (const entry of product.modules) {
  requireText(page, `id="module-${entry.id}"`, `Module entry ${entry.id}`);
  requireText(page, escapeHtml(entry.purpose), `Module purpose ${entry.id}`);
  requireText(page, escapeHtml(entry.readiness), `Module readiness ${entry.id}`);
}
for (const entry of product.operator_only) forbidText(page, entry.name, `operator-only surface rendered ${entry.id}`);

const skillEntries = [...page.matchAll(/class="skill-directory-entry"/g)].length;
if (skillEntries !== directory.skills.length) fail(`rendered skill count mismatch: ${skillEntries}`);
const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) fail(`duplicate HTML ids: ${[...new Set(duplicates)].join(', ')}`);
for (const value of ['git:github.com/', 'https://github.com/youlikemodernart/', '/Users/', 'Noah', 'Ezra Arthur', 'WAWCO']) {
  forbidText(page, value, 'canonical page exposes private source or identity marker');
}
console.log(`PASS piop_wiki_check canonical=/piop/ piop=${product.product_version} is=0.1.7.15 foundation=${product.foundation.length} modules=${product.modules.length} skills=${directory.skills.length} categories=${directory.categories.length} under_review=${directory.skills.filter((entry) => entry.status === 'under-review').length} ids=${ids.length}`);
