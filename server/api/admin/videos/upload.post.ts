const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const formData = await readMultipartFormData(event)

  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No file provided'
    })
  }

  const file = formData.find(f => f.name === 'file')

  if (!file || !file.data || !file.filename) {
    throw createError({
      statusCode: 400,
      message: 'Invalid file'
    })
  }

  // Validate file size
  if (file.data.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
    })
  }

  // Validate file type
  const mimeType = file.type || 'video/mp4'
  if (!ALLOWED_VIDEO_TYPES.includes(mimeType)) {
    throw createError({
      statusCode: 400,
      message: `Invalid file type. Allowed types: ${ALLOWED_VIDEO_TYPES.join(', ')}`
    })
  }

  // Validate file extension
  const allowedExtensions = ['mp4', 'webm', 'mov', 'avi']
  const fileExt = file.filename.split('.').pop()?.toLowerCase()
  if (!fileExt || !allowedExtensions.includes(fileExt)) {
    throw createError({
      statusCode: 400,
      message: `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`
    })
  }

  const fileName = `${crypto.randomUUID()}.${fileExt}`
  const filePath = `videos/${fileName}`

  const supabase = useServerSupabase()

  const { error } = await supabase.storage
    .from('videos')
    .upload(filePath, file.data, {
      contentType: mimeType,
      upsert: false
    })

  if (error) {
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { path: filePath }
})
