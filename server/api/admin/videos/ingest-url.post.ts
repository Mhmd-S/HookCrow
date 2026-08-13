interface IngestUrlRequest {
  url: string
}

interface IngestUrlResponse {
  data: {
    videoId: string
  }
}

export default defineEventHandler(async (event): Promise<IngestUrlResponse> => {
  const user = await requireAdmin(event)
  const body = await readBody<IngestUrlRequest>(event)

  // Validate URL
  const rawUrl = validateRequired(body?.url, 'url')
  validateString(rawUrl, 'url', { minLength: 5, maxLength: 2000 })

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    throw createError({ statusCode: 400, message: 'url must be a valid URL' })
  }

  if (!parsedUrl.hostname.endsWith('tiktok.com')) {
    throw createError({ statusCode: 400, message: 'url must be a TikTok URL (tiktok.com)' })
  }

  const url = rawUrl

  const result = await ingestTikTokUrl(url, {
    supabase: useServerSupabase(),
    ai: useServerGemini(),
    config: useRuntimeConfig(),
    createdBy: user.id,
  })

  if (result.status === 'failed') {
    throw createError({ statusCode: 500, message: result.error || 'Ingestion failed' })
  }

  return { data: { videoId: result.videoId! } }
})
