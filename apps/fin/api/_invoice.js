const crypto = require('crypto');

const STATUS_VALUES = new Set(['draft', 'ready_for_review', 'approved', 'issued', 'paid', 'void']);
const MAX_ITEMS = 50;

const ENTITY_DEFINITIONS = [
  {
    id: 'wawco',
    key: 'wawco',
    label: 'WAWCO',
    name: 'What are we capable of?',
    legalName: 'What are we capable of?',
    email: 'hello@whatarewecapableof.com',
    address: '',
    invoiceCodePrefix: '',
    reportingScope: 'wawco',
    stripeAccountKey: 'default',
    remitInstructions: 'Payment instructions to be confirmed before sending.',
    defaultTerms: 'Payment due within 14 days unless otherwise agreed.',
    branding: {
      payPageEyebrow: 'What are we capable of?',
      payPageHelp: 'What are we capable of? updates the invoice after Stripe confirms the payment status.',
    },
  },
  {
    id: 'ndg',
    key: 'ndg',
    label: 'NDG',
    name: 'Noah Development Group LLC',
    legalName: 'Noah Development Group LLC',
    email: '',
    address: '',
    invoiceCodePrefix: 'NDG',
    reportingScope: 'ndg',
    stripeAccountKey: 'ndg',
    remitInstructions: 'Payment instructions to be confirmed before sending.',
    defaultTerms: 'Payment due within 14 days unless otherwise agreed.',
    branding: {
      payPageEyebrow: 'Noah Development Group LLC',
      payPageHelp: 'Noah Development Group LLC updates the invoice after Stripe confirms the payment status.',
    },
  },
];

const ENTITY_BY_ID = new Map(ENTITY_DEFINITIONS.map((entity) => [entity.id, entity]));
const REPORTING_SCOPES = new Set(['wawco', 'ndg', 'private']);

function cleanSingleLine(value, max = 240) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanText(value, max = 2000) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').slice(0, max);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cleanDate(value, fallback = todayIso()) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return fallback;
  const date = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return fallback;
  return date.toISOString().slice(0, 10) === text ? text : fallback;
}

function cleanOptionalDate(value, fallback = '') {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return cleanDate(text, fallback);
}

function cleanCurrency(value) {
  const text = cleanSingleLine(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(text) ? text : 'USD';
}

function cleanEntityId(value, fallback = 'wawco') {
  const id = cleanSingleLine(value, 40).toLowerCase();
  if (ENTITY_BY_ID.has(id)) return id;
  return ENTITY_BY_ID.has(fallback) ? fallback : 'wawco';
}

function entityById(value) {
  return ENTITY_BY_ID.get(cleanEntityId(value)) || ENTITY_BY_ID.get('wawco');
}

function publicEntity(entityInput) {
  const entity = entityById(typeof entityInput === 'string' ? entityInput : entityInput?.id);
  return {
    id: entity.id,
    key: entity.key,
    label: entity.label,
    name: entity.name,
    legalName: entity.legalName,
    email: entity.email,
    invoiceCodePrefix: entity.invoiceCodePrefix,
    reportingScope: entity.reportingScope,
    stripeAccountKey: entity.stripeAccountKey,
    branding: { ...(entity.branding || {}) },
  };
}

function invoiceEntities() {
  return ENTITY_DEFINITIONS.map(publicEntity);
}

function entityInvoiceDefaults(entityId) {
  const entity = entityById(entityId);
  return {
    entityId: entity.id,
    payeeReportingScope: entity.reportingScope,
    from: {
      name: entity.name,
      company: entity.legalName || entity.name,
      email: entity.email,
      address: entity.address,
      mercuryDestinationAccountId: '',
    },
    terms: entity.defaultTerms,
    paymentInstructions: entity.remitInstructions,
  };
}

function cleanReportingScope(value, entityId = 'wawco') {
  const scope = cleanSingleLine(value, 40).toLowerCase();
  if (REPORTING_SCOPES.has(scope)) return scope;
  return entityById(entityId).reportingScope || 'wawco';
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

function calculateTotals(items, discount, taxRate, shipping) {
  const subtotalCents = items.reduce((sum, item) => {
    const unitPriceCents = Math.max(0, parseMoneyToCents(item.unitPrice));
    return sum + Math.round(unitPriceCents * cleanQuantity(item.quantity));
  }, 0);
  const discountCents = Math.min(subtotalCents, Math.max(0, parseMoneyToCents(discount)));
  const taxableCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round(taxableCents * (cleanRatePercent(taxRate) / 100));
  const shippingCents = Math.max(0, parseMoneyToCents(shipping));
  const totalCents = taxableCents + taxCents + shippingCents;
  return { subtotalCents, discountCents, taxableCents, taxCents, shippingCents, totalCents };
}

function baseInvoice(invoiceNumber = '', entityIdInput = 'wawco') {
  const defaults = entityInvoiceDefaults(entityIdInput);
  return {
    id: '',
    entityId: defaults.entityId,
    entity: publicEntity(defaults.entityId),
    invoiceNumber,
    status: 'draft',
    currency: 'USD',
    project: '',
    invoiceDate: todayIso(),
    dueDate: '',
    salesRep: '',
    salesRepEmail: '',
    salesRole: 'admin',
    payeeProfileId: '',
    clientProfileId: '',
    userProfileId: '',
    payeeReportingScope: defaults.payeeReportingScope,
    excludeFromWawcoDashboard: false,
    from: defaults.from,
    client: {
      name: '',
      company: '',
      email: '',
      address: '',
      mercuryCustomerId: '',
      invoiceCode: '',
    },
    items: [
      {
        id: crypto.randomUUID(),
        description: 'Consulting work',
        quantity: 1,
        unitPrice: '0.00',
      },
    ],
    discount: '0.00',
    taxRate: 0,
    shipping: '0.00',
    notes: 'Thank you.',
    terms: defaults.terms,
    paymentInstructions: defaults.paymentInstructions,
    totals: {
      subtotalCents: 0,
      discountCents: 0,
      taxableCents: 0,
      taxCents: 0,
      shippingCents: 0,
      totalCents: 0,
    },
  };
}

function normalizeInvoice(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const entityId = cleanEntityId(source.entityId || source.entity_id || options.entityId || 'wawco');
  const entityDefaults = entityInvoiceDefaults(entityId);
  const fallback = baseInvoice(options.invoiceNumber || source.invoiceNumber || '', entityId);
  const status = STATUS_VALUES.has(cleanSingleLine(source.status || fallback.status, 40))
    ? cleanSingleLine(source.status || fallback.status, 40)
    : 'draft';
  const rawItems = Array.isArray(source.items) ? source.items.slice(0, MAX_ITEMS) : fallback.items;
  const items = rawItems.map((item) => {
    const src = item && typeof item === 'object' ? item : {};
    return {
      id: cleanSingleLine(src.id, 80) || crypto.randomUUID(),
      description: cleanText(src.description, 600).trim(),
      quantity: cleanQuantity(src.quantity || 0),
      unitPrice: centsToInput(Math.max(0, parseMoneyToCents(src.unitPrice))),
    };
  }).filter((item) => item.description || item.quantity || parseMoneyToCents(item.unitPrice));

  if (!items.length) {
    items.push({ id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: '0.00' });
  }

  const discount = centsToInput(Math.max(0, parseMoneyToCents(source.discount)));
  const shipping = centsToInput(Math.max(0, parseMoneyToCents(source.shipping)));
  const taxRate = cleanRatePercent(source.taxRate);
  const totals = calculateTotals(items, discount, taxRate, shipping);
  const hasOwn = Object.prototype.hasOwnProperty;
  const invoiceDateSource = hasOwn.call(source, 'invoiceDate') ? source.invoiceDate : fallback.invoiceDate;
  const dueDateSource = hasOwn.call(source, 'dueDate') ? source.dueDate : fallback.dueDate;
  const reportingScope = cleanReportingScope(source.payeeReportingScope, entityId);

  return {
    id: cleanSingleLine(source.id || options.id || '', 80),
    entityId,
    entity: publicEntity(entityId),
    invoiceNumber: cleanSingleLine(options.invoiceNumber || source.invoiceNumber || fallback.invoiceNumber, 80),
    status,
    currency: cleanCurrency(source.currency || fallback.currency),
    project: cleanSingleLine(source.project, 240),
    invoiceDate: cleanOptionalDate(invoiceDateSource, fallback.invoiceDate),
    dueDate: cleanOptionalDate(dueDateSource, fallback.dueDate),
    salesRep: cleanSingleLine(source.salesRep, 240),
    salesRepEmail: cleanSingleLine(source.salesRepEmail, 240),
    salesRole: ['admin', 'reviewer', 'sales-rep'].includes(cleanSingleLine(source.salesRole, 40)) ? cleanSingleLine(source.salesRole, 40) : 'admin',
    payeeProfileId: cleanSingleLine(source.payeeProfileId, 80),
    clientProfileId: cleanSingleLine(source.clientProfileId, 80),
    userProfileId: cleanSingleLine(source.userProfileId, 80),
    payeeReportingScope: reportingScope,
    excludeFromWawcoDashboard: Boolean(source.excludeFromWawcoDashboard) || reportingScope === 'private',
    from: {
      name: cleanSingleLine(source.from?.name || fallback.from.name || entityDefaults.from.name, 240),
      company: cleanSingleLine(source.from?.company || fallback.from.company || entityDefaults.from.company, 240),
      email: cleanSingleLine(source.from?.email || fallback.from.email || entityDefaults.from.email, 240),
      address: cleanText(source.from?.address || fallback.from.address || entityDefaults.from.address, 1000).trim(),
      mercuryDestinationAccountId: cleanSingleLine(source.from?.mercuryDestinationAccountId || fallback.from.mercuryDestinationAccountId, 160),
    },
    client: {
      name: cleanSingleLine(source.client?.name, 240),
      company: cleanSingleLine(source.client?.company, 240),
      email: cleanSingleLine(source.client?.email, 240),
      address: cleanText(source.client?.address, 1000).trim(),
      mercuryCustomerId: cleanSingleLine(source.client?.mercuryCustomerId, 160),
      invoiceCode: cleanSingleLine(source.client?.invoiceCode, 40).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 24),
    },
    items,
    discount,
    taxRate,
    shipping,
    notes: cleanText(source.notes ?? fallback.notes, 2000).trim(),
    terms: cleanText(source.terms ?? fallback.terms, 2000).trim(),
    paymentInstructions: cleanText(source.paymentInstructions ?? fallback.paymentInstructions, 2000).trim(),
    totals,
  };
}

function invoiceClientLabel(invoice) {
  return invoice.client.company || invoice.client.name || invoice.client.email || 'Untitled client';
}

function invoiceListItem(row) {
  const entityId = cleanEntityId(row.entity_id || row.entityId || 'wawco');
  const entity = publicEntity(entityId);
  return {
    id: row.id,
    entityId,
    entityLabel: entity.label,
    invoiceNumber: row.invoice_number,
    status: row.status,
    clientLabel: row.client_label || 'Untitled client',
    invoiceDate: row.invoice_date || '',
    dueDate: row.due_date || '',
    totalCents: Number(row.total_cents || 0),
    updatedAt: row.updated_at || '',
    createdBy: row.created_by_email || '',
  };
}

module.exports = {
  normalizeInvoice,
  invoiceClientLabel,
  invoiceListItem,
  cleanEntityId,
  entityById,
  invoiceEntities,
  publicEntity,
  entityInvoiceDefaults,
};
