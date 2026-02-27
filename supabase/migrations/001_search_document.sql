-- Add full-text search support to the videos table
-- This migration creates a search_document tsvector column that aggregates
-- all searchable video metadata, weighted by importance.

-- 0. Ensure visual_analysis column exists (may be missing from initial schema)
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS visual_analysis jsonb;

-- 1. Add the search_document column
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS search_document tsvector;

-- 2. Create a trigger function that builds the weighted tsvector
CREATE OR REPLACE FUNCTION videos_search_document_update() RETURNS trigger AS $$
DECLARE
  logic_flow_name TEXT := '';
  skeletal_overview TEXT := '';
  skeletal_takeaways TEXT := '';
  skeletal_techniques TEXT := '';
  visual_overview_text TEXT := '';
  visual_techniques TEXT := '';
  tags_text TEXT := '';
BEGIN
  -- Get logic flow name if present
  IF NEW.logic_flow_id IS NOT NULL THEN
    SELECT name INTO logic_flow_name
    FROM public.logic_flows WHERE id = NEW.logic_flow_id;
  END IF;

  -- Extract skeletal logic fields from JSONB
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

  -- Extract visual analysis overview
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

  -- Flatten semantic_tags array to text
  IF NEW.semantic_tags IS NOT NULL THEN
    tags_text := array_to_string(NEW.semantic_tags, ' ');
  END IF;

  -- Build the weighted tsvector
  -- A = title, tags (highest weight for direct matches)
  -- B = description, logic flow name, skeletal overview, creator handle
  -- C = skeletal takeaways, techniques, visual info
  -- D = transcript (lowest weight, truncated)
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

-- 3. Create the trigger
DROP TRIGGER IF EXISTS videos_search_document_trigger ON public.videos;
CREATE TRIGGER videos_search_document_trigger
  BEFORE INSERT OR UPDATE ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION videos_search_document_update();

-- 4. Create a GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_videos_search_document
  ON public.videos USING GIN (search_document);

-- 5. Create an RPC function for relevance-ranked search
CREATE OR REPLACE FUNCTION search_videos(
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

-- 6. Backfill existing videos (trigger runs on UPDATE)
UPDATE public.videos SET updated_at = now();
