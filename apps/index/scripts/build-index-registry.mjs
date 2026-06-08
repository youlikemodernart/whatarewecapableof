import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '../..');
const registryPath = path.join(appRoot, 'data', 'registry.json');

const allowed = {
  category: new Set(['homepage', 'page', 'proposal', 'brief', 'tool', 'subdomain', 'internal', 'project', 'compliance']),
  status: new Set(['active', 'live', 'needs_review', 'transfer_pending', 'build_pending', 'legacy', 'blocked']),
  audience: new Set(['public', 'client', 'internal', 'mixed']),
  auth: new Set(['public', 'direct_link', 'workspace_oauth', 'passcode', 'mixed', 'unknown']),
  visibility: new Set(['public', 'noindex', 'private', 'source_blocked']),
  lifecycle: new Set(['active', 'archived', 'decommissioned']),
};

const requiredFields = ['id', 'title', 'url', 'path', 'category', 'group', 'status', 'audience', 'auth', 'visibility', 'lifecycle', 'source'];
const ignoredDirs = new Set(['.git', '.pi', 'node_modules', '.vercel']);

function readRegistry() {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    const serialized = JSON.stringify(item);
    assert(!/secret|token|password|credential/i.test(serialized), `${item.id} contains a blocked secret-like term.`);
  });

  return {
    ok: true,
    count: registry.items.length,
    categories: [...new Set(registry.items.map((item) => item.category))].sort(),
    statuses: [...new Set(registry.items.map((item) => item.status))].sort(),
    lifecycles: [...new Set(registry.items.map((item) => item.lifecycle))].sort(),
  };
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
    description: 'Generated candidate. Parent review required before adding to the curated registry.'
  };
}

function listCandidates() {
  const registry = readRegistry();
  const knownSources = new Set(registry.items.map((item) => item.source.replace(/^repo:/, '')));
  const knownPaths = new Set(registry.items.map((item) => item.path));
  return walkIndexRoutes()
    .filter((indexPath) => !knownSources.has(indexPath) && !knownPaths.has(routeFromIndexPath(indexPath)))
    .map(candidateFromRoute);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const registry = readRegistry();
  const summary = validateRegistry(registry);

  if (args.has('--check')) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (args.has('--candidates')) {
    console.log(JSON.stringify({ candidates: listCandidates() }, null, 2));
    return;
  }

  console.log(JSON.stringify({ summary, candidateCount: listCandidates().length }, null, 2));
}

main();
