import type { Ref } from 'vue'
import type { DailyRow } from '~/utils/d3Helpers'
import { computed } from 'vue'
import { OTHERS_LABEL } from './useStreamgraphData'

// -- Composable --

export function useProjectStats(
  dailyData: Ref<DailyRow[]>,
  projectMeta?: Ref<{ contributorCount?: number } | null>,
) {
  const { formatShortDate, formatCompactNumber, formatActivityLabel, activityDotClass } = useLocale()

  /** 从 dailyData 派生基础统计 */
  const stats = computed(() => {
    if (dailyData.value.length === 0) {
      return {
        firstDate: null as string | null,
        lastDate: null as string | null,
        totalContributors: 0,
        totalCommits: 0,
        recentDaysSinceLastCommit: null as number | null,
      }
    }

    const dates = dailyData.value.map(d => d.date).sort()
    const firstDate = dates[0]!
    const lastDate = dates[dates.length - 1]!

    // 优先使用后端精确的 contributorCount（不受 Top-99 聚合影响）
    const totalContributors = projectMeta?.value?.contributorCount
      ?? new Set(
        dailyData.value
          .map(d => d.contributor)
          .filter(name => name !== OTHERS_LABEL),
      ).size

    const totalCommits = dailyData.value.reduce((sum, d) => sum + d.commits, 0)

    // 距最后一次提交的天数
    const lastDateMs = new Date(lastDate).getTime()
    const nowMs = Date.now()
    const daysSinceLastCommit = Math.floor((nowMs - lastDateMs) / (1000 * 60 * 60 * 24))

    return {
      firstDate,
      lastDate,
      totalContributors,
      totalCommits,
      recentDaysSinceLastCommit: daysSinceLastCommit,
    }
  })

  /** 格式化日期范围，如 "Jan 2023 — Mar 2026" */
  const formattedDateRange = computed(() => {
    const { firstDate, lastDate } = stats.value
    if (!firstDate || !lastDate)
      return null
    return `${formatShortDate(firstDate)} — ${formatShortDate(lastDate)}`
  })

  /** 最近活跃度文字标签 */
  const recentActivityLabel = computed(() =>
    formatActivityLabel(stats.value.recentDaysSinceLastCommit),
  )

  /** 最近活跃度指示点颜色 */
  const recentActivityDotClass = computed(() =>
    activityDotClass(stats.value.recentDaysSinceLastCommit),
  )

  return {
    stats: stats as Readonly<Ref<typeof stats.value>>,
    formattedDateRange: formattedDateRange as Readonly<Ref<string | null>>,
    recentActivityLabel: recentActivityLabel as Readonly<Ref<string | null>>,
    recentActivityDotClass: recentActivityDotClass as Readonly<Ref<string>>,
    formatShortDate,
    formatNumber: formatCompactNumber,
  }
}
