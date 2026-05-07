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
    baseURL: 'https://apps.noch.cloud',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
  },
  projects: [
    { name: 'setup-owner', testMatch: '**/auth.setup.js', use: { ...devices['Desktop Chrome'] } },
    { name: 'setup-staff', testMatch: '**/auth-staff.setup.js', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'owner-audit',
      testMatch: '**/owner-audit.spec.js',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/owner.json' },
      dependencies: ['setup-owner'],
    },
    {
      name: 'staff-audit',
      testMatch: '**/staff-audit.spec.js',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/staff.json' },
      dependencies: ['setup-staff'],
    },
  ],
});
