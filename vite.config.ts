import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/simple-ray-tracer/',
  server: {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
