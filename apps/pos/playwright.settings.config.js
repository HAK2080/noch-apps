import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'settings-controls.spec.js',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4187',
    channel: 'chrome',
    headless: true,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187/tests/fixtures/settings.html',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://settings-test.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
  },
})
