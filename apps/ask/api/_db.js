const crypto = require('crypto');
const fs = require('fs');
const seed = require('./_seed_deck');
const { storageConfig } = require('./_auth');
const { makeHttpError } = require('./_http');

let sqlClient = null;
let schemaReady = false;
let memoryState = null;

const QUESTION_TYPES = new Set(['identity', 'short_text', 'long_text', 'multi_choice', 'single_choice', 'yes_no', 'approval_checkbox']);
const DECK_SCHEMA_VERSION = 'ask.deck.v0';
const DECK_STATUSES = new Set(['draft', 'published', 'closed', 'archived']);
const DECK_SENSITIVITIES = new Set(['low', 'medium', 'high']);

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function databaseUrl() {
  return env('ASK_POSTGRES_URL') || env('POSTGRES_URL') || env('DATABASE_URL');
}

function linkSecret() {
  return env('ASK_LINK_SECRET') || env('ASK_SESSION_SECRET') || env('ASK_DEV_SESSION_SECRET') || 'ask-local-dev-link-secret';
}

function sql() {
  const url = databaseUrl();
  if (!url) throw new Error('ASK_POSTGRES_URL, POSTGRES_URL, or DATABASE_URL is not configured.');
  if (!sqlClient) {
    const { neon } = require('@neondatabase/serverless');
    sqlClient = neon(url);
  }
  return sqlClient;
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

function hmac(value, secret = linkSecret()) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function encryptionKey() {
  return crypto.createHash('sha256').update(linkSecret()).digest();
}

function encryptSlug(slug) {
  const clean = cleanSlug(slug);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptSlug(value) {
  const token = String(value || '');
  if (!token) return '';
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parts[1], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
    return cleanSlug(decrypted);
  } catch {
    return '';
  }
}

function publicUrlForSlug(slug, baseUrl = '') {
  if (!slug || !baseUrl) return '';
  return `${String(baseUrl).replace(/\/$/, '')}/respond?slug=${encodeURIComponent(slug)}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function slugHash(slug) {
  return hmac(`slug:${cleanSlug(slug)}`);
}

function passcodeHash(passcode, salt) {
  return crypto.pbkdf2Sync(String(passcode || ''), String(salt || ''), 120_000, 32, 'sha256').toString('hex');
}

function verifyPasscode(passcode, salt, expectedHash) {
  if (!expectedHash) return true;
  if (!passcode) return false;
  const actual = passcodeHash(passcode, salt);
  const left = Buffer.from(actual);
  const right = Buffer.from(expectedHash);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function cleanSlug(value) {
  const slug = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(slug)) throw makeHttpError(400, 'Invalid link.');
  return slug;
}

function cleanSingleLine(value, max = 240) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanText(value, max = 4000) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function cleanEmail(value) {
  const email = cleanSingleLine(value, 254).toLowerCase();
  if (!email) return '';
  if (!/^\S+@\S+\.\S+$/.test(email)) throw makeHttpError(400, 'Enter a valid email address.');
  return email;
}

function publicDeckPayload(record, includeQuestions = false) {
  const schema = record.schemaJson;
  const welcome = schema.welcome || {};
  return {
    id: record.deckId,
    versionId: record.deckVersionId,
    title: includeQuestions ? record.title : 'Private questions',
    clientLabel: includeQuestions ? record.clientLabel : 'Secure response link',
    status: record.status,
    sensitivity: includeQuestions ? record.sensitivity : '',
    estimatedMinutes: includeQuestions ? schema.estimatedMinutes || 4 : undefined,
    welcome: includeQuestions ? welcome : {
      title: 'Enter passcode',
      body: '',
      privacy: welcome.privacy || 'This question set needs a passcode before answers can be opened.',
    },
    passcodeRequired: Boolean(record.passcodeRequired),
    questions: includeQuestions ? schema.questions : [],
  };
}

function memoryFilePath() {
  return env('ASK_MEMORY_FILE', '/tmp/wawco-ask-memory.json');
}

function normalizeSeed() {
  const deck = seed.deck;
  const salt = hmac(`seed-salt:${seed.seedSlug}`).slice(0, 32);
  return {
    deckId: deck.id,
    deckVersionId: `${deck.id}-v1`,
    title: deck.title,
    clientLabel: deck.clientLabel,
    status: deck.status,
    sensitivity: deck.sensitivity,
    passcodeRequired: Boolean(deck.passcodeRequired),
    passcodeSalt: salt,
    passcodeHash: passcodeHash(seed.seedPasscode, salt),
    publicSlugHash: slugHash(seed.seedSlug),
    publicSlugCiphertext: encryptSlug(seed.seedSlug),
    publicSlug: seed.seedSlug,
    schemaJson: {
      schemaVersion: DECK_SCHEMA_VERSION,
      title: deck.title,
      clientLabel: deck.clientLabel,
      estimatedMinutes: deck.estimatedMinutes,
      welcome: deck.welcome,
      questions: deck.questions,
    },
    schemaSha256: sha256(stableJson(deck)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function memory() {
  const deck = normalizeSeed();
  let persisted = { decks: [], responses: [], events: [] };
  try {
    persisted = JSON.parse(fs.readFileSync(memoryFilePath(), 'utf8'));
  } catch {
    persisted = { decks: [], responses: [], events: [] };
  }
  const deckRecords = [deck, ...(persisted.decks || []).filter((candidate) => candidate?.deckId !== deck.deckId)];
  memoryState = {
    decks: new Map(deckRecords.map((record) => [record.publicSlugHash, record])),
    decksById: new Map(deckRecords.map((record) => [record.deckId, record])),
    responses: new Map((persisted.responses || []).map((response) => [response.id, response])),
    events: persisted.events || [],
  };
  return memoryState;
}

function persistMemory(state = memoryState) {
  if (!state) return;
  fs.writeFileSync(memoryFilePath(), JSON.stringify({
    decks: Array.from(state.decksById.values()),
    responses: Array.from(state.responses.values()),
    events: state.events || [],
  }, null, 2));
}

async function ensureSchema() {
  if (storageConfig().mode === 'memory') return;
  if (schemaReady) return;
  const db = sql();
  await db`CREATE TABLE IF NOT EXISTS ask_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'admin',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    google_subject TEXT UNIQUE,
    picture TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
  )`;
  await db`CREATE TABLE IF NOT EXISTS ask_decks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    client_label TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    sensitivity TEXT NOT NULL DEFAULT 'medium',
    public_slug_hash TEXT NOT NULL UNIQUE,
    public_slug_ciphertext TEXT NOT NULL DEFAULT '',
    passcode_required BOOLEAN NOT NULL DEFAULT TRUE,
    passcode_salt TEXT NOT NULL DEFAULT '',
    passcode_hash TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ,
    created_by_user_id TEXT REFERENCES ask_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CHECK (status IN ('draft', 'published', 'closed', 'archived')),
    CHECK (sensitivity IN ('low', 'medium', 'high'))
  )`;
  await db`ALTER TABLE ask_decks ADD COLUMN IF NOT EXISTS public_slug_ciphertext TEXT NOT NULL DEFAULT ''`;
  await db`CREATE TABLE IF NOT EXISTS ask_deck_versions (
    id TEXT PRIMARY KEY,
    deck_id TEXT NOT NULL REFERENCES ask_decks(id),
    version_label TEXT NOT NULL DEFAULT 'v1',
    schema_json JSONB NOT NULL,
    schema_sha256 TEXT NOT NULL DEFAULT '',
    published_at TIMESTAMPTZ,
    created_by_user_id TEXT REFERENCES ask_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (deck_id, version_label)
  )`;
  await db`CREATE TABLE IF NOT EXISTS ask_responses (
    id TEXT PRIMARY KEY,
    deck_id TEXT NOT NULL REFERENCES ask_decks(id),
    deck_version_id TEXT NOT NULL REFERENCES ask_deck_versions(id),
    status TEXT NOT NULL DEFAULT 'started',
    respondent_name TEXT NOT NULL DEFAULT '',
    respondent_email TEXT NOT NULL DEFAULT '',
    respondent_role TEXT NOT NULL DEFAULT '',
    client_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_user_id TEXT REFERENCES ask_users(id),
    CHECK (status IN ('started', 'submitted', 'reviewed', 'void'))
  )`;
  await db`CREATE TABLE IF NOT EXISTS ask_answers (
    id BIGSERIAL PRIMARY KEY,
    response_id TEXT NOT NULL REFERENCES ask_responses(id) ON DELETE CASCADE,
    question_ref TEXT NOT NULL,
    answer_type TEXT NOT NULL DEFAULT '',
    value_json JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'answered',
    creates_followup BOOLEAN NOT NULL DEFAULT FALSE,
    requires_review BOOLEAN NOT NULL DEFAULT FALSE,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (response_id, question_ref)
  )`;
  await db`CREATE TABLE IF NOT EXISTS ask_answer_packets (
    id TEXT PRIMARY KEY,
    response_id TEXT NOT NULL REFERENCES ask_responses(id) ON DELETE CASCADE,
    packet_kind TEXT NOT NULL DEFAULT 'markdown',
    content_sha256 TEXT NOT NULL DEFAULT '',
    packet_text TEXT NOT NULL DEFAULT '',
    created_by_user_id TEXT REFERENCES ask_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await db`CREATE TABLE IF NOT EXISTS ask_deck_events (
    id BIGSERIAL PRIMARY KEY,
    deck_id TEXT REFERENCES ask_decks(id),
    actor_user_id TEXT REFERENCES ask_users(id),
    event_type TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await db`CREATE TABLE IF NOT EXISTS ask_response_events (
    id BIGSERIAL PRIMARY KEY,
    response_id TEXT REFERENCES ask_responses(id),
    actor_user_id TEXT REFERENCES ask_users(id),
    event_type TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await db`CREATE INDEX IF NOT EXISTS ask_responses_deck_idx ON ask_responses (deck_id, updated_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS ask_responses_status_idx ON ask_responses (status, updated_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS ask_answers_response_idx ON ask_answers (response_id)`;
  await db`CREATE INDEX IF NOT EXISTS ask_answers_followup_idx ON ask_answers (requires_review, creates_followup)`;
  await db`CREATE INDEX IF NOT EXISTS ask_answer_packets_response_idx ON ask_answer_packets (response_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS ask_deck_events_deck_idx ON ask_deck_events (deck_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS ask_response_events_response_idx ON ask_response_events (response_id, created_at DESC)`;
  schemaReady = true;
}

async function seedIfEmpty() {
  if (storageConfig().mode === 'memory') return;
  if (env('ASK_ENABLE_SEED_DECK') !== '1') return;
  await ensureSchema();
  const db = sql();
  const normalized = normalizeSeed();
  const existing = await db`SELECT id FROM ask_decks WHERE public_slug_hash = ${normalized.publicSlugHash} AND deleted_at IS NULL LIMIT 1`;
  if (existing.length) return;
  await db`INSERT INTO ask_decks (id, title, client_label, status, sensitivity, public_slug_hash, public_slug_ciphertext, passcode_required, passcode_salt, passcode_hash)
    VALUES (${normalized.deckId}, ${normalized.title}, ${normalized.clientLabel}, ${normalized.status}, ${normalized.sensitivity}, ${normalized.publicSlugHash}, ${normalized.publicSlugCiphertext}, ${normalized.passcodeRequired}, ${normalized.passcodeSalt}, ${normalized.passcodeHash})`;
  await db`INSERT INTO ask_deck_versions (id, deck_id, version_label, schema_json, schema_sha256, published_at)
    VALUES (${normalized.deckVersionId}, ${normalized.deckId}, 'v1', ${JSON.stringify(normalized.schemaJson)}::jsonb, ${normalized.schemaSha256}, now())`;
  await db`INSERT INTO ask_deck_events (deck_id, event_type, summary, metadata)
    VALUES (${normalized.deckId}, 'seeded', 'Seeded local Ask demo deck.', ${JSON.stringify({ source: 'apps/ask/data/seed-deck.json' })}::jsonb)`;
}

async function deckRecordBySlug(slug) {
  const hash = slugHash(slug);
  if (storageConfig().mode === 'memory') {
    const record = memory().decks.get(hash) || null;
    if (!record || record.status !== 'published') return null;
    if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) return null;
    return record;
  }
  await seedIfEmpty();
  const db = sql();
  const rows = await db`SELECT d.id AS deck_id, v.id AS deck_version_id, d.title, d.client_label, d.status, d.sensitivity,
      d.passcode_required, d.passcode_salt, d.passcode_hash, d.expires_at, v.schema_json, v.schema_sha256
    FROM ask_decks d
    JOIN ask_deck_versions v ON v.deck_id = d.id
    WHERE d.public_slug_hash = ${hash}
      AND d.deleted_at IS NULL
      AND d.status = 'published'
      AND (d.expires_at IS NULL OR d.expires_at > now())
    ORDER BY v.published_at DESC NULLS LAST, v.created_at DESC
    LIMIT 1`;
  if (!rows.length) return null;
  const row = rows[0];
  return {
    deckId: row.deck_id,
    deckVersionId: row.deck_version_id,
    title: row.title,
    clientLabel: row.client_label,
    status: row.status,
    sensitivity: row.sensitivity,
    passcodeRequired: row.passcode_required,
    passcodeSalt: row.passcode_salt,
    passcodeHash: row.passcode_hash,
    schemaJson: row.schema_json,
    schemaSha256: row.schema_sha256,
  };
}

async function publicDeck(slug, includeQuestions = false) {
  const record = await deckRecordBySlug(slug);
  if (!record) throw makeHttpError(404, 'Question set not found.');
  return publicDeckPayload(record, includeQuestions);
}

function cleanRef(value, label = 'Reference') {
  const ref = cleanSingleLine(value, 80).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(ref)) throw makeHttpError(400, `${label} must use lowercase letters, numbers, dashes, or underscores.`);
  return ref;
}

function cleanBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function rejectRawSourceKeys(input) {
  const blocked = new Set(['rawSource', 'rawSources', 'sourceText', 'sourceHtml', 'emailBody', 'emails', 'messages', 'slackMessages', 'transcript', 'credentials', 'secret', 'secrets']);
  for (const key of Object.keys(input || {})) {
    if (blocked.has(key)) throw makeHttpError(400, `Import field ${key} is not allowed. Keep raw source material out of Ask deck packets.`);
  }
}

function normalizeWelcome(value = {}) {
  return {
    title: cleanSingleLine(value.title, 160),
    body: cleanText(value.body, 1200),
    privacy: cleanText(value.privacy, 1200),
  };
}

function normalizeChoice(input, index) {
  const ref = cleanRef(input?.ref || `choice-${index + 1}`, 'Choice reference');
  return {
    ref,
    label: cleanSingleLine(input?.label, 180) || ref,
    description: cleanText(input?.description, 600),
    isRecommended: cleanBoolean(input?.isRecommended),
    createsFollowup: cleanBoolean(input?.createsFollowup),
    createsBlocker: cleanBoolean(input?.createsBlocker),
    isNotSure: cleanBoolean(input?.isNotSure),
    requiresReview: cleanBoolean(input?.requiresReview),
  };
}

function normalizeQuestion(input, index) {
  const type = cleanSingleLine(input?.type, 80);
  if (!QUESTION_TYPES.has(type)) throw makeHttpError(400, `Question ${index + 1} has an unsupported type.`);
  const ref = cleanRef(input?.ref || `question-${index + 1}`, 'Question reference');
  const question = {
    ref,
    type,
    section: cleanSingleLine(input?.section, 120),
    prompt: cleanText(input?.prompt, 1200),
    contextText: cleanText(input?.contextText, 1200),
    recommendationRationale: cleanText(input?.recommendationRationale, 1200),
    required: input?.required !== false,
  };
  if (!question.prompt) throw makeHttpError(400, `Question ${index + 1} is missing a prompt.`);
  if (type === 'identity') {
    const labels = new Map((Array.isArray(input?.fields) ? input.fields : []).map((field) => [String(field?.key || ''), field]));
    question.fields = [
      { key: 'name', label: cleanSingleLine(labels.get('name')?.label, 120) || 'Name', autocomplete: 'name' },
      { key: 'email', label: cleanSingleLine(labels.get('email')?.label, 120) || 'Email', autocomplete: 'email' },
      { key: 'role', label: cleanSingleLine(labels.get('role')?.label, 120) || 'Role', autocomplete: 'organization-title' },
    ];
  }
  if (type === 'short_text' || type === 'long_text') {
    question.placeholder = cleanSingleLine(input?.placeholder, 200);
  }
  if (type === 'multi_choice' || type === 'single_choice' || type === 'yes_no') {
    const rawChoices = Array.isArray(input?.choices) && input.choices.length
      ? input.choices
      : type === 'yes_no'
        ? [{ ref: 'yes', label: 'Yes' }, { ref: 'no', label: 'No' }]
        : [];
    if (!rawChoices.length) throw makeHttpError(400, `Question ${ref} needs choices.`);
    if (rawChoices.length > 24) throw makeHttpError(400, `Question ${ref} has too many choices.`);
    const seen = new Set();
    question.choices = rawChoices.map(normalizeChoice).map((choice) => {
      if (seen.has(choice.ref)) throw makeHttpError(400, `Question ${ref} has duplicate choice reference ${choice.ref}.`);
      seen.add(choice.ref);
      return choice;
    });
  }
  if (type === 'approval_checkbox') {
    question.approvalText = cleanText(input?.approvalText, 1000) || 'I approve this path.';
  }
  return question;
}

function normalizeDeckImport(input) {
  const source = input?.deck && typeof input.deck === 'object' ? input.deck : input;
  rejectRawSourceKeys(source);
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw makeHttpError(400, 'Deck import must be a JSON object.');
  const schemaVersion = cleanSingleLine(source.schemaVersion, 40);
  if (schemaVersion !== DECK_SCHEMA_VERSION) throw makeHttpError(400, `Deck import must use ${DECK_SCHEMA_VERSION}.`);
  const title = cleanSingleLine(source.title, 180);
  const clientLabel = cleanSingleLine(source.clientLabel, 180);
  if (!title) throw makeHttpError(400, 'Deck title is required.');
  if (!clientLabel) throw makeHttpError(400, 'Client label is required.');
  const status = cleanSingleLine(source.status || 'published', 40);
  if (!DECK_STATUSES.has(status) || status === 'archived') throw makeHttpError(400, 'Deck status must be draft, published, or closed.');
  const sensitivity = cleanSingleLine(source.sensitivity || 'medium', 40);
  if (!DECK_SENSITIVITIES.has(sensitivity)) throw makeHttpError(400, 'Deck sensitivity must be low, medium, or high.');
  const questions = Array.isArray(source.questions) ? source.questions : [];
  if (!questions.length) throw makeHttpError(400, 'Deck import must include at least one question.');
  if (questions.length > 60) throw makeHttpError(400, 'Deck import has too many questions.');
  const seen = new Set();
  const normalizedQuestions = questions.map(normalizeQuestion).map((question) => {
    if (seen.has(question.ref)) throw makeHttpError(400, `Duplicate question reference ${question.ref}.`);
    seen.add(question.ref);
    return question;
  });
  const estimatedMinutes = Number(source.estimatedMinutes || Math.max(2, Math.ceil(normalizedQuestions.length / 2)));
  if (source.passcodeRequired === false) throw makeHttpError(400, 'Imported decks must require a passcode.');
  return {
    schemaVersion: DECK_SCHEMA_VERSION,
    title,
    clientLabel,
    status,
    sensitivity,
    estimatedMinutes: Number.isFinite(estimatedMinutes) ? Math.min(Math.max(Math.round(estimatedMinutes), 1), 30) : 4,
    welcome: normalizeWelcome(source.welcome || {}),
    sourceLabel: cleanSingleLine(source.sourceLabel, 180),
    sourceSummary: cleanText(source.sourceSummary, 1200),
    passcodeRequired: true,
    questions: normalizedQuestions,
  };
}

function randomPublicSlug() {
  return `ask_${crypto.randomBytes(18).toString('base64url')}`;
}

function randomPasscode() {
  return crypto.randomBytes(12).toString('base64url');
}

function deckAdminSummary(record, { baseUrl = '', responseCount = 0 } = {}) {
  const publicSlug = record.publicSlug || decryptSlug(record.publicSlugCiphertext);
  return {
    id: record.deckId,
    versionId: record.deckVersionId,
    title: record.title,
    clientLabel: record.clientLabel,
    status: record.status,
    sensitivity: record.sensitivity,
    passcodeRequired: Boolean(record.passcodeRequired),
    publicSlug: record.status === 'published' ? publicSlug || '' : '',
    publicUrl: record.status === 'published' ? publicUrlForSlug(publicSlug, baseUrl) : '',
    responseCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function createDeckFromImport({ deckInput, actorUserId = '', baseUrl = '' }) {
  const normalized = normalizeDeckImport(deckInput);
  const publicSlug = randomPublicSlug();
  const passcode = normalized.passcodeRequired ? randomPasscode() : '';
  const salt = hmac(`deck-passcode-salt:${publicSlug}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`).slice(0, 32);
  const deckId = id('ask_deck');
  const deckVersionId = id('ask_deck_version');
  const now = new Date().toISOString();
  const schemaJson = {
    schemaVersion: DECK_SCHEMA_VERSION,
    title: normalized.title,
    clientLabel: normalized.clientLabel,
    estimatedMinutes: normalized.estimatedMinutes,
    welcome: normalized.welcome,
    sourceLabel: normalized.sourceLabel,
    sourceSummary: normalized.sourceSummary,
    questions: normalized.questions,
  };
  const record = {
    deckId,
    deckVersionId,
    title: normalized.title,
    clientLabel: normalized.clientLabel,
    status: normalized.status,
    sensitivity: normalized.sensitivity,
    passcodeRequired: normalized.passcodeRequired,
    passcodeSalt: salt,
    passcodeHash: passcode ? passcodeHash(passcode, salt) : '',
    publicSlugHash: slugHash(publicSlug),
    publicSlugCiphertext: encryptSlug(publicSlug),
    publicSlug,
    schemaJson,
    schemaSha256: sha256(stableJson(schemaJson)),
    createdAt: now,
    updatedAt: now,
  };

  if (storageConfig().mode === 'memory') {
    const state = memory();
    state.decks.set(record.publicSlugHash, record);
    state.decksById.set(record.deckId, record);
    state.events.push({ deckId, actorUserId, eventType: 'imported', createdAt: now, metadata: { sourceLabel: normalized.sourceLabel } });
    persistMemory(state);
  } else {
    await ensureSchema();
    const db = sql();
    await db`INSERT INTO ask_decks (id, title, client_label, status, sensitivity, public_slug_hash, public_slug_ciphertext, passcode_required, passcode_salt, passcode_hash)
      VALUES (${record.deckId}, ${record.title}, ${record.clientLabel}, 'draft', ${record.sensitivity}, ${record.publicSlugHash}, ${record.publicSlugCiphertext}, ${record.passcodeRequired}, ${record.passcodeSalt}, ${record.passcodeHash})`;
    await db`INSERT INTO ask_deck_versions (id, deck_id, version_label, schema_json, schema_sha256, published_at)
      VALUES (${record.deckVersionId}, ${record.deckId}, 'v1', ${JSON.stringify(record.schemaJson)}::jsonb, ${record.schemaSha256}, ${record.status === 'published' ? new Date().toISOString() : null})`;
    await db`UPDATE ask_decks SET status = ${record.status}, updated_at = now() WHERE id = ${record.deckId}`;
    await db`INSERT INTO ask_deck_events (deck_id, event_type, summary, metadata)
      VALUES (${record.deckId}, 'imported', 'Imported deck from ask.deck.v0 packet.', ${JSON.stringify({ actorUserId, sourceLabel: normalized.sourceLabel, schemaSha256: record.schemaSha256 })}::jsonb)`;
  }

  return {
    ok: true,
    deck: deckAdminSummary(record, { baseUrl }),
    secret: {
      publicSlug: normalized.status === 'published' ? publicSlug : '',
      publicUrl: normalized.status === 'published' ? publicUrlForSlug(publicSlug, baseUrl) : '',
      passcode,
      passcodeRequired: normalized.passcodeRequired,
    },
  };
}

async function listDecks({ baseUrl = '' } = {}) {
  if (storageConfig().mode === 'memory') {
    const state = memory();
    const responseCounts = new Map();
    for (const response of state.responses.values()) responseCounts.set(response.deckId, (responseCounts.get(response.deckId) || 0) + 1);
    return Array.from(state.decksById.values())
      .map((deck) => deckAdminSummary(deck, { baseUrl, responseCount: responseCounts.get(deck.deckId) || 0 }))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }
  await ensureSchema();
  await seedIfEmpty();
  const db = sql();
  const rows = await db`SELECT d.id AS deck_id, d.title, d.client_label, d.status, d.sensitivity, d.passcode_required,
      d.public_slug_ciphertext, d.created_at, d.updated_at,
      latest.id AS deck_version_id,
      COALESCE(response_counts.response_count, 0)::int AS response_count
    FROM ask_decks d
    LEFT JOIN LATERAL (
      SELECT id FROM ask_deck_versions v WHERE v.deck_id = d.id ORDER BY v.published_at DESC NULLS LAST, v.created_at DESC LIMIT 1
    ) latest ON TRUE
    LEFT JOIN (
      SELECT deck_id, count(*) AS response_count FROM ask_responses GROUP BY deck_id
    ) response_counts ON response_counts.deck_id = d.id
    WHERE d.deleted_at IS NULL
      AND latest.id IS NOT NULL
    ORDER BY d.updated_at DESC
    LIMIT 200`;
  return rows.map((row) => deckAdminSummary({
    deckId: row.deck_id,
    deckVersionId: row.deck_version_id,
    title: row.title,
    clientLabel: row.client_label,
    status: row.status,
    sensitivity: row.sensitivity,
    passcodeRequired: row.passcode_required,
    publicSlugCiphertext: row.public_slug_ciphertext,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }, { baseUrl, responseCount: row.response_count }));
}

function questionMap(deckSchema) {
  return new Map((deckSchema.questions || []).map((question) => [question.ref, question]));
}

function choiceMap(question) {
  return new Map((question.choices || []).map((choice) => [choice.ref, choice]));
}

function normalizeAnswer(question, incoming) {
  if (!question || !QUESTION_TYPES.has(question.type)) throw makeHttpError(400, 'Unknown question.');
  const raw = incoming && Object.prototype.hasOwnProperty.call(incoming, 'value') ? incoming.value : incoming;
  let value;
  if (question.type === 'identity') {
    const source = raw || {};
    value = {
      name: cleanSingleLine(source.name, 120),
      email: cleanEmail(source.email),
      role: cleanSingleLine(source.role, 120),
    };
    if (question.required && (!value.name || !value.email || !value.role)) throw makeHttpError(400, 'Name, email, and role are required.');
  } else if (question.type === 'short_text') {
    value = cleanSingleLine(raw, 400);
    if (question.required && !value) throw makeHttpError(400, 'Required answer is missing.');
  } else if (question.type === 'long_text') {
    value = cleanText(raw, 4000);
    if (question.required && !value) throw makeHttpError(400, 'Required answer is missing.');
  } else if (question.type === 'multi_choice') {
    const allowed = choiceMap(question);
    const selected = Array.isArray(raw) ? raw.map((item) => cleanSingleLine(item, 120)) : [];
    value = Array.from(new Set(selected)).filter((ref) => allowed.has(ref)).slice(0, 20);
    if (question.required && !value.length) throw makeHttpError(400, 'Select at least one option.');
  } else if (question.type === 'single_choice' || question.type === 'yes_no') {
    const selected = cleanSingleLine(raw, 120);
    if (selected && !choiceMap(question).has(selected)) throw makeHttpError(400, 'Unknown option.');
    value = selected;
    if (question.required && !value) throw makeHttpError(400, 'Select an option.');
  } else if (question.type === 'approval_checkbox') {
    value = raw === true;
    if (question.required && value !== true) throw makeHttpError(400, 'Approval is required before submitting.');
  }

  const selectedChoices = Array.isArray(value)
    ? value.map((ref) => choiceMap(question).get(ref)).filter(Boolean)
    : [choiceMap(question).get(value)].filter(Boolean);
  const createsFollowup = selectedChoices.some((choice) => choice.createsFollowup || choice.createsBlocker || choice.isNotSure);
  const requiresReview = selectedChoices.some((choice) => choice.requiresReview || choice.createsFollowup || choice.createsBlocker || choice.isNotSure);
  const status = createsFollowup || requiresReview ? 'needs_review' : 'answered';

  return {
    questionRef: question.ref,
    answerType: question.type,
    value,
    status,
    createsFollowup,
    requiresReview,
    answeredAt: new Date().toISOString(),
  };
}

function normalizeSubmittedAnswers(deckSchema, answers) {
  const questions = questionMap(deckSchema);
  const byRef = new Map();
  const incoming = Array.isArray(answers) ? answers : [];
  if (incoming.length > 100) throw makeHttpError(400, 'Too many answers.');
  incoming.forEach((answer) => {
    const ref = cleanSingleLine(answer?.questionRef || answer?.ref, 120);
    const question = questions.get(ref);
    if (!question) throw makeHttpError(400, 'Unknown answer reference.');
    byRef.set(ref, normalizeAnswer(question, answer));
  });

  for (const question of questions.values()) {
    if (question.required && !byRef.has(question.ref)) throw makeHttpError(400, 'A required answer is missing.');
  }
  return Array.from(byRef.values());
}

function respondentFromAnswers(answers) {
  const identity = answers.find((answer) => answer.answerType === 'identity');
  const value = identity?.value || {};
  return {
    name: cleanSingleLine(value.name, 120),
    email: cleanEmail(value.email),
    role: cleanSingleLine(value.role, 120),
  };
}

async function startResponse({ slug, passcode = '' }) {
  const record = await deckRecordBySlug(slug);
  if (!record) throw makeHttpError(404, 'Question set not found.');
  if (record.passcodeRequired && !verifyPasscode(passcode, record.passcodeSalt, record.passcodeHash)) {
    throw makeHttpError(403, 'Passcode did not match.');
  }
  const responseId = id('ask_response');
  const now = new Date().toISOString();
  if (storageConfig().mode === 'memory') {
    const state = memory();
    state.responses.set(responseId, {
      id: responseId,
      deckId: record.deckId,
      deckVersionId: record.deckVersionId,
      status: 'started',
      respondentName: '',
      respondentEmail: '',
      respondentRole: '',
      answers: [],
      startedAt: now,
      updatedAt: now,
      submittedAt: null,
    });
    state.events.push({ responseId, eventType: 'started', createdAt: now });
    persistMemory(state);
  } else {
    await ensureSchema();
    const db = sql();
    await db`INSERT INTO ask_responses (id, deck_id, deck_version_id, status)
      VALUES (${responseId}, ${record.deckId}, ${record.deckVersionId}, 'started')`;
    await db`INSERT INTO ask_response_events (response_id, event_type, summary)
      VALUES (${responseId}, 'started', 'Respondent started answer flow.')`;
  }
  return {
    responseId,
    deckId: record.deckId,
    deckVersionId: record.deckVersionId,
    deck: publicDeckPayload(record, true),
  };
}

async function submitResponse({ responseId, answers }) {
  const cleanResponseId = cleanSingleLine(responseId, 80);
  if (!cleanResponseId) throw makeHttpError(400, 'Missing response.');

  if (storageConfig().mode === 'memory') {
    const state = memory();
    const response = state.responses.get(cleanResponseId);
    if (!response) throw makeHttpError(404, 'Response not found.');
    if (response.status !== 'started') throw makeHttpError(409, 'This response has already been submitted.');
    const deck = state.decksById.get(response.deckId);
    const normalized = normalizeSubmittedAnswers(deck.schemaJson, answers);
    const respondent = respondentFromAnswers(normalized);
    response.answers = normalized;
    response.respondentName = respondent.name;
    response.respondentEmail = respondent.email;
    response.respondentRole = respondent.role;
    response.status = 'submitted';
    response.submittedAt = new Date().toISOString();
    response.updatedAt = response.submittedAt;
    state.events.push({ responseId: response.id, eventType: 'submitted', createdAt: response.submittedAt });
    persistMemory(state);
    return responseSummary(response, deck);
  }

  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT r.id, r.deck_id, r.deck_version_id, r.status, d.title, d.client_label, v.schema_json
    FROM ask_responses r
    JOIN ask_decks d ON d.id = r.deck_id
    JOIN ask_deck_versions v ON v.id = r.deck_version_id
    WHERE r.id = ${cleanResponseId}
    LIMIT 1`;
  if (!rows.length) throw makeHttpError(404, 'Response not found.');
  const row = rows[0];
  if (row.status !== 'started') throw makeHttpError(409, 'This response has already been submitted.');
  const normalized = normalizeSubmittedAnswers(row.schema_json, answers);
  const respondent = respondentFromAnswers(normalized);

  const claimed = await db`UPDATE ask_responses
    SET status = 'submitted', respondent_name = ${respondent.name}, respondent_email = ${respondent.email}, respondent_role = ${respondent.role}, submitted_at = now(), updated_at = now()
    WHERE id = ${cleanResponseId} AND status = 'started'
    RETURNING id`;
  if (!claimed.length) throw makeHttpError(409, 'This response has already been submitted.');

  for (const answer of normalized) {
    await db`INSERT INTO ask_answers (response_id, question_ref, answer_type, value_json, status, creates_followup, requires_review, answered_at)
      VALUES (${cleanResponseId}, ${answer.questionRef}, ${answer.answerType}, ${JSON.stringify(answer.value)}::jsonb, ${answer.status}, ${answer.createsFollowup}, ${answer.requiresReview}, now())
      ON CONFLICT (response_id, question_ref)
      DO UPDATE SET value_json = EXCLUDED.value_json, status = EXCLUDED.status, creates_followup = EXCLUDED.creates_followup, requires_review = EXCLUDED.requires_review, answered_at = EXCLUDED.answered_at`;
  }
  await db`INSERT INTO ask_response_events (response_id, event_type, summary)
    VALUES (${cleanResponseId}, 'submitted', 'Respondent submitted answers.')`;
  return {
    id: cleanResponseId,
    deckId: row.deck_id,
    deckVersionId: row.deck_version_id,
    deckTitle: row.title,
    clientLabel: row.client_label,
    status: 'submitted',
    respondentName: respondent.name,
    respondentEmail: respondent.email,
    respondentRole: respondent.role,
    answers: normalized,
  };
}

function answerLabel(question, answer) {
  if (!answer) return '';
  if (question.type === 'identity') {
    return `${answer.value.name || 'Unnamed'} <${answer.value.email || 'no email'}>${answer.value.role ? `, ${answer.value.role}` : ''}`;
  }
  if (question.type === 'multi_choice') {
    const choices = choiceMap(question);
    return (answer.value || []).map((ref) => choices.get(ref)?.label || ref).join(', ');
  }
  if (question.type === 'single_choice' || question.type === 'yes_no') {
    return choiceMap(question).get(answer.value)?.label || answer.value || '';
  }
  if (question.type === 'approval_checkbox') return answer.value ? question.approvalText || 'Approved' : 'Not approved';
  return String(answer.value || '');
}

function responseSummary(response, deck) {
  const answers = response.answers || [];
  const questions = questionMap(deck.schemaJson);
  return {
    id: response.id,
    deckId: response.deckId,
    deckVersionId: response.deckVersionId,
    deckTitle: deck.title,
    clientLabel: deck.clientLabel,
    status: response.status,
    respondentName: response.respondentName,
    respondentEmail: response.respondentEmail,
    respondentRole: response.respondentRole,
    startedAt: response.startedAt,
    submittedAt: response.submittedAt,
    updatedAt: response.updatedAt,
    followupCount: answers.filter((answer) => answer.createsFollowup || answer.requiresReview).length,
    approvalCount: answers.filter((answer) => questions.get(answer.questionRef)?.type === 'approval_checkbox' && answer.value === true).length,
    answers: answers.map((answer) => {
      const question = questions.get(answer.questionRef) || {};
      return {
        questionRef: answer.questionRef,
        prompt: question.prompt || answer.questionRef,
        section: question.section || '',
        answerType: answer.answerType,
        value: answer.value,
        label: answerLabel(question, answer),
        status: answer.status,
        createsFollowup: answer.createsFollowup,
        requiresReview: answer.requiresReview,
        answeredAt: answer.answeredAt,
      };
    }),
  };
}

async function listResponses() {
  if (storageConfig().mode === 'memory') {
    const state = memory();
    return Array.from(state.responses.values())
      .map((response) => responseSummary(response, state.decksById.get(response.deckId)))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  await seedIfEmpty();
  const db = sql();
  const rows = await db`SELECT r.id, r.deck_id, r.deck_version_id, r.status, r.respondent_name, r.respondent_email, r.respondent_role,
      r.started_at, r.submitted_at, r.updated_at, d.title, d.client_label, v.schema_json,
      COALESCE(json_agg(json_build_object(
        'questionRef', a.question_ref,
        'answerType', a.answer_type,
        'value', a.value_json,
        'status', a.status,
        'createsFollowup', a.creates_followup,
        'requiresReview', a.requires_review,
        'answeredAt', a.answered_at
      ) ORDER BY a.answered_at) FILTER (WHERE a.id IS NOT NULL), '[]'::json) AS answers
    FROM ask_responses r
    JOIN ask_decks d ON d.id = r.deck_id
    JOIN ask_deck_versions v ON v.id = r.deck_version_id
    LEFT JOIN ask_answers a ON a.response_id = r.id
    GROUP BY r.id, d.title, d.client_label, v.schema_json
    ORDER BY r.updated_at DESC
    LIMIT 100`;
  return rows.map((row) => responseSummary({
    id: row.id,
    deckId: row.deck_id,
    deckVersionId: row.deck_version_id,
    status: row.status,
    respondentName: row.respondent_name,
    respondentEmail: row.respondent_email,
    respondentRole: row.respondent_role,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    answers: row.answers.map((answer) => ({
      questionRef: answer.questionRef,
      answerType: answer.answerType,
      value: answer.value,
      status: answer.status,
      createsFollowup: answer.createsFollowup,
      requiresReview: answer.requiresReview,
      answeredAt: answer.answeredAt,
    })),
  }, {
    title: row.title,
    clientLabel: row.client_label,
    schemaJson: row.schema_json,
  }));
}

async function getResponse(idValue) {
  const cleanId = cleanSingleLine(idValue, 80);
  const responses = await listResponses();
  const response = responses.find((candidate) => candidate.id === cleanId);
  if (!response) throw makeHttpError(404, 'Response not found.');
  return response;
}

function markdownEscape(value) {
  return cleanText(value, 4000)
    .replace(/[<>]/g, '')
    .replace(/[`*_#[\]()|]/g, '\\$&')
    .replace(/\n+/g, ' / ');
}

function responseMarkdown(response) {
  const lines = [];
  lines.push(`# ${markdownEscape(response.deckTitle)} response summary`);
  lines.push('');
  lines.push(`Client: ${markdownEscape(response.clientLabel || 'Unknown')}`);
  lines.push(`Respondent: ${markdownEscape(response.respondentName || 'Unknown')} <${markdownEscape(response.respondentEmail || 'no email')}>${response.respondentRole ? `, ${markdownEscape(response.respondentRole)}` : ''}`);
  lines.push(`Status: ${markdownEscape(response.status)}`);
  lines.push(`Submitted: ${markdownEscape(response.submittedAt || 'not submitted')}`);
  lines.push('');
  lines.push('## Needs follow-up');
  const followups = response.answers.filter((answer) => answer.createsFollowup || answer.requiresReview);
  if (!followups.length) lines.push('- None recorded.');
  followups.forEach((answer) => lines.push(`- ${markdownEscape(answer.prompt)}: ${markdownEscape(answer.label)}`));
  lines.push('');
  lines.push('## Answers');
  response.answers.forEach((answer) => {
    lines.push(`### ${markdownEscape(answer.prompt)}`);
    lines.push('');
    lines.push(markdownEscape(answer.label || JSON.stringify(answer.value)) || 'No answer recorded.');
    if (answer.requiresReview) lines.push('\nReview needed before treating this as settled.');
    lines.push('');
  });
  lines.push('## Boundary');
  lines.push('This summary is evidence for human review. It should not update a workboard or trigger an external action automatically.');
  return `${lines.join('\n').trim()}\n`;
}

module.exports = {
  storageConfig,
  ensureSchema,
  seedIfEmpty,
  cleanSlug,
  publicDeck,
  startResponse,
  submitResponse,
  normalizeDeckImport,
  createDeckFromImport,
  listDecks,
  listResponses,
  getResponse,
  responseMarkdown,
  normalizeSeed,
  _memory: memory,
};
