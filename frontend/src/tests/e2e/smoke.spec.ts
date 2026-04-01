import { test, expect } from '@playwright/test';

test.describe('ChunkScope Smoke Test', () => {
    test('should load the landing page', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });

        await page.waitForLoadState('networkidle');

        // Check for landing page title or content using a more robust check
        await expect(page).toHaveTitle(/ChunkScope/);

        // The H1 heading is "The Inspect Element for RAG Pipelines"
        const heading = page.getByRole('heading', { level: 1, name: /Inspect Element/i });
        await expect(heading).toBeVisible({ timeout: 15000 });

        // ChunkScope is in the header navigation
        await expect(page.getByText('ChunkScope')).toBeVisible();

        await expect(page.locator('body')).toBeVisible();
    });

    test('should navigate to visualizer page', async ({ page }) => {
        await page.goto('/visualizer', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');

        // Check for header to ensure page loaded
        await expect(page.getByRole('heading', { name: /Chunk Visualizer/i })).toBeVisible({ timeout: 10000 });

        // Check for canvas element presence with a longer timeout for WebGL init
        const canvas = page.getByTestId('visualizer-canvas');
        await expect(canvas).toBeVisible({ timeout: 15000 });
    });
});
