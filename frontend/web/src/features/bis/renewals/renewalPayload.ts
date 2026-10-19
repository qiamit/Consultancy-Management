/**
 * Data for the QE Consultancy extension's "Renewal" section (Manak Assist on BIS License Renewals).
 * Keep the shape in sync with the extension (background.js stores it as renewalFill).
 */
import type { BisProjectRow } from '../projects/types'

export type ManakRenewalPayload = {
  kind: 'QE_MANAK_RENEWAL_V1'
  projectId: string
  /** CM/L digits — the licence row on Manak's Licenses View. */
  cmlNo: string
  firmName: string
  isNumber: string
  validityDate: string
  copiedAt: string
}

export function buildManakRenewalPayload(row: BisProjectRow): ManakRenewalPayload {
  return {
    kind: 'QE_MANAK_RENEWAL_V1',
    projectId: row.id,
    cmlNo: String(row.cm_l_digits ?? '').replace(/\D/g, ''),
    firmName: String(row.client?.company_name ?? '').trim(),
    isNumber: String(row.is_code?.is_number ?? '').trim(),
    validityDate: String(row.license_validity_date ?? '').slice(0, 10),
    copiedAt: new Date().toISOString(),
  }
}
