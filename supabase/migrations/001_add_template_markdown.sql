-- Migration: Add template_markdown column to logic_flows
-- Run this in your Supabase SQL Editor

-- Add template_markdown column
ALTER TABLE logic_flows ADD COLUMN IF NOT EXISTS template_markdown TEXT;
ALTER TABLE logic_flows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add trigger for updated_at (reuse existing function from videos table)
DROP TRIGGER IF EXISTS logic_flows_updated_at ON logic_flows;
CREATE TRIGGER logic_flows_updated_at
  BEFORE UPDATE ON logic_flows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Seed default templates for each logic flow
UPDATE logic_flows SET template_markdown =
'0-3s [Hook]: Identify the pain point with a bold statement.
3-8s [Bridge]: Agitate - make the problem feel urgent.
8-25s [Value]: Present your solution and key benefits.
25-30s [CTA]: Clear call to action.'
WHERE name LIKE 'PAS%';

UPDATE logic_flows SET template_markdown =
'0-3s [Hook]: Show the old/wrong way of doing things.
3-10s [Bridge]: Contrast with the new/better approach.
10-25s [Value]: Demonstrate why your way is superior.
25-30s [CTA]: Invite viewers to try the new way.'
WHERE name LIKE 'Us vs. Them%';

UPDATE logic_flows SET template_markdown =
'0-3s [Hook]: Tease the list with a compelling number.
3-7s [Value]: Item 1 - quick tip or insight.
7-11s [Value]: Item 2 - another valuable point.
11-15s [Value]: Item 3 - keep the momentum.
15-19s [Value]: Item 4 - build anticipation.
19-23s [Value]: Item 5 - strongest point last.
23-30s [CTA]: Which was your favorite? Comment below.'
WHERE name LIKE 'Listicle%';

UPDATE logic_flows SET template_markdown =
'0-4s [Hook]: State the common myth or misconception.
4-10s [Bridge]: Explain why people believe this myth.
10-25s [Value]: Reveal the truth with evidence.
25-30s [CTA]: Share to help others learn the truth.'
WHERE name LIKE 'Mythbuster%';

UPDATE logic_flows SET template_markdown =
'0-5s [Hook]: Show the "before" state - the problem.
5-10s [Bridge]: Hint at the transformation coming.
10-25s [Value]: Reveal the "after" - the solution results.
25-30s [CTA]: Want this transformation? Link in bio.'
WHERE name LIKE 'Before/After%';

UPDATE logic_flows SET template_markdown =
'0-3s [Hook]: State what viewers will learn.
3-8s [Value]: Step 1 - first action to take.
8-13s [Value]: Step 2 - continue the process.
13-18s [Value]: Step 3 - keep building.
18-25s [Value]: Step 4 - final steps and result.
25-30s [CTA]: Follow for more tutorials.'
WHERE name LIKE 'Tutorial%';

UPDATE logic_flows SET template_markdown =
'0-5s [Hook]: Set the scene - introduce the situation.
5-12s [Bridge]: Build tension - the conflict or challenge.
12-22s [Value]: The turning point - how it was resolved.
22-28s [Proof]: The outcome - what changed.
28-30s [CTA]: What would you have done?'
WHERE name LIKE 'Story Arc%';

UPDATE logic_flows SET template_markdown =
'0-3s [Hook]: Introduce the person sharing their experience.
3-10s [Bridge]: Describe the problem they faced.
10-22s [Value]: Share their transformation and results.
22-27s [Proof]: Specific outcomes, numbers, or proof.
27-30s [CTA]: Ready for your transformation?'
WHERE name LIKE 'Testimonial%';

-- Add index for faster template lookups
CREATE INDEX IF NOT EXISTS idx_logic_flows_updated_at ON logic_flows(updated_at);
