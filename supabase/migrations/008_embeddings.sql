-- Migration 008: pgvector embeddings + hybrid (RRF) ranking
--
-- Adds semantic search on top of the existing lexical tsvector ranking.
-- Paraphrased product queries ("CRM for realtors") no longer need keyword
-- overlap with the transcript to find the right recipe.
--
-- Design:
--   - `embedding vector(768)` column populated by Gemini text-embedding-004
--     over [title, product_name, one_liner, problem_solved, competitors, transcript].
--   - HNSW cosine index for sub-ms ANN at small scale.
--   - `search_videos` RPC gains an optional `query_embedding` param; when
--     provided alongside `search_query`, the two ranks are fused with
--     Reciprocal Rank Fusion (RRF): score = sum over signals of 1/(60+rank).
--     RRF avoids having to normalize ts_rank magnitude vs cosine distance.
--   - When query_embedding is NULL, behavior matches the previous RPC.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS idx_videos_embedding
  ON public.videos
  USING hnsw (embedding vector_cosine_ops);

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
             ORDER BY ts_rank(f.search_document, websearch_to_tsquery('english', search_query)) DESC
           ) AS rnk
    FROM filtered f
    WHERE search_query IS NOT NULL AND search_query != ''
      AND f.search_document @@ websearch_to_tsquery('english', search_query)
    LIMIT 200
  ),
  vec_ranked AS (
    SELECT f.id,
           row_number() OVER (ORDER BY f.embedding <=> query_embedding) AS rnk
    FROM filtered f
    WHERE query_embedding IS NOT NULL AND f.embedding IS NOT NULL
    LIMIT 100
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
    -- No search signal → return everything in the filter set.
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
