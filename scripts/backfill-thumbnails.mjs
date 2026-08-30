#!/usr/bin/env node
/**
 * Replace expiring TikTok CDN thumbnails with durable frames in Supabase storage.
 *
 * CLI equivalent of POST /api/admin/generate-thumbnails, which needs an admin
 * JWT. Same steps: resolve source_url -> mp4, extract a frame, upload, point
 * thumbnail_path at it and clear the stale thumbnail_url.
 *
 * Dry run by default. --apply to write.
 *
 *   node scripts/backfill-thumbnails.mjs --published-only
 *   node scripts/backfill-thumbnails.mjs --published-only --apply
 *   node scripts/backfill-thumbnails.mjs --apply --limit 10
 */
import { createClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const APPLY = process.argv.includes('--apply')
const PUBLISHED_ONLY = process.argv.includes('--published-only')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : null

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const key = process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY || process.env.NUXT_SUPABASE_KEY
if (!url || !key) {
  console.error('Missing Supabase env. Run:  set -a && . ./.env && set +a && node scripts/backfill-thumbnails.mjs')
  process.exit(1)
}
const db = createClient(url, key)

const RESOLVER_API = 'https://www.tikwm.com/api/'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function downloadToTemp(sourceUrl) {
  const res = await fetch(`${RESOLVER_API}?hd=1&url=${encodeURIComponent(sourceUrl)}`, {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`resolver HTTP ${res.status}`)
  const body = await res.json()
  if (body.code !== 0 || !body.data) throw new Error(`resolver: ${body.msg || 'no data'}`)
  const mp4 = body.data.hdplay || body.data.play
  if (!mp4) throw new Error('resolver returned no video url')

  const dir = await mkdtemp(join(tmpdir(), 'thumb-bf-'))
  const path = join(dir, 'video.mp4')
  const cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {})
  try {
    const v = await fetch(mp4, { headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' } })
    if (!v.ok) throw new Error(`download HTTP ${v.status}`)
    const buf = Buffer.from(await v.arrayBuffer())
    if (buf.length < 100 * 1024) throw new Error(`stub, not video (${(buf.length / 1024) | 0}KB)`)
    await writeFile(path, buf)
    return { path, dir, cleanup, bytes: buf.length }
  } catch (e) {
    await cleanup()
    throw e
  }
}

// Matches server/utils/audio.ts extractThumbnailFromVideo.
async function extractFrame(dir, inputPath) {
  const out = join(dir, 'thumb.jpg')
  await execFileAsync('ffmpeg', ['-ss', '1', '-i', inputPath, '-vframes', '1', '-q:v', '3', '-vf', 'scale=400:-2', out, '-y'])
  return readFile(out)
}

let q = db.from('videos')
  .select('id, title, source_url, video_path, thumbnail_path, thumbnail_url, is_published')
  .is('thumbnail_path', null)
  .not('source_url', 'is', null)
if (PUBLISHED_ONLY) q = q.eq('is_published', true)

const { data: rows, error } = await q.order('is_published', { ascending: false })
if (error) { console.error('Query failed:', error.message); process.exit(1) }

const target = LIMIT ? rows.slice(0, LIMIT) : rows
console.log(`rows needing a durable thumbnail: ${rows.length}${LIMIT ? ` (processing ${target.length})` : ''}`)
console.log(`  published (visible now): ${rows.filter((r) => r.is_published).length}`)

if (!APPLY) {
  console.log(`\nDry run. Re-run with --apply to process ${target.length}.`)
  process.exit(0)
}

let ok = 0
const failures = []
for (const [i, v] of target.entries()) {
  const label = `[${i + 1}/${target.length}] ${(v.title || v.id).slice(0, 44)}`
  let dl = null
  try {
    dl = await downloadToTemp(v.source_url)
    const jpg = await extractFrame(dl.dir, dl.path)
    const name = `thumbnails/${crypto.randomUUID()}.jpg`
    const { error: upErr } = await db.storage.from('videos')
      .upload(name, jpg, { contentType: 'image/jpeg', upsert: false })
    if (upErr) throw new Error(`upload: ${upErr.message}`)

    const { error: updErr } = await db.from('videos')
      .update({ thumbnail_path: name, thumbnail_url: null })
      .eq('id', v.id)
    if (updErr) throw new Error(`db: ${updErr.message}`)

    ok++
    console.log(`  ok   ${label}  (${(jpg.length / 1024) | 0}KB)`)
  } catch (err) {
    failures.push({ id: v.id, title: v.title, error: err.message })
    console.log(`  FAIL ${label}  ${err.message}`)
  } finally {
    if (dl) await dl.cleanup()
  }
  await sleep(1200) // tikwm is a free endpoint — don't hammer it
}

console.log(`\nprocessed ok: ${ok} / ${target.length}`)
if (failures.length) {
  console.log(`failed: ${failures.length}`)
  failures.forEach((f) => console.log(`  ${f.id}  ${f.error}`))
}
