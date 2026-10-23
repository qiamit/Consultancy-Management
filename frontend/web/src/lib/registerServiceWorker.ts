/** Register the app-shell service worker (production builds only — avoids Vite HMR fights). */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] registration failed', err)
    })
  })
}
