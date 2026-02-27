import type { Video, LogicFlow, BrowseFilters } from '~/types'

interface BrowseVideo extends Video {
  logic_flow?: LogicFlow | null
}

interface SearchInterpretation {
  keywords: string[]
  tags: string[]
  logicFlowType: string | null
  intent: string
  confidence: number
}

export function useBrowse() {
  const videos = ref<BrowseVideo[]>([])
  const logicFlows = ref<LogicFlow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  // Use useState so AppHeader can access the loading state
  const aiSearchLoading = useState('ai-search-loading', () => false)
  const searchInterpretation = useState<SearchInterpretation | null>('search-interpretation', () => null)

  const filters = ref<BrowseFilters>({
    domains: [],
    formats: [],
    logicFlowId: null,
    search: '',
    page: 1
  })

  async function interpretSearch(query: string): Promise<SearchInterpretation | null> {
    if (!query.trim() || query.trim().length < 3) return null

    aiSearchLoading.value = true
    try {
      const result = await $fetch<SearchInterpretation>('/api/search/interpret', {
        method: 'POST',
        body: { query: query.trim() }
      })
      searchInterpretation.value = result
      return result
    } catch {
      searchInterpretation.value = null
      return null
    } finally {
      aiSearchLoading.value = false
    }
  }

  async function fetchBrowseVideos() {
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()
      const searchTerm = filters.value.search.trim()

      // AI interpretation for queries with 3+ characters
      if (searchTerm.length >= 3) {
        const interpretation = await interpretSearch(searchTerm)

        if (interpretation && interpretation.confidence > 0.3) {
          // Merge interpreted tags with existing filter tags
          const allTags = [
            ...filters.value.domains,
            ...filters.value.formats,
            ...interpretation.tags
          ]
          const uniqueTags = [...new Set(allTags)]
          if (uniqueTags.length > 0) {
            params.set('tags', uniqueTags.join(','))
          }

          // Pass interpreted keywords for full-text search expansion
          if (interpretation.keywords.length > 0) {
            params.set('keywords', interpretation.keywords.join(','))
          }

          // Also pass the original search term for direct matching
          params.set('search', searchTerm)

          // Use logic flow from interpretation if not already filtered
          if (interpretation.logicFlowType && !filters.value.logicFlowId) {
            const match = logicFlows.value.find(lf =>
              lf.name.toLowerCase().includes(interpretation.logicFlowType!.toLowerCase())
            )
            if (match) {
              params.set('logic_flow_id', match.id)
            }
          }
        } else {
          // Low confidence or no interpretation: pass raw search
          params.set('search', searchTerm)
          const tags = [...filters.value.domains, ...filters.value.formats]
          if (tags.length > 0) params.set('tags', tags.join(','))
        }
      } else {
        // Short query or empty: standard search
        if (searchTerm) params.set('search', searchTerm)
        const tags = [...filters.value.domains, ...filters.value.formats]
        if (tags.length > 0) params.set('tags', tags.join(','))
      }

      if (filters.value.logicFlowId) {
        params.set('logic_flow_id', filters.value.logicFlowId)
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
    searchInterpretation.value = null
    fetchBrowseVideos()
  }

  return {
    videos,
    logicFlows,
    loading,
    error,
    filters,
    aiSearchLoading,
    searchInterpretation,
    loadBrowse,
    fetchBrowseVideos,
    setFilters,
    clearFilters
  }
}
