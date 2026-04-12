-- Migration 004: Freemium paywall
--
-- Adds:
--   - profiles: subscription_status, stripe_customer_id, subscription_id,
--               current_period_end, plan (Stripe-powered subscription state)
--   - videos.is_premium flag (admin curates which recipes require Pro)
--   - has_pro(uid) helper for server + RLS decisions
--
-- Browse remains open to all authed users regardless of premium (locked cards
-- show a lock badge). The recipe-detail endpoint server-side redacts content
-- when the viewer lacks Pro, so no RLS changes are required on videos/segments.

-- -----------------------------------------------------------------------------
-- profiles: subscription state
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'free'
    CHECK (subscription_status IN ('free', 'active', 'past_due', 'canceled')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS subscription_id text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamp with time zone,
  ADD COLUMN IF NOT EXISTS plan text CHECK (plan IN ('monthly', 'annual'));

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles(stripe_customer_id);

-- -----------------------------------------------------------------------------
-- videos.is_premium
-- -----------------------------------------------------------------------------
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_videos_is_premium ON public.videos(is_premium);

-- -----------------------------------------------------------------------------
-- has_pro(uid) helper — true when the user has an active subscription.
-- Admins should not rely on this; they are gated by is_admin() instead.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_pro(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND subscription_status = 'active'
  );
$$;

-- -----------------------------------------------------------------------------
-- Expose is_premium from the search_videos RPC so the browse grid can render
-- lock badges without a second round-trip.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_videos(TEXT, TEXT[], UUID, INT, INT);

CREATE OR REPLACE FUNCTION public.search_videos(
  search_query TEXT DEFAULT NULL,
  tag_filter TEXT[] DEFAULT NULL,
  logic_flow_filter UUID DEFAULT NULL,
  result_limit INT DEFAULT 24,
  result_offset INT DEFAULT 0
) RETURNS TABLE (
  id UUID,
  title TEXT,
  creator_handle TEXT,
  platform TEXT,
  video_path TEXT,
  duration_seconds INT,
  logic_flow_id UUID,
  semantic_tags TEXT[],
  status TEXT,
  is_premium BOOLEAN,
  created_at TIMESTAMPTZ,
  logic_flow_name TEXT,
  logic_flow_description TEXT,
  search_rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id, v.title, v.creator_handle, v.platform, v.video_path,
    v.duration_seconds, v.logic_flow_id, v.semantic_tags, v.status,
    v.is_premium,
    v.created_at,
    lf.name AS logic_flow_name,
    lf.description AS logic_flow_description,
    CASE
      WHEN search_query IS NOT NULL AND search_query != ''
        THEN ts_rank(v.search_document, websearch_to_tsquery('english', search_query))
      ELSE 0
    END AS search_rank
  FROM public.videos v
  LEFT JOIN public.logic_flows lf ON v.logic_flow_id = lf.id
  WHERE v.is_published = true
    AND v.status = 'complete'
    AND (search_query IS NULL OR search_query = ''
         OR v.search_document @@ websearch_to_tsquery('english', search_query))
    AND (tag_filter IS NULL OR v.semantic_tags && tag_filter)
    AND (logic_flow_filter IS NULL OR v.logic_flow_id = logic_flow_filter)
  ORDER BY
    CASE
      WHEN search_query IS NOT NULL AND search_query != ''
        THEN ts_rank(v.search_document, websearch_to_tsquery('english', search_query))
      ELSE 0
    END DESC,
    v.updated_at DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$ LANGUAGE plpgsql STABLE;
