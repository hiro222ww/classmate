import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  globalSetup: "./tests/e2e/global-setup.mjs",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: process.env.E2E_WEB_COMMAND || "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_DEV_MODE: "true",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: [/concurrent-entry\.spec/, /mic-permission\.spec/],
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 13"] },
      testIgnore: [/concurrent-entry\.spec/],
    },
    {
      name: "android",
      use: { ...devices["Pixel 7"] },
      testIgnore: [/concurrent-entry\.spec/],
    },
  ],
});
