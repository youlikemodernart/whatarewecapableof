-- Add explicit original-retention and sanitized-publication representations.
-- Apply to the isolated Ask Preview database before deploying this source.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'ask_uploads' AND column_name = 'metadata_policy'
  ) THEN
    ALTER TABLE ask_uploads ADD COLUMN metadata_policy TEXT NOT NULL DEFAULT 'preserve';
    ALTER TABLE ask_uploads ALTER COLUMN metadata_policy SET DEFAULT 'strip';
  END IF;
END $$;
ALTER TABLE ask_uploads ADD COLUMN IF NOT EXISTS publication_pathname TEXT NOT NULL DEFAULT '';
ALTER TABLE ask_uploads ADD COLUMN IF NOT EXISTS publication_blob_url TEXT NOT NULL DEFAULT '';
ALTER TABLE ask_uploads ADD COLUMN IF NOT EXISTS publication_content_type TEXT NOT NULL DEFAULT '';
ALTER TABLE ask_uploads ADD COLUMN IF NOT EXISTS publication_size_bytes BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ask_uploads ADD COLUMN IF NOT EXISTS original_status TEXT NOT NULL DEFAULT 'retained';

ALTER TABLE ask_uploads DROP CONSTRAINT IF EXISTS ask_uploads_metadata_policy_check;
ALTER TABLE ask_uploads ADD CONSTRAINT ask_uploads_metadata_policy_check
  CHECK (metadata_policy IN ('strip', 'preserve', 'preserve_with_derivative'));
ALTER TABLE ask_uploads DROP CONSTRAINT IF EXISTS ask_uploads_publication_size_bytes_check;
ALTER TABLE ask_uploads ADD CONSTRAINT ask_uploads_publication_size_bytes_check
  CHECK (publication_size_bytes >= 0 AND publication_size_bytes <= 10485760);
ALTER TABLE ask_uploads DROP CONSTRAINT IF EXISTS ask_uploads_original_status_check;
ALTER TABLE ask_uploads ADD CONSTRAINT ask_uploads_original_status_check
  CHECK (original_status IN ('retained', 'delete_pending', 'deleted'));

CREATE UNIQUE INDEX IF NOT EXISTS ask_uploads_publication_pathname_idx
  ON ask_uploads (publication_pathname) WHERE publication_pathname <> '';
