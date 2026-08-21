#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

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

const pagePath = path.resolve(process.argv[2] || 'piop/wiki/index.html');
const dataPath = path.resolve(process.argv[3] || 'scripts/data/piop-skills.json');
const page = fs.readFileSync(pagePath, 'utf8');
const directory = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
if (directory.skills.length !== 152) fail('public directory count mismatch');
requireText(page, '<meta name="robots" content="noindex, nofollow, noarchive">', 'noindex boundary');
requireText(page, '<b>152 skills</b>', 'public directory total');
requireText(page, 'Directory listing only.', 'directory authority boundary');
requireText(page, 'Graph-driven skill selection', 'graph model');

for (const entry of directory.skills) {
  requireText(page, `id="skill-${entry.id}"`, `skill entry ${entry.id}`);
  requireText(page, `<code>${entry.id}</code>`, `skill id ${entry.id}`);
  requireText(page, escapeHtml(entry.display_name), `display name ${entry.id}`);
  requireText(page, escapeHtml(entry.description), `description ${entry.id}`);
  if (entry.status === 'under-review') requireText(page.slice(page.indexOf(`id="skill-${entry.id}"`)), 'under review', `review label ${entry.id}`);
}
const skillEntries = [...page.matchAll(/class="skill-directory-entry"/g)].length;
if (skillEntries !== directory.skills.length) fail(`rendered skill count mismatch: ${skillEntries}`);
const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) fail(`duplicate HTML ids: ${[...new Set(duplicates)].join(', ')}`);
for (const value of ['git:github.com/', 'https://github.com/youlikemodernart/', '/Users/', 'Noah', 'Ezra Arthur', 'WAWCO']) {
  forbidText(page, value, 'wiki exposes private source or identity marker');
}
console.log(`PASS piop_wiki_check skills=${directory.skills.length} categories=${directory.categories.length} under_review=${directory.skills.filter((entry) => entry.status === 'under-review').length} ids=${ids.length}`);
