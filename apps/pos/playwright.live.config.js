// @ts-check
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://apps.noch.cloud',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    storageState: 'tests/.auth/owner.json',
  },
  projects: [
    {
      name: 'setup-owner-live',
      testMatch: '**/auth.setup.js',
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
    },
    {
      name: 'live-readonly-walkthrough',
      testMatch: '**/walkthrough-readonly.spec.js',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup-owner-live'],
    },
  ],
})
