// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // Use the production preview build (no React StrictMode double-effects)
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [
    // Setup project: log in each role and save storage state
    { name: 'setup-owner', testMatch: '**/auth.setup.js', use: { ...devices['Desktop Chrome'] } },
    { name: 'setup-staff', testMatch: '**/auth-staff.setup.js', use: { ...devices['Desktop Chrome'] } },

    // Owner audit
    {
      name: 'owner-audit',
      testMatch: '**/owner-audit.spec.js',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/owner.json' },
      dependencies: ['setup-owner'],
    },
    // Staff audit
    {
      name: 'staff-audit',
      testMatch: '**/staff-audit.spec.js',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/staff.json' },
      dependencies: ['setup-staff'],
    },
    {
      name: 'access-control-owner',
      testMatch: '**/access-control-owner.spec.js',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/owner.json' },
      dependencies: ['setup-owner'],
    },
    {
      name: 'access-control-staff',
      testMatch: '**/access-control-staff.spec.js',
      use: { ...devices['Pixel 7'], storageState: 'tests/.auth/staff.json' },
      dependencies: ['setup-staff'],
    },
  ],
});
