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
})
