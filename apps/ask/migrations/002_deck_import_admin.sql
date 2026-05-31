-- Ask deck import/admin management support.
-- Adds recoverable encrypted respondent slug storage for admin deck links.
-- The lookup path still uses public_slug_hash.

ALTER TABLE ask_decks
  ADD COLUMN IF NOT EXISTS public_slug_ciphertext TEXT NOT NULL DEFAULT '';
