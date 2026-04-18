-- Migration 006: Broaden search_document recall for product-marketing queries
--
-- The v1 trigger indexed only the first 2000 chars of script_raw and never
-- reached the segment transcripts. CTAs and product-adjacent language ("free
-- trial", "download today") routinely live in the back half of a video and in
-- segment transcripts, so product searches were missing templates whose
-- marketing copy matched perfectly but whose title did not.
--
-- This migration:
--  1. Rewrites videos_search_document_update() to pull segment transcripts via
--     subquery and bumps script_raw truncation 2000 → 5000.
--  2. Adds a trigger on segments so that inserts/updates/deletes on a segment
--     bump the parent video's search_document via updated_at touch.
--  3. Backfills every row.

CREATE OR REPLACE FUNCTION videos_search_document_update() RETURNS trigger AS $$
DECLARE
  logic_flow_name TEXT := '';
  skeletal_overview TEXT := '';
  skeletal_takeaways TEXT := '';
  skeletal_techniques TEXT := '';
  visual_overview_text TEXT := '';
  visual_techniques TEXT := '';
  tags_text TEXT := '';
  segments_text TEXT := '';
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

  -- Pull segment transcripts so product-adjacent language in CTAs is searchable.
  segments_text := COALESCE(
    (SELECT string_agg(COALESCE(s.transcript_raw, ''), ' ')
     FROM public.segments s
     WHERE s.video_id = NEW.id),
    ''
  );

  -- Build the weighted tsvector.
  -- A = title, tags (highest weight for direct matches)
  -- B = description, logic flow name, skeletal overview, creator handle
  -- C = skeletal takeaways, techniques, visual info
  -- D = transcripts (lowest weight — script_raw bumped to 5000 chars; segments appended)
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
    setweight(to_tsvector('english', COALESCE(LEFT(NEW.script_raw, 5000), '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(LEFT(segments_text, 8000), '')), 'D');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Touch the parent video whenever a segment changes so its search_document
-- picks up the new transcript text. Updating updated_at fires the existing
-- BEFORE UPDATE trigger on videos which re-runs videos_search_document_update.
CREATE OR REPLACE FUNCTION segments_touch_parent_video() RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS segments_touch_parent_video_trigger ON public.segments;
CREATE TRIGGER segments_touch_parent_video_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.segments
  FOR EACH ROW
  EXECUTE FUNCTION segments_touch_parent_video();

-- Backfill: the BEFORE UPDATE trigger on videos rebuilds search_document.
UPDATE public.videos SET updated_at = now();
