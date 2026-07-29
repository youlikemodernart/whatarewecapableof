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

function renderPackage(entry) {
  const methods = entry.resources.skills.map((skill) => {
    const description = entry.skill_descriptions[skill];
    if (!description) fail(`missing description for ${entry.id}/${skill}`);
    return `              <li><span class="skill-method-name">${escapeHtml(title(skill))}.</span> ${escapeHtml(description)}</li>`;
  }).join('\n');
  const statusId = `copy-${entry.id}-status`;
  return `          <article class="skill-package" id="skill-${escapeHtml(entry.id)}">
            <div class="skill-heading">
              <h3>${escapeHtml(entry.name)}</h3>
              <p class="skill-meta">v${escapeHtml(entry.version)} / ${escapeHtml(entry.risk_tier)} / ${escapeHtml(scopeLabel(entry.recommended_scope))}</p>
            </div>
            <p>${escapeHtml(entry.description)}</p>
            <ul class="skill-methods">
${methods}
            </ul>
            <code class="install-command">${escapeHtml(entry.install)}</code>
            <div class="skill-actions">
              <a href="${escapeHtml(entry.repo)}">View private repository</a>
              <button type="button" data-copy-command="${escapeHtml(entry.install)}" aria-describedby="${statusId}">Copy install command</button>
              <span class="copy-status" id="${statusId}" aria-live="polite"></span>
            </div>
          </article>`;
}

const args = parseArgs(process.argv.slice(2));
if (!args.catalog) fail('usage: node scripts/sync-piop-catalog.mjs --catalog /path/to/skills.json [--page piop/index.html]');
const catalogPath = path.resolve(args.catalog);
const pagePath = path.resolve(args.page || 'piop/index.html');
if (!fs.existsSync(catalogPath)) fail(`catalog missing: ${catalogPath}`);
if (!fs.existsSync(pagePath)) fail(`page missing: ${pagePath}`);

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
if (!Array.isArray(catalog.packages) || !catalog.packages.length) fail('catalog packages are missing');
for (const entry of catalog.packages) {
  const required = ['id', 'name', 'description', 'version', 'risk_tier', 'recommended_scope', 'repo', 'install', 'resources', 'skill_descriptions'];
  for (const key of required) if (entry[key] === undefined) fail(`package ${entry.id || '(unknown)'} missing ${key}`);
  if (!entry.repo.startsWith('https://github.com/youlikemodernart/')) fail(`unexpected repository owner for ${entry.id}`);
  if (!entry.install.includes(`@v${entry.version}`)) fail(`unpinned or mismatched install command for ${entry.id}`);
}

const start = '<!-- PIOP_SKILLS_START -->';
const end = '<!-- PIOP_SKILLS_END -->';
const originalPage = fs.readFileSync(pagePath, 'utf8');
let page = originalPage;
const first = page.indexOf(start);
const last = page.indexOf(end);
if (first === -1 || last === -1 || last <= first) fail('PiOp catalog markers are missing or reversed');
const rendered = catalog.packages.map(renderPackage).join('\n\n');
page = `${page.slice(0, first + start.length)}\n${rendered}\n          ${page.slice(last)}`;
const skillCount = catalog.packages.reduce((total, entry) => total + entry.resources.skills.length, 0);
page = page.replace(/<p class="piop-meta">\d+ PACKAGES \/ \d+ SKILLS<\/p>/, `<p class="piop-meta">${catalog.packages.length} PACKAGES / ${skillCount} SKILLS</p>`);
if (args.check) {
  if (page !== originalPage) fail('PiOp page is out of sync with the supplied catalog');
  console.log(`PASS piop_catalog_check packages=${catalog.packages.length} skills=${skillCount} catalog_version=${catalog.catalog_version}`);
} else {
  fs.writeFileSync(pagePath, page);
  console.log(`PASS piop_catalog_sync packages=${catalog.packages.length} skills=${skillCount} catalog_version=${catalog.catalog_version}`);
}
