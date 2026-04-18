import type { Ref } from 'vue'
import type { DailyRow } from '~/utils/d3Helpers'
import { computed } from 'vue'

// -- 工具函数 --

/** 格式化日期为 "Jan 2023" 形式 */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

/** 千位格式化：1200 → "1.2k"，999 → "999" */
export function formatNumber(n: number): string {
  if (n >= 1000)
    return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// -- Composable --

export function useProjectStats(dailyData: Ref<DailyRow[]>) {
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

    const uniqueContributors = new Set(dailyData.value.map(d => d.contributor))
    const totalCommits = dailyData.value.reduce((sum, d) => sum + d.commits, 0)

    // 距最后一次提交的天数
    const lastDateMs = new Date(lastDate).getTime()
    const nowMs = Date.now()
    const daysSinceLastCommit = Math.floor((nowMs - lastDateMs) / (1000 * 60 * 60 * 24))

    return {
      firstDate,
      lastDate,
      totalContributors: uniqueContributors.size,
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
  const recentActivityLabel = computed(() => {
    const days = stats.value.recentDaysSinceLastCommit
    if (days === null)
      return null
    if (days <= 1)
      return 'Active today'
    if (days <= 7)
      return `${days} days ago`
    if (days <= 30)
      return `${Math.round(days / 7)} weeks ago`
    if (days <= 365)
      return `${Math.round(days / 30)} months ago`
    return `${Math.round(days / 365)} years ago`
  })

  /** 最近活跃度指示点颜色 */
  const recentActivityDotClass = computed(() => {
    const days = stats.value.recentDaysSinceLastCommit
    if (days === null)
      return ''
    if (days <= 7)
      return 'bg-emerald-400'
    if (days <= 30)
      return 'bg-amber-400'
    return 'bg-slate-500'
  })

  return {
    stats: stats as Readonly<Ref<typeof stats.value>>,
    formattedDateRange: formattedDateRange as Readonly<Ref<string | null>>,
    recentActivityLabel: recentActivityLabel as Readonly<Ref<string | null>>,
    recentActivityDotClass: recentActivityDotClass as Readonly<Ref<string>>,
    formatShortDate,
    formatNumber,
  }
}
