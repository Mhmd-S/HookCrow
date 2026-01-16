import type { LogicFlow, LogicFlowUpdate } from '~/types'

export function useTemplates() {
  const saving = ref(false)
  const error = ref<string | null>(null)

  /**
   * Update a logic flow's template markdown
   */
  async function saveTemplate(
    logicFlowId: string,
    templateMarkdown: string
  ): Promise<{ data: LogicFlow | null; error: string | null }> {
    saving.value = true
    error.value = null

    try {
      const { data } = await $fetch<{ data: LogicFlow }>(
        `/api/logic-flows/${logicFlowId}`,
        {
          method: 'PUT',
          body: {
            template_markdown: templateMarkdown
          } as LogicFlowUpdate
        }
      )

      return { data, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save template'
      error.value = message
      return { data: null, error: message }
    } finally {
      saving.value = false
    }
  }

  /**
   * Update a logic flow's name and description
   */
  async function updateLogicFlow(
    logicFlowId: string,
    updates: LogicFlowUpdate
  ): Promise<{ data: LogicFlow | null; error: string | null }> {
    saving.value = true
    error.value = null

    try {
      const { data } = await $fetch<{ data: LogicFlow }>(
        `/api/logic-flows/${logicFlowId}`,
        {
          method: 'PUT',
          body: updates
        }
      )

      return { data, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update logic flow'
      error.value = message
      return { data: null, error: message }
    } finally {
      saving.value = false
    }
  }

  /**
   * Get template markdown for a logic flow
   */
  function getTemplateMarkdown(
    logicFlows: LogicFlow[],
    logicFlowId: string | null
  ): string | null {
    if (!logicFlowId) return null
    const flow = logicFlows.find((lf) => lf.id === logicFlowId)
    return flow?.template_markdown || null
  }

  return {
    saving,
    error,
    saveTemplate,
    updateLogicFlow,
    getTemplateMarkdown
  }
}
