-- Migration 009: Tighten search_videos recall floor
--
-- Symptom: searches for broad single-word terms ("coffee", "kombucha")
-- returned unrelated recipes. Two root causes:
--   1. The ts match was letting transcript-only hits through — "coffee"
--      mentioned once in a random recipe transcript was enough to rank it.
--   2. The vec path had no meaningful distance floor (0.75 was loose).
--      For a short query like "coffee", almost every food/lifestyle video's
--      embedding lands within 0.75 cosine distance — so vec_ranked became
--      a no-op filter and essentially returned the whole library.
--
-- Strategy:
--   - ts match uses: phraseto_tsquery(q) || plainto_tsquery(strip_spaces(q)).
--     - phraseto_tsquery requires tokens to appear adjacent — drastically
--       more precise than AND-of-tokens, so "skin care" doesn't match every
--       doc where "skin" and "care" coincidentally co-occur.
--     - plainto on the space-stripped form handles the case where the doc
--       has the joined compound word ("Skincare" tag stems to lexeme
--       `skincar`, never `skin`+`care`, so the phrase query alone would
--       miss it). Users type "skin care", the doc says "Skincare", we
--       match via the stripped-form side.
--     - For single-word queries the two sides are equivalent (OR'd as one).
--   - ts path: match only against weights A and B (exclude C and D).
--     Weight C is AI-generated skeletal/visual text with noisy vocabulary;
--     weight D is transcripts. Only hits in curated fields count: title,
--     tags, product_name, product_category (A) + description,
--     logic_flow_name, product one_liner, problem_solved, target_user,
--     key_features, competitors, creator_handle (B).
--   - Prefer ts matches when they exist. Only fall back to vec recall
--     when the phrase match finds nothing.
--   - Tight vec threshold (distance < 0.35 ≈ cosine similarity > 0.65).
--     Gemini embeddings of short nonsense queries land in a broad
--     health/lifestyle cluster; a loose threshold floods results.
--
-- Idempotent: re-apply freely (CREATE OR REPLACE FUNCTION).

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
DECLARE
  ts_hit_count int := 0;
BEGIN
  -- Count ts hits at weights A/B/C so we can decide whether to fall back
  -- to vec. We do this before the main query so the CASE branches can key
  -- off it directly.
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
    -- Only fall back to vec when ts returned nothing. Prevents loose semantic
    -- neighbors from flooding the result set when literal matches exist.
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
    f.id, f.title, f.creator_handle, f.platform, f.video_path,
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
    -- No search signal at all → return everything ordered by updated_at.
    ((search_query IS NULL OR search_query = '') AND query_embedding IS NULL)
    -- Signal provided → only rows that actually matched.
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
$$ LANGUAGE plpgsql STABLE;
