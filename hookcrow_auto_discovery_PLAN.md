# Hookcrow — Auto-Discovery Ingestion (Option B) — Handoff Plan

Hands-off pipeline that **finds** TikTok marketing videos by hashtag/profile, then **ingests + analyzes** them automatically on a schedule. Discovery is the only new capability; ingestion + display already exist and must be **reused**.

Owner model: Claude architects + verifies; CodeWhale (or a dev) implements. The recipient has **no chat context** — this doc is the ground truth.

---

## 0. What already exists (REUSE — do not rebuild)

- **Single-URL ingest** — `server/api/admin/videos/ingest-url.post.ts`. Flow: validate TikTok URL → TikTok oEmbed metadata → insert `videos` row (`video_path=null`, `platform='TikTok'`, `source_url`, `thumbnail_url`) → download temp mp4 → analyze → cleanup temp (never stores the file).
- **Resolver/download** — `server/utils/tiktokDownload.ts` → `downloadTikTokToTemp(url)`. Uses a managed HTTP API (tikwm) that fetches server-side, so it works from a cloud/datacenter IP. Returns `{ path, cleanup }`.
- **Analysis core** — `server/utils/analyzeVideo.ts` → `analyzeVideoBuffer({ ai, supabase, config, videoId, videoBuffer, durationSeconds?, existingTitle? })`. Runs Gemini, writes `videos` + `segments` + embedding.
- **Display** — `app/components/video/TikTokEmbed.vue` (official iframe) + embed-vs-file switch in `PreviewPanel.vue`, library poster from `thumbnail_url`.
- **Conventions** — Nuxt 4 / Nitro. Server utils auto-import by export name (no import needed). Admin gate: `requireAdmin(event)`. Errors: `createError({ statusCode, message })`. Logs: `createLogger(name)`. Runtime secrets read via `useRuntimeConfig()`.
- **ENV convention (critical)** — the app reads secrets through `runtimeConfig`. On Railway (Docker) only **`NUXT_`-prefixed** env vars reach the runtime. Any new secret MUST be added to `nuxt.config.ts` `runtimeConfig` AND set on Railway as `NUXT_<NAME>`.
- **Deploy** — Railway builds the repo Dockerfile on `git push`. **Run one instance** (a scheduler must not double-run).

Discovery is verified viable: **Apify `clockworks/tiktok-scraper`** returns video URLs by hashtag/profile/search at **$0.30 / 1,000 posts**. tikwm's own search/user endpoints are Cloudflare-blocked → do NOT use tikwm for discovery, only for single-URL resolve.

---

## 1. Goal / outcome

- Admin defines **sources** (hashtags, profiles, or search terms) + a cadence + caps.
- A **scheduler** periodically: for each due source → discover recent video URLs (Apify) → drop already-seen URLs → ingest each new one through the EXISTING pipeline → record a run summary.
- Result: the library fills itself, deduped, within cost caps, with zero manual URL entry.

---

## 2. Architecture (text)

```
Scheduler tick (Railway Cron → secured endpoint)
        │
        ▼
runDiscovery():
  for each enabled source that is DUE (now - last_run_at >= cadence):
     urls = apify.discoverTikTokUrls(source, max_per_run)     # Apify actor
     new  = urls - existing videos.source_url                  # dedup
     for url in new (concurrency<=N, respect daily cap):
         ingestTikTokUrl(url)                                  # REUSED core
     write discovery_runs row (found / ingested / skipped / failed)
     set source.last_run_at = now
```

`ingestTikTokUrl(url)` = the per-URL body extracted from `ingest-url.post.ts` (insert row → oEmbed → download → analyze → cleanup). Both the single endpoint and the auto-runner call it.

---

## 3. Data model + migration (USER RUNS the SQL — do not touch the DB)

New tables + a dedup guard. Deliver as `~/projects/hookcrow_discovery_migration.sql`; the user runs it against the hookcrow project (`zvtgcscnaceclmbwhmbf`).

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.discovery_sources (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         text NOT NULL CHECK (type IN ('hashtag','profile','search')),
  value        text NOT NULL,                       -- e.g. 'saasmarketing' | '@garyvee' | 'cold email'
  enabled      boolean NOT NULL DEFAULT true,
  max_per_run  integer NOT NULL DEFAULT 15,
  cadence_hours integer NOT NULL DEFAULT 24,
  last_run_at  timestamptz,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (type, value)
);

CREATE TABLE IF NOT EXISTS public.discovery_runs (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id  uuid REFERENCES public.discovery_sources(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  found      integer DEFAULT 0,
  ingested   integer DEFAULT 0,
  skipped    integer DEFAULT 0,
  failed     integer DEFAULT 0,
  error      text
);

-- Dedup: never ingest the same TikTok twice.
CREATE UNIQUE INDEX IF NOT EXISTS videos_source_url_key
  ON public.videos (source_url) WHERE source_url IS NOT NULL;

-- Grants (service_role bypasses RLS; match existing pattern)
GRANT ALL ON public.discovery_sources, public.discovery_runs TO service_role;

COMMIT;
```

Note: normalize `source_url` on insert (strip query string) so dedup is stable; store the canonical `https://www.tiktok.com/@user/video/<id>` form.

---

## 4. Backend components (files to build)

- `server/utils/apify.ts` — `discoverTikTokUrls(source: {type,value}, limit): Promise<string[]>`.
  - Call Apify: `POST https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=<APIFY_TOKEN>` with input shaped per source type (`hashtags: [value]` | `profiles: [value]` | `searchQueries: [value]`, `resultsPerPage: limit`, `shouldDownloadVideos: false`). Map dataset items → `webVideoUrl` (canonical URL). Handle actor failure / empty.
  - Pin the actor version. Timeout-guard (actor runs can take 30–120 s).
- `server/utils/ingestTikTok.ts` — `ingestTikTokUrl(url, deps): Promise<{ videoId?, status:'ingested'|'skipped'|'failed', error? }>`. **Refactor**: move the per-URL body out of `ingest-url.post.ts` into here; the endpoint becomes a thin caller. Dedup check (source_url exists → 'skipped').
- `server/utils/discovery.ts` — `runDiscovery({ onlyDue=true, sourceId? }): Promise<RunSummary[]>`. Loops due sources, calls Apify, dedups, ingests with a concurrency limit (2–3) and a per-tick **global cap**, writes `discovery_runs`, updates `last_run_at`.
- Admin CRUD — `server/api/admin/discovery/sources.{get,post}.ts` + `sources/[id].{put,delete}.ts` (list/create/update/toggle/delete). `requireAdmin`.
- Manual trigger — `POST /api/admin/discovery/run` (`requireAdmin`) → `runDiscovery({ onlyDue:false, sourceId? })` for "Run now".
- Scheduler entrypoint — `POST /api/internal/discovery/tick` → `runDiscovery({ onlyDue:true })`. **Not** admin-gated; guarded by a shared secret header (`x-cron-secret === config.discoveryTickSecret`). Returns 401 otherwise.

---

## 5. Scheduling (pick ONE — recommend Railway Cron)

- **Railway Cron (recommended).** Add a Railway Cron service (or scheduled job) that runs e.g. hourly: `curl -fsS -X POST -H "x-cron-secret: $DISCOVERY_TICK_SECRET" https://hookcrow.com/api/internal/discovery/tick`. Decoupled from the web process; the web app just exposes the endpoint. Survives restarts. One trigger → no double-run.
- **Alternative: Nitro scheduled task** (`nitro: { scheduledTasks: { '0 * * * *': ['discovery:tick'] } }` + `server/tasks/discovery/tick.ts`). In-process; simpler, but only safe on a **single instance**, and pauses if the container sleeps.

Either way: **single instance**, and the per-source `cadence_hours` + `last_run_at` gate prevents over-running regardless of tick frequency.

---

## 6. Config / env (NUXT_ convention)

Add to `nuxt.config.ts` `runtimeConfig`:
```
apifyToken: process.env.APIFY_TOKEN,
discoveryTickSecret: process.env.DISCOVERY_TICK_SECRET,
discoveryDailyCap: process.env.DISCOVERY_DAILY_CAP,   // e.g. '50'
```
Set on Railway as: `NUXT_APIFY_TOKEN`, `NUXT_DISCOVERY_TICK_SECRET`, `NUXT_DISCOVERY_DAILY_CAP`. (Local `.env` uses the same `NUXT_` names.)

---

## 7. Cost + safety caps (MANDATORY)

- **Per-source cap** `max_per_run` (default 15) — bounds Apify results per run.
- **Per-tick global cap** `NUXT_DISCOVERY_DAILY_CAP` — hard ceiling on ingests per tick/day. Stop when hit; log the drop.
- **Ingest concurrency** 2–3 — protect Gemini rate limits + tikwm free tier.
- **Dedup** on `videos.source_url` — never re-analyze.
- Cost drivers to surface in the admin run log: Apify ($0.30/1k posts) + Gemini (per video) + tikwm (free tier → may rate-limit at volume; keep the resolver swappable to a paid one).

---

## 8. Admin UI (extend, minimal)

- `app/pages/admin/discovery.vue` — table of sources (type, value, cadence, max, enabled toggle, last run), add-source form, "Run now" button, and last-run stats from `discovery_runs`. Reuse @nuxt/ui components + existing style. (Or fold into `admin/recipes/bulk.vue`.)

---

## 9. Decisions the user must make (before build)

1. **Sources** — starting hashtags / profiles / search terms (e.g. `#saasmarketing`, `@garyvee`, "cold email hook").
2. **Cadence + caps** — how often, and `max_per_run` + daily cap (cost control).
3. **Scheduler** — Railway Cron (recommended) vs Nitro scheduled task.
4. **Apify token** — provide `APIFY_TOKEN`.
5. **Adult/quality filter?** — optional: skip videos whose Gemini analysis fails safety, or below a duration/engagement threshold.

---

## 10. Acceptance criteria (Claude verifies)

- Add a hashtag source → "Run now" → N new **embed** rows appear, analyzed (segments + tags), deduped on a second run (0 new).
- `discovery_runs` records found/ingested/skipped/failed.
- Scheduler tick ingests only NEW videos; respects caps + concurrency; secret-gated.
- `pnpm build` passes; single-instance safe.

---

## 11. Risks / flags (one line each)

- **Cost is per-video** (Apify + Gemini) — caps are mandatory, not optional.
- **ToS + copyright unchanged** — this is the scraping leg already accepted; embedding limits hosting risk, not the analysis-copy or the discovery scrape.
- **Apify output schema can change** — pin the actor, handle empty/failed runs.
- **tikwm at volume** — free tier will rate-limit; keep `tiktokDownload.ts` swappable to Apify download or a paid resolver.
- **Single instance** — 2+ replicas double-run the scheduler.

---

## 12. Out of scope

- Instagram discovery (separate actor + oEmbed token; later).
- The current **tikwm fetch fix deploy** — do that FIRST so single-URL ingest works before scaling.

---

## 13. Suggested build order (phases for CodeWhale)

1. **Migration SQL** (Claude writes; user runs).
2. **Refactor** `ingest-url` → `ingestTikTok.ts` (`ingestTikTokUrl`) + dedup. Verify build + single-URL still works.
3. **Apify util** `discoverTikTokUrls` + a local script test against one hashtag (Claude verifies URLs come back).
4. **Discovery runner** + tick/run endpoints + caps + concurrency.
5. **Admin UI**.
6. **Scheduler** wiring (Railway Cron) + secret.
7. Claude verifies end-to-end locally (add source → run → deduped ingest), then one deploy.
