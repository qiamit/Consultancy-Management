import { isPublicSitePath } from '@/features/public-site/publicNav'

const LAST_ROUTE_KEY = 'app.lastRoute'
const EXPLICIT_HOME_KEY = 'app.routeExplicitHome'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/** Paths that should never be restored after refresh / login. */
export function isEphemeralRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return isPublicSitePath(path) || path.startsWith('/auth/')
}

export function readLastRoute(): string | null {
  if (!canUseStorage()) return null
  try {
    const raw = window.localStorage.getItem(LAST_ROUTE_KEY)?.trim()
    if (!raw || isEphemeralRoute(raw.split('?')[0] ?? raw)) return null
    return raw
  } catch {
    return null
  }
}

export function rememberRoute(pathname: string, search = ''): void {
  if (!canUseStorage()) return
  if (isEphemeralRoute(pathname)) return

  const next = `${pathname}${search}`
  try {
    window.localStorage.setItem(LAST_ROUTE_KEY, next)
    if (pathname === '/') {
      window.localStorage.setItem(EXPLICIT_HOME_KEY, '1')
    } else {
      window.localStorage.removeItem(EXPLICIT_HOME_KEY)
    }
  } catch {
    // ignore quota / private mode
  }
}

export function wasExplicitHomeVisit(): boolean {
  if (!canUseStorage()) return false
  try {
    return window.localStorage.getItem(EXPLICIT_HOME_KEY) === '1'
  } catch {
    return false
  }
}

/** After login always open Dashboard (`/`). */
export function resolvePostAuthTarget(_from?: unknown): string {
  return '/'
}

/**
 * Restore last page when a refresh lands on `/` but the user was elsewhere
 * (common when the browser/preview document URL did not keep the SPA path).
 */
export function shouldRestoreLastRoute(currentPathname: string): boolean {
  if (currentPathname !== '/') return false
  if (wasExplicitHomeVisit()) return false
  const last = readLastRoute()
  if (!last || last === '/') return false

  if (typeof performance === 'undefined') return false
  const nav = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined
  return nav?.type === 'reload'
}
