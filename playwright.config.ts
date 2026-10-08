import { defineConfig } from "@playwright/test";

/**
 * Browser tests run against a production build (`npm run build` first) and a local in-memory fake
 * of the Supabase API (tests/e2e/fake-supabase.ts). Set PLAYWRIGHT_CHANNEL=msedge (or chrome) to
 * use an installed browser; otherwise Playwright's bundled Chromium is used
 * (`npx playwright install chromium`).
 */
const APP_PORT = 3200;
const FAKE_PORT = 54321;
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${APP_PORT}`, ...(channel ? { channel } : {}), trace: "off" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: [
    {
      command: "npx tsx tests/e2e/fake-supabase-main.ts",
      url: `http://127.0.0.1:${FAKE_PORT}/__test/state`,
      reuseExistingServer: false,
      env: { FAKE_SUPABASE_PORT: String(FAKE_PORT) },
    },
    {
      command: `npx next start -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}/api/v1/health`,
      reuseExistingServer: false,
      env: {
        APP_NAME: "CadencePilot",
        APP_ENV: "development",
        APP_URL: `http://localhost:${APP_PORT}`,
        LOG_LEVEL: "warn",
        NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${FAKE_PORT}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
        SUPABASE_SECRET_KEY: "e2e-secret-key-value",
        OWNER_MFA_REQUIRED: "false",
      },
    },
  ],
});
