import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'

export function RequireLaboratoryDirector({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, designation, profileReady } = useAuth()
  const location = useLocation()

  // Wait for auth session AND profile/designation to be resolved
  if (loading || !profileReady) return null

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  if (!isLaboratoryDirector(designation)) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">Access Denied</h1>
        <p className="text-sm text-muted-foreground">
          Only the Laboratory Director can access this page.
        </p>
        <p className="text-xs text-muted-foreground">
          Your designation: <strong>{designation || '(not set)'}</strong>
        </p>
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          onClick={() => { window.location.href = '/' }}
        >
          Go to Dashboard
        </button>
      </div>
    )
  }

  return <>{children}</>
}
