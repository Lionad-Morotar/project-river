import { expect, test } from '@playwright/test'

test.describe('Docked Panel Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects/1')
    await page.waitForSelector('text=Loading...', { state: 'detached' })
  })

  test('drag panel to left dock, resize, and restore after refresh', async ({ page }) => {
    // Wait for data loaded
    await expect(page.locator('text=Export SVG').first()).toBeVisible()

    // Find drag handle (floating panel handle)
    const dragHandle = page.locator('[aria-label="Drag panel"]').first()
    await expect(dragHandle).toBeVisible()

    // Drag to left edge
    const box = await dragHandle.boundingBox()
    expect(box).not.toBeNull()
    await dragHandle.dragTo(page.locator('body'), {
      targetPosition: { x: 10, y: box!.y + box!.height / 2 },
    })

    // After drop, panel should be docked left: ResizeHandle visible inside layout
    const resizeHandle = page.locator('[role="separator"]').first()
    await expect(resizeHandle).toBeVisible()

    // Resize handle should be vertical when docked left
    await expect(resizeHandle).toHaveClass(/cursor-col-resize/)

    // Refresh and verify layout restored (resize handle still present means docked)
    await page.reload()
    await page.waitForSelector('text=Loading...', { state: 'detached' })
    await expect(page.locator('[role="separator"]').first()).toBeVisible()
  })
})
