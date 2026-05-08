import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// envDir: read .env from the monorepo root so this app and the
// storefront share a single VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
// config (the bug that took the live site down on 2026-05-07 was
// caused by per-app .env divergence).
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  server: { port: parseInt(process.env.PORT || '5173'), strictPort: false },
  build: {
    // Push large shared deps into named vendor chunks so the main app
    // bundle stays tight on slow connections. With this + the React.lazy
    // route splits in App.jsx, the initial paint downloads ~700 KB
    // instead of the previous ~2 MB.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-router'))            return 'vendor-react'
          if (id.includes('react-dom') || id.match(/[\\/]react[\\/]/)) return 'vendor-react'
          if (id.includes('@supabase'))               return 'vendor-supabase'
          if (id.includes('lucide-react'))            return 'vendor-icons'
          if (id.includes('@zxing') || id.includes('html5-qrcode') || id.includes('qrcode')) return 'vendor-scanner'
          if (id.includes('@anthropic-ai'))           return 'vendor-anthropic'
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
})
