-- Add server-bound private headshot upload metadata.
-- Apply only after the production Blob store and deployment action are approved.

CREATE TABLE IF NOT EXISTS ask_uploads (
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES ask_responses(id) ON DELETE CASCADE,
  deck_version_id TEXT NOT NULL REFERENCES ask_deck_versions(id),
  question_ref TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  pathname TEXT NOT NULL UNIQUE,
  blob_url TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CHECK (status IN ('pending', 'completed', 'replaced', 'failed')),
  CHECK (size_bytes >= 0 AND size_bytes <= 10485760)
);

CREATE INDEX IF NOT EXISTS ask_uploads_response_idx ON ask_uploads (response_id, question_ref, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ask_uploads_active_idx ON ask_uploads (response_id, question_ref) WHERE active = TRUE;
