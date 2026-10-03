import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { canAccessSampleReceiving } from '@/lib/moduleAccess'
import { AccessDeniedPage } from '@/components/auth/AccessDeniedPage'
import { useModuleAccessOptional } from '@/features/settings/module-access/ModuleAccessProvider'

export function RequireSampleReceivingAccess({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, designation, departmentName, profileReady } = useAuth()
  const location = useLocation()
  const moduleAccess = useModuleAccessOptional()

  if (loading || !profileReady || (user && moduleAccess?.loading)) return null

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  const ctx = { designation, departmentName }
  const grantedByMatrix =
    moduleAccess && !moduleAccess.loading && moduleAccess.canAccessPath(location.pathname)

  if (!grantedByMatrix && !canAccessSampleReceiving(ctx)) {
    return (
      <AccessDeniedPage
        message="You do not have permission to access Sample Receiving. Ask the Laboratory Director to grant View or Edit access."
        designation={designation}
        departmentName={departmentName}
      />
    )
  }

  return <>{children}</>
}
