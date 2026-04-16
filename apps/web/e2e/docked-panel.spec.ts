import { expect, test } from '@playwright/test'

async function dragToEdge(page: any, handleLocator: any, targetX: number, targetY: number) {
  const box = await handleLocator.boundingBox()
  expect(box).not.toBeNull()
  const startX = box!.x + box!.width / 2
  const startY = box!.y + box!.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(targetX, targetY, { steps: 10 })
  await page.mouse.up()
  // Wait for Vue reactivity and localStorage flush
  await page.waitForTimeout(300)
}

test.describe('Docked Panel Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects/87')
    await page.waitForSelector('text=Loading...', { state: 'detached' })
    await page.evaluate(() => {
      localStorage.removeItem('pr:dockedEdge')
      localStorage.removeItem('pr:panelW')
      localStorage.removeItem('pr:panelH')
      localStorage.removeItem('pr:floatX')
      localStorage.removeItem('pr:floatY')
    })
    await page.reload()
    await page.waitForSelector('text=Loading...', { state: 'detached' })
  })

  test('drag panel to left dock, resize, and restore after refresh', async ({ page }) => {
    await expect(page.locator('text=Export SVG').first()).toBeVisible()

    const dragHandle = page.locator('[aria-label="Drag panel"]').first()
    await expect(dragHandle).toBeVisible()

    const box = await dragHandle.boundingBox()
    await dragToEdge(page, dragHandle, 10, box!.y + box!.height / 2)

    const resizeHandle = page.locator('[role="separator"]').first()
    await expect(resizeHandle).toBeVisible()
    await expect(resizeHandle).toHaveClass(/cursor-col-resize/)

    await page.reload()
    await page.waitForSelector('text=Loading...', { state: 'detached' })
    await expect(page.locator('[role="separator"]').first()).toBeVisible()
  })

  test('drag panel to right dock', async ({ page }) => {
    await expect(page.locator('text=Export SVG').first()).toBeVisible()

    const dragHandle = page.locator('[aria-label="Drag panel"]').first()
    await expect(dragHandle).toBeVisible()

    const box = await dragHandle.boundingBox()
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    await dragToEdge(page, dragHandle, viewport!.width - 10, box!.y + box!.height / 2)

    const resizeHandle = page.locator('[role="separator"]').first()
    await expect(resizeHandle).toBeVisible()
    await expect(resizeHandle).toHaveClass(/cursor-col-resize/)
  })

  test('drag panel to top dock', async ({ page }) => {
    await expect(page.locator('text=Export SVG').first()).toBeVisible()

    const dragHandle = page.locator('[aria-label="Drag panel"]').first()
    await expect(dragHandle).toBeVisible()

    const box = await dragHandle.boundingBox()
    await dragToEdge(page, dragHandle, (box!.x + box!.width / 2), 10)

    const resizeHandle = page.locator('[role="separator"]').first()
    await expect(resizeHandle).toBeVisible()
    await expect(resizeHandle).toHaveClass(/cursor-row-resize/)
  })

  test('drag panel to bottom dock', async ({ page }) => {
    await expect(page.locator('text=Export SVG').first()).toBeVisible()

    const dragHandle = page.locator('[aria-label="Drag panel"]').first()
    await expect(dragHandle).toBeVisible()

    const box = await dragHandle.boundingBox()
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    await dragToEdge(page, dragHandle, (box!.x + box!.width / 2), viewport!.height - 10)

    const resizeHandle = page.locator('[role="separator"]').first()
    await expect(resizeHandle).toBeVisible()
    await expect(resizeHandle).toHaveClass(/cursor-row-resize/)
  })
})
