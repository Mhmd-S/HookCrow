-- Migration 013: Admin-only accounts
--
-- TARGET PROJECT: hookcrow (ref zvtgcscnaceclmbwhmbf, eu-west-1)
-- Do NOT run this against mentionshero (zzrfputwswchnnjxgeih) — the refs look
-- alike. The guard below aborts the whole script if the schema isn't Hookcrow's.
--
-- The site no longer has user accounts: everything is readable anonymously and
-- `admin` is the only role that logs in. This drops the bookmarks feature
-- (005_bookmarks.sql), which was the last thing a non-admin account was for.
--
-- KEPT on purpose:
--   - public.profiles — still carries the admin `role` that gates /admin.
--
-- Destructive: the bookmarks table and its rows are dropped.
-- Everything runs in one transaction — if any step fails, nothing is applied.

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guard — abort unless this really is the Hookcrow database
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos'
      AND column_name = 'skeletal_logic'
  )
  OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'logic_flows'
  )
  OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'segments'
  )
  THEN
    RAISE EXCEPTION
      'Refusing to run: this does not look like the Hookcrow database (expected public.videos.skeletal_logic + public.logic_flows + public.segments). Check which project you are connected to.';
  END IF;

  RAISE NOTICE 'Guard passed — Hookcrow schema detected. Applying 013_admin_only_auth.';
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. bookmarks (005) — table, indexes and RLS policies go with it
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.bookmarks CASCADE;

COMMIT;

-- -----------------------------------------------------------------------------
-- 2. Non-admin auth users (manual, optional)
-- -----------------------------------------------------------------------------
-- Sign-up is gone, so any existing non-admin account can no longer do anything.
-- Review before deleting anything:
--   SELECT id, email, role FROM public.profiles WHERE role <> 'admin';
-- Removing them is an auth.users operation — do it from the Supabase dashboard
-- (Authentication -> Users) so the auth schema stays consistent.
