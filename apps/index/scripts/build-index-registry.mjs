import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '../..');
const registryPath = path.join(appRoot, 'data', 'registry.json');
const exclusionsPath = path.join(appRoot, 'data', 'exclusions.json');
const currentnessPath = path.join(appRoot, 'data', 'currentness.json');
const reportsDir = path.join(repoRoot, '.pi', 'reports');

const allowed = {
  category: new Set(['homepage', 'page', 'proposal', 'brief', 'tool', 'subdomain', 'internal', 'project', 'compliance']),
  status: new Set(['active', 'live', 'needs_review', 'transfer_pending', 'build_pending', 'legacy', 'blocked']),
  audience: new Set(['public', 'client', 'internal', 'mixed']),
  auth: new Set(['public', 'direct_link', 'workspace_oauth', 'passcode', 'mixed', 'unknown']),
  visibility: new Set(['public', 'noindex', 'private', 'source_blocked']),
  lifecycle: new Set(['active', 'archived', 'decommissioned']),
};

const requiredFields = ['id', 'title', 'url', 'path', 'category', 'group', 'status', 'audience', 'auth', 'visibility', 'lifecycle', 'source'];
const requiredExclusionFields = ['id', 'path', 'source', 'reason', 'reviewedAt'];
const ignoredDirs = new Set(['.git', '.pi', 'node_modules', '.vercel']);

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readRegistry() {
  return readJson(registryPath, null);
}

function readExclusions() {
  return readJson(exclusionsPath, { version: 1, items: [] });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoSecretTerms(value, label) {
  assert(!/secret|token|password|credential/i.test(JSON.stringify(value)), `${label} contains a blocked secret-like term.`);
}

function validateRegistry(registry) {
  assert(registry && typeof registry === 'object', 'Registry must be an object.');
  assert(registry.version === 1, 'Registry version must be 1.');
  assert(Array.isArray(registry.items), 'Registry must contain an items array.');

  const ids = new Set();
  const urls = new Set();
  registry.items.forEach((item, index) => {
    requiredFields.forEach((field) => assert(item[field], `Item ${index} is missing ${field}.`));
    assert(!ids.has(item.id), `Duplicate id: ${item.id}`);
    ids.add(item.id);
    assert(!urls.has(item.url), `Duplicate url: ${item.url}`);
    urls.add(item.url);
    assert(/^https:\/\//.test(item.url), `${item.id} url must be https.`);
    Object.entries(allowed).forEach(([field, values]) => {
      assert(values.has(item[field]), `${item.id} has invalid ${field}: ${item[field]}`);
    });
    if (item.tags !== undefined) assert(Array.isArray(item.tags), `${item.id} tags must be an array.`);
    assertNoSecretTerms(item, item.id);
  });

  return {
    ok: true,
    count: registry.items.length,
    generatedAt: registry.generatedAt,
    categories: [...new Set(registry.items.map((item) => item.category))].sort(),
    statuses: [...new Set(registry.items.map((item) => item.status))].sort(),
    lifecycles: [...new Set(registry.items.map((item) => item.lifecycle))].sort(),
  };
}

function validateExclusions(exclusions) {
  assert(exclusions && typeof exclusions === 'object', 'Exclusions must be an object.');
  assert(exclusions.version === 1, 'Exclusions version must be 1.');
  assert(Array.isArray(exclusions.items), 'Exclusions must contain an items array.');

  const ids = new Set();
  const paths = new Set();
  const sources = new Set();
  exclusions.items.forEach((item, index) => {
    requiredExclusionFields.forEach((field) => assert(item[field], `Exclusion ${index} is missing ${field}.`));
    assert(!ids.has(item.id), `Duplicate exclusion id: ${item.id}`);
    ids.add(item.id);
    assert(!paths.has(item.path), `Duplicate exclusion path: ${item.path}`);
    paths.add(item.path);
    assert(!sources.has(item.source), `Duplicate exclusion source: ${item.source}`);
    sources.add(item.source);
    assert(item.source.startsWith('repo:'), `${item.id} exclusion source must start with repo:.`);
    assertNoSecretTerms(item, item.id);
  });

  return { ok: true, count: exclusions.items.length };
}

function currentnessPayload(report) {
  return {
    version: 1,
    generatedAt: report.generatedAt,
    registry: {
      count: report.registry.count,
      generatedAt: report.registry.generatedAt,
    },
    exclusions: {
      count: report.exclusions.count,
    },
    summary: report.summary,
    candidates: report.candidates,
    excluded: report.excluded,
  };
}

function validateCurrentness(currentness, report) {
  assert(currentness && typeof currentness === 'object', 'Currentness snapshot must be an object.');
  assert(currentness.version === 1, 'Currentness snapshot version must be 1.');
  assert(currentness.summary && typeof currentness.summary === 'object', 'Currentness snapshot needs a summary.');
  assert(Array.isArray(currentness.candidates), 'Currentness snapshot candidates must be an array.');
  assert(Array.isArray(currentness.excluded), 'Currentness snapshot excluded must be an array.');

  assert(currentness.summary.candidateCount === report.summary.candidateCount, 'Currentness candidate count is stale. Run build-index-registry.mjs --write-currentness.');
  assert(currentness.summary.excludedCount === report.summary.excludedCount, 'Currentness exclusion count is stale. Run build-index-registry.mjs --write-currentness.');
  assert(currentness.summary.rawCandidateCount === report.summary.rawCandidateCount, 'Currentness raw candidate count is stale. Run build-index-registry.mjs --write-currentness.');
  assert(currentness.registry?.count === report.registry.count, 'Currentness registry count is stale. Run build-index-registry.mjs --write-currentness.');
  assert(currentness.registry?.generatedAt === report.registry.generatedAt, 'Currentness registry date is stale. Run build-index-registry.mjs --write-currentness.');
  assert(currentness.exclusions?.count === report.exclusions.count, 'Currentness exclusion count is stale. Run build-index-registry.mjs --write-currentness.');

  const reportCandidates = report.candidates.map((item) => item.path).sort().join('\n');
  const snapshotCandidates = currentness.candidates.map((item) => item.path).sort().join('\n');
  assert(reportCandidates === snapshotCandidates, 'Currentness candidate paths are stale. Run build-index-registry.mjs --write-currentness.');

  const reportExcluded = report.excluded.map((item) => item.path).sort().join('\n');
  const snapshotExcluded = currentness.excluded.map((item) => item.path).sort().join('\n');
  assert(reportExcluded === snapshotExcluded, 'Currentness exclusion paths are stale. Run build-index-registry.mjs --write-currentness.');

  assertNoSecretTerms({ summary: currentness.summary, candidates: currentness.candidates, excluded: currentness.excluded }, 'currentness snapshot');
  return { ok: true, generatedAt: currentness.generatedAt, candidateCount: currentness.summary.candidateCount, excludedCount: currentness.summary.excludedCount };
}

function walkIndexRoutes(dir = repoRoot, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(repoRoot, full);
    if (rel.startsWith('apps/index')) continue;
    if (entry.isDirectory()) {
      walkIndexRoutes(full, found);
      continue;
    }
    if (entry.isFile() && entry.name === 'index.html') {
      found.push(path.relative(repoRoot, full));
    }
  }
  return found.sort();
}

function routeFromIndexPath(indexPath) {
  const dir = path.dirname(indexPath);
  if (dir === '.') return '/';
  return `/${dir.replace(/\\/g, '/')}/`;
}

function candidateFromRoute(indexPath) {
  const route = routeFromIndexPath(indexPath);
  const id = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\/$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  let category = 'page';
  if (route.startsWith('/proposals/')) category = 'proposal';
  if (route.startsWith('/briefs/')) category = 'brief';
  if (route.startsWith('/tools/') || route.startsWith('/apps/')) category = 'tool';
  if (route.startsWith('/internal/') || route.startsWith('/review/')) category = 'internal';
  if (route.startsWith('/pinterest/privacy') || route.startsWith('/pinterest/terms')) category = 'compliance';
  if (route === '/') category = 'homepage';

  return {
    id,
    title: id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
    url: `https://whatarewecapableof.com${route}`,
    path: route,
    category,
    group: 'Needs review',
    status: 'needs_review',
    audience: route.startsWith('/proposals/') || route.startsWith('/briefs/') ? 'client' : 'internal',
    auth: route === '/' || route.startsWith('/how-we-work') || route.startsWith('/work/') ? 'public' : 'direct_link',
    visibility: route === '/' || route.startsWith('/how-we-work') || route.startsWith('/work/') ? 'public' : 'noindex',
    lifecycle: 'active',
    source: `repo:${indexPath}`,
    tags: ['candidate'],
    description: 'Generated candidate. Parent review required before adding to the curated registry.',
  };
}

function splitCandidates(registry, exclusions) {
  const knownSources = new Set(registry.items.map((item) => item.source.replace(/^repo:/, '')));
  const knownPaths = new Set(registry.items.map((item) => item.path));
  const exclusionByPath = new Map(exclusions.items.map((item) => [item.path, item]));
  const exclusionBySource = new Map(exclusions.items.map((item) => [item.source, item]));

  const rawCandidates = walkIndexRoutes()
    .filter((indexPath) => !knownSources.has(indexPath) && !knownPaths.has(routeFromIndexPath(indexPath)))
    .map(candidateFromRoute);

  const candidates = [];
  const excluded = [];
  rawCandidates.forEach((candidate) => {
    const exclusion = exclusionByPath.get(candidate.path) || exclusionBySource.get(candidate.source);
    if (exclusion) {
      excluded.push({
        ...candidate,
        exclusionId: exclusion.id,
        reason: exclusion.reason,
        reviewedAt: exclusion.reviewedAt,
      });
      return;
    }
    candidates.push(candidate);
  });

  return { candidates, excluded, rawCount: rawCandidates.length };
}

function makeReport() {
  const registry = readRegistry();
  const exclusions = readExclusions();
  const registrySummary = validateRegistry(registry);
  const exclusionsSummary = validateExclusions(exclusions);
  const { candidates, excluded, rawCount } = splitCandidates(registry, exclusions);
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    repoRoot,
    registry: registrySummary,
    exclusions: exclusionsSummary,
    summary: {
      candidateCount: candidates.length,
      excludedCount: excluded.length,
      rawCandidateCount: rawCount,
      actionRequired: candidates.length > 0,
    },
    candidates,
    excluded,
    dataBoundary: 'Route metadata only. No credentials, env values, cookies, private page contents, raw browser data, or raw terminal logs.',
  };
}

function reportStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Windex candidate audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Registry rows: ${report.registry.count}`);
  lines.push(`Actionable candidates: ${report.summary.candidateCount}`);
  lines.push(`Reviewed exclusions: ${report.summary.excludedCount}`);
  lines.push('');
  lines.push('## Actionable candidates');
  lines.push('');
  if (report.candidates.length === 0) {
    lines.push('None.');
  } else {
    report.candidates.forEach((item) => {
      lines.push(`- ${item.path} (${item.source}) - ${item.category}, ${item.audience}, ${item.visibility}`);
    });
  }
  lines.push('');
  lines.push('## Reviewed exclusions');
  lines.push('');
  if (report.excluded.length === 0) {
    lines.push('None.');
  } else {
    report.excluded.forEach((item) => {
      lines.push(`- ${item.path} (${item.source}) - ${item.reason}`);
    });
  }
  lines.push('');
  lines.push('## Currentness rule');
  lines.push('');
  lines.push('Treat actionable candidates as a manual review gate. Classify them before publication. Do not auto-add Windex rows from discovery.');
  lines.push('');
  lines.push('## Data boundary');
  lines.push('');
  lines.push(report.dataBoundary);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeReport(report) {
  const stamp = reportStamp();
  fs.mkdirSync(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, `windex-candidates-${stamp}.json`);
  const mdPath = path.join(reportsDir, `windex-candidates-${stamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath };
}

function writeCurrentness(report) {
  const payload = currentnessPayload(report);
  fs.writeFileSync(currentnessPath, `${JSON.stringify(payload, null, 2)}\n`);
  return currentnessPath;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const report = makeReport();
  let reportPaths = null;

  if (args.has('--write-report')) {
    reportPaths = writeReport(report);
  }

  let currentnessWritePath = null;
  if (args.has('--write-currentness')) {
    currentnessWritePath = writeCurrentness(report);
  }

  if (args.has('--check')) {
    const currentness = readJson(currentnessPath, null);
    const currentnessSummary = validateCurrentness(currentness, report);
    console.log(JSON.stringify({ ...report.registry, exclusions: report.exclusions, currentness: currentnessSummary }, null, 2));
    return;
  }

  if (args.has('--candidates')) {
    console.log(JSON.stringify({ ...report, reportPaths, currentnessWritePath }, null, 2));
    if (args.has('--fail-on-candidates') && report.summary.candidateCount > 0) process.exitCode = 2;
    return;
  }

  console.log(JSON.stringify({ summary: report.registry, candidateSummary: report.summary, reportPaths }, null, 2));
  if (args.has('--fail-on-candidates') && report.summary.candidateCount > 0) process.exitCode = 2;
}

main();
