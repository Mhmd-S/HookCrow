export default defineEventHandler(async (event) => {
  const header = getHeader(event, 'x-cron-secret')
  const secret = useRuntimeConfig().discoveryTickSecret as string | undefined

  if (!secret || header !== secret) {
    throw createError({ statusCode: 401, message: 'unauthorized' })
  }

  const summaries = await runDiscovery({ onlyDue: true })
  return { data: summaries }
})
