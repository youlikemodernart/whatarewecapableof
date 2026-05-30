const state = {
  month: '',
  months: [],
  summary: null,
};

const els = {
  monthSelect: document.querySelector('#monthSelect'),
  metrics: document.querySelector('#metrics'),
  recurringRows: document.querySelector('#recurringRows'),
  spendBars: document.querySelector('#spendBars'),
  cardRows: document.querySelector('#cardRows'),
  cardSpendBars: document.querySelector('#cardSpendBars'),
  observedExpenseRows: document.querySelector('#observedExpenseRows'),
  fundingBatchRows: document.querySelector('#fundingBatchRows'),
  invoiceBlocks: document.querySelector('#invoiceBlocks'),
  exceptions: document.querySelector('#exceptions'),
  transactionRows: document.querySelector('#transactionRows'),
  sources: document.querySelector('#sources'),
};

function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);
}

function text(value, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

async function load() {
  const monthParam = state.month ? `?month=${encodeURIComponent(state.month)}` : '';
  const [months, summary] = await Promise.all([
    getJson('/api/months'),
    getJson(`/api/summary${monthParam}`),
  ]);
  state.months = months.months || [];
  state.summary = summary;
  state.month = summary.month;
  render();
}

function render() {
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
}

function renderMonthSelect() {
  els.monthSelect.replaceChildren(...state.months.map((month) => {
    const option = el('option', { value: month, text: month });
    if (month === state.month) option.selected = true;
    return option;
  }));
}

function metricCard(label, value, detail = '', className = '') {
  return el('article', { class: 'status' }, [
    el('h3', { text: label }),
    el('div', { class: `value ${className}`.trim(), text: value }),
    el('div', { class: 'detail', text: detail }),
  ]);
}

function renderMetrics() {
  const { metrics, month } = state.summary;
  const netClass = metrics.netCents >= 0 ? 'good' : 'bad';
  els.metrics.replaceChildren(
    metricCard('Available cash', money(metrics.totalAvailableBalanceCents), 'Mercury accounts'),
    metricCard('Money in', money(metrics.inflowCents), `${month} Mercury inflow`),
    metricCard('Money out', money(metrics.outflowCents), `${month} Mercury outflow`),
    metricCard('Net cash movement', money(metrics.netCents), `${metrics.transactionCount} transactions`, netClass),
    metricCard('Future stack estimate', money(metrics.recurringKnownMonthlyCents), `${metrics.recurringTentativeCount} tentative · ${metrics.recurringUnknownCount} unknown`),
    metricCard('Current recurring', money(metrics.recurringCurrentMonthlyCents), 'known WAWCO-incurred monthly costs'),
    metricCard('Card spend', money(metrics.cardSpendCents), `${metrics.cardExpenseCount} vendor charge${metrics.cardExpenseCount === 1 ? '' : 's'} · ${money(metrics.possiblePersonalFundedCardCents)} possible personal-funded`),
    metricCard('Open invoices', money(metrics.mercuryInvoiceOpenCents + metrics.localInvoiceOpenCents), 'Mercury plus local invoice studio'),
  );
}

function renderRecurring() {
  const rows = state.summary.recurring.items.map((item) => el('tr', {}, [
    el('td', {}, [
      el('strong', { text: item.name }),
      item.vendor && item.vendor !== item.name ? el('small', { text: item.vendor }) : null,
      item.notes ? el('small', { text: item.notes }) : null,
    ]),
    el('td', {}, [
      text(item.plan, 'Unknown'),
      item.unitCount ? el('small', { text: `${item.unitCount} ${item.unitLabel || 'unit'}${item.unitCount === 1 ? '' : 's'}` }) : null,
    ]),
    el('td', { text: item.expectedMonthlyCents === null ? 'Unknown' : money(item.expectedMonthlyCents) }),
    el('td', {}, [
      text(item.status, 'draft'),
      item.paymentSource ? el('small', { text: `paid by ${item.paymentSource}` }) : null,
      item.expenseTiming ? el('small', { text: item.expenseTiming }) : null,
      item.confidence ? el('small', { text: item.confidence }) : null,
    ]),
    el('td', { text: text(item.nextRenewalDate, '') }),
  ]));
  let emptyMessage = 'No recurring cost file yet.';
  if (state.summary.recurring.error) emptyMessage = 'Recurring cost file could not be parsed.';
  else if (state.summary.recurring.fileExists) emptyMessage = 'No recurring costs in the private file.';
  els.recurringRows.replaceChildren(...rows.length ? rows : [emptyRow(5, emptyMessage)]);
}

function emptyRow(colspan, message) {
  return el('tr', {}, [el('td', { colspan: String(colspan), class: 'empty', text: message })]);
}

function renderSpend() {
  const rows = state.summary.mercury.spendByCounterparty;
  const max = Math.max(...rows.map((row) => row.amountCents), 1);
  els.spendBars.replaceChildren(...rows.map((row) => {
    const pct = Math.max(2, Math.round((row.amountCents / max) * 100));
    return el('div', { class: 'bar-row' }, [
      el('div', { class: 'bar-label' }, [
        el('span', { text: row.label }),
        el('small', { text: `${row.count} transaction${row.count === 1 ? '' : 's'}` }),
        el('div', { class: 'track' }, el('div', { class: 'fill', style: `width:${pct}%` })),
      ]),
      el('div', { class: 'bar-amount', text: money(row.amountCents) }),
    ]);
  }));
  if (!rows.length) els.spendBars.replaceChildren(el('p', { class: 'empty', text: 'No spending found for this month.' }));
}

function renderCards() {
  const cards = state.summary.mercury.activeCards || [];
  const cardRows = cards.map((card) => el('tr', {}, [
    el('td', {}, [
      el('strong', { text: card.label || 'Card' }),
      card.purpose ? el('small', { text: card.purpose }) : null,
      card.expectedMerchants?.length ? el('small', { text: `expected: ${card.expectedMerchants.join(', ')}` }) : null,
      card.nameOnCard ? el('small', { text: card.nameOnCard }) : null,
    ]),
    el('td', { text: [card.network, card.type].filter(Boolean).join(' · ') || 'Unknown' }),
    el('td', { text: card.status || 'unknown' }),
    el('td', { text: card.accountName || '' }),
  ]));
  els.cardRows.replaceChildren(...cardRows.length ? cardRows : [emptyRow(4, 'No active Mercury cards found in this snapshot.')]);

  const spendRows = state.summary.mercury.cardSpend || [];
  const max = Math.max(...spendRows.map((row) => row.amountCents), 1);
  els.cardSpendBars.replaceChildren(...spendRows.map((row) => {
    const pct = Math.max(2, Math.round((row.amountCents / max) * 100));
    return el('div', { class: 'bar-row' }, [
      el('div', { class: 'bar-label' }, [
        el('span', { text: row.label || 'Card spend' }),
        el('small', { text: `${row.count} transaction${row.count === 1 ? '' : 's'}` }),
        el('div', { class: 'track' }, el('div', { class: 'fill', style: `width:${pct}%` })),
      ]),
      el('div', { class: 'bar-amount', text: money(row.amountCents) }),
    ]);
  }));
  if (!spendRows.length) els.cardSpendBars.replaceChildren(el('p', { class: 'empty', text: 'No card spend found for this month.' }));
}

function renderObservedCardExpenses() {
  const observed = state.summary.mercury.observedCardExpenses || {};
  const expenses = observed.expenses || [];
  const expenseRows = expenses.map((expense) => el('tr', {}, [
    el('td', { text: expense.date }),
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
  els.observedExpenseRows.replaceChildren(...expenseRows.length ? expenseRows : [emptyRow(5, 'No card expenses found for this month.')]);

  const batches = observed.batches || [];
  const batchRows = batches.map((batch) => {
    const match = batch.fundingMatch;
    const detail = match
      ? `${match.label} ${money(match.amountCents)} on ${match.date}${match.daysAfter ? ` (+${match.daysAfter}d)` : ''}`
      : 'No nearby Ally/Allied transfer found';
    return el('tr', {}, [
      el('td', { text: batch.date }),
      el('td', { text: `${batch.expenseCount} charge${batch.expenseCount === 1 ? '' : 's'}` }),
      el('td', { class: 'num bad', text: money(batch.amountCents) }),
      el('td', {}, [
        el('strong', { text: match ? match.confidence : 'Needs review' }),
        el('small', { text: detail }),
      ]),
    ]);
  });
  els.fundingBatchRows.replaceChildren(...batchRows.length ? batchRows : [emptyRow(4, 'No card charge batches found for this month.')]);
}

function renderInvoices() {
  const mercuryOpen = state.summary.metrics.mercuryInvoiceOpenCents;
  const localOpen = state.summary.metrics.localInvoiceOpenCents;
  const localCount = state.summary.localInvoices.invoices.length;
  const mercuryCount = state.summary.mercury.invoices.length;
  els.invoiceBlocks.replaceChildren(
    mini('Mercury open', money(mercuryOpen), `${mercuryCount} all-time Mercury invoice${mercuryCount === 1 ? '' : 's'}`),
    mini('Local open', money(localOpen), `${localCount} all-time local draft/issued invoice${localCount === 1 ? '' : 's'}`),
    mini('Local statuses', statusLine(state.summary.localInvoices.summary), 'Invoice studio'),
    mini('Mercury statuses', statusLine(state.summary.mercury.invoiceSummary), 'Mercury'),
  );
}

function mini(label, value, detail) {
  return el('div', { class: 'mini' }, [
    el('h3', { text: label }),
    el('div', { class: 'value', text: value }),
    el('div', { class: 'detail', text: detail }),
  ]);
}

function statusLine(summary) {
  if (!summary || !summary.length) return 'None';
  return summary.map((item) => `${item.status}: ${item.count}`).join(' · ');
}

function renderExceptions() {
  const exceptions = state.summary.exceptions || [];
  els.exceptions.replaceChildren(...exceptions.map((item) => el('div', { class: 'exception' }, [
    el('strong', { text: item.label }),
    el('span', { text: item.detail }),
  ])));
  if (!exceptions.length) els.exceptions.replaceChildren(el('p', { class: 'empty', text: 'No review items for this snapshot.' }));
}

function renderTransactions() {
  const rows = state.summary.mercury.recentTransactions.map((tx) => el('tr', {}, [
    el('td', { text: tx.date }),
    el('td', { text: tx.counterparty }),
    el('td', { text: tx.category }),
    el('td', { text: tx.kind }),
    el('td', { text: tx.cardLabel || '' }),
    el('td', { class: `num ${tx.amountCents >= 0 ? 'good' : 'bad'}`, text: money(tx.amountCents) }),
  ]));
  els.transactionRows.replaceChildren(...rows.length ? rows : [emptyRow(6, 'No transactions found for this month.')]);
}

function renderSources() {
  const { sources, generatedAt } = state.summary;
  const pairs = [
    ['Generated', generatedAt],
    ['Mercury snapshot', sources.mercurySnapshotDir || 'none'],
    ['Mercury manifest', sources.mercuryManifestPath || 'none'],
    ['Recurring costs', sources.recurringPath || 'none'],
    ['Card labels', sources.cardLabelsPath || 'none'],
    ['Invoice DB', sources.invoiceDbPath || 'none'],
  ];
  els.sources.replaceChildren(...pairs.flatMap(([key, value]) => [
    el('dt', { text: key }),
    el('dd', { text: value }),
  ]));
}

els.monthSelect.addEventListener('change', async () => {
  state.month = els.monthSelect.value;
  await load();
});

load().catch((error) => {
  document.body.replaceChildren(el('main', {}, [
    el('h1', { text: 'Finance dashboard error' }),
    el('p', { class: 'lede', text: error.message }),
  ]));
});
