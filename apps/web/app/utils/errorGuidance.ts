export interface ErrorGuidance {
  title: string
  hint: string
}

export function getErrorGuidance(errorMessage: string | null | undefined): ErrorGuidance | null {
  if (!errorMessage)
    return null
  if (errorMessage.startsWith('GH_NOT_INSTALLED'))
    return { title: 'GitHub CLI not found', hint: 'Install gh CLI from cli.github.com and restart the server.' }
  if (errorMessage.startsWith('GH_AUTH'))
    return { title: 'GitHub CLI not authenticated', hint: 'Run `gh auth login` in your terminal and restart the server.' }
  if (errorMessage.startsWith('GH_NOT_FOUND'))
    return { title: 'Repository not found', hint: 'Check the URL. The repository may be private or deleted.' }
  if (errorMessage.startsWith('GH_PRIVATE'))
    return { title: 'Private repository', hint: 'You don\'t have access to this repository. Ensure gh auth has the `repo` scope.' }
  if (errorMessage.startsWith('CLONE_FAILED'))
    return { title: 'Clone failed', hint: errorMessage.replace('CLONE_FAILED: ', '') }
  if (errorMessage.startsWith('ANALYSIS_FAILED'))
    return { title: 'Analysis failed', hint: errorMessage.replace('ANALYSIS_FAILED: ', '') }
  if (errorMessage.startsWith('ANALYSIS_TIMEOUT'))
    return { title: 'Analysis timed out', hint: 'The repository may be too large. Try again or use a smaller repository.' }
  return { title: 'Error', hint: errorMessage }
}
