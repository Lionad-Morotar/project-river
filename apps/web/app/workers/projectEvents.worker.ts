// Project Events Detection Worker
// Self-contained — runs all algorithms in a Web Worker thread

interface DailyRow {
  date: string
  contributor: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
  cumulativeCommits: number
}

type EventType
  = | 'contributor_first_commit'
    | 'contributor_exit'
    | 'activity_spike'
    | 'activity_drop'
    | 'major_refactor'
    | 'commit_milestone'
    | 'project_start'
    | 'project_archived'

type Severity = 'info' | 'positive' | 'warning'

interface ProjectEvent {
  id: string
  type: EventType
  date: string
  severity: Severity
  priority?: number
  impactScore: number
  titleKey: string
  descriptionKey: string
  params: Record<string, string | number>
  contributors?: string[]
}

interface EventDetectionConfig {
  contributorExitThresholdCommits: number
  contributorExitGapDays: number
  contributorExitProjectActiveDays: number
  firstCommitThreshold: number
  activitySpikeZScore: number
  activityDropZScore: number
  activityDropConsecutiveDays: number
  slidingWindowDays: number
  minDataDaysForMutation: number
  refactorDeletionMultiplier: number
  refactorCooldownDays: number
  commitMilestones: number[]
  enabledRules: EventType[]
}

const defaultConfig: EventDetectionConfig = {
  contributorExitThresholdCommits: 50,
  contributorExitGapDays: 60,
  contributorExitProjectActiveDays: 30,
  firstCommitThreshold: 20,
  activitySpikeZScore: 3.5,
  activityDropZScore: 2.0,
  activityDropConsecutiveDays: 7,
  slidingWindowDays: 30,
  minDataDaysForMutation: 14,
  refactorDeletionMultiplier: 8,
  refactorCooldownDays: 30,
  commitMilestones: [100, 500, 1000, 5000, 10000],
  enabledRules: [
    'contributor_first_commit',
    'contributor_exit',
    'activity_spike',
    'activity_drop',
    'major_refactor',
    'commit_milestone',
    'project_start',
    'project_archived',
  ],
}

// ── Sliding window statistics ──
interface DayStat {
  date: string
  totalCommits: number
  totalLinesDeleted: number
  contributorCount: number
}

function buildDayStats(dailyData: DailyRow[]): DayStat[] {
  const map = new Map<string, DayStat>()
  for (const row of dailyData) {
    let stat = map.get(row.date)
    if (!stat) {
      stat = { date: row.date, totalCommits: 0, totalLinesDeleted: 0, contributorCount: 0 }
      map.set(row.date, stat)
    }
    stat.totalCommits += row.commits
    stat.totalLinesDeleted += row.linesDeleted
    stat.contributorCount += 1
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function computeSlidingWindow(
  dayStats: DayStat[],
  windowSize: number,
  field: 'totalCommits' | 'totalLinesDeleted',
): Array<{ date: string, mean: number, std: number }> {
  const result: Array<{ date: string, mean: number, std: number }> = []

  for (let i = 0; i < dayStats.length; i++) {
    const start = Math.max(0, i - windowSize + 1)
    const window = dayStats.slice(start, i + 1)

    let sum = 0
    for (const d of window) sum += d[field]
    const mean = sum / window.length

    let sqSum = 0
    for (const d of window) sqSum += (d[field] - mean) ** 2
    const std = Math.sqrt(sqSum / window.length)

    result.push({ date: dayStats[i]!.date, mean, std })
  }

  return result
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a)
  const db = new Date(b)
  return Math.floor((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Detection rules ──

function detectContributorEvents(
  dailyData: DailyRow[],
  config: EventDetectionConfig,
  latestDate: string,
  projectStale: boolean,
): ProjectEvent[] {
  const events: ProjectEvent[] = []
  const contributorMap = new Map<string, { firstDate: string, lastDate: string, totalCommits: number }>()

  for (const row of dailyData) {
    const existing = contributorMap.get(row.contributor)
    if (!existing) {
      contributorMap.set(row.contributor, {
        firstDate: row.date,
        lastDate: row.date,
        totalCommits: row.commits,
      })
    }
    else {
      if (row.date < existing.firstDate)
        existing.firstDate = row.date
      if (row.date > existing.lastDate)
        existing.lastDate = row.date
      existing.totalCommits += row.commits
    }
  }

  for (const [name, info] of contributorMap) {
    // first_commit — only for contributors with meaningful total commits
    if (config.enabledRules.includes('contributor_first_commit') && info.totalCommits >= config.firstCommitThreshold) {
      events.push({
        id: `first:${name}`,
        type: 'contributor_first_commit',
        date: info.firstDate,
        severity: 'positive',
        impactScore: info.totalCommits,
        titleKey: 'events.title.contributor_first_commit',
        descriptionKey: 'events.desc.contributor_first_commit',
        params: { name },
        contributors: [name],
      })
    }

    // exit
    if (config.enabledRules.includes('contributor_exit')) {
      const gap = daysBetween(info.lastDate, latestDate)
      const isCore = info.totalCommits >= config.contributorExitThresholdCommits
      const isActiveProject = !projectStale

      if (isCore && gap >= config.contributorExitGapDays && isActiveProject) {
        events.push({
          id: `exit:${name}`,
          type: 'contributor_exit',
          date: info.lastDate,
          severity: 'warning',
          impactScore: info.totalCommits,
          titleKey: 'events.title.contributor_exit',
          descriptionKey: 'events.desc.contributor_exit',
          params: { name, days: gap, commits: info.totalCommits },
          contributors: [name],
        })
      }
    }
  }

  return events
}

function detectActivityMutations(
  dayStats: DayStat[],
  config: EventDetectionConfig,
): ProjectEvent[] {
  const events: ProjectEvent[] = []
  if (dayStats.length < config.minDataDaysForMutation)
    return events

  const sliding = computeSlidingWindow(dayStats, config.slidingWindowDays, 'totalCommits')

  // spike detection
  if (config.enabledRules.includes('activity_spike')) {
    let inSpike = false
    for (let i = 0; i < dayStats.length; i++) {
      const { mean, std } = sliding[i]!
      if (std === 0)
        continue
      const zScore = (dayStats[i]!.totalCommits - mean) / std
      if (zScore > config.activitySpikeZScore) {
        if (!inSpike) {
          events.push({
            id: `spike:${dayStats[i]!.date}`,
            type: 'activity_spike',
            date: dayStats[i]!.date,
            severity: 'info',
            impactScore: zScore,
            titleKey: 'events.title.activity_spike',
            descriptionKey: 'events.desc.activity_spike',
            params: { commits: dayStats[i]!.totalCommits, zScore: Number(zScore.toFixed(1)) },
          })
          inSpike = true
        }
      }
      else {
        inSpike = false
      }
    }
  }

  // drop detection
  if (config.enabledRules.includes('activity_drop')) {
    let consecutiveLow = 0
    let dropStartIdx = -1

    for (let i = 0; i < dayStats.length; i++) {
      const { mean, std } = sliding[i]!
      const isLow = std > 0 && (dayStats[i]!.totalCommits - mean) / std < -config.activityDropZScore

      if (isLow) {
        if (consecutiveLow === 0)
          dropStartIdx = i
        consecutiveLow++
      }
      else {
        consecutiveLow = 0
        dropStartIdx = -1
      }

      if (consecutiveLow === config.activityDropConsecutiveDays && dropStartIdx >= 0) {
        events.push({
          id: `drop:${dayStats[dropStartIdx]!.date}`,
          type: 'activity_drop',
          date: dayStats[dropStartIdx]!.date,
          severity: 'warning',
          impactScore: 0,
          titleKey: 'events.title.activity_drop',
          descriptionKey: 'events.desc.activity_drop',
          params: { days: config.activityDropConsecutiveDays },
        })
        // Reset to avoid overlapping drops
        consecutiveLow = 0
        dropStartIdx = -1
      }
    }
  }

  return events
}

function detectRefactors(
  _dailyData: DailyRow[],
  dayStats: DayStat[],
  config: EventDetectionConfig,
): ProjectEvent[] {
  const events: ProjectEvent[] = []
  if (!config.enabledRules.includes('major_refactor'))
    return events
  if (dayStats.length < config.minDataDaysForMutation)
    return events

  const sliding = computeSlidingWindow(dayStats, config.slidingWindowDays, 'totalLinesDeleted')

  let lastRefactorDate: string | null = null

  for (let i = 0; i < dayStats.length; i++) {
    const { mean } = sliding[i]!
    if (mean === 0)
      continue

    const deleted = dayStats[i]!.totalLinesDeleted
    if (deleted > mean * config.refactorDeletionMultiplier) {
      // cooldown check
      if (lastRefactorDate && daysBetween(lastRefactorDate, dayStats[i]!.date) < config.refactorCooldownDays) {
        continue
      }

      events.push({
        id: `refactor:${dayStats[i]!.date}`,
        type: 'major_refactor',
        date: dayStats[i]!.date,
        severity: 'info',
        impactScore: deleted,
        titleKey: 'events.title.major_refactor',
        descriptionKey: 'events.desc.major_refactor',
        params: { lines: deleted },
      })
      lastRefactorDate = dayStats[i]!.date
    }
  }

  return events
}

function detectMilestones(
  dailyData: DailyRow[],
  config: EventDetectionConfig,
  earliestDate: string,
): ProjectEvent[] {
  const events: ProjectEvent[] = []

  // project_start
  if (config.enabledRules.includes('project_start')) {
    events.push({
      id: `start:${earliestDate}`,
      type: 'project_start',
      date: earliestDate,
      severity: 'positive',
      impactScore: 0,
      titleKey: 'events.title.project_start',
      descriptionKey: 'events.desc.project_start',
      params: { date: earliestDate },
    })
  }

  // commit_milestone
  if (config.enabledRules.includes('commit_milestone')) {
    const sorted = [...dailyData].sort((a, b) => a.date.localeCompare(b.date))
    let cumulative = 0
    let milestoneIdx = 0

    for (const row of sorted) {
      cumulative += row.commits
      while (
        milestoneIdx < config.commitMilestones.length
        && cumulative >= config.commitMilestones[milestoneIdx]!
      ) {
        const threshold = config.commitMilestones[milestoneIdx]!
        events.push({
          id: `milestone:${threshold}`,
          type: 'commit_milestone',
          date: row.date,
          severity: 'positive',
          impactScore: threshold,
          titleKey: 'events.title.commit_milestone',
          descriptionKey: 'events.desc.commit_milestone',
          params: { threshold },
        })
        milestoneIdx++
      }
    }
  }

  return events
}

function detectProjectArchived(
  _dailyData: DailyRow[],
  config: EventDetectionConfig,
  earliestDate: string,
  latestDate: string,
): ProjectEvent[] {
  const events: ProjectEvent[] = []
  if (!config.enabledRules.includes('project_archived'))
    return events

  const today = new Date().toISOString().split('T')[0]!
  const daysSinceLastCommit = daysBetween(latestDate, today)
  const projectDurationDays = daysBetween(earliestDate, latestDate)

  // Last commit > 365 days ago AND project had > 1 year of active history
  if (daysSinceLastCommit > 365 && projectDurationDays > 365) {
    events.push({
      id: 'project_archived',
      type: 'project_archived',
      date: latestDate,
      severity: 'warning',
      impactScore: daysSinceLastCommit,
      titleKey: 'events.title.project_archived',
      descriptionKey: 'events.desc.project_archived',
      params: { lastDate: latestDate, daysSilent: daysSinceLastCommit },
    })
  }

  return events
}

// ── Main algorithm ──

function detectEvents(
  dailyData: DailyRow[],
  partialConfig?: Partial<EventDetectionConfig>,
): ProjectEvent[] {
  const config = { ...defaultConfig, ...partialConfig }

  if (dailyData.length === 0)
    return []

  const sortedDates = dailyData.map(d => d.date).sort()
  const earliestDate = sortedDates[0]!
  const latestDate = sortedDates[sortedDates.length - 1]!
  const projectStale = daysBetween(latestDate, new Date().toISOString().split('T')[0]!) > 90

  const dayStats = buildDayStats(dailyData)

  const events: ProjectEvent[] = [
    ...detectContributorEvents(dailyData, config, latestDate, projectStale),
    ...detectActivityMutations(dayStats, config),
    ...detectRefactors(dailyData, dayStats, config),
    ...detectMilestones(dailyData, config, earliestDate),
    ...detectProjectArchived(dailyData, config, earliestDate, latestDate),
  ]

  // Assign priority by severity
  const priorityMap: Record<Severity, number> = { warning: 3, positive: 2, info: 1 }
  for (const e of events) {
    e.priority = priorityMap[e.severity] ?? 1
  }

  // Sort by date ascending, priority descending, then deduplicate by id
  events.sort((a, b) => a.date.localeCompare(b.date) || (b.priority || 0) - (a.priority || 0) || a.type.localeCompare(b.type))
  const seen = new Set<string>()
  return events.filter((e) => {
    if (seen.has(e.id))
      return false
    seen.add(e.id)
    return true
  })
}

// ── Worker message handling ──

interface EventDetectionRequest {
  dailyData: DailyRow[]
  config?: Partial<EventDetectionConfig>
}

interface EventDetectionResponse {
  events: ProjectEvent[]
  stats: {
    totalEvents: number
    durationMs: number
  }
}

globalThis.onmessage = (e: MessageEvent<EventDetectionRequest>) => {
  const start = performance.now()
  const { dailyData, config } = e.data

  const events = detectEvents(dailyData, config)

  const response: EventDetectionResponse = {
    events,
    stats: {
      totalEvents: events.length,
      durationMs: Math.round(performance.now() - start),
    },
  }

  globalThis.postMessage(response)
}
