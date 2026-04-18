import type { Video, BrowseFilters } from '~/types'

interface BrowseVideo extends Video {}

interface SearchInterpretation {
  keywords: string[]
  marketingAngles: string[]
  productTerms: string[]
  tags: string[]
  logicFlowTypes: string[]
  intent: string
  confidence: number
}

export function useBrowse() {
  const { authHeaders } = useAuth()
  const videos = ref<BrowseVideo[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const isAnon = ref(false)
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

      // AI interpretation runs for everyone (anon included) — the endpoint is
      // rate-limited per IP so anon abuse is bounded. The interpretation is
      // shown in the UI as click-to-apply suggestions but NEVER fed into the
      // search query as keyword/tag expansion. OR'ing 10+ broad terms
      // ("brew", "cold", "ground", "beans" for "coffee") floods results with
      // tangential matches. The embedding + raw-term tsquery handle recall.
      if (searchTerm.length >= 3) {
        await interpretSearch(searchTerm)
        params.set('search', searchTerm)
        if (filters.value.tags.length > 0) params.set('tags', filters.value.tags.join(','))
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
      }>(url, { headers: authHeaders() })
      videos.value = result.data || []
      isAnon.value = !!result.anon
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
    aiSearchLoading,
    searchInterpretation,
    loadBrowse,
    fetchBrowseVideos,
    setFilters,
    clearFilters
  }
}
