import { defineConfig, devices } from "@playwright/test";

/** Local UI checks without Supabase globalSetup (no local DB required). */
const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node -e \"process.exit(0)\"",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 5_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
