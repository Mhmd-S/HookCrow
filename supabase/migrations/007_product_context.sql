-- Migration 007: Add product_context JSONB + promote it in search_document
--
-- Builds on migration 006. The v2 tsvector indexed title, tags, descriptions,
-- skeletal/visual summaries, and transcripts — but nothing *specific* about the
-- product/service being marketed. A marketer searching "CRM for realtors" only
-- matched videos whose transcript literally said those words.
--
-- This migration:
--   1. Adds a `product_context` jsonb column to videos.
--   2. Rewrites videos_search_document_update() to fold product_context fields
--      into the tsvector at high weights so product-centric queries rank high:
--        - A (strongest): product_name, product_category  (plus existing title+tags)
--        - B:             one_liner, problem_solved, target_user,
--                         key_features, competitors_mentioned  (plus existing B fields)
--        - C, D:          unchanged (skeletal/visual + transcripts)
--   3. Backfills via UPDATE ... updated_at = now() (trigger rebuilds search_document).

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS product_context jsonb;

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
$$ LANGUAGE plpgsql;

-- Backfill: rebuild search_document for every existing row.
UPDATE public.videos SET updated_at = now();
