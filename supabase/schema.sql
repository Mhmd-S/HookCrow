-- Video Anatomizer Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Updated at trigger function (defined early for use by all tables)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Logic Flows table (the skeleton types like PAS, Listicle, etc.)
CREATE TABLE logic_flows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  template_markdown TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Updated at trigger for logic_flows
CREATE TRIGGER logic_flows_updated_at
  BEFORE UPDATE ON logic_flows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Videos table (the main content container)
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_handle TEXT,
  platform TEXT CHECK (platform IN ('TikTok', 'Instagram', 'YouTube Shorts')),
  source_url TEXT,
  video_path TEXT NOT NULL,
  duration_seconds INTEGER,
  logic_flow_id UUID REFERENCES logic_flows(id) ON DELETE SET NULL,
  script_raw TEXT,
  script_blueprint TEXT,
  skeletal_logic JSONB, -- Analytical breakdown of segment goals, psychology, reasoning
  semantic_tags TEXT[], -- Content categorization tags (Education, Business, Food, etc.)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Segments table (Hook, Bridge, Value, CTA sections)
CREATE TABLE segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  segment_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  transcript_raw TEXT,
  script_blueprint TEXT,
  visual_notes TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Create index for faster segment lookups
CREATE INDEX idx_segments_video_id ON segments(video_id);
CREATE INDEX idx_segments_order ON segments(video_id, segment_order);

-- Updated at trigger for videos
CREATE TRIGGER videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Seed logic flows with common video structures and their templates
INSERT INTO logic_flows (name, description, template_markdown) VALUES
  ('PAS (Problem-Agitation-Solution)',
   'Identifies a pain point, intensifies the frustration, and introduces the product as the hero.',
   '0-3s [Hook]: State the [PAIN POINT] your audience faces.
3-8s [Bridge]: Agitate - make them feel the frustration of this problem.
8-20s [Value]: Introduce [PRODUCT/SOLUTION] as the answer.
20-25s [Proof]: Show quick results or social proof.
25-30s [CTA]: Tell them exactly what to do next.'),

  ('Us vs. Them',
   'Contrasts the old way with a new, better approach or product.',
   '0-3s [Hook]: "Most people do [OLD WAY]..."
3-10s [Bridge]: Show why the old way is broken or inefficient.
10-22s [Value]: Reveal your better approach or method.
22-27s [Proof]: Quick comparison or result.
27-30s [CTA]: Invite them to try the new way.'),

  ('Listicle / Top N',
   'Presents content as a numbered list of tips, products, or ideas.',
   '0-3s [Hook]: "[NUMBER] [THINGS] you need to know about [TOPIC]"
3-8s [Value]: #1 - First item with quick explanation.
8-14s [Value]: #2 - Second item with quick explanation.
14-20s [Value]: #3 - Third item with quick explanation.
20-26s [Value]: Bonus tip or most important takeaway.
26-30s [CTA]: Follow for more or link in bio.'),

  ('Mythbuster',
   'Debunks a common misconception and provides the correct information.',
   '0-4s [Hook]: "Stop believing [COMMON MYTH]"
4-10s [Bridge]: Explain why people believe this myth.
10-22s [Value]: Reveal the truth with evidence or explanation.
22-27s [Proof]: Show proof or cite source.
27-30s [CTA]: Share with someone who needs to hear this.'),

  ('Before/After',
   'Shows transformation by contrasting the before and after states.',
   '0-3s [Hook]: Show the "before" state - the problem.
3-8s [Bridge]: Describe what wasn''t working.
8-20s [Value]: Show the transformation process.
20-26s [Proof]: Reveal the "after" - the result.
26-30s [CTA]: Want this result? Here''s how.'),

  ('Tutorial / How-To',
   'Step-by-step instructional content teaching a specific skill or process.',
   '0-3s [Hook]: "Here''s how to [ACHIEVE RESULT]"
3-8s [Value]: Step 1 - First action to take.
8-14s [Value]: Step 2 - Second action to take.
14-20s [Value]: Step 3 - Third action to take.
20-26s [Proof]: Show the finished result.
26-30s [CTA]: Save this for later / Follow for more tutorials.'),

  ('Story Arc',
   'Narrative-driven content with a beginning, middle, and end.',
   '0-4s [Hook]: Open with an intriguing setup or question.
4-10s [Bridge]: Introduce the challenge or conflict.
10-20s [Value]: The journey - what happened or what you learned.
20-26s [Proof]: The resolution or transformation.
26-30s [CTA]: What this means for the viewer.'),

  ('Testimonial',
   'Features customer or user experiences and social proof.',
   '0-4s [Hook]: "[NAME] was struggling with [PROBLEM]..."
4-10s [Bridge]: Describe their situation before.
10-18s [Value]: How they discovered [PRODUCT/SOLUTION].
18-24s [Proof]: Their results - specific numbers or outcomes.
24-30s [CTA]: Ready for your own transformation?');

-- Enable Row Level Security (service_role bypasses RLS)
ALTER TABLE logic_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;

-- No policies = no access for anon/authenticated
-- service_role key bypasses RLS automatically
-- This ensures all access must go through the server API

-- Create storage bucket for videos (run this separately in Supabase Dashboard > Storage)
-- Or use the Supabase client to create it programmatically

-- ===========================================
-- MIGRATION: Add status column (run if upgrading existing database)
-- ===========================================
-- ALTER TABLE videos ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete'));

-- ===========================================
-- MIGRATION: Add template_markdown and updated_at to logic_flows
-- ===========================================
-- ALTER TABLE logic_flows ADD COLUMN template_markdown TEXT;
-- ALTER TABLE logic_flows ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
--
-- CREATE TRIGGER logic_flows_updated_at
--   BEFORE UPDATE ON logic_flows
--   FOR EACH ROW
--   EXECUTE FUNCTION update_updated_at();
--
-- UPDATE logic_flows SET template_markdown = '0-3s [Hook]: State the [PAIN POINT] your audience faces.
-- 3-8s [Bridge]: Agitate - make them feel the frustration of this problem.
-- 8-20s [Value]: Introduce [PRODUCT/SOLUTION] as the answer.
-- 20-25s [Proof]: Show quick results or social proof.
-- 25-30s [CTA]: Tell them exactly what to do next.' WHERE name = 'PAS (Problem-Agitation-Solution)';
--
-- (Run similar UPDATE statements for other logic flows - see seed data above for templates)

-- ===========================================
-- MIGRATION: Add skeletal_logic and semantic_tags columns to videos
-- ===========================================
-- ALTER TABLE videos ADD COLUMN skeletal_logic JSONB;
-- ALTER TABLE videos ADD COLUMN semantic_tags TEXT[];

-- ===========================================
-- MIGRATION: Add audio analysis columns
-- ===========================================
-- ALTER TABLE videos ADD COLUMN audio_analysis JSONB;
-- ALTER TABLE segments ADD COLUMN audio_metadata JSONB;
