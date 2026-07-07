const $ = (selector) => document.querySelector(selector);

const refs = {
  authBadge: $('#auth-badge'),
  logoutLink: $('#logout-link'),
  hero: $('#hero'),
  signinPanel: $('#signin-panel'),
  signinCopy: $('#signin-copy'),
  signinHelp: $('#signin-help'),
  signinLink: $('#signin-link'),
  workspace: $('#workspace'),
  search: $('#search-input'),
  category: $('#category-filter'),
  audience: $('#audience-filter'),
  visibility: $('#visibility-filter'),
  lifecycle: $('#lifecycle-filter'),
  status: $('#status-filter'),
  viewButtons: [...document.querySelectorAll('[data-view]')],
  countSummary: $('#count-summary'),
  draftSummary: $('#draft-summary'),
  updatedAt: $('#updated-at'),
  results: $('#results'),
  emptyPanel: $('#empty-panel'),
  errorPanel: $('#error-panel'),
  errorCopy: $('#error-copy'),
  draftPanel: $('#draft-panel'),
  draftOutput: $('#draft-output'),
  applyDraft: $('#apply-draft'),
  copyDraft: $('#copy-draft'),
  resetDraft: $('#reset-draft'),
  draftApplyStatus: $('#draft-apply-status'),
};

const STORAGE_KEY = 'windex.organizeDraft.v1';
const EDITABLE_FIELDS = ['category', 'lifecycle', 'status'];

const categoryOrder = ['tool', 'proposal', 'brief', 'page', 'subdomain', 'internal', 'compliance', 'project'];
const lifecycleOrder = ['active', 'archived', 'decommissioned'];
const statusOrder = ['active', 'live', 'needs_review', 'transfer_pending', 'build_pending', 'legacy', 'blocked'];

const categoryLabels = {
  homepage: 'Pages',
  page: 'Pages',
  proposal: 'Proposals',
  brief: 'Briefs',
  tool: 'Tools',
  subdomain: 'Subdomains',
  internal: 'Internal',
  project: 'Projects',
  compliance: 'Compliance',
};

const lifecycleLabels = {
  active: 'Active',
  archived: 'Archived',
  decommissioned: 'Decommissioned',
};

const statusLabels = {
  active: 'Verified',
  live: 'Live',
  needs_review: 'Needs review',
  legacy: 'Legacy',
  blocked: 'Blocked',
  transfer_pending: 'Transfer pending',
  build_pending: 'Build pending',
};

// Statuses worth flagging inline. Everything else stays silent so the map reads quietly.
const flagText = {
  needs_review: 'review',
  legacy: 'legacy',
  blocked: 'blocked',
  transfer_pending: 'transfer',
  build_pending: 'building',
};
const flagClass = {
  needs_review: 'flag-review',
  legacy: 'flag-muted',
  blocked: 'flag-danger',
  transfer_pending: 'flag-muted',
  build_pending: 'flag-muted',
};

const state = {
  session: null,
  registry: null,
  items: [],
  drafts: readDrafts(),
  view: 'overview',
  lastResults: [],
  filters: {
    query: '',
    category: 'all',
    audience: 'all',
    visibility: 'all',
    lifecycle: 'all',
    status: 'all',
  },
};

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function readDrafts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveDrafts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.drafts));
}

function defaultLifecycle(item) {
  return item.lifecycle || 'active';
}

function effectiveItem(item) {
  return {
    ...item,
    lifecycle: defaultLifecycle(item),
    ...(state.drafts[item.id] || {}),
  };
}

function effectiveItems() {
  return state.items.map(effectiveItem);
}

function originalValue(item, field) {
  if (field === 'lifecycle') return defaultLifecycle(item);
  return item[field];
}

function setDraftValue(id, field, value) {
  const original = state.items.find((item) => item.id === id);
  if (!original || !EDITABLE_FIELDS.includes(field)) return;

  const base = originalValue(original, field);
  const draft = { ...(state.drafts[id] || {}) };
  if (value === base) {
    delete draft[field];
  } else {
    draft[field] = value;
  }

  if (Object.keys(draft).length) state.drafts[id] = draft;
  else delete state.drafts[id];
  saveDrafts();
  renderCurrentView();
}

function draftChanges() {
  return state.items
    .filter((item) => state.drafts[item.id])
    .map((item) => {
      const to = effectiveItem(item);
      const from = {};
      const changed = {};
      EDITABLE_FIELDS.forEach((field) => {
        const before = originalValue(item, field);
        if (to[field] !== before) {
          from[field] = before;
          changed[field] = to[field];
        }
      });
      return {
        id: item.id,
        title: item.title,
        url: item.url,
        from,
        to: changed,
      };
    })
    .filter((change) => Object.keys(change.to).length);
}

function patchPayload() {
  return {
    app: 'Windex',
    generatedAt: new Date().toISOString(),
    note: 'Apply to apps/index/data/registry.json after review, then redeploy. Lifecycle changes do not delete pages.',
    changes: draftChanges(),
  };
}

function overrideRequestPayload() {
  return {
    changes: draftChanges().map((change) => ({
      id: change.id,
      to: change.to,
    })),
  };
}

function setAuthBadge(text, mode = 'pending') {
  refs.authBadge.textContent = text;
  refs.authBadge.className = `badge ${mode}`;
}

function pretty(value) {
  if (categoryLabels[value]) return categoryLabels[value];
  if (lifecycleLabels[value]) return lifecycleLabels[value];
  if (statusLabels[value]) return statusLabels[value];
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Homepage folds into Pages for overview grouping; raw category is kept everywhere else.
function groupCategory(item) {
  return item.category === 'homepage' ? 'page' : item.category;
}

function uniqueValues(items, field, preferred = []) {
  const values = [...new Set(items.map((item) => item[field]).filter(Boolean))];
  return values.sort((a, b) => {
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return pretty(a).localeCompare(pretty(b));
  });
}

function fillSelect(select, label, values) {
  if (!select) return;
  select.replaceChildren();
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = `All ${label}`;
  select.append(all);
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = pretty(value);
    select.append(option);
  });
  select.value = state.filters[select.id.replace('-filter', '')] || 'all';
}

function fillEditSelect(value, values, label, itemId, field) {
  const select = document.createElement('select');
  select.dataset.itemId = itemId;
  select.dataset.field = field;
  select.setAttribute('aria-label', `${label} for ${itemId}`);
  values.forEach((optionValue) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = pretty(optionValue);
    select.append(option);
  });
  select.value = value;
  return select;
}

function searchableText(item) {
  return [
    item.title,
    item.url,
    item.path,
    item.category,
    item.group,
    item.lifecycle,
    item.status,
    item.audience,
    item.visibility,
    item.auth,
    item.source,
    item.description,
    item.notes,
    ...(item.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function matchesFilters(item) {
  const { query, category, audience, visibility, lifecycle, status } = state.filters;
  if (category !== 'all' && item.category !== category) return false;
  if (audience !== 'all' && item.audience !== audience) return false;
  if (visibility !== 'all' && item.visibility !== visibility) return false;
  if (lifecycle !== 'all' && item.lifecycle !== lifecycle) return false;
  if (status !== 'all' && item.status !== status) return false;
  if (query && !searchableText(item).includes(query.toLowerCase())) return false;
  return true;
}

function rankItem(item) {
  const query = state.filters.query.toLowerCase();
  if (!query) return 0;
  const title = String(item.title || '').toLowerCase();
  const url = String(item.url || '').toLowerCase();
  const tags = (item.tags || []).join(' ').toLowerCase();
  if (title === query || tags.split(/\s+/).includes(query)) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  if (url.includes(query)) return 3;
  return 4;
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const rankDelta = rankItem(a) - rankItem(b);
    if (rankDelta) return rankDelta;
    const lifecycleDelta = lifecycleOrder.indexOf(a.lifecycle) - lifecycleOrder.indexOf(b.lifecycle);
    if (lifecycleDelta) return lifecycleDelta;
    const statusDelta = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
    if (statusDelta) return statusDelta;
    return String(a.title).localeCompare(String(b.title));
  });
}

function filteredItems() {
  const items = effectiveItems().filter(matchesFilters);
  state.lastResults = sortItems(items);
  return state.lastResults;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function reviewFlag(item) {
  const label = flagText[item.status];
  if (!label) return null;
  return el('span', `index-flag ${flagClass[item.status] || ''}`.trim(), label);
}

// One compact link row. By default: title + a flag only when the status needs attention.
// Options add a muted sub-line (location, category, lifecycle) for shelves and search.
function createIndexLink(item, options = {}) {
  const row = el('article', 'index-link');
  if (state.drafts[item.id]) row.classList.add('has-draft');
  if (item.lifecycle === 'decommissioned') row.classList.add('is-decommissioned');

  const head = el('div', 'index-head');
  const link = el('a', 'index-title', item.title || item.url);
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = item.url;
  head.append(link);

  const flag = reviewFlag(item);
  if (flag) head.append(flag);
  row.append(head);

  const sub = [];
  if (options.category) sub.push(pretty(item.category));
  if (options.lifecycle && item.lifecycle !== 'active') sub.push(pretty(item.lifecycle));
  if (options.location) sub.push(item.path || item.url);
  if (sub.length) row.append(el('span', 'index-sub', sub.join('  ·  ')));

  return row;
}

function groupByCategory(items) {
  return items.reduce((groups, item) => {
    const key = groupCategory(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
    return groups;
  }, new Map());
}

function createCategoryBlock(category, items) {
  const block = el('section', 'category-block');
  const heading = el('div', 'category-heading');
  heading.append(el('h2', null, categoryLabels[category] || pretty(category)));
  heading.append(el('span', 'category-count', String(items.length)));
  block.append(heading);

  const list = el('div', 'index-list');
  sortItems(items).forEach((item) => list.append(createIndexLink(item)));
  block.append(list);
  return block;
}

function indexStat(count, label, mode) {
  const stat = el('span', `index-stat ${mode || ''}`.trim());
  stat.append(el('span', 'index-stat-n', String(count)));
  stat.append(el('span', 'index-stat-k', label));
  return stat;
}

function renderIndexSummary(active, archived, decommissioned) {
  const band = el('div', 'index-summary');
  const needsReview = active.filter((item) => item.status === 'needs_review').length;
  band.append(indexStat(active.length, active.length === 1 ? 'active link' : 'active links'));
  if (needsReview) band.append(indexStat(needsReview, 'need review', 'flag-review'));
  if (archived.length) band.append(indexStat(archived.length, 'archived', 'muted'));
  if (decommissioned.length) band.append(indexStat(decommissioned.length, 'to remove', 'flag-danger'));
  return band;
}

function copyButton(label, getText) {
  const button = el('button', 'secondary', label);
  button.type = 'button';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      const original = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = original; }, 1200);
    } catch (error) {
      /* clipboard unavailable; ignore */
    }
  });
  return button;
}

function cleanupPayload(items) {
  return JSON.stringify({
    app: 'Windex',
    request: 'Decommission cleanup candidates. Review each before removing the page or related site records. This list does not delete anything by itself.',
    generatedAt: new Date().toISOString(),
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      path: item.path,
      source: item.source,
      notes: item.notes || '',
    })),
  }, null, 2);
}

function renderShelf(label, items, kind) {
  const shelf = el('section', `shelf shelf-${kind}`);
  const heading = el('div', 'shelf-heading');
  heading.append(el('h2', null, label));
  heading.append(el('span', 'category-count', String(items.length)));
  shelf.append(heading);

  if (kind === 'archived') {
    shelf.append(el('p', 'shelf-note', 'Pulled out of the active categories above. Still searchable, still in Windex.'));
  }
  if (kind === 'decommissioned') {
    shelf.append(el('p', 'shelf-note', 'Flagged to clean up later with Pi. This flag does not delete the page or remove it from Windex.'));
  }

  const list = el('div', 'shelf-list');
  sortItems(items).forEach((item) => list.append(createIndexLink(item, { location: true, category: true })));
  shelf.append(list);

  if (kind === 'decommissioned') {
    const actions = el('div', 'shelf-actions');
    actions.append(copyButton('Copy cleanup list for Pi', () => cleanupPayload(items)));
    shelf.append(actions);
  }
  return shelf;
}

function renderSearchResults(items) {
  const list = el('div', 'search-list panel');
  sortItems(items).forEach((item) => list.append(createIndexLink(item, { location: true, category: true, lifecycle: true })));
  refs.results.append(list);
}

function currentnessData() {
  return state.registry?.currentness || { summary: {}, candidates: [], excluded: [] };
}

function currentnessRows(field) {
  const data = currentnessData();
  return Array.isArray(data[field]) ? data[field].map((item) => ({ lifecycle: 'active', ...item })) : [];
}

function routeParts(routePath) {
  const route = String(routePath || '/').split('?')[0].split('#')[0];
  return route.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

function buildRouteTree(items) {
  const root = { segment: '/', path: '/', items: [], children: new Map() };
  sortItems(items).forEach((item) => {
    const parts = routeParts(item.path || item.url);
    if (!parts.length) {
      root.items.push(item);
      return;
    }

    let node = root;
    const route = [];
    parts.forEach((segment) => {
      route.push(segment);
      if (!node.children.has(segment)) {
        node.children.set(segment, {
          segment,
          path: `/${route.join('/')}/`,
          items: [],
          children: new Map(),
        });
      }
      node = node.children.get(segment);
    });
    node.items.push(item);
  });
  return root;
}

function sortedChildren(node) {
  const rootOrder = ['blog', 'briefs', 'proposals', 'work', 'apps', 'tools', 'internal', 'pinterest'];
  return [...node.children.values()].sort((a, b) => {
    const ai = rootOrder.indexOf(a.segment);
    const bi = rootOrder.indexOf(b.segment);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a.segment.localeCompare(b.segment);
  });
}

function nodeLinkCount(node) {
  return node.items.length + sortedChildren(node).reduce((sum, child) => sum + nodeLinkCount(child), 0);
}

function renderMapItem(item) {
  const row = el('li', 'map-item');
  row.append(createIndexLink(item, { category: true, lifecycle: true }));
  return row;
}

function renderMapNode(node, depth = 0) {
  const details = document.createElement('details');
  details.className = `map-node depth-${Math.min(depth, 4)}`;
  if (depth < 2) details.open = true;

  const summary = document.createElement('summary');
  const label = el('span', 'map-segment', node.segment === '/' ? 'root' : node.segment);
  const meta = el('span', 'map-path', `${node.path} · ${nodeLinkCount(node)}`);
  summary.append(label, meta);
  details.append(summary);

  if (node.items.length) {
    const list = el('ul', 'map-items');
    node.items.forEach((item) => list.append(renderMapItem(item)));
    details.append(list);
  }

  const children = sortedChildren(node);
  if (children.length) {
    const childWrap = el('div', 'map-children');
    children.forEach((child) => childWrap.append(renderMapNode(child, depth + 1)));
    details.append(childWrap);
  }

  return details;
}

function renderCurrentnessRow(item, kind) {
  const row = el('article', `currentness-row ${kind}`);
  const head = el('div', 'currentness-head');
  head.append(el('span', 'currentness-title', item.title || item.path));
  head.append(el('span', 'currentness-path', item.path || item.url));
  row.append(head);

  const meta = [pretty(item.category), pretty(item.audience), pretty(item.visibility), item.source].filter(Boolean);
  row.append(el('p', 'currentness-meta', meta.join('  ·  ')));
  if (kind === 'candidate') {
    row.append(el('p', 'currentness-note', 'Unmapped route. Classify before publishing to Windex.'));
  }
  if (kind === 'excluded') {
    row.append(el('p', 'currentness-note', item.reason || 'Reviewed exclusion.'));
  }
  return row;
}

function renderCurrentnessShelf(label, rows, kind, emptyText) {
  const shelf = el('section', `currentness-shelf ${kind}`);
  const heading = el('div', 'shelf-heading');
  heading.append(el('h2', null, label));
  heading.append(el('span', 'category-count', String(rows.length)));
  shelf.append(heading);

  if (!rows.length) {
    shelf.append(el('p', 'shelf-note', emptyText));
    return shelf;
  }

  const list = el('div', 'currentness-list');
  rows.forEach((item) => list.append(renderCurrentnessRow(item, kind)));
  shelf.append(list);
  return shelf;
}

function renderMap(items) {
  refs.results.className = 'results map-results';
  refs.results.replaceChildren();

  if (state.filters.query) {
    renderSearchResults(items);
    return;
  }

  const data = currentnessData();
  const candidates = currentnessRows('candidates').filter(matchesFilters);
  const excluded = currentnessRows('excluded').filter(matchesFilters);
  const tree = buildRouteTree(items);

  const intro = el('section', 'map-intro panel');
  intro.append(el('h2', null, 'Route map'));
  const summary = data.summary || {};
  const filtersActive = Object.entries(state.filters).some(([key, value]) => key !== 'query' && value !== 'all');
  const copy = filtersActive
    ? [`${items.length} registry rows shown`, `${candidates.length} unmapped shown`, `${excluded.length} exclusions shown`]
    : [`${items.length} registry rows`, `${summary.candidateCount ?? candidates.length} unmapped`, `${summary.excludedCount ?? excluded.length} reviewed exclusions`];
  if (data.generatedAt) copy.push(`audit ${data.generatedAt.slice(0, 10)}`);
  intro.append(el('p', 'muted', copy.join(' · ')));
  refs.results.append(intro);

  const treeWrap = el('section', 'map-tree panel');
  treeWrap.append(renderMapNode(tree));
  refs.results.append(treeWrap);

  refs.results.append(renderCurrentnessShelf('Unmapped candidates', candidates, 'candidate', 'No unmapped candidates in the latest bundled audit.'));
  refs.results.append(renderCurrentnessShelf('Reviewed exclusions', excluded, 'excluded', 'No reviewed exclusions in the latest bundled audit.'));
}

function renderOverview(items) {
  refs.results.className = 'results overview-results';
  refs.results.replaceChildren();

  if (state.filters.query) {
    renderSearchResults(items);
    return;
  }

  const active = items.filter((item) => item.lifecycle === 'active');
  const archived = items.filter((item) => item.lifecycle === 'archived');
  const decommissioned = items.filter((item) => item.lifecycle === 'decommissioned');

  refs.results.append(renderIndexSummary(active, archived, decommissioned));

  const groups = groupByCategory(active);
  const columns = el('div', 'category-columns');
  categoryOrder.forEach((category) => {
    const group = groups.get(category) || [];
    if (group.length) columns.append(createCategoryBlock(category, group));
  });
  [...groups.entries()]
    .filter(([category]) => !categoryOrder.includes(category))
    .sort(([a], [b]) => pretty(a).localeCompare(pretty(b)))
    .forEach(([category, group]) => columns.append(createCategoryBlock(category, group)));
  if (columns.childElementCount) refs.results.append(columns);

  if (archived.length) refs.results.append(renderShelf('Archived', archived, 'archived'));
  if (decommissioned.length) refs.results.append(renderShelf('Decommissioned', decommissioned, 'decommissioned'));
}

function renderLedger(items) {
  refs.results.className = 'results';
  refs.results.replaceChildren();

  const wrap = el('div', 'table-wrap panel');
  const table = el('table', 'ledger-table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Title', 'Category', 'Audience', 'Lifecycle', 'Review', 'Location'].forEach((heading) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = heading;
    headerRow.append(th);
  });
  thead.append(headerRow);

  const tbody = document.createElement('tbody');
  sortItems(items).forEach((item) => {
    const row = document.createElement('tr');
    if (state.drafts[item.id]) row.classList.add('has-draft');
    const title = document.createElement('td');
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.title;
    title.append(link);

    const review = el('td', flagText[item.status] ? `review-cell ${flagClass[item.status]}` : 'review-cell muted', pretty(item.status));

    const cells = [
      title,
      el('td', null, pretty(item.category)),
      el('td', null, pretty(item.audience)),
      el('td', null, pretty(item.lifecycle)),
      review,
      el('td', 'mono-cell', item.path || item.url),
    ];
    cells.forEach((cell) => row.append(cell));
    tbody.append(row);
  });
  table.append(thead, tbody);
  wrap.append(table);
  refs.results.append(wrap);
}

function renderOrganize(items) {
  refs.results.className = 'results';
  refs.results.replaceChildren();

  const wrap = el('div', 'organize-list');
  wrap.append(el('p', 'organize-caption muted', 'Change category, lifecycle, or review state. Edits stay in this browser until you copy them for Pi. Setting decommissioned flags a page for later cleanup; it never deletes anything.'));

  const categoryValues = uniqueValues(effectiveItems(), 'category', categoryOrder);
  const lifecycleValues = lifecycleOrder;
  const statusValues = uniqueValues(effectiveItems(), 'status', statusOrder);

  sortItems(items).forEach((item) => {
    const row = el('article', 'organize-row panel');
    if (state.drafts[item.id]) row.classList.add('has-draft');

    const main = el('div', 'organize-main');
    const link = el('a', 'index-title', item.title);
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = item.url;
    main.append(link);
    main.append(el('p', 'index-sub', item.path || item.url));
    if (item.lifecycle === 'decommissioned') {
      main.append(el('p', 'decommission-note', 'Cleanup path: ask Pi to remove the page and related site records after review.'));
    }

    const controls = el('div', 'organize-controls');
    const fields = [
      ['category', 'Category', categoryValues],
      ['lifecycle', 'Lifecycle', lifecycleValues],
      ['status', 'Review', statusValues],
    ];
    fields.forEach(([field, label, values]) => {
      const wrapper = document.createElement('label');
      wrapper.textContent = label;
      wrapper.append(fillEditSelect(item[field], values, label, item.id, field));
      controls.append(wrapper);
    });

    row.append(main, controls);
    wrap.append(row);
  });

  refs.results.append(wrap);
}

function renderDraftPanel() {
  const changes = draftChanges();
  refs.draftSummary.textContent = changes.length ? `${changes.length} local change${changes.length === 1 ? '' : 's'} not yet applied` : '';
  refs.draftPanel.hidden = changes.length === 0;
  if (refs.applyDraft) refs.applyDraft.disabled = changes.length === 0;
  if (changes.length) refs.draftOutput.value = JSON.stringify(patchPayload(), null, 2);
  else refs.draftOutput.value = '';
}

async function applyDraftChanges() {
  const payload = overrideRequestPayload();
  if (!payload.changes.length) return;

  refs.applyDraft.disabled = true;
  refs.draftApplyStatus.textContent = 'Applying changes...';

  try {
    const registry = await getJson('/api/overrides', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    state.registry = registry;
    state.items = Array.isArray(registry.items) ? registry.items : state.items;
    state.drafts = {};
    saveDrafts();
    renderFilters();
    renderCurrentView();
    refs.draftSummary.textContent = 'Server overrides updated.';
  } catch (error) {
    refs.draftApplyStatus.textContent = error.message;
    refs.applyDraft.disabled = false;
  }
}

function renderFilters() {
  const items = effectiveItems();
  fillSelect(refs.category, 'categories', uniqueValues(items, 'category', categoryOrder));
  fillSelect(refs.audience, 'audiences', uniqueValues(items, 'audience'));
  fillSelect(refs.visibility, 'visibility', uniqueValues(items, 'visibility'));
  fillSelect(refs.lifecycle, 'lifecycles', lifecycleOrder);
  fillSelect(refs.status, 'review states', uniqueValues(items, 'status', statusOrder));
}

function renderCurrentView() {
  const items = filteredItems();
  refs.emptyPanel.hidden = items.length > 0;

  const overviewIndex = state.view === 'overview' && !state.filters.query;
  refs.countSummary.textContent = overviewIndex
    ? ''
    : `${items.length} of ${state.items.length} link${state.items.length === 1 ? '' : 's'}`;

  refs.viewButtons.forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  renderDraftPanel();

  if (state.view === 'map') renderMap(items);
  else if (state.view === 'ledger') renderLedger(items);
  else if (state.view === 'organize') renderOrganize(items);
  else renderOverview(items);
}

function openTopResult() {
  const [top] = state.lastResults;
  if (top?.url) window.open(top.url, '_blank', 'noopener,noreferrer');
}

function clearSearch() {
  refs.search.value = '';
  state.filters.query = '';
  renderCurrentView();
}

function bindControls() {
  refs.search.addEventListener('input', () => {
    state.filters.query = refs.search.value.trim();
    renderCurrentView();
  });

  refs.search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      openTopResult();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      clearSearch();
    }
  });

  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName;
    if (event.key === '/' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
      event.preventDefault();
      refs.search.focus();
    }
  });

  [refs.category, refs.audience, refs.visibility, refs.lifecycle, refs.status].forEach((select) => {
    select.addEventListener('change', () => {
      state.filters[select.id.replace('-filter', '')] = select.value;
      renderCurrentView();
    });
  });

  refs.viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.view;
      renderCurrentView();
    });
  });

  refs.results.addEventListener('change', (event) => {
    const select = event.target.closest('select[data-item-id][data-field]');
    if (!select) return;
    setDraftValue(select.dataset.itemId, select.dataset.field, select.value);
  });

  refs.applyDraft.addEventListener('click', applyDraftChanges);

  refs.copyDraft.addEventListener('click', async () => {
    refs.draftOutput.select();
    try {
      await navigator.clipboard.writeText(refs.draftOutput.value);
      refs.copyDraft.textContent = 'Copied';
      setTimeout(() => { refs.copyDraft.textContent = 'Copy changes for Pi'; }, 1200);
    } catch (error) {
      document.execCommand('copy');
    }
  });

  refs.resetDraft.addEventListener('click', () => {
    state.drafts = {};
    saveDrafts();
    renderFilters();
    renderCurrentView();
  });
}

function showSignedOut(data) {
  if (refs.hero) refs.hero.hidden = false;
  refs.signinPanel.hidden = false;
  refs.workspace.hidden = true;
  refs.logoutLink.hidden = true;
  if (!data.auth.configured) {
    setAuthBadge('Needs OAuth', 'pending');
    refs.signinCopy.textContent = 'Windex is live. Google OAuth is not configured yet.';
    refs.signinHelp.textContent = 'Next gate: set INDEX_GOOGLE_CLIENT_ID, INDEX_GOOGLE_CLIENT_SECRET, INDEX_SESSION_SECRET, INDEX_ALLOWED_DOMAIN, and optional INDEX_ALLOWED_EMAILS in Vercel.';
    refs.signinLink.setAttribute('aria-disabled', 'true');
    refs.signinLink.addEventListener('click', (event) => event.preventDefault(), { once: true });
    return;
  }

  setAuthBadge('Sign in required', 'pending');
  refs.signinCopy.textContent = 'Sign in with your work Google account before the links load.';
  refs.signinHelp.textContent = `Allowed domain: ${data.auth.allowedDomain}`;
}

function showSignedIn(data) {
  state.session = data;
  setAuthBadge(data.user.email, 'ready');
  if (refs.hero) refs.hero.hidden = true;
  refs.signinPanel.hidden = true;
  refs.workspace.hidden = false;
  refs.logoutLink.hidden = false;
}

async function loadRegistry() {
  refs.countSummary.textContent = 'Loading links...';
  try {
    const registry = await getJson('/api/registry');
    state.registry = registry;
    state.items = Array.isArray(registry.items) ? registry.items : [];
    const currentness = registry.currentness?.generatedAt ? ` · Audit ${registry.currentness.generatedAt.slice(0, 10)}` : '';
    refs.updatedAt.textContent = registry.generatedAt ? `Updated ${registry.generatedAt}${currentness}` : '';
    renderFilters();
    renderCurrentView();
  } catch (error) {
    refs.errorPanel.hidden = false;
    refs.errorCopy.textContent = error.message;
    refs.countSummary.textContent = 'Links did not load.';
  }
}

async function loadSession() {
  try {
    const data = await getJson('/api/session');
    if (!data.auth.configured || !data.user) {
      showSignedOut(data);
      return;
    }
    showSignedIn(data);
    await loadRegistry();
  } catch (error) {
    setAuthBadge('Session error', 'error');
    refs.signinPanel.hidden = false;
    refs.signinCopy.textContent = 'Session check failed.';
    refs.signinHelp.textContent = error.message;
  }
}

bindControls();
loadSession();
