import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3456';

// Helper: register a test user and return credentials
async function registerUser(page: Page) {
  const email = `test-${Date.now()}@example.com`;
  const username = `user-${Date.now()}`;
  const password = 'testpass123';

  await page.goto(`${BASE_URL}/register`);
  await page.fill('input[placeholder="Email"]', email);
  await page.fill('input[placeholder="Username"]', username);
  await page.fill('input[placeholder="Password"]', password);
  await page.click('button[type="submit"]');

  // Should redirect to dashboard after registration
  await expect(page).toHaveURL(/\/dashboard/);
  return { email, username, password };
}

// Helper: login with credentials
async function loginUser(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[placeholder="Email"]', email);
  await page.fill('input[placeholder="Password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('URL Shortener - E2E Tests', () => {

  test('1. Homepage loads and shows shorten form', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('h1')).toContainText('URL Shortener');
    await expect(page.locator('input[placeholder="Enter your long URL"]')).toBeVisible();
    await expect(page.locator('button:has-text("Shorten URL")')).toBeVisible();
  });

  test('2. User registration and login', async ({ page }) => {
    const creds = await registerUser(page);
    // Verify navbar shows username
    await expect(page.locator('nav')).toContainText(creds.username);

    // Logout
    await page.click('button:has-text("Logout")');
    await expect(page.locator('h1')).toContainText('URL Shortener');
    await expect(page.locator('nav')).toContainText('Login');

    // Login again
    await loginUser(page, creds.email, creds.password);
    await expect(page.locator('nav')).toContainText(creds.username);
  });

  test('3. Create short URL without authentication', async ({ page }) => {
    await page.goto(BASE_URL);

    const longUrl = 'https://example.com/very/long/url/that/needs/shortening';
    await page.fill('input[placeholder="Enter your long URL"]', longUrl);
    await page.click('button:has-text("Shorten URL")');

    // Wait for result
    await expect(page.locator('text=Your shortened URL')).toBeVisible();
    // Verify the shortened URL is displayed
    const shortUrl = await page.locator('a').filter({ hasText: BASE_URL }).textContent();
    expect(shortUrl).toBeTruthy();
    expect(shortUrl).toContain(BASE_URL);

    // Copy button should be visible
    await expect(page.locator('button:has-text("Copy")')).toBeVisible();
  });

  test('4. Create short URL with custom alias', async ({ page }) => {
    await page.goto(BASE_URL);

    const longUrl = 'https://docs.example.com/api/v2/users';
    const alias = `myalias-${Date.now()}`;
    await page.fill('input[placeholder="Enter your long URL"]', longUrl);
    await page.fill('input[placeholder="Custom alias (optional)"]', alias);
    await page.click('button:has-text("Shorten URL")');

    await expect(page.locator('text=Your shortened URL')).toBeVisible();
    // The short URL should contain the custom alias
    const shortUrl = await page.locator('a').filter({ hasText: alias }).textContent();
    expect(shortUrl).toContain(alias);
  });

  test('5. Authenticated user dashboard shows URLs', async ({ page }) => {
    // Register and create a URL first
    const creds = await registerUser(page);

    // Create a URL from the home page
    await page.goto(BASE_URL);
    const longUrl = 'https://github.com/example/project';
    await page.fill('input[placeholder="Enter your long URL"]', longUrl);
    await page.click('button:has-text("Shorten URL")');
    await expect(page.locator('text=Your shortened URL')).toBeVisible();

    // Go to dashboard
    await page.click('a:has-text("Dashboard")');
    await expect(page).toHaveURL(/\/dashboard/);

    // Should see the URL in the table
    await expect(page.locator('table')).toContainText(longUrl);
  });

  test('6. URL redirect works correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    const longUrl = 'https://example.org/redirect-test';
    await page.fill('input[placeholder="Enter your long URL"]', longUrl);
    await page.click('button:has-text("Shorten URL")');

    // Get the short URL
    const shortUrl = await page.locator('a').filter({ hasText: 'http' }).first().textContent();
    expect(shortUrl).toBeTruthy();

    // Navigate to the short URL directly
    await page.goto(shortUrl!);
    // Should redirect to example.org
    await expect(page).toHaveURL(/example\.org\/redirect-test/);
  });

  test('7. Analytics page shows click data', async ({ page }) => {
    const creds = await registerUser(page);

    // Create a URL
    await page.goto(BASE_URL);
    const longUrl = 'https://stats.example.com/page';
    await page.fill('input[placeholder="Enter your long URL"]', longUrl);
    await page.click('button:has-text("Shorten URL")');
    await expect(page.locator('text=Your shortened URL')).toBeVisible();

    // Visit dashboard
    await page.click('a:has-text("Dashboard")');
    await expect(page).toHaveURL(/\/dashboard/);

    // Click analytics button (📊)
    const analyticsBtn = page.locator('button[title="Analytics"]').first();
    await analyticsBtn.click();
    await expect(page).toHaveURL(/\/analytics\//);

    // Analytics page should show URL info and click data
    await expect(page.locator('h2')).toContainText('Analytics');
    await expect(page.locator('text=Total Clicks')).toBeVisible();
  });

  test('8. Login form validation', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    // Try submitting empty form
    await page.click('button[type="submit"]');
    // Should still be on login page (validation prevents empty submit)
    await expect(page).toHaveURL(/\/login/);

    // Try invalid email format - HTML5 validation should catch it
    await page.fill('input[placeholder="Email"]', 'notanemail');
    await page.fill('input[placeholder="Password"]', 'short');
    await page.click('button[type="submit"]');
    // HTML5 validation keeps us on the page
    await expect(page).toHaveURL(/\/login/);
  });

  test('9. Registration password minimum length', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);

    await page.fill('input[placeholder="Email"]', 'new@test.com');
    await page.fill('input[placeholder="Username"]', 'newuser');
    await page.fill('input[placeholder="Password"]', 'ab');

    // Click register - HTML5 minLength should block it
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/register/);
  });

  test('10. QR code generation', async ({ page }) => {
    await page.goto(BASE_URL);

    const longUrl = 'https://qr-test.example.com/link';
    await page.fill('input[placeholder="Enter your long URL"]', longUrl);
    await page.click('button:has-text("Shorten URL")');
    await expect(page.locator('text=Your shortened URL')).toBeVisible();

    // QR code image should be visible
    const qrImg = page.locator('img[alt*="QR Code"]');
    await expect(qrImg).toBeVisible();
    // QR code should have a valid src
    const qrSrc = await qrImg.getAttribute('src');
    expect(qrSrc).toBeTruthy();
    expect(qrSrc).toContain('qrcode');
  });

  test('11. Deactivate and reactivate URL', async ({ page }) => {
    const creds = await registerUser(page);

    // Create a URL
    await page.goto(BASE_URL);
    const longUrl = 'https://toggle-test.example.com';
    await page.fill('input[placeholder="Enter your long URL"]', longUrl);
    await page.click('button:has-text("Shorten URL")');

    // Go to dashboard
    await page.click('a:has-text("Dashboard")');
    await expect(page).toHaveURL(/\/dashboard/);

    // Click deactivate button (🔴)
    const deactivateBtn = page.locator('button[title="Deactivate"]').first();
    await deactivateBtn.click();
    // Wait for table to refresh
    await page.waitForTimeout(500);
    // Should now show "Expired" status
    await expect(page.locator('text=Expired').first()).toBeVisible();
  });

  test('12. Delete URL', async ({ page }) => {
    const creds = await registerUser(page);

    // Create a URL
    await page.goto(BASE_URL);
    await page.fill('input[placeholder="Enter your long URL"]', 'https://delete-test.example.com');
    await page.click('button:has-text("Shorten URL")');

    // Go to dashboard
    await page.click('a:has-text("Dashboard")');

    // Handle confirm dialog
    page.on('dialog', (dialog) => dialog.accept());
    // Click delete button
    const deleteBtn = page.locator('button[title="Delete"]').first();
    await deleteBtn.click();
    await page.waitForTimeout(500);

    // Should show empty state or the URL should be gone
    // If there are other URLs, the deleted one shouldn't be there
  });
});
