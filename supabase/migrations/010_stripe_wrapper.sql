-- Migration 010: Supabase Stripe Wrapper
--
-- Exposes Stripe objects as Postgres foreign tables so server endpoints can
-- read Checkout Sessions, Subscriptions, and Invoices via SQL instead of the
-- Stripe Node SDK. The wrapper is *complementary* to the existing webhook
-- handler, not a replacement:
--
--   - Webhook stays on the Stripe SDK in server/api/stripe/webhook.post.ts
--     (the wrapper cannot verify webhook signatures and cannot be triggered
--     by Stripe events).
--   - Checkout + Billing Portal session creation stays on the Stripe SDK
--     (the wrapper is read-only for those objects).
--   - The profiles-table subscription mirror (subscription_status / plan /
--     current_period_end / cancel_at_period_end) remains source-of-truth for
--     hot-path reads — every wrapper SELECT is a live Stripe API call.
--
-- What this migration enables:
--   1. server/api/stripe/sync-session.post.ts reads Checkout Session +
--      Subscription via public views instead of stripe.checkout.sessions
--      .retrieve() / stripe.subscriptions.retrieve().
--   2. server/api/billing/invoices.get.ts (new) exposes Stripe invoice
--      history directly — the mirror doesn't store that.
--
-- Prerequisites (run ONCE, manually, in the Supabase SQL editor BEFORE
-- applying this migration):
--
--   SELECT vault.create_secret(
--     'sk_test_...',   -- or sk_live_...
--     'stripe',
--     'Stripe secret key for Wrappers FDW'
--   );
--
-- The foreign server below references that secret by name ('stripe'), so the
-- migration itself never sees the key. Rotate by updating the vault secret
-- value; no migration re-run needed.

-- 1. Extensions --------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS wrappers WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- 2. FDW handler -------------------------------------------------------------
-- CREATE FOREIGN DATA WRAPPER has no IF NOT EXISTS form; guard manually so
-- this migration is safe to reapply.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_foreign_data_wrapper WHERE fdwname = 'stripe_wrapper') THEN
    CREATE FOREIGN DATA WRAPPER stripe_wrapper
      HANDLER stripe_fdw_handler
      VALIDATOR stripe_fdw_validator;
  END IF;
END $$;

-- 3. Foreign server ----------------------------------------------------------
-- Resolves the Stripe key from Vault by name. api_version pinned to match
-- the value in server/utils/stripe.ts (useServerStripe apiVersion option) so
-- wrapper responses and SDK responses reference the same object shape.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_foreign_server WHERE srvname = 'stripe_server') THEN
    CREATE SERVER stripe_server
      FOREIGN DATA WRAPPER stripe_wrapper
      OPTIONS (
        api_key_name 'stripe',
        api_url 'https://api.stripe.com/v1/',
        api_version '2025-09-30.clover'
      );
  END IF;
END $$;

-- 4. Stripe schema + foreign tables ------------------------------------------
-- Scoped import — only the objects the app reads. Re-importing would raise
-- "relation already exists"; drop and re-import so the migration is
-- reapplyable without manual cleanup.
CREATE SCHEMA IF NOT EXISTS stripe;

DROP FOREIGN TABLE IF EXISTS stripe.checkout_sessions;
DROP FOREIGN TABLE IF EXISTS stripe.subscriptions;
DROP FOREIGN TABLE IF EXISTS stripe.invoices;
DROP FOREIGN TABLE IF EXISTS stripe.customers;
DROP FOREIGN TABLE IF EXISTS stripe.prices;
DROP FOREIGN TABLE IF EXISTS stripe.products;

IMPORT FOREIGN SCHEMA stripe
  LIMIT TO (checkout_sessions, subscriptions, invoices, customers, prices, products)
  FROM SERVER stripe_server INTO stripe;

-- 5. Public views ------------------------------------------------------------
-- supabase-js only sees the `public` schema by default. These views flatten
-- the fields the app actually reads out of the `attrs` jsonb column, so the
-- Nuxt endpoints can do ordinary .from('v_stripe_...').select(...) calls.

CREATE OR REPLACE VIEW public.v_stripe_checkout_sessions AS
SELECT
  cs.id,
  cs.customer,
  cs.attrs->>'client_reference_id' AS client_reference_id,
  cs.attrs->>'subscription'        AS subscription,
  cs.attrs->>'payment_status'      AS payment_status
FROM stripe.checkout_sessions cs;

CREATE OR REPLACE VIEW public.v_stripe_subscriptions AS
SELECT
  s.id,
  s.customer,
  s.current_period_end,
  s.attrs->>'status'                                        AS status,
  (s.attrs->>'cancel_at_period_end')::boolean               AS cancel_at_period_end,
  s.attrs#>>'{items,data,0,price,recurring,interval}'       AS interval,
  s.attrs#>>'{metadata,profile_id}'                         AS metadata_profile_id
FROM stripe.subscriptions s;

CREATE OR REPLACE VIEW public.v_stripe_invoices AS
SELECT
  i.id,
  i.customer,
  i.subscription,
  i.status,
  i.total,
  i.currency,
  i.period_start,
  i.period_end,
  i.created,
  i.attrs->>'number'              AS number,
  (i.attrs->>'amount_paid')::bigint AS amount_paid,
  (i.attrs->>'amount_due')::bigint  AS amount_due,
  i.attrs->>'hosted_invoice_url'  AS hosted_invoice_url,
  i.attrs->>'invoice_pdf'         AS invoice_pdf
FROM stripe.invoices i;

-- 6. Permissions -------------------------------------------------------------
-- Views inherit the wrapper's Stripe-API-scoped privileges. Server endpoints
-- in this app use the service_role key (RLS enabled on all tables but no
-- policies = service_role only); keep that posture for wrapper data too.
REVOKE ALL ON public.v_stripe_checkout_sessions FROM PUBLIC;
REVOKE ALL ON public.v_stripe_subscriptions     FROM PUBLIC;
REVOKE ALL ON public.v_stripe_invoices          FROM PUBLIC;

GRANT SELECT ON public.v_stripe_checkout_sessions TO service_role;
GRANT SELECT ON public.v_stripe_subscriptions     TO service_role;
GRANT SELECT ON public.v_stripe_invoices          TO service_role;
