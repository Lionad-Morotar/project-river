// Project Events Detection Worker — message handling shell
// Pure algorithm extracted to ~/server/utils/detectProjectEvents
import type { DailyRow, EventDetectionConfig, ProjectEvent } from '~/server/utils/detectProjectEvents'
import { detectEvents } from '~/server/utils/detectProjectEvents'

// Worker message types — 仅 worker 使用，不导出
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
