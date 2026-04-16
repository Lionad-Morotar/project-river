import type { ParseResult } from '~/utils/githubUrl'
import { parseGitHubUrl } from '~/utils/githubUrl'

export type ImportStatus = 'idle' | 'importing' | 'analyzing' | 'redirecting' | 'error'

const POLL_INTERVAL_MS = 2000

export function useProjectImport() {
  const status = ref<ImportStatus>('idle')
  const projectId = ref<number | null>(null)
  const errorMessage = ref<string | null>(null)

  let pollTimer: ReturnType<typeof setInterval> | null = null

  /** Map server status string to client-side ImportStatus */
  function mapServerStatus(serverStatus: string): ImportStatus {
    if (serverStatus === 'cloning' || serverStatus === 'importing')
      return 'importing'
    if (serverStatus === 'analyzing')
      return 'analyzing'
    if (serverStatus === 'ready')
      return 'redirecting'
    if (serverStatus === 'error')
      return 'error'
    return 'idle'
  }

  /** Derive human-readable stage label for the current status */
  const stageLabel = computed(() => {
    switch (status.value) {
      case 'importing':
        return 'Cloning repository...'
      case 'analyzing':
        return 'Analyzing commits...'
      case 'redirecting':
        return 'Analysis complete. Redirecting...'
      default:
        return ''
    }
  })

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function reset() {
    stopPolling()
    status.value = 'idle'
    projectId.value = null
    errorMessage.value = null
  }

  /**
   * Kick off import by calling POST /api/projects/import.
   * On success, starts polling import-status until ready or error.
   * Returns the parsed URL result so the caller can show validation errors.
   */
  async function importRepo(url: string): Promise<{ parseResult?: ParseResult, success: boolean }> {
    // Validate URL client-side first
    const parseResult = parseGitHubUrl(url)
    if ('error' in parseResult) {
      errorMessage.value = parseResult.error
      status.value = 'error'
      return { parseResult, success: false }
    }

    // Reset state
    stopPolling()
    errorMessage.value = null
    status.value = 'importing'

    try {
      const result = await $fetch<{ id: number, status: string, fullName: string }>(
        '/api/projects/import',
        {
          method: 'POST',
          body: { url },
        },
      )

      projectId.value = result.id

      // If server says already ready, navigate immediately
      if (result.status === 'ready') {
        status.value = 'redirecting'
        await navigateTo(`/projects/${result.id}`)
        return { success: true }
      }

      // If in progress (cloning/analyzing), start polling
      if (result.status === 'cloning' || result.status === 'analyzing') {
        status.value = mapServerStatus(result.status)
        startPolling(result.id)
        return { success: true }
      }

      // Error status returned from server
      status.value = 'error'
      errorMessage.value = 'Import returned unexpected status.'
      return { success: false }
    }
    catch (err: any) {
      status.value = 'error'
      const serverMsg = err?.data?.statusMessage || err?.statusMessage || err?.message
      errorMessage.value = serverMsg || 'Import failed. Please try again.'
      return { success: false }
    }
  }

  function startPolling(id: number) {
    stopPolling()

    pollTimer = setInterval(async () => {
      try {
        const result = await $fetch<{ status: string, errorMessage: string | null }>(
          `/api/projects/${id}/import-status`,
        )

        const mapped = mapServerStatus(result.status)
        status.value = mapped

        if (mapped === 'redirecting') {
          stopPolling()
          await navigateTo(`/projects/${id}`)
        }
        else if (mapped === 'error') {
          stopPolling()
          errorMessage.value = result.errorMessage || 'Import failed with an unknown error.'
        }
      }
      catch (err: any) {
        stopPolling()
        status.value = 'error'
        errorMessage.value = err?.data?.statusMessage || err?.message || 'Failed to check import status.'
      }
    }, POLL_INTERVAL_MS)
  }

  onBeforeUnmount(() => {
    stopPolling()
  })

  return {
    status: readonly(status),
    stageLabel: readonly(stageLabel),
    projectId: readonly(projectId),
    errorMessage: readonly(errorMessage),
    importRepo,
    reset,
  }
}
