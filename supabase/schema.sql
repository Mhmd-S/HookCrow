-- =============================================================================
-- Video Anatomizer — Admin CMS schema
-- =============================================================================
-- Roles:
--   - admin : creates, edits, analyzes, and publishes recipe videos
--   - user  : self-serve sign-up, browses and views published recipes (read-only)
--
-- Tables: logic_flows, profiles, videos, segments
-- RLS is enabled on all tables; admin-side routes use the service-role key to
-- bypass RLS. Consumer reads go through RLS as a defence-in-depth backstop.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS logic_flows_updated_at ON public.logic_flows;
CREATE TRIGGER logic_flows_updated_at
  BEFORE UPDATE ON public.logic_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------------------------------------------------------
-- profiles
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
-- videos
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
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  search_document tsvector
);

DROP TRIGGER IF EXISTS videos_updated_at ON public.videos;
CREATE TRIGGER videos_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_videos_is_published ON public.videos(is_published);
CREATE INDEX IF NOT EXISTS idx_videos_is_premium ON public.videos(is_premium);
CREATE INDEX IF NOT EXISTS idx_videos_logic_flow_id ON public.videos(logic_flow_id);
CREATE INDEX IF NOT EXISTS idx_videos_created_by ON public.videos(created_by);

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
CREATE INDEX IF NOT EXISTS idx_segments_order ON public.segments(video_id, segment_order);

-- -----------------------------------------------------------------------------
-- Full-text search on videos (search_document + RPC)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.videos_search_document_update() RETURNS trigger AS $$
DECLARE
  logic_flow_name TEXT := '';
  skeletal_overview TEXT := '';
  skeletal_takeaways TEXT := '';
  skeletal_techniques TEXT := '';
  visual_overview_text TEXT := '';
  visual_techniques TEXT := '';
  tags_text TEXT := '';
BEGIN
  IF NEW.logic_flow_id IS NOT NULL THEN
    SELECT name INTO logic_flow_name
    FROM public.logic_flows WHERE id = NEW.logic_flow_id;
  END IF;

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

  IF NEW.semantic_tags IS NOT NULL THEN
    tags_text := array_to_string(NEW.semantic_tags, ' ');
  END IF;

  NEW.search_document :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(tags_text, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(logic_flow_name, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(skeletal_overview, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.creator_handle, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(skeletal_takeaways, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(skeletal_techniques, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(visual_overview_text, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(visual_techniques, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(LEFT(NEW.script_raw, 2000), '')), 'D');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS videos_search_document_trigger ON public.videos;
CREATE TRIGGER videos_search_document_trigger
  BEFORE INSERT OR UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.videos_search_document_update();

CREATE INDEX IF NOT EXISTS idx_videos_search_document
  ON public.videos USING GIN (search_document);

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

-- -----------------------------------------------------------------------------
-- Row Level Security — see migration 003 for the full policy set.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin');
$$;

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

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logic_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles self select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles admin select" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "profiles admin update" ON public.profiles FOR UPDATE USING (public.is_admin(auth.uid()));

CREATE POLICY "logic_flows authed select" ON public.logic_flows FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "logic_flows admin write" ON public.logic_flows FOR ALL
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "videos published select" ON public.videos FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_published = true);
CREATE POLICY "videos admin all" ON public.videos FOR ALL
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "segments published select" ON public.segments FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.videos v WHERE v.id = segments.video_id AND v.is_published = true
    )
  );
CREATE POLICY "segments admin all" ON public.segments FOR ALL
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- Seed: 8 logic flow templates
-- -----------------------------------------------------------------------------
INSERT INTO public.logic_flows (name, description) VALUES
  ('PAS (Problem-Agitation-Solution)', 'Identify a pain point, agitate it, then present the solution.'),
  ('Us vs. Them', 'Contrast the old/wrong way with your new/better approach.'),
  ('Listicle/Top N', 'Ranked or numbered list of tips, items, or takeaways.'),
  ('Mythbuster', 'Call out a common misconception and reveal the truth.'),
  ('Before/After', 'Show a starting state, then the transformation.'),
  ('Tutorial/How-To', 'Step-by-step instructions toward a concrete outcome.'),
  ('Story Arc', 'Setup → conflict → resolution → lesson.'),
  ('Testimonial', 'First-person account of a problem and its resolution.')
ON CONFLICT (name) DO NOTHING;
