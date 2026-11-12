import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works from a GitHub Pages sub-path or Cloudflare Pages root.
  base: './',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
})
