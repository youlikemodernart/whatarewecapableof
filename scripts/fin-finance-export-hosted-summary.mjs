#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  FINANCE_IMPORT_SCHEMA_VERSION,
  FINANCE_IMPORT_VALIDATOR_VERSION,
  fakeFinanceImportSummary,
  normalizeFinanceImport,
} = require('../apps/fin/api/_finance_import.js');

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');
const FINANCE_DIR = path.join(ROOT_DIR, '.finance');
const EXPORT_DIR = path.join(FINANCE_DIR, 'exports');

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
  return String(value || '').replace(/^~(?=$|\/)/, os.homedir());
}

function cleanString(value, fallback = '', max = 160) {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, max);
}

function monthArg(value, fallback = '') {
  const month = cleanString(value, fallback, 7);
  if (month && !/^\d{4}-\d{2}$/.test(month)) throw new Error('--month must use YYYY-MM.');
  return month;
}

function isoDate(value) {
  const text = String(value || '');
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function isoTimestamp(value, fallback = '') {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function cents(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function count(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function titleCase(value, fallback = '') {
  return cleanString(value, fallback).replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeLabel(value, fallback = 'Unknown', max = 160) {
  const label = cleanString(value, fallback, max);
  if (/\b(?:cus|acct|pi|ch|txn|bt|po|in|cs|evt|fee|pyr)_[A-Za-z0-9_]+\b/.test(label)) return fallback;
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(label)) return fallback;
  if (/[•*]\s*\d{2,4}|\b(?:card|visa|mastercard|amex|ending|last\s*four)\b[^\n]{0,24}\b\d{4}\b/i.test(label)) return fallback;
  if (/\/Users\/|\.finance\//i.test(label)) return fallback;
  return label;
}

function resolveFinanceInput(value, flagName) {
  if (!value) return undefined;
  const resolved = path.resolve(expandHome(value));
  const relative = path.relative(FINANCE_DIR, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${flagName} must resolve inside ignored .finance/.`);
  }
  return resolved;
}

function safeCardLabel(card, index) {
  const custom = card && card.customLabel ? safeLabel(card.label, '', 160) : '';
  if (custom && !/[•*]\s*\d{2,4}|\b\d{4}\b/.test(custom)) return custom;
  return `Card ${index + 1}`;
}

function sourceKinds(raw) {
  const kinds = [];
  if (raw.mercury?.snapshot?.generatedAt || raw.mercury?.transactionCount || raw.mercury?.accounts?.length) kinds.push('mercury');
  if (raw.recurring?.fileExists) kinds.push('recurring');
  if (raw.metrics?.activeCardLabelCount) kinds.push('card-labels');
  return kinds.length ? kinds : ['local-derived-summary'];
}

function dateCoverage(raw, month) {
  const dates = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      for (const key of ['date', 'invoiceDate', 'dueDate', 'nextRenewalDate']) {
        const date = isoDate(value[key]);
        if (date) dates.push(date);
      }
    }
  };
  visit(raw.mercury?.cardTransactions || []);
  visit(raw.mercury?.observedCardExpenses?.expenses || []);
  visit(raw.mercury?.recentTransactions || []);
  visit(raw.mercury?.invoices || []);
  visit(raw.recurring?.items || []);
  const inMonth = month ? dates.filter((date) => date.startsWith(month)) : dates;
  const pool = inMonth.length ? inMonth : dates;
  if (!pool.length && month) return { coverageStart: `${month}-01`, coverageEnd: `${month}-28` };
  if (!pool.length) return { coverageStart: '', coverageEnd: '' };
  return { coverageStart: [...pool].sort()[0], coverageEnd: [...pool].sort().at(-1) };
}

function groupRows(rows = [], options = {}) {
  return rows.map((row, index) => ({
    label: options.genericLabels ? `${options.genericPrefix || 'Group'} ${index + 1}` : safeLabel(row.label, 'Unknown'),
    amountCents: cents(row.amountCents),
    count: count(row.count),
  }));
}

function projectFinanceSummary(raw) {
  const month = monthArg(raw.month, new Date().toISOString().slice(0, 7));
  const months = [...new Set([month, ...(raw.mercury?.snapshotMonths || [])].filter((item) => /^\d{4}-\d{2}$/.test(String(item))))].sort();
  const coverage = dateCoverage(raw, month);
  const activeCards = raw.mercury?.activeCards || [];

  const projected = {
    schemaVersion: FINANCE_IMPORT_SCHEMA_VERSION,
    generatedAt: isoTimestamp(raw.generatedAt, new Date().toISOString()),
    month,
    months: months.length ? months : [month],
    label: `WAWCO derived finance summary ${month}`,
    sources: {
      financeSnapshot: 'derived-local-export',
      coverageStart: coverage.coverageStart,
      coverageEnd: coverage.coverageEnd,
      generatedBy: 'local-finance-dashboard-export',
      sourceKinds: sourceKinds(raw),
      validatorVersion: FINANCE_IMPORT_VALIDATOR_VERSION,
    },
    metrics: {
      totalAvailableBalanceCents: cents(raw.metrics?.totalAvailableBalanceCents),
      totalCurrentBalanceCents: cents(raw.metrics?.totalCurrentBalanceCents),
      inflowCents: cents(raw.metrics?.inflowCents),
      outflowCents: cents(raw.metrics?.outflowCents),
      netCents: cents(raw.metrics?.netCents),
      recurringKnownMonthlyCents: cents(raw.metrics?.recurringKnownMonthlyCents),
      recurringCurrentMonthlyCents: cents(raw.metrics?.recurringCurrentMonthlyCents),
      recurringTentativeMonthlyCents: cents(raw.metrics?.recurringTentativeMonthlyCents),
      recurringUnknownCount: count(raw.metrics?.recurringUnknownCount),
      recurringTentativeCount: count(raw.metrics?.recurringTentativeCount),
      activeCardCount: count(raw.metrics?.activeCardCount),
      activeCardLabelCount: count(raw.metrics?.activeCardLabelCount),
      cardSpendCents: cents(raw.metrics?.cardSpendCents),
      cardExpenseCount: count(raw.metrics?.cardExpenseCount),
      possiblePersonalFundedCardCents: cents(raw.metrics?.possiblePersonalFundedCardCents),
      unmatchedCardExpenseCents: cents(raw.metrics?.unmatchedCardExpenseCents),
      transactionCount: count(raw.metrics?.transactionCount),
      mercuryInvoiceOpenCents: 0,
    },
    mercury: {
      month,
      snapshot: {
        generatedAt: isoTimestamp(raw.mercury?.snapshot?.generatedAt || raw.generatedAt, ''),
        errors: (raw.mercury?.snapshot?.errors || []).map((_, index) => `Snapshot command ${index + 1} reported an error.`),
      },
      accounts: (raw.mercury?.accounts || []).map((account, index) => ({
        label: safeLabel(account.type ? `${titleCase(account.type)} account` : `Cash account ${index + 1}`, `Cash account ${index + 1}`),
        type: safeLabel(account.type, ''),
        status: safeLabel(account.status, ''),
        availableBalanceCents: cents(account.availableBalanceCents),
        currentBalanceCents: cents(account.currentBalanceCents),
      })),
      activeCards: activeCards.map((card, index) => ({
        label: safeCardLabel(card, index),
        purpose: safeLabel(card.purpose, '', 240),
        status: safeLabel(card.status, ''),
        type: safeLabel(card.type, ''),
        expectedMerchants: Array.isArray(card.expectedMerchants) ? card.expectedMerchants.map((merchant) => safeLabel(merchant, '')).filter(Boolean) : [],
      })),
      snapshotMonths: months,
      transactionCount: count(raw.mercury?.transactionCount),
      inflowCents: cents(raw.mercury?.inflowCents),
      outflowCents: cents(raw.mercury?.outflowCents),
      netCents: cents(raw.mercury?.netCents),
      spendByCounterparty: groupRows(raw.mercury?.spendByCounterparty || [], { genericLabels: true, genericPrefix: 'Counterparty group' }),
      spendByKind: groupRows(raw.mercury?.spendByKind || []),
      spendByCategory: groupRows(raw.mercury?.spendByCategory || []),
      cardSpend: groupRows((raw.mercury?.cardSpend || []).map((row, index) => ({ ...row, label: /[•*]\s*\d{2,4}|\b\d{4}\b/.test(String(row.label || '')) ? `Card ${index + 1}` : row.label }))),
      cardSpendCents: cents(raw.mercury?.cardSpendCents),
      cardTransactions: (raw.mercury?.cardTransactions || []).map((tx, index) => ({
        date: isoDate(tx.date),
        month: monthArg(tx.month, month),
        amountCents: cents(tx.amountCents),
        direction: tx.direction === 'in' ? 'in' : 'out',
        category: safeLabel(tx.category, 'Uncategorized'),
        kind: safeLabel(tx.kind, ''),
        cardLabel: /[•*]\s*\d{2,4}|\b\d{4}\b/.test(String(tx.cardLabel || '')) ? `Card ${index + 1}` : safeLabel(tx.cardLabel, ''),
      })),
      observedCardExpenses: {
        expenses: (raw.mercury?.observedCardExpenses?.expenses || []).map((expense, index) => ({
          date: isoDate(expense.date),
          merchant: `Card expense ${index + 1}`,
          category: safeLabel(expense.category, 'Uncategorized'),
          kind: safeLabel(expense.kind, ''),
          cardLabel: /[•*]\s*\d{2,4}|\b\d{4}\b/.test(String(expense.cardLabel || '')) ? `Card ${index + 1}` : safeLabel(expense.cardLabel, ''),
          amountCents: cents(expense.amountCents),
          possiblePersonalFunding: expense.possiblePersonalFunding === true,
          fundingDetail: expense.possiblePersonalFunding ? 'Possible personal-funding signal from local derived review.' : 'No nearby personal-funding signal in local derived review.',
        })),
        batches: (raw.mercury?.observedCardExpenses?.batches || []).map((batch, index) => ({
          date: isoDate(batch.date),
          cardLabel: /[•*]\s*\d{2,4}|\b\d{4}\b/.test(String(batch.cardLabel || '')) ? `Card ${index + 1}` : safeLabel(batch.cardLabel, ''),
          amountCents: cents(batch.amountCents),
          expenseCount: count(batch.expenseCount),
          fundingSignal: batch.fundingMatch ? 'possible personal-funding signal' : 'none',
        })),
        fundingTransfers: (raw.mercury?.observedCardExpenses?.fundingTransfers || []).map((transfer) => ({
          date: isoDate(transfer.date),
          label: 'Personal funding signal',
          amountCents: cents(transfer.amountCents),
        })),
        totalExpenseCents: cents(raw.mercury?.observedCardExpenses?.totalExpenseCents),
        possiblePersonalFundedCents: cents(raw.mercury?.observedCardExpenses?.possiblePersonalFundedCents),
        unmatchedExpenseCents: cents(raw.mercury?.observedCardExpenses?.unmatchedExpenseCents),
      },
      recentTransactions: (raw.mercury?.recentTransactions || []).slice(0, 100).map((tx, index) => ({
        date: isoDate(tx.date),
        month: monthArg(tx.month, month),
        direction: tx.direction === 'in' ? 'in' : 'out',
        amountCents: cents(tx.amountCents),
        counterparty: `Transaction ${index + 1}`,
        category: safeLabel(tx.category, 'Uncategorized'),
        kind: safeLabel(tx.kind, ''),
        cardLabel: /[•*]\s*\d{2,4}|\b\d{4}\b/.test(String(tx.cardLabel || '')) ? `Card ${index + 1}` : safeLabel(tx.cardLabel, ''),
      })),
      invoices: (raw.mercury?.invoices || []).map((invoice, index) => ({
        invoiceNumber: `Imported Mercury invoice ${index + 1}`,
        status: safeLabel(invoice.status, 'unknown'),
        invoiceDate: isoDate(invoice.invoiceDate),
        dueDate: isoDate(invoice.dueDate),
        amountCents: cents(invoice.amountCents),
      })),
      invoiceSummary: (raw.mercury?.invoiceSummary || []).map((item) => ({
        status: safeLabel(item.status, 'unknown'),
        count: count(item.count),
        amountCents: cents(item.amountCents),
      })),
    },
    recurring: {
      fileExists: raw.recurring?.fileExists === true,
      updatedAt: isoTimestamp(raw.recurring?.updatedAt, ''),
      monthlyCents: cents(raw.recurring?.monthlyCents),
      currentMonthlyCents: cents(raw.recurring?.currentMonthlyCents),
      tentativeMonthlyCents: cents(raw.recurring?.tentativeMonthlyCents),
      knownCount: count(raw.recurring?.knownCount),
      unknownCount: count(raw.recurring?.unknownCount),
      tentativeCount: count(raw.recurring?.tentativeCount),
      byCategory: groupRows(raw.recurring?.byCategory || []),
      items: (raw.recurring?.items || []).map((item, index) => ({
        name: safeLabel(item.name, `Recurring item ${index + 1}`),
        vendor: safeLabel(item.vendor || item.name, `Vendor ${index + 1}`),
        category: safeLabel(item.category, 'Uncategorized'),
        plan: safeLabel(item.plan, ''),
        expectedMonthlyCents: cents(item.expectedMonthlyCents),
        lastObservedChargeCents: cents(item.lastObservedChargeCents),
        nextRenewalDate: isoDate(item.nextRenewalDate),
        status: safeLabel(item.status, ''),
        expenseTiming: safeLabel(item.expenseTiming, ''),
        paymentSource: safeLabel(item.paymentSource, ''),
        confidence: safeLabel(item.confidence, ''),
        active: item.active !== false,
      })),
      observations: [],
      notes: [],
      validationWarnings: (raw.recurring?.validationWarnings || []).map((warning) => safeLabel(warning, 'Recurring validation warning', 240)).filter(Boolean),
    },
    exceptions: (raw.exceptions || []).map((item, index) => ({
      severity: ['keep', 'watch', 'change', 'drop'].includes(item.severity) ? item.severity : 'watch',
      label: safeLabel(item.label, `Review item ${index + 1}`),
      detail: safeLabel(item.detail, 'See local finance review source.', 320),
    })),
  };

  return normalizeFinanceImport(projected).data;
}

function preview(summary) {
  return {
    schemaVersion: summary.schemaVersion,
    month: summary.month,
    months: summary.months,
    label: summary.label,
    generatedAt: summary.generatedAt,
    sourceKinds: summary.sources.sourceKinds,
    contentSha256: summary.sources.contentSha256,
    rowCounts: {
      accounts: summary.mercury.accounts.length,
      activeCards: summary.mercury.activeCards.length,
      spendGroups: summary.mercury.spendByCounterparty.length,
      cardTransactions: summary.mercury.cardTransactions.length,
      observedCardExpenses: summary.mercury.observedCardExpenses.expenses.length,
      recentTransactions: summary.mercury.recentTransactions.length,
      recurringItems: summary.recurring.items.length,
      mercuryInvoices: summary.mercury.invoices.length,
      exceptions: summary.exceptions.length,
    },
    metricsPresent: {
      cash: summary.metrics.totalAvailableBalanceCents !== 0 || summary.metrics.totalCurrentBalanceCents !== 0,
      cashMovement: summary.metrics.inflowCents !== 0 || summary.metrics.outflowCents !== 0,
      recurring: summary.metrics.recurringKnownMonthlyCents !== 0 || summary.recurring.items.length > 0,
      cards: summary.metrics.activeCardCount > 0 || summary.metrics.cardExpenseCount > 0,
      mercuryOpenInvoicesContributeToTopLine: summary.metrics.mercuryInvoiceOpenCents !== 0,
    },
  };
}

function defaultOutPath(month) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return path.join(EXPORT_DIR, `fin-dashboard-summary-${month}-${stamp}.json`);
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function printHelp() {
  console.log(`WAWCO Fin hosted finance summary exporter\n\nUsage:\n  npm run finance:export-hosted-summary -- --fixture --month 2099-12\n  npm run finance:export-hosted-summary -- --real --month YYYY-MM\n\nOptions:\n  --fixture          Emit generic fake summary. Does not read .finance/.\n  --real             Read ignored local .finance sources and write hosted-safe derived summary. Requires current-session approval.\n  --month YYYY-MM    Select month. Defaults to latest local summary month for --real and 2099-12 for --fixture.\n  --out PATH         Output path. --real defaults to .finance/exports/.\n  --snapshot PATH    Optional Mercury snapshot directory for local summary input.\n  --recurring PATH   Optional recurring cost JSON path.\n  --card-labels PATH Optional card label JSON path.\n  --invoice-db PATH  Optional legacy invoice DB path for source parity only; uploaded summary excludes localInvoices.\n  --preview          Print compact safe preview instead of full JSON.\n  --print            Print full JSON to stdout. For --real, avoid this unless explicitly needed.\n  --help             Show this help.\n\nBoundary:\n  --real reads local ignored finance artifacts only. It does not call Mercury, Stripe, Gmail, bank, payment, customer, invoice-send, card, recipient, webhook, transaction-category, or hosted Fin APIs.\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const fixture = args.fixture === true;
  const real = args.real === true;
  if (fixture === real) {
    console.error('Choose exactly one of --fixture or --real.');
    process.exit(2);
  }

  const month = args.month ? monthArg(args.month) : fixture ? '2099-12' : '';
  let summary;

  if (fixture) {
    summary = fakeFinanceImportSummary(month || '2099-12');
  } else {
    const { buildSummary } = await import('./finance-dashboard.mjs');
    const raw = buildSummary({
      month,
      snapshotDir: resolveFinanceInput(args.snapshot, '--snapshot') || '',
      recurringPath: resolveFinanceInput(args.recurring, '--recurring'),
      cardLabelsPath: resolveFinanceInput(args['card-labels'], '--card-labels'),
      invoiceDbPath: resolveFinanceInput(args['invoice-db'], '--invoice-db'),
    });
    summary = projectFinanceSummary(raw);
  }

  if (args.preview) {
    process.stdout.write(`${JSON.stringify(preview(summary), null, 2)}\n`);
    return;
  }

  const out = args.out ? path.resolve(String(args.out)) : real && !args.print ? defaultOutPath(summary.month) : '';
  if (out) {
    writeJson(out, summary);
    console.log(out);
    return;
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
