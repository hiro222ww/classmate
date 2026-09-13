import { defineConfig } from "@playwright/test";

// UI-only suite: all API responses are mocked; no database setup is needed.
const baseURL = process.env.BASE_URL || "http://127.0.0.1:3108";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "home-visual-hierarchy.spec.ts",
  outputDir: "./docs/home-ui-simplification",
  reporter: "list",
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL, screenshot: "only-on-failure" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3108",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_DEV_MODE: "false" },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
