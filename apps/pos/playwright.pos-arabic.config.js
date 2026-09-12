import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests', testMatch: 'pos-arabic.spec.js', workers: 1, retries: 0, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4193', channel: 'chrome', headless: true, serviceWorkers: 'block', viewport: { width: 1024, height: 768 }, screenshot: 'only-on-failure' },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4193 --strictPort',
    url: 'http://127.0.0.1:4193/tests/fixtures/pos-arabic.html', reuseExistingServer: true,
    env: { VITE_SUPABASE_URL: 'https://pos-arabic-test.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
  },
})
