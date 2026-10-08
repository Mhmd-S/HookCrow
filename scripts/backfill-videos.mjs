#!/usr/bin/env node
/**
 * Copy the mp4 of embed-only TikTok rows (video_path NULL) into the `videos`
 * bucket so our own player serves them instead of the TikTok iframe.
 *
 * CLI equivalent of POST /api/admin/backfill-videos, which needs an admin JWT.
 * Same steps as server/utils/tiktokStore.ts: resolve source_url -> mp4,
 * size-check, ffprobe duration, upload, point video_path at it.
 *
 * Dry run by default. --apply to write.
 *
 *   set -a && . ./.env && set +a
 *   node scripts/backfill-videos.mjs --published-only
 *   node scripts/backfill-videos.mjs --published-only --apply
 *   node scripts/backfill-videos.mjs --apply --limit 10
 */
import { createClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

const APPLY = process.argv.includes('--apply')
const PUBLISHED_ONLY = process.argv.includes('--published-only')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : null

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const key = process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY || process.env.NUXT_SUPABASE_KEY
if (!url || !key) {
  console.error('Missing Supabase env. Run:  set -a && . ./.env && set +a && node scripts/backfill-videos.mjs')
  process.exit(1)
}
const db = createClient(url, key)

const RESOLVER_API = 'https://www.tikwm.com/api/'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const MIN_BYTES = 100 * 1024 // tikwm stub payloads are ~120KB
const MAX_BYTES = 50 * 1024 * 1024 // `videos` bucket per-file limit
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function downloadVideo(sourceUrl) {
  const res = await fetch(`${RESOLVER_API}?hd=1&url=${encodeURIComponent(sourceUrl)}`, {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`resolver HTTP ${res.status}`)
  const body = await res.json()
  if (body.code !== 0 || !body.data) throw new Error(`resolver: ${body.msg || 'no data'}`)
  const mp4 = body.data.hdplay || body.data.play
  if (!mp4) throw new Error('resolver returned no video url')

  const v = await fetch(mp4, { headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' } })
  if (!v.ok) throw new Error(`download HTTP ${v.status}`)
  const buf = Buffer.from(await v.arrayBuffer())
  if (buf.length < MIN_BYTES) throw new Error(`stub, not video (${(buf.length / 1024) | 0}KB)`)
  if (buf.length > MAX_BYTES) throw new Error(`too large for bucket (${(buf.length / 1024 / 1024) | 0}MB)`)
  return buf
}

// Matches server/utils/audio.ts getVideoDuration. Best-effort: null on failure.
async function probeDuration(buf) {
  const dir = await mkdtemp(join(tmpdir(), 'video-bf-'))
  try {
    const path = join(dir, 'video.mp4')
    await writeFile(path, buf)
    const { stdout } = await execFileAsync('ffprobe', ['-i', path, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv=p=0'])
    const seconds = parseFloat(stdout.trim())
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// Skip rows created in the last 30 min: an ingest in flight also has
// video_path NULL until it finishes (same guard as the admin endpoint).
const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()

let q = db.from('videos')
  .select('id, title, source_url, is_published')
  .is('video_path', null)
  .not('source_url', 'is', null)
  .lt('created_at', cutoff)
if (PUBLISHED_ONLY) q = q.eq('is_published', true)

const { data: rows, error } = await q.order('is_published', { ascending: false })
if (error) { console.error('Query failed:', error.message); process.exit(1) }

const target = LIMIT ? rows.slice(0, LIMIT) : rows
console.log(`rows without a hosted video: ${rows.length}${LIMIT ? ` (processing ${target.length})` : ''}`)
console.log(`  published (visible now): ${rows.filter((r) => r.is_published).length}`)

if (!APPLY) {
  console.log(`\nDry run. Re-run with --apply to process ${target.length}.`)
  process.exit(0)
}

let ok = 0
let totalBytes = 0
const failures = []
for (const [i, v] of target.entries()) {
  const label = `[${i + 1}/${target.length}] ${(v.title || v.id).slice(0, 44)}`
  try {
    const buf = await downloadVideo(v.source_url)
    const duration = await probeDuration(buf)

    const name = `videos/${crypto.randomUUID()}.mp4`
    const { error: upErr } = await db.storage.from('videos')
      .upload(name, buf, { contentType: 'video/mp4', upsert: false })
    if (upErr) throw new Error(`upload: ${upErr.message}`)

    const update = { video_path: name }
    if (duration) update.duration_seconds = duration
    const { error: updErr } = await db.from('videos').update(update).eq('id', v.id)
    if (updErr) {
      await db.storage.from('videos').remove([name]).catch(() => {})
      throw new Error(`db: ${updErr.message}`)
    }

    ok++
    totalBytes += buf.length
    console.log(`  ok   ${label}  (${(buf.length / 1024 / 1024).toFixed(1)}MB${duration ? `, ${duration}s` : ''})`)
  } catch (err) {
    failures.push({ id: v.id, title: v.title, error: err.message })
    console.log(`  FAIL ${label}  ${err.message}`)
  }
  await sleep(1200) // tikwm is a free endpoint — don't hammer it
}

console.log(`\nprocessed ok: ${ok} / ${target.length}  (${(totalBytes / 1024 / 1024).toFixed(0)}MB uploaded)`)
if (failures.length) {
  console.log(`failed: ${failures.length}`)
  failures.forEach((f) => console.log(`  ${f.id}  ${f.error}`))
}
