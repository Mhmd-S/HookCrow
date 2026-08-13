export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ sourceId?: string }>(event)
  const summaries = await runDiscovery({ onlyDue: false, sourceId: body?.sourceId })

  return { data: summaries }
})
