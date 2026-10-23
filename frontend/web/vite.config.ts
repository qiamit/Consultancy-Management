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
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-Frame-Options': 'SAMEORIGIN',
      // Report-only until production static host can enforce; allows Google Fonts + API gateway.
      'Content-Security-Policy-Report-Only':
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https: http://127.0.0.1:* http://localhost:* ws: wss:;",
    },
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
  preview: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy-Report-Only':
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https: ws: wss:;",
    },
  },
})
