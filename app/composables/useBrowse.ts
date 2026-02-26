import type { Video, LogicFlow, BrowseFilters } from '~/types'

interface BrowseVideo extends Video {
  logic_flow?: LogicFlow | null
}

export function useBrowse() {
  const videos = ref<BrowseVideo[]>([])
  const logicFlows = ref<LogicFlow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const filters = ref<BrowseFilters>({
    domains: [],
    formats: [],
    logicFlowId: null,
    search: '',
    page: 1
  })

  async function fetchBrowseVideos() {
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()

      const tags = [...filters.value.domains, ...filters.value.formats]
      if (tags.length > 0) {
        params.set('tags', tags.join(','))
      }
      if (filters.value.logicFlowId) {
        params.set('logic_flow_id', filters.value.logicFlowId)
      }
      if (filters.value.search.trim()) {
        params.set('search', filters.value.search.trim())
      }
      if (filters.value.page > 1) {
        params.set('page', String(filters.value.page))
      }

      const queryString = params.toString()
      const url = queryString ? `/api/browse?${queryString}` : '/api/browse'

      const result = await $fetch<{ data: BrowseVideo[]; page: number; limit: number }>(url)
      videos.value = result.data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load videos'
    } finally {
      loading.value = false
    }
  }

  async function fetchLogicFlows() {
    try {
      const { data } = await $fetch<{ data: LogicFlow[] }>('/api/logic-flows')
      logicFlows.value = data || []
    } catch {
      // Non-critical: filters still work without logic flows
    }
  }

  async function loadBrowse() {
    await Promise.all([fetchBrowseVideos(), fetchLogicFlows()])
  }

  function setFilters(newFilters: Partial<BrowseFilters>) {
    filters.value = { ...filters.value, ...newFilters, page: 1 }
    fetchBrowseVideos()
  }

  function clearFilters() {
    filters.value = {
      domains: [],
      formats: [],
      logicFlowId: null,
      search: '',
      page: 1
    }
    fetchBrowseVideos()
  }

  return {
    videos,
    logicFlows,
    loading,
    error,
    filters,
    loadBrowse,
    fetchBrowseVideos,
    setFilters,
    clearFilters
  }
}
