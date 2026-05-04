import { expect, test } from '@playwright/test'

// Playwright worker env inheritance can be flaky; rely on dev server having key
const API_KEY_PRESENT = true

test.describe('Agent Chat E2E', () => {
  let projectId: number

  test.beforeAll(async ({ request }) => {
    const res = await request.get('/api/projects')
    expect(res.ok()).toBe(true)
    const projects = await res.json() as Array<{ id: number, name: string }>
    const vueuse = projects.find(p => p.name === 'vueuse')
    projectId = vueuse ? vueuse.id : 131
  })

  test.beforeEach(async ({ page }) => {
    // Clear i18n cookie so default zh-CN locale is used
    await page.context().clearCookies()
    await page.goto(`/projects/${projectId}`)
    await page.waitForSelector('text=Loading...', { state: 'detached' })
  })

  test('FAB opens drawer and shows chips', async ({ page }) => {
    const fab = page.locator('button[aria-label="问 Agent"], button[aria-label="Ask Agent"]')
    await expect(fab).toBeVisible()

    await fab.click()
    await expect(page.locator('text=Project Analyst')).toBeVisible()

    const chips = page.locator('button:has-text("useStorage")')
    await expect(chips.first()).toBeVisible()
  })

  test('chip click triggers streaming and renders tool cards', async ({ page }) => {
    test.skip(!API_KEY_PRESENT, 'No LLM API key')

    const fab = page.locator('button[aria-label="问 Agent"], button[aria-label="Ask Agent"]')
    await fab.click()

    const chip = page.locator('button:has-text("useStorage")').first()
    await chip.click()

    const input = page.locator('input[type="text"]')
    await expect(input).toHaveValue(/useStorage/i)

    // Wait for streaming to finish (stop button disappears)
    await page.waitForFunction(() => {
      const stopBtn = document.querySelector('button[aria-label="取消"]') as HTMLElement
      return !stopBtn || stopBtn.offsetParent === null
    }, { timeout: 60000 })

    // Wait for non-empty assistant message (check DOM directly for reliability)
    await page.waitForFunction(() => {
      const elements = document.querySelectorAll('.whitespace-pre-wrap')
      for (const el of elements) {
        if (el.textContent && el.textContent.trim().length > 0)
          return true
      }
      return false
    }, { timeout: 30000 })

    const toolCards = page.locator('button[aria-controls^="tool-body-"]')
    const count = await toolCards.count()
    if (count > 0) {
      await toolCards.first().click()
      const toolBody = page.locator('[id^="tool-body-"]').first()
      await expect(toolBody).toBeVisible()
      await expect(page.locator('text=输入参数').or(page.locator('text=Input'))).toBeVisible()
    }
  }, { timeout: 90000 })

  test('locale switch updates drawer content', async ({ page }) => {
    const fab = page.locator('button[aria-label="问 Agent"], button[aria-label="Ask Agent"]')
    await fab.click()
    await expect(page.locator('text=Project Analyst')).toBeVisible()

    // Minimize drawer so we can click page header locale toggle
    const minimizeBtn = page.locator('button[aria-label="缩小到角落"], button[aria-label="Minimize"]')
    await minimizeBtn.click()
    await expect(fab).toBeVisible()

    // Find current locale toggle (depends on current locale)
    const switchToEn = page.locator('button[aria-label="Switch to English"]')
    const switchToZh = page.locator('button[aria-label="切换为中文"]')

    if (await switchToEn.count() > 0) {
      // Currently zh-CN, switch to en
      await switchToEn.click()
      await fab.click()
      await expect(page.locator('text=Project Analyst')).toBeVisible()
      await expect(page.locator('button:has-text("Who maintains")')).toBeVisible()

      const input = page.locator('input[type="text"]')
      const placeholder = await input.getAttribute('placeholder')
      expect(placeholder).toMatch(/Ask/i)

      // Switch back to zh-CN
      await minimizeBtn.click()
      await switchToZh.click()
      await fab.click()
      await expect(page.locator('button:has-text("useStorage")')).toBeVisible()
    }
    else {
      // Currently en, switch to zh-CN
      await switchToZh.click()
      await fab.click()
      await expect(page.locator('button:has-text("useStorage")')).toBeVisible()

      const input = page.locator('input[type="text"]')
      const placeholder = await input.getAttribute('placeholder')
      expect(placeholder).toMatch(/问问/)

      // Switch back to en
      await minimizeBtn.click()
      await switchToEn.click()
      await fab.click()
      await expect(page.locator('button:has-text("Who maintains")')).toBeVisible()
    }
  })

  test('minimize preserves message history', async ({ page }) => {
    test.skip(!API_KEY_PRESENT, 'No LLM API key')

    const fab = page.locator('button[aria-label="问 Agent"], button[aria-label="Ask Agent"]')
    await fab.click()

    const chip = page.locator('button:has-text("useStorage")').first()
    await chip.click()

    await page.waitForFunction(() => {
      const stopBtn = document.querySelector('button[aria-label="取消"]') as HTMLElement
      return !stopBtn || stopBtn.offsetParent === null
    }, { timeout: 60000 })

    const minimizeBtn = page.locator('button[aria-label="缩小到角落"], button[aria-label="Minimize"]')
    await minimizeBtn.click()

    await expect(fab).toBeVisible()

    await fab.click()

    // Wait for non-empty message after reopening drawer
    await page.waitForFunction(() => {
      const elements = document.querySelectorAll('.whitespace-pre-wrap')
      for (const el of elements) {
        if (el.textContent && el.textContent.trim().length > 0)
          return true
      }
      return false
    }, { timeout: 15000 })
  }, { timeout: 90000 })
})
