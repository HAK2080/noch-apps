import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: parseInt(process.env.PORT || '5175'), strictPort: false },
  build: { outDir: 'dist', assetsDir: 'assets' }
})
