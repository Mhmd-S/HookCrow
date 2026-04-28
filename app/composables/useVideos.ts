import type { Video, VideoInsert, VideoUpdate, VideoWithSegments } from '~/types'
import { extractThumbnailFromVideoFile } from '~/utils/videoThumbnail'

export function useVideos() {
  const { authHeaders } = useAuth()

  async function fetchVideos() {
    try {
      const { data } = await $fetch<{ data: Video[] }>('/api/admin/videos', {
        headers: authHeaders()
      })
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  async function fetchVideo(id: string): Promise<{ data: VideoWithSegments | null; error: Error | null }> {
    try {
      const { data } = await $fetch<{ data: VideoWithSegments }>(`/api/admin/videos/${id}`, {
        headers: authHeaders()
      })
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  async function createVideo(video: VideoInsert) {
    try {
      const { data } = await $fetch<{ data: Video }>('/api/admin/videos', {
        method: 'POST',
        body: video,
        headers: authHeaders()
      })
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  async function updateVideo(id: string, updates: VideoUpdate) {
    try {
      const { data } = await $fetch<{ data: Video }>(`/api/admin/videos/${id}`, {
        method: 'PUT',
        body: updates,
        headers: authHeaders()
      })
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  async function deleteVideo(id: string) {
    try {
      await $fetch(`/api/admin/videos/${id}`, { method: 'DELETE', headers: authHeaders() })
      return { error: null }
    } catch (err) {
      return { error: err as Error }
    }
  }

  async function uploadVideoFile(file: File): Promise<{ path: string | null; thumbnailPath: string | null; error: Error | null }> {
    try {
      const formData = new FormData()
      formData.append('file', file)

      // Extract thumbnail in the browser using <video> + canvas — works on
      // serverless platforms (Vercel) where ffmpeg isn't available.
      const thumbnailBlob = await extractThumbnailFromVideoFile(file)
      if (thumbnailBlob) {
        formData.append('thumbnail', thumbnailBlob, 'thumbnail.jpg')
      }

      const { path, thumbnailPath } = await $fetch<{ path: string; thumbnailPath?: string | null }>('/api/admin/videos/upload', {
        method: 'POST',
        body: formData,
        headers: authHeaders()
      })
      return { path, thumbnailPath: thumbnailPath || null, error: null }
    } catch (err) {
      return { path: null, thumbnailPath: null, error: err as Error }
    }
  }

  function getVideoUrl(path: string): string {
    const config = useRuntimeConfig()
    const supabaseUrl = config.public.supabaseUrl as string
    return `${supabaseUrl}/storage/v1/object/public/videos/${path}`
  }

  // iOS Safari won't paint a first frame from preload="metadata" alone; a time
  // fragment forces it to seek and render that frame as a thumbnail.
  function getVideoThumbnailUrl(path: string): string {
    return `${getVideoUrl(path)}#t=0.1`
  }

  function getVideoThumbnailImgUrl(path: string): string {
    const config = useRuntimeConfig()
    const supabaseUrl = config.public.supabaseUrl as string
    return `${supabaseUrl}/storage/v1/object/public/videos/${path}`
  }

  return {
    fetchVideos,
    fetchVideo,
    createVideo,
    updateVideo,
    deleteVideo,
    uploadVideoFile,
    getVideoUrl,
    getVideoThumbnailUrl,
    getVideoThumbnailImgUrl
  }
}
