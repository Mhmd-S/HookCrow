-- Migration 010: Add thumbnail_path to search_videos RPC
--
-- The browse / search grid now renders pre-generated JPEG thumbnails instead
-- of streaming the video as a poster frame. The RPC needs to surface
-- videos.thumbnail_path so the client can show the lightweight image.
--
-- Idempotent: DROP + CREATE. Postgres can't change a function's return type
-- via CREATE OR REPLACE — adding the thumbnail_path column changes the
-- RETURNS TABLE shape, so we must drop first.

DROP FUNCTION IF EXISTS public.search_videos(text, vector, text[], uuid, int, int);

CREATE FUNCTION public.search_videos(
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
) AS $$
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
$$ LANGUAGE plpgsql STABLE;
