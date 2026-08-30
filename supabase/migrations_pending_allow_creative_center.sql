-- Allow 'creative_center' as a discovery source type.
--
-- Why: server/api/admin/discovery/sources.post.ts accepts this type and the
-- admin UI defaults to it, but hookcrow_discovery_migration.sql:11 constrains
-- type to ('hashtag','profile','search'). Creating one currently fails with
-- SQLSTATE 23514. The single enabled source in the live DB is a creative_center
-- row, so discovery cannot ingest anything until this runs.
--
-- Safe to re-run. Additive only: widens the allowed set, drops no data.

ALTER TABLE public.discovery_sources
  DROP CONSTRAINT IF EXISTS discovery_sources_type_check;

ALTER TABLE public.discovery_sources
  ADD CONSTRAINT discovery_sources_type_check
  CHECK (type IN ('hashtag', 'profile', 'search', 'creative_center'));

-- Verify:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.discovery_sources'::regclass
--     AND conname = 'discovery_sources_type_check';
