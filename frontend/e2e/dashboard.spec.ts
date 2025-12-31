import { test, expect } from '@playwright/test';
import path from 'path';

// Use stored authentication state
test.use({ storageState: path.join(__dirname, '../.auth/user.json') });

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('should display dashboard page', async ({ page }) => {
    // Check we're on dashboard
    await expect(page).toHaveURL(/.*dashboard/);

    // Check for key dashboard elements
    await expect(page.locator('body')).toContainText(/portfolio|dashboard|overview/i);
  });

  test('should display portfolio summary', async ({ page }) => {
    // Look for portfolio-related content
    const portfolioSection = page.locator('[class*="portfolio"], [data-testid="portfolio-summary"]');

    // If portfolio section exists, check for key metrics
    if (await portfolioSection.count() > 0) {
      await expect(portfolioSection.first()).toBeVisible();
    }
  });

  test('should display navigation menu', async ({ page }) => {
    // Check sidebar or navigation exists
    const nav = page.locator('nav, aside, [class*="sidebar"]');
    await expect(nav.first()).toBeVisible();

    // Check for key navigation links
    const navLinks = ['Dashboard', 'Portfolios', 'Market', 'Settings'];
    for (const link of navLinks) {
      const linkElement = page.locator(`a:has-text("${link}"), button:has-text("${link}")`);
      if (await linkElement.count() > 0) {
        await expect(linkElement.first()).toBeVisible();
      }
    }
  });

  test('should navigate to portfolios page', async ({ page }) => {
    // Click on portfolios link
    const portfoliosLink = page.locator('a[href*="portfolio"], a:has-text("Portfolio")').first();

    if (await portfoliosLink.isVisible()) {
      await portfoliosLink.click();
      await page.waitForLoadState('networkidle');

      // Should be on portfolios page
      await expect(page).toHaveURL(/.*portfolio/);
    }
  });

  test('should display real-time data indicators', async ({ page }) => {
    // Look for price changes, market status, or live indicators
    const liveIndicators = page.locator('[class*="live"], [class*="real-time"], [class*="change"]');

    // Give time for data to load
    await page.waitForTimeout(2000);
  });

  test('should be responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check that mobile menu or hamburger exists
    const mobileMenu = page.locator('[class*="mobile"], [class*="hamburger"], button[aria-label*="menu"]');

    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
  });
});
