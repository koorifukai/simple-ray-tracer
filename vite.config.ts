import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/simple-ray-tracer.github.io/',
  esbuild: {
    // Exclude debug and test files from production build
    exclude: ['src/debug/**', 'src/tests/**']
  }
})
