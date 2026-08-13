const log = createLogger('discovery')

export interface RunSummary {
  sourceId: string
  found: number
  ingested: number
  skipped: number
  failed: number
  error?: string
}

export async function runDiscovery(opts: {
  onlyDue?: boolean
  sourceId?: string
} = {}): Promise<RunSummary[]> {
  const supabase = useServerSupabase()
  const config = useRuntimeConfig()
  const ai = useServerGemini()
  const apifyToken = config.apifyToken as string | undefined
  const dailyCap = Number(config.discoveryDailyCap ?? '50') || 50

  // ── Load sources ──────────────────────────────────────────────
  let query = supabase.from('discovery_sources').select('*')

  if (opts.sourceId) {
    query = query.eq('id', opts.sourceId)
  } else {
    query = query.eq('enabled', true)
  }

  const { data: rows, error: fetchErr } = await query.order('created_at', { ascending: true })

  if (fetchErr || !rows) {
    log.error('Failed to fetch discovery sources', fetchErr)
    return []
  }

  // Filter by due-ness unless explicitly told not to (run.post sets onlyDue=false)
  const shouldCheckDue = opts.onlyDue !== false
  const now = Date.now()
  const sources = shouldCheckDue
    ? rows.filter((s) => {
        if (!s.last_run_at) return true
        return now - Date.parse(s.last_run_at) >= (s.cadence_hours ?? 24) * 3600_000
      })
    : rows

  if (sources.length === 0) {
    log.info('No sources to run')
    return []
  }

  log.info(`Starting discovery run`, { sourceCount: sources.length })

  let ingestedThisRun = 0
  const summaries: RunSummary[] = []

  for (const source of sources) {
    // Insert run record
    const { data: runRow, error: insertErr } = await supabase
      .from('discovery_runs')
      .insert({
        source_id: source.id,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertErr || !runRow) {
      log.error('Failed to create discovery_runs row', insertErr, { sourceId: source.id })
      summaries.push({ sourceId: source.id, found: 0, ingested: 0, skipped: 0, failed: 0, error: 'DB insert failed' })
      continue
    }

    const runId = runRow.id
    let found = 0
    let ingested = 0
    let skipped = 0
    let failed = 0
    let runError: string | undefined

    try {
      const urls = await discoverTikTokUrls(
        { type: source.type as 'hashtag' | 'profile' | 'search', value: source.value },
        source.max_per_run ?? 10,
        apifyToken ?? '',
      )
      found = urls.length

      for (const url of urls) {
        if (ingestedThisRun >= dailyCap) {
          log.info('Daily cap reached, stopping', { dailyCap, sourceId: source.id })
          break
        }

        const result = await ingestTikTokUrl(url, {
          supabase,
          ai,
          config,
          createdBy: null,
          publishGate: true,
        })

        if (result.status === 'ingested') {
          ingested++
          ingestedThisRun++
        } else if (result.status === 'skipped') {
          skipped++
        } else {
          failed++
        }
      }
    } catch (err) {
      runError = err instanceof Error ? err.message : String(err)
      log.error('Source run failed', err, { sourceId: source.id })
    }

    // Update run record
    await supabase
      .from('discovery_runs')
      .update({
        finished_at: new Date().toISOString(),
        found,
        ingested,
        skipped,
        failed,
        error: runError ?? null,
      })
      .eq('id', runId)

    // Update source last_run_at
    await supabase
      .from('discovery_sources')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', source.id)

    summaries.push({ sourceId: source.id, found, ingested, skipped, failed, error: runError })
    log.info(`Source complete`, { sourceId: source.id, found, ingested, skipped, failed })
  }

  log.info(`Discovery run complete`, { totalSources: sources.length, ingestedThisRun })
  return summaries
}
