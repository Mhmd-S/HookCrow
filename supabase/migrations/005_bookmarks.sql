-- Migration 005: Per-user video bookmarks
--
-- Adds a bookmarks join table scoped to the authenticated user. Composite PK
-- (user_id, video_id) makes "one bookmark per user per video" a db-level
-- invariant, so toggling is a plain insert/delete with no uniqueness logic
-- in application code.

CREATE TABLE IF NOT EXISTS public.bookmarks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON public.bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_video_id ON public.bookmarks(video_id);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookmarks self select" ON public.bookmarks FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "bookmarks self insert" ON public.bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bookmarks self delete" ON public.bookmarks FOR DELETE
  USING (auth.uid() = user_id);
