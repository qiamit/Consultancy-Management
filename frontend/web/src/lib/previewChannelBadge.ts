/**
 * Preview site (`testing` branch, built with VITE_APP_CHANNEL=preview by deploy/oracle/scripts/preview-deploy.sh).
 * It works on the LIVE database, so every page shows a clear TESTING badge and the tab title starts with [TEST],
 * so it is never mistaken for the live site. Does nothing in the live build.
 */
export function showPreviewChannelBadge(): void {
  if (import.meta.env.VITE_APP_CHANNEL !== 'preview') return

  const badge = document.createElement('div')
  badge.textContent = 'TESTING · live data'
  badge.setAttribute('role', 'status')
  badge.setAttribute('aria-label', 'Testing site: changes here are saved to live data')
  Object.assign(badge.style, {
    position: 'fixed',
    bottom: '8px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    padding: '2px 10px',
    borderRadius: '9999px',
    background: '#b91c1c',
    color: '#ffffff',
    font: '600 11px/18px system-ui, sans-serif',
    letterSpacing: '0.04em',
    pointerEvents: 'none',
    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(badge)

  const prefix = '[TEST] '
  const applyPrefix = () => {
    if (!document.title.startsWith(prefix)) document.title = prefix + document.title
  }
  applyPrefix()
  const titleEl = document.querySelector('title')
  if (titleEl) new MutationObserver(applyPrefix).observe(titleEl, { childList: true })
}
