export interface HealthSignal {
  id: string
  label: string
  severity: 'info' | 'warning' | 'positive'
  evidence: string
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
        label: '贡献集中',
        severity: 'warning',
        evidence: `Top 3 贡献者 (${top3Names}) 占总提交的 ${Math.round(concentration * 100)}%`,
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
        label: '活跃度下降',
        severity: 'warning',
        evidence: `近 90 天日均 ${recent90DailyAvg.toFixed(1)} 次提交，为前期日均的 ${Math.round(ratio * 100)}%`,
      })
    }
  }

  // Rule 3: Code churn — avg lines per commit > 500
  if (stats.avgLinesPerCommit > 500) {
    signals.push({
      id: 'code-churn',
      label: '代码动荡',
      severity: 'warning',
      evidence: `平均每次提交变更 ${Math.round(stats.avgLinesPerCommit)} 行`,
    })
  }

  // Rule 4: Distribution growth — quarter-over-quarter contributor growth
  if (stats.previousQuarterContributors > 0 && stats.recentQuarterContributors > stats.previousQuarterContributors) {
    const growth = Math.round(
      (stats.recentQuarterContributors - stats.previousQuarterContributors) / stats.previousQuarterContributors * 100,
    )
    signals.push({
      id: 'distribution-growth',
      label: '贡献者增长',
      severity: 'positive',
      evidence: `贡献者数量季度环比增长 ${growth}%（${stats.previousQuarterContributors} → ${stats.recentQuarterContributors}）`,
    })
  }

  // Rule 5: Sustained activity — recent 30 days has commits
  if (stats.daysSinceLastCommit !== null && stats.daysSinceLastCommit <= 30) {
    signals.push({
      id: 'sustained-activity',
      label: '持续活跃',
      severity: 'info',
      evidence: stats.daysSinceLastCommit <= 1
        ? '最近一天内有提交'
        : `最近提交于 ${stats.daysSinceLastCommit} 天前`,
    })
  }

  return signals
}
