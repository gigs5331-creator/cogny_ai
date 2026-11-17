ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_decks_archived_at ON public.decks(archived_at);