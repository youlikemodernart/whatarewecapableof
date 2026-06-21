import crypto from 'node:crypto';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { setTimeout as wait } from 'node:timers/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const port = 3321;
const appRoot = new URL('..', import.meta.url);
const serverEnvBackup = {
  FIN_GOOGLE_CLIENT_ID: process.env.FIN_GOOGLE_CLIENT_ID,
  FIN_GOOGLE_CLIENT_SECRET: process.env.FIN_GOOGLE_CLIENT_SECRET,
  FIN_SESSION_SECRET: process.env.FIN_SESSION_SECRET,
  FIN_ALLOWED_DOMAIN: process.env.FIN_ALLOWED_DOMAIN,
  FIN_ALLOWED_EMAILS: process.env.FIN_ALLOWED_EMAILS,
  FIN_STORAGE_MODE: process.env.FIN_STORAGE_MODE,
  POSTGRES_URL: process.env.POSTGRES_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
Object.assign(process.env, {
  FIN_GOOGLE_CLIENT_ID: '',
  FIN_GOOGLE_CLIENT_SECRET: '',
  FIN_SESSION_SECRET: '',
  FIN_ALLOWED_DOMAIN: 'whatarewecapableof.com',
  FIN_ALLOWED_EMAILS: '',
  FIN_STORAGE_MODE: '',
  POSTGRES_URL: '',
  DATABASE_URL: '',
});

const apiRoutes = new Map([
  ['/api/health', '../api/health.js'],
  ['/api/session', '../api/session.js'],
  ['/api/invoices', '../api/invoices.js'],
  ['/api/entities', '../api/entities.js'],
  ['/api/finance/summary', '../api/finance/summary.js'],
  ['/api/finance/imports', '../api/finance/imports.js'],
]);

const staticRoutes = new Map([
  ['/', 'index.html'],
  ['/invoices', 'invoices.html'],
  ['/invoices.js', 'invoices.js'],
  ['/pay', 'pay.html'],
  ['/pay.js', 'pay.js'],
  ['/finance', 'finance.html'],
  ['/finance.js', 'finance.js'],
]);

function contentType(pathname) {
  if (pathname.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8';
  if (pathname.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'text/html; charset=utf-8';
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (apiRoutes.has(url.pathname)) {
      const handler = require(apiRoutes.get(url.pathname));
      await handler(req, res);
      return;
    }
    const staticPath = staticRoutes.get(url.pathname);
    if (staticPath) {
      const data = await readFile(new URL(staticPath, appRoot));
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType(staticPath));
      res.end(data);
      return;
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    res.statusCode = error.status || 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error.message || 'Smoke server error' }));
  }
});

const serverReady = new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
});

async function fetchWithRetry(pathname, tries = 30) {
  await serverReady;
  let lastError;
  for (let i = 0; i < tries; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
      return response;
    } catch (error) {
      lastError = error;
      await wait(500);
    }
  }
  throw lastError;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function signSessionPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(String(payload)).digest('hex');
}

function sessionCookie(secret, overrides = {}) {
  const user = {
    sub: overrides.sub || 'fin-smoke-user',
    email: overrides.email || 'noah@whatarewecapableof.com',
    name: overrides.name || 'Fin Smoke User',
    picture: '',
  };
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  const body = Buffer.from(JSON.stringify(user)).toString('base64url');
  const payload = `v1.${expiresAt}.${body}`;
  const value = `${payload}.${signSessionPayload(payload, secret)}`;
  return `wawco_fin_session=${encodeURIComponent(value)}`;
}

function makeReq({ method, url, cookie, body, rawBody, headers = {} }) {
  const chunks = rawBody !== undefined ? [Buffer.from(String(rawBody))] : body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = {
    accept: 'application/json',
    cookie,
    host: '127.0.0.1:3321',
    ...headers,
  };
  if (body !== undefined || rawBody !== undefined) req.headers['content-type'] = 'application/json';
  return req;
}

async function callHandler(handler, options) {
  const req = makeReq(options);
  let raw = '';
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk = '') {
      raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    },
  };
  await handler(req, res);
  const data = raw ? JSON.parse(raw) : null;
  return { status: res.statusCode, headers: res.headers, data };
}

function installFakeFinDb() {
  const { normalizeInvoice, invoiceClientLabel, cleanEntityId, invoiceEntities, publicEntity, entityById } = require('../api/_invoice.js');
  const { normalizeFinanceImport, summarizeFinanceImport, fakeFinanceImportSummary } = require('../api/_finance_import.js');
  const { cleanPaymentMethod, customerPaymentMethods, paymentMethodQuote } = require('../api/_payment_pricing.js');
  const records = new Map();
  const profileRecords = new Map();
  const financeImports = new Map();
  const paymentRequests = new Map();
  const stripeEvents = new Map();
  const systemImportNonces = new Set();
  let invoiceSequence = 0;
  let profileSequence = 0;
  let financeImportSequence = 0;
  let paymentRequestSequence = 0;
  const dailySequences = new Map();
  const entities = invoiceEntities();
  let numbering = {
    mode: 'client-date-daily',
    sequenceScope: 'entity-date',
    sequencePadding: 2,
    example: 'SUBSTRATE-052626-01',
    examples: { wawco: 'SUBSTRATE-052626-01', ndg: 'NDG-SUBSTRATE-052626-01' },
  };

  function userRow(user) {
    const email = String(user.email || '').toLowerCase();
    return {
      id: crypto.createHash('sha256').update(`smoke:${email}`).digest('hex').slice(0, 32),
      email,
      name: user.name || email,
      role: ['noah@whatarewecapableof.com', 'austin@whatarewecapableof.com'].includes(email) ? 'admin' : 'sales_rep',
      active: true,
    };
  }

  function dateKeyForInvoiceDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '052626';
    const [, year, month, day] = match;
    return `${month}${day}${year.slice(-2)}`;
  }

  function clientInvoiceCode(invoice = {}) {
    const explicit = String(invoice.client?.invoiceCode || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 24);
    if (explicit) return explicit;
    const source = String(invoice.client?.company || invoice.client?.name || invoice.client?.email || 'CLIENT').toUpperCase();
    return source.replace(/[^A-Z0-9]+/g, '').slice(0, 24) || 'CLIENT';
  }

  function numberingExamples(padding = numbering.sequencePadding) {
    return {
      wawco: `SUBSTRATE-052626-${String(1).padStart(padding, '0')}`,
      ndg: `NDG-SUBSTRATE-052626-${String(1).padStart(padding, '0')}`,
    };
  }

  function invoiceNumberPrefixForEntity(entityId) {
    return String(entityById(entityId).invoiceCodePrefix || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12);
  }

  function nextInvoiceNumber(invoice) {
    const entityId = cleanEntityId(invoice.entityId || 'wawco');
    const dateKey = dateKeyForInvoiceDate(invoice.invoiceDate);
    const sequenceKey = `${entityId}:${dateKey}`;
    const sequence = dailySequences.get(sequenceKey) || 1;
    dailySequences.set(sequenceKey, sequence + 1);
    const suffix = String(sequence).padStart(numbering.sequencePadding, '0');
    const entityPrefix = invoiceNumberPrefixForEntity(entityId);
    const prefixPart = entityPrefix ? `${entityPrefix}-` : '';
    return `${prefixPart}${clientInvoiceCode(invoice)}-${dateKey}-${suffix}`;
  }

  function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function parseMoneyToCents(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
    const text = String(value || '').trim().replace(/[$,]/g, '');
    if (!text) return 0;
    if (!/^-?\d+(?:\.\d{0,2})?$/.test(text)) return 0;
    const negative = text.startsWith('-');
    const unsigned = negative ? text.slice(1) : text;
    const [dollars, cents = ''] = unsigned.split('.');
    const result = (Number(dollars || 0) * 100) + Number(cents.padEnd(2, '0').slice(0, 2));
    return negative ? -result : result;
  }

  function centsToInput(cents) {
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(Number(cents) || 0);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  }

  function cleanQuantity(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1_000_000, Math.round(number * 1000) / 1000));
  }

  function cleanRatePercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, Math.round(number * 1000) / 1000));
  }

  function invoicePaymentSnapshot(invoice = {}) {
    return {
      invoiceId: invoice.id || '',
      entityId: cleanEntityId(invoice.entityId || 'wawco'),
      invoiceNumber: invoice.invoiceNumber || '',
      invoiceDate: invoice.invoiceDate || '',
      dueDate: invoice.dueDate || '',
      currency: invoice.currency || 'USD',
      client: {
        label: invoiceClientLabel(invoice),
        name: String(invoice.client?.name || '').trim(),
        company: String(invoice.client?.company || '').trim(),
        email: String(invoice.client?.email || '').trim(),
        address: String(invoice.client?.address || '').trim(),
      },
      from: {
        name: String(invoice.from?.name || '').trim(),
        company: String(invoice.from?.company || '').trim(),
        email: String(invoice.from?.email || '').trim(),
        address: String(invoice.from?.address || '').trim(),
      },
      project: String(invoice.project || '').trim(),
      salesRep: String(invoice.salesRep || '').trim(),
      salesRepEmail: String(invoice.salesRepEmail || '').trim(),
      salesRole: String(invoice.salesRole || '').trim(),
      notes: String(invoice.notes || '').trim(),
      terms: String(invoice.terms || '').trim(),
      paymentInstructions: String(invoice.paymentInstructions || '').trim(),
      items: (invoice.items || []).map((item) => ({
        description: String(item.description || '').trim().slice(0, 600),
        quantity: cleanQuantity(item.quantity),
        unitPrice: centsToInput(Math.max(0, parseMoneyToCents(item.unitPrice))),
      })),
      discount: centsToInput(Math.max(0, parseMoneyToCents(invoice.discount))),
      taxRate: cleanRatePercent(invoice.taxRate),
      shipping: centsToInput(Math.max(0, parseMoneyToCents(invoice.shipping))),
      totalCents: Number(invoice.totals?.totalCents || 0),
    };
  }

  function paymentSnapshotHash(invoice) {
    return crypto.createHash('sha256').update(stableJson(invoicePaymentSnapshot(invoice))).digest('hex');
  }

  function makeError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  function paymentSummary(record) {
    if (!record || record.deleted) return null;
    return {
      id: record.id,
      invoiceId: record.invoiceId,
      entityId: cleanEntityId(record.entityId || 'wawco'),
      stripeAccountKey: entityById(record.entityId || 'wawco').stripeAccountKey || 'default',
      invoiceNumber: record.invoiceNumber,
      snapshotSha256: record.snapshotSha256,
      mode: record.mode,
      status: record.status,
      amountCents: record.amountCents,
      currency: record.currency,
      url: record.url || '',
      urlKind: record.urlKind || 'checkout_session',
      publicUrl: record.publicUrl || '',
      tokenHint: record.tokenHint || '',
      checkoutSessionId: record.checkoutSessionId || '',
      paymentIntentId: record.paymentIntentId || '',
      chargeId: record.chargeId || '',
      customerId: record.customerId || '',
      paymentMethodFamily: record.paymentMethodFamily || 'legacy',
      paymentMethodType: record.paymentMethodType || '',
      feePolicy: record.feePolicy || 'legacy_invoice_total',
      baseAmountCents: record.baseAmountCents ?? record.amountCents,
      clientProcessingCostCents: record.clientProcessingCostCents || 0,
      collectionAmountCents: record.collectionAmountCents ?? record.amountCents,
      expectedStripeFeeCents: record.expectedStripeFeeCents || 0,
      expectedNetCents: record.expectedNetCents || record.amountCents,
      expectedFeeFormula: record.expectedFeeFormula || {},
      feeDisclosureText: record.feeDisclosureText || '',
      balanceTransactionId: record.balanceTransactionId || '',
      actualStripeFeeCents: record.actualStripeFeeCents ?? null,
      actualNetCents: record.actualNetCents ?? null,
      reconciliationStatus: record.reconciliationStatus || 'not_started',
      paymentMethodDetails: record.paymentMethodDetails || {},
      expiresAt: record.expiresAt || '',
      paidAt: record.paidAt || '',
      reconciledAt: record.reconciledAt || '',
      updatedAt: record.updatedAt || '2026-05-29T00:00:00.000Z',
      active: ['creating', 'active', 'processing', 'paid'].includes(record.status),
    };
  }

  function latestPaymentRecord(invoiceId) {
    return Array.from(paymentRequests.values())
      .filter((payment) => !payment.deleted && payment.invoiceId === invoiceId)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
  }

  function activePaymentRecord(invoiceId, mode = 'test', methodFamily = '') {
    return Array.from(paymentRequests.values())
      .filter((payment) => !payment.deleted && payment.invoiceId === invoiceId && payment.mode === mode && (!methodFamily || payment.paymentMethodFamily === methodFamily) && ['creating', 'active', 'processing', 'paid'].includes(payment.status))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
  }

  function stripeObjectAmountCents(object = {}) {
    return Number(object.amount_total ?? object.amount_received ?? object.amount ?? 0);
  }

  function paymentMatchesEntity(payment, entityId) {
    return payment && cleanEntityId(payment.entityId || payment.metadata?.fin_entity_id || 'wawco') === cleanEntityId(entityId || 'wawco');
  }

  function findPaymentForStripeObject(type, object = {}, entityId = 'wawco') {
    if (type.startsWith('checkout.session.')) {
      const bySession = Array.from(paymentRequests.values()).find((payment) => !payment.deleted && paymentMatchesEntity(payment, entityId) && payment.checkoutSessionId === object.id);
      if (bySession) return bySession;
    }
    if (type.startsWith('payment_intent.')) {
      const byIntent = Array.from(paymentRequests.values()).find((payment) => !payment.deleted && paymentMatchesEntity(payment, entityId) && payment.paymentIntentId === object.id);
      if (byIntent) return byIntent;
    }
    if (type.startsWith('charge.') && object.payment_intent) {
      const byIntent = Array.from(paymentRequests.values()).find((payment) => !payment.deleted && paymentMatchesEntity(payment, entityId) && payment.paymentIntentId === object.payment_intent);
      if (byIntent) return byIntent;
    }
    if (type.startsWith('charge.')) {
      const byCharge = Array.from(paymentRequests.values()).find((payment) => !payment.deleted && paymentMatchesEntity(payment, entityId) && payment.chargeId === object.id);
      if (byCharge) return byCharge;
    }
    const metadataId = object.metadata?.fin_payment_request_id;
    if (metadataId) {
      const byMetadata = paymentRequests.get(String(metadataId)) || null;
      return paymentMatchesEntity(byMetadata, entityId) ? byMetadata : null;
    }
    return null;
  }

  function profileLabel(type, data) {
    if (data.label) return data.label;
    if (type === 'payee') return data.name || data.company || data.email || 'Untitled payee';
    if (type === 'client') return data.company || data.name || data.email || 'Untitled client';
    return data.salesRep || data.name || data.email || 'Untitled user';
  }

  function normalizeProfile(type, input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    if (type === 'payee') {
      const reportingScope = ['wawco', 'ndg', 'private'].includes(source.reportingScope) ? source.reportingScope : 'wawco';
      return {
        label: source.label || source.name || source.company || source.email || 'Untitled payee',
        name: source.name || source.company || '',
        company: source.company || source.name || '',
        email: source.email || '',
        address: source.address || '',
        mercuryDestinationAccountId: source.mercuryDestinationAccountId || '',
        defaultTerms: source.defaultTerms || '',
        defaultPaymentInstructions: source.defaultPaymentInstructions || '',
        reportingScope,
        excludeFromWawcoDashboard: Boolean(source.excludeFromWawcoDashboard) || reportingScope === 'private',
      };
    }
    if (type === 'client') {
      return {
        label: source.label || source.company || source.name || source.email || 'Untitled client',
        name: source.name || '',
        company: source.company || '',
        email: source.email || '',
        address: source.address || '',
        mercuryCustomerId: source.mercuryCustomerId || '',
        invoiceCode: clientInvoiceCode({ client: { invoiceCode: source.invoiceCode, company: source.company, name: source.name, email: source.email } }),
      };
    }
    return {
      label: source.label || source.salesRep || source.name || source.email || 'Untitled user',
      salesRep: source.salesRep || source.name || '',
      salesRepEmail: source.salesRepEmail || source.email || '',
      salesRole: ['admin', 'reviewer', 'sales-rep'].includes(source.salesRole) ? source.salesRole : 'admin',
    };
  }

  function profileResponse(record) {
    return {
      id: record.id,
      type: record.type,
      label: record.label,
      shared: record.shared,
      data: record.data,
      updatedAt: record.updatedAt,
    };
  }

  function visibleInvoices() {
    return Array.from(records.values()).filter((invoice) => !invoice.deleted);
  }

  function isDashboardExcluded(invoice) {
    return invoice.payeeReportingScope === 'private' || invoice.excludeFromWawcoDashboard === true;
  }

  function matchesEntityFilter(invoice, entityFilter) {
    if (entityFilter === 'combined') return true;
    return cleanEntityId(invoice.entityId || 'wawco') === entityFilter;
  }

  const fakeDb = {
    async ensureSchema() {},
    async ensureUser(user) {
      return userRow(user);
    },
    async numberingSettings() {
      const examples = numberingExamples(numbering.sequencePadding);
      return { ...numbering, sequenceScope: 'entity-date', example: examples.wawco, examples };
    },
    async updateNumberingSettings(input = {}) {
      const requestedPadding = Number(input.sequencePadding ?? input.padding ?? numbering.sequencePadding);
      const sequencePadding = Math.max(1, Math.min(8, Number.isFinite(requestedPadding) ? requestedPadding : numbering.sequencePadding));
      const examples = numberingExamples(sequencePadding);
      numbering = {
        mode: 'client-date-daily',
        sequenceScope: 'entity-date',
        sequencePadding,
        example: examples.wawco,
        examples,
      };
      return { ...numbering };
    },
    async listEntities(user) {
      userRow(user);
      return entities;
    },
    async invoiceEntityIdForUser(user, invoiceId) {
      const currentUser = userRow(user);
      const invoice = records.get(invoiceId);
      if (!invoice || invoice.deleted) return '';
      if (currentUser.role !== 'admin' && invoice.createdByUserId !== currentUser.id) return '';
      return cleanEntityId(invoice.entityId || 'wawco');
    },
    async listProfiles(user, type) {
      userRow(user);
      return Array.from(profileRecords.values())
        .filter((profile) => !profile.deleted && profile.type === type)
        .sort((a, b) => a.label.localeCompare(b.label))
        .map(profileResponse);
    },
    async createProfile(user, type, input) {
      const currentUser = userRow(user);
      profileSequence += 1;
      const id = `profile-${type}-${profileSequence}`;
      const data = normalizeProfile(type, input);
      const record = {
        id,
        type,
        label: profileLabel(type, data),
        data,
        shared: true,
        createdBy: currentUser.id,
        updatedAt: '2026-05-28T00:00:00.000Z',
      };
      profileRecords.set(id, record);
      return profileResponse(record);
    },
    async updateProfile(user, id, type, input) {
      userRow(user);
      const existing = profileRecords.get(id);
      if (!existing || existing.deleted || existing.type !== type) return null;
      const data = normalizeProfile(type, input);
      const record = {
        ...existing,
        label: profileLabel(type, data),
        data,
        updatedAt: '2026-05-28T01:00:00.000Z',
      };
      profileRecords.set(id, record);
      return profileResponse(record);
    },
    async deleteProfile(user, id, type) {
      userRow(user);
      const existing = profileRecords.get(id);
      if (!existing || existing.deleted || existing.type !== type) return false;
      profileRecords.set(id, { ...existing, deleted: true });
      return true;
    },
    async listInvoices(user) {
      const currentUser = userRow(user);
      return visibleInvoices().map((invoice) => ({
        id: invoice.id,
        entityId: cleanEntityId(invoice.entityId || 'wawco'),
        entityLabel: publicEntity(invoice.entityId || 'wawco').label,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        clientLabel: invoiceClientLabel(invoice),
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalCents: invoice.totals.totalCents,
        updatedAt: '2026-05-28T00:00:00.000Z',
        createdBy: currentUser.email,
      }));
    },
    async createInvoice(user, input) {
      userRow(user);
      invoiceSequence += 1;
      const id = `smoke-${invoiceSequence}`;
      const invoiceDraft = normalizeInvoice({ ...input, id, invoiceNumber: '' }, { id, invoiceNumber: '' });
      const currentUser = userRow(user);
      if (currentUser.role !== 'admin' && ['approved', 'issued', 'paid', 'void'].includes(invoiceDraft.status)) {
        throw makeError(403, 'Only Fin admins can create approved, issued, paid, or void invoices.');
      }
      const invoiceNumber = nextInvoiceNumber(invoiceDraft);
      const invoice = normalizeInvoice({ ...invoiceDraft, invoiceNumber }, { id, invoiceNumber });
      const startsApproved = ['approved', 'issued', 'paid'].includes(invoice.status);
      records.set(id, startsApproved ? { ...invoice, createdByUserId: currentUser.id, approvedByUserId: currentUser.id } : { ...invoice, createdByUserId: currentUser.id });
      return records.get(id);
    },
    async getInvoice(user, id) {
      userRow(user);
      const invoice = records.get(id);
      return invoice && !invoice.deleted ? invoice : null;
    },
    async updateInvoice(user, id, input) {
      const currentUser = userRow(user);
      const existing = records.get(id);
      if (!existing || existing.deleted) return null;
      const requestedStatus = String(input.status ?? existing.status ?? '').trim();
      if (currentUser.role !== 'admin' && (['approved', 'issued', 'paid', 'void'].includes(requestedStatus) || ['approved', 'issued', 'paid', 'void'].includes(existing.status))) {
        throw makeError(403, 'Only Fin admins can approve, issue, mark paid, void, or edit approved invoices.');
      }
      const requestedEntityId = cleanEntityId(input.entityId || input.entity_id || existing.entityId || 'wawco');
      const existingEntityId = cleanEntityId(existing.entityId || 'wawco');
      if (requestedEntityId !== existingEntityId) throw makeError(409, 'Invoice entity cannot be changed after the invoice number is assigned. Duplicate the draft under the other entity instead.');
      const invoice = normalizeInvoice({ ...existing, ...input, id, invoiceNumber: existing.invoiceNumber, entityId: existingEntityId }, { id, invoiceNumber: existing.invoiceNumber, entityId: existingEntityId });
      const activePayment = activePaymentRecord(id, 'test') || activePaymentRecord(id, 'live');
      if (activePayment && activePayment.snapshotSha256 !== paymentSnapshotHash(invoice)) {
        throw makeError(409, 'This invoice has an active Stripe payment link. Expire or supersede the link before changing payment terms, line items, totals, client, dates, or currency.');
      }
      if (activePayment) {
        const linkedAllowedStatuses = new Set(['approved', 'issued', 'paid']);
        if (!linkedAllowedStatuses.has(invoice.status)) throw makeError(409, 'This invoice has an active Stripe payment link. Keep it approved, issued, or paid until the link is expired or superseded.');
        if (existing.status === 'paid' && invoice.status !== 'paid') throw makeError(409, 'Paid invoices cannot be moved back while a Stripe payment record is attached.');
      }
      const storedInvoice = invoice.status === 'approved' ? { ...invoice, approvedByUserId: currentUser.id } : { ...invoice, approvedByUserId: existing.approvedByUserId };
      records.set(id, storedInvoice);
      return storedInvoice;
    },
    async deleteInvoice(user, id) {
      userRow(user);
      const invoice = records.get(id);
      if (!invoice || invoice.deleted) return false;
      const activePayment = activePaymentRecord(id, 'test') || activePaymentRecord(id, 'live');
      if (activePayment) throw makeError(409, 'This invoice has an active Stripe payment link. Expire, cancel, or supersede the link before deleting the invoice.');
      records.set(id, { ...invoice, deleted: true });
      return true;
    },
    async latestPaymentRequestForInvoice(user, invoiceId) {
      userRow(user);
      const invoice = records.get(invoiceId);
      if (!invoice || invoice.deleted) return null;
      return paymentSummary(latestPaymentRecord(invoiceId));
    },
    async createInvoicePaymentRequest(user, invoiceId, mode = 'test') {
      const currentUser = userRow(user);
      if (currentUser.role !== 'admin') throw makeError(403, 'Only Fin admins can create Stripe payment links.');
      if (!['test', 'live'].includes(mode)) throw makeError(400, 'Stripe mode must be test or live.');
      const invoice = records.get(invoiceId);
      if (!invoice || invoice.deleted) throw makeError(404, 'Invoice draft not found.');
      if (invoice.status !== 'approved' || !invoice.approvedByUserId) throw makeError(409, 'Approve the invoice before creating a Stripe payment link.');
      const amountCents = Number(invoice.totals?.totalCents || 0);
      if (!Number.isFinite(amountCents) || amountCents <= 0) throw makeError(409, 'Invoice total must be greater than zero before creating a payment link.');
      const snapshotSha256 = paymentSnapshotHash(invoice);
      const activePayment = activePaymentRecord(invoiceId, mode);
      if (activePayment) {
        if (activePayment.snapshotSha256 === snapshotSha256) {
          if (activePayment.status === 'paid') throw makeError(409, 'This invoice is already paid.');
          return { invoice, paymentRequest: { ...paymentSummary(activePayment), idempotencyKey: activePayment.idempotencyKey, metadata: activePayment.metadata }, reused: true };
        }
        throw makeError(409, 'This invoice already has an active payment link for a different snapshot. Supersede or expire it before creating another link.');
      }
      const existingPayment = Array.from(paymentRequests.values())
        .filter((payment) => !payment.deleted && payment.invoiceId === invoiceId && payment.mode === mode && payment.snapshotSha256 === snapshotSha256)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
      if (existingPayment) {
        if (!['failed', 'expired', 'canceled'].includes(existingPayment.status)) throw makeError(409, 'This invoice already has a terminal Stripe payment record for this snapshot.');
        const resetPayment = {
          ...existingPayment,
          status: 'creating',
          url: '',
          checkoutSessionId: '',
          paymentIntentId: '',
          customerId: '',
          expiresAt: '',
          paidAt: '',
          updatedAt: '2026-05-29T00:40:00.000Z',
        };
        paymentRequests.set(existingPayment.id, resetPayment);
        return { invoice, paymentRequest: { ...paymentSummary(resetPayment), idempotencyKey: resetPayment.idempotencyKey, metadata: resetPayment.metadata }, reused: false };
      }
      paymentRequestSequence += 1;
      const id = `pay-${paymentRequestSequence}`;
      const entityId = cleanEntityId(invoice.entityId || 'wawco');
      const metadata = {
        fin_invoice_id: invoiceId,
        fin_payment_request_id: id,
        fin_invoice_number: invoice.invoiceNumber,
        fin_invoice_snapshot_sha256: snapshotSha256,
        fin_environment: mode,
        fin_entity_id: entityId,
        fin_stripe_account_key: entityById(entityId).stripeAccountKey || 'default',
      };
      const record = {
        id,
        invoiceId,
        entityId,
        invoiceNumber: invoice.invoiceNumber,
        snapshotSha256,
        mode,
        status: 'creating',
        amountCents,
        currency: invoice.currency || 'USD',
        url: '',
        urlKind: 'checkout_session',
        checkoutSessionId: '',
        paymentIntentId: '',
        customerId: '',
        expiresAt: '',
        paidAt: '',
        idempotencyKey: `fin-checkout-${mode}-${invoiceId}-${snapshotSha256}`,
        metadata,
        updatedAt: `2026-05-29T00:${String(paymentRequestSequence).padStart(2, '0')}:00.000Z`,
      };
      paymentRequests.set(id, record);
      return { invoice, paymentRequest: { ...paymentSummary(record), idempotencyKey: record.idempotencyKey, metadata }, reused: false };
    },
    async activateInvoicePaymentRequest(user, paymentRequestId, session = {}) {
      const currentUser = userRow(user);
      if (currentUser.role !== 'admin') throw makeError(403, 'Only Fin admins can activate Stripe payment links.');
      const existing = paymentRequests.get(paymentRequestId);
      if (!existing || existing.deleted) throw makeError(404, 'Payment request not found.');
      const record = {
        ...existing,
        status: 'active',
        url: String(session.url || ''),
        checkoutSessionId: String(session.id || ''),
        paymentIntentId: String(session.paymentIntentId || ''),
        customerId: String(session.customerId || ''),
        expiresAt: String(session.expiresAt || ''),
        updatedAt: '2026-05-29T00:30:00.000Z',
      };
      paymentRequests.set(paymentRequestId, record);
      return paymentSummary(record);
    },
    async failInvoicePaymentRequest(user, paymentRequestId) {
      userRow(user);
      const existing = paymentRequests.get(paymentRequestId);
      if (existing && !existing.deleted) {
        paymentRequests.set(paymentRequestId, { ...existing, status: 'failed', updatedAt: '2026-05-29T00:31:00.000Z' });
      }
    },
    async createInvoiceCustomerPaymentPage(user, invoiceId, mode = 'test', baseUrl = 'http://127.0.0.1:3321') {
      const currentUser = userRow(user);
      if (currentUser.role !== 'admin') throw makeError(403, 'Only Fin admins can create customer payment pages.');
      if (!['test', 'live'].includes(mode)) throw makeError(400, 'Stripe mode must be test or live.');
      const invoice = records.get(invoiceId);
      if (!invoice || invoice.deleted) throw makeError(404, 'Invoice draft not found.');
      if (invoice.status !== 'approved' || !invoice.approvedByUserId) throw makeError(409, 'Approve the invoice before creating a payment link.');
      const amountCents = Number(invoice.totals?.totalCents || 0);
      if (!Number.isFinite(amountCents) || amountCents <= 0) throw makeError(409, 'Invoice total must be greater than zero before creating a payment link.');
      const snapshotSha256 = paymentSnapshotHash(invoice);
      const activePayment = activePaymentRecord(invoiceId, mode, 'customer_choice');
      if (activePayment) {
        if (activePayment.snapshotSha256 === snapshotSha256) return { invoice, paymentRequest: paymentSummary(activePayment), reused: true };
        throw makeError(409, 'This invoice already has an active customer payment page for a different snapshot.');
      }
      const conflictingPayment = activePaymentRecord(invoiceId, mode, '');
      if (conflictingPayment) {
        if (conflictingPayment.status === 'paid') throw makeError(409, 'This invoice is already paid.');
        throw makeError(409, 'This invoice already has active Stripe checkout activity. Expire, cancel, or supersede it before creating a customer payment page.');
      }
      paymentRequestSequence += 1;
      const id = `pay-page-${paymentRequestSequence}`;
      const entityId = cleanEntityId(invoice.entityId || 'wawco');
      const token = `smoke-token-${paymentRequestSequence}-${crypto.randomBytes(8).toString('hex')}`;
      const publicUrl = `${String(baseUrl).replace(/\/$/, '')}/pay?t=${encodeURIComponent(token)}`;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const metadata = {
        fin_invoice_id: invoiceId,
        fin_payment_request_id: id,
        fin_invoice_number: invoice.invoiceNumber,
        fin_invoice_snapshot_sha256: snapshotSha256,
        fin_environment: mode,
        fin_entity_id: entityId,
        fin_stripe_account_key: entityById(entityId).stripeAccountKey || 'default',
        fin_payment_method_family: 'customer_choice',
      };
      const record = {
        id,
        invoiceId,
        entityId,
        invoiceNumber: invoice.invoiceNumber,
        snapshotSha256,
        mode,
        status: 'active',
        amountCents,
        currency: invoice.currency || 'USD',
        url: publicUrl,
        urlKind: 'customer_payment_page',
        publicUrl,
        token,
        tokenHash,
        tokenHint: token.slice(-8),
        checkoutSessionId: '',
        paymentIntentId: '',
        customerId: '',
        paymentMethodFamily: 'customer_choice',
        paymentMethodType: '',
        feePolicy: 'method_specific_choice',
        baseAmountCents: amountCents,
        clientProcessingCostCents: 0,
        collectionAmountCents: amountCents,
        expectedStripeFeeCents: 0,
        expectedNetCents: amountCents,
        expectedFeeFormula: { version: 'customer-choice' },
        feeDisclosureText: 'Choose bank account or card before Stripe Checkout.',
        reconciliationStatus: 'not_started',
        idempotencyKey: `fin-paypage-${mode}-${invoiceId}-${snapshotSha256}`,
        metadata,
        updatedAt: `2026-05-29T00:${String(paymentRequestSequence).padStart(2, '0')}:00.000Z`,
      };
      paymentRequests.set(id, record);
      records.set(invoiceId, { ...invoice, paymentStatus: 'link_ready' });
      return { invoice, paymentRequest: paymentSummary(record), reused: false };
    },
    async getPublicPaymentPage(token) {
      const tokenHash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
      const page = Array.from(paymentRequests.values()).find((payment) => !payment.deleted && payment.tokenHash === tokenHash && payment.paymentMethodFamily === 'customer_choice' && ['active', 'processing', 'paid'].includes(payment.status));
      if (!page) throw makeError(404, 'Payment page not found.');
      const invoice = records.get(page.invoiceId);
      if (!invoice || invoice.deleted || !['approved', 'issued', 'paid'].includes(invoice.status)) throw makeError(404, 'Payment page not found.');
      const methodRows = Array.from(paymentRequests.values()).filter((payment) => !payment.deleted && payment.invoiceId === page.invoiceId && payment.mode === page.mode && payment.tokenHash === tokenHash && ['bank_account', 'card'].includes(payment.paymentMethodFamily));
      const latestByMethod = Object.fromEntries(methodRows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map((payment) => [payment.paymentMethodFamily, paymentSummary(payment)]));
      return {
        page: { status: page.status, mode: page.mode, paymentStatus: invoice.paymentStatus || 'none', tokenHint: page.tokenHint, updatedAt: page.updatedAt },
        invoice: {
          entityId: cleanEntityId(invoice.entityId || 'wawco'),
          entity: publicEntity(invoice.entityId || 'wawco'),
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          currency: invoice.currency || 'USD',
          project: invoice.project || '',
          invoiceDate: invoice.invoiceDate || '',
          dueDate: invoice.dueDate || '',
          from: { name: invoice.from?.name || entityById(invoice.entityId || 'wawco').name || 'What are we capable of?', email: invoice.from?.email || entityById(invoice.entityId || 'wawco').email || 'hello@whatarewecapableof.com' },
          client: { label: invoiceClientLabel(invoice), name: invoice.client?.name || '', company: invoice.client?.company || '', email: invoice.client?.email || '' },
          notes: invoice.notes || '',
          terms: invoice.terms || '',
          items: invoice.items || [],
          totals: invoice.totals || {},
        },
        amountCents: page.baseAmountCents,
        currency: invoice.currency || 'USD',
        methods: customerPaymentMethods(page.baseAmountCents).map((quote) => ({
          method: quote.method,
          label: quote.customerLabel,
          shortCopy: quote.shortCopy,
          paymentMethodType: quote.paymentMethodType,
          feePolicy: quote.feePolicy,
          baseAmountCents: quote.baseAmountCents,
          clientProcessingCostCents: quote.clientProcessingCostCents,
          collectionAmountCents: quote.collectionAmountCents,
          expectedStripeFeeCents: quote.expectedStripeFeeCents,
          expectedNetCents: quote.expectedNetCents,
          disclosureText: quote.disclosureText,
          status: latestByMethod[quote.paymentMethodFamily]?.status || 'available',
          active: Boolean(latestByMethod[quote.paymentMethodFamily]?.active),
        })),
      };
    },
    async createCustomerCheckoutPaymentRequest(token, methodInput) {
      const tokenHash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
      const method = cleanPaymentMethod(methodInput);
      const page = Array.from(paymentRequests.values()).find((payment) => !payment.deleted && payment.tokenHash === tokenHash && payment.paymentMethodFamily === 'customer_choice' && ['active', 'processing', 'paid'].includes(payment.status));
      if (!page) throw makeError(404, 'Payment page not found.');
      const invoice = records.get(page.invoiceId);
      if (!invoice || invoice.deleted || !['approved', 'issued'].includes(invoice.status)) throw makeError(409, 'This invoice is not currently payable.');
      const snapshotSha256 = paymentSnapshotHash(invoice);
      if (snapshotSha256 !== page.snapshotSha256) throw makeError(409, 'This payment page no longer matches the current invoice snapshot. Ask for a fresh link.');
      const quote = paymentMethodQuote(page.baseAmountCents, method);
      const activePayment = activePaymentRecord(page.invoiceId, page.mode, quote.paymentMethodFamily);
      if (activePayment) {
        if (activePayment.snapshotSha256 === snapshotSha256 && activePayment.status === 'active' && activePayment.url) return { invoice, paymentRequest: { ...paymentSummary(activePayment), idempotencyKey: activePayment.idempotencyKey, metadata: activePayment.metadata }, reused: true };
        throw makeError(409, 'Checkout creation is already in progress. Try again shortly.');
      }
      const existingPayment = Array.from(paymentRequests.values())
        .filter((payment) => !payment.deleted && payment.invoiceId === page.invoiceId && payment.mode === page.mode && payment.paymentMethodFamily === quote.paymentMethodFamily && payment.snapshotSha256 === snapshotSha256)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
      if (existingPayment) {
        if (!['failed', 'expired', 'canceled'].includes(existingPayment.status)) throw makeError(409, 'This invoice already has a terminal Stripe payment record for this method.');
        const resetPayment = {
          ...existingPayment,
          status: 'creating',
          amountCents: quote.collectionAmountCents,
          url: '',
          checkoutSessionId: '',
          paymentIntentId: '',
          customerId: '',
          expiresAt: '',
          paidAt: '',
          updatedAt: '2026-05-29T00:40:00.000Z',
        };
        paymentRequests.set(existingPayment.id, resetPayment);
        return { invoice, paymentRequest: { ...paymentSummary(resetPayment), idempotencyKey: resetPayment.idempotencyKey, metadata: resetPayment.metadata }, reused: false };
      }
      paymentRequestSequence += 1;
      const id = `pay-${paymentRequestSequence}`;
      const entityId = cleanEntityId(invoice.entityId || page.entityId || 'wawco');
      const metadata = {
        fin_invoice_id: page.invoiceId,
        fin_payment_request_id: id,
        fin_invoice_number: invoice.invoiceNumber,
        fin_invoice_snapshot_sha256: snapshotSha256,
        fin_environment: page.mode,
        fin_entity_id: entityId,
        fin_stripe_account_key: entityById(entityId).stripeAccountKey || 'default',
        fin_payment_method_family: quote.paymentMethodFamily,
        fin_payment_method_type: quote.paymentMethodType,
        fin_fee_policy: quote.feePolicy,
        fin_base_amount_cents: String(quote.baseAmountCents),
        fin_collection_amount_cents: String(quote.collectionAmountCents),
        fin_client_processing_cost_cents: String(quote.clientProcessingCostCents),
      };
      const record = {
        id,
        invoiceId: page.invoiceId,
        entityId,
        invoiceNumber: invoice.invoiceNumber,
        snapshotSha256,
        mode: page.mode,
        status: 'creating',
        amountCents: quote.collectionAmountCents,
        currency: invoice.currency || 'USD',
        url: '',
        urlKind: 'checkout_session',
        publicUrl: page.publicUrl,
        tokenHash,
        tokenHint: page.tokenHint,
        checkoutSessionId: '',
        paymentIntentId: '',
        customerId: '',
        paymentMethodFamily: quote.paymentMethodFamily,
        paymentMethodType: quote.paymentMethodType,
        feePolicy: quote.feePolicy,
        baseAmountCents: quote.baseAmountCents,
        clientProcessingCostCents: quote.clientProcessingCostCents,
        collectionAmountCents: quote.collectionAmountCents,
        expectedStripeFeeCents: quote.expectedStripeFeeCents,
        expectedNetCents: quote.expectedNetCents,
        expectedFeeFormula: quote.formula,
        feeDisclosureText: quote.disclosureText,
        reconciliationStatus: 'pending_payment',
        idempotencyKey: `fin-checkout-${page.mode}-${method}-${page.invoiceId}-${snapshotSha256}`,
        metadata,
        updatedAt: `2026-05-29T00:${String(paymentRequestSequence).padStart(2, '0')}:00.000Z`,
      };
      paymentRequests.set(id, record);
      return { invoice, paymentRequest: { ...paymentSummary(record), idempotencyKey: record.idempotencyKey, metadata }, reused: false };
    },
    async activateCustomerCheckoutPaymentRequest(paymentRequestId, session = {}) {
      const existing = paymentRequests.get(paymentRequestId);
      if (!existing || existing.deleted) throw makeError(404, 'Payment request not found.');
      const record = {
        ...existing,
        status: 'active',
        url: String(session.url || ''),
        checkoutSessionId: String(session.id || ''),
        paymentIntentId: String(session.paymentIntentId || ''),
        customerId: String(session.customerId || ''),
        expiresAt: String(session.expiresAt || ''),
        updatedAt: '2026-05-29T00:30:00.000Z',
      };
      paymentRequests.set(paymentRequestId, record);
      const invoice = records.get(record.invoiceId);
      if (invoice && !invoice.deleted) records.set(record.invoiceId, { ...invoice, paymentStatus: 'link_ready' });
      return paymentSummary(record);
    },
    async failCustomerCheckoutPaymentRequest(paymentRequestId) {
      const existing = paymentRequests.get(paymentRequestId);
      if (existing && !existing.deleted) {
        paymentRequests.set(paymentRequestId, { ...existing, status: 'failed', updatedAt: '2026-05-29T00:31:00.000Z' });
      }
    },
    async processStripeEvent(event = {}) {
      const eventId = String(event.id || '');
      if (!eventId) throw makeError(400, 'Stripe event id is required.');
      if (stripeEvents.has(eventId)) return { duplicate: true, status: 'ignored', eventId };
      const mode = event.livemode ? 'live' : 'test';
      const type = String(event.type || '');
      const object = event.data?.object || {};
      const eventEntityId = cleanEntityId(event.finEntityId || object.metadata?.fin_entity_id || 'wawco');
      const payment = findPaymentForStripeObject(type, object, eventEntityId);
      if (!payment) {
        stripeEvents.set(eventId, { status: 'ignored', reason: 'payment-request-not-found' });
        return { duplicate: false, status: 'ignored', reason: 'payment-request-not-found', eventId };
      }
      const paymentEntityId = cleanEntityId(payment.entityId || payment.metadata?.fin_entity_id || 'wawco');
      if (eventEntityId !== paymentEntityId) {
        stripeEvents.set(eventId, { status: 'failed', reason: 'entity-mismatch' });
        throw makeError(400, 'Stripe event entity does not match the Fin payment request.');
      }
      if (payment.mode !== mode) {
        stripeEvents.set(eventId, { status: 'failed', reason: 'mode-mismatch' });
        throw makeError(400, 'Stripe event mode does not match the Fin payment request.');
      }
      const amountCents = stripeObjectAmountCents(object);
      const currency = String(object.currency || payment.currency || 'USD').toUpperCase();
      if (amountCents && amountCents !== payment.amountCents) {
        stripeEvents.set(eventId, { status: 'failed', reason: 'amount-mismatch' });
        throw makeError(400, 'Stripe event amount does not match the Fin payment snapshot.');
      }
      if (currency && currency !== payment.currency) {
        stripeEvents.set(eventId, { status: 'failed', reason: 'currency-mismatch' });
        throw makeError(400, 'Stripe event currency does not match the Fin payment snapshot.');
      }
      let nextStatus = '';
      let invoicePaymentStatus = '';
      if (type === 'checkout.session.completed') {
        nextStatus = object.payment_status === 'paid' ? 'paid' : 'processing';
        invoicePaymentStatus = nextStatus === 'paid' ? 'paid' : 'processing';
      } else if (type === 'checkout.session.expired') {
        nextStatus = 'expired';
        invoicePaymentStatus = 'expired';
      } else if (type === 'payment_intent.processing') {
        nextStatus = 'processing';
        invoicePaymentStatus = 'processing';
      } else if (type === 'payment_intent.succeeded') {
        nextStatus = 'paid';
        invoicePaymentStatus = 'paid';
      } else if (type === 'payment_intent.payment_failed') {
        nextStatus = 'failed';
        invoicePaymentStatus = 'failed';
      } else if (type === 'payment_intent.canceled') {
        nextStatus = 'canceled';
        invoicePaymentStatus = 'failed';
      } else if (type === 'charge.succeeded') {
        nextStatus = 'paid';
        invoicePaymentStatus = 'paid';
      } else if (type === 'charge.refunded') {
        nextStatus = 'refunded';
        invoicePaymentStatus = 'refunded';
      } else if (type.startsWith('charge.dispute.')) {
        nextStatus = 'disputed';
        invoicePaymentStatus = 'disputed';
      } else {
        stripeEvents.set(eventId, { status: 'ignored', reason: 'event-not-handled', paymentRequestId: payment.id });
        return { duplicate: false, status: 'ignored', reason: 'event-not-handled', eventId };
      }
      const allowedAfterTerminal = {
        paid: ['paid', 'refunded', 'disputed'],
        refunded: ['refunded', 'disputed'],
        disputed: ['disputed', 'refunded'],
      };
      if (allowedAfterTerminal[payment.status] && !allowedAfterTerminal[payment.status].includes(nextStatus)) {
        stripeEvents.set(eventId, { status: 'ignored', reason: 'stale-state-transition', paymentRequestId: payment.id });
        return { duplicate: false, status: 'ignored', reason: 'stale-state-transition', eventId };
      }
      if (['expired', 'failed', 'canceled'].includes(payment.status) && nextStatus === 'processing') {
        stripeEvents.set(eventId, { status: 'ignored', reason: 'stale-state-transition', paymentRequestId: payment.id });
        return { duplicate: false, status: 'ignored', reason: 'stale-state-transition', eventId };
      }
      const balanceTransaction = object.balance_transaction && typeof object.balance_transaction === 'object' ? object.balance_transaction : null;
      const record = {
        ...payment,
        status: nextStatus,
        paymentIntentId: String(type.startsWith('payment_intent.') ? object.id : object.payment_intent || payment.paymentIntentId || ''),
        chargeId: String(type.startsWith('charge.') ? object.id : object.latest_charge || payment.chargeId || ''),
        balanceTransactionId: typeof object.balance_transaction === 'string' ? object.balance_transaction : balanceTransaction?.id || payment.balanceTransactionId || '',
        actualStripeFeeCents: Number.isFinite(Number(balanceTransaction?.fee)) ? Number(balanceTransaction.fee) : payment.actualStripeFeeCents ?? null,
        actualNetCents: Number.isFinite(Number(balanceTransaction?.net)) ? Number(balanceTransaction.net) : payment.actualNetCents ?? null,
        reconciliationStatus: balanceTransaction ? 'reconciled' : nextStatus === 'paid' ? 'pending_stripe_fee' : payment.reconciliationStatus,
        paymentMethodDetails: object.payment_method_details ? { type: object.payment_method_details.type || '' } : payment.paymentMethodDetails,
        paidAt: nextStatus === 'paid' ? '2026-05-29T01:00:00.000Z' : payment.paidAt,
        updatedAt: '2026-05-29T01:00:00.000Z',
      };
      paymentRequests.set(payment.id, record);
      const invoice = records.get(payment.invoiceId);
      if (invoice && !invoice.deleted) {
        records.set(payment.invoiceId, {
          ...invoice,
          status: nextStatus === 'paid' ? 'paid' : invoice.status,
          paymentStatus: invoicePaymentStatus,
        });
      }
      stripeEvents.set(eventId, { status: 'processed', paymentRequestId: payment.id, invoiceId: payment.invoiceId, mode, entityId: payment.entityId || 'wawco' });
      return { duplicate: false, status: 'processed', eventId, payment: paymentSummary(record) };
    },
    async createFinanceImport(user, input) {
      if (process.env.FIN_FINANCE_IMPORTS_ENABLED === '0') {
        const error = new Error('Finance dashboard imports are disabled.');
        error.status = 403;
        throw error;
      }
      const currentUser = userRow(user);
      if (currentUser.role !== 'admin') {
        const error = new Error('Only Fin admins can import finance dashboard summaries.');
        error.status = 403;
        throw error;
      }
      financeImportSequence += 1;
      const normalized = normalizeFinanceImport(input);
      const record = {
        id: `finance-import-${financeImportSequence}`,
        schemaVersion: normalized.schemaVersion,
        month: normalized.month,
        label: normalized.label,
        data: normalized.data,
        contentSha256: normalized.contentSha256,
        stableContentSha256: normalized.stableContentSha256,
        validatorVersion: normalized.validatorVersion,
        importedAt: `2099-12-31T00:0${financeImportSequence}:00.000Z`,
      };
      financeImports.set(record.id, record);
      return summarizeFinanceImport(record);
    },
    async claimFinanceSystemImportNonce(auth = {}) {
      const key = `${auth.keyId}:${auth.nonce}`;
      if (systemImportNonces.has(key)) {
        const error = new Error('System import nonce has already been used.');
        error.status = 409;
        throw error;
      }
      systemImportNonces.add(key);
      return true;
    },
    async createSystemFinanceImport(actor, input, auth = {}) {
      if (process.env.FIN_FINANCE_IMPORTS_ENABLED === '0') {
        const error = new Error('Finance dashboard imports are disabled.');
        error.status = 403;
        throw error;
      }
      const normalized = normalizeFinanceImport(input);
      const duplicate = Array.from(financeImports.values())
        .filter((item) => !item.deleted && item.month === normalized.month && item.stableContentSha256 === normalized.stableContentSha256)
        .sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)))[0] || null;
      if (duplicate) {
        return { skipped: true, reason: 'duplicate-content', import: summarizeFinanceImport(duplicate) };
      }
      financeImportSequence += 1;
      const record = {
        id: `finance-import-${financeImportSequence}`,
        schemaVersion: normalized.schemaVersion,
        month: normalized.month,
        label: normalized.label,
        data: normalized.data,
        contentSha256: normalized.contentSha256,
        stableContentSha256: normalized.stableContentSha256,
        validatorVersion: normalized.validatorVersion,
        importedAt: `2099-12-31T00:0${financeImportSequence}:00.000Z`,
        actorType: 'system',
        keyId: auth.keyId,
      };
      financeImports.set(record.id, record);
      return { skipped: false, reason: '', import: summarizeFinanceImport(record) };
    },
    async listFinanceImports(user) {
      const currentUser = userRow(user);
      if (currentUser.role !== 'admin') {
        const error = new Error('Only Fin admins can list finance dashboard imports.');
        error.status = 403;
        throw error;
      }
      return Array.from(financeImports.values())
        .filter((item) => !item.deleted)
        .sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)))
        .map(summarizeFinanceImport);
    },
    async deleteFinanceImport(user, id) {
      const currentUser = userRow(user);
      if (currentUser.role !== 'admin') {
        const error = new Error('Only Fin admins can delete finance dashboard imports.');
        error.status = 403;
        throw error;
      }
      const existing = financeImports.get(id);
      if (!existing || existing.deleted) return false;
      financeImports.set(id, { ...existing, deleted: true });
      return true;
    },
    async financeSummary(user, options = {}) {
      const currentUser = userRow(user);
      const invoices = visibleInvoices();
      const requestedEntity = String(options.entity || options.entityId || 'wawco').toLowerCase();
      const entityFilter = requestedEntity === 'combined' ? 'combined' : cleanEntityId(requestedEntity || 'wawco');
      const entityScoped = invoices.filter((invoice) => matchesEntityFilter(invoice, entityFilter));
      const visible = entityScoped.filter((invoice) => !isDashboardExcluded(invoice));
      const excluded = entityScoped.filter(isDashboardExcluded);
      const excludedEntityCount = invoices.length - entityScoped.length;
      const entitySupportsFinanceImports = entityFilter === 'wawco' || entityFilter === 'combined';
      const importRows = currentUser.role === 'admin' && entitySupportsFinanceImports
        ? Array.from(financeImports.values()).filter((item) => !item.deleted)
        : [];
      const importMonths = importRows.map((item) => item.month).filter(Boolean);
      const invoiceMonths = visible.map((invoice) => String(invoice.invoiceDate || '').slice(0, 7)).filter(Boolean);
      const months = [...new Set([...invoiceMonths, ...importMonths])].sort();
      const month = options.month || months.at(-1) || '2026-05';
      const latestImport = importRows
        .filter((item) => !month || item.month === month)
        .sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)))[0] || null;
      const byStatus = Array.from(visible.reduce((map, invoice) => {
        const current = map.get(invoice.status) || { status: invoice.status, invoiceCount: 0, totalCents: 0 };
        current.invoiceCount += 1;
        current.totalCents += invoice.totals.totalCents;
        map.set(invoice.status, current);
        return map;
      }, new Map()).values());
      const hostedRows = visible.map((invoice) => {
        const latestPayment = latestPaymentRecord(invoice.id);
        return {
          id: invoice.id,
          entityId: cleanEntityId(invoice.entityId || 'wawco'),
          entityLabel: publicEntity(invoice.entityId || 'wawco').label,
          entityName: publicEntity(invoice.entityId || 'wawco').name,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          clientLabel: invoiceClientLabel(invoice),
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          month: String(invoice.invoiceDate || '').slice(0, 7),
          amountCents: invoice.totals.totalCents,
          paymentStatus: invoice.paymentStatus || 'none',
          paymentMode: latestPayment?.mode || '',
          paymentRequestStatus: latestPayment?.status || '',
          paymentExpiresAt: latestPayment?.expiresAt || '',
          paymentUpdatedAt: latestPayment?.updatedAt || '',
          dueState: 'due_soon',
        };
      });
      const readyForReviewCents = visible.filter((invoice) => invoice.status === 'ready_for_review').reduce((sum, invoice) => sum + invoice.totals.totalCents, 0);
      const totalCents = visible.reduce((sum, invoice) => sum + invoice.totals.totalCents, 0);
      const paymentActiveRows = hostedRows.filter((invoice) => ['link_ready', 'processing'].includes(invoice.paymentStatus) || ['active', 'processing'].includes(invoice.paymentRequestStatus));
      const paymentPaidRows = hostedRows.filter((invoice) => invoice.paymentStatus === 'paid' || invoice.paymentRequestStatus === 'paid');
      const paymentSummary = Array.from(hostedRows.reduce((map, invoice) => {
        const key = invoice.paymentStatus || 'none';
        const current = map.get(key) || { status: key, invoiceCount: 0, count: 0, totalCents: 0, amountCents: 0 };
        current.invoiceCount += 1;
        current.count += 1;
        current.totalCents += invoice.amountCents;
        current.amountCents += invoice.amountCents;
        map.set(key, current);
        return map;
      }, new Map()).values());
      const baseMetrics = {
        totalAvailableBalanceCents: 0,
        totalCurrentBalanceCents: 0,
        inflowCents: 0,
        outflowCents: 0,
        netCents: 0,
        recurringKnownMonthlyCents: 0,
        recurringCurrentMonthlyCents: 0,
        recurringTentativeMonthlyCents: 0,
        recurringUnknownCount: 0,
        recurringTentativeCount: 0,
        activeCardCount: 0,
        activeCardLabelCount: 0,
        cardSpendCents: 0,
        cardExpenseCount: 0,
        possiblePersonalFundedCardCents: 0,
        unmatchedCardExpenseCents: 0,
        transactionCount: 0,
        mercuryInvoiceOpenCents: 0,
        hostedInvoiceOpenCents: totalCents,
        hostedInvoiceReadyCents: readyForReviewCents,
        hostedInvoiceOverdueCents: 0,
        localInvoiceOpenCents: totalCents,
      };
      const imported = latestImport?.data || fakeFinanceImportSummary(month);
      const hasImport = Boolean(latestImport);
      const metrics = hasImport
        ? { ...baseMetrics, ...imported.metrics, mercuryInvoiceOpenCents: 0, hostedInvoiceOpenCents: totalCents, hostedInvoiceReadyCents: readyForReviewCents, hostedInvoiceOverdueCents: 0, localInvoiceOpenCents: totalCents }
        : baseMetrics;
      return {
        scope: currentUser.role === 'admin' ? 'workspace' : 'own_drafts',
        permissions: { canImportFinanceSummary: currentUser.role === 'admin' },
        generatedAt: hasImport ? imported.generatedAt : '2026-05-28T00:00:00.000Z',
        month,
        months,
        entityFilter,
        entityLabel: entityFilter === 'combined' ? 'Combined' : publicEntity(entityFilter).label,
        entities: [{ id: 'combined', label: 'Combined', name: 'Combined' }, ...entities],
        invoiceCount: visible.length,
        totalCents,
        readyForReviewCents,
        excludedEntityCount,
        excludedPrivatePayeeCount: excluded.length,
        lastUpdatedAt: '2026-05-28T00:00:00.000Z',
        latestFinanceImport: hasImport ? summarizeFinanceImport(latestImport) : null,
        byStatus,
        sources: hasImport ? { ...imported.sources, hostedInvoiceStore: 'fake fin_invoices', invoiceSource: 'hosted Fin invoices' } : { hostedInvoiceStore: 'fake fin_invoices', financeSnapshot: 'none', invoiceSource: 'hosted Fin invoices' },
        metrics,
        mercury: hasImport ? imported.mercury : { spendByCounterparty: [], activeCards: [], cardSpend: [], observedCardExpenses: { expenses: [], batches: [], fundingTransfers: [] }, recentTransactions: [], invoices: [], invoiceSummary: [], snapshotMonths: [] },
        recurring: hasImport ? imported.recurring : { items: [], error: '', validationWarnings: [] },
        hostedInvoices: {
          visibleCount: visible.length,
          entityFilter,
          entityLabel: entityFilter === 'combined' ? 'Combined' : publicEntity(entityFilter).label,
          excludedEntityCount,
          excludedPrivatePayeeCount: excluded.length,
          invoices: hostedRows,
          monthInvoices: hostedRows.filter((invoice) => invoice.month === month || !month),
          summary: byStatus.map((row) => ({ status: row.status, count: row.invoiceCount, amountCents: row.totalCents })),
          monthSummary: byStatus.map((row) => ({ status: row.status, count: row.invoiceCount, amountCents: row.totalCents })),
          openReceivablesCents: totalCents,
          overdue: [],
          overdueCents: 0,
          dueSoon: hostedRows,
          dueSoonCents: totalCents,
          readyForReviewCount: visible.filter((invoice) => invoice.status === 'ready_for_review').length,
          readyForReviewCents,
          paymentSummary,
          paymentLinkedCount: hostedRows.filter((invoice) => invoice.paymentStatus !== 'none').length,
          paymentLinkedCents: hostedRows.filter((invoice) => invoice.paymentStatus !== 'none').reduce((sum, invoice) => sum + invoice.amountCents, 0),
          paymentActiveCount: paymentActiveRows.length,
          paymentActiveCents: paymentActiveRows.reduce((sum, invoice) => sum + invoice.amountCents, 0),
          paymentPaidCount: paymentPaidRows.length,
          paymentPaidCents: paymentPaidRows.reduce((sum, invoice) => sum + invoice.amountCents, 0),
        },
        exceptions: hasImport ? imported.exceptions : [{ severity: 'watch', label: 'No hosted Mercury or Stripe summary imported', detail: 'Smoke placeholder.' }],
      };
    },
  };

  const dbPath = require.resolve('../api/_db.js');
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: fakeDb,
  };
}

async function runAuthenticatedRouteSmoke() {
  const envBackup = {
    FIN_GOOGLE_CLIENT_ID: process.env.FIN_GOOGLE_CLIENT_ID,
    FIN_GOOGLE_CLIENT_SECRET: process.env.FIN_GOOGLE_CLIENT_SECRET,
    FIN_SESSION_SECRET: process.env.FIN_SESSION_SECRET,
    FIN_ALLOWED_DOMAIN: process.env.FIN_ALLOWED_DOMAIN,
    FIN_ALLOWED_EMAILS: process.env.FIN_ALLOWED_EMAILS,
    FIN_STORAGE_MODE: process.env.FIN_STORAGE_MODE,
    POSTGRES_URL: process.env.POSTGRES_URL,
    FIN_FINANCE_IMPORTS_ENABLED: process.env.FIN_FINANCE_IMPORTS_ENABLED,
    FIN_FINANCE_SYSTEM_IMPORTS_ENABLED: process.env.FIN_FINANCE_SYSTEM_IMPORTS_ENABLED,
    FIN_FINANCE_SYSTEM_IMPORT_KEY_ID: process.env.FIN_FINANCE_SYSTEM_IMPORT_KEY_ID,
    FIN_FINANCE_SYSTEM_IMPORT_SECRET: process.env.FIN_FINANCE_SYSTEM_IMPORT_SECRET,
    FIN_FINANCE_SYSTEM_IMPORT_MAX_SKEW_SECONDS: process.env.FIN_FINANCE_SYSTEM_IMPORT_MAX_SKEW_SECONDS,
    FIN_STRIPE_FAKE: process.env.FIN_STRIPE_FAKE,
    STRIPE_MODE: process.env.STRIPE_MODE,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_ACCOUNT_ID: process.env.STRIPE_ACCOUNT_ID,
    STRIPE_SECRET_KEY_NDG: process.env.STRIPE_SECRET_KEY_NDG,
    STRIPE_WEBHOOK_SECRET_NDG: process.env.STRIPE_WEBHOOK_SECRET_NDG,
    STRIPE_ACCOUNT_ID_NDG: process.env.STRIPE_ACCOUNT_ID_NDG,
    FIN_STRIPE_TEST_LINKS_ENABLED: process.env.FIN_STRIPE_TEST_LINKS_ENABLED,
    FIN_STRIPE_LIVE_LINKS_ENABLED: process.env.FIN_STRIPE_LIVE_LINKS_ENABLED,
  };

  process.env.FIN_GOOGLE_CLIENT_ID = 'fin-smoke-client';
  process.env.FIN_GOOGLE_CLIENT_SECRET = 'fin-smoke-secret';
  process.env.FIN_SESSION_SECRET = 'fin-smoke-session-secret-32-bytes';
  process.env.FIN_ALLOWED_DOMAIN = 'whatarewecapableof.com';
  process.env.FIN_ALLOWED_EMAILS = 'noah@whatarewecapableof.com,rep@whatarewecapableof.com';
  process.env.FIN_STORAGE_MODE = 'postgres';
  process.env.POSTGRES_URL = 'postgres://user:pass@127.0.0.1:5432/fin_smoke';
  process.env.FIN_FINANCE_IMPORTS_ENABLED = '1';
  process.env.FIN_FINANCE_SYSTEM_IMPORTS_ENABLED = '1';
  process.env.FIN_FINANCE_SYSTEM_IMPORT_KEY_ID = 'smoke-mini-b';
  process.env.FIN_FINANCE_SYSTEM_IMPORT_SECRET = 'smoke-system-import-secret-32-byte-minimum';
  process.env.FIN_STRIPE_FAKE = '1';
  process.env.STRIPE_MODE = 'test';
  process.env.STRIPE_SECRET_KEY = '';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_smoke_webhook_secret';
  process.env.STRIPE_ACCOUNT_ID = 'acct_smoke_wawco';
  process.env.STRIPE_SECRET_KEY_NDG = '';
  process.env.STRIPE_WEBHOOK_SECRET_NDG = 'whsec_smoke_ndg_webhook_secret';
  process.env.STRIPE_ACCOUNT_ID_NDG = 'acct_smoke_ndg';
  process.env.FIN_STRIPE_TEST_LINKS_ENABLED = '1';
  process.env.FIN_STRIPE_LIVE_LINKS_ENABLED = '1';

  const cookie = sessionCookie(process.env.FIN_SESSION_SECRET);
  const repCookie = sessionCookie(process.env.FIN_SESSION_SECRET, { sub: 'fin-smoke-rep', email: 'rep@whatarewecapableof.com', name: 'Fin Smoke Rep' });
  const { fakeFinanceImportSummary } = require('../api/_finance_import.js');
  const { signSystemImportRequest } = require('../api/_system_import_auth.js');
  const routePaths = [
    require.resolve('../api/invoices.js'),
    require.resolve('../api/finance/summary.js'),
    require.resolve('../api/finance/import-summary.js'),
    require.resolve('../api/finance/system-import-summary.js'),
    require.resolve('../api/finance/imports.js'),
    require.resolve('../api/profiles.js'),
    require.resolve('../api/numbering.js'),
    require.resolve('../api/entities.js'),
    require.resolve('../api/stripe/checkout.js'),
    require.resolve('../api/pay.js'),
    require.resolve('../api/pay/checkout.js'),
    require.resolve('../api/stripe/webhook.js'),
    require.resolve('../api/_stripe.js'),
    require.resolve('../api/_payment_pricing.js'),
  ];
  routePaths.forEach((path) => delete require.cache[path]);
  installFakeFinDb();
  const invoiceHandler = require('../api/invoices.js');
  const summaryHandler = require('../api/finance/summary.js');
  const importSummaryHandler = require('../api/finance/import-summary.js');
  const systemImportSummaryHandler = require('../api/finance/system-import-summary.js');
  const importsHandler = require('../api/finance/imports.js');
  const profileHandler = require('../api/profiles.js');
  const numberingHandler = require('../api/numbering.js');
  const entitiesHandler = require('../api/entities.js');
  const fakeDb = require('../api/_db.js');
  const checkoutHandler = require('../api/stripe/checkout.js');
  const payHandler = require('../api/pay.js');
  const payCheckoutHandler = require('../api/pay/checkout.js');
  const webhookHandler = require('../api/stripe/webhook.js');
  const { signTestWebhookPayload } = require('../api/_stripe.js');
  const { cardGrossUpCents } = require('../api/_payment_pricing.js');

  try {
    for (const spec of [
      {
        type: 'payee',
        create: { label: 'Smoke payee', name: 'What are we capable of?', email: 'hello@whatarewecapableof.com', defaultTerms: 'Net 14', defaultPaymentInstructions: 'ACH only', reportingScope: 'wawco', mercuryDestinationAccountId: 'mercury-destination-smoke' },
        update: { label: 'Smoke payee updated', name: 'WAWCO', defaultTerms: 'Net 7', defaultPaymentInstructions: 'Wire after approval', reportingScope: 'private' },
      },
      {
        type: 'client',
        create: { label: 'Smoke client', company: 'Example client', email: 'client@example.test', mercuryCustomerId: 'mercury-customer-smoke', invoiceCode: 'EXAMPLE' },
        update: { label: 'Smoke client updated', company: 'Example client updated', email: 'updated@example.test', invoiceCode: 'EXUPDATED' },
      },
      {
        type: 'user',
        create: { label: 'Smoke rep', salesRep: 'Smoke Rep', salesRepEmail: 'rep@whatarewecapableof.com', salesRole: 'sales-rep' },
        update: { label: 'Smoke reviewer', salesRep: 'Smoke Reviewer', salesRepEmail: 'reviewer@whatarewecapableof.com', salesRole: 'reviewer' },
      },
    ]) {
      const listBefore = await callHandler(profileHandler, { method: 'GET', url: `/api/profiles?type=${spec.type}`, cookie });
      assert(listBefore.status === 200, `${spec.type} profile list smoke failed`);

      const created = await callHandler(profileHandler, { method: 'POST', url: `/api/profiles?type=${spec.type}`, cookie, body: { profile: spec.create } });
      assert(created.status === 201 && created.data.profile.type === spec.type, `${spec.type} profile create smoke failed`);
      assert(created.data.profile.label.includes('Smoke'), `${spec.type} profile label smoke failed`);

      const updated = await callHandler(profileHandler, { method: 'PUT', url: `/api/profiles?type=${spec.type}&id=${created.data.profile.id}`, cookie, body: { profile: spec.update } });
      const updateLabel = updated.data?.profile?.label || '';
      assert(updated.status === 200 && (updateLabel.includes('updated') || updateLabel.includes('reviewer')), `${spec.type} profile update smoke failed`);

      const deleted = await callHandler(profileHandler, { method: 'DELETE', url: `/api/profiles?type=${spec.type}&id=${created.data.profile.id}`, cookie });
      assert(deleted.status === 200 && deleted.data.deleted === true, `${spec.type} profile delete smoke failed`);
    }

    const publicPayee = await callHandler(profileHandler, {
      method: 'POST',
      url: '/api/profiles?type=payee',
      cookie,
      body: { profile: { label: 'WAWCO payee', name: 'What are we capable of?', email: 'hello@whatarewecapableof.com', reportingScope: 'wawco', defaultTerms: 'Net 14', defaultPaymentInstructions: 'ACH after approval' } },
    });
    const privatePayee = await callHandler(profileHandler, {
      method: 'POST',
      url: '/api/profiles?type=payee',
      cookie,
      body: { profile: { label: 'Private payee', name: 'Private Payee', email: 'private@example.test', reportingScope: 'private' } },
    });
    const client = await callHandler(profileHandler, {
      method: 'POST',
      url: '/api/profiles?type=client',
      cookie,
      body: { profile: { label: 'Generic client', company: 'Substrate', email: 'client@example.test', invoiceCode: 'SUBSTRATE' } },
    });
    const userProfile = await callHandler(profileHandler, {
      method: 'POST',
      url: '/api/profiles?type=user',
      cookie,
      body: { profile: { label: 'Generic rep', salesRep: 'Generic Rep', salesRepEmail: 'rep@whatarewecapableof.com', salesRole: 'sales-rep' } },
    });
    assert(publicPayee.status === 201 && privatePayee.status === 201 && client.status === 201 && userProfile.status === 201, 'profile-backed fixture create smoke failed');
    assert(privatePayee.data.profile.data.excludeFromWawcoDashboard === true, 'private profile dashboard exclusion smoke failed');

    const entitiesList = await callHandler(entitiesHandler, { method: 'GET', url: '/api/entities', cookie });
    assert(entitiesList.status === 200 && entitiesList.data.entities.some((entity) => entity.id === 'ndg'), 'entities endpoint smoke failed');

    const numberingBefore = await callHandler(numberingHandler, { method: 'GET', url: '/api/numbering', cookie });
    assert(numberingBefore.status === 200 && numberingBefore.data.numbering.mode === 'client-date-daily', 'numbering GET smoke failed');
    assert(numberingBefore.data.numbering.example === 'SUBSTRATE-052626-01', 'numbering example smoke failed');
    assert(numberingBefore.data.numbering.examples.ndg === 'NDG-SUBSTRATE-052626-01', 'NDG numbering example smoke failed');

    const numberingUpdated = await callHandler(numberingHandler, {
      method: 'PUT',
      url: '/api/numbering',
      cookie,
      body: { numbering: { sequencePadding: 2 } },
    });
    assert(numberingUpdated.status === 200 && numberingUpdated.data.numbering.sequencePadding === 2, 'numbering PUT smoke failed');

    const listEmpty = await callHandler(invoiceHandler, { method: 'GET', url: '/api/invoices', cookie });
    assert(listEmpty.status === 200 && listEmpty.data.invoices.length === 0, 'authenticated invoice list smoke failed');

    const repDraft = await callHandler(invoiceHandler, {
      method: 'POST',
      url: '/api/invoices',
      cookie: repCookie,
      body: {
        from: { name: 'What are we capable of?', email: 'hello@whatarewecapableof.com' },
        client: { company: 'Rep approval example', invoiceCode: 'REP' },
        invoiceDate: '2099-01-01',
        items: [{ description: 'Rep draft work', quantity: 1, unitPrice: '10.00' }],
      },
    });
    assert(repDraft.status === 201, 'rep draft create smoke failed');
    const repApproval = await callHandler(invoiceHandler, { method: 'PUT', url: `/api/invoices?id=${encodeURIComponent(repDraft.data.invoice.id)}`, cookie: repCookie, body: { status: 'approved' } });
    assert(repApproval.status === 403, 'non-admin approval gate smoke failed');
    const repApprovedCreate = await callHandler(invoiceHandler, {
      method: 'POST',
      url: '/api/invoices',
      cookie: repCookie,
      body: {
        status: 'approved',
        from: { name: 'What are we capable of?', email: 'hello@whatarewecapableof.com' },
        client: { company: 'Rep preapproved example', invoiceCode: 'REPAPPROVED' },
        invoiceDate: '2099-01-02',
        items: [{ description: 'Rep approved draft work', quantity: 1, unitPrice: '10.00' }],
      },
    });
    assert(repApprovedCreate.status === 403, 'non-admin create-approved gate smoke failed');
    const repDraftDeleted = await callHandler(invoiceHandler, { method: 'DELETE', url: `/api/invoices?id=${encodeURIComponent(repDraft.data.invoice.id)}`, cookie });
    assert(repDraftDeleted.status === 200 && repDraftDeleted.data.deleted === true, 'rep approval fixture cleanup smoke failed');

    const created = await callHandler(invoiceHandler, {
      method: 'POST',
      url: '/api/invoices',
      cookie,
      body: {
        payeeProfileId: publicPayee.data.profile.id,
        clientProfileId: client.data.profile.id,
        userProfileId: userProfile.data.profile.id,
        from: { name: 'What are we capable of?', email: 'hello@whatarewecapableof.com' },
        client: { company: 'Substrate', invoiceCode: 'SUBSTRATE' },
        invoiceDate: '2026-05-26',
        items: [{ description: 'Example service', quantity: 2, unitPrice: '150.00' }],
      },
    });
    assert(created.status === 201 && created.data.invoice.totals.totalCents === 30000, 'invoice create smoke failed');
    assert(created.data.invoice.entityId === 'wawco', 'default WAWCO entity smoke failed');
    assert(created.data.invoice.invoiceNumber === 'SUBSTRATE-052626-01', 'client-date numbering-backed invoice create smoke failed');
    const id = created.data.invoice.id;

    const ndgInvoice = await callHandler(invoiceHandler, {
      method: 'POST',
      url: '/api/invoices',
      cookie,
      body: {
        entityId: 'ndg',
        client: { company: 'Substrate', invoiceCode: 'SUBSTRATE' },
        invoiceDate: '2026-05-26',
        items: [{ description: 'NDG example service', quantity: 1, unitPrice: '120.00' }],
      },
    });
    assert(ndgInvoice.status === 201 && ndgInvoice.data.invoice.entityId === 'ndg', 'NDG invoice entity create smoke failed');
    assert(ndgInvoice.data.invoice.invoiceNumber === 'NDG-SUBSTRATE-052626-01', 'NDG per-entity numbering smoke failed');
    const ndgEntityChange = await callHandler(invoiceHandler, { method: 'PUT', url: `/api/invoices?id=${encodeURIComponent(ndgInvoice.data.invoice.id)}`, cookie, body: { entityId: 'wawco' } });
    assert(ndgEntityChange.status === 409, 'invoice entity immutability smoke failed');

    const numberingAfterCreate = await callHandler(numberingHandler, { method: 'GET', url: '/api/numbering', cookie });
    assert(numberingAfterCreate.data.numbering.sequencePadding === 2, 'numbering setting persistence smoke failed');

    const readBack = await callHandler(invoiceHandler, { method: 'GET', url: `/api/invoices?id=${encodeURIComponent(id)}`, cookie });
    assert(readBack.status === 200 && readBack.data.invoice.id === id, 'invoice read smoke failed');

    const updated = await callHandler(invoiceHandler, {
      method: 'PUT',
      url: `/api/invoices?id=${encodeURIComponent(id)}`,
      cookie,
      body: { status: 'ready_for_review', discount: '25.00' },
    });
    assert(updated.status === 200 && updated.data.invoice.status === 'ready_for_review', 'invoice update smoke failed');
    assert(updated.data.invoice.invoiceNumber === 'SUBSTRATE-052626-01', 'invoice number stability on update smoke failed');
    assert(updated.data.invoice.totals.totalCents === 27500, 'invoice total recalculation smoke failed');

    const checkoutOrigin = { origin: 'http://127.0.0.1:3321' };
    const unauthCheckout = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', body: { invoiceId: id, mode: 'test' }, headers: checkoutOrigin });
    assert(unauthCheckout.status === 401, 'Stripe Checkout unauthenticated smoke failed');

    const nonAdminCheckout = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie: repCookie, body: { invoiceId: id, mode: 'test' }, headers: checkoutOrigin });
    assert([403, 404].includes(nonAdminCheckout.status), 'Stripe Checkout non-admin access gate smoke failed');

    const badOriginCheckout = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: id, mode: 'test' }, headers: { origin: 'https://evil.example.test' } });
    assert(badOriginCheckout.status === 403, 'Stripe Checkout origin guard smoke failed');

    const linksEnabledBefore = process.env.FIN_STRIPE_TEST_LINKS_ENABLED;
    process.env.FIN_STRIPE_TEST_LINKS_ENABLED = '0';
    const disabledCheckout = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: id, mode: 'test' }, headers: checkoutOrigin });
    assert(disabledCheckout.status === 403, 'Stripe Checkout feature flag smoke failed');
    process.env.FIN_STRIPE_TEST_LINKS_ENABLED = linksEnabledBefore;

    const stripeFakeBefore = process.env.FIN_STRIPE_FAKE;
    const stripeKeyBefore = process.env.STRIPE_SECRET_KEY;
    const stripeWebhookBefore = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.FIN_STRIPE_FAKE = '0';
    process.env.STRIPE_SECRET_KEY = 'sk_test_smoke_missing_webhook';
    process.env.STRIPE_WEBHOOK_SECRET = '';
    const missingWebhookSecretCheckout = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: id, mode: 'test' }, headers: checkoutOrigin });
    assert(missingWebhookSecretCheckout.status === 503, 'Stripe Checkout webhook-secret gate smoke failed');
    process.env.FIN_STRIPE_FAKE = stripeFakeBefore;
    process.env.STRIPE_SECRET_KEY = stripeKeyBefore;
    process.env.STRIPE_WEBHOOK_SECRET = stripeWebhookBefore;

    const unapprovedCheckout = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: id, mode: 'test' }, headers: checkoutOrigin });
    assert(unapprovedCheckout.status === 409, 'Stripe Checkout approved-only smoke failed');

    const approved = await callHandler(invoiceHandler, {
      method: 'PUT',
      url: `/api/invoices?id=${encodeURIComponent(id)}`,
      cookie,
      body: { status: 'approved' },
    });
    assert(approved.status === 200 && approved.data.invoice.status === 'approved', 'invoice approval smoke failed');

    const checkoutCreated = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: id, mode: 'test' }, headers: checkoutOrigin });
    assert(checkoutCreated.status === 201 && checkoutCreated.data.payment.status === 'active', 'customer payment page fake create smoke failed');
    assert(checkoutCreated.data.stripe.fake === true && checkoutCreated.data.payment.urlKind === 'customer_payment_page', 'customer payment page kind smoke failed');
    assert(checkoutCreated.data.payment.publicUrl.includes('/pay?t='), 'customer payment page public URL smoke failed');

    const paymentPageUrl = new URL(checkoutCreated.data.payment.publicUrl);
    const paymentPageToken = paymentPageUrl.searchParams.get('t');
    assert(paymentPageToken, 'customer payment page token smoke failed');

    const checkoutReadBack = await callHandler(invoiceHandler, { method: 'GET', url: `/api/invoices?id=${encodeURIComponent(id)}`, cookie });
    assert(checkoutReadBack.status === 200 && checkoutReadBack.data.invoice.payment?.urlKind === 'customer_payment_page', 'invoice payment page attach smoke failed');

    const checkoutDuplicate = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: id, mode: 'test' }, headers: checkoutOrigin });
    assert(checkoutDuplicate.status === 200 && checkoutDuplicate.data.reused === true, 'customer payment page duplicate reuse smoke failed');
    assert(checkoutDuplicate.data.payment.id === checkoutCreated.data.payment.id, 'customer payment page duplicate payment id smoke failed');

    const missingPayPage = await callHandler(payHandler, { method: 'GET', url: '/api/pay?t=missing-token' });
    assert(missingPayPage.status === 404, 'public payment page missing-token smoke failed');

    const publicPayPage = await callHandler(payHandler, { method: 'GET', url: `/api/pay?t=${encodeURIComponent(paymentPageToken)}` });
    assert(publicPayPage.status === 200 && publicPayPage.data.paymentPage.invoice.invoiceNumber === 'SUBSTRATE-052626-01', 'public payment page read smoke failed');
    assert(!JSON.stringify(publicPayPage.data.paymentPage).includes('paymentInstructions'), 'public payment page hides private payment instructions smoke failed');
    const bankMethod = publicPayPage.data.paymentPage.methods.find((method) => method.method === 'bank_account');
    const cardMethod = publicPayPage.data.paymentPage.methods.find((method) => method.method === 'card');
    assert(bankMethod && cardMethod, 'public payment page method list smoke failed');
    assert(bankMethod.collectionAmountCents === 27500 && bankMethod.clientProcessingCostCents === 0, 'bank account no-added-fee quote smoke failed');
    assert(cardMethod.collectionAmountCents === cardGrossUpCents(27500) && cardMethod.clientProcessingCostCents > 0, 'card gross-up quote smoke failed');

    const missingOriginPayCheckout = await callHandler(payCheckoutHandler, { method: 'POST', url: '/api/pay/checkout', body: { token: paymentPageToken, method: 'bank_account' } });
    assert(missingOriginPayCheckout.status === 403, 'public checkout origin guard smoke failed');
    const badMethodPayCheckout = await callHandler(payCheckoutHandler, { method: 'POST', url: '/api/pay/checkout', body: { token: paymentPageToken, method: 'cash' }, headers: checkoutOrigin });
    assert(badMethodPayCheckout.status === 400, 'public checkout method validation smoke failed');

    const bankCheckout = await callHandler(payCheckoutHandler, { method: 'POST', url: '/api/pay/checkout', body: { token: paymentPageToken, method: 'bank_account' }, headers: checkoutOrigin });
    assert(bankCheckout.status === 201 && bankCheckout.data.payment.paymentMethodType === 'us_bank_account', 'bank account checkout create smoke failed');
    assert(bankCheckout.data.payment.amountCents === 27500 && bankCheckout.data.url.includes('checkout.stripe.com'), 'bank account checkout amount/url smoke failed');
    const bankDuplicate = await callHandler(payCheckoutHandler, { method: 'POST', url: '/api/pay/checkout', body: { token: paymentPageToken, method: 'bank_account' }, headers: checkoutOrigin });
    assert(bankDuplicate.status === 200 && bankDuplicate.data.reused === true && bankDuplicate.data.payment.id === bankCheckout.data.payment.id, 'bank account checkout duplicate reuse smoke failed');

    const cardCheckout = await callHandler(payCheckoutHandler, { method: 'POST', url: '/api/pay/checkout', body: { token: paymentPageToken, method: 'card' }, headers: checkoutOrigin });
    assert(cardCheckout.status === 201 && cardCheckout.data.payment.paymentMethodType === 'card', 'card checkout create smoke failed');
    assert(cardCheckout.data.payment.baseAmountCents === 27500 && cardCheckout.data.payment.amountCents === cardGrossUpCents(27500), 'card checkout gross-up amount smoke failed');
    const cardDuplicate = await callHandler(payCheckoutHandler, { method: 'POST', url: '/api/pay/checkout', body: { token: paymentPageToken, method: 'card' }, headers: checkoutOrigin });
    assert(cardDuplicate.status === 200 && cardDuplicate.data.reused === true && cardDuplicate.data.payment.id === cardCheckout.data.payment.id, 'card checkout duplicate reuse smoke failed');

    const statusRegressionUpdate = await callHandler(invoiceHandler, {
      method: 'PUT',
      url: `/api/invoices?id=${encodeURIComponent(id)}`,
      cookie,
      body: { status: 'draft' },
    });
    assert(statusRegressionUpdate.status === 409, 'Stripe Checkout active-link status regression guard smoke failed');

    const staleSnapshotUpdate = await callHandler(invoiceHandler, {
      method: 'PUT',
      url: `/api/invoices?id=${encodeURIComponent(id)}`,
      cookie,
      body: { items: [{ description: 'Example service', quantity: 2, unitPrice: '151.00' }] },
    });
    assert(staleSnapshotUpdate.status === 409, 'Stripe Checkout stale snapshot edit guard smoke failed');
    const staleTermsUpdate = await callHandler(invoiceHandler, {
      method: 'PUT',
      url: `/api/invoices?id=${encodeURIComponent(id)}`,
      cookie,
      body: { terms: 'Changed terms after payment link' },
    });
    assert(staleTermsUpdate.status === 409, 'Stripe Checkout terms snapshot guard smoke failed');

    const payment = cardCheckout.data.payment;
    const webhookBase = {
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: payment.checkoutSessionId,
          amount_total: payment.amountCents,
          currency: 'usd',
          payment_status: 'paid',
          payment_intent: payment.paymentIntentId,
          payment_method_types: ['card'],
          metadata: { fin_payment_request_id: payment.id },
        },
      },
    };
    const webhookRaw = JSON.stringify({ ...webhookBase, id: 'evt_smoke_checkout_completed', type: 'checkout.session.completed' });
    const missingWebhookSignature = await callHandler(webhookHandler, { method: 'POST', url: '/api/stripe/webhook', rawBody: webhookRaw });
    assert(missingWebhookSignature.status === 401, 'Stripe webhook missing signature smoke failed');
    const badWebhookSignature = await callHandler(webhookHandler, { method: 'POST', url: '/api/stripe/webhook', rawBody: webhookRaw, headers: { 'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=0000000000000000000000000000000000000000000000000000000000000000` } });
    assert(badWebhookSignature.status === 401, 'Stripe webhook bad signature smoke failed');
    const staleWebhookSignature = signTestWebhookPayload(webhookRaw, process.env.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 600);
    const staleWebhook = await callHandler(webhookHandler, { method: 'POST', url: '/api/stripe/webhook', rawBody: webhookRaw, headers: { 'stripe-signature': staleWebhookSignature } });
    assert(staleWebhook.status === 401, 'Stripe webhook stale signature smoke failed');
    const goodWebhookSignature = signTestWebhookPayload(webhookRaw, process.env.STRIPE_WEBHOOK_SECRET);
    const processedWebhook = await callHandler(webhookHandler, { method: 'POST', url: '/api/stripe/webhook', rawBody: webhookRaw, headers: { 'stripe-signature': goodWebhookSignature } });
    assert(processedWebhook.status === 200 && processedWebhook.data.result.status === 'processed', 'Stripe webhook processed smoke failed');
    assert(processedWebhook.data.result.payment.status === 'paid', 'Stripe webhook paid status smoke failed');
    const duplicateWebhook = await callHandler(webhookHandler, { method: 'POST', url: '/api/stripe/webhook', rawBody: webhookRaw, headers: { 'stripe-signature': goodWebhookSignature } });
    assert(duplicateWebhook.status === 200 && duplicateWebhook.data.result.duplicate === true, 'Stripe webhook idempotency smoke failed');
    const paidInvoiceReadBack = await callHandler(invoiceHandler, { method: 'GET', url: `/api/invoices?id=${encodeURIComponent(id)}`, cookie });
    assert(paidInvoiceReadBack.status === 200 && paidInvoiceReadBack.data.invoice.status === 'paid', 'Stripe webhook invoice paid smoke failed');

    const chargeSucceededRaw = JSON.stringify({
      ...webhookBase,
      id: 'evt_smoke_charge_succeeded',
      type: 'charge.succeeded',
      data: { object: { id: 'ch_smoke_card', amount: payment.amountCents, currency: 'usd', payment_intent: payment.paymentIntentId, balance_transaction: { id: 'txn_smoke_card', fee: payment.clientProcessingCostCents, net: payment.baseAmountCents }, payment_method_details: { type: 'card', card: { brand: 'visa', last4: '4242' } }, metadata: { fin_payment_request_id: payment.id } } },
    });
    const chargeSucceeded = await callHandler(webhookHandler, { method: 'POST', url: '/api/stripe/webhook', rawBody: chargeSucceededRaw, headers: { 'stripe-signature': signTestWebhookPayload(chargeSucceededRaw, process.env.STRIPE_WEBHOOK_SECRET) } });
    assert(chargeSucceeded.status === 200 && chargeSucceeded.data.result.payment.reconciliationStatus === 'reconciled', 'Stripe charge reconciliation smoke failed');
    assert(chargeSucceeded.data.result.payment.actualNetCents === payment.baseAmountCents, 'Stripe charge net reconciliation smoke failed');

    const ndgApproved = await callHandler(invoiceHandler, { method: 'PUT', url: `/api/invoices?id=${encodeURIComponent(ndgInvoice.data.invoice.id)}`, cookie, body: { status: 'approved' } });
    assert(ndgApproved.status === 200 && ndgApproved.data.invoice.status === 'approved', 'NDG invoice approval smoke failed');
    const ndgFakeBefore = process.env.FIN_STRIPE_FAKE;
    const ndgKeyBefore = process.env.STRIPE_SECRET_KEY_NDG;
    const ndgWebhookBefore = process.env.STRIPE_WEBHOOK_SECRET_NDG;
    process.env.FIN_STRIPE_FAKE = '0';
    process.env.STRIPE_SECRET_KEY_NDG = 'sk_test_smoke_ndg_missing_webhook';
    process.env.STRIPE_WEBHOOK_SECRET_NDG = '';
    const ndgMissingWebhookSecretCheckout = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: ndgInvoice.data.invoice.id, mode: 'test' }, headers: checkoutOrigin });
    assert(ndgMissingWebhookSecretCheckout.status === 503, 'NDG Stripe Checkout webhook-secret gate smoke failed');
    process.env.FIN_STRIPE_FAKE = ndgFakeBefore;
    process.env.STRIPE_SECRET_KEY_NDG = ndgKeyBefore;
    process.env.STRIPE_WEBHOOK_SECRET_NDG = ndgWebhookBefore;
    const ndgCheckout = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: ndgInvoice.data.invoice.id, mode: 'test' }, headers: checkoutOrigin });
    assert(ndgCheckout.status === 201 && ndgCheckout.data.stripe.entityId === 'ndg' && ndgCheckout.data.payment.entityId === 'ndg', 'NDG customer payment page create smoke failed');
    const ndgToken = new URL(ndgCheckout.data.payment.publicUrl).searchParams.get('t');
    const ndgPublicPayPage = await callHandler(payHandler, { method: 'GET', url: `/api/pay?t=${encodeURIComponent(ndgToken)}` });
    assert(ndgPublicPayPage.status === 200 && ndgPublicPayPage.data.paymentPage.invoice.entity.id === 'ndg', 'NDG public payment page entity branding smoke failed');
    const ndgCardCheckout = await callHandler(payCheckoutHandler, { method: 'POST', url: '/api/pay/checkout', body: { token: ndgToken, method: 'card' }, headers: checkoutOrigin });
    assert(ndgCardCheckout.status === 201 && ndgCardCheckout.data.stripe.entityId === 'ndg' && ndgCardCheckout.data.payment.entityId === 'ndg', 'NDG card checkout entity smoke failed');
    const ndgWebhookBase = {
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: ndgCardCheckout.data.payment.checkoutSessionId,
          amount_total: ndgCardCheckout.data.payment.amountCents,
          currency: 'usd',
          payment_status: 'paid',
          payment_intent: ndgCardCheckout.data.payment.paymentIntentId,
          payment_method_types: ['card'],
          metadata: { fin_payment_request_id: ndgCardCheckout.data.payment.id, fin_entity_id: 'ndg' },
        },
      },
    };
    const wrongEntityWebhookRaw = JSON.stringify({ ...ndgWebhookBase, id: 'evt_smoke_ndg_wrong_entity', type: 'checkout.session.completed' });
    const wrongEntityWebhook = await callHandler(webhookHandler, { method: 'POST', url: '/api/stripe/webhook', rawBody: wrongEntityWebhookRaw, headers: { 'stripe-signature': signTestWebhookPayload(wrongEntityWebhookRaw, process.env.STRIPE_WEBHOOK_SECRET) } });
    assert(wrongEntityWebhook.status === 200 && wrongEntityWebhook.data.result.reason === 'payment-request-not-found', 'NDG webhook signed by WAWCO secret should not match an NDG payment smoke failed');
    const ndgWebhookRaw = JSON.stringify({ ...ndgWebhookBase, id: 'evt_smoke_ndg_checkout_completed', type: 'checkout.session.completed' });
    const ndgWebhook = await callHandler(webhookHandler, { method: 'POST', url: '/api/stripe/webhook', rawBody: ndgWebhookRaw, headers: { 'stripe-signature': signTestWebhookPayload(ndgWebhookRaw, process.env.STRIPE_WEBHOOK_SECRET_NDG) } });
    assert(ndgWebhook.status === 200 && ndgWebhook.data.result.payment.entityId === 'ndg' && ndgWebhook.data.result.payment.status === 'paid', 'NDG webhook signature/entity smoke failed');

    const modeMismatchWebhookRaw = JSON.stringify({ ...webhookBase, id: 'evt_smoke_mode_mismatch', type: 'checkout.session.completed', livemode: true });
    const modeMismatchWebhook = await callHandler(webhookHandler, { method: 'POST', url: '/api/stripe/webhook', rawBody: modeMismatchWebhookRaw, headers: { 'stripe-signature': signTestWebhookPayload(modeMismatchWebhookRaw, process.env.STRIPE_WEBHOOK_SECRET) } });
    assert(modeMismatchWebhook.status === 400, 'Stripe webhook mode mismatch smoke failed');

    const staleProcessingWebhookRaw = JSON.stringify({
      ...webhookBase,
      id: 'evt_smoke_stale_processing',
      type: 'payment_intent.processing',
      data: { object: { id: payment.paymentIntentId, amount: payment.amountCents, currency: 'usd', metadata: { fin_payment_request_id: payment.id } } },
    });
    const staleProcessingWebhook = await callHandler(webhookHandler, { method: 'POST', url: '/api/stripe/webhook', rawBody: staleProcessingWebhookRaw, headers: { 'stripe-signature': signTestWebhookPayload(staleProcessingWebhookRaw, process.env.STRIPE_WEBHOOK_SECRET) } });
    assert(staleProcessingWebhook.status === 200 && staleProcessingWebhook.data.result.reason === 'stale-state-transition', 'Stripe webhook stale transition smoke failed');

    const mismatchWebhookRaw = JSON.stringify({
      ...webhookBase,
      id: 'evt_smoke_amount_mismatch',
      type: 'checkout.session.completed',
      data: { object: { ...webhookBase.data.object, amount_total: payment.amountCents + 1 } },
    });
    const mismatchWebhook = await callHandler(webhookHandler, { method: 'POST', url: '/api/stripe/webhook', rawBody: mismatchWebhookRaw, headers: { 'stripe-signature': signTestWebhookPayload(mismatchWebhookRaw, process.env.STRIPE_WEBHOOK_SECRET) } });
    assert(mismatchWebhook.status === 400, 'Stripe webhook amount mismatch smoke failed');

    const retryInvoice = await callHandler(invoiceHandler, {
      method: 'POST',
      url: '/api/invoices',
      cookie,
      body: {
        from: { name: 'What are we capable of?', email: 'hello@whatarewecapableof.com' },
        client: { company: 'Retry client', invoiceCode: 'RETRY' },
        invoiceDate: '2099-02-01',
        items: [{ description: 'Retryable payment work', quantity: 1, unitPrice: '50.00' }],
      },
    });
    assert(retryInvoice.status === 201, 'retry invoice create smoke failed');
    const retryApproved = await callHandler(invoiceHandler, { method: 'PUT', url: `/api/invoices?id=${encodeURIComponent(retryInvoice.data.invoice.id)}`, cookie, body: { status: 'approved' } });
    assert(retryApproved.status === 200, 'retry invoice approve smoke failed');
    const retryPage = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: retryInvoice.data.invoice.id, mode: 'test' }, headers: checkoutOrigin });
    assert(retryPage.status === 201 && retryPage.data.payment.urlKind === 'customer_payment_page', 'retry customer payment page create smoke failed');
    const retryToken = new URL(retryPage.data.payment.publicUrl).searchParams.get('t');
    const preparedRetryPayment = await fakeDb.createCustomerCheckoutPaymentRequest(retryToken, 'card');
    await fakeDb.failCustomerCheckoutPaymentRequest(preparedRetryPayment.paymentRequest.id, 'synthetic failure');
    const retriedCheckout = await callHandler(payCheckoutHandler, { method: 'POST', url: '/api/pay/checkout', body: { token: retryToken, method: 'card' }, headers: checkoutOrigin });
    assert(retriedCheckout.status === 201 && retriedCheckout.data.payment.status === 'active', 'Stripe Checkout failed-request retry smoke failed');
    assert(retriedCheckout.data.payment.id === preparedRetryPayment.paymentRequest.id, 'Stripe Checkout retry should reuse the failed method request smoke failed');
    const retryActiveDelete = await callHandler(invoiceHandler, { method: 'DELETE', url: `/api/invoices?id=${encodeURIComponent(retryInvoice.data.invoice.id)}`, cookie });
    assert(retryActiveDelete.status === 409, 'active retry payment delete guard smoke failed');
    await fakeDb.failCustomerCheckoutPaymentRequest(retriedCheckout.data.payment.id, 'synthetic cleanup failure');
    await fakeDb.failCustomerCheckoutPaymentRequest(retryPage.data.payment.id, 'synthetic page cleanup failure');
    const retryDeleted = await callHandler(invoiceHandler, { method: 'DELETE', url: `/api/invoices?id=${encodeURIComponent(retryInvoice.data.invoice.id)}`, cookie });
    assert(retryDeleted.status === 200 && retryDeleted.data.deleted === true, 'retry payment fixture cleanup smoke failed');

    const legacyConflictInvoice = await callHandler(invoiceHandler, {
      method: 'POST',
      url: '/api/invoices',
      cookie,
      body: {
        from: { name: 'What are we capable of?', email: 'hello@whatarewecapableof.com' },
        client: { company: 'Legacy conflict client', invoiceCode: 'LEGACY' },
        invoiceDate: '2099-02-15',
        items: [{ description: 'Legacy conflict work', quantity: 1, unitPrice: '60.00' }],
      },
    });
    assert(legacyConflictInvoice.status === 201, 'legacy conflict invoice create smoke failed');
    const legacyConflictApproved = await callHandler(invoiceHandler, { method: 'PUT', url: `/api/invoices?id=${encodeURIComponent(legacyConflictInvoice.data.invoice.id)}`, cookie, body: { status: 'approved' } });
    assert(legacyConflictApproved.status === 200, 'legacy conflict invoice approve smoke failed');
    const legacyPrepared = await fakeDb.createInvoicePaymentRequest({ email: 'noah@whatarewecapableof.com', name: 'Fin Smoke User' }, legacyConflictInvoice.data.invoice.id, 'test');
    await fakeDb.activateInvoicePaymentRequest({ email: 'noah@whatarewecapableof.com', name: 'Fin Smoke User' }, legacyPrepared.paymentRequest.id, { id: 'cs_legacy_conflict', url: 'https://checkout.stripe.com/c/pay/cs_legacy_conflict', paymentIntentId: 'pi_legacy_conflict' });
    const legacyConflictPage = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: legacyConflictInvoice.data.invoice.id, mode: 'test' }, headers: checkoutOrigin });
    assert(legacyConflictPage.status === 409, 'legacy active checkout should block customer payment page smoke failed');
    await fakeDb.failInvoicePaymentRequest({ email: 'noah@whatarewecapableof.com', name: 'Fin Smoke User' }, legacyPrepared.paymentRequest.id, 'synthetic legacy conflict cleanup');
    const legacyConflictDeleted = await callHandler(invoiceHandler, { method: 'DELETE', url: `/api/invoices?id=${encodeURIComponent(legacyConflictInvoice.data.invoice.id)}`, cookie });
    assert(legacyConflictDeleted.status === 200 && legacyConflictDeleted.data.deleted === true, 'legacy conflict cleanup smoke failed');

    const liveInvoice = await callHandler(invoiceHandler, {
      method: 'POST',
      url: '/api/invoices',
      cookie,
      body: {
        from: { name: 'What are we capable of?', email: 'hello@whatarewecapableof.com' },
        client: { company: 'Live link client', invoiceCode: 'LIVE' },
        invoiceDate: '2099-03-01',
        items: [{ description: 'Live-link smoke work', quantity: 1, unitPrice: '75.00' }],
      },
    });
    assert(liveInvoice.status === 201, 'live-link invoice create smoke failed');
    const liveApproved = await callHandler(invoiceHandler, { method: 'PUT', url: `/api/invoices?id=${encodeURIComponent(liveInvoice.data.invoice.id)}`, cookie, body: { status: 'approved' } });
    assert(liveApproved.status === 200, 'live-link invoice approve smoke failed');
    const liveCheckout = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: liveInvoice.data.invoice.id, mode: 'live' }, headers: checkoutOrigin });
    assert(liveCheckout.status === 201 && liveCheckout.data.payment.status === 'active' && liveCheckout.data.payment.mode === 'live', 'Stripe Checkout live fake create smoke failed');
    const liveReadBack = await callHandler(invoiceHandler, { method: 'GET', url: `/api/invoices?id=${encodeURIComponent(liveInvoice.data.invoice.id)}`, cookie });
    assert(liveReadBack.status === 200 && liveReadBack.data.invoice.payment?.mode === 'live', 'live payment attach smoke failed');
    const liveActiveDelete = await callHandler(invoiceHandler, { method: 'DELETE', url: `/api/invoices?id=${encodeURIComponent(liveInvoice.data.invoice.id)}`, cookie });
    assert(liveActiveDelete.status === 409, 'active live payment delete guard smoke failed');
    await fakeDb.failInvoicePaymentRequest({ email: 'noah@whatarewecapableof.com', name: 'Fin Smoke User' }, liveCheckout.data.payment.id, 'synthetic cleanup failure');
    const liveDeleted = await callHandler(invoiceHandler, { method: 'DELETE', url: `/api/invoices?id=${encodeURIComponent(liveInvoice.data.invoice.id)}`, cookie });
    assert(liveDeleted.status === 200 && liveDeleted.data.deleted === true, 'live payment fixture cleanup smoke failed');

    const directApprovedInvoice = await callHandler(invoiceHandler, {
      method: 'POST',
      url: '/api/invoices',
      cookie,
      body: {
        status: 'approved',
        from: { name: 'What are we capable of?', email: 'hello@whatarewecapableof.com' },
        client: { company: 'Direct approved client', invoiceCode: 'DIRECT' },
        invoiceDate: '2099-04-01',
        items: [{ description: 'Direct approval work', quantity: 1, unitPrice: '80.00' }],
      },
    });
    assert(directApprovedInvoice.status === 201 && directApprovedInvoice.data.invoice.status === 'approved', 'admin direct-approved create smoke failed');
    const directApprovedCheckout = await callHandler(checkoutHandler, { method: 'POST', url: '/api/stripe/checkout', cookie, body: { invoiceId: directApprovedInvoice.data.invoice.id, mode: 'test' }, headers: checkoutOrigin });
    assert(directApprovedCheckout.status === 201 && directApprovedCheckout.data.payment.status === 'active', 'admin direct-approved Checkout smoke failed');
    const directApprovedActiveDelete = await callHandler(invoiceHandler, { method: 'DELETE', url: `/api/invoices?id=${encodeURIComponent(directApprovedInvoice.data.invoice.id)}`, cookie });
    assert(directApprovedActiveDelete.status === 409, 'active direct-approved payment delete guard smoke failed');
    await fakeDb.failInvoicePaymentRequest({ email: 'noah@whatarewecapableof.com', name: 'Fin Smoke User' }, directApprovedCheckout.data.payment.id, 'synthetic cleanup failure');
    const directApprovedDeleted = await callHandler(invoiceHandler, { method: 'DELETE', url: `/api/invoices?id=${encodeURIComponent(directApprovedInvoice.data.invoice.id)}`, cookie });
    assert(directApprovedDeleted.status === 200 && directApprovedDeleted.data.deleted === true, 'direct-approved payment fixture cleanup smoke failed');

    const privateInvoice = await callHandler(invoiceHandler, {
      method: 'POST',
      url: '/api/invoices',
      cookie,
      body: {
        payeeProfileId: privatePayee.data.profile.id,
        payeeReportingScope: 'private',
        from: { name: 'Private Payee', email: 'private@example.test' },
        client: { company: 'Other Client', invoiceCode: 'OTHER' },
        invoiceDate: '2026-05-26',
        items: [{ description: 'Private work', quantity: 1, unitPrice: '900.00' }],
      },
    });
    assert(privateInvoice.status === 201 && privateInvoice.data.invoice.excludeFromWawcoDashboard === true, 'private invoice create smoke failed');
    assert(privateInvoice.data.invoice.invoiceNumber === 'OTHER-052626-02', 'date-global sequence smoke failed');

    const fallbackPrivateInvoice = await callHandler(invoiceHandler, {
      method: 'POST',
      url: '/api/invoices',
      cookie,
      body: {
        payeeReportingScope: 'private',
        from: { name: 'Noah Glynn', email: 'private@example.test' },
        client: { company: 'Fallback private example' },
        invoiceDate: '2026-05-27',
        items: [{ description: 'Fallback private work', quantity: 1, unitPrice: '100.00' }],
      },
    });
    assert(fallbackPrivateInvoice.status === 201, 'fallback private invoice create smoke failed');
    assert(fallbackPrivateInvoice.data.invoice.invoiceNumber === 'FALLBACKPRIVATEEXAMPLE-052726-01', 'date reset sequence smoke failed');

    const summary = await callHandler(summaryHandler, { method: 'GET', url: '/api/finance/summary', cookie });
    assert(summary.status === 200, 'finance summary status smoke failed');
    assert(summary.data.summary.invoiceCount === 1, 'finance summary private-payee count smoke failed');
    assert(summary.data.summary.totalCents === 27500, 'finance summary private-payee total smoke failed');
    assert(summary.data.summary.readyForReviewCents === 0, 'finance summary ready total smoke failed');
    assert(summary.data.summary.excludedPrivatePayeeCount === 2, 'finance summary excluded private count smoke failed');
    assert(summary.data.summary.hostedInvoices.openReceivablesCents === 27500, 'finance hosted invoice operations smoke failed');
    assert(summary.data.summary.hostedInvoices.paymentPaidCount === 1, 'finance hosted payment status smoke failed');
    assert(summary.data.summary.hostedInvoices.paymentSummary.some((row) => row.status === 'paid'), 'finance hosted payment summary smoke failed');
    assert(summary.data.summary.metrics.hostedInvoiceReadyCents === 0, 'finance parity metrics smoke failed');
    assert(summary.data.summary.excludedEntityCount === 1, 'finance summary excluded entity count smoke failed');
    assert(summary.data.summary.entityFilter === 'wawco', 'finance summary default entity smoke failed');
    assert(summary.data.summary.mercury.observedCardExpenses.expenses.length === 0, 'finance parity empty imported snapshot smoke failed');

    const ndgSummary = await callHandler(summaryHandler, { method: 'GET', url: '/api/finance/summary?entity=ndg', cookie });
    assert(ndgSummary.status === 200 && ndgSummary.data.summary.entityFilter === 'ndg', 'NDG finance summary entity filter smoke failed');
    assert(ndgSummary.data.summary.invoiceCount === 1 && ndgSummary.data.summary.totalCents === 12000, 'NDG finance summary totals smoke failed');
    assert(ndgSummary.data.summary.hostedInvoices.paymentPaidCount === 1, 'NDG finance payment paid summary smoke failed');
    const combinedSummary = await callHandler(summaryHandler, { method: 'GET', url: '/api/finance/summary?entity=combined', cookie });
    assert(combinedSummary.status === 200 && combinedSummary.data.summary.entityFilter === 'combined', 'combined finance summary entity filter smoke failed');
    assert(combinedSummary.data.summary.invoiceCount === 2 && combinedSummary.data.summary.totalCents === 39500, 'combined finance summary totals smoke failed');
    assert(combinedSummary.data.summary.hostedInvoices.paymentPaidCount === 2, 'combined finance payment paid summary smoke failed');

    const fakeImport = fakeFinanceImportSummary('2099-12');
    const systemFakeImport = fakeFinanceImportSummary('2099-11');
    const systemRawBody = JSON.stringify(systemFakeImport);
    const signedSystemImport = signSystemImportRequest({
      keyId: process.env.FIN_FINANCE_SYSTEM_IMPORT_KEY_ID,
      secret: process.env.FIN_FINANCE_SYSTEM_IMPORT_SECRET,
      method: 'POST',
      path: '/api/finance/system-import-summary',
      body: systemRawBody,
    });

    const systemScriptDryRun = spawnSync(process.execPath, [
      new URL('../../../scripts/fin-finance-refresh.mjs', import.meta.url).pathname,
      '--fixture',
      '--month',
      '2099-10',
      '--dry-run',
      '--target',
      'http://127.0.0.1:3321/api/finance/system-import-summary',
    ], { cwd: new URL('../../../', import.meta.url), env: process.env, encoding: 'utf8' });
    assert(systemScriptDryRun.status === 0, `system refresh dry-run failed: ${systemScriptDryRun.stderr || systemScriptDryRun.stdout}`);
    const systemScriptDryRunData = JSON.parse(systemScriptDryRun.stdout);
    assert(systemScriptDryRunData.ok === true && systemScriptDryRunData.dryRun === true, 'system refresh dry-run output smoke failed');
    assert(systemScriptDryRunData.preview.month === '2099-10', 'system refresh dry-run fixture month smoke failed');

    const disabledBefore = process.env.FIN_FINANCE_SYSTEM_IMPORTS_ENABLED;
    process.env.FIN_FINANCE_SYSTEM_IMPORTS_ENABLED = '0';
    const disabledSystemImport = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: systemRawBody, headers: signedSystemImport.headers });
    assert(disabledSystemImport.status === 403, 'system finance import feature flag smoke failed');
    process.env.FIN_FINANCE_SYSTEM_IMPORTS_ENABLED = disabledBefore;

    const missingSystemAuth = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: systemRawBody });
    assert(missingSystemAuth.status === 401, 'system finance import missing auth smoke failed');

    const badSystemSignature = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: systemRawBody, headers: { ...signedSystemImport.headers, 'x-fin-import-signature': 'sha256=0000000000000000000000000000000000000000000000000000000000000000' } });
    assert(badSystemSignature.status === 401, 'system finance import bad signature smoke failed');

    const badSystemBodyHash = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: JSON.stringify({ ...systemFakeImport, label: 'Tampered fixture' }), headers: signedSystemImport.headers });
    assert(badSystemBodyHash.status === 401, 'system finance import body hash smoke failed');

    const staleSystemImport = signSystemImportRequest({
      keyId: process.env.FIN_FINANCE_SYSTEM_IMPORT_KEY_ID,
      secret: process.env.FIN_FINANCE_SYSTEM_IMPORT_SECRET,
      method: 'POST',
      path: '/api/finance/system-import-summary',
      body: systemRawBody,
      timestamp: '2000-01-01T00:00:00.000Z',
      nonce: 'stale-system-import-nonce',
    });
    const staleSystemResponse = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: systemRawBody, headers: staleSystemImport.headers });
    assert(staleSystemResponse.status === 401, 'system finance import stale timestamp smoke failed');

    const maxSkewBefore = process.env.FIN_FINANCE_SYSTEM_IMPORT_MAX_SKEW_SECONDS;
    process.env.FIN_FINANCE_SYSTEM_IMPORT_MAX_SKEW_SECONDS = 'not-a-number';
    const staleWithInvalidSkew = signSystemImportRequest({
      keyId: process.env.FIN_FINANCE_SYSTEM_IMPORT_KEY_ID,
      secret: process.env.FIN_FINANCE_SYSTEM_IMPORT_SECRET,
      method: 'POST',
      path: '/api/finance/system-import-summary',
      body: systemRawBody,
      timestamp: '2000-01-01T00:00:00.000Z',
      nonce: 'invalid-skew-stale-nonce',
    });
    const staleWithInvalidSkewResponse = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: systemRawBody, headers: staleWithInvalidSkew.headers });
    assert(staleWithInvalidSkewResponse.status === 401, 'system finance import invalid skew fallback smoke failed');
    if (maxSkewBefore === undefined) delete process.env.FIN_FINANCE_SYSTEM_IMPORT_MAX_SKEW_SECONDS;
    else process.env.FIN_FINANCE_SYSTEM_IMPORT_MAX_SKEW_SECONDS = maxSkewBefore;

    const forbiddenSystemPayload = { ...systemFakeImport, mercury: { ...systemFakeImport.mercury, recentTransactions: [{ ...systemFakeImport.mercury.recentTransactions[0], counterparty: 'cus_system_import_raw_value' }] } };
    const forbiddenSystemRawBody = JSON.stringify(forbiddenSystemPayload);
    const forbiddenSystemSigned = signSystemImportRequest({
      keyId: process.env.FIN_FINANCE_SYSTEM_IMPORT_KEY_ID,
      secret: process.env.FIN_FINANCE_SYSTEM_IMPORT_SECRET,
      method: 'POST',
      path: '/api/finance/system-import-summary',
      body: forbiddenSystemRawBody,
    });
    const forbiddenSystemImport = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: forbiddenSystemRawBody, headers: forbiddenSystemSigned.headers });
    assert(forbiddenSystemImport.status === 400, 'system finance import validator smoke failed');

    const systemImported = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: systemRawBody, headers: signedSystemImport.headers });
    assert(systemImported.status === 201 && systemImported.data.import.month === '2099-11', 'system finance import create smoke failed');
    assert(systemImported.data.skipped === false && systemImported.data.reason === '', 'system finance import create no-op metadata smoke failed');
    assert(systemImported.data.import.actorType === 'system' && systemImported.data.import.keyId === 'smoke-mini-b', 'system finance import actor metadata smoke failed');

    const duplicateSystemImport = signSystemImportRequest({
      keyId: process.env.FIN_FINANCE_SYSTEM_IMPORT_KEY_ID,
      secret: process.env.FIN_FINANCE_SYSTEM_IMPORT_SECRET,
      method: 'POST',
      path: '/api/finance/system-import-summary',
      body: systemRawBody,
      nonce: 'duplicate-content-system-import-nonce',
    });
    const duplicateSystemImportResponse = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: systemRawBody, headers: duplicateSystemImport.headers });
    assert(duplicateSystemImportResponse.status === 200 && duplicateSystemImportResponse.data.skipped === true, 'system finance import duplicate no-op smoke failed');
    assert(duplicateSystemImportResponse.data.reason === 'duplicate-content', 'system finance import duplicate reason smoke failed');
    assert(duplicateSystemImportResponse.data.import.id === systemImported.data.import.id, 'system finance import duplicate returns existing import smoke failed');

    const generatedAtOnlyDuplicateBody = JSON.stringify({ ...systemFakeImport, generatedAt: '2100-01-01T00:00:00.000Z' });
    const generatedAtOnlyDuplicate = signSystemImportRequest({
      keyId: process.env.FIN_FINANCE_SYSTEM_IMPORT_KEY_ID,
      secret: process.env.FIN_FINANCE_SYSTEM_IMPORT_SECRET,
      method: 'POST',
      path: '/api/finance/system-import-summary',
      body: generatedAtOnlyDuplicateBody,
      nonce: 'generated-at-only-duplicate-nonce',
    });
    const generatedAtOnlyDuplicateResponse = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: generatedAtOnlyDuplicateBody, headers: generatedAtOnlyDuplicate.headers });
    assert(generatedAtOnlyDuplicateResponse.status === 200 && generatedAtOnlyDuplicateResponse.data.skipped === true, 'system finance import generatedAt-only duplicate no-op smoke failed');
    assert(generatedAtOnlyDuplicateResponse.data.import.id === systemImported.data.import.id, 'system finance import generatedAt-only duplicate returns existing import smoke failed');

    const changedSystemPayload = { ...systemFakeImport, metrics: { ...systemFakeImport.metrics, totalAvailableBalanceCents: systemFakeImport.metrics.totalAvailableBalanceCents + 1 } };
    const changedSystemRawBody = JSON.stringify(changedSystemPayload);
    const changedSystemImport = signSystemImportRequest({
      keyId: process.env.FIN_FINANCE_SYSTEM_IMPORT_KEY_ID,
      secret: process.env.FIN_FINANCE_SYSTEM_IMPORT_SECRET,
      method: 'POST',
      path: '/api/finance/system-import-summary',
      body: changedSystemRawBody,
      nonce: 'changed-content-system-import-nonce',
    });
    const changedSystemImportResponse = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: changedSystemRawBody, headers: changedSystemImport.headers });
    assert(changedSystemImportResponse.status === 201 && changedSystemImportResponse.data.skipped === false, 'system finance import changed content create smoke failed');
    assert(changedSystemImportResponse.data.import.id !== systemImported.data.import.id, 'system finance import changed content id smoke failed');

    const replaySystemImport = await callHandler(systemImportSummaryHandler, { method: 'POST', url: '/api/finance/system-import-summary', rawBody: systemRawBody, headers: signedSystemImport.headers });
    assert(replaySystemImport.status === 409, 'system finance import replay guard smoke failed');

    const systemImportsList = await callHandler(importsHandler, { method: 'GET', url: '/api/finance/imports', cookie });
    assert(systemImportsList.status === 200 && systemImportsList.data.imports.length === 2, 'system finance import list smoke failed');

    const deletedSystemImport = await callHandler(importsHandler, { method: 'DELETE', url: `/api/finance/imports?id=${encodeURIComponent(systemImported.data.import.id)}`, cookie, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(deletedSystemImport.status === 200 && deletedSystemImport.data.deleted === true, 'system finance import cleanup smoke failed');
    const deletedChangedSystemImport = await callHandler(importsHandler, { method: 'DELETE', url: `/api/finance/imports?id=${encodeURIComponent(changedSystemImportResponse.data.import.id)}`, cookie, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(deletedChangedSystemImport.status === 200 && deletedChangedSystemImport.data.deleted === true, 'system finance import changed cleanup smoke failed');

    const importsEnabledBefore = process.env.FIN_FINANCE_IMPORTS_ENABLED;
    process.env.FIN_FINANCE_IMPORTS_ENABLED = '0';
    const disabledAdminImport = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: fakeImport, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(disabledAdminImport.status === 403, 'finance import global feature flag smoke failed');
    process.env.FIN_FINANCE_IMPORTS_ENABLED = importsEnabledBefore;

    const unauthImport = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', body: fakeImport, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(unauthImport.status === 401, 'finance import unauthenticated smoke failed');

    const missingOriginImport = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: fakeImport });
    assert(missingOriginImport.status === 403, 'finance import origin guard smoke failed');

    const nonAdminImport = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie: repCookie, body: fakeImport, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(nonAdminImport.status === 403, 'finance import non-admin smoke failed');

    const nonAdminImportsList = await callHandler(importsHandler, { method: 'GET', url: '/api/finance/imports', cookie: repCookie });
    assert(nonAdminImportsList.status === 403, 'finance imports list non-admin smoke failed');

    const invalidSchema = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: { ...fakeImport, schemaVersion: 'wrong' }, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(invalidSchema.status === 400, 'finance import invalid schema smoke failed');

    const oversizedImport = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: { ...fakeImport, label: 'x'.repeat(1_100_000) }, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(oversizedImport.status === 413, 'finance import oversize smoke failed');

    const wrappedPayload = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: { summary: fakeImport, extra: 'should fail closed' }, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(wrappedPayload.status === 400, 'finance import wrapped payload rejection smoke failed');

    const forbiddenPayload = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: { ...fakeImport, mercury: { ...fakeImport.mercury, recentTransactions: [{ ...fakeImport.mercury.recentTransactions[0], id: 'raw-transaction-id' }] } }, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(forbiddenPayload.status === 400, 'finance import forbidden field smoke failed');

    const forbiddenValuePayload = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: { ...fakeImport, mercury: { ...fakeImport.mercury, recentTransactions: [{ ...fakeImport.mercury.recentTransactions[0], counterparty: 'cus_1234567890abcdef' }] } }, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(forbiddenValuePayload.status === 400, 'finance import forbidden raw value smoke failed');

    const maskedCardValuePayload = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: { ...fakeImport, recurring: { ...fakeImport.recurring, items: [{ ...fakeImport.recurring.items[0], paymentSource: 'Company card ••1234' }] } }, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(maskedCardValuePayload.status === 400, 'finance import masked card value smoke failed');

    const localInvoicesPayload = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: { ...fakeImport, localInvoices: { invoices: [] } }, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(localInvoicesPayload.status === 400, 'finance import localInvoices rejection smoke failed');

    const hostedMetricPayload = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: { ...fakeImport, metrics: { ...fakeImport.metrics, hostedInvoiceOpenCents: 1 } }, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(hostedMetricPayload.status === 400, 'finance import hosted metric rejection smoke failed');

    const mercuryOpenPayload = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: { ...fakeImport, metrics: { ...fakeImport.metrics, mercuryInvoiceOpenCents: 99900 } }, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(mercuryOpenPayload.status === 400, 'finance import invoice double-count guard smoke failed');

    const directLocalSummaryShape = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: { ...fakeImport, sources: { ...fakeImport.sources, mercurySnapshotDir: '.finance/snapshots/mercury-test' } }, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(directLocalSummaryShape.status === 400, 'finance import local summary shape rejection smoke failed');

    const imported = await callHandler(importSummaryHandler, { method: 'POST', url: '/api/finance/import-summary', cookie, body: fakeImport, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(imported.status === 201 && imported.data.import.month === '2099-12', 'finance import create smoke failed');

    const importsList = await callHandler(importsHandler, { method: 'GET', url: '/api/finance/imports', cookie });
    assert(importsList.status === 200 && importsList.data.imports.length === 1, 'finance imports list smoke failed');

    const importedSummary = await callHandler(summaryHandler, { method: 'GET', url: '/api/finance/summary?month=2099-12', cookie });
    assert(importedSummary.status === 200, 'imported finance summary status smoke failed');
    assert(importedSummary.data.summary.latestFinanceImport.id === imported.data.import.id, 'imported finance summary latest import smoke failed');
    assert(importedSummary.data.summary.metrics.totalAvailableBalanceCents === 1250000, 'imported finance metrics smoke failed');
    assert(importedSummary.data.summary.metrics.hostedInvoiceOpenCents === 27500, 'hosted invoice metric after import smoke failed');
    assert(importedSummary.data.summary.metrics.mercuryInvoiceOpenCents === 0, 'no double-count imported Mercury invoices smoke failed');
    assert(importedSummary.data.summary.mercury.recentTransactions.length === 1, 'imported recent transaction smoke failed');
    assert(importedSummary.data.summary.sources.contentSha256 && !String(importedSummary.data.summary.sources.contentSha256).includes('.finance'), 'imported source hash smoke failed');
    const ndgImportedSummary = await callHandler(summaryHandler, { method: 'GET', url: '/api/finance/summary?entity=ndg&month=2099-12', cookie });
    assert(ndgImportedSummary.status === 200 && ndgImportedSummary.data.summary.latestFinanceImport === null, 'NDG summary must not inherit WAWCO finance import smoke failed');
    assert(ndgImportedSummary.data.summary.metrics.totalAvailableBalanceCents === 0, 'NDG summary imported cash isolation smoke failed');

    const nonAdminSummary = await callHandler(summaryHandler, { method: 'GET', url: '/api/finance/summary?month=2099-12', cookie: repCookie });
    assert(nonAdminSummary.status === 200, 'non-admin finance summary status smoke failed');
    assert(nonAdminSummary.data.summary.latestFinanceImport === null, 'non-admin import visibility smoke failed');
    assert(nonAdminSummary.data.summary.metrics.totalAvailableBalanceCents === 0, 'non-admin imported metrics hidden smoke failed');

    const unauthDeleteImport = await callHandler(importsHandler, { method: 'DELETE', url: `/api/finance/imports?id=${encodeURIComponent(imported.data.import.id)}`, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(unauthDeleteImport.status === 401, 'finance import unauthenticated delete smoke failed');

    const nonAdminDeleteImport = await callHandler(importsHandler, { method: 'DELETE', url: `/api/finance/imports?id=${encodeURIComponent(imported.data.import.id)}`, cookie: repCookie, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(nonAdminDeleteImport.status === 403, 'finance import non-admin delete smoke failed');

    const deletedImport = await callHandler(importsHandler, { method: 'DELETE', url: `/api/finance/imports?id=${encodeURIComponent(imported.data.import.id)}`, cookie, headers: { origin: 'http://127.0.0.1:3321' } });
    assert(deletedImport.status === 200 && deletedImport.data.deleted === true, 'finance import delete smoke failed');

    const afterDeleteSummary = await callHandler(summaryHandler, { method: 'GET', url: '/api/finance/summary?month=2099-12', cookie });
    assert(afterDeleteSummary.status === 200 && afterDeleteSummary.data.summary.latestFinanceImport === null, 'finance import delete fallback smoke failed');
    assert(afterDeleteSummary.data.summary.metrics.totalAvailableBalanceCents === 0, 'finance import delete metrics fallback smoke failed');

    const missing = await callHandler(invoiceHandler, { method: 'GET', url: '/api/invoices?id=missing', cookie });
    assert(missing.status === 404, 'invoice missing smoke failed');

    const optionalMetaInvoice = await callHandler(invoiceHandler, {
      method: 'POST',
      url: '/api/invoices',
      cookie,
      body: {
        from: { name: 'What are we capable of?', email: 'hello@whatarewecapableof.com' },
        client: { company: 'Optional metadata example', invoiceCode: 'OPTIONAL' },
        invoiceDate: '',
        dueDate: '',
        project: '',
        salesRep: '',
        items: [{ description: 'Optional metadata work', quantity: 1, unitPrice: '25.00' }],
      },
    });
    assert(optionalMetaInvoice.status === 201, 'optional metadata invoice create smoke failed');
    assert(optionalMetaInvoice.data.invoice.invoiceDate === '', 'optional invoice date smoke failed');
    assert(optionalMetaInvoice.data.invoice.dueDate === '', 'optional due date smoke failed');
    assert(optionalMetaInvoice.data.invoice.project === '', 'optional project smoke failed');
    assert(optionalMetaInvoice.data.invoice.salesRep === '', 'optional sales rep smoke failed');
    const optionalMetaReadBack = await callHandler(invoiceHandler, { method: 'GET', url: `/api/invoices?id=${encodeURIComponent(optionalMetaInvoice.data.invoice.id)}`, cookie });
    assert(optionalMetaReadBack.status === 200 && optionalMetaReadBack.data.invoice.dueDate === '', 'optional metadata readback smoke failed');

    const paidActiveDelete = await callHandler(invoiceHandler, { method: 'DELETE', url: `/api/invoices?id=${encodeURIComponent(id)}`, cookie });
    assert(paidActiveDelete.status === 409, 'paid Stripe payment delete guard smoke failed');
    await fakeDb.failCustomerCheckoutPaymentRequest(payment.id, 'synthetic cleanup failure');
    await fakeDb.failCustomerCheckoutPaymentRequest(bankCheckout.data.payment.id, 'synthetic cleanup failure');
    await fakeDb.failCustomerCheckoutPaymentRequest(checkoutCreated.data.payment.id, 'synthetic cleanup failure');
    await fakeDb.failCustomerCheckoutPaymentRequest(ndgCardCheckout.data.payment.id, 'synthetic NDG cleanup failure');
    await fakeDb.failCustomerCheckoutPaymentRequest(ndgCheckout.data.payment.id, 'synthetic NDG page cleanup failure');

    for (const invoiceId of [id, ndgInvoice.data.invoice.id, privateInvoice.data.invoice.id, fallbackPrivateInvoice.data.invoice.id, optionalMetaInvoice.data.invoice.id]) {
      const deleted = await callHandler(invoiceHandler, { method: 'DELETE', url: `/api/invoices?id=${encodeURIComponent(invoiceId)}`, cookie });
      assert(deleted.status === 200 && deleted.data.deleted === true, 'invoice delete smoke failed');
    }

    const listAfterDelete = await callHandler(invoiceHandler, { method: 'GET', url: '/api/invoices', cookie });
    assert(listAfterDelete.status === 200 && listAfterDelete.data.invoices.length === 0, 'invoice delete/list smoke failed');
  } finally {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    routePaths.forEach((path) => delete require.cache[path]);
    delete require.cache[require.resolve('../api/_db.js')];
  }
}

try {
  const health = await fetchWithRetry('/api/health');
  assert(health.ok, `health ${health.status}`);
  const healthJson = await health.json();
  assert(healthJson.ok && healthJson.service === 'wawco-fin', 'bad health payload');

  const session = await fetchWithRetry('/api/session');
  assert(session.ok, `session ${session.status}`);
  const sessionJson = await session.json();
  assert(sessionJson.auth.configured === false, 'expected auth to be unconfigured in smoke');

  const page = await fetchWithRetry('/');
  const html = await page.text();
  assert(html.includes('Custom WAWCO invoice + Stripe Checkout'), 'missing selected path copy');

  const invoicesPage = await fetchWithRetry('/invoices');
  const invoicesHtml = await invoicesPage.text();
  assert(invoicesHtml.includes('Invoice studio') && invoicesHtml.includes('Save draft'), 'missing invoices page copy');
  assert(invoicesHtml.includes('Saved payee profiles'), 'missing payee profile UI marker');
  assert(invoicesHtml.includes('Saved client profiles'), 'missing client profile UI marker');
  assert(invoicesHtml.includes('Saved user profiles'), 'missing user profile UI marker');
  assert(invoicesHtml.includes('Import JSON'), 'missing JSON import UI marker');
  assert(invoicesHtml.includes('Export Mercury plan'), 'missing Mercury plan UI marker');
  assert(invoicesHtml.includes('Private, exclude from entity dashboard'), 'missing private payee UI marker');
  assert(invoicesHtml.includes('SUBSTRATE-052626-01'), 'missing client-date numbering UI marker');
  assert(invoicesHtml.includes('client-invoice-code'), 'missing client invoice code UI marker');
  assert(invoicesHtml.includes('preview-due-date-field'), 'missing optional metadata preview wrappers');
  assert(invoicesHtml.includes('approve-invoice') && invoicesHtml.includes('Stripe payment') && invoicesHtml.includes('create-test-payment-link') && invoicesHtml.includes('create-live-payment-link'), 'missing Stripe payment UI marker');
  assert(invoicesHtml.includes('Create live pages only after invoice approval'), 'missing Stripe live-link warning marker');
  assert(!invoicesHtml.includes('id="preview-status"'), 'client-facing invoice preview should not render internal status badge');

  const invoicesJs = await fetchWithRetry('/invoices.js');
  const invoicesJsText = await invoicesJs.text();
  assert(invoicesJsText.includes('/api/profiles?type=payee'), 'missing profile API client marker');
  assert(invoicesJsText.includes('/api/entities'), 'missing entity API client marker');
  assert(invoicesJsText.includes('/api/numbering'), 'missing numbering API client marker');
  assert(invoicesJsText.includes('sequencePadding'), 'missing client-date numbering client marker');
  assert(invoicesJsText.includes('previewMeta.hidden'), 'missing optional metadata client marker');
  assert(!invoicesJsText.includes('previewStatus'), 'client-facing invoice status badge should not be rendered');
  assert(invoicesJsText.includes('sendEmailOption: DontSend'), 'missing safe Mercury plan marker');
  assert(invoicesJsText.includes('No Mercury API call was made'), 'missing Mercury non-write marker');
  assert(invoicesJsText.includes('/api/stripe/checkout'), 'missing Stripe Checkout client marker');
  assert(invoicesJsText.includes("createPaymentLink('live')"), 'missing Stripe live Checkout client marker');
  assert(invoicesJsText.includes('TEST MODE, DO NOT PAY'), 'missing Stripe test payment preview marker');

  const payPage = await fetchWithRetry('/pay');
  const payHtml = await payPage.text();
  assert(payHtml.includes('Pay invoice') && payHtml.includes('Continue to Stripe'), 'missing public pay page copy');
  const payJs = await fetchWithRetry('/pay.js');
  const payJsText = await payJs.text();
  assert(payJsText.includes('/api/pay') && payJsText.includes('/api/pay/checkout') && payJsText.includes('bank_account') && payJsText.includes('card'), 'missing public pay client markers');

  const financePage = await fetchWithRetry('/finance');
  const financeHtml = await financePage.text();
  assert(financeHtml.includes('Recurring stack forecast') && financeHtml.includes('Observed card expenses') && financeHtml.includes('Hosted invoice operations'), 'missing finance parity page copy');
  assert(financeHtml.includes('<th>Payment</th>'), 'missing hosted invoice payment column marker');
  assert(financeHtml.includes('Derived finance summary import') && financeHtml.includes('finance-import-file'), 'missing finance import UI marker');
  assert(financeHtml.includes('entity-select'), 'missing finance entity selector UI marker');

  const financeJs = await fetchWithRetry('/finance.js');
  const financeJsText = await financeJs.text();
  assert(financeJsText.includes('/api/finance/import-summary') && financeJsText.includes('/api/finance/imports'), 'missing finance import client marker');
  assert(financeJsText.includes('entity=') || financeJsText.includes("params.set('entity'"), 'missing finance entity query client marker');
  assert(financeJsText.includes('paymentLabel') && financeJsText.includes('Paid online'), 'missing finance payment-status client marker');

  const protectedRoute = await fetchWithRetry('/api/invoices');
  assert(protectedRoute.status === 401, `expected invoices 401, got ${protectedRoute.status}`);

  const protectedSummaryRoute = await fetchWithRetry('/api/finance/summary');
  assert(protectedSummaryRoute.status === 401, `expected finance summary 401, got ${protectedSummaryRoute.status}`);

  const protectedEntitiesRoute = await fetchWithRetry('/api/entities');
  assert(protectedEntitiesRoute.status === 401, `expected entities 401, got ${protectedEntitiesRoute.status}`);

  const protectedImportsRoute = await fetchWithRetry('/api/finance/imports');
  assert(protectedImportsRoute.status === 401, `expected finance imports 401, got ${protectedImportsRoute.status}`);

  await runAuthenticatedRouteSmoke();
  console.log('fin-smoke-ok');
} finally {
  await new Promise((resolve) => server.close(resolve));
  for (const [key, value] of Object.entries(serverEnvBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
