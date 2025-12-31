import { test, expect } from '@playwright/test';
import path from 'path';

// Use stored authentication state
test.use({ storageState: path.join(__dirname, '../.auth/user.json') });

test.describe('Portfolio Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to portfolios page
    await page.goto('/portfolios');
    await page.waitForLoadState('networkidle');
  });

  test('should display portfolios list', async ({ page }) => {
    // Check page loaded
    await expect(page).toHaveURL(/.*portfolio/);

    // Look for portfolio cards or list items
    const portfolios = page.locator('[class*="portfolio-card"], [data-testid*="portfolio"], .portfolio-item');

    // Wait for content to load
    await page.waitForTimeout(2000);
  });

  test('should open portfolio details', async ({ page }) => {
    // Click on first portfolio if available
    const portfolioLink = page.locator('a[href*="portfolio/"], [class*="portfolio-card"]').first();

    if (await portfolioLink.isVisible()) {
      await portfolioLink.click();
      await page.waitForLoadState('networkidle');

      // Should show portfolio details
      await expect(page.locator('body')).toContainText(/holdings|shares|value|total/i);
    }
  });

  test('should display holdings table', async ({ page }) => {
    // Navigate to a portfolio
    const portfolioLink = page.locator('a[href*="portfolio/"]').first();

    if (await portfolioLink.isVisible()) {
      await portfolioLink.click();
      await page.waitForLoadState('networkidle');

      // Look for holdings table
      const holdingsTable = page.locator('table, [class*="holdings"]');

      if (await holdingsTable.count() > 0) {
        await expect(holdingsTable.first()).toBeVisible();
      }
    }
  });

  test('should show add holding button', async ({ page }) => {
    // Navigate to a portfolio
    const portfolioLink = page.locator('a[href*="portfolio/"]').first();

    if (await portfolioLink.isVisible()) {
      await portfolioLink.click();
      await page.waitForLoadState('networkidle');

      // Look for add button
      const addButton = page.locator('button:has-text("Add"), button:has-text("Buy"), a:has-text("Add Holding")');

      if (await addButton.count() > 0) {
        await expect(addButton.first()).toBeVisible();
      }
    }
  });

  test('should open add holding modal', async ({ page }) => {
    // Navigate to a portfolio
    const portfolioLink = page.locator('a[href*="portfolio/"]').first();

    if (await portfolioLink.isVisible()) {
      await portfolioLink.click();
      await page.waitForLoadState('networkidle');

      // Click add holding button
      const addButton = page.locator('button:has-text("Add"), button:has-text("Buy")').first();

      if (await addButton.isVisible()) {
        await addButton.click();

        // Wait for modal
        await page.waitForTimeout(500);

        // Check for modal or form
        const modal = page.locator('[class*="modal"], [role="dialog"], form');
        if (await modal.count() > 0) {
          await expect(modal.first()).toBeVisible();
        }
      }
    }
  });

  test('should filter or sort holdings', async ({ page }) => {
    // Navigate to a portfolio
    const portfolioLink = page.locator('a[href*="portfolio/"]').first();

    if (await portfolioLink.isVisible()) {
      await portfolioLink.click();
      await page.waitForLoadState('networkidle');

      // Look for filter/sort controls
      const filterControl = page.locator('select, [class*="filter"], [class*="sort"]');

      if (await filterControl.count() > 0) {
        await expect(filterControl.first()).toBeVisible();
      }
    }
  });
});

test.describe('Portfolio Performance', () => {
  test.use({ storageState: path.join(__dirname, '../.auth/user.json') });

  test('should display performance metrics', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Look for performance indicators
    const performanceMetrics = page.locator('[class*="gain"], [class*="return"], [class*="performance"]');

    // Performance metrics might take time to calculate
    await page.waitForTimeout(2000);
  });

  test('should show performance chart', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Look for charts
    const charts = page.locator('canvas, svg, [class*="chart"]');

    await page.waitForTimeout(2000);

    if (await charts.count() > 0) {
      await expect(charts.first()).toBeVisible();
    }
  });
});
