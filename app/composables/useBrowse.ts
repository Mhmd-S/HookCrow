import type { Video, BrowseFilters } from '~/types'

interface BrowseVideo extends Video {}

interface SearchInterpretation {
  keywords: string[]
  tags: string[]
  logicFlowType: string | null
  intent: string
  confidence: number
}

export function useBrowse() {
  const { authHeaders, isAuthenticated } = useAuth()
  const videos = ref<BrowseVideo[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const isAnon = ref(false)
  const teaserLimit = ref<number | null>(null)
  // Use useState so AppHeader can access the loading state
  const aiSearchLoading = useState('ai-search-loading', () => false)
  const searchInterpretation = useState<SearchInterpretation | null>('search-interpretation', () => null)

  const filters = ref<BrowseFilters>({
    tags: [],
    search: '',
    page: 1
  })

  async function interpretSearch(query: string): Promise<SearchInterpretation | null> {
    if (!query.trim() || query.trim().length < 3) return null

    aiSearchLoading.value = true
    try {
      const result = await $fetch<SearchInterpretation>('/api/search/interpret', {
        method: 'POST',
        body: { query: query.trim() },
        headers: authHeaders()
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

      // AI interpretation is a Pro-side affordance; skip entirely for anon callers
      // since /api/search/interpret requires auth and would 401.
      if (searchTerm.length >= 3 && isAuthenticated.value) {
        const interpretation = await interpretSearch(searchTerm)

        if (interpretation && interpretation.confidence > 0.3) {
          // Merge interpreted tags with existing filter tags
          const allTags = [...filters.value.tags, ...interpretation.tags]
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
        } else {
          // Low confidence or no interpretation: pass raw search
          params.set('search', searchTerm)
          if (filters.value.tags.length > 0) params.set('tags', filters.value.tags.join(','))
        }
      } else {
        // Short query or empty: standard search
        if (searchTerm) params.set('search', searchTerm)
        if (filters.value.tags.length > 0) params.set('tags', filters.value.tags.join(','))
      }

      if (filters.value.page > 1) {
        params.set('page', String(filters.value.page))
      }

      const queryString = params.toString()
      const url = queryString ? `/api/browse?${queryString}` : '/api/browse'

      const result = await $fetch<{
        data: BrowseVideo[]
        page: number
        limit: number
        anon?: boolean
        teaser_limit?: number | null
      }>(url, { headers: authHeaders() })
      videos.value = result.data || []
      isAnon.value = !!result.anon
      teaserLimit.value = result.teaser_limit ?? null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load videos'
    } finally {
      loading.value = false
    }
  }

  async function loadBrowse() {
    await fetchBrowseVideos()
  }

  function setFilters(newFilters: Partial<BrowseFilters>) {
    filters.value = { ...filters.value, ...newFilters, page: 1 }
    fetchBrowseVideos()
  }

  function clearFilters() {
    filters.value = {
      tags: [],
      search: '',
      page: 1
    }
    searchInterpretation.value = null
    fetchBrowseVideos()
  }

  return {
    videos,
    loading,
    error,
    filters,
    isAnon,
    teaserLimit,
    aiSearchLoading,
    searchInterpretation,
    loadBrowse,
    fetchBrowseVideos,
    setFilters,
    clearFilters
  }
}
