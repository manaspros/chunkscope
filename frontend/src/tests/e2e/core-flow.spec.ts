import { test, expect } from '@playwright/test'

test.describe('ChunkScope Core Flow', () => {
    test('landing page loads', async ({ page }) => {
        await page.goto('/')
        await expect(page).toHaveTitle(/ChunkScope/i)
    })

    test('projects page loads', async ({ page }) => {
        await page.goto('/projects')
        await expect(page.locator('text=Projects')).toBeVisible()
    })

    test('pipeline builder loads', async ({ page }) => {
        await page.goto('/pipeline')
        await expect(page.locator('text=Pipeline')).toBeVisible()
    })

    test('strategy guide loads', async ({ page }) => {
        await page.goto('/guide')
        await expect(page.locator('text=Strategy')).toBeVisible()
    })

    test('dashboard loads', async ({ page }) => {
        await page.goto('/dashboard')
        await expect(page.locator('text=Dashboard')).toBeVisible()
    })

    test('navbar has correct links', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('nav a[href="/projects"]')).toBeVisible()
        await expect(page.locator('nav a[href="/pipeline"]')).toBeVisible()
        await expect(page.locator('nav a[href="/guide"]')).toBeVisible()
    })

    test('dead pages return 404', async ({ page }) => {
        await page.goto('/presets')
        await expect(page.locator('text=404')).toBeVisible()
    })
})
