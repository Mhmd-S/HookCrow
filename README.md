# Hookcrow

A reference library of short-form marketing videos, broken down into reusable structure.

Hookcrow ingests TikTok / Instagram / YouTube Shorts ads, runs them through Gemini, and turns each
one into a **recipe**: the video split into labelled beats (Hook → Bridge → Value → Proof → CTA),
with the transcript, a reusable script blueprint, the strategic logic behind each beat, and notes on
how it was shot and cut.

**The whole library is free and open.** No accounts, no paywall, no sign-up wall — every published
recipe is fully readable by anonymous visitors. `admin` is the only role that logs in, and it exists
to curate the library.

---

## Stack

| | |
|---|---|
| Framework | Nuxt 4 (Vue 3, Nitro node-server) |
| UI | @nuxt/ui v4, Tailwind CSS 4, Phosphor icons (`i-ph-*`) |
| Database | Supabase (PostgreSQL + pgvector + storage) |
| AI | Google Gemini 2.5 Flash (transcription, structure, audio, visual), `gemini-embedding-001` (search) |
| Media | ffmpeg (audio extraction, thumbnail frames) |
| Deploy | Docker → Railway; hourly ingest via GitHub Actions |

## Quick start

```bash
pnpm install
cp .env.example .env      # fill in the values below
pnpm dev                  # http://localhost:3000
```

Other scripts: `pnpm build`, `pnpm preview`, `pnpm start` (runs the built server), `pnpm generate`.

ffmpeg must be on your `PATH` for audio analysis and thumbnail generation.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side database + storage access |
| `GEMINI_API_KEY` | yes | All AI calls ([AI Studio](https://aistudio.google.com/apikey)) |
| `SITE_URL` | yes | Base URL for canonical links, sitemap, og: tags |
| `APIFY_TOKEN` | no | Source scraping for automated discovery |
| `NUXT_DISCOVERY_TICK_SECRET` | no | Shared secret for the scheduled ingest endpoint |
| `NUXT_DISCOVERY_DAILY_CAP` | no | Max videos ingested per tick (default 50) |

Never commit real values — `.env*` is gitignored except `.env.example`.

## Database setup

1. Create a Supabase project.
2. Run `supabase/setup_new_project.sql` in the SQL editor. It enables the extensions and creates the
   core tables, indexes, RLS policies, the `search_videos` RPC, and seeds the logic-flow templates.
3. Run `hookcrow_discovery_migration.sql` if you want automated ingest — it adds `discovery_sources`
   and `discovery_runs`, which the bootstrap script does not include.
4. Create a **public** storage bucket named `videos`.
5. Create your account in Supabase Auth (Authentication → Users — there is no public sign-up), then
   promote it: `UPDATE public.profiles SET role = 'admin' WHERE email = 'you@example.com';`

`supabase/schema.sql` is the canonical schema. `supabase/migrations/` holds the incremental history —
apply individual migrations only to an existing database, never to a fresh one.

### Tables

| Table | Purpose |
|---|---|
| `videos` | One row per recipe — media paths, transcript, blueprint, `skeletal_logic` / `audio_analysis` / `visual_analysis` JSONB, tags, `search_document` tsvector, `embedding vector(768)` |
| `segments` | Time-based beats within a video: label, start/end, transcript, blueprint, visual notes |
| `logic_flows` | Reusable structure templates (PAS, Listicle, Mythbuster, Story Arc, …) |
| `profiles` | Auth mirror. Carries `role` — the only thing gating `/admin` |
| `discovery_sources`, `discovery_runs` | Automated ingest: which creators/feeds to poll and what each run did |

Publishing is controlled by `videos.is_published` + `videos.status`. `videos.is_premium` still
exists but is **editorial metadata only** — it gates nothing.

## Architecture

```
app/
  pages/
    index.vue                 Landing — hero + themed carousels
    search.vue                Browse & search the library
    recipe/[id]/index.vue     Public recipe view (open to everyone)
    login.vue                 Admin sign-in (unlinked from public nav)
    admin/                    Curation UI — recipes, bulk tools, discovery, users
  components/
    landing/                  Hero, SearchSlider, DomainTabs
    recipe/                   Public recipe view: Hero, Summary, StructureBar, SegmentCard, …
    editor/                   Admin editing panels: transcript, skeletal logic, visual, tags
    video/                    Player, Timeline, TikTokEmbed, upload forms
  composables/                useAuth, useBrowse, useVideos, useSegments, useLibrary, …
  types/                      index.ts (domain types + tag vocabularies), database.ts (generated)
server/
  api/
    browse.get.ts             Public: hybrid search over the library
    recipes/[id].get.ts       Public: one full recipe
    search/interpret.post.ts  Public: AI query interpretation (rate limited, 20 / 5 min / IP)
    auth/                     login, logout, profile
    admin/                    Everything else — all admin-gated
    internal/discovery/tick   Scheduled ingest, guarded by a shared secret
  utils/
    analyzeVideo.ts           The Gemini analysis pipeline
    discovery.ts, apify.ts, ingestTikTok.ts, tiktokDownload.ts
    gemini.ts, supabase.ts, audio.ts, validation.ts, rateLimit.ts, logger.ts
  routes/                     robots.txt, sitemap.xml
supabase/                     schema.sql, setup_new_project.sql, migrations/
```

### Auth model

- Public pages need no account. `middleware/auth.global.ts` only bounces anonymous visitors off
  `/admin`; every other route is open.
- `server/utils/auth.ts` exposes `getServerUser`, `requireAuth`, `requireAdmin`. Every `/api/admin/*`
  endpoint calls `requireAdmin`.
- There is no public sign-up. Create admins in Supabase Auth, then set `profiles.role = 'admin'`.

### How a recipe is made

1. **Ingest** — an admin uploads a file or pastes a URL, or the hourly discovery tick pulls new
   videos from a configured source.
2. **Analyse** — one Gemini pass over the video produces the transcript, the segment breakdown, the
   matched logic flow, semantic tags, and the audio/visual analysis.
3. **Curate** — the admin edits segments, blueprints and tags in `/admin/recipes/[id]`.
4. **Publish** — flipping `is_published` puts it in the public library, the sitemap, and search.

### Search

`search_videos` is a Postgres RPC doing hybrid ranking: `ts_rank` full-text over `search_document`
fused (RRF) with pgvector cosine similarity over `embedding`. Query embeddings are cached in-process;
if embedding fails, it degrades to full-text only. `/api/search/interpret` optionally expands a
natural-language query into keywords and tags first.

## Deployment

The `Dockerfile` builds Nuxt and runs the Nitro server on a slim Node 22 image with ffmpeg installed.
Railway auto-detects it and injects `$PORT`.

`.github/workflows/discovery-tick.yml` POSTs to `/api/internal/discovery/tick` hourly. It needs two
repo secrets: `SITE_URL` and `DISCOVERY_TICK_SECRET` (the latter must match
`NUXT_DISCOVERY_TICK_SECRET` on the server).

## Conventions

- **Server** — `defineEventHandler`; validate with `server/utils/validation.ts`; `sanitizeString()`
  on user text; fail with `createError({ statusCode, message })`; responses wrap data as `{ data }`.
- **Client** — composables return `{ data, error }` tuples rather than throwing; `$fetch` for calls;
  `useState` for SSR-safe shared state.
- **Styling** — use the design tokens (`bg-default`, `text-muted`, `border-accented`, …) over
  hardcoded colours. Segment colours are fixed across the app: Hook red, Bridge yellow, Value green,
  Proof blue, CTA purple.
- **Files** — pages and components in PascalCase directories (auto-imported as `RecipeHero`,
  `EditorPanels`, …); server endpoints suffixed by method (`index.get.ts`, `[id].put.ts`).

## Licence

No licence file yet — all rights reserved until one is added.
