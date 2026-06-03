const { requireSession } = require('./_tracker');

const ROUTE_NODES = [
  { path: '/', type: 'page', access: 'public', note: 'public root' },
  { path: '/question', type: 'page', access: 'public', note: 'public hidden ethos' },
  { path: '/coach', type: 'page', access: 'public', note: 'public coaching landing' },
  { path: '/coach/book', type: 'page', access: 'public', note: 'public coaching booking' },
  { path: '/book', type: 'page', access: 'public', note: 'public discovery booking' },
  { path: '/work', type: 'section', access: 'grouping', note: 'section grouping, no standalone page' },
  { path: '/work/fde', type: 'page', access: 'direct-link', note: 'direct-link work surface' },
  { path: '/proposals', type: 'section', access: 'grouping', note: 'section grouping, no standalone page' },
  { path: '/proposals/belhaus', type: 'page', access: 'noindex', note: 'proposal' },
  { path: '/proposals/compassion', type: 'page', access: 'noindex', note: 'proposal' },
  { path: '/proposals/eidi', type: 'page', access: 'noindex', note: 'proposal (earlier Eidi version)' },
  { path: '/proposals/eidi-phase-one', type: 'page', access: 'noindex', note: 'proposal (current Eidi)' },
  { path: '/proposals/fde', type: 'page', access: 'noindex', note: 'proposal' },
  { path: '/proposals/kaitlyn-wolfe', type: 'page', access: 'noindex', note: 'proposal' },
  { path: '/proposals/noble', type: 'page', access: 'noindex', note: 'proposal' },
  { path: '/proposals/opulist', type: 'page', access: 'noindex', note: 'proposal' },
  { path: '/proposals/paste', type: 'page', access: 'noindex', note: 'proposal' },
  { path: '/proposals/sales-school', type: 'page', access: 'noindex', note: 'proposal' },
  { path: '/proposals/teaspressa', type: 'page', access: 'noindex', note: 'proposal' },
  { path: '/apps', type: 'section', access: 'grouping', note: 'section grouping, no standalone page' },
  { path: '/apps/substratepricing', type: 'page', access: 'noindex', note: 'noindex client app (Substrate pricing)' },
  { path: '/apps/substratepricing-triage', type: 'page', access: 'noindex', note: 'noindex client app (Substrate triage)' },
  { path: '/pinterest', type: 'page', access: 'noindex', note: 'noindex TrendScope app landing' },
  { path: '/pinterest/demo', type: 'page', access: 'noindex', note: 'noindex TrendScope demo' },
  { path: '/pinterest/privacy', type: 'page', access: 'public', note: 'Pinterest API privacy policy' },
  { path: '/pinterest/terms', type: 'page', access: 'public', note: 'Pinterest API terms of service' },
  { path: '/give', type: 'section', access: 'grouping', note: 'section grouping, no standalone page' },
  { path: '/give/rainbow', type: 'page', access: 'noindex', note: 'noindex giving page' },
  { path: '/instructions', type: 'section', access: 'grouping', note: 'section grouping, no standalone page' },
  { path: '/instructions/shipstation', type: 'page', access: 'noindex', note: 'noindex guide' },
  { path: '/internal', type: 'section', access: 'grouping', note: 'section grouping, no standalone page' },
  { path: '/internal/systemresearch', type: 'page', access: 'noindex', note: 'noindex internal research' },
  { path: '/review', type: 'section', access: 'grouping', note: 'section grouping, no standalone page' },
  { path: '/review/substratesemicustom', type: 'page', access: 'noindex', note: 'noindex review surface' },
  { path: '/tracker', type: 'page', access: 'protected', note: 'password protected' },
  { path: '/sitemap', type: 'page', access: 'protected', note: 'password protected, this page' },
  { path: '/404', type: 'system', access: 'system', note: 'system response' }
];

const RELATIONS = [
  { verb: 'contains', from: '/', to: '/question' },
  { verb: 'contains', from: '/', to: '/coach' },
  { verb: 'contains', from: '/coach', to: '/coach/book' },
  { verb: 'contains', from: '/', to: '/book' },
  { verb: 'contains', from: '/', to: '/work' },
  { verb: 'contains', from: '/work', to: '/work/fde' },
  { verb: 'contains', from: '/', to: '/proposals' },
  { verb: 'contains', from: '/proposals', to: '/proposals/belhaus' },
  { verb: 'contains', from: '/proposals', to: '/proposals/compassion' },
  { verb: 'contains', from: '/proposals', to: '/proposals/eidi' },
  { verb: 'contains', from: '/proposals', to: '/proposals/eidi-phase-one' },
  { verb: 'contains', from: '/proposals', to: '/proposals/fde' },
  { verb: 'contains', from: '/proposals', to: '/proposals/kaitlyn-wolfe' },
  { verb: 'contains', from: '/proposals', to: '/proposals/noble' },
  { verb: 'contains', from: '/proposals', to: '/proposals/opulist' },
  { verb: 'contains', from: '/proposals', to: '/proposals/paste' },
  { verb: 'contains', from: '/proposals', to: '/proposals/sales-school' },
  { verb: 'contains', from: '/proposals', to: '/proposals/teaspressa' },
  { verb: 'contains', from: '/', to: '/apps' },
  { verb: 'contains', from: '/apps', to: '/apps/substratepricing' },
  { verb: 'contains', from: '/apps', to: '/apps/substratepricing-triage' },
  { verb: 'contains', from: '/', to: '/pinterest' },
  { verb: 'contains', from: '/pinterest', to: '/pinterest/demo' },
  { verb: 'contains', from: '/pinterest', to: '/pinterest/privacy' },
  { verb: 'contains', from: '/pinterest', to: '/pinterest/terms' },
  { verb: 'contains', from: '/', to: '/give' },
  { verb: 'contains', from: '/give', to: '/give/rainbow' },
  { verb: 'contains', from: '/', to: '/instructions' },
  { verb: 'contains', from: '/instructions', to: '/instructions/shipstation' },
  { verb: 'contains', from: '/', to: '/internal' },
  { verb: 'contains', from: '/internal', to: '/internal/systemresearch' },
  { verb: 'contains', from: '/', to: '/review' },
  { verb: 'contains', from: '/review', to: '/review/substratesemicustom' },
  { verb: 'contains', from: '/', to: '/tracker' },
  { verb: 'contains', from: '/', to: '/sitemap' },
  { verb: 'contains', from: '/', to: '/404' },
  { verb: 'protects', from: 'tracker-session', to: '/tracker' },
  { verb: 'protects', from: 'tracker-session', to: '/sitemap' }
];

const EXCLUSIONS = [
  { pattern: '/apps/fin and /apps/fin/*', reason: 'blocked by vercel.json; standalone Fin Vercel project, canonical at fin.whatarewecapableof.com' },
  { pattern: '/proposals/_template', reason: 'blocked by vercel.json; proposal build template, not a real proposal' },
  { pattern: '/proposals/sales-school/diagrams/toolchain/*', reason: 'blocked by vercel.json; internal diagram QA artifacts' },
  { pattern: '/docs and /docs/*', reason: 'blocked by vercel.json; includes tracked docs/site-dashboard.html' },
  { pattern: '/design and /design/*', reason: 'blocked by vercel.json' },
  { pattern: '/scripts and /scripts/*', reason: 'blocked by vercel.json' },
  { pattern: '/tools and /tools/*', reason: 'blocked by vercel.json; includes tools/finance-dashboard' },
  { pattern: '/proposals/*/slots/', reason: 'local proposal planning artifacts excluded by .vercelignore' },
  { pattern: '/proposals/*/diagrams/html/', reason: 'local diagram exports excluded by .vercelignore' },
  { pattern: '/proposals/*/img/src/', reason: 'local source image workspaces excluded by .vercelignore' }
];

function toId(path) {
  if (path === '/') return 'route-root';
  return `route-${path.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}

function buildNodes() {
  const parentByChild = RELATIONS
    .filter((relation) => relation.verb === 'contains')
    .reduce((parents, relation) => {
      parents[relation.to] = relation.from;
      return parents;
    }, {});

  return ROUTE_NODES.map((node) => ({
    id: toId(node.path),
    path: node.path,
    label: node.path,
    type: node.type,
    access: node.access,
    parent: parentByChild[node.path] || null,
    note: node.note
  }));
}

function getSitemap() {
  const nodes = buildNodes();
  const pageCount = nodes.filter((node) => node.type === 'page' || node.type === 'system').length;

  return {
    site: 'whatarewecapableof.com',
    description: 'Route and section hierarchy for whatarewecapableof.com. Relations use the verbs `contains` for parent to child containment and `protects` for the password gate that guards a route.',
    generatedAt: new Date().toISOString(),
    count: nodes.length,
    pageCount,
    nodes,
    relations: RELATIONS,
    exclusions: EXCLUSIONS
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;

  return res.json(getSitemap());
};
