import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Read .env from the parent monorepo root so the storefront and the pos
// app share a single VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY config.
// envDir is resolved relative to vite.config.js, so '../..' = repo root.
export default defineConfig({
  plugins: [react()],
  base: './',
  envDir: '../..',
  build: { outDir: 'dist', assetsDir: 'assets' },
})
