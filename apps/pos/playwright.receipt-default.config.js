import settings from './playwright.settings.config.js'
export default { ...settings, testMatch: 'receipt-default.spec.js', webServer: { ...settings.webServer, reuseExistingServer: !process.env.CI } }
