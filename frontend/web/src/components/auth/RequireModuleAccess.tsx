import { useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { canAccessPath } from '@/lib/moduleAccess'
import { AccessDeniedPage } from '@/components/auth/AccessDeniedPage'
import { useModuleAccessOptional } from '@/features/settings/module-access/ModuleAccessProvider'
import { cn } from '@/lib/utils'

export function RequireModuleAccess({ children }: { children: React.ReactNode }) {
  const { user, loading, designation, departmentName, profileReady } = useAuth()
  const moduleAccess = useModuleAccessOptional()
  const location = useLocation()
  const profileLoadedRef = useRef(false)
  const lastUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    const uid = user?.id ?? null
    if (uid !== lastUserIdRef.current) {
      lastUserIdRef.current = uid
      profileLoadedRef.current = false
    }
    if (!user) profileLoadedRef.current = false
  }, [user])

  if (profileReady && user) profileLoadedRef.current = true

  const waitingForProfile = loading || !profileReady || (Boolean(user) && Boolean(moduleAccess?.loading))
  const keepOutletMounted = profileLoadedRef.current && Boolean(user)

  if (waitingForProfile && !keepOutletMounted) {
    return null
  }

  const ctx = { designation, departmentName }
  // While module-access matrix is loading, fall back to static path rules — never skip the check.
  const allowed =
    moduleAccess && !moduleAccess.loading
      ? moduleAccess.canAccessPath(location.pathname)
      : canAccessPath(location.pathname, ctx)

  if (!allowed) {
    return (
      <AccessDeniedPage
        message="You do not have permission to access this module. Contact your Laboratory Director if you need additional access."
        designation={designation}
        departmentName={departmentName}
      />
    )
  }

  const viewOnly = moduleAccess?.accessLevelFor(location.pathname) === 'view'

  return (
    <div
      className={cn(viewOnly && 'module-access-view-only')}
      data-module-access={viewOnly ? 'view' : 'edit'}
    >
      {children}
    </div>
  )
}
