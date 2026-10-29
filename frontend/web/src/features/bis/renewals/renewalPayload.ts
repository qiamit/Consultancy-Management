/**
 * Data for the QE Consultancy extension's "Renewal" section (Manak Assist on BIS License Renewals).
 * The extension fills Manak's Production Return Details from it
 * (frontend/extensions/QE-Extension-Dev/renewal-fill.js — keep the shape in sync).
 */
import { supabase } from '@/lib/supabaseClient'
import { fetchBisModulePayload } from '../projects/bisModuleDataApi'
import { BIS_PROJECT_FILES_BUCKET } from '../projects/bisProjectFilesApi'
import { parseCmpf307Payload } from '../projects/cmpf307Model'
import { requireManakCmL } from '../projects/manakExtensionBridge'
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

export type ManakRenewalFile = { slot: 'ca-certificate'; label: string; url: string; fileName: string; mime: string }

export type ManakRenewalPayload = {
  kind: 'QE_MANAK_RENEWAL_V1'
  projectId: string
  /** CM/L digits — the licence row on Manak's Granted Licenses. */
  cmlNo: string
  firmName: string
  isNumber: string
  validityDate: string
  /**
   * Brand to pick on each return: the licence's only brand in Consultancy Pro (CMPF-307). Empty when the
   * app has none or several — the extension then stops if Manak lists more than one brand (never guesses).
   */
  brand: string
  /** Month-wise returns from the latest saved Renewal Sheet (empty when none is saved yet). */
  returns: ManakRenewalReturn[]
  /** Report of Performance: "Brief information regarding difficulties … in operating of BIS Licence". */
  difficulties: string
  /** The CA-attested production statement (Renewal Sheet → Attach CA Certificate), for Report of Performance. */
  files: ManakRenewalFile[]
  copiedAt: string
}

const LINK_SECONDS = 60 * 60 * 3

/** Report of Performance → "difficulties experienced in operating the BIS licence" when there were none. */
export const RENEWAL_DIFFICULTIES_NIL =
  'Nil. No difficulties were experienced in operating the BIS licence during this period. Production, testing and marking were carried out in accordance with the Indian Standard and the Scheme of Inspection and Testing.'

/** Latest CA certificate attached on the Renewal Sheet, with a link the extension can download for 3 hours. */
async function caCertificateFile(projectId: string): Promise<ManakRenewalFile | null> {
  const { data, error } = await supabase
    .from('bis_project_files')
    .select('file_name, storage_path, mime_type')
    .eq('bis_project_id', projectId)
    .eq('doc_kind', 'renewal-ca-certificate')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data?.storage_path) return null
  const { data: link, error: linkError } = await supabase.storage
    .from(BIS_PROJECT_FILES_BUCKET)
    .createSignedUrl(data.storage_path, LINK_SECONDS)
  if (linkError || !link?.signedUrl) return null
  const name = String(data.file_name ?? '').replace(/^\[(draft|r\d+)\] /, '') || 'CA-Certificate.pdf'
  return {
    slot: 'ca-certificate',
    label: 'CA Certificate',
    url: link.signedUrl,
    fileName: /\.pdf$/i.test(name) ? name : `${name}.pdf`,
    mime: 'application/pdf',
  }
}

/** The licence's brand when CMPF-307 lists exactly one; "" otherwise. */
async function licenceBrand(projectId: string): Promise<string> {
  const payload = await fetchBisModulePayload(projectId, 'cmpf-307')
  const names = parseCmpf307Payload(payload).rows.map((r) => r.brandName.trim()).filter(Boolean)
  const unique = Array.from(new Map(names.map((n) => [n.toLowerCase(), n])).values())
  return unique.length === 1 ? unique[0] : ''
}

export async function buildManakRenewalPayload(row: BisProjectRow): Promise<ManakRenewalPayload> {
  // Without a 10-digit CM/L the extension cannot tell this licence's row apart on Manak.
  const cmlNo = requireManakCmL(row.cm_l_digits, 'Renewal')
  const [saved, caCertificate, brand] = await Promise.all([
    fetchLatestRenewalForProject(row.id).catch(() => null),
    caCertificateFile(row.id).catch(() => null),
    licenceBrand(row.id).catch(() => ''),
  ])
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
    cmlNo,
    firmName: String(row.client?.company_name ?? '').trim(),
    isNumber: String(row.is_code?.is_number ?? '').trim(),
    validityDate: String(row.license_validity_date ?? '').slice(0, 10),
    brand,
    returns,
    difficulties: RENEWAL_DIFFICULTIES_NIL,
    files: caCertificate ? [caCertificate] : [],
    copiedAt: new Date().toISOString(),
  }
}
