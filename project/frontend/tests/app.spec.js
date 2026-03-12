import { test, expect } from '@playwright/test'

test('loads main app shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('OmniAccess')
})
