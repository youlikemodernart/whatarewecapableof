#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--check') {
      args.check = true;
      continue;
    }
    if (!token?.startsWith('--')) fail(`unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slug(value) {
  return String(value).toLowerCase().replaceAll('&', 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const args = parseArgs(process.argv.slice(2));
const dataPath = path.resolve(args.data || 'scripts/data/piop-skills.json');
const pagePath = path.resolve(args.page || 'piop/index.html');
if (!fs.existsSync(dataPath)) fail(`directory data missing: ${dataPath}`);
if (!fs.existsSync(pagePath)) fail(`wiki page missing: ${pagePath}`);

const directory = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const allowedStatuses = new Set(['listed', 'under-review']);
if (directory.schema_version !== 1 || directory.kind !== 'PiOpPublicSkillDirectory') fail('directory identity mismatch');
if (!Array.isArray(directory.categories) || directory.categories.length !== 12 || new Set(directory.categories).size !== 12) fail('category set mismatch');
if (!Array.isArray(directory.skills) || directory.skills.length !== 152) fail('directory must contain exactly 152 skills');
if (directory.source_snapshot?.public_directory_rows !== 152 || directory.source_snapshot?.graph_nodes !== 174) fail('source snapshot count mismatch');
if (!/^[a-f0-9]{64}$/.test(directory.source_snapshot?.graph_sha256 || '')) fail('source graph digest is invalid');

const seen = new Set();
for (const entry of directory.skills) {
  if (!entry || Object.keys(entry).sort().join(',') !== 'category,description,display_name,id,status') fail('skill record keys mismatch');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id)) fail(`invalid skill id: ${entry.id}`);
  if (seen.has(entry.id)) fail(`duplicate skill id: ${entry.id}`);
  seen.add(entry.id);
  if (!entry.display_name || !entry.description) fail(`missing public copy: ${entry.id}`);
  if (!directory.categories.includes(entry.category)) fail(`unknown category for ${entry.id}`);
  if (!allowedStatuses.has(entry.status)) fail(`unknown status for ${entry.id}`);
  if (entry.description.includes('—') || entry.description.includes('--')) fail(`prohibited dash in ${entry.id}`);
}
const sortedIds = [...seen].sort();
if (directory.skills.map((entry) => entry.id).join('\n') !== sortedIds.join('\n')) fail('skills must be ordered by id');

const grouped = new Map(directory.categories.map((category) => [category, []]));
for (const entry of directory.skills) grouped.get(entry.category).push(entry);
const categoryLinks = directory.categories.map((category) => {
  const count = grouped.get(category).length;
  return `        <li><a href="#skills-${slug(category)}">${escapeHtml(category)}</a> <span class="directory-count">${count}</span></li>`;
}).join('\n');
const categorySections = directory.categories.map((category) => {
  const entries = grouped.get(category).map((entry) => {
    const status = entry.status === 'under-review' ? ' <span class="directory-status">under review</span>' : '';
    return `        <div class="skill-directory-entry" id="skill-${escapeHtml(entry.id)}">
          <dt>${escapeHtml(entry.display_name)} <code>${escapeHtml(entry.id)}</code>${status}</dt>
          <dd>${escapeHtml(entry.description)}</dd>
        </div>`;
  }).join('\n');
  return `    <section class="skill-directory-group" aria-labelledby="skills-${slug(category)}">
      <h3 id="skills-${slug(category)}">${escapeHtml(category)} <span class="directory-count">${grouped.get(category).length}</span></h3>
      <dl class="skill-directory-list">
${entries}
      </dl>
    </section>`;
}).join('\n\n');
const rendered = `    <div class="skill-directory-summary">
      <p><b>152 skills</b> from the current public-safe graph projection, grouped by working domain. Directory listing only. Descriptions explain what each method supports; they do not claim installation, availability, readiness, or action authority.</p>
      <ul class="skill-directory-categories">
${categoryLinks}
      </ul>
    </div>

${categorySections}`;

const start = '<!-- PIOP_SKILL_DIRECTORY_START -->';
const end = '<!-- PIOP_SKILL_DIRECTORY_END -->';
const original = fs.readFileSync(pagePath, 'utf8');
const first = original.indexOf(start);
const last = original.indexOf(end);
if (first === -1 || last === -1 || last <= first) fail('skill directory markers are missing or reversed');
const page = `${original.slice(0, first + start.length)}\n${rendered}\n    ${original.slice(last)}`;
if (args.check) {
  if (page !== original) fail('PiOp wiki skill directory is out of sync');
  console.log(`PASS piop_skill_directory_check skills=${directory.skills.length} categories=${directory.categories.length} under_review=${directory.skills.filter((entry) => entry.status === 'under-review').length}`);
} else {
  fs.writeFileSync(pagePath, page);
  console.log(`PASS piop_skill_directory_sync skills=${directory.skills.length} categories=${directory.categories.length}`);
}
