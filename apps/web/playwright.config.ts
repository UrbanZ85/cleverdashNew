import { defineConfig, devices } from '@playwright/test';

// En osnovni E2E tok (plan.md, Technical Context: Testing): prijava → dashboard → viden radar.
// Glej apps/web/tests/e2e/happy-path.spec.ts.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
