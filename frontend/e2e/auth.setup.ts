import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

/**
 * Global setup - authenticate once and reuse across tests
 */
setup('authenticate', async ({ page }) => {
  // Go to login page
  await page.goto('/login');

  // Wait for page to load
  await expect(page.locator('h2:has-text("Welcome back")')).toBeVisible();

  // Fill in login form
  await page.fill('input[name="email"]', process.env.E2E_USER_EMAIL || 'test@test.com');
  await page.fill('input[name="password"]', process.env.E2E_USER_PASSWORD || 'test123456');

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 30000 });

  // Verify we're logged in
  await expect(page).toHaveURL(/.*dashboard/);

  // Save authentication state
  await page.context().storageState({ path: authFile });
});
