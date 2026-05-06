import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

export interface ChatLogEntry {
  ts: string
  projectId: number
  type: string
  payload: unknown
}

/**
 * 创建本地聊天日志记录器
 *
 * 仅在非生产环境启用。日志写入 server/logs/local/YYYY-MM-DD/{timestamp}-{random}.jsonl
 */
export function createChatLogger(projectId: number) {
  if (process.env.NODE_ENV === 'production') {
    return { log: () => {}, close: () => {} }
  }

  const date = new Date().toISOString().slice(0, 10)
  const logDir = path.resolve(process.cwd(), 'server/logs/local', date)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const logFile = path.join(logDir, `${id}.jsonl`)

  fs.mkdirSync(logDir, { recursive: true })

  const stream = fs.createWriteStream(logFile, { flags: 'a' })

  function log(type: string, payload: unknown): void {
    const entry: ChatLogEntry = {
      ts: new Date().toISOString(),
      projectId,
      type,
      payload,
    }
    stream.write(`${JSON.stringify(entry)}\n`)
  }

  function close(): void {
    stream.end()
  }

  return { log, close, logFile }
}
