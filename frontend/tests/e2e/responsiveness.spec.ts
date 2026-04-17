import { test, expect } from '@playwright/test';

const PUBLIC_ROUTES = [
  '/',
  '/reset-password',
];

const PROTECTED_ROUTES = [
  '/dashboard',
  '/onboarding',
];

async function assertNoHorizontalScroll(page) {
  const hasHorizontalScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(hasHorizontalScroll, 'Page should not have horizontal scrolling').toBe(false);
}

const TEST_USER = 'tester@example.com';
const TEST_PASS = 'password123';

test.describe('Responsiveness and Cross-Device Testing', () => {

  test.describe('Public Routes', () => {
    for (const route of PUBLIC_ROUTES) {
      test(`View ${route}`, async ({ page }) => {
        const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
        // Expected response to be successful (not 404)
        expect(response?.status()).toBeLessThan(400);

        await page.waitForTimeout(1500); // Allow animations/UI mounting
        await assertNoHorizontalScroll(page);
      });
    }
  });

  test.describe('Protected Routes', () => {
    // Navigating directly to protected routes to verify responsive layout of the destination (or fallback UI)
    for (const route of PROTECTED_ROUTES) {
      test(`View ${route}`, async ({ page }) => {
        const response = await page.goto(route, { waitUntil: 'networkidle' });
        expect(response?.status()).toBeLessThan(400);

        await page.waitForTimeout(1500); // Allow component mount
        await assertNoHorizontalScroll(page);
      });
    }
  });
});
