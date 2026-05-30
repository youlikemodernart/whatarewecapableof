#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const STATIC_DIR = path.join(ROOT_DIR, 'tools', 'finance-dashboard');
const FINANCE_DIR = path.join(ROOT_DIR, '.finance');
const RECURRING_PATH = path.join(FINANCE_DIR, 'recurring-expenses.json');
const CARD_LABELS_PATH = path.join(FINANCE_DIR, 'card-labels.json');
const INVOICE_DB_PATH = path.join(FINANCE_DIR, 'invoice-studio', 'invoices.db');
const DEFAULT_PORT = 3191;
const MAX_BODY_BYTES = 50_000;
const PRIVATE_PAYEE_NAMES_EXCLUDED_FROM_WAWCO_DASHBOARD = new Set([
  'noah glynn',
  'noah glenn',
]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const eq = token.indexOf('=');
    const key = token.slice(2, eq === -1 ? undefined : eq);
    const next = eq === -1 ? argv[i + 1] : token.slice(eq + 1);
    const isBoolean = eq === -1 && (next === undefined || next.startsWith('--'));
    args[key] = isBoolean ? true : next;
    if (!isBoolean && eq === -1) i += 1;
  }
  return args;
}

function expandHome(value) {
  return String(value).replace(/^~(?=$|\/)/, os.homedir());
}

function isLoopbackHost(host) {
  const value = String(host || '').toLowerCase();
  return value === 'localhost' || value === '::1' || value === '[::1]' || value === '127.0.0.1' || /^127\.\d+\.\d+\.\d+$/.test(value);
}

function requestHostname(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (raw.includes('://')) {
    try {
      return new URL(raw).hostname;
    } catch {
      return '';
    }
  }
  if (raw.startsWith('[')) {
    const close = raw.indexOf(']');
    return close === -1 ? raw : raw.slice(1, close);
  }
  return raw.split(':')[0];
}

function assertSafeHost(host, allowNetwork) {
  if (isLoopbackHost(host)) return;
  if (allowNetwork) return;
  throw new Error(`Refusing to bind to ${host}. Use --allow-network only after this local finance dashboard has an auth layer or a private network reason.`);
}

function assertLocalRequest(req, allowNetwork) {
  if (allowNetwork) return;
  const host = requestHostname(req.headers.host || '');
  if (host && !isLoopbackHost(host)) {
    throw makeHttpError(403, 'Host is not loopback. Restart with --allow-network only if this should be reachable beyond this machine.');
  }
  const origin = req.headers.origin;
  if (origin && !isLoopbackHost(requestHostname(origin))) {
    throw makeHttpError(403, 'Origin is not loopback.');
  }
}

function makeHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function safeReadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { ...fallback, error: error.message };
  }
}

function parseJsonDocuments(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Mercury CLI can emit multiple top-level JSON documents. Continue with a scanner.
  }

  const values = [];
  let index = 0;
  while (index < trimmed.length) {
    while (index < trimmed.length && /\s/.test(trimmed[index])) index += 1;
    if (index >= trimmed.length) break;

    const start = index;
    let depth = 0;
    let inString = false;
    let escape = false;

    for (; index < trimmed.length; index += 1) {
      const ch = trimmed[index];
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
    }

    const chunk = trimmed.slice(start, index).trim();
    if (!chunk) continue;
    const parsed = JSON.parse(chunk);
    if (Array.isArray(parsed)) values.push(...parsed);
    else values.push(parsed);
  }
  return values;
}

function readJsonDocuments(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseJsonDocuments(fs.readFileSync(filePath, 'utf8'));
}

function centsFromAmount(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,\s]/g, ''));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }
  if (typeof value === 'object') {
    if (value.cents !== undefined) return Math.round(Number(value.cents) || 0);
    for (const key of ['amount', 'value']) {
      if (value[key] !== undefined) return centsFromAmount(value[key]);
    }
  }
  return 0;
}

function centsFromStored(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function nullableStoredCents(value, label) {
  if (value === undefined || value === null || value === '') return { value: null, error: '' };
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return { value: Math.round(parsed), error: '' };
  return { value: null, error: `${label} is not a valid cent amount.` };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isoDate(value) {
  const text = String(value || '');
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function monthFromDate(value) {
  const date = isoDate(value);
  return date ? date.slice(0, 7) : '';
}

function cleanLabel(value, fallback = 'Unknown') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function dashboardPayeeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPrivatePayeeInvoiceExcludedFromWawcoDashboard(invoice) {
  const from = invoice?.from || {};
  const candidates = [from.name, from.company].map(dashboardPayeeKey).filter(Boolean);
  return candidates.some((candidate) => PRIVATE_PAYEE_NAMES_EXCLUDED_FROM_WAWCO_DASHBOARD.has(candidate));
}

function maybeDetailsMerchant(details) {
  if (!details || typeof details !== 'object') return '';
  const card = details.creditCardInfo || details.cardInfo || {};
  return card.merchantName || card.merchant || card.description || '';
}

function transactionCounterparty(tx) {
  return cleanLabel(
    tx.counterpartyNickname ||
    tx.counterpartyName ||
    maybeDetailsMerchant(tx.details) ||
    tx.bankDescription ||
    tx.externalMemo,
    'Unknown counterparty',
  );
}

function transactionCategory(tx, categoriesById) {
  const id = tx.categoryId || tx.mercuryCategoryId || tx.category?.id || tx.mercuryCategory?.id;
  if (id && categoriesById.get(String(id))) return categoriesById.get(String(id)).name;
  return cleanLabel(tx.mercuryCategory || tx.category?.name || tx.kind, 'Uncategorized');
}

function discoverMercurySnapshots(baseDir = FINANCE_DIR) {
  const candidates = [];
  const roots = [path.join(baseDir, 'snapshots'), baseDir];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith('mercury-') && !entry.name.startsWith('snapshot-')) continue;
      const dir = path.join(root, entry.name);
      const manifestPath = path.join(dir, 'manifest.json');
      const stat = fs.existsSync(manifestPath) ? fs.statSync(manifestPath) : fs.statSync(dir);
      const manifest = safeReadJson(manifestPath, {});
      candidates.push({
        dir,
        manifestPath: fs.existsSync(manifestPath) ? manifestPath : '',
        generatedAt: manifest.generatedAt || stat.mtime.toISOString(),
        mtimeMs: stat.mtimeMs,
      });
    }
  }
  return candidates.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime() || b.mtimeMs - a.mtimeMs);
}

function readMercurySnapshot(snapshotDir) {
  if (!snapshotDir) {
    const [latest] = discoverMercurySnapshots();
    snapshotDir = latest?.dir || '';
  }
  if (!snapshotDir) {
    return { snapshotDir: '', generatedAt: '', accounts: [], transactions: [], invoices: [], customers: [], categories: [], errors: ['No Mercury snapshot found.'] };
  }
  const resolvedDir = path.resolve(expandHome(snapshotDir));
  const manifestPath = path.join(resolvedDir, 'manifest.json');
  const manifest = safeReadJson(manifestPath, {});
  const categories = readJsonDocuments(path.join(resolvedDir, 'categories.json'));
  return {
    snapshotDir: resolvedDir,
    manifestPath: fs.existsSync(manifestPath) ? manifestPath : '',
    generatedAt: manifest.generatedAt || '',
    accounts: readJsonDocuments(path.join(resolvedDir, 'accounts.json')),
    cards: readJsonDocuments(path.join(resolvedDir, 'cards.json')),
    transactions: readJsonDocuments(path.join(resolvedDir, 'transactions.json')),
    invoices: readJsonDocuments(path.join(resolvedDir, 'invoices.json')),
    customers: readJsonDocuments(path.join(resolvedDir, 'customers.json')),
    categories,
    errors: Array.isArray(manifest.errors) ? manifest.errors : [],
  };
}

function groupSum(items, keyFn, amountFn) {
  const grouped = new Map();
  for (const item of items) {
    const key = cleanLabel(keyFn(item));
    const amount = amountFn(item);
    const prior = grouped.get(key) || { label: key, amountCents: 0, count: 0 };
    prior.amountCents += amount;
    prior.count += 1;
    grouped.set(key, prior);
  }
  return [...grouped.values()].sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents));
}

function accountBalance(account, key) {
  return centsFromAmount(account[key]);
}

function normalizeCards(rawCards) {
  const cards = [];
  for (const entry of rawCards || []) {
    if (entry && Array.isArray(entry.cards)) {
      for (const card of entry.cards) {
        cards.push({
          ...card,
          accountId: entry.accountId || card.accountId || '',
          accountName: entry.accountName || card.accountName || '',
        });
      }
    } else if (entry && typeof entry === 'object') {
      cards.push(entry);
    }
  }
  return cards;
}

function cardLastFour(card) {
  return cleanLabel(card.lastFourDigits || card.last4 || card.lastFour || '', '');
}

function baseCardLabel(card) {
  const lastFour = cardLastFour(card);
  const type = cleanLabel(card.type, 'card');
  return lastFour ? `${type} ••${lastFour}` : type;
}

function cardPaymentLastFour(paymentMethod) {
  const match = String(paymentMethod || '').match(/(\d{4})\s*$/);
  return match ? match[1] : '';
}

function normalizePaymentMethodLabel(value) {
  const label = cleanLabel(value, '');
  return label ? label.replace(/•+/g, '••') : '';
}

function dateMs(date) {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysBetween(startDate, endDate) {
  const start = dateMs(startDate);
  const end = dateMs(endDate);
  if (!start || !end) return null;
  return Math.round((end - start) / 86_400_000);
}

function isCardExpense(tx) {
  return tx.amountCents < 0 && (tx.cardPaymentMethod || /creditCardTransaction/i.test(tx.kind));
}

function observedMerchantLabel(tx) {
  if (/^paddle$/i.test(tx.counterparty) && /dataforseo/i.test(tx.bankDescription || '')) return 'DataForSEO via Paddle';
  return tx.counterparty;
}

function isLikelyPersonalFundingTransfer(tx) {
  const haystack = [tx.counterparty, tx.bankDescription, tx.externalMemo, tx.kind].join(' ');
  return tx.amountCents > 0 && /externalTransfer/i.test(tx.kind) && /\bally\b|\ballied\b/i.test(haystack);
}

function fundingTransferLabel(tx) {
  if (/\bally\b/i.test(tx.counterparty)) return 'Ally transfer';
  if (/\ballied\b/i.test(tx.counterparty)) return 'Allied transfer';
  return `${tx.counterparty} transfer`;
}

function batchKey(date) {
  return date || 'unknown-date';
}

function summarizeObservedCardExpenses(monthTransactions) {
  const cardExpenses = monthTransactions.filter(isCardExpense).sort((a, b) => String(a.date).localeCompare(String(b.date)) || Math.abs(b.amountCents) - Math.abs(a.amountCents));
  const fundingTransfers = monthTransactions.filter(isLikelyPersonalFundingTransfer).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const batchesByKey = new Map();

  for (const tx of cardExpenses) {
    const key = batchKey(tx.date);
    const batch = batchesByKey.get(key) || {
      key,
      date: tx.date,
      cardLabel: tx.cardLabel || tx.cardPaymentMethod || tx.kind,
      amountCents: 0,
      expenses: [],
      fundingMatch: null,
    };
    batch.amountCents += Math.abs(tx.amountCents);
    batch.expenses.push(tx.id);
    batchesByKey.set(key, batch);
  }

  const usedFunding = new Set();
  const batches = [...batchesByKey.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)) || b.amountCents - a.amountCents);
  for (const batch of batches) {
    const candidates = fundingTransfers
      .map((transfer, index) => ({ transfer, index, days: daysBetween(batch.date, transfer.date), deltaCents: Math.abs(transfer.amountCents - batch.amountCents) }))
      .filter((item) => !usedFunding.has(item.index) && item.days !== null && item.days >= 0 && item.days <= 10)
      .sort((a, b) => a.deltaCents - b.deltaCents || a.days - b.days);
    const exact = candidates.find((item) => item.deltaCents === 0);
    const similar = candidates.find((item) => item.deltaCents <= Math.max(200, Math.round(batch.amountCents * 0.05)));
    const match = exact || similar || null;
    if (match) {
      usedFunding.add(match.index);
      batch.fundingMatch = {
        date: match.transfer.date,
        amountCents: match.transfer.amountCents,
        counterparty: match.transfer.counterparty,
        label: fundingTransferLabel(match.transfer),
        daysAfter: match.days,
        deltaCents: match.deltaCents,
        confidence: match.deltaCents === 0 ? 'exact batch match' : 'nearby similar amount',
      };
    }
  }

  const batchesByExpenseId = new Map();
  for (const batch of batches) {
    for (const id of batch.expenses) batchesByExpenseId.set(id, batch);
  }

  const expenses = cardExpenses.map((tx) => {
    const batch = batchesByExpenseId.get(tx.id);
    const match = batch?.fundingMatch || null;
    const fundingDetail = match
      ? `${match.confidence}: ${match.label} ${formatCurrency(match.amountCents)} on ${match.date}${match.daysAfter ? ` (+${match.daysAfter}d)` : ''}`
      : 'No nearby Ally/Allied transfer found in this snapshot.';
    return {
      id: tx.id,
      date: tx.date,
      merchant: observedMerchantLabel(tx),
      counterparty: tx.counterparty,
      category: tx.category,
      kind: tx.kind,
      cardLabel: tx.cardLabel || tx.cardPaymentMethod || '',
      descriptor: cleanLabel(tx.bankDescription, ''),
      amountCents: Math.abs(tx.amountCents),
      possiblePersonalFunding: Boolean(match),
      fundingDetail,
      fundingMatch: match,
    };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.amountCents - a.amountCents);

  const possiblePersonalFundedCents = batches
    .filter((batch) => batch.fundingMatch)
    .reduce((sum, batch) => sum + batch.amountCents, 0);
  const totalExpenseCents = expenses.reduce((sum, tx) => sum + tx.amountCents, 0);

  return {
    expenses,
    batches: batches.map((batch) => ({
      date: batch.date,
      cardLabel: batch.cardLabel,
      amountCents: batch.amountCents,
      expenseCount: batch.expenses.length,
      fundingMatch: batch.fundingMatch,
    })).sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.amountCents - a.amountCents),
    fundingTransfers: fundingTransfers.map((transfer) => ({
      id: transfer.id,
      date: transfer.date,
      counterparty: transfer.counterparty,
      amountCents: transfer.amountCents,
    })).sort((a, b) => String(b.date).localeCompare(String(a.date))),
    totalExpenseCents,
    possiblePersonalFundedCents,
    unmatchedExpenseCents: Math.max(0, totalExpenseCents - possiblePersonalFundedCents),
  };
}

function cardLabelFor(card, cardLabels) {
  const byId = cardLabels?.byCardId || new Map();
  const byLastFour = cardLabels?.byLastFour || new Map();
  const id = card.cardId || card.id || '';
  const lastFour = cardLastFour(card);
  const label = (id && byId.get(id)) || (lastFour && byLastFour.get(lastFour)) || null;
  if (label?.label) return label.label;
  return baseCardLabel(card);
}

function cardLabelMetaFor(card, cardLabels) {
  const byId = cardLabels?.byCardId || new Map();
  const byLastFour = cardLabels?.byLastFour || new Map();
  const id = card.cardId || card.id || '';
  const lastFour = cardLastFour(card);
  return (id && byId.get(id)) || (lastFour && byLastFour.get(lastFour)) || null;
}

function summarizeMercury(snapshot, selectedMonth, cardLabels = null) {
  const categoriesById = new Map(snapshot.categories.map((category) => [String(category.id), category]));
  const rawCards = normalizeCards(snapshot.cards || []);
  const cards = rawCards.map((card) => {
    const meta = cardLabelMetaFor(card, cardLabels);
    return {
    id: card.cardId || card.id || '',
    label: cardLabelFor(card, cardLabels),
    baseLabel: baseCardLabel(card),
    customLabel: Boolean(meta?.label),
    purpose: cleanLabel(meta?.purpose, ''),
    expectedMerchants: Array.isArray(meta?.expectedMerchants) ? meta.expectedMerchants.map((item) => cleanLabel(item, '')).filter(Boolean) : [],
    nameOnCard: cleanLabel(card.nameOnCard, ''),
    lastFourDigits: cardLastFour(card),
    network: cleanLabel(card.network, ''),
    status: cleanLabel(card.status, 'unknown'),
    type: cleanLabel(card.type, ''),
    accountName: cleanLabel(card.accountName, ''),
    spendLimit: card.spendLimit || null,
    createdAt: isoDate(card.createdAt),
    updatedAt: isoDate(card.updatedAt),
  };
  });
  const cardsByLastFour = new Map(cards.filter((card) => card.lastFourDigits).map((card) => [card.lastFourDigits, card]));
  const transactions = snapshot.transactions.map((tx) => {
    const amountCents = centsFromAmount(tx.amount);
    const date = isoDate(tx.postedAt || tx.createdAt);
    const cardPaymentMethod = normalizePaymentMethodLabel(tx.details?.creditCardInfo?.paymentMethod || '');
    const cardMatch = cardsByLastFour.get(cardPaymentLastFour(cardPaymentMethod));
    return {
      id: tx.id || '',
      date,
      month: monthFromDate(date),
      amountCents,
      direction: amountCents < 0 ? 'out' : 'in',
      absoluteAmountCents: Math.abs(amountCents),
      status: cleanLabel(tx.status, 'unknown'),
      kind: cleanLabel(tx.kind, 'unknown'),
      counterparty: transactionCounterparty(tx),
      category: transactionCategory(tx, categoriesById),
      bankDescription: cleanLabel(tx.bankDescription, ''),
      externalMemo: cleanLabel(tx.externalMemo, ''),
      cardPaymentMethod,
      cardLabel: cardMatch ? cardMatch.label : cardPaymentMethod,
      cardMatched: Boolean(cardMatch),
    };
  });

  const snapshotMonths = [...new Set(transactions.map((tx) => tx.month).filter(Boolean))].sort();
  const month = selectedMonth || latestMonth(snapshotMonths) || new Date().toISOString().slice(0, 7);
  const monthTransactions = transactions.filter((tx) => tx.month === month);
  const inflowCents = monthTransactions.filter((tx) => tx.amountCents > 0).reduce((sum, tx) => sum + tx.amountCents, 0);
  const outflowCents = monthTransactions.filter((tx) => tx.amountCents < 0).reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0);

  const accounts = snapshot.accounts.map((account) => ({
    id: account.id || '',
    name: cleanLabel(account.name || account.legalBusinessName, 'Unnamed account'),
    type: cleanLabel(account.type || account.kind, ''),
    status: cleanLabel(account.status, ''),
    availableBalanceCents: accountBalance(account, 'availableBalance'),
    currentBalanceCents: accountBalance(account, 'currentBalance'),
  }));
  const cardTransactions = monthTransactions.filter((tx) => tx.cardPaymentMethod || /creditCardTransaction/i.test(tx.kind));
  const cardSpend = groupSum(cardTransactions.filter((tx) => tx.amountCents < 0), (tx) => tx.cardLabel || tx.cardPaymentMethod || tx.kind, (tx) => Math.abs(tx.amountCents));
  const observedCardExpenses = summarizeObservedCardExpenses(monthTransactions);

  const mercuryInvoices = snapshot.invoices.map((invoice) => ({
    id: invoice.id || '',
    invoiceNumber: cleanLabel(invoice.invoiceNumber || invoice.slug, 'Invoice'),
    status: cleanLabel(invoice.status, 'unknown'),
    invoiceDate: isoDate(invoice.invoiceDate || invoice.createdAt),
    dueDate: isoDate(invoice.dueDate),
    month: monthFromDate(invoice.invoiceDate || invoice.createdAt),
    amountCents: centsFromAmount(invoice.amount),
  }));

  return {
    month,
    snapshot: {
      dir: snapshot.snapshotDir,
      manifestPath: snapshot.manifestPath || '',
      generatedAt: snapshot.generatedAt || '',
      errors: snapshot.errors,
    },
    accounts,
    cards,
    activeCards: cards.filter((card) => card.status.toLowerCase() === 'active'),
    totalAvailableBalanceCents: accounts.reduce((sum, account) => sum + account.availableBalanceCents, 0),
    totalCurrentBalanceCents: accounts.reduce((sum, account) => sum + account.currentBalanceCents, 0),
    snapshotMonths,
    transactionCount: monthTransactions.length,
    inflowCents,
    outflowCents,
    netCents: inflowCents - outflowCents,
    spendByCounterparty: groupSum(monthTransactions.filter((tx) => tx.amountCents < 0), (tx) => tx.counterparty, (tx) => Math.abs(tx.amountCents)).slice(0, 12),
    spendByKind: groupSum(monthTransactions.filter((tx) => tx.amountCents < 0), (tx) => tx.kind, (tx) => Math.abs(tx.amountCents)),
    spendByCategory: groupSum(monthTransactions.filter((tx) => tx.amountCents < 0), (tx) => tx.category, (tx) => Math.abs(tx.amountCents)),
    cardSpend,
    cardSpendCents: cardSpend.reduce((sum, item) => sum + item.amountCents, 0),
    cardTransactions,
    observedCardExpenses,
    recentTransactions: [...monthTransactions]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 30),
    invoices: mercuryInvoices,
    invoiceSummary: summarizeStatuses(mercuryInvoices, (invoice) => invoice.amountCents),
  };
}

function summarizeStatuses(items, amountFn) {
  const groups = new Map();
  for (const item of items) {
    const key = cleanLabel(item.status, 'unknown');
    const group = groups.get(key) || { status: key, count: 0, amountCents: 0 };
    group.count += 1;
    group.amountCents += amountFn(item);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.amountCents - a.amountCents);
}

function latestMonth(months) {
  return months.filter(Boolean).sort().at(-1) || '';
}

function readLocalInvoiceStudio(dbPath = INVOICE_DB_PATH) {
  if (!fs.existsSync(dbPath)) {
    return { dbPath, available: false, invoices: [], error: '' };
  }
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db.prepare(`
        SELECT id, invoice_number, status, client_label, invoice_date, due_date, total_cents, updated_at, data_json
        FROM invoices
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC
      `).all();
      let excludedPrivatePayeeCount = 0;
      const invoices = [];
      for (const row of rows) {
        let storedInvoice = null;
        try {
          storedInvoice = JSON.parse(row.data_json);
        } catch {
          storedInvoice = null;
        }
        if (storedInvoice && isPrivatePayeeInvoiceExcludedFromWawcoDashboard(storedInvoice)) {
          excludedPrivatePayeeCount += 1;
          continue;
        }
        invoices.push({
          id: row.id,
          invoiceNumber: row.invoice_number,
          status: row.status,
          clientLabel: row.client_label || 'Untitled client',
          invoiceDate: row.invoice_date || '',
          dueDate: row.due_date || '',
          month: monthFromDate(row.invoice_date),
          amountCents: centsFromStored(row.total_cents),
          updatedAt: row.updated_at || '',
        });
      }
      return { dbPath, available: true, invoices, excludedPrivatePayeeCount, error: '' };
    } finally {
      db.close();
    }
  } catch (error) {
    return { dbPath, available: false, invoices: [], error: error.message };
  }
}

function readRecurringCosts(filePath = RECURRING_PATH) {
  const exists = fs.existsSync(filePath);
  const fallback = { updatedAt: '', items: [], observations: [], notes: [] };
  let data = fallback;
  let parseError = '';

  if (exists) {
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!isPlainObject(data)) {
        parseError = 'Recurring costs file must contain a JSON object.';
        data = fallback;
      }
    } catch (error) {
      parseError = error.message;
      data = fallback;
    }
  }

  const validationWarnings = [];
  if (exists && !parseError && !Array.isArray(data.items)) {
    validationWarnings.push('Recurring costs file has no items array.');
  }

  const items = Array.isArray(data.items) ? data.items.map((item, index) => {
    const source = isPlainObject(item) ? item : {};
    if (!isPlainObject(item)) validationWarnings.push(`Recurring item ${index + 1} is not an object.`);
    const expected = nullableStoredCents(source.expectedMonthlyCents, `Recurring item ${index + 1} expectedMonthlyCents`);
    const lastObserved = nullableStoredCents(source.lastObservedChargeCents, `Recurring item ${index + 1} lastObservedChargeCents`);
    if (expected.error) validationWarnings.push(expected.error);
    if (lastObserved.error) validationWarnings.push(lastObserved.error);
    const cadence = cleanLabel(source.cadence, 'monthly');
    if (!['monthly', 'monthly-normalized'].includes(cadence.toLowerCase())) {
      validationWarnings.push(`Recurring item ${index + 1} has cadence "${cadence}"; expectedMonthlyCents must be monthly-normalized.`);
    }

    return {
      id: cleanLabel(source.id || source.name, 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: cleanLabel(source.name, 'Untitled cost'),
      vendor: cleanLabel(source.vendor || source.name, 'Unknown vendor'),
      category: cleanLabel(source.category, 'Uncategorized'),
      plan: cleanLabel(source.plan, ''),
      cadence,
      expectedMonthlyCents: expected.value,
      lastObservedChargeCents: lastObserved.value,
      nextRenewalDate: isoDate(source.nextRenewalDate || source.nextRenewal || ''),
      unitCount: source.unitCount === null || source.unitCount === undefined || source.unitCount === '' ? null : Number(source.unitCount),
      unitLabel: cleanLabel(source.unitLabel, ''),
      status: cleanLabel(source.status, 'draft'),
      expenseTiming: cleanLabel(source.expenseTiming, ''),
      paymentSource: cleanLabel(source.paymentSource, ''),
      confidence: cleanLabel(source.confidence, ''),
      source: cleanLabel(source.source, ''),
      notes: cleanLabel(source.notes, ''),
      active: source.active !== false,
    };
  }) : [];

  return {
    path: filePath,
    fileExists: exists,
    updatedAt: data.updatedAt || '',
    items,
    observations: Array.isArray(data.observations) ? data.observations : [],
    notes: Array.isArray(data.notes) ? data.notes : [],
    error: parseError,
    validationWarnings,
  };
}

function isTentativeFutureCost(item) {
  const timing = String(item.expenseTiming || '').toLowerCase();
  const status = String(item.status || '').toLowerCase();
  const source = String(item.paymentSource || '').toLowerCase();
  return timing.includes('future') || status.includes('future') || status.includes('tentative') || source.includes('personal');
}

function summarizeRecurring(costs) {
  const active = costs.items.filter((item) => item.active !== false);
  const known = active.filter((item) => typeof item.expectedMonthlyCents === 'number');
  const unknown = active.filter((item) => typeof item.expectedMonthlyCents !== 'number');
  const tentative = known.filter(isTentativeFutureCost);
  const current = known.filter((item) => !isTentativeFutureCost(item));
  const byCategory = groupSum(known, (item) => item.category, (item) => item.expectedMonthlyCents);
  const monthlyCents = known.reduce((sum, item) => sum + item.expectedMonthlyCents, 0);
  const currentMonthlyCents = current.reduce((sum, item) => sum + item.expectedMonthlyCents, 0);
  const tentativeMonthlyCents = tentative.reduce((sum, item) => sum + item.expectedMonthlyCents, 0);
  return {
    path: costs.path,
    fileExists: costs.fileExists,
    updatedAt: costs.updatedAt,
    monthlyCents,
    currentMonthlyCents,
    tentativeMonthlyCents,
    knownCount: known.length,
    unknownCount: unknown.length,
    tentativeCount: tentative.length,
    byCategory,
    items: active.sort((a, b) => (b.expectedMonthlyCents || 0) - (a.expectedMonthlyCents || 0)),
    observations: costs.observations,
    notes: costs.notes,
    error: costs.error,
    validationWarnings: costs.validationWarnings || [],
  };
}

function readCardLabels(filePath = CARD_LABELS_PATH) {
  const exists = fs.existsSync(filePath);
  const fallback = { updatedAt: '', labels: [], notes: [] };
  let data = fallback;
  let parseError = '';
  const validationWarnings = [];

  if (exists) {
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!isPlainObject(data)) {
        parseError = 'Card labels file must contain a JSON object.';
        data = fallback;
      }
    } catch (error) {
      parseError = error.message;
      data = fallback;
    }
  }

  if (exists && !parseError && !Array.isArray(data.labels)) {
    validationWarnings.push('Card labels file has no labels array.');
  }

  const labels = Array.isArray(data.labels) ? data.labels.map((item, index) => {
    const source = isPlainObject(item) ? item : {};
    if (!isPlainObject(item)) validationWarnings.push(`Card label ${index + 1} is not an object.`);
    return {
      cardId: cleanLabel(source.cardId, ''),
      lastFourDigits: cleanLabel(source.lastFourDigits, ''),
      label: cleanLabel(source.label, ''),
      purpose: cleanLabel(source.purpose, ''),
      expectedMerchants: Array.isArray(source.expectedMerchants) ? source.expectedMerchants.map((merchant) => cleanLabel(merchant, '')).filter(Boolean) : [],
      notes: cleanLabel(source.notes, ''),
      active: source.active !== false,
    };
  }).filter((label) => label.active !== false) : [];

  const byCardId = new Map();
  const byLastFour = new Map();
  for (const label of labels) {
    if (label.cardId) byCardId.set(label.cardId, label);
    if (label.lastFourDigits) byLastFour.set(label.lastFourDigits, label);
  }

  return {
    path: filePath,
    fileExists: exists,
    updatedAt: data.updatedAt || '',
    labels,
    byCardId,
    byLastFour,
    notes: Array.isArray(data.notes) ? data.notes : [],
    error: parseError,
    validationWarnings,
  };
}

function availableMonths(mercury, localInvoices, recurring) {
  const months = new Set();
  for (const tx of mercury.recentTransactions || []) if (tx.month) months.add(tx.month);
  for (const invoice of localInvoices.invoices || []) if (invoice.month) months.add(invoice.month);
  for (const item of recurring.items || []) if (item.nextRenewalDate) months.add(item.nextRenewalDate.slice(0, 7));
  const snapshots = readMercurySnapshot();
  for (const tx of snapshots.transactions || []) {
    const month = monthFromDate(tx.postedAt || tx.createdAt);
    if (month) months.add(month);
  }
  return [...months].sort();
}

function buildSummary(options = {}) {
  const snapshot = readMercurySnapshot(options.snapshotDir);
  const recurring = readRecurringCosts(options.recurringPath || RECURRING_PATH);
  const cardLabels = readCardLabels(options.cardLabelsPath || CARD_LABELS_PATH);
  const selectedMonth = options.month || '';
  const mercury = summarizeMercury(snapshot, selectedMonth, cardLabels);
  const localInvoices = readLocalInvoiceStudio(options.invoiceDbPath || INVOICE_DB_PATH);
  const month = selectedMonth || mercury.month;
  const localMonthInvoices = localInvoices.invoices.filter((invoice) => !month || invoice.month === month);
  const localInvoiceSummary = summarizeStatuses(localInvoices.invoices, (invoice) => invoice.amountCents);
  const localMonthInvoiceSummary = summarizeStatuses(localMonthInvoices, (invoice) => invoice.amountCents);
  const recurringSummary = summarizeRecurring(recurring);
  const exceptions = [];

  if (snapshot.errors.length) exceptions.push({ severity: 'watch', label: 'Mercury snapshot reported errors', detail: `${snapshot.errors.length} command error(s) in manifest.` });
  if (!snapshot.snapshotDir) exceptions.push({ severity: 'watch', label: 'No Mercury snapshot found', detail: 'Run the read-only snapshot command before using live spend metrics.' });
  if (selectedMonth && mercury.snapshotMonths.length && !mercury.snapshotMonths.includes(month)) exceptions.push({ severity: 'watch', label: 'Selected month absent from Mercury snapshot', detail: `${month} is not present in the active Mercury snapshot. Refresh or choose a covered month before relying on cash movement.` });
  if (!recurringSummary.fileExists) exceptions.push({ severity: 'watch', label: 'Recurring costs file missing', detail: 'Create .finance/recurring-expenses.json to forecast expected monthly stack costs.' });
  if (recurringSummary.error) exceptions.push({ severity: 'watch', label: 'Recurring costs file could not be parsed', detail: recurringSummary.error });
  for (const warning of recurringSummary.validationWarnings || []) exceptions.push({ severity: 'watch', label: 'Recurring costs need cleanup', detail: warning });
  if (recurringSummary.unknownCount) exceptions.push({ severity: 'watch', label: 'Recurring costs need verification', detail: `${recurringSummary.unknownCount} active recurring cost(s) have no monthly amount yet.` });
  if (cardLabels.error) exceptions.push({ severity: 'watch', label: 'Card labels file could not be parsed', detail: cardLabels.error });
  for (const warning of cardLabels.validationWarnings || []) exceptions.push({ severity: 'watch', label: 'Card labels need cleanup', detail: warning });
  if (mercury.activeCards.length && !cardLabels.fileExists) exceptions.push({ severity: 'watch', label: 'Card labels need setup', detail: 'Create .finance/card-labels.json to turn masked Mercury cards into service labels.' });
  const unlabeledActiveCards = mercury.activeCards.filter((card) => !card.customLabel).length;
  if (unlabeledActiveCards) exceptions.push({ severity: 'watch', label: 'Active cards missing labels', detail: `${unlabeledActiveCards} active card(s) need a local service label.` });
  if (localInvoices.error) exceptions.push({ severity: 'watch', label: 'Invoice studio DB unavailable', detail: localInvoices.error });
  const uncategorized = mercury.spendByCategory.find((item) => /uncategorized|unknown/i.test(item.label));
  if (uncategorized && uncategorized.amountCents > 0) exceptions.push({ severity: 'watch', label: 'Uncategorized Mercury spend', detail: `${formatCurrency(uncategorized.amountCents)} needs review in ${month}.` });

  return {
    generatedAt: new Date().toISOString(),
    month,
    sources: {
      recurringPath: recurring.path,
      cardLabelsPath: cardLabels.path,
      invoiceDbPath: localInvoices.dbPath,
      mercurySnapshotDir: snapshot.snapshotDir,
      mercuryManifestPath: snapshot.manifestPath,
    },
    metrics: {
      totalAvailableBalanceCents: mercury.totalAvailableBalanceCents,
      totalCurrentBalanceCents: mercury.totalCurrentBalanceCents,
      inflowCents: mercury.inflowCents,
      outflowCents: mercury.outflowCents,
      netCents: mercury.netCents,
      recurringKnownMonthlyCents: recurringSummary.monthlyCents,
      recurringCurrentMonthlyCents: recurringSummary.currentMonthlyCents,
      recurringTentativeMonthlyCents: recurringSummary.tentativeMonthlyCents,
      recurringUnknownCount: recurringSummary.unknownCount,
      recurringTentativeCount: recurringSummary.tentativeCount,
      activeCardCount: mercury.activeCards.length,
      activeCardLabelCount: mercury.activeCards.filter((card) => card.customLabel).length,
      cardSpendCents: mercury.cardSpendCents,
      cardExpenseCount: mercury.observedCardExpenses.expenses.length,
      possiblePersonalFundedCardCents: mercury.observedCardExpenses.possiblePersonalFundedCents,
      unmatchedCardExpenseCents: mercury.observedCardExpenses.unmatchedExpenseCents,
      localInvoiceOpenCents: localInvoices.invoices
        .filter((invoice) => !['paid', 'void'].includes(String(invoice.status).toLowerCase()))
        .reduce((sum, invoice) => sum + invoice.amountCents, 0),
      mercuryInvoiceOpenCents: mercury.invoices
        .filter((invoice) => !['paid', 'void', 'canceled', 'cancelled'].includes(String(invoice.status).toLowerCase()))
        .reduce((sum, invoice) => sum + invoice.amountCents, 0),
      transactionCount: mercury.transactionCount,
    },
    mercury,
    recurring: recurringSummary,
    localInvoices: {
      ...localInvoices,
      monthInvoices: localMonthInvoices,
      summary: localInvoiceSummary,
      monthSummary: localMonthInvoiceSummary,
    },
    exceptions,
  };
}

function formatCurrency(cents) {
  const value = (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return value;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

function serveStatic(res, relativePath) {
  const safePath = path.normalize(relativePath).replace(/^\.\.(?:\/|$)/, '');
  const filePath = path.join(STATIC_DIR, safePath);
  if (!filePath.startsWith(STATIC_DIR)) {
    sendText(res, 404, 'Not found');
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, 'Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': contentTypes.get(path.extname(filePath)) || 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function readBody(req) {
  const contentLength = Number(req.headers['content-length'] || 0);
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentLength > MAX_BODY_BYTES) throw makeHttpError(413, 'Request body is too large.');
  if (contentLength > 0 && !contentType.includes('application/json')) throw makeHttpError(415, 'Expected application/json request body.');
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy(makeHttpError(413, 'Request body is too large.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(makeHttpError(400, 'Expected JSON request body.'));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeRecurringPayloadForWrite(body) {
  if (!isPlainObject(body)) throw makeHttpError(400, 'Expected recurring costs to be a JSON object.');
  const items = body.items === undefined ? [] : body.items;
  if (!Array.isArray(items)) throw makeHttpError(400, 'Expected items to be an array.');
  const observations = body.observations === undefined ? [] : body.observations;
  const notes = body.notes === undefined ? [] : body.notes;
  if (!Array.isArray(observations)) throw makeHttpError(400, 'Expected observations to be an array.');
  if (!Array.isArray(notes)) throw makeHttpError(400, 'Expected notes to be an array.');

  return {
    updatedAt: new Date().toISOString(),
    items: items.map((item, index) => {
      if (!isPlainObject(item)) throw makeHttpError(400, `Recurring item ${index + 1} must be an object.`);
      const expected = nullableStoredCents(item.expectedMonthlyCents, `Recurring item ${index + 1} expectedMonthlyCents`);
      const lastObserved = nullableStoredCents(item.lastObservedChargeCents, `Recurring item ${index + 1} lastObservedChargeCents`);
      if (expected.error) throw makeHttpError(400, expected.error);
      if (lastObserved.error) throw makeHttpError(400, lastObserved.error);
      return {
        id: cleanLabel(item.id || item.name, `item-${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: cleanLabel(item.name, 'Untitled cost'),
        vendor: cleanLabel(item.vendor || item.name, 'Unknown vendor'),
        category: cleanLabel(item.category, 'Uncategorized'),
        plan: cleanLabel(item.plan, ''),
        cadence: cleanLabel(item.cadence, 'monthly'),
        expectedMonthlyCents: expected.value,
        lastObservedChargeCents: lastObserved.value,
        nextRenewalDate: isoDate(item.nextRenewalDate || item.nextRenewal || ''),
        unitCount: item.unitCount === null || item.unitCount === undefined || item.unitCount === '' ? null : Number(item.unitCount),
        unitLabel: cleanLabel(item.unitLabel, ''),
        status: cleanLabel(item.status, 'draft'),
        expenseTiming: cleanLabel(item.expenseTiming, ''),
        paymentSource: cleanLabel(item.paymentSource, ''),
        confidence: cleanLabel(item.confidence, ''),
        source: cleanLabel(item.source, ''),
        notes: cleanLabel(item.notes, ''),
        active: item.active !== false,
      };
    }),
    observations: observations.filter(isPlainObject),
    notes: notes.map((note) => cleanLabel(note, '')).filter(Boolean),
  };
}

function createServer(options = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      assertLocalRequest(req, Boolean(options.allowNetwork));
      if (url.pathname === '/') {
        res.writeHead(302, { location: '/finance' });
        res.end();
        return;
      }
      if (url.pathname === '/finance' || url.pathname === '/finance/') {
        serveStatic(res, 'index.html');
        return;
      }
      if (url.pathname.startsWith('/finance-dashboard/')) {
        serveStatic(res, url.pathname.replace('/finance-dashboard/', ''));
        return;
      }
      if (url.pathname === '/api/health') {
        sendJson(res, 200, { ok: true });
        return;
      }
      if (url.pathname === '/api/months') {
        const summary = buildSummary({ snapshotDir: options.snapshotDir, recurringPath: options.recurringPath, cardLabelsPath: options.cardLabelsPath, invoiceDbPath: options.invoiceDbPath });
        const months = new Set([summary.month, ...(summary.mercury.snapshotMonths || [])]);
        for (const invoice of summary.localInvoices.invoices) if (invoice.month) months.add(invoice.month);
        sendJson(res, 200, { months: [...months].filter(Boolean).sort(), current: summary.month, mercurySnapshotMonths: summary.mercury.snapshotMonths || [] });
        return;
      }
      if (url.pathname === '/api/summary') {
        const month = url.searchParams.get('month') || '';
        sendJson(res, 200, buildSummary({ month, snapshotDir: options.snapshotDir, recurringPath: options.recurringPath, cardLabelsPath: options.cardLabelsPath, invoiceDbPath: options.invoiceDbPath }));
        return;
      }
      if (url.pathname === '/api/recurring' && req.method === 'GET') {
        sendJson(res, 200, readRecurringCosts(options.recurringPath || RECURRING_PATH));
        return;
      }
      if (url.pathname === '/api/recurring' && req.method === 'PUT') {
        if (!options.allowLocalWrites) throw makeHttpError(403, 'Recurring cost edits are disabled. Edit .finance/recurring-expenses.json or restart with --allow-local-writes.');
        const body = await readBody(req);
        const payload = sanitizeRecurringPayloadForWrite(body);
        fs.mkdirSync(path.dirname(options.recurringPath || RECURRING_PATH), { recursive: true });
        fs.writeFileSync(options.recurringPath || RECURRING_PATH, JSON.stringify(payload, null, 2) + '\n');
        sendJson(res, 200, readRecurringCosts(options.recurringPath || RECURRING_PATH));
        return;
      }
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      sendText(res, 404, 'Not found');
    } catch (error) {
      const status = error.status || 500;
      sendJson(res, status, { error: status === 500 ? 'Internal server error.' : error.message });
      if (status === 500) console.error(error);
    }
  });
}

function runSmoke(options = {}) {
  const summary = buildSummary(options);
  if (!summary.generatedAt) throw new Error('Missing generatedAt in summary.');
  if (!summary.sources) throw new Error('Missing sources in summary.');
  if (!Array.isArray(summary.recurring.items)) throw new Error('Recurring items did not normalize.');
  if (summary.recurring.fileExists && summary.recurring.error) throw new Error(`Recurring costs file could not be parsed: ${summary.recurring.error}`);
  if (!Array.isArray(summary.mercury.recentTransactions)) throw new Error('Mercury transactions did not normalize.');
  if (!Array.isArray(summary.exceptions)) throw new Error('Exceptions did not normalize.');
  console.log(JSON.stringify({
    ok: true,
    month: summary.month,
    mercurySnapshotDir: summary.sources.mercurySnapshotDir,
    recurringKnownMonthlyCents: summary.metrics.recurringKnownMonthlyCents,
    recurringUnknownCount: summary.metrics.recurringUnknownCount,
    recurringTentativeCount: summary.metrics.recurringTentativeCount,
    activeCardCount: summary.metrics.activeCardCount,
    activeCardLabelCount: summary.metrics.activeCardLabelCount,
    cardSpendCents: summary.metrics.cardSpendCents,
    cardExpenseCount: summary.metrics.cardExpenseCount,
    possiblePersonalFundedCardCents: summary.metrics.possiblePersonalFundedCardCents,
    transactionCount: summary.metrics.transactionCount,
    localInvoiceCount: summary.localInvoices.invoices.length,
    exceptionCount: summary.exceptions.length,
  }, null, 2));
}

function printHelp() {
  console.log(`WAWCO finance dashboard\n\nUsage:\n  npm run finance\n  npm run finance:smoke\n  node scripts/finance-dashboard.mjs --port 3191\n\nOptions:\n  --host HOST             Bind host. Defaults to 127.0.0.1.\n  --port PORT             Bind port. Defaults to ${DEFAULT_PORT}.\n  --snapshot PATH         Mercury snapshot directory. Defaults to latest .finance snapshot.\n  --recurring PATH        Recurring cost JSON path. Defaults to .finance/recurring-expenses.json.\n  --card-labels PATH      Card label JSON path. Defaults to .finance/card-labels.json.
  --invoice-db PATH       Invoice studio SQLite path. Defaults to .finance/invoice-studio/invoices.db.\n  --allow-network         Permit non-loopback host binding. Not recommended without auth.\n  --allow-local-writes    Enable local PUT /api/recurring writes. No external writes.\n  --smoke                 Build a derived summary and exit.\n  --help                  Show this help.\n\nBoundary:\n  This dashboard reads local ignored finance artifacts only. It does not call Mercury, Stripe, Gmail, Google Workspace, or any external service.\n  Refresh Mercury separately with: npm run mercury -- snapshot --out .finance/snapshots/mercury-$(date -u +%Y%m%dT%H%M%SZ)\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const options = {
    snapshotDir: args.snapshot ? path.resolve(expandHome(args.snapshot)) : '',
    recurringPath: args.recurring ? path.resolve(expandHome(args.recurring)) : RECURRING_PATH,
    cardLabelsPath: args['card-labels'] ? path.resolve(expandHome(args['card-labels'])) : CARD_LABELS_PATH,
    invoiceDbPath: args['invoice-db'] ? path.resolve(expandHome(args['invoice-db'])) : INVOICE_DB_PATH,
    allowNetwork: Boolean(args['allow-network']),
    allowLocalWrites: Boolean(args['allow-local-writes']),
  };
  if (options.allowNetwork && options.allowLocalWrites) {
    throw new Error('Refusing to combine --allow-network with --allow-local-writes without an auth layer.');
  }

  if (args.smoke) {
    runSmoke(options);
    return;
  }

  const host = String(args.host || process.env.FINANCE_DASHBOARD_HOST || '127.0.0.1');
  assertSafeHost(host, options.allowNetwork);
  const port = Number(args.port || process.env.FINANCE_DASHBOARD_PORT || DEFAULT_PORT);
  const server = createServer(options);
  server.listen(port, host, () => {
    console.log('WAWCO finance dashboard');
    console.log(`Local URL: http://${host}:${port}/finance`);
    console.log(`Recurring costs: ${options.recurringPath}`);
    console.log(`Card labels: ${options.cardLabelsPath}`);
    console.log(`Invoice DB: ${options.invoiceDbPath}`);
    console.log('Boundary: local derived metrics only. No Mercury, Stripe, Gmail, Workspace, or external writes.');
    if (!isLoopbackHost(host)) console.log('Network warning: this unauthenticated local tool is reachable beyond this machine.');
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export { buildSummary };

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
