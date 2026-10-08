import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // shadcn convention: '@/components/ui/...' resolves to src/components/ui/...
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:8000',
      '/audio': 'http://localhost:8000',
    },
  },
})
