-- Migration 011: profiles.cancel_at_period_end
--
-- Adds the cancel_at_period_end mirror column so the Stripe subscription sync
-- (server/utils/stripe.ts :: syncSubscriptionFromFields) can persist the flag
-- and tell apart a scheduled cancellation from an active subscription. Without
-- it the webhook and sync-session paths both fail with
--   column profiles.cancel_at_period_end does not exist
-- when Stripe fires customer.subscription.created/updated.
--
-- 004_paywall.sql added the rest of the subscription columns but predates this
-- flag; schema.sql already carries it inline, so new environments are fine —
-- this migration only matters for environments created before the flag landed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
