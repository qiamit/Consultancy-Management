/* Consultancy Pro — minimal app-shell service worker.
 * Precaches hashed static assets from the install event via the build-injected
 * list when present; otherwise caches navigations and brand assets only.
 * Never caches /auth, /rest, /functions, or other API responses.
 */
const CACHE = 'consultancy-pro-shell-v1'
const PRECACHE = ['/', '/manifest.webmanifest', '/brand/qe-logo.png', '/brand/qi-logo.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

function isApiPath(pathname) {
  return (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/rest') ||
    pathname.startsWith('/functions') ||
    pathname.startsWith('/storage') ||
    pathname.startsWith('/api/')
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (isApiPath(url.pathname)) return

  // App shell: network-first for navigations, cache fallback when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put('/', copy)).catch(() => undefined)
          return res
        })
        .catch(() =>
          caches.match('/').then(
            (cached) =>
              cached ||
              new Response(
                '<!doctype html><title>Offline</title><body style="font-family:system-ui;padding:2rem"><h1>You are offline</h1><p>Consultancy Pro needs a network connection for this page.</p></body>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
              ),
          ),
        ),
    )
    return
  }

  // Static assets: stale-while-revalidate for same-origin JS/CSS/images under /assets or /brand.
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname.endsWith('.webmanifest')
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone()).catch(() => undefined)
            return res
          })
          .catch(() => cached)
        return cached || network
      }),
    )
  }
}
