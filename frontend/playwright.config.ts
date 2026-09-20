import { defineConfig, devices } from '@playwright/test';

/**
 * BDoc end-to-end suite. The stack (postgres + backend + frontend) is
 * expected to be running via `docker compose up` from the repo root, e.g.:
 *
 *   docker compose up -d --build
 *   npm run test:e2e
 *
 * Env overrides (CI sets these implicitly by using localhost):
 *   BDOC_FRONT_URL  frontend base URL (default http://localhost:5173)
 *   BDOC_API_URL    backend API URL (default http://localhost:8080/api)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180000,
  expect: { timeout: 20000 },
  // One worker: tests share a single database and several assert on
  // debounce/throttle timing, so parallelism would be flaky by design.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BDOC_FRONT_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1400, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
