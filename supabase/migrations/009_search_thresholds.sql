-- Migration 009: Tighten search_videos recall floor
--
-- Symptom: searches for common terms ("coffee", "kombucha") surfaced
-- structurally unrelated recipes (SaaS templates, makeup videos). The
-- passing mention of "coffee" in a random transcript was enough to rank
-- that video — because transcripts (weight D, ~8000 chars) dominate the
-- surface area of search_document and match on any token.
--
-- Fix — three floors:
--   1. Restrict ts match to weights A, B, C (via ts_filter). Weight D is
--      transcripts + script_raw — the high-noise layer. A/B/C covers
--      title, tags, product_name, product_category, description,
--      one_liner, problem_solved, target_user, competitors, features,
--      logic_flow, skeletal/visual summaries. If none of those mention
--      "coffee", the recipe isn't actually about coffee.
--   2. Cosine-distance threshold on vec_ranked (`embedding <=> q < 0.75`
--      ≈ cosine similarity > 0.25). Rows beyond that are too distant.
--   3. Narrow candidate pools (ts 200→80, vec 100→40) so RRF doesn't
--      reward mid-pack neighbors.
--
-- Trade-off: a recipe whose product_context is empty AND whose title
-- doesn't mention the search term gets dropped, even if the transcript
-- mentions it — this is what we want. Admins can fix recall by running
-- the "Backfill search" button to populate product_context.
--
-- Idempotent: re-apply this migration freely (it's CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.search_videos(
  search_query text,
  query_embedding vector(768) DEFAULT NULL,
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
  duration_seconds int,
  logic_flow_id uuid,
  semantic_tags text[],
  status text,
  is_premium boolean,
  created_at timestamptz,
  logic_flow_name text,
  logic_flow_description text,
  search_rank real
) AS $$
BEGIN
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
    SELECT f.id,
           row_number() OVER (
             ORDER BY ts_rank(ts_filter(f.search_document, '{A,B,C}'), websearch_to_tsquery('english', search_query)) DESC
           ) AS rnk
    FROM filtered f
    WHERE search_query IS NOT NULL AND search_query != ''
      -- Only match on high-signal weights (title, tags, product_context,
      -- description, logic_flow, skeletal/visual summaries). Exclude D
      -- (transcripts) where incidental mentions drown out real matches.
      AND ts_filter(f.search_document, '{A,B,C}') @@ websearch_to_tsquery('english', search_query)
    LIMIT 80
  ),
  vec_ranked AS (
    SELECT f.id,
           row_number() OVER (ORDER BY f.embedding <=> query_embedding) AS rnk
    FROM filtered f
    WHERE query_embedding IS NOT NULL
      AND f.embedding IS NOT NULL
      AND (f.embedding <=> query_embedding) < 0.75
    LIMIT 40
  ),
  fused AS (
    SELECT COALESCE(ts.id, vec.id) AS id,
           COALESCE(1.0 / (60 + ts.rnk), 0) + COALESCE(1.0 / (60 + vec.rnk), 0) AS score
    FROM ts_ranked ts
    FULL OUTER JOIN vec_ranked vec ON ts.id = vec.id
  )
  SELECT
    f.id, f.title, f.creator_handle, f.platform, f.video_path,
    f.duration_seconds, f.logic_flow_id, f.semantic_tags, f.status,
    f.is_premium, f.created_at,
    lf.name AS logic_flow_name,
    lf.description AS logic_flow_description,
    COALESCE(fused.score, 0)::real AS search_rank
  FROM filtered f
  LEFT JOIN public.logic_flows lf ON f.logic_flow_id = lf.id
  LEFT JOIN fused ON f.id = fused.id
  WHERE
    -- No search signal → return everything in the filter set (ordered by updated_at).
    ((search_query IS NULL OR search_query = '') AND query_embedding IS NULL)
    -- At least one signal provided → only rows matched by at least one signal.
    OR fused.id IS NOT NULL
  ORDER BY
    CASE
      WHEN (search_query IS NULL OR search_query = '') AND query_embedding IS NULL
        THEN 0
      ELSE COALESCE(fused.score, 0)
    END DESC,
    f.updated_at DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$ LANGUAGE plpgsql STABLE;
