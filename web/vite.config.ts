import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // All data comes from the BhuVyom API (FastAPI on :8001), same-origin via this proxy.
    proxy: { '/api': 'http://localhost:8001' },
  },
  preview: { proxy: { '/api': 'http://localhost:8001' } },
  // maplibre-gl v6 loads its worker via new URL(..., import.meta.url); pre-bundling breaks that path.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
