import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api/pdf': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
        rewrite: (p) => (p === '/api/pdf' ? '/pdf' : p.replace(/^\/api/, '')),
      },
      // Local-only BIS knowledge search (dev). Does not affect production / Railway.
      '/api/knowledge': {
        target: 'http://127.0.0.1:3851',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/knowledge/, '') || '/',
      },
    },
  },
})
