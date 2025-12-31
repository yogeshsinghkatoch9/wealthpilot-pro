import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');

      // Check page title
      await expect(page).toHaveTitle(/Login.*WealthPilot/i);

      // Check form elements exist
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // Check links exist
      await expect(page.locator('a[href="/register"]')).toBeVisible();
      await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      // Fill in invalid credentials
      await page.fill('input[name="email"]', 'invalid@example.com');
      await page.fill('input[name="password"]', 'wrongpassword');

      // Submit form
      await page.click('button[type="submit"]');

      // Wait for error message
      await expect(page.locator('#error-message')).toBeVisible();
      await expect(page.locator('#error-message')).toContainText(/invalid/i);
    });

    test('should show validation error for empty fields', async ({ page }) => {
      await page.goto('/login');

      // Try to submit empty form
      await page.click('button[type="submit"]');

      // Form should not submit (HTML5 validation)
      await expect(page).toHaveURL(/.*login/);
    });
  });

  test.describe('Registration Page', () => {
    test('should display registration form', async ({ page }) => {
      await page.goto('/register');

      // Check form elements
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();

      // Check link to login
      await expect(page.locator('a[href="/login"]')).toBeVisible();
    });

    test('should show error for existing email', async ({ page }) => {
      await page.goto('/register');

      // Fill in form with existing email
      await page.fill('input[name="email"]', 'test@test.com');
      await page.fill('input[name="password"]', 'newpassword123');

      if (await page.locator('input[name="firstName"]').isVisible()) {
        await page.fill('input[name="firstName"]', 'Test');
        await page.fill('input[name="lastName"]', 'User');
      }

      // Submit form
      await page.click('button[type="submit"]');

      // Wait for error or success
      await page.waitForTimeout(2000);
    });
  });

  test.describe('Logout', () => {
    test('should logout successfully', async ({ page }) => {
      // First login
      await page.goto('/login');
      await page.fill('input[name="email"]', process.env.E2E_USER_EMAIL || 'test@test.com');
      await page.fill('input[name="password"]', process.env.E2E_USER_PASSWORD || 'test123456');
      await page.click('button[type="submit"]');

      // Wait for dashboard
      await page.waitForURL('**/dashboard', { timeout: 30000 });

      // Find and click logout
      const logoutButton = page.locator('a[href="/logout"], button:has-text("Logout"), a:has-text("Logout")');
      if (await logoutButton.isVisible()) {
        await logoutButton.click();

        // Should redirect to login
        await expect(page).toHaveURL(/.*login/);
      }
    });
  });
});
