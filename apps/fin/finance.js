const state = {
  entity: 'wawco',
  month: '',
  months: [],
  summary: null,
  imports: [],
  pendingImport: null,
};

const $ = (selector) => document.querySelector(selector);

const refs = {
  signinPanel: $('#signin-panel'),
  signinHelp: $('#signin-help'),
  dashboardPanel: $('#dashboard-panel'),
  state: $('#dashboard-state'),
  freshnessNote: $('#finance-freshness-note'),
  refresh: $('#refresh-summary'),
  entityControl: $('#entity-control'),
  entitySelect: $('#entity-select'),
  monthControl: $('#month-control'),
  monthSelect: $('#month-select'),
  metrics: $('#metrics'),
  recurringRows: $('#recurring-rows'),
  spendBars: $('#spend-bars'),
  cardRows: $('#card-rows'),
  cardSpendBars: $('#card-spend-bars'),
  observedExpenseRows: $('#observed-expense-rows'),
  fundingBatchRows: $('#funding-batch-rows'),
  invoiceBlocks: $('#invoice-blocks'),
  exceptions: $('#exceptions'),
  transactionRows: $('#transaction-rows'),
  hostedInvoiceQueues: $('#hosted-invoice-queues'),
  hostedInvoiceRows: $('#hosted-invoice-rows'),
  sources: $('#sources'),
  importPanel: $('#finance-import-panel'),
  importFile: $('#finance-import-file'),
  importPreview: $('#finance-import-preview'),
  importSubmit: $('#finance-import-submit'),
  importRefresh: $('#finance-import-refresh'),
  importSummaryStatus: $('#finance-import-summary-status'),
  importCurrent: $('#finance-current-import'),
  importHistorySummary: $('#finance-import-history-summary'),
  importList: $('#finance-import-list'),
};

async function getJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) }, cache: options.cache || 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);
}

function text(value, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function titleize(value) {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}

function dateStamp(value) {
  const time = parseTime(value);
  return time ? new Date(time).toLocaleString() : '';
}

function daysBetween(start, end = Date.now()) {
  if (!start) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function financeFreshness(summary = state.summary || {}) {
  const latest = summary.latestFinanceImport || null;
  const importedAt = parseTime(latest?.importedAt);
  const generatedAt = parseTime(summary.generatedAt);
  const mercurySnapshotAt = parseTime(summary.mercury?.snapshot?.generatedAt);
  const coverageEnd = summary.sources?.coverageEnd || '';
  const coverageEndAt = coverageEnd ? parseTime(`${coverageEnd}T23:59:59Z`) : null;
  const providerAt = mercurySnapshotAt || coverageEndAt;
  const daysOld = daysBetween(providerAt);
  let stateLabel = 'No provider refresh metadata loaded';
  if (mercurySnapshotAt && daysOld !== null && daysOld <= 1) stateLabel = 'Mercury snapshot refreshed recently';
  else if (mercurySnapshotAt && daysOld !== null) stateLabel = 'Mercury snapshot may be stale';
  else if (coverageEndAt && daysOld !== null && daysOld <= 3) stateLabel = 'Provider coverage is recent';
  else if (coverageEndAt && daysOld !== null) stateLabel = 'Provider coverage may be stale';
  const parts = [];
  if (importedAt) parts.push(`hosted import ${dateStamp(importedAt)}`);
  if (generatedAt) parts.push(`summary generated ${dateStamp(generatedAt)}`);
  if (mercurySnapshotAt) parts.push(`Mercury snapshot ${dateStamp(mercurySnapshotAt)}`);
  if (coverageEnd) parts.push(`coverage through ${coverageEnd}`);
  return {
    stateLabel,
    daysOld,
    detail: parts.join(' · ') || 'No hosted provider-refresh metadata is available.',
  };
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') node.setAttribute('style', value);
    else node.setAttribute(key, value);
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function emptyRow(colspan, message) {
  return el('tr', {}, [el('td', { colspan: String(colspan), class: 'empty', text: message })]);
}

function metricCard(label, value, detail = '', className = '') {
  return el('article', { class: 'metric-card' }, [
    el('span', { class: 'label', text: label }),
    el('strong', { class: className, text: value }),
    detail ? el('p', { class: 'metric-detail', text: detail }) : null,
  ]);
}

function mini(label, value, detail = '') {
  return el('div', { class: 'finance-mini' }, [
    el('h3', { text: label }),
    el('div', { class: 'value', text: value }),
    detail ? el('div', { class: 'detail', text: detail }) : null,
  ]);
}

function statusLine(summary) {
  if (!summary || !summary.length) return 'None';
  return summary.map((item) => `${titleize(item.status)}: ${item.count ?? item.invoiceCount ?? 0}`).join(' · ');
}

function paymentLabel(invoice = {}) {
  const status = invoice.paymentStatus || 'none';
  if (status === 'none') return 'No link';
  if (status === 'link_ready') return invoice.paymentMode ? `${titleize(invoice.paymentMode)} link ready` : 'Link ready';
  if (status === 'paid') return 'Paid online';
  if (status === 'processing') return 'Payment processing';
  if (status === 'expired') return 'Expired';
  if (status === 'failed') return 'Failed';
  if (status === 'refunded') return 'Refunded';
  if (status === 'disputed') return 'Dispute watch';
  return titleize(status);
}

function paymentDetail(invoice = {}) {
  return [invoice.paymentRequestStatus ? titleize(invoice.paymentRequestStatus) : '', invoice.paymentExpiresAt ? `expires ${invoice.paymentExpiresAt.slice(0, 10)}` : ''].filter(Boolean).join(' · ');
}

function fallbackEntities() {
  return [
    { id: 'wawco', label: 'WAWCO', name: 'What are we capable of?' },
    { id: 'ndg', label: 'NDG', name: 'Noah Development Group LLC' },
    { id: 'combined', label: 'Combined', name: 'Combined' },
  ];
}

function currentEntityLabel() {
  return state.summary?.entityLabel || fallbackEntities().find((entity) => entity.id === state.entity)?.label || titleize(state.entity || 'wawco');
}

function renderEntitySelect() {
  if (!refs.entitySelect) return;
  const entities = Array.isArray(state.summary?.entities) && state.summary.entities.length ? state.summary.entities : fallbackEntities();
  const selected = entities.some((entity) => entity.id === state.entity) ? state.entity : 'wawco';
  refs.entitySelect.replaceChildren(...entities.map((entity) => {
    const option = el('option', { value: entity.id, text: entity.name || entity.label || entity.id });
    if (entity.id === selected) option.selected = true;
    return option;
  }));
  refs.entitySelect.value = selected;
  state.entity = selected;
}

function renderMonthSelect() {
  const months = state.months || [];
  refs.monthControl.hidden = !months.length;
  refs.monthSelect.replaceChildren(...months.map((month) => {
    const option = el('option', { value: month, text: month });
    if (month === state.month) option.selected = true;
    return option;
  }));
}

function renderMetrics() {
  const summary = state.summary || {};
  const metrics = summary.metrics || {};
  const netClass = Number(metrics.netCents || 0) >= 0 ? 'good' : 'bad';
  refs.metrics.replaceChildren(
    metricCard('Available cash', money(metrics.totalAvailableBalanceCents), 'Mercury accounts'),
    metricCard('Money in', money(metrics.inflowCents), `${summary.month || 'No month'} inflow`),
    metricCard('Money out', money(metrics.outflowCents), `${summary.month || 'No month'} outflow`),
    metricCard('Net cash movement', money(metrics.netCents), `${metrics.transactionCount || 0} transactions`, netClass),
    metricCard('Future stack estimate', money(metrics.recurringKnownMonthlyCents), `${metrics.recurringTentativeCount || 0} tentative · ${metrics.recurringUnknownCount || 0} unknown`),
    metricCard('Current recurring', money(metrics.recurringCurrentMonthlyCents), `known ${currentEntityLabel()}-incurred monthly costs`),
    metricCard('Card spend', money(metrics.cardSpendCents), `${metrics.cardExpenseCount || 0} vendor charges · ${money(metrics.possiblePersonalFundedCardCents)} possible personal-funded`),
    metricCard('Open invoices', money((metrics.mercuryInvoiceOpenCents || 0) + (metrics.hostedInvoiceOpenCents ?? metrics.localInvoiceOpenCents ?? 0)), 'Imported Mercury plus hosted Fin receivables'),
  );
}

function renderRecurring() {
  const recurring = state.summary?.recurring || {};
  const rows = (recurring.items || []).map((item) => el('tr', {}, [
    el('td', {}, [
      el('strong', { text: item.name || 'Untitled cost' }),
      item.vendor && item.vendor !== item.name ? el('small', { text: item.vendor }) : null,
      item.notes ? el('small', { text: item.notes }) : null,
    ]),
    el('td', {}, [
      text(item.plan, 'Unknown'),
      item.unitCount ? el('small', { text: `${item.unitCount} ${item.unitLabel || 'unit'}${item.unitCount === 1 ? '' : 's'}` }) : null,
    ]),
    el('td', { class: 'num', text: item.expectedMonthlyCents === null || item.expectedMonthlyCents === undefined ? 'Unknown' : money(item.expectedMonthlyCents) }),
    el('td', {}, [
      text(item.status, 'draft'),
      item.paymentSource ? el('small', { text: `paid by ${item.paymentSource}` }) : null,
      item.expenseTiming ? el('small', { text: item.expenseTiming }) : null,
      item.confidence ? el('small', { text: item.confidence }) : null,
    ]),
    el('td', { text: text(item.nextRenewalDate, '') }),
  ]));
  const emptyMessage = recurring.error || 'No hosted recurring-cost summary has been imported yet.';
  refs.recurringRows.replaceChildren(...rows.length ? rows : [emptyRow(5, emptyMessage)]);
}

function renderBars(container, rows = [], emptyMessage) {
  const max = Math.max(...rows.map((row) => Number(row.amountCents || 0)), 1);
  container.replaceChildren(...rows.map((row) => {
    const pct = Math.max(2, Math.round((Number(row.amountCents || 0) / max) * 100));
    return el('div', { class: 'finance-bar-row' }, [
      el('div', { class: 'finance-bar-label' }, [
        el('span', { text: row.label || 'Unknown' }),
        el('small', { text: `${row.count || 0} transaction${row.count === 1 ? '' : 's'}` }),
        el('div', { class: 'finance-track' }, el('div', { class: 'finance-fill', style: `width:${pct}%` })),
      ]),
      el('div', { class: 'finance-bar-amount', text: money(row.amountCents) }),
    ]);
  }));
  if (!rows.length) container.replaceChildren(el('p', { class: 'empty', text: emptyMessage }));
}

function renderSpend() {
  const mercury = state.summary?.mercury || {};
  renderBars(refs.spendBars, mercury.spendByCounterparty || [], 'No hosted spend summary has been imported yet.');
}

function renderCards() {
  const mercury = state.summary?.mercury || {};
  const cards = mercury.activeCards || [];
  const cardRows = cards.map((card) => el('tr', {}, [
    el('td', {}, [
      el('strong', { text: card.label || 'Card' }),
      card.purpose ? el('small', { text: card.purpose }) : null,
    ]),
    el('td', { text: card.type || 'Unknown' }),
    el('td', { text: card.status || 'unknown' }),
    el('td', { text: card.expectedMerchants?.length ? card.expectedMerchants.join(', ') : '' }),
  ]));
  refs.cardRows.replaceChildren(...cardRows.length ? cardRows : [emptyRow(4, 'No hosted card inventory has been imported yet.')]);
  renderBars(refs.cardSpendBars, mercury.cardSpend || [], 'No hosted card-spend summary has been imported yet.');
}

function renderObservedCardExpenses() {
  const observed = state.summary?.mercury?.observedCardExpenses || {};
  const expenses = observed.expenses || [];
  const expenseRows = expenses.map((expense) => el('tr', {}, [
    el('td', { text: expense.date || '' }),
    el('td', {}, [
      el('strong', { text: expense.merchant || 'Unknown merchant' }),
      expense.descriptor && expense.descriptor !== expense.merchant ? el('small', { text: expense.descriptor }) : null,
      expense.cardLabel ? el('small', { text: expense.cardLabel }) : null,
    ]),
    el('td', { text: expense.category || 'Uncategorized' }),
    el('td', { class: 'num bad', text: money(expense.amountCents) }),
    el('td', {}, [
      el('strong', { text: expense.possiblePersonalFunding ? 'Possible personal-funded' : 'Needs review' }),
      el('small', { text: expense.fundingDetail || '' }),
    ]),
  ]));
  refs.observedExpenseRows.replaceChildren(...expenseRows.length ? expenseRows : [emptyRow(5, 'No hosted card expenses have been imported yet.')]);

  const batches = observed.batches || [];
  const batchRows = batches.map((batch) => {
    const signal = batch.fundingSignal || 'No nearby personal-funding signal.';
    return el('tr', {}, [
      el('td', { text: batch.date || '' }),
      el('td', { text: `${batch.expenseCount || 0} charge${batch.expenseCount === 1 ? '' : 's'}` }),
      el('td', { class: 'num bad', text: money(batch.amountCents) }),
      el('td', { text: signal }),
    ]);
  });
  refs.fundingBatchRows.replaceChildren(...batchRows.length ? batchRows : [emptyRow(4, 'No hosted card charge batches have been imported yet.')]);
}

function renderInvoices() {
  const summary = state.summary || {};
  const hosted = summary.hostedInvoices || {};
  const mercury = summary.mercury || {};
  refs.invoiceBlocks.replaceChildren(
    mini('Mercury open', money(summary.metrics?.mercuryInvoiceOpenCents || 0), `${(mercury.invoices || []).length} imported Mercury invoice${(mercury.invoices || []).length === 1 ? '' : 's'}`),
    mini('Hosted open', money(hosted.openReceivablesCents || 0), `${hosted.visibleCount || 0} visible hosted invoice${hosted.visibleCount === 1 ? '' : 's'}`),
    mini('Hosted statuses', statusLine(hosted.summary), 'Fin invoices'),
    mini('Mercury statuses', statusLine(mercury.invoiceSummary), 'Imported Mercury summary'),
  );

  refs.hostedInvoiceQueues.replaceChildren(
    mini('Overdue', money(hosted.overdueCents || 0), `${(hosted.overdue || []).length} invoice${(hosted.overdue || []).length === 1 ? '' : 's'}`),
    mini('Due soon', money(hosted.dueSoonCents || 0), `${(hosted.dueSoon || []).length} invoice${(hosted.dueSoon || []).length === 1 ? '' : 's'} in the next 14 days`),
    mini('Ready for review', money(hosted.readyForReviewCents || 0), `${hosted.readyForReviewCount || 0} invoice${hosted.readyForReviewCount === 1 ? '' : 's'}`),
    mini('Online links', money(hosted.paymentActiveCents || 0), `${hosted.paymentActiveCount || 0} active or processing link${hosted.paymentActiveCount === 1 ? '' : 's'}`),
    mini('Paid online', money(hosted.paymentPaidCents || 0), `${hosted.paymentPaidCount || 0} Stripe-paid invoice${hosted.paymentPaidCount === 1 ? '' : 's'}`),
    mini('Private excluded', String(hosted.excludedPrivatePayeeCount || 0), `private-payee records outside ${hosted.entityLabel || currentEntityLabel()} totals`),
  );

  const rows = (hosted.invoices || []).map((invoice) => el('tr', {}, [
    el('td', {}, [
      el('strong', { text: invoice.invoiceNumber || 'Invoice' }),
      invoice.entityLabel ? el('small', { text: invoice.reportingEntityLabel && invoice.reportingEntityLabel !== invoice.entityLabel ? `${invoice.entityLabel} · reports ${invoice.reportingEntityLabel}` : invoice.entityLabel }) : null,
      invoice.invoiceDate ? el('small', { text: `Invoice date ${invoice.invoiceDate}` }) : null,
    ]),
    el('td', { text: invoice.clientLabel || 'Untitled client' }),
    el('td', { text: titleize(invoice.status) }),
    el('td', {}, [
      el('strong', { text: paymentLabel(invoice) }),
      paymentDetail(invoice) ? el('small', { text: paymentDetail(invoice) }) : null,
    ]),
    el('td', {}, [
      text(invoice.dueDate, ''),
      invoice.dueState ? el('small', { class: invoice.dueState === 'overdue' ? 'bad' : '', text: titleize(invoice.dueState) }) : null,
    ]),
    el('td', { class: 'num', text: money(invoice.amountCents) }),
  ]));
  refs.hostedInvoiceRows.replaceChildren(...rows.length ? rows : [emptyRow(6, 'No hosted Fin invoices are visible in this dashboard scope.')]);
}

function renderExceptions() {
  const exceptions = state.summary?.exceptions || [];
  refs.exceptions.replaceChildren(...exceptions.map((item) => el('div', { class: `finance-exception ${item.severity || ''}`.trim() }, [
    el('strong', { text: item.label || 'Review item' }),
    el('span', { text: item.detail || '' }),
  ])));
  if (!exceptions.length) refs.exceptions.replaceChildren(el('p', { class: 'empty', text: 'No review items for this summary.' }));
}

function renderTransactions() {
  const rows = (state.summary?.mercury?.recentTransactions || []).map((tx) => el('tr', {}, [
    el('td', { text: tx.date || '' }),
    el('td', { text: tx.counterparty || 'Unknown' }),
    el('td', { text: tx.category || 'Uncategorized' }),
    el('td', { text: tx.kind || '' }),
    el('td', { text: tx.cardLabel || '' }),
    el('td', { class: `num ${Number(tx.amountCents || 0) >= 0 ? 'good' : 'bad'}`, text: money(tx.amountCents) }),
  ]));
  refs.transactionRows.replaceChildren(...rows.length ? rows : [emptyRow(6, 'No hosted transaction summary has been imported yet.')]);
}

function sourceKindLine(summary = state.summary || {}) {
  const sourceKinds = summary.sources?.sourceKinds || [];
  return Array.isArray(sourceKinds) && sourceKinds.length ? sourceKinds.join(', ') : 'no hosted summary source';
}

function renderSources() {
  const summary = state.summary || {};
  const sources = summary.sources || {};
  const latest = summary.latestFinanceImport || null;
  const freshness = financeFreshness(summary);
  const pairs = [
    ['Freshness', `${freshness.stateLabel}${freshness.detail ? ` · ${freshness.detail}` : ''}`],
    ['Generated', summary.generatedAt || ''],
    ['Imported', latest?.importedAt || 'not imported'],
    ['Hosted invoice store', sources.hostedInvoiceStore || 'Neon fin_invoices'],
    ['Finance snapshot', sources.financeSnapshot || 'none'],
    ['Mercury snapshot', summary.mercury?.snapshot?.generatedAt || 'not imported'],
    ['Coverage', [sources.coverageStart, sources.coverageEnd].filter(Boolean).join(' to ') || 'not imported'],
    ['Source kinds', Array.isArray(sources.sourceKinds) ? sources.sourceKinds.join(', ') : 'not imported'],
    ['Validator', sources.validatorVersion || 'not imported'],
    ['Content hash', sources.contentSha256 ? `${sources.contentSha256.slice(0, 12)}...` : 'not imported'],
    ['Invoice source', sources.invoiceSource || 'hosted Fin invoices'],
  ];
  refs.sources.replaceChildren(...pairs.flatMap(([key, value]) => [
    el('dt', { text: key }),
    el('dd', { text: value }),
  ]));
}

function renderFreshnessNote() {
  if (!refs.freshnessNote) return;
  const freshness = financeFreshness();
  refs.freshnessNote.textContent = `${freshness.stateLabel}. ${freshness.detail}`;
}

function importSummaryLine(item) {
  const hash = item.contentSha256 ? `${item.contentSha256.slice(0, 12)}...` : 'no hash';
  return `${item.month || 'No month'} · ${item.importedAt || 'No timestamp'} · ${hash}`;
}

function renderImportAdminSummary() {
  const imports = state.imports || [];
  const latest = imports[0] || state.summary?.latestFinanceImport || null;
  const importCount = imports.length ? `${imports.length} import${imports.length === 1 ? '' : 's'}` : 'no import history loaded';
  const month = latest?.month || state.summary?.month || 'No active import';
  refs.importSummaryStatus.textContent = `${month} · ${sourceKindLine()} · ${importCount}`;
  refs.importHistorySummary.textContent = imports.length ? `Show import history (${imports.length})` : 'Show import history';
}

function renderCurrentImport() {
  const latest = (state.imports || [])[0] || state.summary?.latestFinanceImport || null;
  if (!latest) {
    refs.importCurrent.replaceChildren(el('p', { class: 'empty', text: 'No active derived summary import.' }));
    return;
  }
  refs.importCurrent.replaceChildren(
    el('div', {}, [
      el('span', { class: 'eyebrow', text: 'Active import' }),
      el('strong', { text: latest.label || `Finance import ${latest.month || ''}` }),
      el('small', { text: importSummaryLine(latest) }),
    ]),
  );
}

function renderImportPreview() {
  const pending = state.pendingImport;
  if (!pending) {
    refs.importPreview.textContent = 'No derived summary selected.';
    refs.importSubmit.disabled = true;
    return;
  }
  refs.importPreview.replaceChildren(
    el('strong', { text: pending.label || `Finance summary ${pending.month || ''}` }),
    el('span', { text: `${pending.schemaVersion || 'unknown schema'} · ${pending.month || 'no month'} · generated ${pending.generatedAt || 'unknown time'}` }),
    el('small', { text: 'Server validation rejects unknown keys, raw identifiers, raw paths, and local invoice payloads before storing.' }),
  );
  refs.importSubmit.disabled = false;
}

function renderImports() {
  const imports = state.imports || [];
  renderImportAdminSummary();
  renderCurrentImport();
  refs.importList.replaceChildren(...imports.map((item) => {
    const deleteButton = el('button', { type: 'button', class: 'secondary', text: 'Delete' });
    deleteButton.addEventListener('click', () => deleteImport(item.id).catch((error) => {
      refs.state.textContent = error.message;
    }));
    return el('div', { class: 'finance-import-item' }, [
      el('div', {}, [
        el('strong', { text: item.label || 'Finance import' }),
        el('small', { text: importSummaryLine(item) }),
      ]),
      deleteButton,
    ]);
  }));
  if (!imports.length) refs.importList.replaceChildren(el('p', { class: 'empty', text: 'No derived finance summaries imported yet.' }));
}

async function loadImports() {
  try {
    const data = await getJson('/api/finance/imports');
    state.imports = data.imports || [];
    refs.importPanel.hidden = false;
    renderImports();
  } catch (error) {
    state.imports = [];
    refs.importPanel.hidden = true;
  }
}

async function selectImportFile(event) {
  const file = event.target.files?.[0];
  state.pendingImport = null;
  if (!file) {
    renderImportPreview();
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    state.pendingImport = parsed.summary || parsed;
    renderImportPreview();
  } catch (error) {
    refs.importPreview.textContent = `Could not read derived summary: ${error.message}`;
    refs.importSubmit.disabled = true;
  }
}

async function submitImport() {
  if (!state.pendingImport) return;
  refs.importSubmit.disabled = true;
  refs.state.textContent = 'Importing derived finance summary...';
  try {
    await getJson('/api/finance/import-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.pendingImport),
    });
    state.pendingImport = null;
    refs.importFile.value = '';
    renderImportPreview();
    await loadImports();
    await loadSummary();
  } catch (error) {
    refs.importPreview.textContent = `Import rejected: ${error.message}`;
    refs.importSubmit.disabled = false;
    refs.state.textContent = error.message;
  }
}

async function deleteImport(id) {
  if (!id) return;
  if (!window.confirm('Delete this derived finance summary import? The row will be soft-deleted and /finance will fall back to the next import or empty state.')) return;
  refs.state.textContent = 'Deleting derived finance summary...';
  await getJson(`/api/finance/imports?id=${encodeURIComponent(id)}&reason=${encodeURIComponent('deleted from finance import panel')}`, { method: 'DELETE' });
  await loadImports();
  await loadSummary();
}

function render() {
  renderEntitySelect();
  renderMonthSelect();
  renderMetrics();
  renderRecurring();
  renderSpend();
  renderCards();
  renderObservedCardExpenses();
  renderInvoices();
  renderExceptions();
  renderTransactions();
  renderSources();
  renderFreshnessNote();
  renderImportAdminSummary();
  renderCurrentImport();
}

async function loadSummary() {
  refs.state.textContent = 'Reloading hosted summary from Fin. This does not run Mercury or provider refresh.';
  const params = new URLSearchParams();
  if (state.entity) params.set('entity', state.entity);
  if (state.month) params.set('month', state.month);
  const data = await getJson(`/api/finance/summary${params.toString() ? `?${params.toString()}` : ''}`);
  state.summary = data.summary || {};
  state.entity = state.summary.entityFilter || state.entity || 'wawco';
  state.month = state.summary.month || state.month || '';
  state.months = state.summary.months || [];
  render();
  const freshness = financeFreshness();
  refs.state.textContent = `Hosted summary loaded · ${currentEntityLabel()} · ${state.summary.month || 'no month'} · ${sourceKindLine()} · ${freshness.stateLabel}`;
}

async function loadSession() {
  const session = await getJson('/api/session');
  if (!session.auth.configured || !session.user) {
    refs.signinPanel.hidden = false;
    refs.dashboardPanel.hidden = true;
    refs.signinHelp.textContent = session.auth.configured ? `Allowed domain: ${session.auth.allowedDomain}` : 'Google OAuth is not configured yet.';
    return;
  }
  refs.signinPanel.hidden = true;
  refs.dashboardPanel.hidden = false;
  await loadSummary();
  await loadImports();
}

refs.refresh.addEventListener('click', () => loadSummary().catch((error) => {
  refs.state.textContent = error.message;
}));

refs.entitySelect.addEventListener('change', () => {
  state.entity = refs.entitySelect.value || 'wawco';
  loadSummary().catch((error) => {
    refs.state.textContent = error.message;
  });
});

refs.monthSelect.addEventListener('change', () => {
  state.month = refs.monthSelect.value;
  loadSummary().catch((error) => {
    refs.state.textContent = error.message;
  });
});

refs.importFile.addEventListener('change', (event) => {
  selectImportFile(event).catch((error) => {
    refs.importPreview.textContent = error.message;
    refs.importSubmit.disabled = true;
  });
});

refs.importSubmit.addEventListener('click', () => {
  submitImport().catch((error) => {
    refs.state.textContent = error.message;
    refs.importSubmit.disabled = false;
  });
});

refs.importRefresh.addEventListener('click', () => {
  loadImports().catch((error) => {
    refs.state.textContent = error.message;
  });
});

loadSession().catch((error) => {
  refs.signinPanel.hidden = false;
  refs.dashboardPanel.hidden = true;
  refs.signinHelp.textContent = error.message;
});
