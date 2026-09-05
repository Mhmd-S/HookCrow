-- Hookcrow — Auto-Discovery (Option B) migration
-- Run against the hookcrow project (zvtgcscnaceclmbwhmbf):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ~/projects/hookcrow_discovery_migration.sql
--
-- Adds source management + run log for scheduled discovery, and a source_url
-- index for fast dedup (the app checks source_url before ingesting).
BEGIN;

CREATE TABLE IF NOT EXISTS public.discovery_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL CHECK (type IN ('hashtag','profile','search')),
  value         text NOT NULL,               -- e.g. 'saasmarketing' | '@garyvee' | 'cold email hook'
  enabled       boolean NOT NULL DEFAULT true,
  max_per_run   integer NOT NULL DEFAULT 15,
  cadence_hours integer NOT NULL DEFAULT 24,
  last_run_at   timestamptz,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (type, value)
);

CREATE TABLE IF NOT EXISTS public.discovery_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid REFERENCES public.discovery_sources(id) ON DELETE CASCADE,
  started_at  timestamptz DEFAULT now(),
  finished_at timestamptz,
  found       integer DEFAULT 0,
  ingested    integer DEFAULT 0,
  skipped     integer DEFAULT 0,
  failed      integer DEFAULT 0,
  error       text
);

-- Fast dedup lookups by source_url (app checks this before ingesting).
CREATE INDEX IF NOT EXISTS videos_source_url_idx
  ON public.videos (source_url) WHERE source_url IS NOT NULL;

GRANT ALL ON public.discovery_sources TO service_role;
GRANT ALL ON public.discovery_runs TO service_role;

COMMIT;

-- OPTIONAL hard dedup guard (prevents a race where two runs ingest the same URL).
-- Run ONLY after confirming there are no existing duplicates:
--   SELECT source_url, count(*) FROM public.videos
--     WHERE source_url IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
-- Once clean:
--   CREATE UNIQUE INDEX videos_source_url_key
--     ON public.videos (source_url) WHERE source_url IS NOT NULL;
