import type { Segment, SegmentInsert, SegmentUpdate } from '~/types'

export function useSegments() {
  const { authHeaders } = useAuth()

  async function fetchSegments(videoId: string) {
    try {
      const { data } = await $fetch<{ data: Segment[] }>('/api/admin/segments', {
        query: { videoId },
        headers: authHeaders()
      })
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  async function createSegment(segment: SegmentInsert) {
    try {
      const { data } = await $fetch<{ data: Segment }>('/api/admin/segments', {
        method: 'POST',
        body: segment,
        headers: authHeaders()
      })
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  async function updateSegment(id: string, updates: SegmentUpdate) {
    try {
      const { data } = await $fetch<{ data: Segment }>(`/api/admin/segments/${id}`, {
        method: 'PUT',
        body: updates,
        headers: authHeaders()
      })
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  async function deleteSegment(id: string) {
    try {
      await $fetch(`/api/admin/segments/${id}`, { method: 'DELETE', headers: authHeaders() })
      return { error: null }
    } catch (err) {
      return { error: err as Error }
    }
  }

  async function upsertSegments(videoId: string, segments: SegmentInsert[]) {
    try {
      const { data } = await $fetch<{ data: Segment[] }>('/api/admin/segments/upsert', {
        method: 'POST',
        body: { videoId, segments },
        headers: authHeaders()
      })
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }

  return {
    fetchSegments,
    createSegment,
    updateSegment,
    deleteSegment,
    upsertSegments
  }
}
