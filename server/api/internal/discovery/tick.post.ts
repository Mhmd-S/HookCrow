export default defineEventHandler(async (event) => {
  const header = getHeader(event, 'x-cron-secret')
  const secret = useRuntimeConfig().discoveryTickSecret as string | undefined

  if (!secret || header !== secret) {
    throw createError({ statusCode: 401, message: 'unauthorized' })
  }

  // Bounded per tick so the request completes well inside proxy timeouts;
  // the scheduler fires often enough to work through the backlog.
  const maxSources = Number(getQuery(event).maxSources ?? 2) || 2

  const summaries = await runDiscovery({ onlyDue: true, maxSources })
  return { data: summaries }
})
