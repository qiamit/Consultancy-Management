import { createContext, useContext } from 'react'
import type { PortalDashboard } from './portalApi'

/** Dashboard data loaded once by the portal frame and shared by the sidebar and the pages. */
export type PortalData = {
  dashboard: PortalDashboard | null
  error: string | null
  reload: () => Promise<void>
}

export const PortalDataContext = createContext<PortalData>({
  dashboard: null,
  error: null,
  reload: async () => {},
})

export function usePortalData(): PortalData {
  return useContext(PortalDataContext)
}
