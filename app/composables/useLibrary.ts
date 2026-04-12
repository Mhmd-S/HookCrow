import type { Video, LogicFlow, VideoStatus, Platform } from '~/types'

export interface LibraryFilters {
  status: VideoStatus | 'all'
  platform: Platform | null
  logicFlowId: string | null
  search: string
}

interface VideoWithLogicFlow extends Video {
  logic_flow?: LogicFlow | null
}

export function useLibrary() {
  const { authHeaders } = useAuth()
  const videos = ref<VideoWithLogicFlow[]>([])
  const logicFlows = ref<LogicFlow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const filters = ref<LibraryFilters>({
    status: 'all',
    platform: null,
    logicFlowId: null,
    search: ''
  })

  /**
   * Fetch all videos with optional filters
   */
  async function fetchVideos() {
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()

      if (filters.value.status !== 'all') {
        params.set('status', filters.value.status)
      }
      if (filters.value.platform) {
        params.set('platform', filters.value.platform)
      }
      if (filters.value.logicFlowId) {
        params.set('logic_flow_id', filters.value.logicFlowId)
      }
      if (filters.value.search.trim()) {
        params.set('search', filters.value.search.trim())
      }

      const queryString = params.toString()
      const url = queryString ? `/api/admin/videos?${queryString}` : '/api/admin/videos'

      const { data } = await $fetch<{ data: VideoWithLogicFlow[] }>(url, { headers: authHeaders() })
      videos.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch videos'
    } finally {
      loading.value = false
    }

    return { data: videos.value, error: error.value }
  }

  /**
   * Fetch all logic flows (templates)
   */
  async function fetchLogicFlows() {
    try {
      const { data } = await $fetch<{ data: LogicFlow[] }>('/api/admin/logic-flows', { headers: authHeaders() })
      logicFlows.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch logic flows'
    }

    return { data: logicFlows.value, error: error.value }
  }

  /**
   * Load library (videos and logic flows)
   */
  async function loadLibrary() {
    loading.value = true
    error.value = null

    try {
      await Promise.all([fetchVideos(), fetchLogicFlows()])
    } finally {
      loading.value = false
    }
  }

  /**
   * Refresh videos only
   */
  async function refreshVideos() {
    await fetchVideos()
  }

  /**
   * Update filters and refetch
   */
  function setFilters(newFilters: Partial<LibraryFilters>) {
    filters.value = { ...filters.value, ...newFilters }
    fetchVideos()
  }

  /**
   * Clear all filters
   */
  function clearFilters() {
    filters.value = {
      status: 'all',
      platform: null,
      logicFlowId: null,
      search: ''
    }
    fetchVideos()
  }

  // Computed helpers
  const draftVideos = computed(() =>
    videos.value.filter((v) => v.status === 'draft')
  )

  const completedVideos = computed(() =>
    videos.value.filter((v) => v.status === 'complete')
  )

  const hasVideos = computed(() => videos.value.length > 0)

  const hasTemplates = computed(() =>
    logicFlows.value.some((lf) => lf.template_markdown)
  )

  return {
    // State
    videos,
    logicFlows,
    loading,
    error,
    filters,

    // Computed
    draftVideos,
    completedVideos,
    hasVideos,
    hasTemplates,

    // Actions
    loadLibrary,
    fetchVideos,
    fetchLogicFlows,
    refreshVideos,
    setFilters,
    clearFilters
  }
}
