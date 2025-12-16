import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PW_PORT || process.env.PLAYWRIGHT_PORT || '5174');
const reuseExistingServer =
  (process.env.PW_REUSE_EXISTING_SERVER || '').toLowerCase() === '1' ||
  (process.env.PW_REUSE_EXISTING_SERVER || '').toLowerCase() === 'true';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: reuseExistingServer && !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
