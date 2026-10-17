import { defineConfig } from './apps/pos/node_modules/@playwright/test/index.mjs'
import process from 'node:process'
export default defineConfig({
  testDir: './tests', testMatch: '**/public-menu-traffic.spec.js', workers: 1, reporter: 'list',
  use: { baseURL: process.env.NOCH_MENU_TRAFFIC_TEST_URL || 'https://apps.noch.cloud', channel: 'chrome', serviceWorkers: 'block' },
  projects: [{ name: 'phone', use: { viewport: { width: 390, height: 844 } } }, { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }],
})
