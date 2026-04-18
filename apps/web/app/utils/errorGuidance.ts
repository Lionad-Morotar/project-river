export interface ErrorGuidance {
  title: string
  hint: string
  hintParams?: Record<string, string>
}

export function getErrorGuidance(errorMessage: string | null | undefined): ErrorGuidance | null {
  if (!errorMessage)
    return null
  if (errorMessage.startsWith('GH_NOT_INSTALLED'))
    return { title: 'error.ghNotInstalled.title', hint: 'error.ghNotInstalled.hint' }
  if (errorMessage.startsWith('GH_AUTH'))
    return { title: 'error.ghAuth.title', hint: 'error.ghAuth.hint' }
  if (errorMessage.startsWith('GH_NOT_FOUND'))
    return { title: 'error.ghNotFound.title', hint: 'error.ghNotFound.hint' }
  if (errorMessage.startsWith('GH_PRIVATE'))
    return { title: 'error.ghPrivate.title', hint: 'error.ghPrivate.hint' }
  if (errorMessage.startsWith('CLONE_FAILED'))
    return { title: 'error.cloneFailed.title', hint: 'error.cloneFailed.hint', hintParams: { detail: errorMessage.replace('CLONE_FAILED: ', '') } }
  if (errorMessage.startsWith('ANALYSIS_FAILED'))
    return { title: 'error.analysisFailed.title', hint: 'error.analysisFailed.hint', hintParams: { detail: errorMessage.replace('ANALYSIS_FAILED: ', '') } }
  if (errorMessage.startsWith('ANALYSIS_TIMEOUT'))
    return { title: 'error.analysisTimeout.title', hint: 'error.analysisTimeout.hint' }
  return { title: 'error.generic.title', hint: 'error.generic.hint', hintParams: { detail: errorMessage } }
}
