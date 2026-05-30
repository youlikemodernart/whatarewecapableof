const crypto = require('crypto');

const FINANCE_IMPORT_SCHEMA_VERSION = 'fin-finance-summary-v1';
const FINANCE_IMPORT_VALIDATOR_VERSION = 'fin-finance-import-validator-v1';
const MAX_SAFE_STRING_LENGTH = 500;
const FORBIDDEN_KEY_PATTERNS = [
  /(^|_)id$/i,
  /accountid/i,
  /transactionid/i,
  /cardid/i,
  /customerid/i,
  /invoiceid/i,
  /chargeid/i,
  /paymentintentid/i,
  /balancetransactionid/i,
  /payoutid/i,
  /stripeaccountid/i,
  /mercurycustomerid/i,
  /mercurydestinationaccountid/i,
  /lastfour/i,
  /last4/i,
  /cardlastfour/i,
  /accountnumber/i,
  /routingnumber/i,
  /cardnumber/i,
  /nameoncard/i,
  /bankdescription/i,
  /externalmemo/i,
  /descriptor/i,
  /raw/i,
  /payload/i,
  /details/i,
  /^metadata$/i,
  /(^|_)path$/i,
  /dbpath/i,
  /snapshotdir/i,
  /manifestpath/i,
  /recurringpath/i,
  /cardlabelspath/i,
  /invoicedbpath/i,
  /secret/i,
  /token/i,
  /cookie/i,
  /authorization/i,
  /apikey/i,
  /password/i,
  /^env$/i,
  /localinvoices/i,
  /hostedinvoices/i,
];
const FORBIDDEN_VALUE_PATTERNS = [
  /\.finance\//i,
  /\/Users\//,
  /secret-token:/i,
  /sk_live_/i,
  /rk_live_/i,
  /\b(?:cus|acct|pi|ch|txn|bt|po|in|cs|evt|fee|pyr)_[A-Za-z0-9_]+\b/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /[•*]\s*\d{2,4}/,
  /\b(?:card|visa|mastercard|amex|ending|last\s*four)\b[^\n]{0,24}\b\d{4}\b/i,
  /mercury_[A-Za-z0-9]/,
  /POSTGRES_URL|DATABASE_URL|FIN_GOOGLE_CLIENT_SECRET|FIN_SESSION_SECRET/i,
  /Bearer\s+[A-Za-z0-9._-]+/i,
];

function makeImportError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, max = MAX_SAFE_STRING_LENGTH) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function assertNoForbiddenKeysOrValues(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeysOrValues(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) {
    if (typeof value === 'string') {
      for (const pattern of FORBIDDEN_VALUE_PATTERNS) {
        if (pattern.test(value)) throw makeImportError(400, `Forbidden raw finance value at ${path}.`);
      }
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    for (const pattern of FORBIDDEN_KEY_PATTERNS) {
      if (pattern.test(key)) throw makeImportError(400, `Forbidden raw finance field at ${path}.${key}.`);
    }
    assertNoForbiddenKeysOrValues(child, `${path}.${key}`);
  }
}

function assertObject(value, path) {
  if (!isPlainObject(value)) throw makeImportError(400, `${path} must be an object.`);
  return value;
}

function assertNoUnknownKeys(value, allowed, path) {
  for (const key of Object.keys(value || {})) {
    if (!allowed.includes(key)) throw makeImportError(400, `Unknown finance import field at ${path}.${key}.`);
  }
}

function cleanDate(value, path, required = false) {
  const text = cleanString(value, 10);
  if (!text && !required) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw makeImportError(400, `${path} must use YYYY-MM-DD.`);
  return text;
}

function cleanMonth(value, path, required = false) {
  const text = cleanString(value, 7);
  if (!text && !required) return '';
  if (!/^\d{4}-\d{2}$/.test(text)) throw makeImportError(400, `${path} must use YYYY-MM.`);
  return text;
}

function cleanTimestamp(value, path, required = false) {
  const text = cleanString(value, 80);
  if (!text && !required) return '';
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) throw makeImportError(400, `${path} must be an ISO timestamp.`);
  return new Date(parsed).toISOString();
}

function cleanEnum(value, allowed, path, fallback = '') {
  const text = cleanString(value, 80);
  if (!text && fallback !== undefined) return fallback;
  if (!allowed.includes(text)) throw makeImportError(400, `${path} must be one of: ${allowed.join(', ')}.`);
  return text;
}

function cleanCents(value, path) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) throw makeImportError(400, `${path} must be an integer cent value.`);
  if (Math.abs(parsed) > 100_000_000_000) throw makeImportError(400, `${path} is outside the allowed cent range.`);
  return parsed;
}

function cleanCount(value, path) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) throw makeImportError(400, `${path} must be a non-negative integer.`);
  if (parsed > 100_000) throw makeImportError(400, `${path} is too large.`);
  return parsed;
}

function cleanBoolean(value) {
  return value === true;
}

function cleanStringArray(value, path, maxItems = 100) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw makeImportError(400, `${path} must be an array.`);
  if (value.length > maxItems) throw makeImportError(400, `${path} has too many rows.`);
  return value.map((item, index) => cleanString(item, 160)).filter(Boolean).map((item, index) => {
    assertNoForbiddenKeysOrValues(item, `${path}[${index}]`);
    return item;
  });
}

function cleanRows(value, path, mapper, maxItems = 200) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw makeImportError(400, `${path} must be an array.`);
  if (value.length > maxItems) throw makeImportError(400, `${path} has too many rows.`);
  return value.map((item, index) => mapper(assertObject(item, `${path}[${index}]`), `${path}[${index}]`));
}

function cleanGroupRow(row, path) {
  assertNoUnknownKeys(row, ['label', 'amountCents', 'count'], path);
  return {
    label: cleanString(row.label, 160) || 'Unknown',
    amountCents: cleanCents(row.amountCents, `${path}.amountCents`),
    count: cleanCount(row.count, `${path}.count`),
  };
}

function cleanAccount(row, path) {
  assertNoUnknownKeys(row, ['label', 'type', 'status', 'availableBalanceCents', 'currentBalanceCents'], path);
  return {
    label: cleanString(row.label, 160) || 'Cash account',
    type: cleanString(row.type, 80),
    status: cleanString(row.status, 80),
    availableBalanceCents: cleanCents(row.availableBalanceCents, `${path}.availableBalanceCents`),
    currentBalanceCents: cleanCents(row.currentBalanceCents, `${path}.currentBalanceCents`),
  };
}

function cleanActiveCard(row, path) {
  assertNoUnknownKeys(row, ['label', 'purpose', 'status', 'type', 'expectedMerchants'], path);
  return {
    label: cleanString(row.label, 160) || 'Service card',
    purpose: cleanString(row.purpose, 240),
    status: cleanString(row.status, 80),
    type: cleanString(row.type, 80),
    expectedMerchants: cleanStringArray(row.expectedMerchants, `${path}.expectedMerchants`, 30),
  };
}

function cleanCardTransaction(row, path) {
  assertNoUnknownKeys(row, ['date', 'month', 'amountCents', 'direction', 'category', 'kind', 'cardLabel'], path);
  return {
    date: cleanDate(row.date, `${path}.date`),
    month: cleanMonth(row.month, `${path}.month`),
    amountCents: cleanCents(row.amountCents, `${path}.amountCents`),
    direction: cleanEnum(row.direction || (Number(row.amountCents || 0) >= 0 ? 'in' : 'out'), ['in', 'out'], `${path}.direction`, 'out'),
    category: cleanString(row.category, 160) || 'Uncategorized',
    kind: cleanString(row.kind, 160),
    cardLabel: cleanString(row.cardLabel, 160),
  };
}

function cleanObservedExpense(row, path) {
  assertNoUnknownKeys(row, ['date', 'merchant', 'category', 'kind', 'cardLabel', 'amountCents', 'possiblePersonalFunding', 'fundingDetail'], path);
  return {
    date: cleanDate(row.date, `${path}.date`),
    merchant: cleanString(row.merchant, 160) || 'Unknown merchant',
    category: cleanString(row.category, 160) || 'Uncategorized',
    kind: cleanString(row.kind, 160),
    cardLabel: cleanString(row.cardLabel, 160),
    amountCents: cleanCents(row.amountCents, `${path}.amountCents`),
    possiblePersonalFunding: cleanBoolean(row.possiblePersonalFunding),
    fundingDetail: cleanString(row.fundingDetail, 240),
  };
}

function cleanFundingBatch(row, path) {
  assertNoUnknownKeys(row, ['date', 'cardLabel', 'amountCents', 'expenseCount', 'fundingSignal'], path);
  return {
    date: cleanDate(row.date, `${path}.date`),
    cardLabel: cleanString(row.cardLabel, 160),
    amountCents: cleanCents(row.amountCents, `${path}.amountCents`),
    expenseCount: cleanCount(row.expenseCount, `${path}.expenseCount`),
    fundingSignal: cleanString(row.fundingSignal, 240) || 'none',
  };
}

function cleanFundingTransfer(row, path) {
  assertNoUnknownKeys(row, ['date', 'label', 'amountCents'], path);
  return {
    date: cleanDate(row.date, `${path}.date`),
    label: cleanString(row.label, 160) || 'Funding signal',
    amountCents: cleanCents(row.amountCents, `${path}.amountCents`),
  };
}

function cleanRecentTransaction(row, path) {
  assertNoUnknownKeys(row, ['date', 'month', 'direction', 'amountCents', 'counterparty', 'category', 'kind', 'cardLabel'], path);
  return {
    date: cleanDate(row.date, `${path}.date`),
    month: cleanMonth(row.month, `${path}.month`),
    direction: cleanEnum(row.direction || (Number(row.amountCents || 0) >= 0 ? 'in' : 'out'), ['in', 'out'], `${path}.direction`, 'out'),
    amountCents: cleanCents(row.amountCents, `${path}.amountCents`),
    counterparty: cleanString(row.counterparty, 160) || 'Unknown counterparty',
    category: cleanString(row.category, 160) || 'Uncategorized',
    kind: cleanString(row.kind, 160),
    cardLabel: cleanString(row.cardLabel, 160),
  };
}

function cleanMercuryInvoice(row, path) {
  assertNoUnknownKeys(row, ['invoiceNumber', 'status', 'invoiceDate', 'dueDate', 'amountCents'], path);
  return {
    invoiceNumber: cleanString(row.invoiceNumber, 120) || 'Invoice',
    status: cleanString(row.status, 80) || 'unknown',
    invoiceDate: cleanDate(row.invoiceDate, `${path}.invoiceDate`),
    dueDate: cleanDate(row.dueDate, `${path}.dueDate`),
    amountCents: cleanCents(row.amountCents, `${path}.amountCents`),
  };
}

function cleanException(row, path) {
  assertNoUnknownKeys(row, ['severity', 'label', 'detail'], path);
  return {
    severity: cleanEnum(row.severity || 'watch', ['keep', 'watch', 'change', 'drop'], `${path}.severity`, 'watch'),
    label: cleanString(row.label, 160) || 'Review item',
    detail: cleanString(row.detail, 320),
  };
}

function normalizeMetrics(input = {}) {
  const row = assertObject(input, '$.metrics');
  const allowed = [
    'totalAvailableBalanceCents', 'totalCurrentBalanceCents', 'inflowCents', 'outflowCents', 'netCents',
    'recurringKnownMonthlyCents', 'recurringCurrentMonthlyCents', 'recurringTentativeMonthlyCents',
    'recurringUnknownCount', 'recurringTentativeCount', 'activeCardCount', 'activeCardLabelCount',
    'cardSpendCents', 'cardExpenseCount', 'possiblePersonalFundedCardCents', 'unmatchedCardExpenseCents',
    'transactionCount', 'mercuryInvoiceOpenCents',
  ];
  assertNoUnknownKeys(row, allowed, '$.metrics');
  const metrics = {};
  for (const key of allowed) {
    const isCount = key.endsWith('Count') || key === 'transactionCount';
    metrics[key] = isCount ? cleanCount(row[key], `$.metrics.${key}`) : cleanCents(row[key], `$.metrics.${key}`);
  }
  if (metrics.mercuryInvoiceOpenCents !== 0) {
    throw makeImportError(400, 'Imported Mercury invoice open value must stay 0 until de-duplication is implemented.');
  }
  return metrics;
}

function normalizeSources(input = {}) {
  const row = assertObject(input, '$.sources');
  const allowed = ['financeSnapshot', 'coverageStart', 'coverageEnd', 'generatedBy', 'sourceKinds', 'contentSha256', 'validatorVersion'];
  assertNoUnknownKeys(row, allowed, '$.sources');
  const contentSha256 = cleanString(row.contentSha256, 64);
  if (contentSha256 && !/^[a-f0-9]{64}$/i.test(contentSha256)) throw makeImportError(400, '$.sources.contentSha256 must be a SHA-256 hex digest.');
  return {
    financeSnapshot: cleanString(row.financeSnapshot, 80) || 'derived-local-export',
    coverageStart: cleanDate(row.coverageStart, '$.sources.coverageStart'),
    coverageEnd: cleanDate(row.coverageEnd, '$.sources.coverageEnd'),
    generatedBy: cleanString(row.generatedBy, 120) || 'local-finance-dashboard-export',
    sourceKinds: cleanStringArray(row.sourceKinds, '$.sources.sourceKinds', 20),
    contentSha256: contentSha256.toLowerCase(),
    validatorVersion: cleanString(row.validatorVersion, 80) || FINANCE_IMPORT_VALIDATOR_VERSION,
  };
}

function normalizeMercury(input = {}) {
  const row = assertObject(input, '$.mercury');
  const allowed = [
    'month', 'snapshot', 'accounts', 'activeCards', 'snapshotMonths', 'transactionCount', 'inflowCents',
    'outflowCents', 'netCents', 'spendByCounterparty', 'spendByKind', 'spendByCategory', 'cardSpend',
    'cardSpendCents', 'cardTransactions', 'observedCardExpenses', 'recentTransactions', 'invoices', 'invoiceSummary',
  ];
  assertNoUnknownKeys(row, allowed, '$.mercury');
  const snapshot = assertObject(row.snapshot || {}, '$.mercury.snapshot');
  assertNoUnknownKeys(snapshot, ['generatedAt', 'errors'], '$.mercury.snapshot');
  const observed = assertObject(row.observedCardExpenses || {}, '$.mercury.observedCardExpenses');
  assertNoUnknownKeys(observed, ['expenses', 'batches', 'fundingTransfers', 'totalExpenseCents', 'possiblePersonalFundedCents', 'unmatchedExpenseCents'], '$.mercury.observedCardExpenses');
  return {
    month: cleanMonth(row.month, '$.mercury.month'),
    snapshot: {
      generatedAt: cleanTimestamp(snapshot.generatedAt, '$.mercury.snapshot.generatedAt'),
      errors: cleanStringArray(snapshot.errors, '$.mercury.snapshot.errors', 50),
    },
    accounts: cleanRows(row.accounts, '$.mercury.accounts', cleanAccount, 50),
    activeCards: cleanRows(row.activeCards, '$.mercury.activeCards', cleanActiveCard, 100),
    snapshotMonths: cleanStringArray(row.snapshotMonths, '$.mercury.snapshotMonths', 120).map((month, index) => cleanMonth(month, `$.mercury.snapshotMonths[${index}]`, true)),
    transactionCount: cleanCount(row.transactionCount, '$.mercury.transactionCount'),
    inflowCents: cleanCents(row.inflowCents, '$.mercury.inflowCents'),
    outflowCents: cleanCents(row.outflowCents, '$.mercury.outflowCents'),
    netCents: cleanCents(row.netCents, '$.mercury.netCents'),
    spendByCounterparty: cleanRows(row.spendByCounterparty, '$.mercury.spendByCounterparty', cleanGroupRow, 100),
    spendByKind: cleanRows(row.spendByKind, '$.mercury.spendByKind', cleanGroupRow, 100),
    spendByCategory: cleanRows(row.spendByCategory, '$.mercury.spendByCategory', cleanGroupRow, 100),
    cardSpend: cleanRows(row.cardSpend, '$.mercury.cardSpend', cleanGroupRow, 100),
    cardSpendCents: cleanCents(row.cardSpendCents, '$.mercury.cardSpendCents'),
    cardTransactions: cleanRows(row.cardTransactions, '$.mercury.cardTransactions', cleanCardTransaction, 300),
    observedCardExpenses: {
      expenses: cleanRows(observed.expenses, '$.mercury.observedCardExpenses.expenses', cleanObservedExpense, 300),
      batches: cleanRows(observed.batches, '$.mercury.observedCardExpenses.batches', cleanFundingBatch, 100),
      fundingTransfers: cleanRows(observed.fundingTransfers, '$.mercury.observedCardExpenses.fundingTransfers', cleanFundingTransfer, 100),
      totalExpenseCents: cleanCents(observed.totalExpenseCents, '$.mercury.observedCardExpenses.totalExpenseCents'),
      possiblePersonalFundedCents: cleanCents(observed.possiblePersonalFundedCents, '$.mercury.observedCardExpenses.possiblePersonalFundedCents'),
      unmatchedExpenseCents: cleanCents(observed.unmatchedExpenseCents, '$.mercury.observedCardExpenses.unmatchedExpenseCents'),
    },
    recentTransactions: cleanRows(row.recentTransactions, '$.mercury.recentTransactions', cleanRecentTransaction, 100),
    invoices: cleanRows(row.invoices, '$.mercury.invoices', cleanMercuryInvoice, 100),
    invoiceSummary: cleanRows(row.invoiceSummary, '$.mercury.invoiceSummary', (item, path) => {
      assertNoUnknownKeys(item, ['status', 'count', 'amountCents'], path);
      return { status: cleanString(item.status, 80) || 'unknown', count: cleanCount(item.count, `${path}.count`), amountCents: cleanCents(item.amountCents, `${path}.amountCents`) };
    }, 50),
  };
}

function normalizeRecurring(input = {}) {
  const row = assertObject(input, '$.recurring');
  const allowed = ['fileExists', 'updatedAt', 'monthlyCents', 'currentMonthlyCents', 'tentativeMonthlyCents', 'knownCount', 'unknownCount', 'tentativeCount', 'byCategory', 'items', 'observations', 'notes', 'validationWarnings'];
  assertNoUnknownKeys(row, allowed, '$.recurring');
  return {
    fileExists: cleanBoolean(row.fileExists),
    updatedAt: cleanTimestamp(row.updatedAt, '$.recurring.updatedAt'),
    monthlyCents: cleanCents(row.monthlyCents, '$.recurring.monthlyCents'),
    currentMonthlyCents: cleanCents(row.currentMonthlyCents, '$.recurring.currentMonthlyCents'),
    tentativeMonthlyCents: cleanCents(row.tentativeMonthlyCents, '$.recurring.tentativeMonthlyCents'),
    knownCount: cleanCount(row.knownCount, '$.recurring.knownCount'),
    unknownCount: cleanCount(row.unknownCount, '$.recurring.unknownCount'),
    tentativeCount: cleanCount(row.tentativeCount, '$.recurring.tentativeCount'),
    byCategory: cleanRows(row.byCategory, '$.recurring.byCategory', cleanGroupRow, 100),
    items: cleanRows(row.items, '$.recurring.items', (item, path) => {
      assertNoUnknownKeys(item, ['name', 'vendor', 'category', 'plan', 'expectedMonthlyCents', 'lastObservedChargeCents', 'nextRenewalDate', 'status', 'expenseTiming', 'paymentSource', 'confidence', 'active'], path);
      return {
        name: cleanString(item.name, 160) || 'Service',
        vendor: cleanString(item.vendor, 160) || cleanString(item.name, 160) || 'Vendor',
        category: cleanString(item.category, 160) || 'Uncategorized',
        plan: cleanString(item.plan, 160),
        expectedMonthlyCents: cleanCents(item.expectedMonthlyCents, `${path}.expectedMonthlyCents`),
        lastObservedChargeCents: cleanCents(item.lastObservedChargeCents, `${path}.lastObservedChargeCents`),
        nextRenewalDate: cleanDate(item.nextRenewalDate, `${path}.nextRenewalDate`),
        status: cleanString(item.status, 80),
        expenseTiming: cleanString(item.expenseTiming, 80),
        paymentSource: cleanString(item.paymentSource, 80),
        confidence: cleanString(item.confidence, 120),
        active: item.active !== false,
      };
    }, 200),
    observations: cleanStringArray(row.observations, '$.recurring.observations', 100),
    notes: cleanStringArray(row.notes, '$.recurring.notes', 100),
    validationWarnings: cleanStringArray(row.validationWarnings, '$.recurring.validationWarnings', 100),
  };
}

function stableFinanceImportContent(data = {}) {
  const sources = data.sources || {};
  return {
    schemaVersion: data.schemaVersion || FINANCE_IMPORT_SCHEMA_VERSION,
    month: data.month || '',
    months: Array.isArray(data.months) ? data.months : [],
    sources: {
      financeSnapshot: sources.financeSnapshot || '',
      coverageStart: sources.coverageStart || '',
      coverageEnd: sources.coverageEnd || '',
      generatedBy: sources.generatedBy || '',
      sourceKinds: Array.isArray(sources.sourceKinds) ? sources.sourceKinds : [],
    },
    metrics: data.metrics || {},
    mercury: data.mercury || {},
    recurring: data.recurring || {},
    exceptions: Array.isArray(data.exceptions) ? data.exceptions : [],
  };
}

function stableFinanceImportContentSha256(data = {}) {
  return crypto.createHash('sha256').update(JSON.stringify(stableFinanceImportContent(data))).digest('hex');
}

function normalizeFinanceImport(input = {}) {
  const source = assertObject(input, '$');
  assertNoForbiddenKeysOrValues(source, '$');
  const allowed = ['schemaVersion', 'generatedAt', 'month', 'months', 'label', 'sources', 'metrics', 'mercury', 'recurring', 'exceptions'];
  assertNoUnknownKeys(source, allowed, '$');
  const schemaVersion = cleanString(source.schemaVersion, 80);
  if (schemaVersion !== FINANCE_IMPORT_SCHEMA_VERSION) throw makeImportError(400, `Finance import schemaVersion must be ${FINANCE_IMPORT_SCHEMA_VERSION}.`);
  const month = cleanMonth(source.month, '$.month', true);
  const months = cleanStringArray(source.months, '$.months', 120).map((item, index) => cleanMonth(item, `$.months[${index}]`, true));
  const data = {
    schemaVersion,
    generatedAt: cleanTimestamp(source.generatedAt, '$.generatedAt', true),
    month,
    months: [...new Set([month, ...months])].sort(),
    label: cleanString(source.label, 160) || `Finance summary ${month}`,
    sources: normalizeSources(source.sources || {}),
    metrics: normalizeMetrics(source.metrics || {}),
    mercury: normalizeMercury(source.mercury || {}),
    recurring: normalizeRecurring(source.recurring || {}),
    exceptions: cleanRows(source.exceptions, '$.exceptions', cleanException, 100),
  };
  data.mercury.month = data.mercury.month || month;
  if (!data.mercury.snapshotMonths.length) data.mercury.snapshotMonths = data.months;
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const stableContentSha256 = stableFinanceImportContentSha256(data);
  data.sources.contentSha256 = hash;
  data.sources.validatorVersion = FINANCE_IMPORT_VALIDATOR_VERSION;
  return {
    schemaVersion,
    month,
    label: data.label,
    data,
    contentSha256: hash,
    stableContentSha256,
    validatorVersion: FINANCE_IMPORT_VALIDATOR_VERSION,
    sourceSummary: {
      sourceKinds: data.sources.sourceKinds,
      coverageStart: data.sources.coverageStart,
      coverageEnd: data.sources.coverageEnd,
      generatedAt: data.generatedAt,
      month,
      months: data.months,
      rowCounts: {
        accounts: data.mercury.accounts.length,
        activeCards: data.mercury.activeCards.length,
        cardTransactions: data.mercury.cardTransactions.length,
        observedCardExpenses: data.mercury.observedCardExpenses.expenses.length,
        recentTransactions: data.mercury.recentTransactions.length,
        recurringItems: data.recurring.items.length,
        mercuryInvoices: data.mercury.invoices.length,
      },
      contentSha256: hash,
      stableContentSha256,
      validatorVersion: FINANCE_IMPORT_VALIDATOR_VERSION,
    },
    validationAudit: {
      schemaVersion,
      validatorVersion: FINANCE_IMPORT_VALIDATOR_VERSION,
      rejectedUnknownKeys: false,
      rejectedForbiddenFields: false,
      importedMercuryInvoiceOpenCentsContributesToOpenInvoices: false,
    },
  };
}

function summarizeFinanceImport(record) {
  if (!record) return null;
  return {
    id: record.id,
    schemaVersion: record.schemaVersion || record.schema_version || FINANCE_IMPORT_SCHEMA_VERSION,
    month: record.month || '',
    label: record.label || '',
    importedAt: record.importedAt || record.imported_at || '',
    contentSha256: record.contentSha256 || record.content_sha256 || '',
    stableContentSha256: record.stableContentSha256 || record.stable_content_sha256 || '',
    validatorVersion: record.validatorVersion || record.validator_version || '',
    actorType: record.actorType || record.importedActorType || record.imported_actor_type || 'user',
    actorLabel: record.actorLabel || record.importedActorLabel || record.imported_actor_label || '',
    keyId: record.keyId || record.importedKeyId || record.imported_key_id || '',
  };
}

function fakeFinanceImportSummary(month = '2099-12') {
  return normalizeFinanceImport({
    schemaVersion: FINANCE_IMPORT_SCHEMA_VERSION,
    generatedAt: '2099-12-31T00:00:00.000Z',
    month,
    months: [month],
    label: `Generic finance import ${month}`,
    sources: {
      financeSnapshot: 'derived-local-export',
      coverageStart: `${month}-01`,
      coverageEnd: `${month}-28`,
      generatedBy: 'generic-fixture',
      sourceKinds: ['mercury', 'recurring', 'card-labels'],
    },
    metrics: {
      totalAvailableBalanceCents: 1250000,
      totalCurrentBalanceCents: 1260000,
      inflowCents: 450000,
      outflowCents: 123456,
      netCents: 326544,
      recurringKnownMonthlyCents: 42000,
      recurringCurrentMonthlyCents: 30000,
      recurringTentativeMonthlyCents: 12000,
      recurringUnknownCount: 1,
      recurringTentativeCount: 1,
      activeCardCount: 1,
      activeCardLabelCount: 1,
      cardSpendCents: 23456,
      cardExpenseCount: 1,
      possiblePersonalFundedCardCents: 0,
      unmatchedCardExpenseCents: 23456,
      transactionCount: 3,
      mercuryInvoiceOpenCents: 0,
    },
    mercury: {
      month,
      snapshot: { generatedAt: '2099-12-31T00:00:00.000Z', errors: [] },
      accounts: [{ label: 'Operating cash', type: 'cash', status: 'active', availableBalanceCents: 1250000, currentBalanceCents: 1260000 }],
      activeCards: [{ label: 'Generic service card', purpose: 'Generic subscription review', status: 'active', type: 'credit', expectedMerchants: ['Generic Vendor'] }],
      snapshotMonths: [month],
      transactionCount: 3,
      inflowCents: 450000,
      outflowCents: 123456,
      netCents: 326544,
      spendByCounterparty: [{ label: 'Generic Vendor', amountCents: 23456, count: 1 }],
      spendByKind: [{ label: 'Card purchase', amountCents: 23456, count: 1 }],
      spendByCategory: [{ label: 'Software', amountCents: 23456, count: 1 }],
      cardSpend: [{ label: 'Generic service card', amountCents: 23456, count: 1 }],
      cardSpendCents: 23456,
      cardTransactions: [{ date: `${month}-10`, month, amountCents: -23456, direction: 'out', category: 'Software', kind: 'Card purchase', cardLabel: 'Generic service card' }],
      observedCardExpenses: {
        expenses: [{ date: `${month}-10`, merchant: 'Generic Vendor', category: 'Software', kind: 'Card purchase', cardLabel: 'Generic service card', amountCents: 23456, possiblePersonalFunding: false, fundingDetail: 'No nearby personal-funding signal.' }],
        batches: [{ date: `${month}-10`, cardLabel: 'Generic service card', amountCents: 23456, expenseCount: 1, fundingSignal: 'none' }],
        fundingTransfers: [],
        totalExpenseCents: 23456,
        possiblePersonalFundedCents: 0,
        unmatchedExpenseCents: 23456,
      },
      recentTransactions: [{ date: `${month}-10`, month, direction: 'out', amountCents: -23456, counterparty: 'Generic Vendor', category: 'Software', kind: 'Card purchase', cardLabel: 'Generic service card' }],
      invoices: [{ invoiceNumber: 'GENERIC-IMPORT-01', status: 'open', invoiceDate: `${month}-01`, dueDate: `${month}-28`, amountCents: 99900 }],
      invoiceSummary: [{ status: 'open', count: 1, amountCents: 99900 }],
    },
    recurring: {
      fileExists: true,
      updatedAt: '2099-12-31T00:00:00.000Z',
      monthlyCents: 42000,
      currentMonthlyCents: 30000,
      tentativeMonthlyCents: 12000,
      knownCount: 2,
      unknownCount: 1,
      tentativeCount: 1,
      byCategory: [{ label: 'AI tools', amountCents: 42000, count: 2 }],
      items: [{ name: 'Generic AI Tool', vendor: 'Generic Vendor', category: 'AI tools', plan: 'Monthly', expectedMonthlyCents: 30000, lastObservedChargeCents: 30000, nextRenewalDate: `${month}-20`, status: 'current recurring', expenseTiming: 'current', paymentSource: 'company', confidence: 'generic fixture', active: true }],
      observations: ['Generic fixture only.'],
      notes: [],
      validationWarnings: [],
    },
    exceptions: [{ severity: 'watch', label: 'Generic fixture import', detail: 'This is fake data for route verification.' }],
  }).data;
}

module.exports = {
  FINANCE_IMPORT_SCHEMA_VERSION,
  FINANCE_IMPORT_VALIDATOR_VERSION,
  normalizeFinanceImport,
  stableFinanceImportContentSha256,
  summarizeFinanceImport,
  fakeFinanceImportSummary,
};
