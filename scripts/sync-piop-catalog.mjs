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
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'check') {
      args.check = true;
      continue;
    }
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

function title(value) {
  return String(value)
    .split('-')
    .map((part) => part === 'arena' ? 'Are.na' : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function scopeLabel(scope) {
  return {
    global: 'Global',
    'project-local': 'Project local',
    'global-or-project-local': 'Global or project local',
  }[scope] || scope;
}

function validateRelease(entry) {
  const required = [
    'id',
    'name',
    'description',
    'version',
    'risk_tier',
    'recommended_scope',
    'status',
    'source',
    'repo',
    'install',
    'release_archive_sha256',
    'resources',
    'skill_descriptions',
    'external_access',
    'credentials',
    'private_data',
  ];
  for (const key of required) {
    if (entry[key] === undefined) fail(`package ${entry.id || '(unknown)'} missing ${key}`);
  }
  if (entry.status !== 'verified-private') fail(`package ${entry.id} is not a verified private release`);
  if (!entry.repo.startsWith('https://github.com/youlikemodernart/')) fail(`unexpected repository owner for ${entry.id}`);
  if (!entry.source.startsWith('git:github.com/youlikemodernart/')) fail(`unexpected package source for ${entry.id}`);
  if (!entry.source.endsWith(`@v${entry.version}`)) fail(`unpinned or mismatched source for ${entry.id}`);
  if (!entry.install.includes(`@v${entry.version}`)) fail(`unpinned or mismatched install command for ${entry.id}`);
  if (!/^[a-f0-9]{64}$/.test(entry.release_archive_sha256)) fail(`invalid release archive digest for ${entry.id}`);
  if (!Array.isArray(entry.resources?.skills) || !entry.resources.skills.length) fail(`package ${entry.id} has no skills`);
}

function renderBoundary(label, value) {
  return `                  <dt>${escapeHtml(label)}</dt>
                  <dd>${escapeHtml(value)}</dd>`;
}

function renderPackage(entry) {
  const methods = entry.resources.skills.map((skill) => {
    const description = entry.skill_descriptions[skill];
    if (!description) fail(`missing description for ${entry.id}/${skill}`);
    return `                <li><span class="skill-method-name">${escapeHtml(title(skill))}.</span> ${escapeHtml(description)}</li>`;
  }).join('\n');
  const scope = scopeLabel(entry.recommended_scope);
  return `          <article class="skill-package" id="skill-${escapeHtml(entry.id)}">
            <div class="skill-heading">
              <h3>${escapeHtml(entry.name)}</h3>
              <p class="skill-meta">v${escapeHtml(entry.version)} / ${escapeHtml(entry.risk_tier)} / ${escapeHtml(scope)}</p>
            </div>
            <p>${escapeHtml(entry.description)}</p>
            <details>
              <summary class="skill-summary">Review methods and boundaries</summary>
              <div class="skill-details">
                <h4 class="skill-detail-heading">Included methods</h4>
                <ul class="skill-methods">
${methods}
                </ul>
                <h4 class="skill-detail-heading">Declared boundaries</h4>
                <dl class="skill-boundaries">
${renderBoundary('External access', entry.external_access)}
${renderBoundary('Credentials', entry.credentials)}
${renderBoundary('Package and private data', publicPrivateDataBoundary(entry.private_data))}
                </dl>
              </div>
            </details>
            <button class="skill-install-toggle" type="button" hidden aria-pressed="false" data-skill-id="${escapeHtml(entry.id)}" data-skill-name="${escapeHtml(entry.name)}" data-skill-version="v${escapeHtml(entry.version)}" data-skill-scope="${escapeHtml(scope)}" data-skill-risk="${escapeHtml(entry.risk_tier)}">Include in skill set</button>
          </article>`;
}

const args = parseArgs(process.argv.slice(2));
if (!args.catalog) fail('usage: node scripts/sync-piop-catalog.mjs --catalog /path/to/skills.json [--page piop/index.html]');
const pagePath = path.resolve(args.page || 'piop/index.html');
if (!fs.existsSync(pagePath)) fail(`page missing: ${pagePath}`);

let catalog;
try {
  ({ catalog } = readAuthoritativeCatalog(args.catalog));
} catch (error) {
  fail(error.message);
}
if (!Array.isArray(catalog.packages) || !catalog.packages.length) fail('catalog packages are missing');
const packages = catalog.packages.filter((entry) => entry.status === 'verified-private');
if (!packages.length) fail('catalog has no verified private releases');
for (const entry of packages) validateRelease(entry);
const packageIds = packages.map((entry) => entry.id);
if (new Set(packageIds).size !== packageIds.length) fail('catalog has duplicate verified package ids');

const start = '<!-- PIOP_SKILLS_START -->';
const end = '<!-- PIOP_SKILLS_END -->';
const originalPage = fs.readFileSync(pagePath, 'utf8');
let page = originalPage;
const first = page.indexOf(start);
const last = page.indexOf(end);
if (first === -1 || last === -1 || last <= first) fail('PiOp catalog markers are missing or reversed');
const rendered = packages.map(renderPackage).join('\n\n');
page = `${page.slice(0, first + start.length)}\n${rendered}\n          ${page.slice(last)}`;
const skillCount = packages.reduce((total, entry) => total + entry.resources.skills.length, 0);
page = page.replace(/<p class="piop-meta">\d+ PACKAGES \/ \d+ SKILLS<\/p>/, `<p class="piop-meta">${packages.length} PACKAGES / ${skillCount} SKILLS</p>`);
if (args.check) {
  if (page !== originalPage) fail('PiOp page is out of sync with the supplied catalog');
  console.log(`PASS piop_catalog_check packages=${packages.length} skills=${skillCount} catalog_version=${catalog.catalog_version}`);
} else {
  fs.writeFileSync(pagePath, page);
  console.log(`PASS piop_catalog_sync packages=${packages.length} skills=${skillCount} catalog_version=${catalog.catalog_version}`);
}
