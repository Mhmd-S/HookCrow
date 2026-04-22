import type { Video, VideoInsert, VideoUpdate, VideoWithSegments } from '~/types'

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

  async function uploadVideoFile(file: File): Promise<{ path: string | null; error: Error | null }> {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const { path } = await $fetch<{ path: string }>('/api/admin/videos/upload', {
        method: 'POST',
        body: formData,
        headers: authHeaders()
      })
      return { path, error: null }
    } catch (err) {
      return { path: null, error: err as Error }
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

  return {
    fetchVideos,
    fetchVideo,
    createVideo,
    updateVideo,
    deleteVideo,
    uploadVideoFile,
    getVideoUrl,
    getVideoThumbnailUrl
  }
}
