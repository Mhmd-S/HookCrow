#!/usr/bin/env node
/**
 * Publish videos that are already ingested and analyzed but still hidden.
 *
 * Dry run by default — prints what it would change and exits.
 * Pass --apply to actually write.
 *
 *   node scripts/publish-ready.mjs                 # preview
 *   node scripts/publish-ready.mjs --limit 10      # preview a subset
 *   node scripts/publish-ready.mjs --apply         # write
 *
 * Reads NUXT_PUBLIC_SUPABASE_URL and NUXT_SUPABASE_SERVICE_ROLE_KEY from the
 * environment; source .env first.
 */
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : null

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const key = process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY || process.env.NUXT_SUPABASE_KEY

if (!url || !key) {
  console.error('Missing NUXT_PUBLIC_SUPABASE_URL / NUXT_SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Run:  set -a && . ./.env && set +a && node scripts/publish-ready.mjs')
  process.exit(1)
}

const db = createClient(url, key)

const { data: rows, error } = await db
  .from('videos')
  .select('id, title, creator_handle, semantic_tags, script_raw, thumbnail_path, thumbnail_url, visual_analysis')
  .eq('status', 'complete')
  .eq('is_published', false)
  .order('created_at', { ascending: true })

if (error) {
  console.error('Query failed:', error.message)
  process.exit(1)
}

// Only publish rows that will actually render and rank: a title, at least one
// tag, and a poster. Anything else becomes a thin page that Google skips.
const words = (s) => (s ? String(s).trim().split(/\s+/).filter(Boolean).length : 0)
const reasons = (v) => {
  const missing = []
  if (!v.title) missing.push('no title')
  if (!v.semantic_tags?.length) missing.push('no tags')
  if (!v.thumbnail_path && !v.thumbnail_url) missing.push('no thumbnail')
  if (!v.thumbnail_path && v.thumbnail_url) missing.push('CDN-only thumbnail (expires)')
  if (words(v.script_raw) < 10) missing.push(`thin transcript (${words(v.script_raw)}w)`)
  return missing
}

const eligible = []
const held = []
for (const v of rows) {
  const r = reasons(v)
  // A CDN-only thumbnail is a warning, not a blocker, once backfilled.
  const blocking = r.filter((x) => x !== 'CDN-only thumbnail (expires)')
  ;(blocking.length ? held : eligible).push({ ...v, _reasons: r })
}

const target = LIMIT ? eligible.slice(0, LIMIT) : eligible

console.log(`complete + unpublished : ${rows.length}`)
console.log(`  eligible to publish  : ${eligible.length}${LIMIT ? ` (publishing ${target.length})` : ''}`)
console.log(`  held back            : ${held.length}`)
if (held.length) {
  console.log('\nheld back:')
  for (const v of held.slice(0, 15)) {
    console.log(`  ${v.id}  ${(v.title || '(untitled)').slice(0, 45).padEnd(45)}  ${v._reasons.join(', ')}`)
  }
  if (held.length > 15) console.log(`  … and ${held.length - 15} more`)
}

const cdnOnly = target.filter((v) => !v.thumbnail_path).length
if (cdnOnly) {
  console.log(`\nWARNING: ${cdnOnly} of these have only an expiring TikTok CDN thumbnail.`)
  console.log('Run the thumbnail backfill first or they publish with broken images.')
}

if (!APPLY) {
  console.log(`\nDry run. Re-run with --apply to publish ${target.length}.`)
  process.exit(0)
}

let ok = 0
const failures = []
for (const v of target) {
  const { error: e } = await db
    .from('videos')
    .update({ is_published: true, published_at: new Date().toISOString() })
    .eq('id', v.id)
    .eq('status', 'complete')       // re-check under the write
    .eq('is_published', false)      // idempotent: a concurrent publish is a no-op
  if (e) failures.push({ id: v.id, error: e.message })
  else ok++
}

console.log(`\npublished: ${ok}`)
if (failures.length) {
  console.log(`failed: ${failures.length}`)
  failures.forEach((f) => console.log(`  ${f.id}: ${f.error}`))
  process.exit(1)
}
