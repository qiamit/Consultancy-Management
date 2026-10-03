import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  rememberRoute,
  shouldRestoreLastRoute,
  readLastRoute,
} from '@/lib/routePersistence'

/**
 * Keeps the last authenticated route and restores it after refresh when the
 * document URL was reset to `/` (e.g. some IDE browser previews).
 */
export function RoutePersistence() {
  const location = useLocation()
  const navigate = useNavigate()
  const restoredRef = useRef(false)

  useEffect(() => {
    rememberRoute(location.pathname, location.search)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (restoredRef.current) return
    if (!shouldRestoreLastRoute(location.pathname)) {
      restoredRef.current = true
      return
    }
    const last = readLastRoute()
    if (!last) {
      restoredRef.current = true
      return
    }
    restoredRef.current = true
    navigate(last, { replace: true })
  }, [location.pathname, navigate])

  return null
}
