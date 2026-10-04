import { defineConfig, devices } from '@playwright/test';

// Browser tests run the production build (`vite preview`, service worker included) against a real API
// started by e2e/server.ts. One worker: the tests share and reset that backend.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 45_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5399',
    ...devices['Pixel 5'],
    viewport: { width: 390, height: 844 },
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
  },
  webServer: [
    { command: 'npx tsx e2e/server.ts', url: 'http://127.0.0.1:5311', reuseExistingServer: false, timeout: 120_000 },
    {
      command: 'npx vite build && npx vite preview --port 5399 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:5399',
      env: { API_TARGET: 'http://127.0.0.1:5310' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
