import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export function useLocale() {
  const { t, locale } = useI18n()

  /** 本地化月份缩写数组，供 D3 轴标签和日期格式化使用 */
  const monthNames = computed(() =>
    Array.from({ length: 12 }, (_, i) =>
      new Intl.DateTimeFormat(locale.value, { month: 'short' }).format(new Date(2023, i, 1))),
  )

  /** 短日期格式化，如 "Jan 2023" / "2023年1月" */
  function formatShortDate(dateStr: string): string {
    const d = new Date(dateStr)
    return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short' }).format(d)
  }

  /** 紧凑数字格式化，如 1.2K / 1200 */
  function formatCompactNumber(n: number): string {
    if (n < 1000)
      return String(n)
    return new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
  }

  /** 相对时间格式化，如 "5 分钟前" / "5m ago" */
  function formatRelativeTime(date: string | Date | null): string {
    if (!date)
      return ''
    const ms = Date.now() - new Date(date).getTime()
    const minutes = Math.floor(ms / 60000)
    if (minutes < 1)
      return t('time.justNow')
    if (minutes < 60)
      return t('time.minutesAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24)
      return t('time.hoursAgo', { n: hours })
    const days = Math.floor(hours / 24)
    if (days < 7)
      return t('time.daysAgo', { n: days })
    if (days < 30)
      return t('time.weeksAgo', { n: Math.round(days / 7) })
    const months = Math.floor(days / 30)
    if (months < 12)
      return t('time.monthsAgo', { n: months })
    return t('time.yearsAgo', { n: Math.floor(months / 12) })
  }

  /** 最近活跃度标签，如 "今日活跃" / "Active today" */
  function formatActivityLabel(daysSinceLastCommit: number | null): string | null {
    if (daysSinceLastCommit === null)
      return null
    if (daysSinceLastCommit <= 1)
      return t('time.activeToday')
    if (daysSinceLastCommit <= 7)
      return t('time.daysAgo', { n: daysSinceLastCommit })
    if (daysSinceLastCommit <= 30)
      return t('time.weeksAgo', { n: Math.round(daysSinceLastCommit / 7) })
    if (daysSinceLastCommit <= 365)
      return t('time.monthsAgo', { n: Math.round(daysSinceLastCommit / 30) })
    return t('time.yearsAgo', { n: Math.round(daysSinceLastCommit / 365) })
  }

  /** 活跃度指示点颜色类 */
  function activityDotClass(daysSinceLastCommit: number | null): string {
    if (daysSinceLastCommit === null)
      return ''
    if (daysSinceLastCommit <= 7)
      return 'bg-emerald-400'
    if (daysSinceLastCommit <= 30)
      return 'bg-amber-400'
    return 'bg-accented'
  }

  return {
    t,
    locale,
    monthNames,
    formatShortDate,
    formatCompactNumber,
    formatRelativeTime,
    formatActivityLabel,
    activityDotClass,
  }
}
