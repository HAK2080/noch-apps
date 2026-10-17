import { defineConfig } from '@playwright/test'
import process from 'node:process'
export default defineConfig({
  testDir: './tests', testMatch: '**/public-menu-cache.spec.js', workers: 1, reporter: 'list',
  use: { baseURL: process.env.NOCH_MENU_CACHE_TEST_URL || 'http://127.0.0.1:4190', channel: 'chrome', serviceWorkers: 'block' },
  projects: [{ name: 'phone', use: { viewport: { width: 390, height: 844 } } }, { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }],
})
