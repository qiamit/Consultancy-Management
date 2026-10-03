import { useLocation } from 'react-router-dom'
import { useModuleAccessOptional } from './ModuleAccessProvider'

/** True when the current route allows create/update/delete (Edit), or when rules are not loaded yet. */
export function useCanEditCurrentModule(): boolean {
  const location = useLocation()
  const moduleAccess = useModuleAccessOptional()
  if (!moduleAccess || moduleAccess.loading) return true
  return moduleAccess.canEditPath(location.pathname)
}
