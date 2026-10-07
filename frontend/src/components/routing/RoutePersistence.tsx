import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  rememberRoute,
  shouldRestoreLastRoute,
  readLastRoute,
} from '@/lib/routePersistence'

/**
 * Keeps the last authenticated route and restores it after refresh when the
 * document URL was reset to `/` (e.g. some IDE browser previews), or when the
 * SPA path stayed but `?view=` / `?module=` search was stripped.
 */
export function RoutePersistence() {
  const location = useLocation()
  const navigate = useNavigate()
  const restoredRef = useRef(false)

  useEffect(() => {
    // Restore BEFORE remembering — otherwise a stripped-search refresh would
    // overwrite the good lastRoute and lose dialog state forever.
    if (!restoredRef.current) {
      restoredRef.current = true
      if (shouldRestoreLastRoute(location.pathname, location.search)) {
        const last = readLastRoute()
        const current = `${location.pathname}${location.search}`
        if (last && last !== current) {
          navigate(last, { replace: true })
          return
        }
      }
    }
    rememberRoute(location.pathname, location.search)
  }, [location.pathname, location.search, navigate])

  return null
}
