-- Hookcrow hybrid (embed playback + transient-analysis) migration
-- Run against the hookcrow project (zvtgcscnaceclmbwhmbf):
--   psql "postgresql://postgres:[REDACTED-DB-PASSWORD]@db.zvtgcscnaceclmbwhmbf.supabase.co:5432/postgres" -v ON_ERROR_STOP=1 -f ~/projects/hookcrow_hybrid_migration.sql
--
-- Embed rows store NO mp4 (video_path NULL) and reference the original via source_url;
-- thumbnail_url holds the external (TikTok oEmbed) thumbnail, distinct from thumbnail_path
-- which is a Supabase Storage path used by uploaded/owned videos.
BEGIN;

ALTER TABLE public.videos ALTER COLUMN video_path DROP NOT NULL;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS thumbnail_url text;

COMMIT;
