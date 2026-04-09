import { createEvent } from 'h3'
import { describe, expect, it } from 'vitest'

// RED phase scaffold: daily.get.ts does not exist yet.
// Each test dynamically imports './daily.get' and attempts to invoke the handler.
// Vitest will report "Cannot find module" failures until the route is implemented.

async function invokeDailyHandler(routerParams: Record<string, string>, query: Record<string, string> = {}) {
  const { default: handler } = await import('./daily.get')
  const event = createEvent({
    url: `http://localhost/api/projects/${routerParams.id}/daily?${new URLSearchParams(query)}`,
  })
  Object.assign(event.context, { params: routerParams })
  return handler(event)
}

describe('daily endpoint', () => {
  it('returns 400 for invalid projectId', async () => {
    await expect(invokeDailyHandler({ id: 'abc' })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('returns 404 for nonexistent project', async () => {
    await expect(invokeDailyHandler({ id: '999999' })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns daily rows with cumulativeCommits', async () => {
    const result = await invokeDailyHandler({ id: '1' })
    expect(Array.isArray(result)).toBe(true)
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('date')
      expect(result[0]).toHaveProperty('cumulativeCommits')
    }
  })

  it('rejects malformed start date', async () => {
    await expect(invokeDailyHandler({ id: '1' }, { start: '2024-1-1' })).rejects.toMatchObject({ statusCode: 400 })
  })
})
