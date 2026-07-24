// @ts-check
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    serviceWorkers: 'block',
    storageState: 'tests/.auth/owner.json',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [
    {
      name: 'readonly-walkthrough',
      testMatch: '**/*readonly*.spec.js',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
