-- =============================================================================
-- Hookcrow (Video Anatomizer) — LOCAL REHEARSAL: co-locate under named schema
-- =============================================================================
-- Applied via psql against Insteshop's LOCAL Supabase (Postgres 15).
-- Every app object lives in schema `public`. Nothing here touches `public`.
-- Shared references (auth.*, extensions.*) are preserved as-is.
--
-- Reconciled from:
--   supabase/schema.sql (base, fully-qualified public.)
--   + 001_add_template_markdown (logic_flows.template_markdown, updated_at, idx)
--   + 003_admin_cms_rewrite    (videos.user_id -> created_by, thumbnail_path,
--                               published_at, is_admin, RLS)
--   + 004_paywall              (profiles subscription cols, videos.is_premium,
--                               has_pro)
--   + 005_bookmarks            (bookmarks table + RLS)
--   + 006_search_document_v2   (search doc w/ segment transcripts,
--                               segments_touch_parent_video)
--   + 007_product_context      (videos.product_context + search doc rewrite -
--                               FINAL search_document trigger fn)
--   + 008_embeddings           (videos.embedding vector(768) + HNSW index)
--   + 009_search_thresholds    (search_videos recall floor)
--   + 010_search_videos_thumbnail (FINAL search_videos signature w/ thumbnail_path)
--   + 011_profiles_cancel_at_period_end (already inline in schema.sql)
--
-- SKIPPED (see task): 010_stripe_wrapper.sql entirely — foreign data wrapper,
--   `stripe` foreign schema, stripe_server, vault secret, v_stripe_* views.
-- =============================================================================

BEGIN;

-- Required extensions (idempotent, into the shared `extensions` schema) --------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector      WITH SCHEMA extensions;

-- Named schema ----------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS public;

SET LOCAL search_path TO public, extensions, public;

-- -----------------------------------------------------------------------------
-- Shared helper: update_updated_at (namespaced under public)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- logic_flows
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.logic_flows (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  description text,
  template_markdown text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logic_flows_updated_at
  ON public.logic_flows(updated_at);

DROP TRIGGER IF EXISTS logic_flows_updated_at ON public.logic_flows;
CREATE TRIGGER logic_flows_updated_at
  BEFORE UPDATE ON public.logic_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------------------------------------------------------
-- profiles (subscription state reconciled from 004 + 011; FK to shared auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  subscription_status text NOT NULL DEFAULT 'free'
    CHECK (subscription_status IN ('free', 'active', 'past_due', 'canceled')),
  stripe_customer_id text,
  subscription_id text,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  plan text CHECK (plan IN ('monthly', 'annual')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles(stripe_customer_id);

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------------------------------------------------------
-- videos (created_by per 003; is_premium/published_at per 003/004;
--         product_context per 007; embedding per 008)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.videos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text,
  description text,
  creator_handle text,
  platform text CHECK (platform IN ('TikTok', 'Instagram', 'YouTube Shorts')),
  source_url text,
  video_path text NOT NULL,
  thumbnail_path text,
  duration_seconds integer,
  logic_flow_id uuid REFERENCES public.logic_flows(id) ON DELETE SET NULL,
  script_raw text,
  script_blueprint text,
  skeletal_logic jsonb,
  audio_analysis jsonb,
  visual_analysis jsonb,
  semantic_tags text[],
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
  is_published boolean NOT NULL DEFAULT false,
  is_premium boolean NOT NULL DEFAULT false,
  published_at timestamp with time zone,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  product_context jsonb,
  embedding extensions.vector(768),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  search_document tsvector
);

CREATE INDEX IF NOT EXISTS idx_videos_is_published ON public.videos(is_published);
CREATE INDEX IF NOT EXISTS idx_videos_is_premium   ON public.videos(is_premium);
CREATE INDEX IF NOT EXISTS idx_videos_logic_flow_id ON public.videos(logic_flow_id);
CREATE INDEX IF NOT EXISTS idx_videos_created_by   ON public.videos(created_by);
CREATE INDEX IF NOT EXISTS idx_videos_search_document
  ON public.videos USING GIN (search_document);
CREATE INDEX IF NOT EXISTS idx_videos_embedding
  ON public.videos USING hnsw (embedding extensions.vector_cosine_ops);

DROP TRIGGER IF EXISTS videos_updated_at ON public.videos;
CREATE TRIGGER videos_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------------------------------------------------------
-- segments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.segments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  segment_order integer NOT NULL,
  label text NOT NULL CHECK (label IN ('Hook', 'Bridge', 'Value', 'Proof', 'CTA')),
  start_time double precision NOT NULL CHECK (start_time >= 0),
  end_time double precision NOT NULL,
  transcript_raw text,
  script_blueprint text,
  visual_notes text,
  tags text[],
  audio_metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT segments_time_range CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_segments_video_id ON public.segments(video_id);
CREATE INDEX IF NOT EXISTS idx_segments_order    ON public.segments(video_id, segment_order);

-- -----------------------------------------------------------------------------
-- bookmarks (005)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookmarks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id  ON public.bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_video_id ON public.bookmarks(video_id);

-- -----------------------------------------------------------------------------
-- Full-text search: videos_search_document_update() — FINAL version (007)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.videos_search_document_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  logic_flow_name TEXT := '';
  skeletal_overview TEXT := '';
  skeletal_takeaways TEXT := '';
  skeletal_techniques TEXT := '';
  visual_overview_text TEXT := '';
  visual_techniques TEXT := '';
  tags_text TEXT := '';
  segments_text TEXT := '';
  product_name TEXT := '';
  product_category TEXT := '';
  product_primary_b TEXT := '';
  product_features_text TEXT := '';
  product_competitors_text TEXT := '';
BEGIN
  -- Logic flow
  IF NEW.logic_flow_id IS NOT NULL THEN
    SELECT name INTO logic_flow_name
    FROM public.logic_flows WHERE id = NEW.logic_flow_id;
  END IF;

  -- Skeletal logic
  IF NEW.skeletal_logic IS NOT NULL THEN
    skeletal_overview := COALESCE(NEW.skeletal_logic->>'overview', '');
    skeletal_takeaways := COALESCE(
      (SELECT string_agg(elem::text, ' ')
       FROM jsonb_array_elements_text(NEW.skeletal_logic->'keyTakeaways') AS elem),
      ''
    );
    skeletal_techniques := COALESCE(
      (SELECT string_agg(
        COALESCE(seg->>'goal', '') || ' ' ||
        COALESCE(seg->>'technique', '') || ' ' ||
        COALESCE(seg->>'psychology', ''), ' ')
       FROM jsonb_array_elements(NEW.skeletal_logic->'segments') AS seg),
      ''
    );
  END IF;

  -- Visual analysis overview
  IF NEW.visual_analysis IS NOT NULL AND NEW.visual_analysis->'overview' IS NOT NULL THEN
    visual_overview_text := COALESCE(NEW.visual_analysis->'overview'->>'overall_style', '') || ' ' ||
                            COALESCE(NEW.visual_analysis->'overview'->>'editing_pace', '') || ' ' ||
                            COALESCE(NEW.visual_analysis->'overview'->>'production_quality', '');
    visual_techniques := COALESCE(
      (SELECT string_agg(elem::text, ' ')
       FROM jsonb_array_elements_text(NEW.visual_analysis->'overview'->'notable_techniques') AS elem),
      ''
    );
  END IF;

  -- Semantic tags array
  IF NEW.semantic_tags IS NOT NULL THEN
    tags_text := array_to_string(NEW.semantic_tags, ' ');
  END IF;

  -- Segment transcripts (parent is retouched by segments_touch_parent_video_trigger).
  segments_text := COALESCE(
    (SELECT string_agg(COALESCE(s.transcript_raw, ''), ' ')
     FROM public.segments s
     WHERE s.video_id = NEW.id),
    ''
  );

  -- Product context — promote to A/B so product-centric queries match reliably.
  IF NEW.product_context IS NOT NULL THEN
    product_name := COALESCE(NEW.product_context->>'product_name', '');
    product_category := COALESCE(NEW.product_context->>'product_category', '');
    product_primary_b :=
      COALESCE(NEW.product_context->>'one_liner', '') || ' ' ||
      COALESCE(NEW.product_context->>'problem_solved', '') || ' ' ||
      COALESCE(NEW.product_context->>'target_user', '');
    product_features_text := COALESCE(
      (SELECT string_agg(elem::text, ' ')
       FROM jsonb_array_elements_text(NEW.product_context->'key_features') AS elem),
      ''
    );
    product_competitors_text := COALESCE(
      (SELECT string_agg(elem::text, ' ')
       FROM jsonb_array_elements_text(NEW.product_context->'competitors_mentioned') AS elem),
      ''
    );
  END IF;

  -- Weighted tsvector.
  NEW.search_document :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(tags_text, '')), 'A') ||
    setweight(to_tsvector('simple',  COALESCE(product_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(product_category, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(logic_flow_name, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(skeletal_overview, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.creator_handle, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(product_primary_b, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(product_features_text, '')), 'B') ||
    setweight(to_tsvector('simple',  COALESCE(product_competitors_text, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(skeletal_takeaways, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(skeletal_techniques, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(visual_overview_text, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(visual_techniques, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(LEFT(NEW.script_raw, 5000), '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(LEFT(segments_text, 8000), '')), 'D');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS videos_search_document_trigger ON public.videos;
CREATE TRIGGER videos_search_document_trigger
  BEFORE INSERT OR UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.videos_search_document_update();

-- segments_touch_parent_video() (006): bump parent video so its search_document
-- picks up segment transcript changes.
CREATE OR REPLACE FUNCTION public.segments_touch_parent_video() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  target_id uuid;
BEGIN
  target_id := COALESCE(NEW.video_id, OLD.video_id);
  IF target_id IS NOT NULL THEN
    UPDATE public.videos
       SET updated_at = now()
     WHERE id = target_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS segments_touch_parent_video_trigger ON public.segments;
CREATE TRIGGER segments_touch_parent_video_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.segments
  FOR EACH ROW EXECUTE FUNCTION public.segments_touch_parent_video();

-- -----------------------------------------------------------------------------
-- search_videos() — FINAL signature w/ thumbnail_path (010). Uses pgvector
-- `<=>` operator + ts_filter; search_path pins public + extensions so the
-- vector operator resolves when the app (service_role) calls the RPC.
-- Drop-then-create because the RETURNS TABLE shape differs from any prior def.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_videos(text, extensions.vector, text[], uuid, int, int);

CREATE FUNCTION public.search_videos(
  search_query text,
  query_embedding extensions.vector(768) DEFAULT NULL,
  tag_filter text[] DEFAULT NULL,
  logic_flow_filter uuid DEFAULT NULL,
  result_limit int DEFAULT 24,
  result_offset int DEFAULT 0
) RETURNS TABLE (
  id uuid,
  title text,
  creator_handle text,
  platform text,
  video_path text,
  thumbnail_path text,
  duration_seconds int,
  logic_flow_id uuid,
  semantic_tags text[],
  status text,
  is_premium boolean,
  created_at timestamptz,
  logic_flow_name text,
  logic_flow_description text,
  search_rank real
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  ts_hit_count int := 0;
BEGIN
  IF search_query IS NOT NULL AND search_query != '' THEN
    SELECT count(*) INTO ts_hit_count
    FROM public.videos v
    WHERE v.is_published = true
      AND v.status = 'complete'
      AND (tag_filter IS NULL OR v.semantic_tags && tag_filter)
      AND (logic_flow_filter IS NULL OR v.logic_flow_id = logic_flow_filter)
      AND ts_filter(v.search_document, '{A,B}') @@ (phraseto_tsquery('english', search_query) || plainto_tsquery('english', regexp_replace(search_query, '\s+', '', 'g')));
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT v.*
    FROM public.videos v
    WHERE v.is_published = true
      AND v.status = 'complete'
      AND (tag_filter IS NULL OR v.semantic_tags && tag_filter)
      AND (logic_flow_filter IS NULL OR v.logic_flow_id = logic_flow_filter)
  ),
  ts_ranked AS (
    SELECT f.id AS vid,
           row_number() OVER (
             ORDER BY ts_rank(ts_filter(f.search_document, '{A,B}'), (phraseto_tsquery('english', search_query) || plainto_tsquery('english', regexp_replace(search_query, '\s+', '', 'g')))) DESC
           ) AS rnk
    FROM filtered f
    WHERE search_query IS NOT NULL AND search_query != ''
      AND ts_filter(f.search_document, '{A,B}') @@ (phraseto_tsquery('english', search_query) || plainto_tsquery('english', regexp_replace(search_query, '\s+', '', 'g')))
    LIMIT 80
  ),
  vec_ranked AS (
    SELECT f.id AS vid,
           row_number() OVER (ORDER BY f.embedding <=> query_embedding) AS rnk
    FROM filtered f
    WHERE ts_hit_count = 0
      AND query_embedding IS NOT NULL
      AND f.embedding IS NOT NULL
      AND (f.embedding <=> query_embedding) < 0.35
    LIMIT 40
  ),
  matched AS (
    SELECT ts.vid, ts.rnk FROM ts_ranked ts
    UNION ALL
    SELECT vr.vid, vr.rnk FROM vec_ranked vr
  )
  SELECT
    f.id, f.title, f.creator_handle, f.platform, f.video_path, f.thumbnail_path,
    f.duration_seconds, f.logic_flow_id, f.semantic_tags, f.status,
    f.is_premium, f.created_at,
    lf.name AS logic_flow_name,
    lf.description AS logic_flow_description,
    CASE
      WHEN m.rnk IS NULL THEN 0::real
      ELSE (1.0 / (60 + m.rnk))::real
    END AS search_rank
  FROM filtered f
  LEFT JOIN public.logic_flows lf ON f.logic_flow_id = lf.id
  LEFT JOIN matched m ON f.id = m.vid
  WHERE
    ((search_query IS NULL OR search_query = '') AND query_embedding IS NULL)
    OR m.vid IS NOT NULL
  ORDER BY
    CASE
      WHEN m.rnk IS NOT NULL THEN (1.0 / (60 + m.rnk))
      ELSE 0
    END DESC,
    f.updated_at DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS helper functions (namespaced). SECURITY DEFINER; search_path pinned.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.has_pro(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND subscription_status = 'active'
  );
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security (enable + policies, reconciled from 003 / 005 / schema.sql).
-- Server uses service_role (bypasses RLS); policies kept as defence-in-depth.
-- auth.uid() references preserved as-is.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logic_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks   ENABLE ROW LEVEL SECURITY;

-- bookmarks
DROP POLICY IF EXISTS "bookmarks self select" ON public.bookmarks;
DROP POLICY IF EXISTS "bookmarks self insert" ON public.bookmarks;
DROP POLICY IF EXISTS "bookmarks self delete" ON public.bookmarks;
CREATE POLICY "bookmarks self select" ON public.bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bookmarks self insert" ON public.bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bookmarks self delete" ON public.bookmarks FOR DELETE USING (auth.uid() = user_id);

-- profiles
DROP POLICY IF EXISTS "profiles self select" ON public.profiles;
DROP POLICY IF EXISTS "profiles admin select" ON public.profiles;
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
DROP POLICY IF EXISTS "profiles admin update" ON public.profiles;
CREATE POLICY "profiles self select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles admin select" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "profiles admin update" ON public.profiles FOR UPDATE USING (public.is_admin(auth.uid()));

-- logic_flows
DROP POLICY IF EXISTS "logic_flows authed select" ON public.logic_flows;
DROP POLICY IF EXISTS "logic_flows admin write" ON public.logic_flows;
CREATE POLICY "logic_flows authed select" ON public.logic_flows FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "logic_flows admin write" ON public.logic_flows FOR ALL
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- videos
DROP POLICY IF EXISTS "videos published select" ON public.videos;
DROP POLICY IF EXISTS "videos admin all" ON public.videos;
CREATE POLICY "videos published select" ON public.videos FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_published = true);
CREATE POLICY "videos admin all" ON public.videos FOR ALL
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- segments
DROP POLICY IF EXISTS "segments published select" ON public.segments;
DROP POLICY IF EXISTS "segments admin all" ON public.segments;
CREATE POLICY "segments published select" ON public.segments FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.videos v WHERE v.id = segments.video_id AND v.is_published = true
    )
  );
CREATE POLICY "segments admin all" ON public.segments FOR ALL
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- GRANTS (Supabase roles)
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT SELECT  ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL     ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL     ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL     ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT  ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

-- =============================================================================
-- SEED
-- =============================================================================

-- 8 logic flow templates (schema.sql). template_markdown backfilled per
-- 001_add_template_markdown so seeded rows carry the current shape.
INSERT INTO public.logic_flows (name, description, template_markdown) VALUES
  ('PAS (Problem-Agitation-Solution)', 'Identify a pain point, agitate it, then present the solution.',
'0-3s [Hook]: Identify the pain point with a bold statement.
3-8s [Bridge]: Agitate - make the problem feel urgent.
8-25s [Value]: Present your solution and key benefits.
25-30s [CTA]: Clear call to action.'),
  ('Us vs. Them', 'Contrast the old/wrong way with your new/better approach.',
'0-3s [Hook]: Show the old/wrong way of doing things.
3-10s [Bridge]: Contrast with the new/better approach.
10-25s [Value]: Demonstrate why your way is superior.
25-30s [CTA]: Invite viewers to try the new way.'),
  ('Listicle/Top N', 'Ranked or numbered list of tips, items, or takeaways.',
'0-3s [Hook]: Tease the list with a compelling number.
3-7s [Value]: Item 1 - quick tip or insight.
7-11s [Value]: Item 2 - another valuable point.
11-15s [Value]: Item 3 - keep the momentum.
15-19s [Value]: Item 4 - build anticipation.
19-23s [Value]: Item 5 - strongest point last.
23-30s [CTA]: Which was your favorite? Comment below.'),
  ('Mythbuster', 'Call out a common misconception and reveal the truth.',
'0-4s [Hook]: State the common myth or misconception.
4-10s [Bridge]: Explain why people believe this myth.
10-25s [Value]: Reveal the truth with evidence.
25-30s [CTA]: Share to help others learn the truth.'),
  ('Before/After', 'Show a starting state, then the transformation.',
'0-5s [Hook]: Show the "before" state - the problem.
5-10s [Bridge]: Hint at the transformation coming.
10-25s [Value]: Reveal the "after" - the solution results.
25-30s [CTA]: Want this transformation? Link in bio.'),
  ('Tutorial/How-To', 'Step-by-step instructions toward a concrete outcome.',
'0-3s [Hook]: State what viewers will learn.
3-8s [Value]: Step 1 - first action to take.
8-13s [Value]: Step 2 - continue the process.
13-18s [Value]: Step 3 - keep building.
18-25s [Value]: Step 4 - final steps and result.
25-30s [CTA]: Follow for more tutorials.'),
  ('Story Arc', 'Setup -> conflict -> resolution -> lesson.',
'0-5s [Hook]: Set the scene - introduce the situation.
5-12s [Bridge]: Build tension - the conflict or challenge.
12-22s [Value]: The turning point - how it was resolved.
22-28s [Proof]: The outcome - what changed.
28-30s [CTA]: What would you have done?'),
  ('Testimonial', 'First-person account of a problem and its resolution.',
'0-3s [Hook]: Introduce the person sharing their experience.
3-10s [Bridge]: Describe the problem they faced.
10-22s [Value]: Share their transformation and results.
22-27s [Proof]: Specific outcomes, numbers, or proof.
27-30s [CTA]: Ready for your transformation?')
ON CONFLICT (name) DO NOTHING;

-- 2 browse-visible videos (is_published=true, status='complete', dummy
-- video_path). created_by left NULL (no auth.users FK). embedding left NULL.
-- search_document is populated by the BEFORE INSERT trigger. Fixed ids +
-- ON CONFLICT so re-running is a no-op.
INSERT INTO public.videos
  (id, title, description, creator_handle, platform, video_path, thumbnail_path,
   duration_seconds, logic_flow_id, semantic_tags, status, is_published, is_premium,
   published_at)
VALUES
  ('11111111-1111-1111-1111-111111111111',
   'How to Hook Viewers in 3 Seconds',
   'A quick teardown of the PAS structure for short-form video.',
   '@demo_creator', 'TikTok', 'demo/hook-in-3-seconds.mp4', 'demo/hook-in-3-seconds.jpg',
   28,
   (SELECT id FROM public.logic_flows WHERE name = 'PAS (Problem-Agitation-Solution)'),
   ARRAY['Education', 'Tutorial', 'Beginner-friendly'],
   'complete', true, false, now()),
  ('22222222-2222-2222-2222-222222222222',
   'Us vs. Them: The Contrast Formula',
   'Demonstrates the old-way / new-way contrast pattern.',
   '@demo_creator', 'YouTube Shorts', 'demo/us-vs-them.mp4', 'demo/us-vs-them.jpg',
   30,
   (SELECT id FROM public.logic_flows WHERE name = 'Us vs. Them'),
   ARRAY['Business', 'Story/Narrative', 'Intermediate'],
   'complete', true, false, now())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- LOCAL REHEARSAL ONLY — throwaway admin (FK to shared auth.users)
-- =============================================================================
-- Left COMMENTED OUT so the file applies cleanly against an EMPTY auth.users.
-- Uncomment to exercise the admin RLS path locally. Inserts a throwaway
-- auth.users row first (fixed id + ON CONFLICT so it is idempotent), then the
-- matching public.profiles row. Do NOT run against a real auth store.
--
-- INSERT INTO auth.users (id, email)
-- VALUES ('deadbeef-0000-0000-0000-000000000001', 'admin@public.local')
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO public.profiles (id, email, display_name, role)
-- VALUES ('deadbeef-0000-0000-0000-000000000001', 'admin@public.local', 'Local Admin', 'admin')
-- ON CONFLICT (id) DO NOTHING;

-- Storage bucket for uploaded videos. Public: the library serves public URLs
-- via getVideoUrl (see CLAUDE.md "Supabase Setup"). Idempotent.
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
