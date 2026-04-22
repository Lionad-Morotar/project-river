import type { ParseResult } from '~/utils/githubUrl'
import { useI18n } from 'vue-i18n'
import { detectInputType, parseGitHubUrl, parseLocalPath } from '~/utils/githubUrl'

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

  const { t } = useI18n()

  /** Derive human-readable stage label for the current status */
  const stageLabel = computed(() => {
    switch (status.value) {
      case 'importing':
        return t('import.cloning')
      case 'analyzing':
        return t('import.analyzing')
      case 'redirecting':
        return t('import.complete')
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
   * Detects input type (local path vs GitHub URL) and routes accordingly.
   */
  async function importRepo(input: string): Promise<{ parseResult?: ParseResult, success: boolean }> {
    const inputType = detectInputType(input)

    // --- 本地路径分支 ---
    if (inputType === 'local-path') {
      const parseResult = parseLocalPath(input)
      if ('error' in parseResult) {
        errorMessage.value = parseResult.error
        status.value = 'error'
        return { success: false }
      }

      stopPolling()
      errorMessage.value = null
      status.value = 'importing'

      try {
        const result = await $fetch<{ id: number, status: string, fullName: string }>(
          '/api/projects/import',
          {
            method: 'POST',
            body: { path: parseResult.path },
          },
        )

        projectId.value = result.id

        if (result.status === 'ready') {
          status.value = 'redirecting'
          await navigateTo(`/projects/${result.id}`)
          return { success: true }
        }

        if (result.status === 'cloning' || result.status === 'analyzing') {
          status.value = mapServerStatus(result.status)
          startPolling(result.id)
          return { success: true }
        }

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

    // --- GitHub URL 分支（原有逻辑） ---
    const parseResult = parseGitHubUrl(input)
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
          body: { url: input },
        },
      )

      projectId.value = result.id

      if (result.status === 'ready') {
        status.value = 'redirecting'
        await navigateTo(`/projects/${result.id}`)
        return { success: true }
      }

      if (result.status === 'cloning' || result.status === 'analyzing') {
        status.value = mapServerStatus(result.status)
        startPolling(result.id)
        return { success: true }
      }

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
