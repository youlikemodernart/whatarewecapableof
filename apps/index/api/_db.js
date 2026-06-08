const { EDITABLE_FIELDS, ALLOWED_VALUES, pickOverrideFields } = require('./_registry');

let sqlClient = null;
let schemaReady = false;

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function databaseUrl() {
  return env('INDEX_POSTGRES_URL') || env('POSTGRES_URL');
}

function persistenceStatus() {
  return {
    configured: Boolean(databaseUrl()),
    provider: databaseUrl() ? 'neon' : 'none',
  };
}

function isPersistenceConfigured() {
  return Boolean(databaseUrl());
}

function persistenceNotConfiguredError() {
  const error = new Error('Windex server persistence is not configured yet. Copy changes for Pi, or set INDEX_POSTGRES_URL before applying in Windex.');
  error.status = 503;
  error.code = 'persistence_not_configured';
  return error;
}

function sql() {
  const url = databaseUrl();
  if (!url) throw persistenceNotConfiguredError();
  if (!sqlClient) {
    const { neon } = require('@neondatabase/serverless');
    sqlClient = neon(url);
  }
  return sqlClient;
}

async function ensureSchema() {
  if (!isPersistenceConfigured()) return false;
  if (schemaReady) return true;
  const db = sql();

  await db`CREATE TABLE IF NOT EXISTS windex_overrides (
    item_id TEXT PRIMARY KEY,
    category TEXT CHECK (category IS NULL OR category IN ('homepage', 'page', 'proposal', 'brief', 'tool', 'subdomain', 'internal', 'project', 'compliance')),
    lifecycle TEXT CHECK (lifecycle IS NULL OR lifecycle IN ('active', 'archived', 'decommissioned')),
    status TEXT CHECK (status IS NULL OR status IN ('active', 'live', 'needs_review', 'transfer_pending', 'build_pending', 'legacy', 'blocked')),
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await db`CREATE TABLE IF NOT EXISTS windex_override_events (
    id BIGSERIAL PRIMARY KEY,
    item_id TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT '',
    before_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await db`CREATE INDEX IF NOT EXISTS windex_override_events_item_idx ON windex_override_events (item_id, created_at DESC)`;
  schemaReady = true;
  return true;
}

function cleanRow(row) {
  return pickOverrideFields({
    category: row.category,
    lifecycle: row.lifecycle,
    status: row.status,
  });
}

async function loadOverrides() {
  if (!isPersistenceConfigured()) return {};
  await ensureSchema();
  const rows = await sql()`SELECT item_id, category, lifecycle, status FROM windex_overrides ORDER BY item_id`;
  return rows.reduce((overrides, row) => {
    const fields = cleanRow(row);
    if (Object.keys(fields).length) overrides[row.item_id] = fields;
    return overrides;
  }, {});
}

function finalOverrideFields(previous, fields) {
  const next = { ...pickOverrideFields(previous) };
  EDITABLE_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) return;
    const value = fields[field];
    if (value === null || value === undefined || value === '') delete next[field];
    else if (ALLOWED_VALUES[field].includes(value)) next[field] = value;
  });
  return next;
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function saveOverrideChanges(changes, options = {}) {
  if (!Array.isArray(changes) || !changes.length) return loadOverrides();
  if (!isPersistenceConfigured()) throw persistenceNotConfiguredError();

  await ensureSchema();
  const db = sql();
  const actor = String(options.actor || '').trim().slice(0, 254);
  const before = await loadOverrides();

  for (const change of changes) {
    const previous = pickOverrideFields(before[change.id] || {});
    const next = finalOverrideFields(previous, change.fields || {});

    if (sameJson(previous, next)) continue;

    if (Object.keys(next).length) {
      await db`INSERT INTO windex_overrides (item_id, category, lifecycle, status, updated_by, updated_at)
        VALUES (${change.id}, ${next.category || null}, ${next.lifecycle || null}, ${next.status || null}, ${actor}, now())
        ON CONFLICT (item_id) DO UPDATE SET
          category = EXCLUDED.category,
          lifecycle = EXCLUDED.lifecycle,
          status = EXCLUDED.status,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()`;
    } else {
      await db`DELETE FROM windex_overrides WHERE item_id = ${change.id}`;
    }

    await db`INSERT INTO windex_override_events (item_id, actor, before_json, after_json)
      VALUES (${change.id}, ${actor}, ${JSON.stringify(previous)}::jsonb, ${JSON.stringify(next)}::jsonb)`;
  }

  return loadOverrides();
}

module.exports = {
  databaseUrl,
  persistenceStatus,
  isPersistenceConfigured,
  ensureSchema,
  loadOverrides,
  saveOverrideChanges,
};
