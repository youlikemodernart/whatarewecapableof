const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const { normalizeInvoice, invoiceClientLabel, invoiceListItem } = require('./_invoice');
const { normalizeFinanceImport, stableFinanceImportContentSha256, summarizeFinanceImport } = require('./_finance_import');

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

  await db`CREATE TABLE IF NOT EXISTS fin_invoice_daily_sequences (
    date_key TEXT PRIMARY KEY,
    next_number INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await db`CREATE TABLE IF NOT EXISTS fin_invoices (
    id TEXT PRIMARY KEY,
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

  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none'`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS current_payment_request_id TEXT NOT NULL DEFAULT ''`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`;
  await db`ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS payment_updated_at TIMESTAMPTZ`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoices_updated_at_idx ON fin_invoices (updated_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoices_status_idx ON fin_invoices (status)`;
  await db`CREATE INDEX IF NOT EXISTS fin_invoices_created_by_idx ON fin_invoices (created_by_user_id)`;
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
  await db`CREATE INDEX IF NOT EXISTS fin_invoice_payment_requests_invoice_idx ON fin_invoice_payment_requests (invoice_id, updated_at DESC) WHERE deleted_at IS NULL`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS fin_invoice_payment_requests_active_invoice_mode_idx ON fin_invoice_payment_requests (invoice_id, stripe_mode) WHERE deleted_at IS NULL AND status IN ('creating', 'active', 'processing', 'paid')`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS fin_invoice_payment_requests_snapshot_mode_idx ON fin_invoice_payment_requests (invoice_id, invoice_snapshot_sha256, stripe_mode) WHERE deleted_at IS NULL`;

  await db`CREATE TABLE IF NOT EXISTS fin_stripe_events (
    stripe_event_id TEXT PRIMARY KEY,
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
  await db`CREATE INDEX IF NOT EXISTS fin_stripe_events_invoice_idx ON fin_stripe_events (invoice_id, received_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS fin_stripe_events_payment_request_idx ON fin_stripe_events (payment_request_id, received_at DESC)`;

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
  return {
    mode: 'client-date-daily',
    clientSource: 'client.invoiceCode, then client company/name',
    dateFormat: 'MMDDYY',
    sequenceScope: 'date-global',
    sequencePadding: padding,
    example: `SUBSTRATE-052626-${String(1).padStart(padding, '0')}`,
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
  return {
    mode: 'client-date-daily',
    clientSource: 'client.invoiceCode, then client company/name',
    dateFormat: 'MMDDYY',
    sequenceScope: 'date-global',
    sequencePadding: padding,
    example: `SUBSTRATE-052626-${String(1).padStart(padding, '0')}`,
  };
}

async function nextInvoiceNumber(invoice = {}) {
  await ensureSchema();
  const db = sql();
  const settings = await numberingSettings();
  const dateKey = dateKeyForInvoiceDate(invoice.invoiceDate);
  const clientCode = clientInvoiceCode(invoice);
  const padding = Number(settings.sequencePadding || 2);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const datePattern = `^[A-Z0-9]+-${dateKey}-(\\d+)$`;
    const dateLike = `%-${dateKey}-%`;
    const rows = await db`
      WITH existing AS (
        SELECT COALESCE(MAX((substring(invoice_number FROM ${datePattern}))::int), 0) AS max_sequence
        FROM fin_invoices
        WHERE invoice_number LIKE ${dateLike}
      ), allocated AS (
        INSERT INTO fin_invoice_daily_sequences (date_key, next_number, updated_at)
        SELECT ${dateKey}, existing.max_sequence + 2, now()
        FROM existing
        ON CONFLICT (date_key) DO UPDATE SET
          next_number = GREATEST(fin_invoice_daily_sequences.next_number, (SELECT max_sequence + 1 FROM existing)) + 1,
          updated_at = now()
        RETURNING next_number - 1 AS sequence
      )
      SELECT sequence FROM allocated
    `;
    const sequence = Number(rows[0]?.sequence || 1);
    const suffix = String(sequence).padStart(padding, '0');
    const candidate = `${clientCode}-${dateKey}-${suffix}`;
    const collision = await db`SELECT id FROM fin_invoices WHERE invoice_number = ${candidate} LIMIT 1`;
    if (!collision[0]) return candidate;
  }

  throw makeError(409, 'Could not allocate a unique invoice number for that date.');
}

async function listInvoices(user) {
  const currentUser = await ensureUser(user);
  const db = sql();
  const rows = currentUser.role === 'admin'
    ? await db`
      SELECT inv.id, inv.invoice_number, inv.status, inv.client_label,
        inv.invoice_date::text AS invoice_date, inv.due_date::text AS due_date,
        inv.total_cents, inv.updated_at::text AS updated_at, usr.email AS created_by_email
      FROM fin_invoices inv
      JOIN fin_users usr ON usr.id = inv.created_by_user_id
      WHERE inv.deleted_at IS NULL
      ORDER BY inv.updated_at DESC
      LIMIT 100
    `
    : await db`
      SELECT inv.id, inv.invoice_number, inv.status, inv.client_label,
        inv.invoice_date::text AS invoice_date, inv.due_date::text AS due_date,
        inv.total_cents, inv.updated_at::text AS updated_at, usr.email AS created_by_email
      FROM fin_invoices inv
      JOIN fin_users usr ON usr.id = inv.created_by_user_id
      WHERE inv.deleted_at IS NULL AND inv.created_by_user_id = ${currentUser.id}
      ORDER BY inv.updated_at DESC
      LIMIT 100
    `;
  return rows.map(invoiceListItem);
}

async function createInvoice(user, input = {}) {
  const currentUser = await ensureUser(user);
  const db = sql();
  const id = crypto.randomUUID();
  const invoiceDraft = normalizeInvoice({ ...input, id, invoiceNumber: '' }, { id, invoiceNumber: '' });
  if (currentUser.role !== 'admin' && ['approved', 'issued', 'paid', 'void'].includes(invoiceDraft.status)) {
    throw makeError(403, 'Only Fin admins can create approved, issued, paid, or void invoices.');
  }
  const invoiceNumber = await nextInvoiceNumber(invoiceDraft);
  const invoice = normalizeInvoice({ ...invoiceDraft, invoiceNumber }, { id, invoiceNumber });
  const label = invoiceClientLabel(invoice);
  const invoiceDate = nullableDate(invoice.invoiceDate);
  const dueDate = nullableDate(invoice.dueDate);
  const data = JSON.stringify(invoice);
  const startsApproved = ['approved', 'issued', 'paid'].includes(invoice.status);
  const startsIssued = ['issued', 'paid'].includes(invoice.status);
  const startsPaid = invoice.status === 'paid';
  const rows = await db`
    INSERT INTO fin_invoices (
      id, invoice_number, status, client_label, invoice_date, due_date, currency, project, created_by_user_id,
      approved_by_user_id, approved_at, issued_at, paid_at,
      subtotal_cents, discount_cents, taxable_cents, tax_cents, shipping_cents, total_cents, data_json, created_at, updated_at
    ) VALUES (
      ${id}, ${invoice.invoiceNumber}, ${invoice.status}, ${label}, ${invoiceDate}, ${dueDate}, ${invoice.currency}, ${invoice.project}, ${currentUser.id},
      ${startsApproved ? currentUser.id : null}, ${startsApproved ? new Date().toISOString() : null}, ${startsIssued ? new Date().toISOString() : null}, ${startsPaid ? new Date().toISOString() : null},
      ${invoice.totals.subtotalCents}, ${invoice.totals.discountCents}, ${invoice.totals.taxableCents}, ${invoice.totals.taxCents}, ${invoice.totals.shippingCents}, ${invoice.totals.totalCents}, ${data}::jsonb, now(), now()
    )
    RETURNING data_json
  `;
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${id}, ${currentUser.id}, 'created', 'Invoice draft created', '{}'::jsonb)`;
  return parseStoredInvoice(rows[0].data_json);
}

async function getInvoice(user, id) {
  const currentUser = await ensureUser(user);
  const db = sql();
  const rows = currentUser.role === 'admin'
    ? await db`SELECT data_json FROM fin_invoices WHERE id = ${id} AND deleted_at IS NULL`
    : await db`SELECT data_json FROM fin_invoices WHERE id = ${id} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL`;
  return parseStoredInvoice(rows[0]?.data_json);
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
  const invoice = normalizeInvoice({ ...existing, ...input, id, invoiceNumber: existing.invoiceNumber }, { id, invoiceNumber: existing.invoiceNumber });
  const label = invoiceClientLabel(invoice);
  const invoiceDate = nullableDate(invoice.invoiceDate);
  const dueDate = nullableDate(invoice.dueDate);
  const data = JSON.stringify(invoice);
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
        status = ${invoice.status}, client_label = ${label}, invoice_date = ${invoiceDate}, due_date = ${dueDate}, currency = ${invoice.currency}, project = ${invoice.project},
        approved_by_user_id = CASE WHEN ${invoice.status} = 'approved' THEN ${currentUser.id} ELSE approved_by_user_id END,
        approved_at = CASE WHEN ${invoice.status} = 'approved' AND approved_at IS NULL THEN now() ELSE approved_at END,
        issued_at = CASE WHEN ${invoice.status} = 'issued' AND issued_at IS NULL THEN now() ELSE issued_at END,
        subtotal_cents = ${invoice.totals.subtotalCents}, discount_cents = ${invoice.totals.discountCents}, taxable_cents = ${invoice.totals.taxableCents}, tax_cents = ${invoice.totals.taxCents}, shipping_cents = ${invoice.totals.shippingCents}, total_cents = ${invoice.totals.totalCents},
        data_json = ${data}::jsonb, updated_at = now()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING data_json
    `
    : await db`
      UPDATE fin_invoices SET
        status = ${invoice.status}, client_label = ${label}, invoice_date = ${invoiceDate}, due_date = ${dueDate}, currency = ${invoice.currency}, project = ${invoice.project},
        subtotal_cents = ${invoice.totals.subtotalCents}, discount_cents = ${invoice.totals.discountCents}, taxable_cents = ${invoice.totals.taxableCents}, tax_cents = ${invoice.totals.taxCents}, shipping_cents = ${invoice.totals.shippingCents}, total_cents = ${invoice.totals.totalCents},
        data_json = ${data}::jsonb, updated_at = now()
      WHERE id = ${id} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL
      RETURNING data_json
    `;
  if (!rows[0]) return null;
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${id}, ${currentUser.id}, 'updated', 'Invoice draft updated', '{}'::jsonb)`;
  return parseStoredInvoice(rows[0].data_json);
}

async function deleteInvoice(user, id) {
  const currentUser = await ensureUser(user);
  const db = sql();
  const rows = currentUser.role === 'admin'
    ? await db`UPDATE fin_invoices SET deleted_at = now(), updated_at = now() WHERE id = ${id} AND deleted_at IS NULL RETURNING id`
    : await db`UPDATE fin_invoices SET deleted_at = now(), updated_at = now() WHERE id = ${id} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL RETURNING id`;
  if (!rows[0]) return false;
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

function paymentRequestSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    invoiceId: row.invoice_id || row.invoiceId || '',
    invoiceNumber: row.invoice_number || row.invoiceNumber || '',
    snapshotSha256: row.invoice_snapshot_sha256 || row.snapshotSha256 || '',
    mode: row.stripe_mode || row.mode || 'test',
    status: row.status || 'none',
    amountCents: Number(row.amount_cents ?? row.amountCents ?? 0),
    currency: row.currency || 'USD',
    url: row.payment_url || row.url || '',
    urlKind: row.payment_url_kind || row.urlKind || 'checkout_session',
    checkoutSessionId: row.stripe_checkout_session_id || row.checkoutSessionId || '',
    paymentIntentId: row.stripe_payment_intent_id || row.paymentIntentId || '',
    customerId: row.stripe_customer_id || row.customerId || '',
    expiresAt: row.expires_at || row.expiresAt || '',
    paidAt: row.paid_at || row.paidAt || '',
    updatedAt: row.updated_at || row.updatedAt || '',
    active: ['creating', 'active', 'processing', 'paid'].includes(row.status || ''),
  };
}

async function latestPaymentRequestForInvoice(user, invoiceId) {
  const currentUser = await ensureUser(user);
  const db = sql();
  const invoiceRows = currentUser.role === 'admin'
    ? await db`SELECT id FROM fin_invoices WHERE id = ${invoiceId} AND deleted_at IS NULL LIMIT 1`
    : await db`SELECT id FROM fin_invoices WHERE id = ${invoiceId} AND created_by_user_id = ${currentUser.id} AND deleted_at IS NULL LIMIT 1`;
  if (!invoiceRows[0]) return null;
  const rows = await db`
    SELECT id, invoice_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id,
      expires_at::text AS expires_at, paid_at::text AS paid_at, updated_at::text AS updated_at
    FROM fin_invoice_payment_requests
    WHERE invoice_id = ${invoiceId} AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return paymentRequestSummary(rows[0]);
}

async function createInvoicePaymentRequest(user, invoiceId, modeInput = 'test') {
  const currentUser = await ensureUser(user);
  if (currentUser.role !== 'admin') throw makeError(403, 'Only Fin admins can create Stripe payment links.');
  const mode = cleanStripeMode(modeInput);
  const db = sql();
  const invoiceRows = await db`
    SELECT id, invoice_number, status, currency, total_cents, approved_by_user_id, data_json
    FROM fin_invoices
    WHERE id = ${invoiceId} AND deleted_at IS NULL
    LIMIT 1
  `;
  const row = invoiceRows[0];
  if (!row) throw makeError(404, 'Invoice draft not found.');
  const invoice = parseStoredInvoice(row.data_json);
  if (!invoice) throw makeError(500, 'Invoice data is unavailable.');
  if (invoice.status !== 'approved' || row.status !== 'approved' || !row.approved_by_user_id) throw makeError(409, 'Approve the invoice before creating a Stripe payment link.');
  const amountCents = Number(row.total_cents || invoice.totals?.totalCents || 0);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw makeError(409, 'Invoice total must be greater than zero before creating a payment link.');
  const snapshotSha256 = paymentSnapshotHash(invoice);

  await db`
    UPDATE fin_invoice_payment_requests
    SET status = 'failed', updated_at = now()
    WHERE invoice_id = ${invoiceId} AND stripe_mode = ${mode} AND deleted_at IS NULL AND status = 'creating' AND updated_at < now() - interval '15 minutes'
  `;

  const activeRows = await db`
    SELECT id, invoice_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
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
      RETURNING id, invoice_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
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
  const metadata = {
    fin_invoice_id: invoiceId,
    fin_payment_request_id: id,
    fin_invoice_number: row.invoice_number,
    fin_invoice_snapshot_sha256: snapshotSha256,
    fin_environment: mode,
  };
  const insertRows = await db`
    INSERT INTO fin_invoice_payment_requests (
      id, invoice_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      idempotency_key, created_by_user_id, approved_by_user_id, metadata_json, created_at, updated_at
    ) VALUES (
      ${id}, ${invoiceId}, ${row.invoice_number}, ${snapshotSha256}, ${mode}, 'creating', ${amountCents}, ${invoice.currency || row.currency || 'USD'},
      ${idempotencyKey}, ${currentUser.id}, ${currentUser.id}, ${JSON.stringify(metadata)}::jsonb, now(), now()
    )
    RETURNING id, invoice_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id,
      expires_at::text AS expires_at, paid_at::text AS paid_at, updated_at::text AS updated_at
  `;
  await db`INSERT INTO fin_invoice_events (invoice_id, actor_user_id, event_type, summary, metadata) VALUES (${invoiceId}, ${currentUser.id}, 'stripe_checkout_requested', 'Stripe Checkout payment link requested', ${JSON.stringify({ mode, paymentRequestId: id, snapshotSha256 })}::jsonb)`;
  const paymentRequest = { ...paymentRequestSummary(insertRows[0]), idempotencyKey, metadata };
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
    RETURNING id, invoice_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
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

function stripeEventMode(event) {
  return event?.livemode ? 'live' : 'test';
}

function stripeObjectAmountCents(object = {}) {
  return Number(object.amount_total ?? object.amount_received ?? object.amount ?? 0);
}

async function processStripeEvent(event = {}) {
  await ensureSchema();
  const db = sql();
  const eventId = cleanSingleLine(event.id, 160);
  if (!eventId) throw makeError(400, 'Stripe event id is required.');
  const mode = stripeEventMode(event);
  const type = cleanSingleLine(event.type, 160);
  const object = event.data?.object || {};
  const stripeCreatedAt = event.created ? new Date(Number(event.created) * 1000).toISOString() : null;
  const inserted = await db`
    INSERT INTO fin_stripe_events (stripe_event_id, stripe_mode, event_type, stripe_created_at, status, safe_summary_json, received_at)
    VALUES (${eventId}, ${mode}, ${type}, ${stripeCreatedAt}, 'received', ${JSON.stringify({ type, mode, objectId: object.id || '' })}::jsonb, now())
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
    paymentRows = await db`SELECT * FROM fin_invoice_payment_requests WHERE stripe_checkout_session_id = ${cleanSingleLine(object.id, 160)} AND deleted_at IS NULL LIMIT 1`;
  }
  if (!paymentRows[0] && type.startsWith('payment_intent.')) {
    paymentRows = await db`SELECT * FROM fin_invoice_payment_requests WHERE stripe_payment_intent_id = ${cleanSingleLine(object.id, 160)} AND deleted_at IS NULL LIMIT 1`;
  }
  if (!paymentRows[0] && object.metadata?.fin_payment_request_id) {
    paymentRows = await db`SELECT * FROM fin_invoice_payment_requests WHERE id = ${cleanSingleLine(object.metadata.fin_payment_request_id, 120)} AND deleted_at IS NULL LIMIT 1`;
  }
  const paymentRow = paymentRows[0];
  if (!paymentRow) {
    await db`UPDATE fin_stripe_events SET status = 'ignored', processed_at = now(), safe_summary_json = ${JSON.stringify({ type, mode, objectId: object.id || '', reason: 'payment-request-not-found' })}::jsonb WHERE stripe_event_id = ${eventId}`;
    return { duplicate: false, status: 'ignored', reason: 'payment-request-not-found', eventId };
  }

  const payment = paymentRequestSummary(paymentRow);
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

  const paymentIntentId = cleanSingleLine(object.payment_intent || object.id, 160);
  const paidAt = nextStatus === 'paid' ? new Date().toISOString() : null;
  const updatedRows = await db`
    UPDATE fin_invoice_payment_requests SET
      status = ${nextStatus},
      stripe_payment_intent_id = CASE WHEN ${paymentIntentId} <> '' THEN ${paymentIntentId} ELSE stripe_payment_intent_id END,
      paid_at = CASE WHEN ${paidAt}::timestamptz IS NOT NULL THEN ${paidAt}::timestamptz ELSE paid_at END,
      updated_at = now()
    WHERE id = ${payment.id}
    RETURNING id, invoice_id, invoice_number, invoice_snapshot_sha256, stripe_mode, status, amount_cents, currency,
      payment_url, payment_url_kind, stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id,
      expires_at::text AS expires_at, paid_at::text AS paid_at, updated_at::text AS updated_at
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
  return { duplicate: false, status: 'processed', eventId, payment: updatedPayment };
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
    const reportingScope = cleanSingleLine(source.reportingScope, 40) === 'private' ? 'private' : 'wawco';
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
  return {
    id: row.id,
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
  const rawRows = currentUser.role === 'admin'
    ? await db`
      SELECT inv.id, inv.invoice_number, inv.status, inv.client_label,
        inv.invoice_date::text AS invoice_date, inv.due_date::text AS due_date,
        inv.total_cents, inv.payment_status, inv.current_payment_request_id,
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
      SELECT inv.id, inv.invoice_number, inv.status, inv.client_label,
        inv.invoice_date::text AS invoice_date, inv.due_date::text AS due_date,
        inv.total_cents, inv.payment_status, inv.current_payment_request_id,
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

  const excludedRows = [];
  const visibleRows = [];
  for (const row of rawRows) {
    const data = parseStoredInvoice(row.data_json) || {};
    const fromName = String(data.from?.name || '').trim().toLowerCase();
    const fromCompany = String(data.from?.company || '').trim().toLowerCase();
    const excluded = data.payeeReportingScope === 'private'
      || data.excludeFromWawcoDashboard === true
      || ['noah glynn', 'noah glenn'].includes(fromName)
      || ['noah glynn', 'noah glenn'].includes(fromCompany);
    if (excluded) excludedRows.push(row);
    else visibleRows.push(row);
  }

  const invoices = visibleRows.map(hostedInvoiceRow);
  const invoiceMonths = [...new Set(invoices.map((invoice) => invoice.month).filter(Boolean))].sort();
  const importMergeEnabled = financeImportsEnabled();
  const importMonths = importMergeEnabled ? await financeImportMonths(currentUser) : [];
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
    visibleCount: invoices.length,
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
  const importedRecord = importMergeEnabled && currentUser.role === 'admin' ? await latestFinanceImportForSummary(currentUser, month) : null;
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
      detail: `${hostedInvoices.excludedPrivatePayeeCount} private-payee invoice${hostedInvoices.excludedPrivatePayeeCount === 1 ? '' : 's'} excluded from WAWCO totals.`,
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
    invoiceCount: invoices.length,
    totalCents: sumCents(invoices),
    readyForReviewCents: hostedInvoices.readyForReviewCents,
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
      excludedPrivatePayeeCount: hostedInvoices.excludedPrivatePayeeCount,
      error: '',
    },
    exceptions,
  };
}

module.exports = {
  ensureSchema,
  ensureUser,
  numberingSettings,
  updateNumberingSettings,
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  listInvoices,
  createInvoice,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  latestPaymentRequestForInvoice,
  createInvoicePaymentRequest,
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
