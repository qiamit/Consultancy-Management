import { supabase } from '@/lib/supabaseClient'
import { RECEIVING_REPORT_TYPES } from '../types'
import { stripReceivingReportSuffix } from '../receiving/receivingSrfFromReference'

/** Part A — Reference Report No when report is not amendment / supplementary. */
export const REFERENCE_REPORT_NOT_APPLICABLE = 'N/A'

export function isAmendmentOrSupplementaryReportType(
  reportType: string | null | undefined,
): boolean {
  const t = (reportType ?? '').trim()
  return (
    t === 'Amendment Report' ||
    t === 'Supplementary Report' ||
    t === 'Revised Report' ||
    t === RECEIVING_REPORT_TYPES[1] ||
    t === RECEIVING_REPORT_TYPES[2]
  )
}

/** Prior sample test report number linked via receiving `referenced_srf_number`. */
export async function fetchReferencedSampleReportNumber(
  referencedSrf: string | null | undefined,
): Promise<string | null> {
  const ref = (referencedSrf ?? '').trim()
  if (!ref) return null

  const bases = [...new Set([ref, stripReceivingReportSuffix(ref)].filter(Boolean))]
  const srfCandidates = new Set<string>()
  for (const b of bases) {
    srfCandidates.add(b)
    srfCandidates.add(`${b}A`)
    srfCandidates.add(`${b}S`)
  }

  const { data, error } = await supabase
    .from('samples')
    .select('test_report_number, test_report_issued_at, srf_number')
    .in('srf_number', [...srfCandidates])
    .not('test_report_number', 'is', null)
    .order('test_report_issued_at', { ascending: false, nullsFirst: false })
    .limit(10)

  if (error) {
    console.warn('[fetchReferencedSampleReportNumber]', error.message)
    return null
  }

  const rows = Array.isArray(data) ? data : []
  if (rows.length === 0) return null

  const preferred = rows.find(
    (r) => stripReceivingReportSuffix(String((r as { srf_number?: string }).srf_number ?? '')) === ref,
  ) as { test_report_number?: string | null } | undefined

  const pick = preferred ?? (rows[0] as { test_report_number?: string | null })
  const num = pick?.test_report_number
  return num && String(num).trim() ? String(num).trim() : null
}

export async function resolveReferenceReportNo(
  reportType: string | null | undefined,
  referencedSrf: string | null | undefined,
): Promise<string> {
  if (!isAmendmentOrSupplementaryReportType(reportType)) {
    return REFERENCE_REPORT_NOT_APPLICABLE
  }
  const num = await fetchReferencedSampleReportNumber(referencedSrf)
  return num ?? REFERENCE_REPORT_NOT_APPLICABLE
}
