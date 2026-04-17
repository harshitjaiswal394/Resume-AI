import { defineConfig, devices } from '@playwright/test';

/**
 * Configure Playwright for End-to-End responsiveness testing.
 * Runs against resumatches.com to verify UI layout and responsiveness.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Maximum time one test can run for.
  timeout: 30 * 1000,
  expect: {
    // Maximum time expect() should wait for the condition to be met.
    timeout: 5000
  },
  // Run tests in files in parallel
  fullyParallel: true,
  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  // Opt out of parallel tests on CI.
  workers: process.env.CI ? 1 : undefined,
  // Reporter to use.
  reporter: 'html',
  // Shared settings for all the projects below.
  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://resumatches.com',

    // Collect trace when retrying the failed test.
    trace: 'on-first-retry',
    
    // Automatic screenshots for visual confirmation of responsiveness
    screenshot: 'on',
  },

  // Configure projects for major browsers and devices
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'safari-desktop',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'tablet-ipad',
      use: { ...devices['iPad (gen 7)'] },
    },
  ],
});
