import { defineConfig } from '@playwright/test'
import process from 'node:process'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/pos-menu-visibility.spec.js',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.NOCH_POS_MENU_TEST_URL || 'http://127.0.0.1:4190',
    channel: 'chrome',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 800, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
})
