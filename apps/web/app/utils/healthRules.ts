export interface HealthSignal {
  id: string
  label: string
  severity: 'info' | 'warning' | 'positive'
  evidence: string
  evidenceParams?: Record<string, string | number>
}

export interface HealthStatsInput {
  totalCommits: number
  totalContributors: number
  topContributors: Array<{ contributor: string, commits: number }>
  lastDate: string | null
  recent90DaysCommits: number
  prior270DaysDailyAvg: number
  avgLinesPerCommit: number
  recentQuarterContributors: number
  previousQuarterContributors: number
  daysSinceLastCommit: number | null
}

export function evaluateHealthRules(stats: HealthStatsInput): HealthSignal[] {
  const signals: HealthSignal[] = []

  // Rule 1: Concentration — top 3 > 80% of total
  if (stats.totalCommits > 0) {
    const top3Commits = stats.topContributors.slice(0, 3).reduce((sum, c) => sum + c.commits, 0)
    const concentration = top3Commits / stats.totalCommits
    if (concentration > 0.8) {
      const top3Names = stats.topContributors.slice(0, 3).map(c => c.contributor).join(', ')
      signals.push({
        id: 'concentration',
        label: 'health.concentration',
        severity: 'warning',
        evidence: 'health.concentrationEvidence',
        evidenceParams: {
          names: top3Names,
          pct: String(Math.round(concentration * 100)),
        },
      })
    }
  }

  // Rule 2: Activity drop — recent 90d daily avg < 30% of prior 270d daily avg
  if (stats.prior270DaysDailyAvg > 0) {
    const recent90DailyAvg = stats.recent90DaysCommits / 90
    const ratio = recent90DailyAvg / stats.prior270DaysDailyAvg
    if (ratio < 0.3) {
      signals.push({
        id: 'activity-drop',
        label: 'health.activityDrop',
        severity: 'warning',
        evidence: 'health.activityDropEvidence',
        evidenceParams: {
          avg: recent90DailyAvg.toFixed(1),
          pct: String(Math.round(ratio * 100)),
        },
      })
    }
  }

  // Rule 3: Code churn — avg lines per commit > 500
  if (stats.avgLinesPerCommit > 500) {
    signals.push({
      id: 'code-churn',
      label: 'health.codeChurn',
      severity: 'warning',
      evidence: 'health.codeChurnEvidence',
      evidenceParams: {
        lines: String(Math.round(stats.avgLinesPerCommit)),
      },
    })
  }

  // Rule 4: Distribution growth — quarter-over-quarter contributor growth
  if (stats.previousQuarterContributors > 0 && stats.recentQuarterContributors > stats.previousQuarterContributors) {
    const growth = Math.round(
      (stats.recentQuarterContributors - stats.previousQuarterContributors) / stats.previousQuarterContributors * 100,
    )
    signals.push({
      id: 'distribution-growth',
      label: 'health.distributionGrowth',
      severity: 'positive',
      evidence: 'health.distributionGrowthEvidence',
      evidenceParams: {
        pct: String(growth),
        prev: String(stats.previousQuarterContributors),
        curr: String(stats.recentQuarterContributors),
      },
    })
  }

  // Rule 5: Sustained activity — recent 30 days has commits
  if (stats.daysSinceLastCommit !== null && stats.daysSinceLastCommit <= 30) {
    signals.push({
      id: 'sustained-activity',
      label: 'health.sustainedActivity',
      severity: 'info',
      evidence: stats.daysSinceLastCommit <= 1
        ? 'health.sustainedActivityEvidenceToday'
        : 'health.sustainedActivityEvidence',
      evidenceParams: stats.daysSinceLastCommit <= 1
        ? undefined
        : { days: String(stats.daysSinceLastCommit) },
    })
  }

  // Rule 6: Project archived — last commit > 365 days ago
  if (stats.daysSinceLastCommit !== null && stats.daysSinceLastCommit > 365) {
    signals.push({
      id: 'project-archived',
      label: 'health.projectArchived',
      severity: 'warning',
      evidence: 'health.projectArchivedEvidence',
      evidenceParams: {
        lastDate: stats.lastDate ?? '',
        daysSilent: String(stats.daysSinceLastCommit),
      },
    })
  }

  return signals
}
