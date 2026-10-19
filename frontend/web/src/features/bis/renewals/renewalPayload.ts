/**
 * Data for the QE Consultancy extension's "Renewal" section (Manak Assist on BIS License Renewals).
 * The extension fills Manak's Production Return Details from it
 * (frontend/extensions/qe-consultancy-chrome/renewal-fill.js — keep the shape in sync).
 */
import type { BisProjectRow } from '../projects/types'
import { fetchLatestRenewalForProject } from './bisRenewalsApi'
import { calculateRenewalProductionRow, rowToRenewalForm } from './types'

export type ManakRenewalReturn = {
  /** ISO dates of one Manak return period (a month, or part of the anniversary month). */
  from: string
  to: string
  productionQty: string
  productionValue: string
  /** Production marked with the ISI mark (CA certified). */
  coveredQty: string
  coveredValue: string
}

export type ManakRenewalPayload = {
  kind: 'QE_MANAK_RENEWAL_V1'
  projectId: string
  /** CM/L digits — the licence row on Manak's Granted Licenses. */
  cmlNo: string
  firmName: string
  isNumber: string
  validityDate: string
  /** Brand to pick on each return; empty = the licence's first brand on Manak. */
  brand: string
  /** Month-wise returns from the latest saved Renewal Sheet (empty when none is saved yet). */
  returns: ManakRenewalReturn[]
  copiedAt: string
}

export async function buildManakRenewalPayload(row: BisProjectRow): Promise<ManakRenewalPayload> {
  const saved = await fetchLatestRenewalForProject(row.id).catch(() => null)
  const form = saved ? rowToRenewalForm(saved) : null
  const returns: ManakRenewalReturn[] = form
    ? form.productionRows
        .filter((r) => r.periodFrom && r.periodTo)
        .map((r) => calculateRenewalProductionRow(r, form.basicUnitRate, form.slabRates))
        .map((r) => ({
          from: r.periodFrom,
          to: r.periodTo,
          productionQty: r.stockMarkingBreak ? '0' : r.productionUnit,
          productionValue: r.stockMarkingBreak ? '0' : r.productionValue,
          coveredQty: r.stockMarkingBreak ? '0' : r.coveredUnit,
          coveredValue: r.stockMarkingBreak ? '0' : r.coveredValue,
        }))
    : []
  return {
    kind: 'QE_MANAK_RENEWAL_V1',
    projectId: row.id,
    cmlNo: String(row.cm_l_digits ?? '').replace(/\D/g, ''),
    firmName: String(row.client?.company_name ?? '').trim(),
    isNumber: String(row.is_code?.is_number ?? '').trim(),
    validityDate: String(row.license_validity_date ?? '').slice(0, 10),
    brand: '',
    returns,
    copiedAt: new Date().toISOString(),
  }
}
