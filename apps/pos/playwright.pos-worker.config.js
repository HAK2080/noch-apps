import base from './playwright.pos-arabic.config.js'
export default {...base,testMatch:'pos-worker.spec.js',outputDir:'test-results-worker',use:{...base.use,baseURL:'http://127.0.0.1:4194'},webServer:{...base.webServer,command:'npx vite --host 127.0.0.1 --port 4194 --strictPort',url:'http://127.0.0.1:4194/tests/fixtures/pos-worker.html',reuseExistingServer:false}}
