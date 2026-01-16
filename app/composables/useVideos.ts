import type { Video, VideoInsert, VideoUpdate, VideoWithSegments } from '~/types'

export function useVideos() {
  async function fetchVideos() {
    try {
      const { data } = await $fetch<{ data: Video[] }>('/api/videos')
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  async function fetchVideo(id: string): Promise<{ data: VideoWithSegments | null; error: Error | null }> {
    try {
      const { data } = await $fetch<{ data: VideoWithSegments }>(`/api/videos/${id}`)
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  async function createVideo(video: VideoInsert) {
    try {
      const { data } = await $fetch<{ data: Video }>('/api/videos', {
        method: 'POST',
        body: video
      })
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  async function updateVideo(id: string, updates: VideoUpdate) {
    try {
      const { data } = await $fetch<{ data: Video }>(`/api/videos/${id}`, {
        method: 'PUT',
        body: updates
      })
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  async function deleteVideo(id: string) {
    try {
      await $fetch(`/api/videos/${id}`, { method: 'DELETE' })
      return { error: null }
    } catch (err) {
      return { error: err as Error }
    }
  }

  async function uploadVideoFile(file: File): Promise<{ path: string | null; error: Error | null }> {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const { path } = await $fetch<{ path: string }>('/api/videos/upload', {
        method: 'POST',
        body: formData
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

  return {
    fetchVideos,
    fetchVideo,
    createVideo,
    updateVideo,
    deleteVideo,
    uploadVideoFile,
    getVideoUrl
  }
}
