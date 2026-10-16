import { defineConfig, devices } from '@playwright/test'
import process from 'node:process'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/mobile-startup.spec.js',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.NOCH_STARTUP_TEST_URL || 'http://127.0.0.1:4189',
    channel: 'chrome',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
})
