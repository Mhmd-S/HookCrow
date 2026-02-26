import type { VideoInsert } from '~/types'
import { VIDEO_STATUSES } from '~/types'

export default defineEventHandler(async (event) => {
  const body = await readBody<VideoInsert>(event)

  // Validate required field
  const videoPath = validateRequired(body?.video_path, 'video_path')
  validateString(videoPath, 'video_path', { minLength: 1, maxLength: 1000 })

  // Validate source_url if provided
  let sourceUrl: string | null = null
  if (body.source_url) {
    try {
      new URL(body.source_url)
      sourceUrl = body.source_url.slice(0, 2000)
    } catch {
      throw createError({
        statusCode: 400,
        message: 'source_url must be a valid URL'
      })
    }
  }

  // Validate logic_flow_id if provided
  if (body.logic_flow_id) {
    validateUUID(body.logic_flow_id, 'logic_flow_id')
  }

  // Validate status if provided (defaults to 'draft')
  const status = body.status ? validateEnum(body.status, 'status', VIDEO_STATUSES) : 'draft'

  // Attach user_id if authenticated
  const user = await getServerUser(event)

  const sanitizedData: VideoInsert = {
    video_path: videoPath,
    source_url: sourceUrl,
    logic_flow_id: body.logic_flow_id || null,
    creator_handle: body.creator_handle ? sanitizeString(body.creator_handle).slice(0, 100) : null,
    platform: body.platform || null,
    user_id: user?.id || null,
    title: body.title ? sanitizeString(String(body.title)).slice(0, 200) : null,
    status
  }

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('videos')
    .insert(sanitizedData)
    .select()
    .single()

  if (error) {
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { data }
})
