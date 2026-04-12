import type { LogicFlow } from '~/types'

export function useLogicFlows() {
  const { authHeaders } = useAuth()
  const logicFlows = useState<LogicFlow[]>('logicFlows', () => [])
  const loading = useState('logicFlowsLoading', () => false)
  const error = useState<string | null>('logicFlowsError', () => null)

  async function fetchLogicFlows() {
    loading.value = true
    error.value = null

    try {
      const { data } = await $fetch<{ data: LogicFlow[] }>('/api/admin/logic-flows', {
        headers: authHeaders()
      })
      logicFlows.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch logic flows'
    } finally {
      loading.value = false
    }

    return { data: logicFlows.value, error: error.value }
  }

  return {
    logicFlows,
    loading,
    error,
    fetchLogicFlows
  }
}
