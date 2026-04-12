import type { Video } from '~/types'

export function useBookmarks() {
  const { authHeaders, isAuthenticated } = useAuth()

  const bookmarks = useState<Video[]>('bookmarks', () => [])
  const bookmarkedIds = useState<Set<string>>('bookmark-ids', () => new Set())
  const loading = useState<boolean>('bookmarks-loading', () => false)
  const loaded = useState<boolean>('bookmarks-loaded', () => false)

  function isBookmarked(videoId: string): boolean {
    return bookmarkedIds.value.has(videoId)
  }

  async function fetchBookmarks() {
    if (!isAuthenticated.value) {
      bookmarks.value = []
      bookmarkedIds.value = new Set()
      loaded.value = true
      return
    }
    loading.value = true
    try {
      const res = await $fetch<{ data: Video[] }>('/api/bookmarks', {
        headers: authHeaders()
      })
      bookmarks.value = res.data || []
      bookmarkedIds.value = new Set(bookmarks.value.map(v => v.id))
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  async function addBookmark(video: Video) {
    if (!isAuthenticated.value) return { error: 'Not authenticated' }
    const already = bookmarkedIds.value.has(video.id)
    // Optimistic
    bookmarkedIds.value = new Set([...bookmarkedIds.value, video.id])
    if (!already) bookmarks.value = [video, ...bookmarks.value]

    try {
      await $fetch('/api/bookmarks', {
        method: 'POST',
        body: { videoId: video.id },
        headers: authHeaders()
      })
      return { error: null }
    } catch (err: any) {
      bookmarkedIds.value = new Set([...bookmarkedIds.value].filter(id => id !== video.id))
      bookmarks.value = bookmarks.value.filter(v => v.id !== video.id)
      return { error: err?.data?.message || err?.message || 'Failed to bookmark' }
    }
  }

  async function removeBookmark(videoId: string) {
    if (!isAuthenticated.value) return { error: 'Not authenticated' }
    const previous = bookmarks.value
    bookmarkedIds.value = new Set([...bookmarkedIds.value].filter(id => id !== videoId))
    bookmarks.value = bookmarks.value.filter(v => v.id !== videoId)

    try {
      await $fetch(`/api/bookmarks/${videoId}`, {
        method: 'DELETE',
        headers: authHeaders()
      })
      return { error: null }
    } catch (err: any) {
      bookmarks.value = previous
      bookmarkedIds.value = new Set(previous.map(v => v.id))
      return { error: err?.data?.message || err?.message || 'Failed to remove bookmark' }
    }
  }

  async function toggleBookmark(video: Video) {
    return isBookmarked(video.id) ? removeBookmark(video.id) : addBookmark(video)
  }

  return {
    bookmarks,
    loading,
    loaded,
    isBookmarked,
    fetchBookmarks,
    addBookmark,
    removeBookmark,
    toggleBookmark
  }
}
