-- Ask hosted MVP schema.
-- Local skeleton only. Run against a review database only after an explicit approval gate.

CREATE TABLE IF NOT EXISTS ask_users (
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
);

CREATE TABLE IF NOT EXISTS ask_decks (
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
);

CREATE TABLE IF NOT EXISTS ask_deck_versions (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL REFERENCES ask_decks(id),
  version_label TEXT NOT NULL DEFAULT 'v1',
  schema_json JSONB NOT NULL,
  schema_sha256 TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES ask_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deck_id, version_label)
);

CREATE TABLE IF NOT EXISTS ask_responses (
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
);

CREATE INDEX IF NOT EXISTS ask_responses_deck_idx ON ask_responses (deck_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ask_responses_status_idx ON ask_responses (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS ask_answers (
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
);

CREATE INDEX IF NOT EXISTS ask_answers_response_idx ON ask_answers (response_id);
CREATE INDEX IF NOT EXISTS ask_answers_followup_idx ON ask_answers (requires_review, creates_followup);

CREATE TABLE IF NOT EXISTS ask_answer_packets (
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES ask_responses(id) ON DELETE CASCADE,
  packet_kind TEXT NOT NULL DEFAULT 'markdown',
  content_sha256 TEXT NOT NULL DEFAULT '',
  packet_text TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT REFERENCES ask_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ask_answer_packets_response_idx ON ask_answer_packets (response_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ask_deck_events (
  id BIGSERIAL PRIMARY KEY,
  deck_id TEXT REFERENCES ask_decks(id),
  actor_user_id TEXT REFERENCES ask_users(id),
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ask_response_events (
  id BIGSERIAL PRIMARY KEY,
  response_id TEXT REFERENCES ask_responses(id),
  actor_user_id TEXT REFERENCES ask_users(id),
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ask_deck_events_deck_idx ON ask_deck_events (deck_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ask_response_events_response_idx ON ask_response_events (response_id, created_at DESC);
