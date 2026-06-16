// @ts-check
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    storageState: 'tests/.auth/owner.json',
  },
  webServer: {
    command: 'npx vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [
    {
      name: 'readonly-walkthrough',
      testMatch: '**/walkthrough-readonly.spec.js',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
