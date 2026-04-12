-- Migration 003: Admin CMS rewrite
--
-- Converts the app into an admin-managed CMS:
--   - Admins create and publish recipe videos (full control)
--   - Normal users are pure read-only consumers of published recipes
--
-- Changes:
--   1. Drop the `projects` table (user-upload / teleprompter flow removed)
--   2. Rename videos.user_id → videos.created_by (audit trail of which admin authored the recipe)
--   3. Add videos.thumbnail_path and videos.published_at
--   4. Enable + tighten RLS policies on profiles / logic_flows / videos / segments
--
-- Safe to re-run: uses IF EXISTS / IF NOT EXISTS guards where possible.

-- -----------------------------------------------------------------------------
-- 1. Drop projects table (cascades to any FK references we might have added)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.projects CASCADE;

-- -----------------------------------------------------------------------------
-- 2. videos.user_id → videos.created_by
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.videos RENAME COLUMN user_id TO created_by;
  END IF;
END $$;

-- Drop any FK that points created_by at auth.users and repoint to profiles.
ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_user_id_fkey;
ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_created_by_fkey;

ALTER TABLE public.videos
  ADD CONSTRAINT videos_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 3. New columns on videos
-- -----------------------------------------------------------------------------
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

-- Backfill published_at for anything already marked published (best effort).
UPDATE public.videos
SET published_at = updated_at
WHERE is_published = true AND published_at IS NULL;

-- -----------------------------------------------------------------------------
-- 4. Helper: is_admin(uid) — avoids self-referencing RLS on profiles
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- 5. RLS policies
-- -----------------------------------------------------------------------------

-- profiles -------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles self select" ON public.profiles;
DROP POLICY IF EXISTS "profiles admin select" ON public.profiles;
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
DROP POLICY IF EXISTS "profiles admin update" ON public.profiles;

CREATE POLICY "profiles self select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles admin select"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Users can update their own profile, but NOT their role.
CREATE POLICY "profiles self update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- Admins can update anything (including role).
CREATE POLICY "profiles admin update"
  ON public.profiles FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- logic_flows ----------------------------------------------------------------
ALTER TABLE public.logic_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logic_flows authed select" ON public.logic_flows;
DROP POLICY IF EXISTS "logic_flows admin write" ON public.logic_flows;

CREATE POLICY "logic_flows authed select"
  ON public.logic_flows FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "logic_flows admin write"
  ON public.logic_flows FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- videos ---------------------------------------------------------------------
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "videos published select" ON public.videos;
DROP POLICY IF EXISTS "videos admin all" ON public.videos;

CREATE POLICY "videos published select"
  ON public.videos FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_published = true);

CREATE POLICY "videos admin all"
  ON public.videos FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- segments -------------------------------------------------------------------
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "segments published select" ON public.segments;
DROP POLICY IF EXISTS "segments admin all" ON public.segments;

CREATE POLICY "segments published select"
  ON public.segments FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.videos v
      WHERE v.id = segments.video_id AND v.is_published = true
    )
  );

CREATE POLICY "segments admin all"
  ON public.segments FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
