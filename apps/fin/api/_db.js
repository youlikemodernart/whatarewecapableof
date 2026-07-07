const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const { normalizeInvoice, invoiceClientLabel, invoiceListItem, cleanEntityId, cleanReportingEntityId, cleanVisibilityState, invoiceEntities, publicEntity, entityById } = require('./_invoice');
const { normalizeFinanceImport, stableFinanceImportContentSha256, summarizeFinanceImport } = require('./_finance_import');
const { cleanPaymentMethod, customerPaymentMethods, paymentMethodQuote } = require('./_payment_pricing');
const { assertInvoiceAllowsStripePaymentPage, normalizePaymentProvider } = require('./_payment_provider');
const { reconciliationFromCharge, retrieveChargeReconciliation } = require('./_stripe');
const { cleanEmail, paymentEmailRuntimeStatus, sendPaymentNotificationEmail } = require('./_mail');
const { normalizeRecurringInvoiceTemplate, recurringTemplateSafeSummary, recurringTemplateListItem, buildRecurringInvoiceForRun, nextRecurringRunDate, recurringRunSummary, cleanDate: cleanRecurringDate } = require('./_recurring');

let sqlClient = null;
let schemaReady = false;

const PROFILE_TYPES = new Set(['payee', 'client', 'user']);

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function databaseUrl() {
  return env('POSTGRES_URL') || env('DATABASE_URL');
}

function sql() {
  const url = databaseUrl();
  if (!url) throw new Error('POSTGRES_URL or DATABASE_URL is not configured.');
  if (!sqlClient) sqlClient = neon(url);
  return sqlClient;
}

function adminEmails() {
  const configured = env('FIN_ADMIN_EMAILS');
  const fallback = 'noah@whatarewecapableof.com,austin@whatarewecapableof.com';
  return new Set((configured || fallback).split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

function roleForUser(user) {
  return adminEmails().has(String(user.email || '').toLowerCase()) ? 'admin' : 'sales_rep';
}

function noahEntityEmails() {
  const configured = env('FIN_NDG_ENTITY_EMAILS');
  const fallback = 'noah@whatarewecapableof.com';
  return new Set((configured || fallback).split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

function userVisibleEntityIds(userOrRow = {}) {
  const email = String(userOrRow.email || '').toLowerCase();
  const ids = noahEntityEmails().has(email) ? invoiceEntities().map((entity) => entity.id) : ['wawco'];
  return [...new Set(ids.map((id) => cleanEntityId(id)))];
}

function userCanSeeAllInvoiceViews(userOrRow = {}) {
  return noahEntityEmails().has(String(userOrRow.email || '').toLowerCase());
}

function userEntityPermissions(userOrRow = {}) {
  const visibleEntityIds = userVisibleEntityIds(userOrRow);
  return {
    visibleEntityIds,
    canViewAllInvoices: userCanSeeAllInvoiceViews(userOrRow),
    combinedEntityMode: visibleEntityIds.length > 1 ? 'visible_entities' : 'wawco_only',
  };
}

function userCanAccessEntity(userOrRow = {}, entityId) {
  return userVisibleEntityIds(userOrRow).includes(cleanEntityId(entityId));
}

function enforceEntityAccess(userOrRow = {}, entityId, message = 'Invoice entity is not available to this user.') {
  if (!userCanAccessEntity(userOrRow, entityId)) throw makeError(403, message);
}

function financeImportsEnabled() {
  return env('FIN_FINANCE_IMPORTS_ENABLED', '1') !== '0';
}

function makeError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanSingleLine(value, max = 240) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanText(value, max = 2000) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').slice(0, max).trim();
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

function nullableDate(value) {
  const text = cleanSingleLine(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanProfileType(type) {
  const value = cleanSingleLine(type, 40);
  if (!PROFILE_TYPES.has(value)) throw makeError(400, 'Unknown profile type.');
  return value;
}

function parseStoredInvoice(value) {
  if (!value) return null;
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

function entitySeedRows() {
  return invoiceEntities().map((entity) => ({
    ...entity,
    legalName: entity.legalName || entity.name,
    remitInstructions: entityById(entity.id).remitInstructions || '',
    branding: entity.branding || {},
  }));
}

function stripeAccountKeyForEntity(entityId) {
  return entityById(entityId).stripeAccountKey || 'default';
}

function invoiceNumberPrefixForEntity(entityId) {
  return cleanSingleLine(entityById(entityId).invoiceCodePrefix, 20).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12);
}

function publicEntityForInvoice(invoice = {}) {
  return publicEntity(cleanEntityId(invoice.entityId || invoice.entity_id || 'wawco'));
}

function cleanBoolean(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
  return false;
}

function canonicalInvoiceFields(invoice = {}, fallbackEntityId = 'wawco') {
  const entityId = cleanEntityId(invoice.entityId || invoice.entity_id || fallbackEntityId || 'wawco');
  const reportingScope = cleanSingleLine(invoice.payeeReportingScope, 40).toLowerCase();
  const reportingEntityId = cleanReportingEntityId(invoice.reportingEntityId || invoice.reporting_entity_id || (reportingScope && reportingScope !== 'private' ? reportingScope : '') || entityId, entityId);
  const dashboardExcluded = cleanBoolean(invoice.dashboardExcluded ?? invoice.dashboard_excluded ?? invoice.excludeFromWawcoDashboard) || reportingScope === 'private';
  return {
    entityId,
    reportingEntityId,
    visibilityState: cleanVisibilityState(invoice.visibilityState || invoice.visibility_state || 'active'),
    visibilityReason: cleanSingleLine(invoice.visibilityReason || invoice.visibility_reason, 240),
    isTest: cleanBoolean(invoice.isTest ?? invoice.is_test),
    testReason: cleanSingleLine(invoice.testReason || invoice.test_reason, 240),
    dashboardExcluded,
  };
}

function invoiceFromRow(row) {
  if (!row) return null;
  const invoice = parseStoredInvoice(row.data_json) || {};
  const fields = canonicalInvoiceFields({
    ...invoice,
    entityId: row.entity_id || invoice.entityId,
    reportingEntityId: row.reporting_entity_id || invoice.reportingEntityId,
    visibilityState: row.visibility_state || invoice.visibilityState,
    visibilityReason: row.visibility_reason || invoice.visibilityReason,
    visibilityUpdatedAt: row.visibility_updated_at || invoice.visibilityUpdatedAt,
    isTest: row.is_test ?? invoice.isTest,
    testReason: row.test_reason || invoice.testReason,
    dashboardExcluded: row.dashboard_excluded ?? invoice.dashboardExcluded ?? invoice.excludeFromWawcoDashboard,
  }, row.entity_id || invoice.entityId || 'wawco');
  const payeeReportingScope = invoice.payeeReportingScope === 'private' || fields.dashboardExcluded && invoice.payeeReportingScope === 'private' ? 'private' : fields.reportingEntityId;
  return {
    ...invoice,
    id: row.id || invoice.id || '',
    entityId: fields.entityId,
    entity: publicEntity(fields.entityId),
    reportingEntityId: fields.reportingEntityId,
    reportingEntity: publicEntity(fields.reportingEntityId),
    visibilityState: fields.visibilityState,
    visibilityReason: fields.visibilityReason,
    visibilityUpdatedAt: row.visibility_updated_at || invoice.visibilityUpdatedAt || '',
    visibilityUpdatedByUserId: row.visibility_updated_by_user_id || invoice.visibilityUpdatedByUserId || '',
    isTest: fields.isTest,
    testReason: fields.testReason,
    dashboardExcluded: fields.dashboardExcluded,
    payeeReportingScope,
    excludeFromWawcoDashboard: fields.dashboardExcluded,
    status: row.status || invoice.status || 'draft',
    paymentStatus: row.payment_status || invoice.paymentStatus || 'none',
    currentPaymentRequestId: row.current_payment_request_id || invoice.currentPaymentRequestId || '',
    paidAt: row.paid_at || invoice.paidAt || '',
    paymentUpdatedAt: row.payment_updated_at || invoice.paymentUpdatedAt || '',
  };
}

function rowReportingEntityId(row) {
  const invoice = parseStoredInvoice(row.data_json) || {};
  const entityId = cleanEntityId(row.entity_id || invoice.entityId || 'wawco');
  return cleanReportingEntityId(row.reporting_entity_id || invoice.reportingEntityId || (invoice.payeeReportingScope && invoice.payeeReportingScope !== 'private' ? invoice.payeeReportingScope : '') || entityId, entityId);
}

function userCanAccessInvoiceRow(currentUser, row) {
  const invoice = parseStoredInvoice(row.data_json) || {};
  const entityId = cleanEntityId(row.entity_id || invoice.entityId || 'wawco');
  return userCanAccessEntity(currentUser, entityId) && userCanAccessEntity(currentUser, rowReportingEntityId(row));
}

const INVOICE_LIST_VIEWS = new Set(['active', 'recently_paid', 'processing', 'archive', 'tests', 'all']);
const RECENTLY_PAID_DAYS = 7;

function cleanInvoiceListView(value) {
  const view = cleanSingleLine(value || 'active', 40).toLowerCase();
  return INVOICE_LIST_VIEWS.has(view) ? view : 'active';
}

function timestampMs(value) {
  if (!value) return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function invoiceRowIsPaid(row) {
  return row.status === 'paid' || row.payment_status === 'paid' || row.payment_request_status === 'paid';
}

function invoiceRowIsRecentlyPaid(row) {
  if (!invoiceRowIsPaid(row)) return false;
  const paidMs = timestampMs(row.paid_at || row.payment_updated_at || row.updated_at);
  if (!Number.isFinite(paidMs)) return false;
  return Date.now() - paidMs <= RECENTLY_PAID_DAYS * 86_400_000;
}

function invoiceMatchesListView(row, view) {
  const visibilityState = cleanVisibilityState(row.visibility_state || 'active');
  const isTest = cleanBoolean(row.is_test);
  const status = cleanSingleLine(row.status, 40).toLowerCase();
  const paid = invoiceRowIsPaid(row);
  const recentlyPaid = invoiceRowIsRecentlyPaid(row);
  const processing = row.payment_status === 'processing' || row.payment_request_status === 'processing';
  if (view === 'all') return true;
  if (visibilityState === 'hidden') return false;
  if (view === 'tests') return isTest;
  if (view === 'processing') return !isTest && visibilityState === 'active' && processing;
  if (view === 'recently_paid') return !isTest && visibilityState === 'active' && paid && recentlyPaid;
  if (view === 'archive') return visibilityState === 'archived' || isTest || status === 'void' || (paid && !recentlyPaid);
  return !isTest && visibilityState === 'active' && status !== 'void' && (!paid || recentlyPaid);
}

async function ensureSchema() {
  if (schemaReady) return;
  const db = sql();
  await db`CREATE TABLE IF NOT EXISTS fin_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'sales_rep',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    google_subject TEXT UNIQUE,
    picture TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
  )`;

  await db`CREATE TABLE IF NOT EXISTS fin_invoice_number_sequences (
    prefix TEXT NOT NULL,
    year INTEGER NOT NULL,
    next_number INTEGER NOT NULL DEFAULT 1,
    padding INTEGER NOT NULL DEFAULT 3,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (prefix, year)
  )`;
  await db`ALTER TABLE fin_invoice_number_sequences ADD COLUMN IF NOT EXISTS include_year BOOLEAN NOT NULL DEFAULT TRUE`;

  await db`CREATE TABLE IF NOT EXISTS fin_invoice_numbering_settings (
    id TEXT PRIMARY KEY,
    sequence_padding INTEGER NOT NULL DEFAULT 2,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await db`CREATE TABLE IF NOT EXISTS fin_entities (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    legal_name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    invoice_code_prefix TEXT NOT NULL DEFAULT '',
    reporting_scope TEXT NOT NULL DEFAULT 'wawco',
    stripe_account_key TEXT NOT NULL DEFAULT 'default',
    remit_instructions TEXT NOT NULL DEFAULT '',
    branding_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  for (const entity of entitySeedRows()) {
    await db`
      INSERT INTO fin_entities (id, key, label, name, legal_name, address, email, invoice_code_prefix, reporting_scope, stripe_account_key, remit_instructions, branding_json, active, created_at, updated_at)
      VALUES (${entity.id}, ${entity.key}, ${entity.label}, ${entity.name}, ${entity.legalName}, ${entity.address || ''}, ${entity.email || ''}, ${entity.invoiceCodePrefix || ''}, ${entity.reportingScope || entity.id}, ${entity.stripeAccountKey || 'default'}, ${entity.remitInstructions || ''}, ${JSON.stringify(entity.branding || {})}::jsonb, TRUE, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        key = EXCLUDED.key,
        label = EXCLUDED.label,
        name = EXCLUDED.name,
        legal_name = EXCLUDED.legal_name,
        address = EXCLUDED.address,
        email = EXCLUDED.email,
        invoice_code_prefix = EXCLUDED.invoice_code_prefix,
        reporting_scope = EXCLUDED.reporting_scope,
        stripe_account_key = EXCLUDED.stripe_account_key,
        remit_instructions = EXCLUDED.remit_instructions,
        branding_json = EXCLUDED.branding_json,
        active = TRUE,
        updated_at = now()
    `;
  }

  await db`CREATE TABLE IF NOT EXISTS fin_invoice_daily_sequences (
    entity_id TEXT NOT NULL DEFAULT 'wawco',
    date_key TEXT NOT NULL,
    next_number INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity_id, date_key)
  )`;
  await db`ALTER TABLE fin_invoice_daily_sequences ADD COLUMN IF NOT EXISTS entity_id TEXT NOT NULL DEFAULT 'wawco'`;
  await db`UPDATE fin_invoice_daily_sequences SET entity_id = 'wawco' WHERE entity_id IS NULL OR entity_id = ''`;
  await db`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin_invoice_daily_sequences'::regclass
          AND conname = 'fin_invoice_daily_sequences_pkey'
          AND pg_get_constraintdef(oid) <> 'PRIMARY KEY (entity_id, date_key)'
      ) THEN
        ALTER TABLE fin_invoice_daily_sequences DROP CONSTRAINT fin_invoice_daily_sequences_pkey;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin_invoice_daily_sequences'::regclass
          AND conname = 'fin_invoice_daily_sequences_pkey'
      ) THEN
        ALTER TABLE fin_invoice_daily_sequences ADD CONSTRAINT fin_invoice_daily_sequences_pkey PRIMARY KEY (entity_id, date_key);
      END IF;
    END $$;
  `;

  await db`CREATE TABLE IF NOT EXISTS fin_invoices (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL DEFAULT 'wawco' REFERENCES fin_entities(id),
    reporting_entity_id TEXT NOT NULL DEFAULT 'wawco' REFERENCES fin_entities(id),
    visibility_state TEXT NOT NULL DEFAULT 'active',
    visibility_reason TEXT NOT NULL DEFAULT '',
    visibility_updated_at TIMESTAMPTZ,
    visibility_updated_by_user_id TEXT REFERENCES fin_users(id),
    is_test BOOLEAN NOT NULL DEFAULT FALSE,
    test_reason TEXT NOT NULL DEFAULT '',
    dashboard_excluded BOOLEAN NOT NULL DEFAULT FALSE,
    invoice_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft',
    client_label TEXT NOT NULL DEFAULT 'Untitled client',
    invoice_date DATE,
    due_date DATE,
    currency TEXT NOT NULL DEFAULT 'USD',
    project TEXT NOT NULL DEFAULT '',
    created_by_user_id TEXT NOT NULL REFERENCES fin_users(id),
    assigned_rep_user_id TEXT REFERENCES fin_users(id),
    approved_by_user_id TEXT REFERENCES fin_users(id),
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    taxable_cents INTEGER NOT NULL DEFAULT 0,
    tax_cents INTEGER NOT NULL DEFAULT 0,
    shipping_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    data_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ,
    issued_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
  )`;

  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS entity_id TEXT NOT NULL DEFAULT 'wawco'`;
  await db`UPDATE fin_invoices SET entity_id = 'wawco' WHERE entity_id IS NULL OR entity_id = ''`;
  await db`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_invoices_entity_id_fk' AND conrelid = 'fin_invoices'::regclass) THEN
        ALTER TABLE fin_invoices ADD CONSTRAINT fin_invoices_entity_id_fk FOREIGN KEY (entity_id) REFERENCES fin_entities(id) NOT VALID;
      END IF;
    END $$;
  `;
  await db`ALTER TABLE fin_invoices VALIDATE CONSTRAINT fin_invoices_entity_id_fk`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS reporting_entity_id TEXT`;
  await db`
    UPDATE fin_invoices SET reporting_entity_id = CASE
      WHEN data_json->>'reportingEntityId' IN ('wawco', 'ndg') THEN data_json->>'reportingEntityId'
      WHEN data_json->>'payeeReportingScope' IN ('wawco', 'ndg') THEN data_json->>'payeeReportingScope'
      ELSE entity_id
    END
    WHERE reporting_entity_id IS NULL OR reporting_entity_id = ''
  `;
  await db`UPDATE fin_invoices SET reporting_entity_id = entity_id WHERE reporting_entity_id NOT IN (SELECT id FROM fin_entities)`;
  await db`ALTER TABLE fin_invoices ALTER COLUMN reporting_entity_id SET DEFAULT 'wawco'`;
  await db`ALTER TABLE fin_invoices ALTER COLUMN reporting_entity_id SET NOT NULL`;
  await db`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_invoices_reporting_entity_id_fk' AND conrelid = 'fin_invoices'::regclass) THEN
        ALTER TABLE fin_invoices ADD CONSTRAINT fin_invoices_reporting_entity_id_fk FOREIGN KEY (reporting_entity_id) REFERENCES fin_entities(id) NOT VALID;
      END IF;
    END $$;
  `;
  await db`ALTER TABLE fin_invoices VALIDATE CONSTRAINT fin_invoices_reporting_entity_id_fk`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS visibility_state TEXT NOT NULL DEFAULT 'active'`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS visibility_reason TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS visibility_updated_at TIMESTAMPTZ`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS visibility_updated_by_user_id TEXT REFERENCES fin_users(id)`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS test_reason TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS dashboard_excluded BOOLEAN NOT NULL DEFAULT FALSE`;
  await db`UPDATE fin_invoices SET visibility_state = 'active' WHERE visibility_state NOT IN ('active', 'archived', 'hidden')`;
  await db`
    UPDATE fin_invoices SET dashboard_excluded = TRUE
    WHERE dashboard_excluded = FALSE
      AND (
        data_json->>'payeeReportingScope' = 'private'
        OR lower(COALESCE(data_json->>'excludeFromWawcoDashboard', 'false')) IN ('true', '1', 'yes', 'on')
        OR lower(COALESCE(data_json->>'dashboardExcluded', 'false')) IN ('true', '1', 'yes', 'on')
      )
  `;
  await db`UPDATE fin_invoices SET data_json = jsonb_set(data_json, '{entityId}', to_jsonb(entity_id), true) WHERE data_json->>'entityId' IS NULL OR data_json->>'entityId' = ''`;
  await db`UPDATE fin_invoices SET data_json = jsonb_set(data_json, '{reportingEntityId}', to_jsonb(reporting_entity_id), true) WHERE data_json->>'reportingEntityId' IS NULL OR data_json->>'reportingEntityId' = ''`;
  await db`UPDATE fin_invoices SET data_json = jsonb_set(data_json, '{visibilityState}', to_jsonb(visibility_state), true) WHERE data_json->>'visibilityState' IS NULL OR data_json->>'visibilityState' = ''`;
  await db`UPDATE fin_invoices SET data_json = jsonb_set(data_json, '{isTest}', to_jsonb(is_test), true) WHERE data_json->>'isTest' IS NULL OR data_json->>'isTest' = ''`;
  await db`UPDATE fin_invoices SET data_json = jsonb_set(data_json, '{dashboardExcluded}', to_jsonb(dashboard_excluded), true) WHERE data_json->>'dashboardExcluded' IS NULL OR data_json->>'dashboardExcluded' = ''`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none'`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS current_payment_request_id TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS payment_updated_at TIMESTAMPTZ`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoices_updated_at_idx ON fin_invoices (updated_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoices_status_idx ON fin_invoices (status)`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoices_created_by_idx ON fin_invoices (created_by_user_id)`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoices_entity_idx ON fin_invoices (entity_id, updated_at DESC) WHERE deleted_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoices_reporting_entity_idx ON fin_invoices (reporting_entity_id, updated_at DESC) WHERE deleted_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoices_visibility_idx ON fin_invoices (visibility_state, is_test, updated_at DESC) WHERE deleted_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoices_payment_status_idx ON fin_invoices (payment_status)`;

  await db`CREATE TABLE IF NOT EXISTS fin_invoice_events (
    id BIGSERIAL PRIMARY KEY,
    invoice_id TEXT REFERENCES fin_invoices(id),
    actor_user_id TEXT REFERENCES fin_users(id),
    event_type TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await db`CREATE INDEX IF NOT EXISTS fin_invoice_events_invoice_idx ON fin_invoice_events (invoice_id, created_at DESC)`;

  await db`CREATE TABLE IF NOT EXISTS fin_invoice_payment_requests (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES fin_invoices(id),
    entity_id TEXT NOT NULL DEFAULT 'wawco' REFERENCES fin_entities(id),
    invoice_number TEXT NOT NULL DEFAULT '',
    invoice_snapshot_sha256 TEXT NOT NULL DEFAULT '',
    stripe_mode TEXT NOT NULL DEFAULT 'test',
    status TEXT NOT NULL DEFAULT 'creating',
    amount_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    payment_url TEXT NOT NULL DEFAULT '',
    payment_url_kind TEXT NOT NULL DEFAULT 'checkout_session',
    stripe_checkout_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_charge_id TEXT NOT NULL DEFAULT '',
    stripe_customer_id TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_by_user_id TEXT NOT NULL REFERENCES fin_users(id),
    approved_by_user_id TEXT REFERENCES fin_users(id),
    superseded_by_id TEXT REFERENCES fin_invoice_payment_requests(id),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS entity_id TEXT NOT NULL DEFAULT 'wawco'`;
  await db`UPDATE fin_invoice_payment_requests pr SET entity_id = inv.entity_id FROM fin_invoices inv WHERE pr.invoice_id = inv.id AND (pr.entity_id IS NULL OR pr.entity_id = '' OR pr.entity_id = 'wawco')`;
  await db`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_invoice_payment_requests_entity_id_fk' AND conrelid = 'fin_invoice_payment_requests'::regclass) THEN
        ALTER TABLE fin_invoice_payment_requests ADD CONSTRAINT fin_invoice_payment_requests_entity_id_fk FOREIGN KEY (entity_id) REFERENCES fin_entities(id) NOT VALID;
      END IF;
    END $$;
  `;
  await db`ALTER TABLE fin_invoice_payment_requests VALIDATE CONSTRAINT fin_invoice_payment_requests_entity_id_fk`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS payment_method_family TEXT NOT NULL DEFAULT 'legacy'`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS payment_method_type TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS fee_policy TEXT NOT NULL DEFAULT 'legacy_invoice_total'`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS base_amount_cents INTEGER NOT NULL DEFAULT 0`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS client_processing_cost_cents INTEGER NOT NULL DEFAULT 0`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS collection_amount_cents INTEGER NOT NULL DEFAULT 0`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS expected_stripe_fee_cents INTEGER NOT NULL DEFAULT 0`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS expected_net_cents INTEGER NOT NULL DEFAULT 0`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS expected_fee_formula_json JSONB NOT NULL DEFAULT '{}'::jsonb`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS fee_disclosure_text TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS public_token_hash TEXT`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS public_token_hint TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS public_url TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS actual_stripe_fee_cents INTEGER`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS actual_net_cents INTEGER`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'not_started'`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ`;
  await db`ALTER TABLE fin_invoice_payment_requests ADD COLUMN IF NOT EXISTS payment_method_details_json JSONB NOT NULL DEFAULT '{}'::jsonb`;
  await db`UPDATE fin_invoice_payment_requests SET base_amount_cents = amount_cents WHERE base_amount_cents = 0 AND amount_cents > 0`;
  await db`UPDATE fin_invoice_payment_requests SET collection_amount_cents = amount_cents WHERE collection_amount_cents = 0 AND amount_cents > 0`;
  await db`UPDATE fin_invoice_payment_requests SET expected_net_cents = amount_cents WHERE expected_net_cents = 0 AND amount_cents > 0`;
  await db`DROP INDEX IF EXISTS fin_invoice_payment_requests_active_invoice_mode_idx`;
  await db`DROP INDEX IF EXISTS fin_invoice_payment_requests_snapshot_mode_idx`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoice_payment_requests_invoice_idx ON fin_invoice_payment_requests (invoice_id, updated_at DESC) WHERE deleted_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoice_payment_requests_public_token_idx ON fin_invoice_payment_requests (public_token_hash) WHERE deleted_at IS NULL AND public_token_hash IS NOT NULL`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS fin_invoice_payment_requests_active_method_idx ON fin_invoice_payment_requests (invoice_id, stripe_mode, payment_method_family) WHERE deleted_at IS NULL AND status IN ('creating', 'active', 'processing', 'paid')`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS fin_invoice_payment_requests_snapshot_method_idx ON fin_invoice_payment_requests (invoice_id, invoice_snapshot_sha256, stripe_mode, payment_method_family) WHERE deleted_at IS NULL`;

  await db`CREATE TABLE IF NOT EXISTS fin_stripe_events (
    stripe_event_id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL DEFAULT 'wawco',
    stripe_mode TEXT NOT NULL DEFAULT 'test',
    event_type TEXT NOT NULL DEFAULT '',
    stripe_created_at TIMESTAMPTZ,
    payment_request_id TEXT REFERENCES fin_invoice_payment_requests(id),
    invoice_id TEXT REFERENCES fin_invoices(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'received',
    safe_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb
  )`;
  await db`ALTER TABLE fin_stripe_events ADD COLUMN IF NOT EXISTS entity_id TEXT NOT NULL DEFAULT 'wawco'`;
  await db`CREATE INDEX IF NOT EXISTS fin_stripe_events_invoice_idx ON fin_stripe_events (invoice_id, received_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS fin_stripe_events_payment_request_idx ON fin_stripe_events (payment_request_id, received_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS fin_stripe_events_entity_idx ON fin_stripe_events (entity_id, received_at DESC)`;

  await db`CREATE TABLE IF NOT EXISTS fin_invoice_payment_notifications (
    id TEXT PRIMARY KEY,
    payment_request_id TEXT NOT NULL REFERENCES fin_invoice_payment_requests(id),
    invoice_id TEXT NOT NULL REFERENCES fin_invoices(id),
    stripe_event_id TEXT REFERENCES fin_stripe_events(stripe_event_id),
    entity_id TEXT NOT NULL DEFAULT 'wawco' REFERENCES fin_entities(id),
    notification_type TEXT NOT NULL,
    recipient_email TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'sending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    gmail_message_id TEXT NOT NULL DEFAULT '',
    gmail_thread_id TEXT NOT NULL DEFAULT '',
    safe_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
  )`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS fin_invoice_payment_notifications_unique_idx ON fin_invoice_payment_notifications (payment_request_id, notification_type)`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoice_payment_notifications_invoice_idx ON fin_invoice_payment_notifications (invoice_id, updated_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoice_payment_notifications_status_idx ON fin_invoice_payment_notifications (status, updated_at DESC)`;

  await db`CREATE TABLE IF NOT EXISTS fin_recurring_invoice_templates (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL DEFAULT 'wawco' REFERENCES fin_entities(id),
    reporting_entity_id TEXT NOT NULL DEFAULT 'wawco' REFERENCES fin_entities(id),
    status TEXT NOT NULL DEFAULT 'active',
    label TEXT NOT NULL DEFAULT '',
    cadence TEXT NOT NULL DEFAULT 'weekly',
    interval_count INTEGER NOT NULL DEFAULT 1,
    day_of_week INTEGER NOT NULL DEFAULT 1,
    next_run_date DATE,
    due_days INTEGER NOT NULL DEFAULT 0,
    send_mode TEXT NOT NULL DEFAULT 'prepare_for_approval',
    payment_page_mode TEXT NOT NULL DEFAULT 'manual_after_approval',
    invoice_template_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    email_template_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    safe_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id TEXT NOT NULL REFERENCES fin_users(id),
    updated_by_user_id TEXT REFERENCES fin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`;
  await db`ALTER TABLE fin_recurring_invoice_templates ADD COLUMN IF NOT EXISTS entity_id TEXT NOT NULL DEFAULT 'wawco'`;
  await db`ALTER TABLE fin_recurring_invoice_templates ADD COLUMN IF NOT EXISTS reporting_entity_id TEXT NOT NULL DEFAULT 'wawco'`;
  await db`ALTER TABLE fin_recurring_invoice_templates ADD COLUMN IF NOT EXISTS payment_page_mode TEXT NOT NULL DEFAULT 'manual_after_approval'`;
  await db`ALTER TABLE fin_recurring_invoice_templates ADD COLUMN IF NOT EXISTS safe_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb`;
  await db`CREATE INDEX IF NOT EXISTS fin_recurring_invoice_templates_next_run_idx ON fin_recurring_invoice_templates (status, next_run_date) WHERE deleted_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS fin_recurring_invoice_templates_entity_idx ON fin_recurring_invoice_templates (entity_id, updated_at DESC) WHERE deleted_at IS NULL`;

  await db`CREATE TABLE IF NOT EXISTS fin_recurring_invoice_runs (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES fin_recurring_invoice_templates(id),
    run_date DATE NOT NULL,
    period_start DATE,
    period_end DATE,
    status TEXT NOT NULL DEFAULT 'creating',
    invoice_id TEXT REFERENCES fin_invoices(id),
    payment_request_id TEXT REFERENCES fin_invoice_payment_requests(id),
    send_mode TEXT NOT NULL DEFAULT 'prepare_for_approval',
    safe_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_error TEXT NOT NULL DEFAULT '',
    created_by_user_id TEXT NOT NULL REFERENCES fin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS fin_recurring_invoice_runs_template_date_idx ON fin_recurring_invoice_runs (template_id, run_date) WHERE deleted_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS fin_recurring_invoice_runs_template_idx ON fin_recurring_invoice_runs (template_id, updated_at DESC) WHERE deleted_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS fin_recurring_invoice_runs_invoice_idx ON fin_recurring_invoice_runs (invoice_id) WHERE deleted_at IS NULL`;

  await db`CREATE TABLE IF NOT EXISTS fin_profiles (
    id TEXT PRIMARY KEY,
    profile_type TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    data_json JSONB NOT NULL,
    created_by_user_id TEXT NOT NULL REFERENCES fin_users(id),
    shared BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`;
  await db`CREATE INDEX IF NOT EXISTS fin_profiles_type_label_idx ON fin_profiles (profile_type, lower(label)) WHERE deleted_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS fin_profiles_created_by_idx ON fin_profiles (created_by_user_id) WHERE deleted_at IS NULL`;

  await db`CREATE TABLE IF NOT EXISTS fin_finance_dashboard_imports (
    id TEXT PRIMARY KEY,
    schema_version TEXT NOT NULL,
    month TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL DEFAULT '',
    data_json JSONB NOT NULL,
    source_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    content_sha256 TEXT NOT NULL DEFAULT '',
    validator_version TEXT NOT NULL DEFAULT '',
    validation_audit_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    imported_by_user_id TEXT NOT NULL REFERENCES fin_users(id),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_by_user_id TEXT REFERENCES fin_users(id),
    delete_reason TEXT NOT NULL DEFAULT '',
    deleted_at TIMESTAMPTZ
  )`;
  await db`ALTER TABLE fin_finance_dashboard_imports ADD COLUMN IF NOT EXISTS stable_content_sha256 TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_finance_dashboard_imports ADD COLUMN IF NOT EXISTS imported_actor_type TEXT NOT NULL DEFAULT 'user'`;
  await db`ALTER TABLE fin_finance_dashboard_imports ADD COLUMN IF NOT EXISTS imported_actor_label TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_finance_dashboard_imports ADD COLUMN IF NOT EXISTS imported_key_id TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_finance_dashboard_imports ADD COLUMN IF NOT EXISTS imported_nonce TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_finance_dashboard_imports ADD COLUMN IF NOT EXISTS imported_body_sha256 TEXT NOT NULL DEFAULT ''`;
  await db`CREATE INDEX IF NOT EXISTS fin_finance_dashboard_imports_month_idx ON fin_finance_dashboard_imports (month, imported_at DESC) WHERE deleted_at IS NULL`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS fin_finance_dashboard_imports_system_stable_content_idx ON fin_finance_dashboard_imports (month, stable_content_sha256) WHERE deleted_at IS NULL AND imported_actor_type = 'system' AND stable_content_sha256 <> ''`;

  await db`CREATE TABLE IF NOT EXISTS fin_finance_system_import_nonces (
    key_id TEXT NOT NULL,
    nonce TEXT NOT NULL,
    body_sha256 TEXT NOT NULL DEFAULT '',
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (key_id, nonce)
  )`;
  await db`CREATE INDEX IF NOT EXISTS fin_finance_system_import_nonces_expires_idx ON fin_finance_system_import_nonces (expires_at)`;

  schemaReady = true;
}

function userIdentity(user) {
  const email = String(user.email || '').toLowerCase();
  if (!email) throw new Error('Session email is required.');
  const subject = user.sub ? String(user.sub) : email;
  return {
    id: crypto.createHash('sha256').update(`google:${subject}`).digest('hex').slice(0, 32),
    email,
    name: user.name || email,
    role: roleForUser(user),
    googleSubject: user.sub ? String(user.sub) : null,
    picture: user.picture || '',
  };
}

async function ensureUser(user) {
  await ensureSchema();
  const db = sql();
  const identity = userIdentity(user);
  const rows = await db`
    INSERT INTO fin_users (id, email, name, role, active, google_subject, picture, created_at, updated_at, last_login_at)
    VALUES (${identity.id}, ${identity.email}, ${identity.name}, ${identity.role}, TRUE, ${identity.googleSubject}, ${identity.picture}, now(), now(), now())
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      active = TRUE,
      google_subject = EXCLUDED.google_subject,
      picture = EXCLUDED.picture,
      updated_at = now(),
      last_login_at = now()
    RETURNING id, email, name, role, active
  `;
  return rows[0];
}

function dateKeyForInvoiceDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const now = new Date();
    return `${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCFullYear()).slice(-2)}`;
  }
  const [, year, month, day] = match;
  return `${month}${day}${year.slice(-2)}`;
}

function clientInvoiceCode(invoice = {}) {
  const explicit = cleanSingleLine(invoice.client?.invoiceCode, 40).toUpperCase();
  if (explicit) return explicit.replace(/[^A-Z0-9]+/g, '').slice(0, 24) || 'CLIENT';
  const source = cleanSingleLine(invoice.client?.company || invoice.client?.name || invoice.client?.email || 'CLIENT', 120).toUpperCase();
  const code = source.replace(/[^A-Z0-9]+/g, '').slice(0, 24);
  return code || 'CLIENT';
}

function numberingExample(padding) {
  return {
    wawco: `SUBSTRATE-052626-${String(1).padStart(padding, '0')}`,
    ndg: `NDG-SUBSTRATE-052626-${String(1).padStart(padding, '0')}`,
  };
}

async function numberingSettings() {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    INSERT INTO fin_invoice_numbering_settings (id, sequence_padding, updated_at)
    VALUES ('default', 2, now())
    ON CONFLICT (id) DO UPDATE SET id = fin_invoice_numbering_settings.id
    RETURNING sequence_padding
  `;
  const padding = Math.max(1, Math.min(8, Number(rows[0]?.sequence_padding || 2)));
  const examples = numberingExample(padding);
  return {
    mode: 'client-date-daily',
    clientSource: 'client.invoiceCode, then client company/name',
    dateFormat: 'MMDDYY',
    sequenceScope: 'entity-date',
    sequencePadding: padding,
    example: examples.wawco,
    examples,
  };
}

async function updateNumberingSettings(input = {}) {
  await ensureSchema();
  const db = sql();
  const requestedPadding = Number(input.sequencePadding ?? input.padding ?? 2);
  const sequencePadding = Math.max(1, Math.min(8, Number.isFinite(requestedPadding) ? requestedPadding : 2));
  const rows = await db`
    INSERT INTO fin_invoice_numbering_settings (id, sequence_padding, updated_at)
    VALUES ('default', ${sequencePadding}, now())
    ON CONFLICT (id) DO UPDATE SET
      sequence_padding = EXCLUDED.sequence_padding,
      updated_at = now()
    RETURNING sequence_padding
  `;
  const padding = Math.max(1, Math.min(8, Number(rows[0]?.sequence_padding || sequencePadding)));
  const examples = numberingExample(padding);
  return {
    mode: 'client-date-daily',
    clientSource: 'client.invoiceCode, then client company/name',
    dateFormat: 'MMDDYY',
    sequenceScope: 'entity-date',
    sequencePadding: padding,
    example: examples.wawco,
    examples,
  };
}

async function nextInvoiceNumber(invoice = {}) {
  await ensureSchema();
  const db = sql();
  const settings = await numberingSettings();
  const entityId = cleanEntityId(invoice.entityId || invoice.entity_id || 'wawco');
  const dateKey = dateKeyForInvoiceDate(invoice.invoiceDate);
  const clientCode = clientInvoiceCode(invoice);
  const entityPrefix = invoiceNumberPrefixForEntity(entityId);
  const prefixPart = entityPrefix ? `${entityPrefix}-` : '';
  const padding = Number(settings.sequencePadding || 2);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const datePattern = entityPrefix
      ? `^${entityPrefix}-[A-Z0-9]+-${dateKey}-(\\d+)$`
      : `^[A-Z0-9]+-${dateKey}-(\\d+)$`;
    const dateLike = entityPrefix ? `${entityPrefix}-%-${dateKey}-%` : `%-${dateKey}-%`;
    const rows = await db`
      WITH existing AS (
        SELECT COALESCE(MAX((substring(invoice_number FROM ${datePattern}))::int), 0) AS max_sequence
        FROM fin_invoices
        WHERE entity_id = ${entityId} AND invoice_number LIKE ${dateLike}
      ), allocated AS (
        INSERT INTO fin_invoice_daily_sequences (entity_id, date_key, next_number, updated_at)
        SELECT ${entityId}, ${dateKey}, existing.max_sequence + 2, now()
        FROM existing
        ON CONFLICT (entity_id, date_key) DO UPDATE SET
          next_number = GREATEST(fin_invoice_daily_sequences.next_number, (SELECT max_sequence + 1 FROM existing)) + 1,
          updated_at = now()
        RETURNING next_number - 1 AS sequence
      )
      SELECT sequence FROM allocated
    `;
    const sequence = Number(rows[0]?.sequence || 1);
    const suffix = String(sequence).padStart(padding, '0');
    const candidate = `${prefixPart}${clientCode}-${dateKey}-${suffix}`;
    const collision = await db`SELECT id FROM fin_invoices WHERE invoice_number = ${candidate} LIMIT 1`;
    if (!collision[0]) return candidate;
  }

  throw makeError(409, 'Could not allocate a unique invoice number for that date.');
}

async function listEntities(user) {
  const currentUser = await ensureUser(user);
  await ensureSchema();
  const db = sql();
  const visibleEntityIds = userVisibleEntityIds(currentUser);
  const rows = await db`
    SELECT id, key, label, name, legal_name, email, invoice_code_prefix, reporting_scope, stripe_account_key, branding_json, updated_at::text AS updated_at
    FROM fin_entities
    WHERE active = TRUE
    ORDER BY CASE WHEN id = 'wawco' THEN 0 WHEN id = 'ndg' THEN 1 ELSE 2 END, label
  `;
  return rows.filter((row) => visibleEntityIds.includes(cleanEntityId(row.id))).map((row) => ({
    id: cleanEntityId(row.id),
    key: row.key || row.id,
    label: row.label || publicEntity(row.id).label,
    name: row.name || publicEntity(row.id).name,
    legalName: row.legal_name || row.name || publicEntity(row.id).legalName,
    email: row.email || '',
    invoiceCodePrefix: row.invoice_code_prefix || '',
    reportingScope: row.reporting_scope || row.id,
    stripeAccountKey: row.stripe_account_key || stripeAccountKeyForEntity(row.id),
    branding: row.branding_json || {},
    updatedAt: row.updated_at || '',
  }));
}

async function invoiceEntityIdForUser(user, invoiceId) {
  const currentUser = await ensureUser(user);
  const db = sql();
  const rows = currentUser.role === 'admin'
    ? await db`SELECT id, entity_id, reporting_entity_id, data_json FROM fin_invoices WHERE id = ${invoiceId} AND deleted_at IS NULL LIMIT 1`
    : await db`SELECT id, entity_id, reporting_entity_id, data_json FROM fin_invoices WHERE id = ${invoiceId} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL LIMIT 1`;
  if (!rows[0] || !userCanAccessInvoiceRow(currentUser, rows[0])) return '';
  return cleanEntityId(rows[0].entity_id || 'wawco');
}

async function listInvoices(user, options = {}) {
  const currentUser = await ensureUser(user);
  const view = cleanInvoiceListView(options.view || options.status || 'active');
  if (view === 'all' && !userCanSeeAllInvoiceViews(currentUser)) throw makeError(403, 'All invoice view is restricted.');
  const requestedEntity = cleanSingleLine(options.entity || options.entityId || '', 40).toLowerCase();
  const entityFilter = requestedEntity && requestedEntity !== 'combined' ? cleanEntityId(requestedEntity) : requestedEntity;
  if (entityFilter && entityFilter !== 'combined' && !userCanAccessEntity(currentUser, entityFilter)) throw makeError(403, 'Invoice entity is not available to this user.');
  const db = sql();
  const rows = currentUser.role === 'admin'
    ? await db`
      SELECT inv.id, inv.entity_id, inv.reporting_entity_id, inv.visibility_state, inv.visibility_reason,
        inv.is_test, inv.test_reason, inv.dashboard_excluded, inv.invoice_number, inv.status, inv.client_label,
        inv.invoice_date::text AS invoice_date, inv.due_date::text AS due_date,
        inv.total_cents, inv.payment_status, inv.paid_at::text AS paid_at, inv.payment_updated_at::text AS payment_updated_at,
        inv.updated_at::text AS updated_at, usr.email AS created_by_email, inv.data_json,
        pay.status AS payment_request_status
      FROM fin_invoices inv
      JOIN fin_users usr ON usr.id = inv.created_by_user_id
      LEFT JOIN LATERAL (
        SELECT status
        FROM fin_invoice_payment_requests pr
        WHERE pr.invoice_id = inv.id AND pr.deleted_at IS NULL
        ORDER BY pr.updated_at DESC
        LIMIT 1
      ) pay ON true
      WHERE inv.deleted_at IS NULL
      ORDER BY inv.updated_at DESC
      LIMIT 500
    `
    : await db`
      SELECT inv.id, inv.entity_id, inv.reporting_entity_id, inv.visibility_state, inv.visibility_reason,
        inv.is_test, inv.test_reason, inv.dashboard_excluded, inv.invoice_number, inv.status, inv.client_label,
        inv.invoice_date::text AS invoice_date, inv.due_date::text AS due_date,
        inv.total_cents, inv.payment_status, inv.paid_at::text AS paid_at, inv.payment_updated_at::text AS payment_updated_at,
        inv.updated_at::text AS updated_at, usr.email AS created_by_email, inv.data_json,
        pay.status AS payment_request_status
      FROM fin_invoices inv
      JOIN fin_users usr ON usr.id = inv.created_by_user_id
      LEFT JOIN LATERAL (
        SELECT status
        FROM fin_invoice_payment_requests pr
        WHERE pr.invoice_id = inv.id AND pr.deleted_at IS NULL
        ORDER BY pr.updated_at DESC
        LIMIT 1
      ) pay ON true
      WHERE inv.deleted_at IS NULL AND inv.created_by_user_id = ${currentUser.id}
      ORDER BY inv.updated_at DESC
      LIMIT 500
    `;
  return rows
    .filter((row) => userCanAccessInvoiceRow(currentUser, row))
    .filter((row) => !entityFilter || entityFilter === 'combined' || rowReportingEntityId(row) === entityFilter)
    .filter((row) => invoiceMatchesListView(row, view))
    .slice(0, 100)
    .map(invoiceListItem);
}

async function createInvoice(user, input = {}) {
  const currentUser = await ensureUser(user);
  const db = sql();
  const id = crypto.randomUUID();
  const invoiceDraft = normalizeInvoice({ ...input, id, invoiceNumber: '' }, { id, invoiceNumber: '' });
  if (currentUser.role !== 'admin' && ['approved', 'issued', 'paid', 'void'].includes(invoiceDraft.status)) {
    throw makeError(403, 'Only Fin admins can create approved, issued, paid, or void invoices.');
  }
  const draftFields = canonicalInvoiceFields(invoiceDraft);
  enforceEntityAccess(currentUser, draftFields.entityId, 'Invoice issuing entity is not available to this user.');
  enforceEntityAccess(currentUser, draftFields.reportingEntityId, 'Invoice reporting entity is not available to this user.');
  const invoiceNumber = await nextInvoiceNumber(invoiceDraft);
  const invoice = normalizeInvoice({ ...invoiceDraft, invoiceNumber }, { id, invoiceNumber, entityId: invoiceDraft.entityId });
  const fields = canonicalInvoiceFields(invoice);
  const entityId = fields.entityId;
  const label = invoiceClientLabel(invoice);
  const invoiceDate = nullableDate(invoice.invoiceDate);
  const dueDate = nullableDate(invoice.dueDate);
  const data = JSON.stringify(invoice);
  const startsApproved = ['approved', 'issued', 'paid'].includes(invoice.status);
  const startsIssued = ['issued', 'paid'].includes(invoice.status);
  const startsPaid = invoice.status === 'paid';
  const rows = await db`
    INSERT INTO fin_invoices (
      id, entity_id, reporting_entity_id, visibility_state, visibility_reason, visibility_updated_at, visibility_updated_by_user_id,
      is_test, test_reason, dashboard_excluded, invoice_number, status, client_label, invoice_date, due_date, currency, project, created_by_user_id,
      approved_by_user_id, approved_at, issued_at, paid_at,
      subtotal_cents, discount_cents, taxable_cents, tax_cents, shipping_cents, total_cents, data_json, created_at, updated_at
    ) VALUES (
      ${id}, ${entityId}, ${fields.reportingEntityId}, ${fields.visibilityState}, ${fields.visibilityReason}, NULL, NULL,
      ${fields.isTest}, ${fields.testReason}, ${fields.dashboardExcluded}, ${invoice.invoiceNumber}, ${invoice.status}, ${label}, ${invoiceDate}, ${dueDate}, ${invoice.currency}, ${invoice.project}, ${currentUser.id},
      ${startsApproved ? currentUser.id : null}, ${startsApproved ? new Date().toISOString() : null}, ${startsIssued ? new Date().toISOString() : null}, ${startsPaid ? new Date().toISOString() : null},
      ${invoice.totals.subtotalCents}, ${invoice.totals.discountCents}, ${invoice.totals.taxableCents}, ${invoice.totals.taxCents}, ${invoice.totals.shippingCents}, ${invoice.totals.totalCents}, ${data}::jsonb, now(), now()
    )
    RETURNING id, entity_id, reporting_entity_id, visibility_state, visibility_reason, visibility_updated_at::text AS visibility_updated_at, visibility_updated_by_user_id,
      is_test, test_reason, dashboard_excluded, status, payment_status, current_payment_request_id, paid_at::text AS paid_at, payment_updated_at::text AS payment_updated_at, data_json
  `;
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${id}, ${currentUser.id}, 'created', 'Invoice draft created', '{}'::jsonb)`;
  return invoiceFromRow(rows[0]);
}

async function getInvoice(user, id) {
  const currentUser = await ensureUser(user);
  const db = sql();
  const rows = currentUser.role === 'admin'
    ? await db`
      SELECT id, entity_id, reporting_entity_id, visibility_state, visibility_reason, visibility_updated_at::text AS visibility_updated_at,
        visibility_updated_by_user_id, is_test, test_reason, dashboard_excluded, status, payment_status,
        current_payment_request_id, paid_at::text AS paid_at, payment_updated_at::text AS payment_updated_at, data_json
      FROM fin_invoices
      WHERE id = ${id} AND deleted_at IS NULL
      LIMIT 1
    `
    : await db`
      SELECT id, entity_id, reporting_entity_id, visibility_state, visibility_reason, visibility_updated_at::text AS visibility_updated_at,
        visibility_updated_by_user_id, is_test, test_reason, dashboard_excluded, status, payment_status,
        current_payment_request_id, paid_at::text AS paid_at, payment_updated_at::text AS payment_updated_at, data_json
      FROM fin_invoices
      WHERE id = ${id} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL
      LIMIT 1
    `;
  if (!rows[0] || !userCanAccessInvoiceRow(currentUser, rows[0])) return null;
  return invoiceFromRow(rows[0]);
}

async function updateInvoice(user, id, input = {}) {
  const currentUser = await ensureUser(user);
  const existing = await getInvoice(user, id);
  if (!existing) return null;
  const requestedStatus = cleanSingleLine(input.status ?? existing.status, 40);
  const adminOnlyStatuses = new Set(['approved', 'issued', 'paid', 'void']);
  if (currentUser.role !== 'admin' && (adminOnlyStatuses.has(requestedStatus) || adminOnlyStatuses.has(existing.status))) {
    throw makeError(403, 'Only Fin admins can approve, issue, mark paid, void, or edit approved invoices.');
  }
  const requestedEntityId = cleanEntityId(input.entityId || input.entity_id || existing.entityId || 'wawco');
  const existingEntityId = cleanEntityId(existing.entityId || 'wawco');
  if (requestedEntityId !== existingEntityId) throw makeError(409, 'Invoice entity cannot be changed after the invoice number is assigned. Duplicate the draft under the other entity instead.');
  const invoice = normalizeInvoice({ ...existing, ...input, id, invoiceNumber: existing.invoiceNumber, entityId: existingEntityId }, { id, invoiceNumber: existing.invoiceNumber, entityId: existingEntityId });
  const fields = canonicalInvoiceFields(invoice, existingEntityId);
  const entityId = fields.entityId;
  enforceEntityAccess(currentUser, entityId, 'Invoice issuing entity is not available to this user.');
  enforceEntityAccess(currentUser, fields.reportingEntityId, 'Invoice reporting entity is not available to this user.');
  const label = invoiceClientLabel(invoice);
  const invoiceDate = nullableDate(invoice.invoiceDate);
  const dueDate = nullableDate(invoice.dueDate);
  const data = JSON.stringify(invoice);
  const visibilityChanged = fields.visibilityState !== cleanVisibilityState(existing.visibilityState) || fields.visibilityReason !== cleanSingleLine(existing.visibilityReason, 240);
  const db = sql();
  const activePaymentRows = await db`
    SELECT invoice_snapshot_sha256, status
    FROM fin_invoice_payment_requests
    WHERE invoice_id = ${id} AND deleted_at IS NULL AND status IN ('creating', 'active', 'processing', 'paid')
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (activePaymentRows[0] && activePaymentRows[0].invoice_snapshot_sha256 !== paymentSnapshotHash(invoice)) {
    throw makeError(409, 'This invoice has an active Stripe payment link. Expire or supersede the link before changing payment terms, line items, totals, client, dates, or currency.');
  }
  if (activePaymentRows[0]) {
    const linkedAllowedStatuses = new Set(['approved', 'issued', 'paid']);
    if (!linkedAllowedStatuses.has(invoice.status)) throw makeError(409, 'This invoice has an active Stripe payment link. Keep it approved, issued, or paid until the link is expired or superseded.');
    if (existing.status === 'paid' && invoice.status !== 'paid') throw makeError(409, 'Paid invoices cannot be moved back while a Stripe payment record is attached.');
  }
  const rows = currentUser.role === 'admin'
    ? await db`
      UPDATE fin_invoices SET
        entity_id = ${entityId}, reporting_entity_id = ${fields.reportingEntityId}, visibility_state = ${fields.visibilityState}, visibility_reason = ${fields.visibilityReason},
        visibility_updated_at = CASE WHEN ${visibilityChanged} THEN now() ELSE visibility_updated_at END,
        visibility_updated_by_user_id = CASE WHEN ${visibilityChanged} THEN ${currentUser.id} ELSE visibility_updated_by_user_id END,
        is_test = ${fields.isTest}, test_reason = ${fields.testReason}, dashboard_excluded = ${fields.dashboardExcluded},
        status = ${invoice.status}, client_label = ${label}, invoice_date = ${invoiceDate}, due_date = ${dueDate}, currency = ${invoice.currency}, project = ${invoice.project},
        approved_by_user_id = CASE WHEN ${invoice.status} = 'approved' THEN ${currentUser.id} ELSE approved_by_user_id END,
        approved_at = CASE WHEN ${invoice.status} = 'approved' AND approved_at IS NULL THEN now() ELSE approved_at END,
        issued_at = CASE WHEN ${invoice.status} = 'issued' AND issued_at IS NULL THEN now() ELSE issued_at END,
        paid_at = CASE WHEN ${invoice.status} = 'paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
        subtotal_cents = ${invoice.totals.subtotalCents}, discount_cents = ${invoice.totals.discountCents}, taxable_cents = ${invoice.totals.taxableCents}, tax_cents = ${invoice.totals.taxCents}, shipping_cents = ${invoice.totals.shippingCents}, total_cents = ${invoice.totals.totalCents},
        data_json = ${data}::jsonb, updated_at = now()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id, entity_id, reporting_entity_id, visibility_state, visibility_reason, visibility_updated_at::text AS visibility_updated_at, visibility_updated_by_user_id,
        is_test, test_reason, dashboard_excluded, status, payment_status, current_payment_request_id, paid_at::text AS paid_at, payment_updated_at::text AS payment_updated_at, data_json
    `
    : await db`
      UPDATE fin_invoices SET
        entity_id = ${entityId}, reporting_entity_id = ${fields.reportingEntityId}, visibility_state = ${fields.visibilityState}, visibility_reason = ${fields.visibilityReason},
        visibility_updated_at = CASE WHEN ${visibilityChanged} THEN now() ELSE visibility_updated_at END,
        visibility_updated_by_user_id = CASE WHEN ${visibilityChanged} THEN ${currentUser.id} ELSE visibility_updated_by_user_id END,
        is_test = ${fields.isTest}, test_reason = ${fields.testReason}, dashboard_excluded = ${fields.dashboardExcluded},
        status = ${invoice.status}, client_label = ${label}, invoice_date = ${invoiceDate}, due_date = ${dueDate}, currency = ${invoice.currency}, project = ${invoice.project},
        paid_at = CASE WHEN ${invoice.status} = 'paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
        subtotal_cents = ${invoice.totals.subtotalCents}, discount_cents = ${invoice.totals.discountCents}, taxable_cents = ${invoice.totals.taxableCents}, tax_cents = ${invoice.totals.taxCents}, shipping_cents = ${invoice.totals.shippingCents}, total_cents = ${invoice.totals.totalCents},
        data_json = ${data}::jsonb, updated_at = now()
      WHERE id = ${id} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL
      RETURNING id, entity_id, reporting_entity_id, visibility_state, visibility_reason, visibility_updated_at::text AS visibility_updated_at, visibility_updated_by_user_id,
        is_test, test_reason, dashboard_excluded, status, payment_status, current_payment_request_id, paid_at::text AS paid_at, payment_updated_at::text AS payment_updated_at, data_json
    `;
  if (!rows[0]) return null;
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${id}, ${currentUser.id}, 'updated', 'Invoice draft updated', '{}'::jsonb)`;
  return invoiceFromRow(rows[0]);
}

async function deleteInvoice(user, id) {
  const currentUser = await ensureUser(user);
  const db = sql();
  const accessRows = currentUser.role === 'admin'
    ? await db`SELECT id, entity_id, reporting_entity_id, data_json FROM fin_invoices WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`
    : await db`SELECT id, entity_id, reporting_entity_id, data_json FROM fin_invoices WHERE id = ${id} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL LIMIT 1`;
  if (!accessRows[0] || !userCanAccessInvoiceRow(currentUser, accessRows[0])) return false;
  const rows = currentUser.role === 'admin'
    ? await db`
      UPDATE fin_invoices SET deleted_at = now(), updated_at = now()
      WHERE id = ${id}
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM fin_invoice_payment_requests
          WHERE invoice_id = ${id}
            AND deleted_at IS NULL
            AND status IN ('creating', 'active', 'processing', 'paid')
        )
      RETURNING id
    `
    : await db`
      UPDATE fin_invoices SET deleted_at = now(), updated_at = now()
      WHERE id = ${id}
        AND created_by_user_id = ${currentUser.id}
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM fin_invoice_payment_requests
          WHERE invoice_id = ${id}
            AND deleted_at IS NULL
            AND status IN ('creating', 'active', 'processing', 'paid')
        )
      RETURNING id
    `;
  if (!rows[0]) {
    const visibleRows = currentUser.role === 'admin'
      ? await db`SELECT id FROM fin_invoices WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`
      : await db`SELECT id FROM fin_invoices WHERE id = ${id} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL LIMIT 1`;
    if (!visibleRows[0]) return false;
    const activePaymentRows = await db`
      SELECT id, status FROM fin_invoice_payment_requests
      WHERE invoice_id = ${id}
        AND deleted_at IS NULL
        AND status IN ('creating', 'active', 'processing', 'paid')
      LIMIT 1
    `;
    if (activePaymentRows[0]) throw makeError(409, 'This invoice has an active Stripe payment link. Expire, cancel, or supersede the link before deleting the invoice.');
    return false;
  }
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${id}, ${currentUser.id}, 'deleted', 'Invoice draft deleted', '{}'::jsonb)`;
  return true;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
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
      name: cleanSingleLine(invoice.client?.name, 240),
      company: cleanSingleLine(invoice.client?.company, 240),
      email: cleanSingleLine(invoice.client?.email, 240),
      address: cleanText(invoice.client?.address, 1000),
    },
    from: {
      name: cleanSingleLine(invoice.from?.name, 240),
      company: cleanSingleLine(invoice.from?.company, 240),
      email: cleanSingleLine(invoice.from?.email, 240),
      address: cleanText(invoice.from?.address, 1000),
    },
    project: cleanSingleLine(invoice.project, 240),
    salesRep: cleanSingleLine(invoice.salesRep, 240),
    salesRepEmail: cleanSingleLine(invoice.salesRepEmail, 240),
    salesRole: cleanSingleLine(invoice.salesRole, 240),
    notes: cleanText(invoice.notes, 2000),
    terms: cleanText(invoice.terms, 2000),
    paymentInstructions: cleanText(invoice.paymentInstructions, 2000),
    items: (invoice.items || []).map((item) => ({
      description: cleanText(item.description, 600).trim(),
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

function cleanStripeMode(value) {
  const mode = cleanSingleLine(value, 20).toLowerCase();
  if (mode !== 'test' && mode !== 'live') throw makeError(400, 'Stripe mode must be test or live.');
  return mode;
}

function paymentTokenHash(token) {
  const text = cleanSingleLine(token, 240);
  if (text.length < 24) throw makeError(404, 'Payment page not found.');
  return crypto.createHash('sha256').update(text).digest('hex');
}

function generatePaymentToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function joinPaymentUrl(baseUrl, token) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  return `${base}/pay?t=${encodeURIComponent(token)}`;
}

function methodLabel(method) {
  if (method === 'bank_account') return 'bank account';
  if (method === 'card') return 'card';
  if (method === 'customer_choice') return 'customer payment page';
  if (method === 'legacy') return 'legacy Checkout';
  return formatUnknownMethod(method);
}

function formatUnknownMethod(value) {
  return cleanSingleLine(value, 80).replace(/[_-]/g, ' ') || 'payment';
}

function activePaymentStatuses() {
  return ['creating', 'active', 'processing', 'paid'];
}

function paymentRequestSelectFields(prefix = '') {
  const p = prefix ? `${prefix}.` : '';
  return `id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_customer_id,
      payment_method_family, payment_method_type, fee_policy, base_amount_cents, client_processing_cost_cents,
      collection_amount_cents, expected_stripe_fee_cents, expected_net_cents, expected_fee_formula_json,
      fee_disclosure_text, public_token_hash, public_token_hint, public_url, stripe_balance_transaction_id,
      actual_stripe_fee_cents, actual_net_cents, reconciliation_status, payment_method_details_json,
      expires_at::text AS expires_at, paid_at::text AS paid_at, reconciled_at::text AS reconciled_at, updated_at::text AS updated_at`;
}

function paymentRequestSummary(row) {
  if (!row) return null;
  const methodFamily = row.payment_method_family || row.paymentMethodFamily || 'legacy';
  const collectionAmountCents = Number(row.collection_amount_cents ?? row.collectionAmountCents ?? row.amount_cents ?? row.amountCents ?? 0);
  const baseAmountCents = Number(row.base_amount_cents ?? row.baseAmountCents ?? row.amount_cents ?? row.amountCents ?? 0);
  const publicUrl = row.public_url || row.publicUrl || '';
  return {
    id: row.id,
    invoiceId: row.invoice_id || row.invoiceId || '',
    entityId: cleanEntityId(row.entity_id || row.entityId || row.metadata_json?.fin_entity_id || row.metadata?.fin_entity_id || 'wawco'),
    stripeAccountKey: stripeAccountKeyForEntity(row.entity_id || row.entityId || row.metadata_json?.fin_entity_id || row.metadata?.fin_entity_id || 'wawco'),
    invoiceNumber: row.invoice_number || row.invoiceNumber || '',
    snapshotSha256: row.invoice_snapshot_sha256 || row.snapshotSha256 || '',
    mode: row.stripe_mode || row.mode || 'test',
    status: row.status || 'none',
    amountCents: Number(row.amount_cents ?? row.amountCents ?? collectionAmountCents),
    currency: row.currency || 'USD',
    url: row.payment_url || row.url || '',
    urlKind: row.payment_url_kind || row.urlKind || 'checkout_session',
    publicUrl,
    tokenHint: row.public_token_hint || row.tokenHint || '',
    checkoutSessionId: row.stripe_checkout_session_id || row.checkoutSessionId || '',
    paymentIntentId: row.stripe_payment_intent_id || row.paymentIntentId || '',
    chargeId: row.stripe_charge_id || row.chargeId || '',
    customerId: row.stripe_customer_id || row.customerId || '',
    paymentMethodFamily: methodFamily,
    paymentMethodType: row.payment_method_type || row.paymentMethodType || '',
    feePolicy: row.fee_policy || row.feePolicy || '',
    baseAmountCents,
    clientProcessingCostCents: Number(row.client_processing_cost_cents ?? row.clientProcessingCostCents ?? 0),
    collectionAmountCents,
    expectedStripeFeeCents: Number(row.expected_stripe_fee_cents ?? row.expectedStripeFeeCents ?? 0),
    expectedNetCents: Number(row.expected_net_cents ?? row.expectedNetCents ?? 0),
    expectedFeeFormula: row.expected_fee_formula_json || row.expectedFeeFormula || {},
    feeDisclosureText: row.fee_disclosure_text || row.feeDisclosureText || '',
    balanceTransactionId: row.stripe_balance_transaction_id || row.balanceTransactionId || '',
    actualStripeFeeCents: row.actual_stripe_fee_cents ?? row.actualStripeFeeCents ?? null,
    actualNetCents: row.actual_net_cents ?? row.actualNetCents ?? null,
    reconciliationStatus: row.reconciliation_status || row.reconciliationStatus || 'not_started',
    paymentMethodDetails: row.payment_method_details_json || row.paymentMethodDetails || {},
    expiresAt: row.expires_at || row.expiresAt || '',
    paidAt: row.paid_at || row.paidAt || '',
    reconciledAt: row.reconciled_at || row.reconciledAt || '',
    updatedAt: row.updated_at || row.updatedAt || '',
    active: activePaymentStatuses().includes(row.status || ''),
  };
}

async function latestPaymentRequestForInvoice(user, invoiceId) {
  const currentUser = await ensureUser(user);
  const db = sql();
  const invoiceRows = currentUser.role === 'admin'
    ? await db`SELECT id, entity_id, reporting_entity_id, data_json FROM fin_invoices WHERE id = ${invoiceId} AND deleted_at IS NULL LIMIT 1`
    : await db`SELECT id, entity_id, reporting_entity_id, data_json FROM fin_invoices WHERE id = ${invoiceId} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL LIMIT 1`;
  if (!invoiceRows[0] || !userCanAccessInvoiceRow(currentUser, invoiceRows[0])) return null;
  const rows = await db`
    SELECT id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_customer_id,
      payment_method_family, payment_method_type, fee_policy, base_amount_cents, client_processing_cost_cents,
      collection_amount_cents, expected_stripe_fee_cents, expected_net_cents, expected_fee_formula_json,
      fee_disclosure_text, public_token_hint, public_url, stripe_balance_transaction_id,
      actual_stripe_fee_cents, actual_net_cents, reconciliation_status, payment_method_details_json,
      expires_at::text AS expires_at, paid_at::text AS paid_at, reconciled_at::text AS reconciled_at, updated_at::text AS updated_at
    FROM fin_invoice_payment_requests
    WHERE invoice_id = ${invoiceId} AND deleted_at IS NULL
    ORDER BY CASE WHEN payment_method_family = 'customer_choice' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `;
  return paymentRequestSummary(rows[0]);
}

async function loadApprovedInvoiceForPayment(invoiceId) {
  const db = sql();
  const invoiceRows = await db`
    SELECT id, entity_id, reporting_entity_id, invoice_number, status, currency, total_cents, approved_by_user_id, data_json
    FROM fin_invoices
    WHERE id = ${invoiceId} AND deleted_at IS NULL
    LIMIT 1
  `;
  const row = invoiceRows[0];
  if (!row) throw makeError(404, 'Invoice draft not found.');
  const invoice = invoiceFromRow(row);
  if (!invoice) throw makeError(500, 'Invoice data is unavailable.');
  if (invoice.status !== 'approved' || row.status !== 'approved' || !row.approved_by_user_id) throw makeError(409, 'Approve the invoice before creating a payment link.');
  const amountCents = Number(row.total_cents || invoice.totals?.totalCents || 0);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw makeError(409, 'Invoice total must be greater than zero before creating a payment link.');
  return { row, invoice, amountCents, snapshotSha256: paymentSnapshotHash(invoice) };
}

function paymentRowSelectFragment() {
  return null;
}

async function createInvoicePaymentRequest(user, invoiceId, modeInput = 'test') {
  const currentUser = await ensureUser(user);
  if (currentUser.role !== 'admin') throw makeError(403, 'Only Fin admins can create Stripe payment links.');
  const mode = cleanStripeMode(modeInput);
  const db = sql();
  const invoiceRows = await db`
    SELECT id, entity_id, reporting_entity_id, invoice_number, status, currency, total_cents, approved_by_user_id, data_json
    FROM fin_invoices
    WHERE id = ${invoiceId} AND deleted_at IS NULL
    LIMIT 1
  `;
  const row = invoiceRows[0];
  if (!row || !userCanAccessInvoiceRow(currentUser, row)) throw makeError(404, 'Invoice draft not found.');
  const invoice = invoiceFromRow(row);
  if (!invoice) throw makeError(500, 'Invoice data is unavailable.');
  if (invoice.status !== 'approved' || row.status !== 'approved' || !row.approved_by_user_id) throw makeError(409, 'Approve the invoice before creating a Stripe payment link.');
  assertInvoiceAllowsStripePaymentPage(invoice);
  const amountCents = Number(row.total_cents || invoice.totals?.totalCents || 0);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw makeError(409, 'Invoice total must be greater than zero before creating a payment link.');
  const snapshotSha256 = paymentSnapshotHash(invoice);

  await db`
    UPDATE fin_invoice_payment_requests
    SET status = 'failed', updated_at = now()
    WHERE invoice_id = ${invoiceId} AND stripe_mode = ${mode} AND deleted_at IS NULL AND status = 'creating' AND updated_at < now() - interval '15 minutes'
  `;

  const activeRows = await db`
    SELECT id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id,
      idempotency_key, metadata_json,
      expires_at::text AS expires_at, paid_at::text AS paid_at, updated_at::text AS updated_at
    FROM fin_invoice_payment_requests
    WHERE invoice_id = ${invoiceId} AND stripe_mode = ${mode} AND deleted_at IS NULL AND status IN ('creating', 'active', 'processing', 'paid')
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (activeRows[0]) {
    const active = {
      ...paymentRequestSummary(activeRows[0]),
      idempotencyKey: activeRows[0].idempotency_key,
      metadata: activeRows[0].metadata_json || {},
    };
    if (active.snapshotSha256 === snapshotSha256) {
      if (active.status === 'paid') throw makeError(409, 'This invoice is already paid.');
      return { invoice, paymentRequest: active, reused: true };
    }
    throw makeError(409, 'This invoice already has an active payment link for a different snapshot. Supersede or expire it before creating another link.');
  }

  const existingRows = await db`
    SELECT id, status
    FROM fin_invoice_payment_requests
    WHERE invoice_id = ${invoiceId} AND invoice_snapshot_sha256 = ${snapshotSha256} AND stripe_mode = ${mode} AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (existingRows[0]) {
    if (!['failed', 'expired', 'canceled'].includes(existingRows[0].status)) throw makeError(409, 'This invoice already has a terminal Stripe payment record for this snapshot.');
    const resetRows = await db`
      UPDATE fin_invoice_payment_requests SET
        status = 'creating',
        payment_url = '',
        stripe_checkout_session_id = NULL,
        stripe_payment_intent_id = NULL,
        stripe_customer_id = '',
        expires_at = NULL,
        paid_at = NULL,
        updated_at = now()
      WHERE id = ${existingRows[0].id} AND deleted_at IS NULL AND status IN ('failed', 'expired', 'canceled')
      RETURNING id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
        payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id,
        idempotency_key, metadata_json,
        expires_at::text AS expires_at, paid_at::text AS paid_at, updated_at::text AS updated_at
    `;
    const reset = resetRows[0];
    if (!reset) throw makeError(409, 'Stripe payment request could not be reset for retry.');
    return {
      invoice,
      paymentRequest: {
        ...paymentRequestSummary(reset),
        idempotencyKey: reset.idempotency_key,
        metadata: reset.metadata_json || {},
      },
      reused: false,
    };
  }

  const id = crypto.randomUUID();
  const idempotencyKey = `fin-checkout-${mode}-${invoiceId}-${snapshotSha256}`;
  const entityId = cleanEntityId(invoice.entityId || row.entity_id || 'wawco');
  const metadata = {
    fin_invoice_id: invoiceId,
    fin_payment_request_id: id,
    fin_invoice_number: row.invoice_number,
    fin_invoice_snapshot_sha256: snapshotSha256,
    fin_environment: mode,
    fin_entity_id: entityId,
    fin_stripe_account_key: stripeAccountKeyForEntity(entityId),
  };
  const insertRows = await db`
    INSERT INTO fin_invoice_payment_requests (
      id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      idempotency_key, created_by_user_id, approved_by_user_id, metadata_json, created_at, updated_at
    ) VALUES (
      ${id}, ${invoiceId}, ${entityId}, ${row.invoice_number}, ${snapshotSha256}, ${mode}, 'creating', ${amountCents}, ${invoice.currency || row.currency || 'USD'},
      ${idempotencyKey}, ${currentUser.id}, ${currentUser.id}, ${JSON.stringify(metadata)}::jsonb, now(), now()
    )
    RETURNING id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id,
      expires_at::text AS expires_at, paid_at::text AS paid_at, updated_at::text AS updated_at
  `;
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${invoiceId}, ${currentUser.id}, 'stripe_checkout_requested', 'Stripe Checkout payment link requested', ${JSON.stringify({ mode, paymentRequestId: id, snapshotSha256 })}::jsonb)`;
  const paymentRequest = { ...paymentRequestSummary(insertRows[0]), entityId, stripeAccountKey: stripeAccountKeyForEntity(entityId), idempotencyKey, metadata };
  return { invoice, paymentRequest, reused: false };
}

async function activateInvoicePaymentRequest(user, paymentRequestId, session = {}) {
  const currentUser = await ensureUser(user);
  if (currentUser.role !== 'admin') throw makeError(403, 'Only Fin admins can activate Stripe payment links.');
  const db = sql();
  const rows = await db`
    UPDATE fin_invoice_payment_requests SET
      status = 'active',
      payment_url = ${cleanSingleLine(session.url, 1200)},
      stripe_checkout_session_id = ${cleanSingleLine(session.id, 160) || null},
      stripe_payment_intent_id = ${cleanSingleLine(session.paymentIntentId, 160) || null},
      stripe_customer_id = ${cleanSingleLine(session.customerId, 160)},
      expires_at = ${session.expiresAt || null},
      updated_at = now()
    WHERE id = ${paymentRequestId} AND deleted_at IS NULL
    RETURNING id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id,
      expires_at::text AS expires_at, paid_at::text AS paid_at, updated_at::text AS updated_at
  `;
  if (!rows[0]) throw makeError(404, 'Payment request not found.');
  const payment = paymentRequestSummary(rows[0]);
  await db`UPDATE fin_invoices SET payment_status = 'link_ready', current_payment_request_id = ${payment.id}, payment_updated_at = now(), updated_at = now() WHERE id = ${payment.invoiceId} AND deleted_at IS NULL`;
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${payment.invoiceId}, ${currentUser.id}, 'stripe_checkout_created', 'Stripe Checkout payment link created', ${JSON.stringify({ mode: payment.mode, paymentRequestId: payment.id, checkoutSessionId: payment.checkoutSessionId })}::jsonb)`;
  return payment;
}

async function failInvoicePaymentRequest(user, paymentRequestId, message = '') {
  const currentUser = await ensureUser(user);
  const db = sql();
  const rows = await db`
    UPDATE fin_invoice_payment_requests SET status = 'failed', updated_at = now()
    WHERE id = ${paymentRequestId} AND deleted_at IS NULL
    RETURNING id, invoice_id
  `;
  if (rows[0]) {
    await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${rows[0].invoice_id}, ${currentUser.id}, 'stripe_checkout_failed', 'Stripe Checkout payment link creation failed', ${JSON.stringify({ paymentRequestId, message: cleanSingleLine(message, 240) })}::jsonb)`;
  }
}

async function createInvoiceCustomerPaymentPage(user, invoiceId, modeInput = 'test', baseUrl = '') {
  const currentUser = await ensureUser(user);
  if (currentUser.role !== 'admin') throw makeError(403, 'Only Fin admins can create customer payment pages.');
  const mode = cleanStripeMode(modeInput);
  const db = sql();
  const { row, invoice, amountCents, snapshotSha256 } = await loadApprovedInvoiceForPayment(invoiceId);
  if (!userCanAccessInvoiceRow(currentUser, row)) throw makeError(404, 'Invoice draft not found.');
  assertInvoiceAllowsStripePaymentPage(invoice);
  const methodFamily = 'customer_choice';

  await db`
    UPDATE fin_invoice_payment_requests
    SET status = 'failed', updated_at = now()
    WHERE invoice_id = ${invoiceId} AND stripe_mode = ${mode} AND payment_method_family = ${methodFamily}
      AND deleted_at IS NULL AND status = 'creating' AND updated_at < now() - interval '15 minutes'
  `;

  const activeRows = await db`
    SELECT id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_customer_id,
      payment_method_family, payment_method_type, fee_policy, base_amount_cents, client_processing_cost_cents,
      collection_amount_cents, expected_stripe_fee_cents, expected_net_cents, expected_fee_formula_json,
      fee_disclosure_text, public_token_hint, public_url, stripe_balance_transaction_id,
      actual_stripe_fee_cents, actual_net_cents, reconciliation_status, payment_method_details_json,
      expires_at::text AS expires_at, paid_at::text AS paid_at, reconciled_at::text AS reconciled_at, updated_at::text AS updated_at
    FROM fin_invoice_payment_requests
    WHERE invoice_id = ${invoiceId} AND stripe_mode = ${mode} AND payment_method_family = ${methodFamily}
      AND deleted_at IS NULL AND status IN ('creating', 'active', 'processing', 'paid')
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (activeRows[0]) {
    const active = paymentRequestSummary(activeRows[0]);
    if (active.snapshotSha256 === snapshotSha256) {
      if (active.status === 'paid') throw makeError(409, 'This invoice is already paid.');
      return { invoice, paymentRequest: active, reused: true };
    }
    throw makeError(409, 'This invoice already has an active customer payment page for a different snapshot. Supersede or expire it before creating another page.');
  }

  const conflictingRows = await db`
    SELECT id, status, payment_method_family, invoice_snapshot_sha256
    FROM fin_invoice_payment_requests
    WHERE invoice_id = ${invoiceId} AND stripe_mode = ${mode} AND payment_method_family <> ${methodFamily}
      AND deleted_at IS NULL AND status IN ('creating', 'active', 'processing', 'paid')
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (conflictingRows[0]) {
    if (conflictingRows[0].status === 'paid') throw makeError(409, 'This invoice is already paid.');
    throw makeError(409, 'This invoice already has active Stripe checkout activity. Expire, cancel, or supersede it before creating a customer payment page.');
  }

  const existingRows = await db`
    SELECT id, status, public_url
    FROM fin_invoice_payment_requests
    WHERE invoice_id = ${invoiceId} AND invoice_snapshot_sha256 = ${snapshotSha256} AND stripe_mode = ${mode}
      AND payment_method_family = ${methodFamily} AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (existingRows[0] && !['failed', 'expired', 'canceled'].includes(existingRows[0].status)) {
    throw makeError(409, 'This invoice already has a customer payment page for this snapshot.');
  }

  const token = generatePaymentToken();
  const publicUrl = joinPaymentUrl(baseUrl, token);
  const tokenHash = paymentTokenHash(token);
  const tokenHint = token.slice(-8);
  const id = existingRows[0]?.id || crypto.randomUUID();
  const entityId = cleanEntityId(invoice.entityId || row.entity_id || 'wawco');
  const idempotencyKey = `fin-paypage-${mode}-${invoiceId}-${snapshotSha256}`;
  const metadata = {
    fin_invoice_id: invoiceId,
    fin_payment_request_id: id,
    fin_invoice_number: row.invoice_number,
    fin_invoice_snapshot_sha256: snapshotSha256,
    fin_environment: mode,
    fin_entity_id: entityId,
    fin_stripe_account_key: stripeAccountKeyForEntity(entityId),
    fin_payment_method_family: methodFamily,
    fin_fee_policy: 'method_specific_choice',
  };

  const rows = existingRows[0]
    ? await db`
      UPDATE fin_invoice_payment_requests SET
        entity_id = ${entityId}, status = 'active', amount_cents = ${amountCents}, currency = ${invoice.currency || row.currency || 'USD'},
        payment_url = ${publicUrl}, payment_url_kind = 'customer_payment_page', stripe_checkout_session_id = NULL,
        stripe_payment_intent_id = NULL, stripe_charge_id = '', stripe_customer_id = '',
        payment_method_family = ${methodFamily}, payment_method_type = '', fee_policy = 'method_specific_choice',
        base_amount_cents = ${amountCents}, client_processing_cost_cents = 0, collection_amount_cents = ${amountCents},
        expected_stripe_fee_cents = 0, expected_net_cents = ${amountCents}, expected_fee_formula_json = ${JSON.stringify({ version: 'customer-choice', methods: ['bank_account', 'card'] })}::jsonb,
        fee_disclosure_text = 'Choose bank account or card before Stripe Checkout.',
        public_token_hash = ${tokenHash}, public_token_hint = ${tokenHint}, public_url = ${publicUrl},
        stripe_balance_transaction_id = '', actual_stripe_fee_cents = NULL, actual_net_cents = NULL,
        reconciliation_status = 'not_started', reconciled_at = NULL, payment_method_details_json = '{}'::jsonb,
        idempotency_key = ${idempotencyKey}, metadata_json = ${JSON.stringify(metadata)}::jsonb, updated_at = now()
      WHERE id = ${existingRows[0].id} AND deleted_at IS NULL
      RETURNING id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
        payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_customer_id,
        payment_method_family, payment_method_type, fee_policy, base_amount_cents, client_processing_cost_cents,
        collection_amount_cents, expected_stripe_fee_cents, expected_net_cents, expected_fee_formula_json,
        fee_disclosure_text, public_token_hint, public_url, stripe_balance_transaction_id,
        actual_stripe_fee_cents, actual_net_cents, reconciliation_status, payment_method_details_json,
        expires_at::text AS expires_at, paid_at::text AS paid_at, reconciled_at::text AS reconciled_at, updated_at::text AS updated_at
    `
    : await db`
      INSERT INTO fin_invoice_payment_requests (
        id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
        payment_url, payment_url_kind, payment_method_family, payment_method_type, fee_policy,
        base_amount_cents, client_processing_cost_cents, collection_amount_cents, expected_stripe_fee_cents,
        expected_net_cents, expected_fee_formula_json, fee_disclosure_text, public_token_hash, public_token_hint,
        public_url, idempotency_key, created_by_user_id, approved_by_user_id, metadata_json, created_at, updated_at
      ) VALUES (
        ${id}, ${invoiceId}, ${entityId}, ${row.invoice_number}, ${snapshotSha256}, ${mode}, 'active', ${amountCents}, ${invoice.currency || row.currency || 'USD'},
        ${publicUrl}, 'customer_payment_page', ${methodFamily}, '', 'method_specific_choice',
        ${amountCents}, 0, ${amountCents}, 0,
        ${amountCents}, ${JSON.stringify({ version: 'customer-choice', methods: ['bank_account', 'card'] })}::jsonb, 'Choose bank account or card before Stripe Checkout.', ${tokenHash}, ${tokenHint},
        ${publicUrl}, ${idempotencyKey}, ${currentUser.id}, ${currentUser.id}, ${JSON.stringify(metadata)}::jsonb, now(), now()
      )
      RETURNING id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
        payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_customer_id,
        payment_method_family, payment_method_type, fee_policy, base_amount_cents, client_processing_cost_cents,
        collection_amount_cents, expected_stripe_fee_cents, expected_net_cents, expected_fee_formula_json,
        fee_disclosure_text, public_token_hint, public_url, stripe_balance_transaction_id,
        actual_stripe_fee_cents, actual_net_cents, reconciliation_status, payment_method_details_json,
        expires_at::text AS expires_at, paid_at::text AS paid_at, reconciled_at::text AS reconciled_at, updated_at::text AS updated_at
    `;

  const payment = { ...paymentRequestSummary(rows[0]), entityId, stripeAccountKey: stripeAccountKeyForEntity(entityId) };
  await db`UPDATE fin_invoices SET payment_status = 'link_ready', current_payment_request_id = ${payment.id}, payment_updated_at = now(), updated_at = now() WHERE id = ${payment.invoiceId} AND deleted_at IS NULL`;
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${invoiceId}, ${currentUser.id}, 'stripe_customer_payment_page_created', 'Customer payment page created', ${JSON.stringify({ mode, paymentRequestId: id, snapshotSha256 })}::jsonb)`;
  return { invoice, paymentRequest: payment, reused: false };
}

function safePublicInvoice(invoice = {}) {
  const entity = publicEntityForInvoice(invoice);
  return {
    entityId: entity.id,
    entity,
    invoiceNumber: cleanSingleLine(invoice.invoiceNumber, 80),
    status: cleanSingleLine(invoice.status, 40),
    currency: cleanSingleLine(invoice.currency || 'USD', 10),
    project: cleanSingleLine(invoice.project, 240),
    invoiceDate: cleanSingleLine(invoice.invoiceDate, 20),
    dueDate: cleanSingleLine(invoice.dueDate, 20),
    from: {
      name: cleanSingleLine(invoice.from?.name || invoice.from?.company || entity.name, 240),
      email: cleanSingleLine(invoice.from?.email || entity.email || '', 240),
    },
    client: {
      label: invoiceClientLabel(invoice),
      name: cleanSingleLine(invoice.client?.name, 240),
      company: cleanSingleLine(invoice.client?.company, 240),
      email: cleanSingleLine(invoice.client?.email, 240),
    },
    notes: cleanText(invoice.notes, 1200),
    terms: cleanText(invoice.terms, 1200),
    items: (invoice.items || []).map((item) => ({
      description: cleanText(item.description, 600).trim(),
      quantity: cleanQuantity(item.quantity),
      unitPrice: centsToInput(Math.max(0, parseMoneyToCents(item.unitPrice))),
    })),
    totals: invoice.totals || {},
  };
}

function publicMethodSummary(baseAmountCents, method, existing = null) {
  const quote = paymentMethodQuote(baseAmountCents, method);
  return {
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
    status: existing?.status || 'available',
    active: Boolean(existing?.active),
  };
}

async function getPublicPaymentPage(token) {
  await ensureSchema();
  const tokenHash = paymentTokenHash(token);
  const db = sql();
  const rows = await db`
    SELECT pr.*, inv.data_json, inv.status AS invoice_status, inv.payment_status AS invoice_payment_status
    FROM fin_invoice_payment_requests pr
    JOIN fin_invoices inv ON inv.id = pr.invoice_id
    WHERE pr.public_token_hash = ${tokenHash}
      AND pr.payment_method_family = 'customer_choice'
      AND pr.deleted_at IS NULL
      AND pr.status IN ('active', 'processing', 'paid')
      AND inv.deleted_at IS NULL
    ORDER BY pr.updated_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw makeError(404, 'Payment page not found.');
  const invoice = parseStoredInvoice(row.data_json);
  if (!invoice) throw makeError(404, 'Payment page not found.');
  if (!['approved', 'issued', 'paid'].includes(invoice.status)) throw makeError(404, 'Payment page not found.');
  const pagePayment = paymentRequestSummary(row);
  const methodRows = await db`
    SELECT id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_customer_id,
      payment_method_family, payment_method_type, fee_policy, base_amount_cents, client_processing_cost_cents,
      collection_amount_cents, expected_stripe_fee_cents, expected_net_cents, expected_fee_formula_json,
      fee_disclosure_text, public_token_hint, public_url, stripe_balance_transaction_id,
      actual_stripe_fee_cents, actual_net_cents, reconciliation_status, payment_method_details_json,
      expires_at::text AS expires_at, paid_at::text AS paid_at, reconciled_at::text AS reconciled_at, updated_at::text AS updated_at
    FROM fin_invoice_payment_requests
    WHERE invoice_id = ${pagePayment.invoiceId} AND stripe_mode = ${pagePayment.mode}
      AND public_token_hash = ${tokenHash}
      AND payment_method_family IN ('bank_account', 'card')
      AND deleted_at IS NULL
    ORDER BY updated_at DESC
  `;
  const latestByMethod = methodRows.reduce((map, methodRow) => {
    const payment = paymentRequestSummary(methodRow);
    if (!map[payment.paymentMethodFamily]) map[payment.paymentMethodFamily] = payment;
    return map;
  }, {});
  const baseAmountCents = pagePayment.baseAmountCents || Number(invoice.totals?.totalCents || 0);
  return {
    page: {
      status: pagePayment.status,
      mode: pagePayment.mode,
      paymentStatus: row.invoice_payment_status || 'none',
      tokenHint: pagePayment.tokenHint,
      updatedAt: pagePayment.updatedAt,
    },
    invoice: safePublicInvoice(invoice),
    amountCents: baseAmountCents,
    currency: invoice.currency || 'USD',
    methods: [
      publicMethodSummary(baseAmountCents, 'bank_account', latestByMethod.bank_account),
      publicMethodSummary(baseAmountCents, 'card', latestByMethod.card),
    ],
  };
}

async function createCustomerCheckoutPaymentRequest(token, methodInput) {
  await ensureSchema();
  const tokenHash = paymentTokenHash(token);
  const method = cleanPaymentMethod(methodInput);
  const db = sql();
  const pageRows = await db`
    SELECT pr.*, inv.id AS invoice_row_id, inv.invoice_number, inv.status AS invoice_status, inv.currency, inv.total_cents, inv.data_json, inv.approved_by_user_id
    FROM fin_invoice_payment_requests pr
    JOIN fin_invoices inv ON inv.id = pr.invoice_id
    WHERE pr.public_token_hash = ${tokenHash}
      AND pr.payment_method_family = 'customer_choice'
      AND pr.deleted_at IS NULL
      AND pr.status IN ('active', 'processing', 'paid')
      AND inv.deleted_at IS NULL
    ORDER BY pr.updated_at DESC
    LIMIT 1
  `;
  const pageRow = pageRows[0];
  if (!pageRow) throw makeError(404, 'Payment page not found.');
  const invoice = parseStoredInvoice(pageRow.data_json);
  if (!invoice) throw makeError(404, 'Payment page not found.');
  if (!['approved', 'issued'].includes(invoice.status)) throw makeError(409, 'This invoice is not currently payable.');
  const amountCents = Number(pageRow.base_amount_cents || pageRow.total_cents || invoice.totals?.totalCents || 0);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw makeError(409, 'Invoice total must be greater than zero before checkout.');
  const snapshotSha256 = paymentSnapshotHash(invoice);
  if (snapshotSha256 !== pageRow.invoice_snapshot_sha256) throw makeError(409, 'This payment page no longer matches the current invoice snapshot. Ask for a fresh link.');
  const quote = paymentMethodQuote(amountCents, method);

  await db`
    UPDATE fin_invoice_payment_requests
    SET status = 'failed', updated_at = now()
    WHERE invoice_id = ${pageRow.invoice_id} AND stripe_mode = ${pageRow.stripe_mode} AND payment_method_family = ${quote.paymentMethodFamily}
      AND deleted_at IS NULL AND status = 'creating' AND updated_at < now() - interval '15 minutes'
  `;

  const activeRows = await db`
    SELECT id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_customer_id,
      payment_method_family, payment_method_type, fee_policy, base_amount_cents, client_processing_cost_cents,
      collection_amount_cents, expected_stripe_fee_cents, expected_net_cents, expected_fee_formula_json,
      fee_disclosure_text, public_token_hint, public_url, stripe_balance_transaction_id,
      actual_stripe_fee_cents, actual_net_cents, reconciliation_status, payment_method_details_json,
      idempotency_key, metadata_json,
      expires_at::text AS expires_at, paid_at::text AS paid_at, reconciled_at::text AS reconciled_at, updated_at::text AS updated_at
    FROM fin_invoice_payment_requests
    WHERE invoice_id = ${pageRow.invoice_id} AND stripe_mode = ${pageRow.stripe_mode} AND payment_method_family = ${quote.paymentMethodFamily}
      AND deleted_at IS NULL AND status IN ('creating', 'active', 'processing', 'paid')
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (activeRows[0]) {
    const active = {
      ...paymentRequestSummary(activeRows[0]),
      idempotencyKey: activeRows[0].idempotency_key,
      metadata: activeRows[0].metadata_json || {},
    };
    if (active.snapshotSha256 === snapshotSha256) {
      if (active.status === 'paid') throw makeError(409, 'This invoice is already paid.');
      if (active.status === 'active' && active.url) return { invoice, paymentRequest: active, reused: true };
      throw makeError(409, 'Checkout creation is already in progress. Try again shortly.');
    }
    throw makeError(409, 'This invoice already has an active checkout for a different snapshot. Ask for a fresh link.');
  }

  const existingRows = await db`
    SELECT id, status, idempotency_key, metadata_json
    FROM fin_invoice_payment_requests
    WHERE invoice_id = ${pageRow.invoice_id} AND invoice_snapshot_sha256 = ${snapshotSha256}
      AND stripe_mode = ${pageRow.stripe_mode} AND payment_method_family = ${quote.paymentMethodFamily}
      AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  const id = existingRows[0]?.id || crypto.randomUUID();
  const entityId = cleanEntityId(invoice.entityId || pageRow.entity_id || 'wawco');
  const idempotencyKey = existingRows[0]?.idempotency_key || `fin-checkout-${pageRow.stripe_mode}-${method}-${pageRow.invoice_id}-${snapshotSha256}`;
  const metadata = {
    fin_invoice_id: pageRow.invoice_id,
    fin_payment_request_id: id,
    fin_invoice_number: pageRow.invoice_number,
    fin_invoice_snapshot_sha256: snapshotSha256,
    fin_environment: pageRow.stripe_mode,
    fin_entity_id: entityId,
    fin_stripe_account_key: stripeAccountKeyForEntity(entityId),
    fin_payment_method_family: quote.paymentMethodFamily,
    fin_payment_method_type: quote.paymentMethodType,
    fin_fee_policy: quote.feePolicy,
    fin_base_amount_cents: String(quote.baseAmountCents),
    fin_collection_amount_cents: String(quote.collectionAmountCents),
    fin_client_processing_cost_cents: String(quote.clientProcessingCostCents),
  };
  if (existingRows[0] && !['failed', 'expired', 'canceled'].includes(existingRows[0].status)) {
    throw makeError(409, 'This invoice already has a terminal Stripe payment record for this method.');
  }

  const rows = existingRows[0]
    ? await db`
      UPDATE fin_invoice_payment_requests SET
        entity_id = ${entityId}, status = 'creating', amount_cents = ${quote.collectionAmountCents}, currency = ${invoice.currency || pageRow.currency || 'USD'},
        payment_url = '', payment_url_kind = 'checkout_session', stripe_checkout_session_id = NULL,
        stripe_payment_intent_id = NULL, stripe_charge_id = '', stripe_customer_id = '',
        payment_method_family = ${quote.paymentMethodFamily}, payment_method_type = ${quote.paymentMethodType}, fee_policy = ${quote.feePolicy},
        base_amount_cents = ${quote.baseAmountCents}, client_processing_cost_cents = ${quote.clientProcessingCostCents}, collection_amount_cents = ${quote.collectionAmountCents},
        expected_stripe_fee_cents = ${quote.expectedStripeFeeCents}, expected_net_cents = ${quote.expectedNetCents}, expected_fee_formula_json = ${JSON.stringify(quote.formula)}::jsonb,
        fee_disclosure_text = ${quote.disclosureText}, public_token_hash = ${tokenHash}, public_token_hint = ${pageRow.public_token_hint}, public_url = ${pageRow.public_url},
        stripe_balance_transaction_id = '', actual_stripe_fee_cents = NULL, actual_net_cents = NULL,
        reconciliation_status = 'pending_payment', reconciled_at = NULL, payment_method_details_json = '{}'::jsonb,
        idempotency_key = ${idempotencyKey}, metadata_json = ${JSON.stringify(metadata)}::jsonb, updated_at = now()
      WHERE id = ${existingRows[0].id} AND deleted_at IS NULL AND status IN ('failed', 'expired', 'canceled')
      RETURNING id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
        payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_customer_id,
        payment_method_family, payment_method_type, fee_policy, base_amount_cents, client_processing_cost_cents,
        collection_amount_cents, expected_stripe_fee_cents, expected_net_cents, expected_fee_formula_json,
        fee_disclosure_text, public_token_hint, public_url, stripe_balance_transaction_id,
        actual_stripe_fee_cents, actual_net_cents, reconciliation_status, payment_method_details_json,
        expires_at::text AS expires_at, paid_at::text AS paid_at, reconciled_at::text AS reconciled_at, updated_at::text AS updated_at
    `
    : await db`
      INSERT INTO fin_invoice_payment_requests (
        id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
        payment_url_kind, payment_method_family, payment_method_type, fee_policy,
        base_amount_cents, client_processing_cost_cents, collection_amount_cents, expected_stripe_fee_cents,
        expected_net_cents, expected_fee_formula_json, fee_disclosure_text, public_token_hash, public_token_hint,
        public_url, reconciliation_status, idempotency_key, created_by_user_id, approved_by_user_id, metadata_json, created_at, updated_at
      ) VALUES (
        ${id}, ${pageRow.invoice_id}, ${entityId}, ${pageRow.invoice_number}, ${snapshotSha256}, ${pageRow.stripe_mode}, 'creating', ${quote.collectionAmountCents}, ${invoice.currency || pageRow.currency || 'USD'},
        'checkout_session', ${quote.paymentMethodFamily}, ${quote.paymentMethodType}, ${quote.feePolicy},
        ${quote.baseAmountCents}, ${quote.clientProcessingCostCents}, ${quote.collectionAmountCents}, ${quote.expectedStripeFeeCents},
        ${quote.expectedNetCents}, ${JSON.stringify(quote.formula)}::jsonb, ${quote.disclosureText}, ${tokenHash}, ${pageRow.public_token_hint},
        ${pageRow.public_url}, 'pending_payment', ${idempotencyKey}, ${pageRow.created_by_user_id}, ${pageRow.approved_by_user_id}, ${JSON.stringify(metadata)}::jsonb, now(), now()
      )
      RETURNING id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
        payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_customer_id,
        payment_method_family, payment_method_type, fee_policy, base_amount_cents, client_processing_cost_cents,
        collection_amount_cents, expected_stripe_fee_cents, expected_net_cents, expected_fee_formula_json,
        fee_disclosure_text, public_token_hint, public_url, stripe_balance_transaction_id,
        actual_stripe_fee_cents, actual_net_cents, reconciliation_status, payment_method_details_json,
        expires_at::text AS expires_at, paid_at::text AS paid_at, reconciled_at::text AS reconciled_at, updated_at::text AS updated_at
    `;
  const prepared = rows[0];
  if (!prepared) throw makeError(409, 'Stripe payment request could not be prepared for checkout.');
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${pageRow.invoice_id}, NULL, 'stripe_customer_checkout_requested', ${`Customer chose ${methodLabel(method)} payment`}, ${JSON.stringify({ mode: pageRow.stripe_mode, paymentRequestId: id, method })}::jsonb)`;
  return {
    invoice,
    paymentRequest: { ...paymentRequestSummary(prepared), idempotencyKey, metadata },
    reused: false,
  };
}

async function activateCustomerCheckoutPaymentRequest(paymentRequestId, session = {}) {
  const db = sql();
  const rows = await db`
    UPDATE fin_invoice_payment_requests SET
      status = 'active',
      payment_url = ${cleanSingleLine(session.url, 1200)},
      stripe_checkout_session_id = ${cleanSingleLine(session.id, 160) || null},
      stripe_payment_intent_id = ${cleanSingleLine(session.paymentIntentId, 160) || null},
      stripe_customer_id = ${cleanSingleLine(session.customerId, 160)},
      expires_at = ${session.expiresAt || null},
      updated_at = now()
    WHERE id = ${paymentRequestId} AND deleted_at IS NULL
    RETURNING id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_customer_id,
      payment_method_family, payment_method_type, fee_policy, base_amount_cents, client_processing_cost_cents,
      collection_amount_cents, expected_stripe_fee_cents, expected_net_cents, expected_fee_formula_json,
      fee_disclosure_text, public_token_hint, public_url, stripe_balance_transaction_id,
      actual_stripe_fee_cents, actual_net_cents, reconciliation_status, payment_method_details_json,
      expires_at::text AS expires_at, paid_at::text AS paid_at, reconciled_at::text AS reconciled_at, updated_at::text AS updated_at
  `;
  if (!rows[0]) throw makeError(404, 'Payment request not found.');
  const payment = paymentRequestSummary(rows[0]);
  await db`UPDATE fin_invoices SET payment_status = 'link_ready', current_payment_request_id = ${payment.id}, payment_updated_at = now(), updated_at = now() WHERE id = ${payment.invoiceId} AND deleted_at IS NULL`;
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${payment.invoiceId}, NULL, 'stripe_customer_checkout_created', ${`Customer ${methodLabel(payment.paymentMethodFamily)} Checkout created`}, ${JSON.stringify({ mode: payment.mode, paymentRequestId: payment.id, checkoutSessionId: payment.checkoutSessionId, method: payment.paymentMethodFamily })}::jsonb)`;
  return payment;
}

async function failCustomerCheckoutPaymentRequest(paymentRequestId, message = '') {
  const db = sql();
  const rows = await db`
    UPDATE fin_invoice_payment_requests SET status = 'failed', updated_at = now()
    WHERE id = ${paymentRequestId} AND deleted_at IS NULL
    RETURNING id, invoice_id
  `;
  if (rows[0]) {
    await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${rows[0].invoice_id}, NULL, 'stripe_customer_checkout_failed', 'Customer Stripe Checkout creation failed', ${JSON.stringify({ paymentRequestId, message: cleanSingleLine(message, 240) })}::jsonb)`;
  }
}

function stripeEventMode(event) {
  return event?.livemode ? 'live' : 'test';
}

function stripeObjectAmountCents(object = {}) {
  return Number(object.amount_total ?? object.amount_received ?? object.amount ?? 0);
}

function stripeChargeIdFromObject(type, object = {}) {
  if (type.startsWith('charge.')) return cleanSingleLine(object.id, 160);
  if (typeof object.latest_charge === 'string') return cleanSingleLine(object.latest_charge, 160);
  if (object.latest_charge?.id) return cleanSingleLine(object.latest_charge.id, 160);
  if (Array.isArray(object.charges?.data) && object.charges.data[0]?.id) return cleanSingleLine(object.charges.data[0].id, 160);
  return '';
}

function stripeEventMethodTypes(object = {}) {
  const values = [];
  if (Array.isArray(object.payment_method_types)) values.push(...object.payment_method_types);
  if (object.payment_method_type) values.push(object.payment_method_type);
  if (object.payment_method_details?.type) values.push(object.payment_method_details.type);
  return new Set(values.map((value) => cleanSingleLine(value, 80)).filter(Boolean));
}

async function reconciliationForStripeEvent(type, object = {}, entityId = 'wawco') {
  if (type.startsWith('charge.')) return reconciliationFromCharge(object);
  const chargeId = stripeChargeIdFromObject(type, object);
  if (!chargeId) return null;
  return retrieveChargeReconciliation(chargeId, entityId);
}

function paymentNotificationTypeForTransition(nextStatus, payment = {}, eventMethodTypes = new Set()) {
  const methodFamily = cleanSingleLine(payment.paymentMethodFamily || payment.payment_method_family || '', 80);
  const methodType = cleanSingleLine(payment.paymentMethodType || payment.payment_method_type || '', 80);
  const isBank = methodFamily === 'bank_account' || methodType === 'us_bank_account' || eventMethodTypes.has('us_bank_account');
  if (nextStatus === 'processing' && isBank) return 'payment_started';
  if (nextStatus === 'paid') return 'payment_received';
  if (['failed', 'canceled', 'expired', 'refunded', 'disputed'].includes(nextStatus)) return 'payment_issue';
  return '';
}

function notificationSafeSummary({ notificationType, eventId, payment, invoice, runtime, reason = '' }) {
  return {
    notificationType,
    stripeEventId: eventId,
    paymentRequestId: payment?.id || '',
    invoiceId: payment?.invoiceId || invoice?.id || '',
    invoiceNumber: payment?.invoiceNumber || invoice?.invoiceNumber || '',
    entityId: cleanEntityId(payment?.entityId || invoice?.entityId || 'wawco'),
    paymentStatus: payment?.status || '',
    paymentMethodFamily: payment?.paymentMethodFamily || '',
    paymentMethodType: payment?.paymentMethodType || '',
    emailRuntime: runtime ? { enabled: Boolean(runtime.enabled), fake: Boolean(runtime.fake), configured: Boolean(runtime.configured) } : undefined,
    reason,
  };
}

async function insertSkippedPaymentNotification(db, { notificationType, eventId, payment, invoice, reason }) {
  const id = crypto.randomUUID();
  const safeSummary = notificationSafeSummary({ notificationType, eventId, payment, invoice, runtime: paymentEmailRuntimeStatus(), reason });
  const rows = await db`
    INSERT INTO fin_invoice_payment_notifications (
      id, payment_request_id, invoice_id, stripe_event_id, entity_id, notification_type, recipient_email, status, attempt_count, safe_summary_json, last_error, created_at, updated_at
    ) VALUES (
      ${id}, ${payment.id}, ${payment.invoiceId}, ${eventId}, ${payment.entityId}, ${notificationType}, '', 'skipped', 0, ${JSON.stringify(safeSummary)}::jsonb, ${cleanSingleLine(reason, 180)}, now(), now()
    )
    ON CONFLICT (payment_request_id, notification_type) DO NOTHING
    RETURNING id, status, notification_type
  `;
  if (rows[0]) return { status: 'skipped', notificationType, reason, id: rows[0].id };
  return { status: 'duplicate', notificationType, reason: 'notification-already-recorded' };
}

async function sendPaymentStateNotification(db, { notificationType, eventId, payment, invoice }) {
  if (!notificationType || !payment?.id || !payment?.invoiceId) return null;
  const runtime = paymentEmailRuntimeStatus();
  if (!runtime.enabled) return { status: 'disabled', notificationType, reason: 'payment-email-disabled' };
  if (!runtime.configured) return { status: 'disabled', notificationType, reason: 'payment-email-not-configured' };
  const recipientEmail = cleanEmail(invoice?.client?.email || '');
  if (!recipientEmail) return insertSkippedPaymentNotification(db, { notificationType, eventId, payment, invoice, reason: 'missing-recipient-email' });

  const id = crypto.randomUUID();
  const safeSummary = notificationSafeSummary({ notificationType, eventId, payment, invoice, runtime });
  const claimRows = await db`
    INSERT INTO fin_invoice_payment_notifications (
      id, payment_request_id, invoice_id, stripe_event_id, entity_id, notification_type, recipient_email, status, attempt_count, safe_summary_json, created_at, updated_at
    ) VALUES (
      ${id}, ${payment.id}, ${payment.invoiceId}, ${eventId}, ${payment.entityId}, ${notificationType}, ${recipientEmail}, 'sending', 1, ${JSON.stringify(safeSummary)}::jsonb, now(), now()
    )
    ON CONFLICT (payment_request_id, notification_type) DO NOTHING
    RETURNING id, status, notification_type, attempt_count
  `;
  const claim = claimRows[0];
  if (!claim) {
    const existing = await db`
      SELECT id, status, notification_type, attempt_count
      FROM fin_invoice_payment_notifications
      WHERE payment_request_id = ${payment.id} AND notification_type = ${notificationType}
      LIMIT 1
    `;
    return {
      status: existing[0]?.status === 'failed' ? 'retry-exhausted' : 'duplicate',
      notificationType,
      id: existing[0]?.id || '',
      attemptCount: Number(existing[0]?.attempt_count || 0),
    };
  }

  try {
    const result = await sendPaymentNotificationEmail({
      to: recipientEmail,
      notificationType,
      invoice,
      payment,
      entity: publicEntity(payment.entityId || invoice?.entityId || 'wawco'),
    });
    await db`
      UPDATE fin_invoice_payment_notifications
      SET status = 'sent', gmail_message_id = ${cleanSingleLine(result.id, 160)}, gmail_thread_id = ${cleanSingleLine(result.threadId, 160)}, last_error = '', sent_at = now(), updated_at = now()
      WHERE id = ${claim.id}
    `;
    return { status: 'sent', notificationType, id: claim.id, fake: Boolean(result.fake), gmailMessageId: cleanSingleLine(result.id, 160) };
  } catch (error) {
    await db`
      UPDATE fin_invoice_payment_notifications
      SET status = 'failed', last_error = ${cleanSingleLine(error?.message || 'payment-email-send-failed', 180)}, updated_at = now()
      WHERE id = ${claim.id}
    `;
    return { status: 'failed', notificationType, id: claim.id, reason: 'payment-email-send-failed' };
  }
}

async function processStripeEvent(event = {}) {
  await ensureSchema();
  const db = sql();
  const eventId = cleanSingleLine(event.id, 160);
  if (!eventId) throw makeError(400, 'Stripe event id is required.');
  const mode = stripeEventMode(event);
  const type = cleanSingleLine(event.type, 160);
  const object = event.data?.object || {};
  const eventEntityId = cleanEntityId(event.finEntityId || object.metadata?.fin_entity_id || 'wawco');
  const stripeCreatedAt = event.created ? new Date(Number(event.created) * 1000).toISOString() : null;
  const inserted = await db`
    INSERT INTO fin_stripe_events (stripe_event_id, entity_id, stripe_mode, event_type, stripe_created_at, status, safe_summary_json, received_at)
    VALUES (${eventId}, ${eventEntityId}, ${mode}, ${type}, ${stripeCreatedAt}, 'received', ${JSON.stringify({ type, mode, entityId: eventEntityId, objectId: object.id || '' })}::jsonb, now())
    ON CONFLICT (stripe_event_id) DO NOTHING
    RETURNING stripe_event_id
  `;
  if (!inserted[0]) {
    const existingEvents = await db`SELECT status FROM fin_stripe_events WHERE stripe_event_id = ${eventId} LIMIT 1`;
    const existingStatus = existingEvents[0]?.status || '';
    if (existingStatus === 'processed' || existingStatus === 'failed') return { duplicate: true, status: existingStatus, eventId };
  }
  await db`UPDATE fin_stripe_events SET status = 'processing', safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '' })}::jsonb WHERE stripe_event_id = ${eventId} AND status <> 'processed'`;

  let paymentRows = [];
  if (type.startsWith('checkout.session.')) {
    paymentRows = await db`SELECT * FROM fin_invoice_payment_requests WHERE entity_id = ${eventEntityId} AND stripe_checkout_session_id = ${cleanSingleLine(object.id, 160)} AND deleted_at IS NULL LIMIT 1`;
  }
  if (!paymentRows[0] && type.startsWith('payment_intent.')) {
    paymentRows = await db`SELECT * FROM fin_invoice_payment_requests WHERE entity_id = ${eventEntityId} AND stripe_payment_intent_id = ${cleanSingleLine(object.id, 160)} AND deleted_at IS NULL LIMIT 1`;
  }
  if (!paymentRows[0] && type.startsWith('charge.') && object.payment_intent) {
    paymentRows = await db`SELECT * FROM fin_invoice_payment_requests WHERE entity_id = ${eventEntityId} AND stripe_payment_intent_id = ${cleanSingleLine(object.payment_intent, 160)} AND deleted_at IS NULL LIMIT 1`;
  }
  if (!paymentRows[0] && type.startsWith('charge.')) {
    paymentRows = await db`SELECT * FROM fin_invoice_payment_requests WHERE entity_id = ${eventEntityId} AND stripe_charge_id = ${cleanSingleLine(object.id, 160)} AND deleted_at IS NULL LIMIT 1`;
  }
  if (!paymentRows[0] && object.metadata?.fin_payment_request_id) {
    paymentRows = await db`SELECT * FROM fin_invoice_payment_requests WHERE entity_id = ${eventEntityId} AND id = ${cleanSingleLine(object.metadata.fin_payment_request_id, 120)} AND deleted_at IS NULL LIMIT 1`;
  }
  const paymentRow = paymentRows[0];
  if (!paymentRow) {
    await db`UPDATE fin_stripe_events SET status = 'ignored', processed_at = now(), safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '', reason: 'payment-request-not-found' })}::jsonb WHERE stripe_event_id = ${eventId}`;
    return { duplicate: false, status: 'ignored', reason: 'payment-request-not-found', eventId };
  }

  const payment = paymentRequestSummary(paymentRow);
  if (payment.entityId !== eventEntityId) {
    await db`UPDATE fin_stripe_events SET status = 'failed', processed_at = now(), payment_request_id = ${payment.id}, invoice_id = ${payment.invoiceId}, safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '', reason: 'entity-mismatch', eventEntityId, paymentEntityId: payment.entityId })}::jsonb WHERE stripe_event_id = ${eventId}`;
    throw makeError(400, 'Stripe event entity does not match the Fin payment request.');
  }
  if (payment.mode !== mode) {
    await db`UPDATE fin_stripe_events SET status = 'failed', processed_at = now(), payment_request_id = ${payment.id}, invoice_id = ${payment.invoiceId}, safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '', reason: 'mode-mismatch', paymentMode: payment.mode })}::jsonb WHERE stripe_event_id = ${eventId}`;
    throw makeError(400, 'Stripe event mode does not match the Fin payment request.');
  }
  const amountCents = stripeObjectAmountCents(object);
  const currency = cleanSingleLine(object.currency || payment.currency, 10).toUpperCase();
  if (amountCents && amountCents !== payment.amountCents) {
    await db`UPDATE fin_stripe_events SET status = 'failed', processed_at = now(), payment_request_id = ${payment.id}, invoice_id = ${payment.invoiceId}, safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '', reason: 'amount-mismatch' })}::jsonb WHERE stripe_event_id = ${eventId}`;
    throw makeError(400, 'Stripe event amount does not match the Fin payment snapshot.');
  }
  if (currency && currency !== payment.currency) {
    await db`UPDATE fin_stripe_events SET status = 'failed', processed_at = now(), payment_request_id = ${payment.id}, invoice_id = ${payment.invoiceId}, safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '', reason: 'currency-mismatch' })}::jsonb WHERE stripe_event_id = ${eventId}`;
    throw makeError(400, 'Stripe event currency does not match the Fin payment snapshot.');
  }
  const eventMethodTypes = stripeEventMethodTypes(object);
  if (payment.paymentMethodType && eventMethodTypes.size && !eventMethodTypes.has(payment.paymentMethodType)) {
    await db`UPDATE fin_stripe_events SET status = 'failed', processed_at = now(), payment_request_id = ${payment.id}, invoice_id = ${payment.invoiceId}, safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '', reason: 'payment-method-mismatch', expected: payment.paymentMethodType, observed: [...eventMethodTypes] })}::jsonb WHERE stripe_event_id = ${eventId}`;
    throw makeError(400, 'Stripe event payment method does not match the Fin payment request.');
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
  } else if (type === 'charge.failed') {
    nextStatus = 'failed';
    invoicePaymentStatus = 'failed';
  } else if (type === 'charge.refunded') {
    nextStatus = 'refunded';
    invoicePaymentStatus = 'refunded';
  } else if (type.startsWith('charge.dispute.')) {
    nextStatus = 'disputed';
    invoicePaymentStatus = 'disputed';
  } else {
    await db`UPDATE fin_stripe_events SET status = 'ignored', processed_at = now(), payment_request_id = ${payment.id}, invoice_id = ${payment.invoiceId}, safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '', reason: 'event-not-handled' })}::jsonb WHERE stripe_event_id = ${eventId}`;
    return { duplicate: false, status: 'ignored', reason: 'event-not-handled', eventId };
  }

  const allowedAfterTerminal = {
    paid: new Set(['paid', 'refunded', 'disputed']),
    refunded: new Set(['refunded', 'disputed']),
    disputed: new Set(['disputed', 'refunded']),
  };
  if (allowedAfterTerminal[payment.status] && !allowedAfterTerminal[payment.status].has(nextStatus)) {
    await db`UPDATE fin_stripe_events SET status = 'ignored', processed_at = now(), payment_request_id = ${payment.id}, invoice_id = ${payment.invoiceId}, safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '', reason: 'stale-state-transition', paymentStatus: payment.status, nextStatus })}::jsonb WHERE stripe_event_id = ${eventId}`;
    return { duplicate: false, status: 'ignored', reason: 'stale-state-transition', eventId };
  }
  if (['expired', 'failed', 'canceled'].includes(payment.status) && nextStatus === 'processing') {
    await db`UPDATE fin_stripe_events SET status = 'ignored', processed_at = now(), payment_request_id = ${payment.id}, invoice_id = ${payment.invoiceId}, safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '', reason: 'stale-state-transition', paymentStatus: payment.status, nextStatus })}::jsonb WHERE stripe_event_id = ${eventId}`;
    return { duplicate: false, status: 'ignored', reason: 'stale-state-transition', eventId };
  }

  const paymentIntentId = cleanSingleLine(type.startsWith('payment_intent.') ? object.id : object.payment_intent || '', 160);
  const chargeId = stripeChargeIdFromObject(type, object);
  const reconciliation = nextStatus === 'paid' || type.startsWith('charge.') ? await reconciliationForStripeEvent(type, object, payment.entityId) : null;
  const balanceTransactionId = cleanSingleLine(reconciliation?.balanceTransactionId, 160);
  const actualStripeFeeCents = Number.isFinite(Number(reconciliation?.actualStripeFeeCents)) ? Number(reconciliation.actualStripeFeeCents) : null;
  const actualNetCents = Number.isFinite(Number(reconciliation?.actualNetCents)) ? Number(reconciliation.actualNetCents) : null;
  const reconciliationStatus = cleanSingleLine(reconciliation?.reconciliationStatus || (nextStatus === 'paid' ? 'pending_stripe_fee' : ''), 80);
  const paymentMethodDetails = reconciliation?.paymentMethodDetails || (object.payment_method_details ? reconciliationFromCharge(object).paymentMethodDetails : {});
  const paidAt = nextStatus === 'paid' ? new Date().toISOString() : null;
  const reconciledAt = reconciliationStatus === 'reconciled' ? new Date().toISOString() : null;
  const updatedRows = await db`
    UPDATE fin_invoice_payment_requests SET
      status = ${nextStatus},
      stripe_payment_intent_id = CASE WHEN ${paymentIntentId} <> '' THEN ${paymentIntentId} ELSE stripe_payment_intent_id END,
      stripe_charge_id = CASE WHEN ${chargeId} <> '' THEN ${chargeId} ELSE stripe_charge_id END,
      stripe_balance_transaction_id = CASE WHEN ${balanceTransactionId} <> '' THEN ${balanceTransactionId} ELSE stripe_balance_transaction_id END,
      actual_stripe_fee_cents = CASE WHEN ${actualStripeFeeCents}::integer IS NOT NULL THEN ${actualStripeFeeCents}::integer ELSE actual_stripe_fee_cents END,
      actual_net_cents = CASE WHEN ${actualNetCents}::integer IS NOT NULL THEN ${actualNetCents}::integer ELSE actual_net_cents END,
      reconciliation_status = CASE WHEN ${reconciliationStatus} <> '' THEN ${reconciliationStatus} ELSE reconciliation_status END,
      reconciled_at = CASE WHEN ${reconciledAt}::timestamptz IS NOT NULL THEN ${reconciledAt}::timestamptz ELSE reconciled_at END,
      payment_method_details_json = CASE WHEN ${JSON.stringify(paymentMethodDetails || {})}::jsonb <> '{}'::jsonb THEN ${JSON.stringify(paymentMethodDetails || {})}::jsonb ELSE payment_method_details_json END,
      paid_at = CASE WHEN ${paidAt}::timestamptz IS NOT NULL THEN ${paidAt}::timestamptz ELSE paid_at END,
      updated_at = now()
    WHERE id = ${payment.id}
    RETURNING id, invoice_id, entity_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_customer_id,
      payment_method_family, payment_method_type, fee_policy, base_amount_cents, client_processing_cost_cents,
      collection_amount_cents, expected_stripe_fee_cents, expected_net_cents, expected_fee_formula_json,
      fee_disclosure_text, public_token_hint, public_url, stripe_balance_transaction_id,
      actual_stripe_fee_cents, actual_net_cents, reconciliation_status, payment_method_details_json,
      expires_at::text AS expires_at, paid_at::text AS paid_at, reconciled_at::text AS reconciled_at, updated_at::text AS updated_at
  `;
  const updatedPayment = paymentRequestSummary(updatedRows[0]);
  const invoiceRows = await db`SELECT data_json FROM fin_invoices WHERE id = ${payment.invoiceId} LIMIT 1`;
  const invoice = parseStoredInvoice(invoiceRows[0]?.data_json) || {};
  if (nextStatus === 'paid') invoice.status = 'paid';
  await db`
    UPDATE fin_invoices SET
      status = CASE WHEN ${nextStatus} = 'paid' THEN 'paid' ELSE status END,
      data_json = CASE WHEN ${nextStatus} = 'paid' THEN ${JSON.stringify(invoice)}::jsonb ELSE data_json END,
      payment_status = ${invoicePaymentStatus},
      current_payment_request_id = ${payment.id},
      paid_at = CASE WHEN ${nextStatus} = 'paid' THEN now() ELSE paid_at END,
      payment_updated_at = now(),
      updated_at = now()
    WHERE id = ${payment.invoiceId} AND deleted_at IS NULL
  `;
  await db`UPDATE fin_stripe_events SET status = 'processed', processed_at = now(), payment_request_id = ${payment.id}, invoice_id = ${payment.invoiceId}, safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '', paymentRequestId: payment.id, invoiceId: payment.invoiceId, nextStatus })}::jsonb WHERE stripe_event_id = ${eventId}`;
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${payment.invoiceId}, NULL, 'stripe_webhook_processed', ${`Stripe ${type} processed`}, ${JSON.stringify({ eventId, paymentRequestId: payment.id, paymentStatus: invoicePaymentStatus })}::jsonb)`;
  const notificationType = paymentNotificationTypeForTransition(nextStatus, updatedPayment, eventMethodTypes);
  const notification = notificationType ? await sendPaymentStateNotification(db, { notificationType, eventId, payment: updatedPayment, invoice }) : null;
  if (notification) {
    await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${payment.invoiceId}, NULL, 'payment_notification_recorded', ${`Payment notification ${notification.status}`}, ${JSON.stringify({ eventId, paymentRequestId: payment.id, notificationType: notification.notificationType, notificationStatus: notification.status })}::jsonb)`;
  }
  return { duplicate: false, status: 'processed', eventId, payment: updatedPayment, notification };
}

function profileLabel(profileType, data = {}) {
  if (data.label) return cleanSingleLine(data.label, 240);
  if (profileType === 'payee') return cleanSingleLine(data.name || data.company || data.email || 'Untitled payee', 240);
  if (profileType === 'client') return cleanSingleLine(data.company || data.name || data.email || 'Untitled client', 240);
  return cleanSingleLine(data.salesRep || data.name || data.email || 'Untitled user', 240);
}

function normalizeProfile(profileType, input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  if (profileType === 'payee') {
    const rawScope = cleanSingleLine(source.reportingScope, 40).toLowerCase();
    const reportingScope = rawScope === 'private' ? 'private' : cleanEntityId(rawScope || 'wawco');
    return {
      label: cleanSingleLine(source.label || source.name || source.company || source.email || 'Untitled payee', 240),
      name: cleanSingleLine(source.name || source.company, 240),
      company: cleanSingleLine(source.company || source.name, 240),
      email: cleanSingleLine(source.email, 240),
      address: cleanText(source.address, 1000),
      mercuryDestinationAccountId: cleanSingleLine(source.mercuryDestinationAccountId, 160),
      defaultTerms: cleanText(source.defaultTerms, 2000),
      defaultPaymentInstructions: cleanText(source.defaultPaymentInstructions, 2000),
      reportingScope,
      excludeFromWawcoDashboard: Boolean(source.excludeFromWawcoDashboard) || reportingScope === 'private',
    };
  }
  if (profileType === 'client') {
    return {
      label: cleanSingleLine(source.label || source.company || source.name || source.email || 'Untitled client', 240),
      name: cleanSingleLine(source.name, 240),
      company: cleanSingleLine(source.company, 240),
      email: cleanSingleLine(source.email, 240),
      address: cleanText(source.address, 1000),
      mercuryCustomerId: cleanSingleLine(source.mercuryCustomerId, 160),
      invoiceCode: clientInvoiceCode({ client: { invoiceCode: source.invoiceCode, company: source.company, name: source.name, email: source.email } }),
      paymentProviderPreference: normalizePaymentProvider(source.paymentProviderPreference || source.paymentProvider || source.payment_provider_preference),
    };
  }
  return {
    label: cleanSingleLine(source.label || source.salesRep || source.name || source.email || 'Untitled user', 240),
    salesRep: cleanSingleLine(source.salesRep || source.name, 240),
    salesRepEmail: cleanSingleLine(source.salesRepEmail || source.email, 240),
    salesRole: ['admin', 'reviewer', 'sales-rep'].includes(cleanSingleLine(source.salesRole, 40)) ? cleanSingleLine(source.salesRole, 40) : 'admin',
  };
}

function profileListItem(row) {
  return {
    id: row.id,
    type: row.profile_type,
    label: row.label,
    shared: row.shared !== false,
    data: parseStoredInvoice(row.data_json) || {},
    updatedAt: row.updated_at || '',
  };
}

async function listProfiles(user, type) {
  const profileType = cleanProfileType(type);
  const currentUser = await ensureUser(user);
  const db = sql();
  const rows = currentUser.role === 'admin'
    ? await db`
      SELECT id, profile_type, label, shared, data_json, updated_at::text AS updated_at
      FROM fin_profiles
      WHERE deleted_at IS NULL AND profile_type = ${profileType}
      ORDER BY lower(label), updated_at DESC
      LIMIT 200
    `
    : await db`
      SELECT id, profile_type, label, shared, data_json, updated_at::text AS updated_at
      FROM fin_profiles
      WHERE deleted_at IS NULL AND profile_type = ${profileType} AND (shared = TRUE OR created_by_user_id = ${currentUser.id})
      ORDER BY lower(label), updated_at DESC
      LIMIT 200
    `;
  return rows.map(profileListItem);
}

async function createProfile(user, type, input = {}) {
  const profileType = cleanProfileType(type);
  const currentUser = await ensureUser(user);
  const db = sql();
  const id = crypto.randomUUID();
  const data = normalizeProfile(profileType, input);
  const label = profileLabel(profileType, data);
  const rows = await db`
    INSERT INTO fin_profiles (id, profile_type, label, data_json, created_by_user_id, shared, created_at, updated_at)
    VALUES (${id}, ${profileType}, ${label}, ${JSON.stringify(data)}::jsonb, ${currentUser.id}, TRUE, now(), now())
    RETURNING id, profile_type, label, shared, data_json, updated_at::text AS updated_at
  `;
  return profileListItem(rows[0]);
}

async function updateProfile(user, id, type, input = {}) {
  const profileType = cleanProfileType(type);
  const currentUser = await ensureUser(user);
  const db = sql();
  const data = normalizeProfile(profileType, input);
  const label = profileLabel(profileType, data);
  const rows = currentUser.role === 'admin'
    ? await db`
      UPDATE fin_profiles SET label = ${label}, data_json = ${JSON.stringify(data)}::jsonb, updated_at = now()
      WHERE id = ${id} AND profile_type = ${profileType} AND deleted_at IS NULL
      RETURNING id, profile_type, label, shared, data_json, updated_at::text AS updated_at
    `
    : await db`
      UPDATE fin_profiles SET label = ${label}, data_json = ${JSON.stringify(data)}::jsonb, updated_at = now()
      WHERE id = ${id} AND profile_type = ${profileType} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL
      RETURNING id, profile_type, label, shared, data_json, updated_at::text AS updated_at
    `;
  return rows[0] ? profileListItem(rows[0]) : null;
}

async function deleteProfile(user, id, type) {
  const profileType = cleanProfileType(type);
  const currentUser = await ensureUser(user);
  const db = sql();
  const rows = currentUser.role === 'admin'
    ? await db`UPDATE fin_profiles SET deleted_at = now(), updated_at = now() WHERE id = ${id} AND profile_type = ${profileType} AND deleted_at IS NULL RETURNING id`
    : await db`UPDATE fin_profiles SET deleted_at = now(), updated_at = now() WHERE id = ${id} AND profile_type = ${profileType} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL RETURNING id`;
  return Boolean(rows[0]);
}

function dashboardStatusSummary(invoices) {
  const groups = new Map();
  for (const invoice of invoices) {
    const key = cleanSingleLine(invoice.status, 40) || 'unknown';
    const current = groups.get(key) || { status: key, count: 0, invoiceCount: 0, amountCents: 0, totalCents: 0 };
    current.count += 1;
    current.invoiceCount += 1;
    current.amountCents += Number(invoice.amountCents || 0);
    current.totalCents += Number(invoice.amountCents || 0);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.amountCents - a.amountCents || a.status.localeCompare(b.status));
}

function dashboardMonth(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}/);
  return match ? match[0] : '';
}

function latestDashboardMonth(months) {
  return months.filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 7);
}

function dashboardDate(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function daysFromToday(value) {
  const date = dashboardDate(value);
  if (!date) return null;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  const then = new Date(`${date}T00:00:00Z`).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.round((then - today) / 86_400_000);
}

function isOpenInvoiceStatus(status) {
  return !['paid', 'void', 'canceled', 'cancelled'].includes(String(status || '').toLowerCase());
}

function dashboardPaymentSummary(invoices) {
  const groups = new Map();
  for (const invoice of invoices) {
    const key = cleanSingleLine(invoice.paymentStatus, 40) || 'none';
    const current = groups.get(key) || { status: key, count: 0, invoiceCount: 0, amountCents: 0, totalCents: 0 };
    current.count += 1;
    current.invoiceCount += 1;
    current.amountCents += Number(invoice.amountCents || 0);
    current.totalCents += Number(invoice.amountCents || 0);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.amountCents - a.amountCents || a.status.localeCompare(b.status));
}

function hostedInvoiceRow(row) {
  const invoice = parseStoredInvoice(row.data_json) || {};
  const dueDate = dashboardDate(row.due_date || invoice.dueDate);
  const daysUntilDue = daysFromToday(dueDate);
  let dueState = '';
  if (isOpenInvoiceStatus(row.status) && daysUntilDue !== null) {
    if (daysUntilDue < 0) dueState = 'overdue';
    else if (daysUntilDue <= 14) dueState = 'due_soon';
  }
  const entityId = cleanEntityId(row.entity_id || invoice.entityId || 'wawco');
  const entity = publicEntity(entityId);
  const reportingEntityId = cleanReportingEntityId(row.reporting_entity_id || invoice.reportingEntityId || (invoice.payeeReportingScope && invoice.payeeReportingScope !== 'private' ? invoice.payeeReportingScope : '') || entityId, entityId);
  const reportingEntity = publicEntity(reportingEntityId);
  return {
    id: row.id,
    entityId,
    entityLabel: entity.label,
    entityName: entity.name,
    reportingEntityId,
    reportingEntityLabel: reportingEntity.label,
    reportingEntityName: reportingEntity.name,
    visibilityState: cleanVisibilityState(row.visibility_state || invoice.visibilityState || 'active'),
    isTest: row.is_test === true || invoice.isTest === true,
    invoiceNumber: row.invoice_number,
    status: row.status || 'draft',
    clientLabel: row.client_label || invoiceClientLabel(invoice) || 'Untitled client',
    invoiceDate: dashboardDate(row.invoice_date || invoice.invoiceDate),
    dueDate,
    month: dashboardMonth(row.invoice_date || invoice.invoiceDate),
    amountCents: Number(row.total_cents || invoice.totals?.totalCents || 0),
    paymentStatus: cleanSingleLine(row.payment_status || invoice.paymentStatus || 'none', 40) || 'none',
    paymentMode: cleanSingleLine(row.payment_mode, 20),
    paymentRequestStatus: cleanSingleLine(row.payment_request_status, 40),
    paymentExpiresAt: row.payment_expires_at || '',
    paymentUpdatedAt: row.payment_updated_at || '',
    updatedAt: row.updated_at || '',
    createdBy: row.created_by_email || '',
    dueState,
    daysUntilDue,
  };
}

function sumCents(items) {
  return items.reduce((sum, item) => sum + Number(item.amountCents || item.totalCents || 0), 0);
}

function emptyImportedFinance({ hostedInvoices, month }) {
  return {
    generatedAt: new Date().toISOString(),
    month,
    sources: {
      hostedInvoiceStore: 'Neon fin_invoices',
      financeSnapshot: 'none',
      mercurySnapshotDir: '',
      mercuryManifestPath: '',
      recurringPath: '',
      cardLabelsPath: '',
      invoiceSource: 'hosted Fin invoices',
    },
    metrics: {
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
      hostedInvoiceOpenCents: hostedInvoices.openReceivablesCents,
      hostedInvoiceReadyCents: hostedInvoices.readyForReviewCents,
      hostedInvoiceOverdueCents: hostedInvoices.overdueCents,
      localInvoiceOpenCents: hostedInvoices.openReceivablesCents,
    },
    mercury: {
      month,
      snapshot: { dir: '', manifestPath: '', generatedAt: '', errors: [] },
      accounts: [],
      cards: [],
      activeCards: [],
      totalAvailableBalanceCents: 0,
      totalCurrentBalanceCents: 0,
      snapshotMonths: [],
      transactionCount: 0,
      inflowCents: 0,
      outflowCents: 0,
      netCents: 0,
      spendByCounterparty: [],
      spendByKind: [],
      spendByCategory: [],
      cardSpend: [],
      cardSpendCents: 0,
      cardTransactions: [],
      observedCardExpenses: {
        expenses: [],
        batches: [],
        fundingTransfers: [],
        totalExpenseCents: 0,
        possiblePersonalFundedCents: 0,
        unmatchedExpenseCents: 0,
      },
      recentTransactions: [],
      invoices: [],
      invoiceSummary: [],
    },
    recurring: {
      path: '',
      fileExists: false,
      updatedAt: '',
      monthlyCents: 0,
      currentMonthlyCents: 0,
      tentativeMonthlyCents: 0,
      knownCount: 0,
      unknownCount: 0,
      tentativeCount: 0,
      byCategory: [],
      items: [],
      observations: [],
      notes: [],
      error: '',
      validationWarnings: [],
    },
  };
}



function financeImportRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    schemaVersion: row.schema_version,
    month: row.month,
    label: row.label,
    data: parseStoredInvoice(row.data_json) || {},
    sourceSummary: parseStoredInvoice(row.source_summary_json) || {},
    contentSha256: row.content_sha256 || '',
    stableContentSha256: row.stable_content_sha256 || row.stableContentSha256 || '',
    validatorVersion: row.validator_version || '',
    validationAudit: parseStoredInvoice(row.validation_audit_json) || {},
    importedAt: row.imported_at || row.importedAt || '',
    importedActorType: row.imported_actor_type || row.importedActorType || 'user',
    importedActorLabel: row.imported_actor_label || row.importedActorLabel || '',
    importedKeyId: row.imported_key_id || row.importedKeyId || '',
  };
}

function cleanSystemKeyId(value) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,78}[A-Za-z0-9]$/.test(text)) throw makeError(400, 'System import key id is invalid.');
  return text;
}

function systemActorIdentity(actor = {}) {
  const keyId = cleanSystemKeyId(actor.keyId || 'system');
  const emailSafeKey = keyId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'system';
  const email = `system+fin-import-${emailSafeKey}@whatarewecapableof.com`;
  const name = cleanSingleLine(actor.label || `Fin system import ${keyId}`, 120);
  return {
    id: crypto.createHash('sha256').update(`system-finance-import:${keyId}`).digest('hex').slice(0, 32),
    email,
    name,
    role: 'system',
    keyId,
  };
}

async function ensureSystemImportActor(actor = {}) {
  await ensureSchema();
  const db = sql();
  const identity = systemActorIdentity(actor);
  const rows = await db`
    INSERT INTO fin_users (id, email, name, role, active, google_subject, picture, created_at, updated_at, last_login_at)
    VALUES (${identity.id}, ${identity.email}, ${identity.name}, ${identity.role}, TRUE, NULL, '', now(), now(), now())
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      active = TRUE,
      updated_at = now(),
      last_login_at = now()
    RETURNING id, email, name, role, active
  `;
  return { ...rows[0], keyId: identity.keyId };
}

async function insertFinanceImport({ actorUserId, actorType = 'user', actorLabel = '', keyId = '', nonce = '', bodySha256 = '', input = {}, noOpIfDuplicate = false }) {
  if (!financeImportsEnabled()) throw makeError(403, 'Finance dashboard imports are disabled.');
  const normalized = normalizeFinanceImport(input);
  const stableContentSha256 = normalized.stableContentSha256 || stableFinanceImportContentSha256(normalized.data);
  const db = sql();

  async function findExistingStableImport() {
    const existing = await db`
      SELECT id, schema_version, month, label, data_json, source_summary_json,
        content_sha256, stable_content_sha256, validator_version, validation_audit_json,
        imported_actor_type, imported_actor_label, imported_key_id, imported_at::text AS imported_at
      FROM fin_finance_dashboard_imports
      WHERE deleted_at IS NULL AND month = ${normalized.month} AND stable_content_sha256 = ${stableContentSha256}
      ORDER BY imported_at DESC
      LIMIT 1
    `;
    if (existing[0]) return financeImportRow(existing[0]);

    const legacyRows = await db`
      SELECT id, schema_version, month, label, data_json, source_summary_json,
        content_sha256, stable_content_sha256, validator_version, validation_audit_json,
        imported_actor_type, imported_actor_label, imported_key_id, imported_at::text AS imported_at
      FROM fin_finance_dashboard_imports
      WHERE deleted_at IS NULL AND month = ${normalized.month} AND stable_content_sha256 = ''
      ORDER BY imported_at DESC
      LIMIT 20
    `;
    return legacyRows.map(financeImportRow).find((row) => stableFinanceImportContentSha256(row.data) === stableContentSha256) || null;
  }

  if (noOpIfDuplicate) {
    const existing = await findExistingStableImport();
    if (existing) {
      return {
        skipped: true,
        reason: 'duplicate-content',
        import: summarizeFinanceImport({ ...existing, stableContentSha256 }),
      };
    }
  }

  const id = crypto.randomUUID();
  const actorTypeValue = cleanSingleLine(actorType, 40);
  const insertRow = noOpIfDuplicate && actorTypeValue === 'system'
    ? await db`
      INSERT INTO fin_finance_dashboard_imports (
        id, schema_version, month, label, data_json, source_summary_json,
        content_sha256, stable_content_sha256, validator_version, validation_audit_json, imported_by_user_id,
        imported_actor_type, imported_actor_label, imported_key_id, imported_nonce, imported_body_sha256,
        imported_at
      ) VALUES (
        ${id}, ${normalized.schemaVersion}, ${normalized.month}, ${normalized.label},
        ${JSON.stringify(normalized.data)}::jsonb, ${JSON.stringify(normalized.sourceSummary)}::jsonb,
        ${normalized.contentSha256}, ${stableContentSha256}, ${normalized.validatorVersion}, ${JSON.stringify(normalized.validationAudit)}::jsonb,
        ${actorUserId}, ${actorTypeValue}, ${cleanSingleLine(actorLabel, 120)}, ${cleanSingleLine(keyId, 80)},
        ${cleanSingleLine(nonce, 140)}, ${cleanSingleLine(bodySha256, 64)}, now()
      )
      ON CONFLICT (month, stable_content_sha256) WHERE deleted_at IS NULL AND imported_actor_type = 'system' AND stable_content_sha256 <> '' DO NOTHING
      RETURNING id, schema_version, month, label, content_sha256, stable_content_sha256, validator_version,
        imported_actor_type, imported_actor_label, imported_key_id, imported_at::text AS imported_at
    `
    : await db`
      INSERT INTO fin_finance_dashboard_imports (
        id, schema_version, month, label, data_json, source_summary_json,
        content_sha256, stable_content_sha256, validator_version, validation_audit_json, imported_by_user_id,
        imported_actor_type, imported_actor_label, imported_key_id, imported_nonce, imported_body_sha256,
        imported_at
      ) VALUES (
        ${id}, ${normalized.schemaVersion}, ${normalized.month}, ${normalized.label},
        ${JSON.stringify(normalized.data)}::jsonb, ${JSON.stringify(normalized.sourceSummary)}::jsonb,
        ${normalized.contentSha256}, ${stableContentSha256}, ${normalized.validatorVersion}, ${JSON.stringify(normalized.validationAudit)}::jsonb,
        ${actorUserId}, ${actorTypeValue}, ${cleanSingleLine(actorLabel, 120)}, ${cleanSingleLine(keyId, 80)},
        ${cleanSingleLine(nonce, 140)}, ${cleanSingleLine(bodySha256, 64)}, now()
      )
      RETURNING id, schema_version, month, label, content_sha256, stable_content_sha256, validator_version,
        imported_actor_type, imported_actor_label, imported_key_id, imported_at::text AS imported_at
    `;

  if (!insertRow[0] && noOpIfDuplicate) {
    const existing = await findExistingStableImport();
    if (existing) {
      return {
        skipped: true,
        reason: 'duplicate-content',
        import: summarizeFinanceImport({ ...existing, stableContentSha256 }),
      };
    }
  }

  if (!insertRow[0]) throw makeError(409, 'Duplicate finance import content already exists.');
  return {
    skipped: false,
    reason: '',
    import: summarizeFinanceImport(financeImportRow({ ...insertRow[0], data_json: normalized.data, source_summary_json: normalized.sourceSummary, validation_audit_json: normalized.validationAudit })),
  };
}

async function createFinanceImport(user, input = {}) {
  const currentUser = await ensureUser(user);
  if (currentUser.role !== 'admin') throw makeError(403, 'Only Fin admins can import finance dashboard summaries.');
  const result = await insertFinanceImport({
    actorUserId: currentUser.id,
    actorType: 'user',
    actorLabel: currentUser.email,
    input,
  });
  return result.import;
}

async function claimFinanceSystemImportNonce(auth = {}) {
  await ensureSchema();
  const keyId = cleanSystemKeyId(auth.keyId);
  const nonce = cleanSingleLine(auth.nonce, 140);
  if (!/^[A-Za-z0-9._~-]{16,128}$/.test(nonce)) throw makeError(401, 'System import nonce is invalid.');
  const bodySha256 = cleanSingleLine(auth.bodySha256, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(bodySha256)) throw makeError(401, 'System import body SHA-256 is invalid.');
  const ttlSeconds = Math.max(60, Math.min(24 * 60 * 60, Number(auth.nonceTtlSeconds || 15 * 60) || 15 * 60));
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const db = sql();
  await db`DELETE FROM fin_finance_system_import_nonces WHERE expires_at < now()`;
  const rows = await db`
    INSERT INTO fin_finance_system_import_nonces (key_id, nonce, body_sha256, observed_at, expires_at)
    VALUES (${keyId}, ${nonce}, ${bodySha256}, now(), ${expiresAt})
    ON CONFLICT (key_id, nonce) DO NOTHING
    RETURNING nonce
  `;
  if (!rows[0]) throw makeError(409, 'System import nonce has already been used.');
  return true;
}

async function createSystemFinanceImport(actor = {}, input = {}, auth = {}) {
  const systemUser = await ensureSystemImportActor(actor);
  return insertFinanceImport({
    actorUserId: systemUser.id,
    actorType: 'system',
    actorLabel: systemUser.name,
    keyId: auth.keyId || systemUser.keyId,
    nonce: auth.nonce || '',
    bodySha256: auth.bodySha256 || '',
    input,
    noOpIfDuplicate: true,
  });
}

async function listFinanceImports(user) {
  const currentUser = await ensureUser(user);
  if (currentUser.role !== 'admin') throw makeError(403, 'Only Fin admins can list finance dashboard imports.');
  const db = sql();
  const rows = await db`
    SELECT id, schema_version, month, label, content_sha256, stable_content_sha256, validator_version,
      imported_actor_type, imported_actor_label, imported_key_id, imported_at::text AS imported_at
    FROM fin_finance_dashboard_imports
    WHERE deleted_at IS NULL
    ORDER BY imported_at DESC
    LIMIT 50
  `;
  return rows.map((row) => summarizeFinanceImport(financeImportRow(row)));
}

async function deleteFinanceImport(user, id, reason = '') {
  const currentUser = await ensureUser(user);
  if (currentUser.role !== 'admin') throw makeError(403, 'Only Fin admins can delete finance dashboard imports.');
  const cleanId = cleanSingleLine(id, 80);
  if (!cleanId) throw makeError(400, 'Finance import id is required.');
  const db = sql();
  const rows = await db`
    UPDATE fin_finance_dashboard_imports
    SET deleted_at = now(), deleted_by_user_id = ${currentUser.id}, delete_reason = ${cleanSingleLine(reason, 240)}
    WHERE id = ${cleanId} AND deleted_at IS NULL
    RETURNING id
  `;
  return Boolean(rows[0]);
}

async function financeImportMonths(currentUser) {
  if (currentUser.role !== 'admin') return [];
  const db = sql();
  const rows = await db`
    SELECT DISTINCT month
    FROM fin_finance_dashboard_imports
    WHERE deleted_at IS NULL AND month <> ''
  `;
  return rows.map((row) => cleanSingleLine(row.month, 7)).filter((month) => /^\d{4}-\d{2}$/.test(month));
}

async function latestFinanceImportForSummary(currentUser, month = '') {
  if (currentUser.role !== 'admin') return null;
  const db = sql();
  const cleanMonth = cleanSingleLine(month, 7);
  const rows = cleanMonth
    ? await db`
      SELECT id, schema_version, month, label, data_json, source_summary_json,
        content_sha256, stable_content_sha256, validator_version, validation_audit_json,
        imported_actor_type, imported_actor_label, imported_key_id, imported_at::text AS imported_at
      FROM fin_finance_dashboard_imports
      WHERE deleted_at IS NULL AND month = ${cleanMonth}
      ORDER BY imported_at DESC
      LIMIT 1
    `
    : await db`
      SELECT id, schema_version, month, label, data_json, source_summary_json,
        content_sha256, stable_content_sha256, validator_version, validation_audit_json,
        imported_actor_type, imported_actor_label, imported_key_id, imported_at::text AS imported_at
      FROM fin_finance_dashboard_imports
      WHERE deleted_at IS NULL
      ORDER BY imported_at DESC
      LIMIT 1
    `;
  return financeImportRow(rows[0]);
}

function mergeImportedFinance(base, importedRecord, hostedInvoices, month) {
  if (!importedRecord?.data) return { imported: base, importSummary: null };
  const data = importedRecord.data;
  const metrics = {
    ...base.metrics,
    ...(data.metrics || {}),
    mercuryInvoiceOpenCents: 0,
    hostedInvoiceOpenCents: hostedInvoices.openReceivablesCents,
    hostedInvoiceReadyCents: hostedInvoices.readyForReviewCents,
    hostedInvoiceOverdueCents: hostedInvoices.overdueCents,
    localInvoiceOpenCents: hostedInvoices.openReceivablesCents,
  };
  return {
    imported: {
      ...base,
      generatedAt: data.generatedAt || base.generatedAt,
      month: data.month || month,
      sources: {
        ...base.sources,
        ...(data.sources || {}),
        hostedInvoiceStore: 'Neon fin_invoices',
        invoiceSource: 'hosted Fin invoices',
      },
      metrics,
      mercury: {
        ...base.mercury,
        ...(data.mercury || {}),
        invoices: data.mercury?.invoices || [],
        invoiceSummary: data.mercury?.invoiceSummary || [],
      },
      recurring: {
        ...base.recurring,
        ...(data.recurring || {}),
      },
      exceptions: Array.isArray(data.exceptions) ? data.exceptions : [],
    },
    importSummary: summarizeFinanceImport(importedRecord),
  };
}

async function financeSummary(user, options = {}) {
  await ensureSchema();
  const currentUser = userIdentity(user);
  const db = sql();
  const scope = currentUser.role === 'admin' ? 'workspace' : 'own_drafts';
  const visibleEntityIds = userVisibleEntityIds(currentUser);
  const rawRows = currentUser.role === 'admin'
    ? await db`
      SELECT inv.id, inv.entity_id, inv.reporting_entity_id, inv.visibility_state, inv.visibility_reason,
        inv.is_test, inv.test_reason, inv.dashboard_excluded, inv.invoice_number, inv.status, inv.client_label,
        inv.invoice_date::text AS invoice_date, inv.due_date::text AS due_date,
        inv.total_cents, inv.payment_status, inv.current_payment_request_id,
        inv.paid_at::text AS paid_at, inv.payment_updated_at::text AS payment_updated_at,
        inv.updated_at::text AS updated_at, usr.email AS created_by_email, inv.data_json,
        pay.stripe_mode AS payment_mode, pay.status AS payment_request_status,
        pay.expires_at::text AS payment_expires_at, pay.updated_at::text AS payment_updated_at
      FROM fin_invoices inv
      JOIN fin_users usr ON usr.id = inv.created_by_user_id
      LEFT JOIN LATERAL (
        SELECT stripe_mode, status, expires_at, updated_at
        FROM fin_invoice_payment_requests pr
        WHERE pr.invoice_id = inv.id AND pr.deleted_at IS NULL
        ORDER BY pr.updated_at DESC
        LIMIT 1
      ) pay ON true
      WHERE inv.deleted_at IS NULL
      ORDER BY inv.updated_at DESC
      LIMIT 500
    `
    : await db`
      SELECT inv.id, inv.entity_id, inv.reporting_entity_id, inv.visibility_state, inv.visibility_reason,
        inv.is_test, inv.test_reason, inv.dashboard_excluded, inv.invoice_number, inv.status, inv.client_label,
        inv.invoice_date::text AS invoice_date, inv.due_date::text AS due_date,
        inv.total_cents, inv.payment_status, inv.current_payment_request_id,
        inv.paid_at::text AS paid_at, inv.payment_updated_at::text AS payment_updated_at,
        inv.updated_at::text AS updated_at, usr.email AS created_by_email, inv.data_json,
        pay.stripe_mode AS payment_mode, pay.status AS payment_request_status,
        pay.expires_at::text AS payment_expires_at, pay.updated_at::text AS payment_updated_at
      FROM fin_invoices inv
      JOIN fin_users usr ON usr.id = inv.created_by_user_id
      LEFT JOIN LATERAL (
        SELECT stripe_mode, status, expires_at, updated_at
        FROM fin_invoice_payment_requests pr
        WHERE pr.invoice_id = inv.id AND pr.deleted_at IS NULL
        ORDER BY pr.updated_at DESC
        LIMIT 1
      ) pay ON true
      WHERE inv.deleted_at IS NULL AND inv.created_by_user_id = ${currentUser.id}
      ORDER BY inv.updated_at DESC
      LIMIT 500
    `;

  const entityOptions = invoiceEntities().filter((entity) => visibleEntityIds.includes(cleanEntityId(entity.id)));
  const requestedEntity = cleanSingleLine(options.entity || options.entityId || 'wawco', 40).toLowerCase();
  const entityFilter = requestedEntity === 'combined' ? 'combined' : cleanEntityId(requestedEntity || 'wawco');
  if (entityFilter !== 'combined' && !userCanAccessEntity(currentUser, entityFilter)) throw makeError(403, 'Finance entity is not available to this user.');
  const excludedRows = [];
  const excludedEntityRows = [];
  const visibleRows = [];
  for (const row of rawRows) {
    if (!userCanAccessInvoiceRow(currentUser, row)) {
      excludedEntityRows.push(row);
      continue;
    }
    const data = parseStoredInvoice(row.data_json) || {};
    const entityId = cleanEntityId(row.entity_id || data.entityId || 'wawco');
    const reportingEntityId = rowReportingEntityId(row);
    if (entityFilter !== 'combined' && reportingEntityId !== entityFilter) {
      excludedEntityRows.push(row);
      continue;
    }
    const excluded = row.visibility_state === 'hidden' || row.is_test === true || row.dashboard_excluded === true || data.payeeReportingScope === 'private' || data.excludeFromWawcoDashboard === true || data.dashboardExcluded === true;
    if (excluded) excludedRows.push(row);
    else visibleRows.push({ ...row, entity_id: entityId, reporting_entity_id: reportingEntityId });
  }

  const invoices = visibleRows.map(hostedInvoiceRow);
  const invoiceMonths = [...new Set(invoices.map((invoice) => invoice.month).filter(Boolean))].sort();
  const importMergeEnabled = financeImportsEnabled();
  const entitySupportsFinanceImports = entityFilter === 'wawco' || (entityFilter === 'combined' && visibleEntityIds.length === 1 && visibleEntityIds.includes('wawco'));
  const importMonths = importMergeEnabled && entitySupportsFinanceImports ? await financeImportMonths(currentUser) : [];
  const requestedMonth = cleanSingleLine(options.month, 7);
  if (requestedMonth && !/^\d{4}-\d{2}$/.test(requestedMonth)) throw makeError(400, 'Finance summary month must use YYYY-MM.');
  const months = [...new Set([...invoiceMonths, ...importMonths])].filter(Boolean).sort();
  const month = requestedMonth || latestDashboardMonth(months);
  const monthInvoices = invoices.filter((invoice) => !month || invoice.month === month);
  const openInvoices = invoices.filter((invoice) => isOpenInvoiceStatus(invoice.status));
  const overdue = openInvoices.filter((invoice) => invoice.dueState === 'overdue');
  const dueSoon = openInvoices.filter((invoice) => invoice.dueState === 'due_soon');
  const readyForReview = invoices.filter((invoice) => invoice.status === 'ready_for_review');
  const paymentLinked = invoices.filter((invoice) => invoice.paymentStatus && invoice.paymentStatus !== 'none');
  const paymentActive = invoices.filter((invoice) => ['link_ready', 'processing'].includes(invoice.paymentStatus) || ['active', 'processing'].includes(invoice.paymentRequestStatus));
  const paymentPaid = invoices.filter((invoice) => invoice.paymentStatus === 'paid' || invoice.paymentRequestStatus === 'paid');
  const paymentSummary = dashboardPaymentSummary(invoices);
  const summary = dashboardStatusSummary(invoices);
  const monthSummary = dashboardStatusSummary(monthInvoices);
  const byStatus = summary.map((row) => ({
    status: row.status,
    invoiceCount: row.invoiceCount,
    totalCents: row.totalCents,
  }));
  const monthBuckets = [...new Set(invoices.map((invoice) => invoice.month).filter(Boolean))]
    .sort()
    .map((key) => {
      const rows = invoices.filter((invoice) => invoice.month === key);
      return { month: key, invoiceCount: rows.length, totalCents: sumCents(rows) };
    });

  const hostedInvoices = {
    source: 'hosted_fin',
    scope,
    entityFilter,
    entityLabel: entityFilter === 'combined' ? (visibleEntityIds.length === 1 ? 'Combined (WAWCO visible)' : 'Combined') : publicEntity(entityFilter).label,
    visibleCount: invoices.length,
    excludedEntityCount: excludedEntityRows.length,
    excludedPrivatePayeeCount: excludedRows.length,
    invoices: invoices.slice(0, 100),
    monthInvoices,
    summary,
    monthSummary,
    monthBuckets,
    openReceivablesCents: sumCents(openInvoices),
    overdue,
    overdueCents: sumCents(overdue),
    dueSoon,
    dueSoonCents: sumCents(dueSoon),
    readyForReviewCount: readyForReview.length,
    readyForReviewCents: sumCents(readyForReview),
    paymentSummary,
    paymentLinkedCount: paymentLinked.length,
    paymentLinkedCents: sumCents(paymentLinked),
    paymentActiveCount: paymentActive.length,
    paymentActiveCents: sumCents(paymentActive),
    paymentPaidCount: paymentPaid.length,
    paymentPaidCents: sumCents(paymentPaid),
    lastUpdatedAt: invoices[0]?.updatedAt || rawRows[0]?.updated_at || '',
  };

  const baseImported = emptyImportedFinance({ hostedInvoices, month });
  const importedRecord = importMergeEnabled && entitySupportsFinanceImports && currentUser.role === 'admin' ? await latestFinanceImportForSummary(currentUser, month) : null;
  const { imported, importSummary } = mergeImportedFinance(baseImported, importedRecord, hostedInvoices, month);
  const exceptions = [...(imported.exceptions || [])];
  if (!importSummary) {
    exceptions.push({
      severity: 'watch',
      label: 'No hosted Mercury or Stripe summary imported',
      detail: 'Live Fin is showing hosted invoice records now. Cash movement, card spend, recurring stack, and recent transactions need a separately approved read/import path.',
    });
  }
  if (hostedInvoices.excludedPrivatePayeeCount) {
    exceptions.push({
      severity: 'keep',
      label: 'Private payee invoices excluded',
      detail: `${hostedInvoices.excludedPrivatePayeeCount} private-payee invoice${hostedInvoices.excludedPrivatePayeeCount === 1 ? '' : 's'} excluded from ${hostedInvoices.entityLabel || 'current'} totals.`,
    });
  }
  if (hostedInvoices.overdue.length) {
    exceptions.push({
      severity: 'watch',
      label: 'Hosted invoices overdue',
      detail: `${hostedInvoices.overdue.length} open hosted invoice${hostedInvoices.overdue.length === 1 ? '' : 's'} past due.`,
    });
  }

  return {
    scope,
    permissions: { canImportFinanceSummary: currentUser.role === 'admin' },
    generatedAt: imported.generatedAt,
    month,
    months,
    entityFilter,
    entityLabel: hostedInvoices.entityLabel,
    entities: [{ id: 'combined', label: 'Combined', name: visibleEntityIds.length === 1 ? 'Combined (WAWCO visible)' : 'Combined' }, ...entityOptions],
    invoiceCount: invoices.length,
    totalCents: sumCents(invoices),
    readyForReviewCents: hostedInvoices.readyForReviewCents,
    excludedEntityCount: hostedInvoices.excludedEntityCount,
    excludedPrivatePayeeCount: hostedInvoices.excludedPrivatePayeeCount,
    lastUpdatedAt: hostedInvoices.lastUpdatedAt,
    latestFinanceImport: importSummary,
    byStatus,
    sources: imported.sources,
    metrics: imported.metrics,
    mercury: imported.mercury,
    recurring: imported.recurring,
    hostedInvoices,
    localInvoices: {
      available: false,
      invoices,
      monthInvoices,
      summary,
      monthSummary,
      excludedEntityCount: hostedInvoices.excludedEntityCount,
      excludedPrivatePayeeCount: hostedInvoices.excludedPrivatePayeeCount,
      error: '',
    },
    exceptions,
  };
}

function recurringTemplateFromRow(row) {
  if (!row) return null;
  const invoiceTemplate = parseStoredInvoice(row.invoice_template_json) || {};
  const emailTemplate = parseStoredInvoice(row.email_template_json) || {};
  const entityId = cleanEntityId(row.entity_id || invoiceTemplate.entityId || 'wawco');
  const reportingEntityId = cleanReportingEntityId(row.reporting_entity_id || invoiceTemplate.reportingEntityId || entityId, entityId);
  return {
    id: row.id,
    status: cleanSingleLine(row.status || 'active', 40).toLowerCase() === 'paused' ? 'paused' : 'active',
    label: cleanSingleLine(row.label, 160),
    entityId,
    entity: publicEntity(entityId),
    reportingEntityId,
    reportingEntity: publicEntity(reportingEntityId),
    cadence: cleanSingleLine(row.cadence || 'weekly', 40).toLowerCase(),
    intervalCount: Number(row.interval_count || 1),
    dayOfWeek: Number(row.day_of_week || 1),
    nextRunDate: row.next_run_date || '',
    dueDays: Number(row.due_days || 0),
    sendMode: cleanSingleLine(row.send_mode || 'prepare_for_approval', 40).toLowerCase(),
    paymentPageMode: cleanSingleLine(row.payment_page_mode || 'manual_after_approval', 40).toLowerCase(),
    invoiceTemplate,
    emailTemplate,
    safeSummary: parseStoredInvoice(row.safe_summary_json) || {},
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function recurringRunFromRow(row, template = {}) {
  if (!row) return null;
  return {
    id: row.id,
    templateId: row.template_id,
    templateLabel: template.label || '',
    runDate: row.run_date || '',
    periodStart: row.period_start || '',
    periodEnd: row.period_end || '',
    status: cleanSingleLine(row.status || 'created', 40).toLowerCase(),
    invoiceId: row.invoice_id || '',
    paymentRequestId: row.payment_request_id || '',
    sendMode: cleanSingleLine(row.send_mode || template.sendMode || 'prepare_for_approval', 40).toLowerCase(),
    safeSummary: parseStoredInvoice(row.safe_summary_json) || {},
    lastError: cleanSingleLine(row.last_error, 500),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function ensureRecurringAdmin(currentUser) {
  if (currentUser.role !== 'admin') throw makeError(403, 'Only Fin admins can manage recurring invoices.');
}

async function listRecurringInvoiceTemplates(user, options = {}) {
  const currentUser = await ensureUser(user);
  ensureRecurringAdmin(currentUser);
  const db = sql();
  const includePaused = cleanBoolean(options.includePaused ?? options.include_paused);
  const rows = includePaused
    ? await db`
      SELECT id, entity_id, reporting_entity_id, status, label, cadence, interval_count, day_of_week, next_run_date::text AS next_run_date,
        due_days, send_mode, payment_page_mode, invoice_template_json, email_template_json, safe_summary_json, created_at::text AS created_at, updated_at::text AS updated_at
      FROM fin_recurring_invoice_templates
      WHERE deleted_at IS NULL
      ORDER BY next_run_date NULLS LAST, updated_at DESC
      LIMIT 200
    `
    : await db`
      SELECT id, entity_id, reporting_entity_id, status, label, cadence, interval_count, day_of_week, next_run_date::text AS next_run_date,
        due_days, send_mode, payment_page_mode, invoice_template_json, email_template_json, safe_summary_json, created_at::text AS created_at, updated_at::text AS updated_at
      FROM fin_recurring_invoice_templates
      WHERE deleted_at IS NULL AND status = 'active'
      ORDER BY next_run_date NULLS LAST, updated_at DESC
      LIMIT 200
    `;
  return rows.map(recurringTemplateFromRow)
    .filter((template) => userCanAccessEntity(currentUser, template.entityId) && userCanAccessEntity(currentUser, template.reportingEntityId))
    .map((template) => ({ ...template, listItem: recurringTemplateListItem(template) }));
}

async function getRecurringInvoiceTemplate(user, id) {
  const currentUser = await ensureUser(user);
  ensureRecurringAdmin(currentUser);
  const db = sql();
  const rows = await db`
    SELECT id, entity_id, reporting_entity_id, status, label, cadence, interval_count, day_of_week, next_run_date::text AS next_run_date,
      due_days, send_mode, payment_page_mode, invoice_template_json, email_template_json, safe_summary_json, created_at::text AS created_at, updated_at::text AS updated_at
    FROM fin_recurring_invoice_templates
    WHERE id = ${id} AND deleted_at IS NULL
    LIMIT 1
  `;
  const template = recurringTemplateFromRow(rows[0]);
  if (!template || !userCanAccessEntity(currentUser, template.entityId) || !userCanAccessEntity(currentUser, template.reportingEntityId)) return null;
  return { ...template, listItem: recurringTemplateListItem(template) };
}

async function createRecurringInvoiceTemplate(user, input = {}) {
  const currentUser = await ensureUser(user);
  ensureRecurringAdmin(currentUser);
  const id = crypto.randomUUID();
  const template = normalizeRecurringInvoiceTemplate(input, { id });
  enforceEntityAccess(currentUser, template.entityId, 'Recurring invoice issuing entity is not available to this user.');
  enforceEntityAccess(currentUser, template.reportingEntityId, 'Recurring invoice reporting entity is not available to this user.');
  const db = sql();
  const summary = recurringTemplateSafeSummary(template);
  const rows = await db`
    INSERT INTO fin_recurring_invoice_templates (
      id, entity_id, reporting_entity_id, status, label, cadence, interval_count, day_of_week, next_run_date, due_days,
      send_mode, payment_page_mode, invoice_template_json, email_template_json, safe_summary_json, created_by_user_id, updated_by_user_id, created_at, updated_at
    ) VALUES (
      ${id}, ${template.entityId}, ${template.reportingEntityId}, ${template.status}, ${template.label}, ${template.cadence}, ${template.intervalCount}, ${template.dayOfWeek}, ${template.nextRunDate}, ${template.dueDays},
      ${template.sendMode}, ${template.paymentPageMode}, ${JSON.stringify(template.invoiceTemplate)}::jsonb, ${JSON.stringify(template.emailTemplate)}::jsonb, ${JSON.stringify(summary)}::jsonb, ${currentUser.id}, ${currentUser.id}, now(), now()
    )
    RETURNING id, entity_id, reporting_entity_id, status, label, cadence, interval_count, day_of_week, next_run_date::text AS next_run_date,
      due_days, send_mode, payment_page_mode, invoice_template_json, email_template_json, safe_summary_json, created_at::text AS created_at, updated_at::text AS updated_at
  `;
  return { ...recurringTemplateFromRow(rows[0]), listItem: recurringTemplateListItem(template) };
}

async function updateRecurringInvoiceTemplate(user, id, input = {}) {
  const currentUser = await ensureUser(user);
  ensureRecurringAdmin(currentUser);
  const existing = await getRecurringInvoiceTemplate(user, id);
  if (!existing) return null;
  const template = normalizeRecurringInvoiceTemplate({ ...existing, ...input, id, invoiceTemplate: input.invoiceTemplate || input.invoice || existing.invoiceTemplate, emailTemplate: input.emailTemplate || input.email || existing.emailTemplate }, { id });
  if (template.entityId !== existing.entityId) throw makeError(409, 'Recurring invoice entity cannot be changed after creation. Create a new template instead.');
  enforceEntityAccess(currentUser, template.entityId, 'Recurring invoice issuing entity is not available to this user.');
  enforceEntityAccess(currentUser, template.reportingEntityId, 'Recurring invoice reporting entity is not available to this user.');
  const db = sql();
  const summary = recurringTemplateSafeSummary(template);
  const rows = await db`
    UPDATE fin_recurring_invoice_templates SET
      reporting_entity_id = ${template.reportingEntityId}, status = ${template.status}, label = ${template.label}, cadence = ${template.cadence},
      interval_count = ${template.intervalCount}, day_of_week = ${template.dayOfWeek}, next_run_date = ${template.nextRunDate}, due_days = ${template.dueDays},
      send_mode = ${template.sendMode}, payment_page_mode = ${template.paymentPageMode}, invoice_template_json = ${JSON.stringify(template.invoiceTemplate)}::jsonb,
      email_template_json = ${JSON.stringify(template.emailTemplate)}::jsonb, safe_summary_json = ${JSON.stringify(summary)}::jsonb, updated_by_user_id = ${currentUser.id}, updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, entity_id, reporting_entity_id, status, label, cadence, interval_count, day_of_week, next_run_date::text AS next_run_date,
      due_days, send_mode, payment_page_mode, invoice_template_json, email_template_json, safe_summary_json, created_at::text AS created_at, updated_at::text AS updated_at
  `;
  const updated = recurringTemplateFromRow(rows[0]);
  return updated ? { ...updated, listItem: recurringTemplateListItem(updated) } : null;
}

async function deleteRecurringInvoiceTemplate(user, id) {
  const currentUser = await ensureUser(user);
  ensureRecurringAdmin(currentUser);
  const existing = await getRecurringInvoiceTemplate(user, id);
  if (!existing) return false;
  const db = sql();
  await db`UPDATE fin_recurring_invoice_templates SET deleted_at = now(), updated_by_user_id = ${currentUser.id}, updated_at = now() WHERE id = ${id} AND deleted_at IS NULL`;
  return true;
}

async function listRecurringInvoiceRuns(user, templateId, options = {}) {
  const currentUser = await ensureUser(user);
  ensureRecurringAdmin(currentUser);
  const template = await getRecurringInvoiceTemplate(user, templateId);
  if (!template) return [];
  const db = sql();
  const rows = await db`
    SELECT id, template_id, run_date::text AS run_date, period_start::text AS period_start, period_end::text AS period_end,
      status, invoice_id, payment_request_id, send_mode, safe_summary_json, last_error, created_at::text AS created_at, updated_at::text AS updated_at
    FROM fin_recurring_invoice_runs
    WHERE template_id = ${templateId} AND deleted_at IS NULL
    ORDER BY run_date DESC, updated_at DESC
    LIMIT ${Math.max(1, Math.min(200, Number(options.limit || 50)))}
  `;
  return rows.map((row) => recurringRunFromRow(row, template));
}

async function generateRecurringInvoiceRun(user, templateId, options = {}) {
  const currentUser = await ensureUser(user);
  ensureRecurringAdmin(currentUser);
  const template = await getRecurringInvoiceTemplate(user, templateId);
  if (!template) throw makeError(404, 'Recurring invoice template not found.');
  if (template.status !== 'active' && !cleanBoolean(options.allowPaused)) throw makeError(409, 'Recurring invoice template is paused.');
  const runDate = cleanRecurringDate(options.runDate || options.run_date || template.nextRunDate);
  const db = sql();
  const existingRows = await db`
    SELECT id, template_id, run_date::text AS run_date, period_start::text AS period_start, period_end::text AS period_end,
      status, invoice_id, payment_request_id, send_mode, safe_summary_json, last_error, created_at::text AS created_at, updated_at::text AS updated_at
    FROM fin_recurring_invoice_runs
    WHERE template_id = ${templateId} AND run_date = ${runDate} AND deleted_at IS NULL
    LIMIT 1
  `;
  if (existingRows[0]) return { template, run: recurringRunFromRow(existingRows[0], template), created: false };

  const built = buildRecurringInvoiceForRun(template, { runDate, invoiceStatus: options.invoiceStatus || options.invoice_status });
  const runId = crypto.randomUUID();
  const initialSummary = recurringRunSummary({ id: runId, templateId, runDate: built.runDate, periodStart: built.periodStart, periodEnd: built.periodEnd, status: 'creating', sendMode: template.sendMode }, template);
  const insertedRows = await db`
    INSERT INTO fin_recurring_invoice_runs (id, template_id, run_date, period_start, period_end, status, send_mode, safe_summary_json, created_by_user_id, created_at, updated_at)
    VALUES (${runId}, ${templateId}, ${built.runDate}, ${built.periodStart}, ${built.periodEnd}, 'creating', ${template.sendMode}, ${JSON.stringify(initialSummary)}::jsonb, ${currentUser.id}, now(), now())
    ON CONFLICT (template_id, run_date) WHERE deleted_at IS NULL DO NOTHING
    RETURNING id
  `;
  if (!insertedRows[0]) {
    const racedRows = await db`
      SELECT id, template_id, run_date::text AS run_date, period_start::text AS period_start, period_end::text AS period_end,
        status, invoice_id, payment_request_id, send_mode, safe_summary_json, last_error, created_at::text AS created_at, updated_at::text AS updated_at
      FROM fin_recurring_invoice_runs
      WHERE template_id = ${templateId} AND run_date = ${built.runDate} AND deleted_at IS NULL
      LIMIT 1
    `;
    if (racedRows[0]) return { template, run: recurringRunFromRow(racedRows[0], template), created: false };
  }

  try {
    const invoice = await createInvoice(user, {
      ...built.invoice,
      recurring: {
        ...(built.invoice.recurring || {}),
        templateId,
        runId,
      },
    });
    const nextRunDate = nextRecurringRunDate(template, built.runDate);
    const finalSummary = recurringRunSummary({
      id: runId,
      templateId,
      runDate: built.runDate,
      periodStart: built.periodStart,
      periodEnd: built.periodEnd,
      status: 'prepared',
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      sendMode: template.sendMode,
      emailStatus: 'not_sent',
      paymentPageStatus: 'requires_invoice_approval',
    }, template);
    const runRows = await db`
      UPDATE fin_recurring_invoice_runs SET status = 'prepared', invoice_id = ${invoice.id}, safe_summary_json = ${JSON.stringify(finalSummary)}::jsonb, updated_at = now()
      WHERE id = ${runId}
      RETURNING id, template_id, run_date::text AS run_date, period_start::text AS period_start, period_end::text AS period_end,
        status, invoice_id, payment_request_id, send_mode, safe_summary_json, last_error, created_at::text AS created_at, updated_at::text AS updated_at
    `;
    await db`
      UPDATE fin_recurring_invoice_templates SET next_run_date = CASE
        WHEN next_run_date IS NULL OR next_run_date <= ${built.runDate} THEN ${nextRunDate}
        ELSE next_run_date
      END, updated_at = now()
      WHERE id = ${templateId}
    `;
    return { template: await getRecurringInvoiceTemplate(user, templateId), run: recurringRunFromRow(runRows[0], template), invoice, created: true };
  } catch (error) {
    const failedSummary = recurringRunSummary({ id: runId, templateId, runDate: built.runDate, periodStart: built.periodStart, periodEnd: built.periodEnd, status: 'failed', sendMode: template.sendMode }, template);
    await db`UPDATE fin_recurring_invoice_runs SET status = 'failed', safe_summary_json = ${JSON.stringify(failedSummary)}::jsonb, last_error = ${cleanSingleLine(error.message, 500)}, updated_at = now() WHERE id = ${runId}`;
    throw error;
  }
}

module.exports = {
  ensureSchema,
  ensureUser,
  userEntityPermissions,
  numberingSettings,
  updateNumberingSettings,
  listEntities,
  invoiceEntityIdForUser,
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  listInvoices,
  createInvoice,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  listRecurringInvoiceTemplates,
  getRecurringInvoiceTemplate,
  createRecurringInvoiceTemplate,
  updateRecurringInvoiceTemplate,
  deleteRecurringInvoiceTemplate,
  listRecurringInvoiceRuns,
  generateRecurringInvoiceRun,
  latestPaymentRequestForInvoice,
  createInvoicePaymentRequest,
  createInvoiceCustomerPaymentPage,
  getPublicPaymentPage,
  createCustomerCheckoutPaymentRequest,
  activateCustomerCheckoutPaymentRequest,
  failCustomerCheckoutPaymentRequest,
  activateInvoicePaymentRequest,
  failInvoicePaymentRequest,
  processStripeEvent,
  createFinanceImport,
  createSystemFinanceImport,
  claimFinanceSystemImportNonce,
  listFinanceImports,
  deleteFinanceImport,
  financeSummary,
};
