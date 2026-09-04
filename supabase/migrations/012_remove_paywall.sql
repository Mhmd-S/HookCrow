-- Migration 012: Remove the paywall
--
-- TARGET PROJECT: hookcrow (ref zvtgcscnaceclmbwhmbf, eu-west-1)
-- Do NOT run this against mentionshero (zzrfputwswchnnjxgeih) — the refs look
-- alike. The guard below aborts the whole script if the schema isn't Hookcrow's.
--
-- The library is now free for everyone. This tears down every Stripe/billing
-- object added by 004_paywall.sql, 010_stripe_wrapper.sql and
-- 011_profiles_cancel_at_period_end.sql.
--
-- KEPT on purpose:
--   - videos.is_premium — now an editorial-only flag the admin UI still
--     filters and toggles on. It no longer gates anything.
--   - search_videos(...) — still returns is_premium for the admin surfaces.
--
-- Destructive: the profiles subscription columns and their data are dropped.
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

  RAISE NOTICE 'Guard passed — Hookcrow schema detected. Applying 012_remove_paywall.';
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Stripe Wrapper (010) — views, foreign tables, server, wrapper
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_stripe_checkout_sessions;
DROP VIEW IF EXISTS public.v_stripe_subscriptions;
DROP VIEW IF EXISTS public.v_stripe_invoices;

DROP SCHEMA IF EXISTS stripe CASCADE;

DROP SERVER IF EXISTS stripe_server CASCADE;
DROP FOREIGN DATA WRAPPER IF EXISTS stripe_wrapper CASCADE;

-- -----------------------------------------------------------------------------
-- 2. has_pro() helper (004)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.has_pro(uuid);

-- -----------------------------------------------------------------------------
-- 3. profiles subscription columns (004 + 011)
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_profiles_stripe_customer_id;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS subscription_status,
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS subscription_id,
  DROP COLUMN IF EXISTS current_period_end,
  DROP COLUMN IF EXISTS cancel_at_period_end,
  DROP COLUMN IF EXISTS plan;

COMMIT;

-- -----------------------------------------------------------------------------
-- 4. Vault secret (manual, optional)
-- -----------------------------------------------------------------------------
-- The Stripe key stored for the wrapper is NOT dropped here — deleting vault
-- secrets is irreversible and outside this migration's scope. Remove it by hand
-- if you want it gone:
--   SELECT vault.delete_secret(id) FROM vault.secrets WHERE name = 'stripe';
