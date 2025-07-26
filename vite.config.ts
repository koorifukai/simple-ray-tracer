import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/simple-ray-tracer/' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  esbuild: {
    // Exclude debug and test files from production build
    exclude: ['src/debug/**', 'src/tests/**']
  }
})
