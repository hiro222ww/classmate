import { defineConfig } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:3110";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "marketing-publish-now-feedback.spec.ts",
  reporter: "list",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: { baseURL, screenshot: "only-on-failure" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3110",
    url: `${baseURL}/admin/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "local-admin-ui-test",
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder",
      NEXT_PUBLIC_DEV_MODE: "false",
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
