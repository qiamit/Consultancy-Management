import { Navigate, useLocation } from 'react-router-dom'
import BisProjectsMasterPage from '../projects/BisProjectsMasterPage'
import BisRenewalsMasterPage from './BisRenewalsMasterPage'

/** One workspace for license renewal candidates and their renewal application history. */
export default function BisLicenseLifecyclePage() {
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const legacyView = searchParams.get('view')
  const hasLegacyView = legacyView === 'due' || legacyView === 'applications'
  const hasStaleNewLicenseForm = searchParams.get('edit') === 'new'

  if (hasLegacyView || hasStaleNewLicenseForm) {
    const params = new URLSearchParams(searchParams)
    if (hasLegacyView) params.delete('view')
    if (hasStaleNewLicenseForm) params.delete('edit')
    const search = params.toString()
    // Remove old tab state and the retired Add License form state before the
    // master page reads these keys as a document UUID or an active form request.
    return <Navigate to={`${location.pathname}${search ? `?${search}` : ''}`} replace />
  }
  return (
    <>
      <BisProjectsMasterPage key="renewal-due" listMode="due_soon" />
      <BisRenewalsMasterPage dialogOnly />
    </>
  )
}
