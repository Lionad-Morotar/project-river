import { createEvent } from 'h3'
import { describe, expect, it } from 'vitest'

// RED phase scaffold: monthly.get.ts does not exist yet.
// Each test dynamically imports './monthly.get' and attempts to invoke the handler.
// Vitest will report "Cannot find module" failures until the route is implemented.

async function invokeMonthlyHandler(routerParams: Record<string, string>, query: Record<string, string> = {}) {
  const { default: handler } = await import('./monthly.get')
  const event = createEvent({
    url: `http://localhost/api/projects/${routerParams.id}/monthly?${new URLSearchParams(query)}`,
  })
  Object.assign(event.context, { params: routerParams })
  return handler(event)
}

describe('monthly endpoint', () => {
  it('returns 400 for invalid projectId', async () => {
    await expect(invokeMonthlyHandler({ id: 'not-a-number' })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('returns 404 for missing project', async () => {
    await expect(invokeMonthlyHandler({ id: '999999' })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns monthly aggregated rows', async () => {
    const result = await invokeMonthlyHandler({ id: '1' })
    expect(Array.isArray(result)).toBe(true)
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('yearMonth')
      expect(result[0]).toHaveProperty('commits')
    }
  })

  it('rejects limit above 5000', async () => {
    await expect(invokeMonthlyHandler({ id: '1' }, { limit: '9999' })).rejects.toMatchObject({ statusCode: 400 })
  })
})
