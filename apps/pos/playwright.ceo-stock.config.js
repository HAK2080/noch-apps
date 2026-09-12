import settings from './playwright.settings.config.js'
export default { ...settings, testMatch: 'ceo-stock-controls.spec.js', webServer: { ...settings.webServer, reuseExistingServer: !process.env.CI } }
