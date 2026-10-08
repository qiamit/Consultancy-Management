import { supabase } from '@/lib/supabaseClient'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import { sanitizeSectionCodeInput } from '@/features/sample-handling/allocation/sectionCode'
import { getReportedTestResult } from '@/features/sample-handling/sample-under-testing/testResultValues'
import { compareClauseNumbers } from './clauseNumberSort'
import { evaluateResultConformity, type ConformityRemark } from './evaluateResultConformity'
import { normalizeResultRemark } from './resultRemarkUi'
import { resolveReportScopeFromAccreditationIds, scopeKindFromLabel } from './reportScope'
import type { ReportScopeKind } from './reportScope'

export type ReportResultRow = {
  parameterId: string
  rowKey: string
  srNo: number
  sectionCode: string
  sampleAllocationId: string
  testAllocationId: string
  clauseNo: string | null
  testName: string
  testMethodClause: string | null
  unit: string
  specifiedRequirement: string
  observedValue: string
  uncertainty: string
  remark: string
  scope: string
}

function buildResultRowKey(p: {
  test_allocation_id: string
  test_parameter_id: string | null
  test_label: string
}): string {
  const allocId = p.test_allocation_id.trim()
  const paramId = p.test_parameter_id?.trim()
  const label = p.test_label.trim()
  return `${allocId}:${paramId || label}`
}

export type ReportResultSectionGroup = {
  sectionCode: string
  sampleAllocationId: string
  testAllocationId: string
  rows: ReportResultRow[]
}

type TestParameterSnapshot = {
  item_name: string | null
  test_method: string | null
  clause_no: string | null
  unit_value: string | null
  specific_requirement: string | null
  uncertainty_mu: string | null
  under_accreditation_ids: string[] | null
}

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export function compareReportResultRows(a: ReportResultRow, b: ReportResultRow): number {
  const sectionCmp = a.sectionCode.localeCompare(b.sectionCode, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
  if (sectionCmp !== 0) return sectionCmp

  const clauseCmp = compareClauseNumbers(a.clauseNo, b.clauseNo)
  if (clauseCmp !== 0) return clauseCmp

  return a.testName.localeCompare(b.testName, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

export function sortReportResultRows(rows: ReportResultRow[]): ReportResultRow[] {
  return [...rows].sort(compareReportResultRows).map((row, index) => ({
    ...row,
    srNo: index + 1,
  }))
}

function sortRowsWithinSection(rows: ReportResultRow[]): ReportResultRow[] {
  return [...rows]
    .sort((a, b) => {
      const clauseCmp = compareClauseNumbers(a.clauseNo, b.clauseNo)
      if (clauseCmp !== 0) return clauseCmp
      return a.testName.localeCompare(b.testName, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    })
    .map((row, index) => ({ ...row, srNo: index + 1 }))
}

function buildTestNameParts(
  tp: TestParameterSnapshot | undefined,
  fallbackLabel: string,
): { testName: string; testMethodClause: string | null } {
  const testName = (tp?.item_name ?? fallbackLabel).trim() || fallbackLabel
  const method = tp?.test_method?.trim()
  const clause = tp?.clause_no?.trim()
  const parts = [method, clause ? `Clause ${clause}` : null].filter(Boolean)
  return {
    testName,
    testMethodClause: parts.length > 0 ? parts.join(' · ') : null,
  }
}

export async function fetchReportResultRowsForSample(sampleId: string): Promise<ReportResultRow[]> {
  const { data: allocs, error: aErr } = await supabase
    .from('sample_allocations')
    .select('id')
    .eq('sample_id', sampleId)
  if (aErr) throw aErr
  const allocList = Array.isArray(allocs) ? allocs : []
  if (allocList.length === 0) return []

  const allocIds = allocList.map((a: { id: string }) => a.id)
  const { data: tas, error: tErr } = await supabase
    .from('test_allocations')
    .select('id, section_code, sample_allocation_id')
    .in('sample_allocation_id', allocIds)
    .eq('sent_for_testing', true)
  if (tErr) throw tErr
  const taList = Array.isArray(tas) ? tas : []
  const taIds = taList.map((t: { id: string }) => t.id)
  if (taIds.length === 0) return []

  const sectionMetaByTaId = new Map<
    string,
    { sectionCode: string; sampleAllocationId: string }
  >()
  for (const t of taList) {
    const row = t as { id: string; section_code?: string | null; sample_allocation_id?: string | null }
    sectionMetaByTaId.set(row.id, {
      sectionCode: String(row.section_code ?? '').trim() || '—',
      sampleAllocationId: String(row.sample_allocation_id ?? '').trim(),
    })
  }

  let paramRows: Array<{
    id: string
    test_allocation_id: string
    test_parameter_id: string | null
    test_label: string
    results: string | null
    report_remark?: string | null
    specific_requirement?: string | null
  }> = []

  const withRemark = await supabase
    .from('test_allocation_parameters')
    .select(
      'id, test_allocation_id, test_parameter_id, test_label, results, report_remark, specific_requirement',
    )
    .in('test_allocation_id', taIds)

  if (!withRemark.error) {
    paramRows = (Array.isArray(withRemark.data) ? withRemark.data : []) as typeof paramRows
  } else if (isSupabaseMissingColumnError(withRemark.error, 'report_remark')) {
    const fallback = await supabase
      .from('test_allocation_parameters')
      .select('id, test_allocation_id, test_parameter_id, test_label, results')
      .in('test_allocation_id', taIds)
    if (fallback.error) throw fallback.error
    paramRows = (Array.isArray(fallback.data) ? fallback.data : []) as typeof paramRows
  } else if (withRemark.error) {
    throw withRemark.error
  }

  paramRows = paramRows.filter(
    (p) => String(p.results ?? '').trim() !== '',
  )
  if (paramRows.length === 0) return []

  const tpIds = [
    ...new Set(
      paramRows
        .map((p) => p.test_parameter_id)
        .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
    ),
  ]

  const [{ data: tpData }, { data: abData }] = await Promise.all([
    tpIds.length > 0
      ? supabase
          .from('test_parameters')
          .select(
            'id, item_name, test_method, clause_no, unit_value, specific_requirement, uncertainty_mu, under_accreditation_ids',
          )
          .in('id', tpIds)
      : Promise.resolve({ data: [] as TestParameterSnapshot[], error: null }),
    supabase.from('accreditation_bodies').select('id, name'),
  ])

  const tpMap = new Map<string, TestParameterSnapshot & { id: string }>()
  for (const row of Array.isArray(tpData) ? tpData : []) {
    const r = row as TestParameterSnapshot & { id: string }
    tpMap.set(r.id, r)
  }

  const accreditationById = new Map<string, string>()
  for (const row of Array.isArray(abData) ? abData : []) {
    const r = row as { id: string; name?: string | null }
    accreditationById.set(r.id, String(r.name ?? '').trim())
  }

  const rows = paramRows.map((p) => {
    const tp = p.test_parameter_id ? tpMap.get(p.test_parameter_id) : undefined
    const { testName, testMethodClause } = buildTestNameParts(tp, p.test_label ?? '—')
    const observed = getReportedTestResult(p.results)
    const requirement = String(p.specific_requirement?.trim() || tp?.specific_requirement || '')
    const storedRemark = p.report_remark?.trim()
    const remark: ConformityRemark =
      storedRemark &&
      (['Confirm', 'Not Confirm', 'Not Applicable'] as const).includes(
        storedRemark as ConformityRemark,
      )
        ? (storedRemark as ConformityRemark)
        : evaluateResultConformity(observed, requirement)
    const meta = sectionMetaByTaId.get(p.test_allocation_id)
    return {
      parameterId: p.id,
      rowKey: buildResultRowKey(p),
      srNo: 0,
      sectionCode: meta?.sectionCode ?? '—',
      sampleAllocationId: meta?.sampleAllocationId ?? '',
      testAllocationId: p.test_allocation_id,
      clauseNo: tp?.clause_no?.trim() || null,
      testName,
      testMethodClause,
      unit: fmt(tp?.unit_value),
      specifiedRequirement: fmt(p.specific_requirement?.trim() || tp?.specific_requirement),
      observedValue: fmt(observed),
      uncertainty: fmt(tp?.uncertainty_mu),
      remark,
      scope: resolveReportScopeFromAccreditationIds(tp?.under_accreditation_ids, accreditationById),
    }
  })

  return sortReportResultRows(rows)
}

/** Save Part C specified requirement override for one section parameter row. */
export async function saveReportSpecifiedRequirement(
  parameterId: string,
  specificRequirement: string | null,
): Promise<void> {
  const id = parameterId.trim()
  if (!id) throw new Error('Parameter row is missing.')

  const { error } = await supabase
    .from('test_allocation_parameters')
    .update({ specific_requirement: specificRequirement || null })
    .eq('id', id)

  if (error) throw error
}

/** Save Part C remarks edited in Test Report Preparation. */
export async function saveReportResultRemarks(rows: ReportResultRow[]): Promise<void> {
  const updates = rows
    .filter((r) => r.parameterId?.trim())
    .map((r) => ({
      id: r.parameterId,
      report_remark: normalizeResultRemark(r.remark),
    }))
  if (updates.length === 0) return

  const results = await Promise.all(
    updates.map((u) =>
      supabase.from('test_allocation_parameters').update({ report_remark: u.report_remark }).eq('id', u.id),
    ),
  )
  const firstErr = results.find((r) => r.error)?.error
  if (firstErr) {
    if (isSupabaseMissingColumnError(firstErr, 'report_remark')) {
      throw new Error(
        'Database is missing report_remark on test_allocation_parameters. Run the latest Supabase migration.',
      )
    }
    throw firstErr
  }
}

export function filterReportRowsByScope(rows: ReportResultRow[], scope: ReportScopeKind): ReportResultRow[] {
  return sortReportResultRows(rows.filter((r) => scopeKindFromLabel(r.scope) === scope))
}

export function getApplicableReportScopes(rows: ReportResultRow[]): ReportScopeKind[] {
  const scopes = new Set<ReportScopeKind>()
  for (const row of rows) {
    scopes.add(scopeKindFromLabel(row.scope))
  }
  return (['nabl', 'non_nabl'] as const).filter((s) => scopes.has(s))
}

/** Group scoped rows by section code; Sr No restarts at 1 per section. */
export function groupReportRowsBySectionCode(rows: ReportResultRow[]): ReportResultSectionGroup[] {
  const byCode = new Map<string, ReportResultRow[]>()

  for (const row of rows) {
    const code = row.sectionCode.trim() || '—'
    if (!byCode.has(code)) byCode.set(code, [])
    byCode.get(code)!.push(row)
  }

  const sectionCodes = [...byCode.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  )

  return sectionCodes.map((sectionCode) => {
    const sectionRows = sortRowsWithinSection(byCode.get(sectionCode)!)
    const first = sectionRows[0]
    return {
      sectionCode,
      sampleAllocationId: first?.sampleAllocationId ?? '',
      testAllocationId: first?.testAllocationId ?? '',
      rows: sectionRows,
    }
  })
}

export function patchReportResultRowsSectionCode(
  rows: ReportResultRow[],
  oldCode: string,
  newCode: string,
): ReportResultRow[] {
  const trimmedOld = oldCode.trim()
  const trimmedNew = newCode.trim()
  if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return rows
  return rows.map((row) =>
    row.sectionCode.trim() === trimmedOld ? { ...row, sectionCode: trimmedNew } : row,
  )
}

/** Update section code on sample_allocations and test_allocations for one section. */
export async function updateReportSectionCode(opts: {
  sampleId: string
  sampleAllocationId: string
  testAllocationId: string
  currentSectionCode: string
  newSectionCode: string
}): Promise<string> {
  const sampleAllocationId = opts.sampleAllocationId.trim()
  const testAllocationId = opts.testAllocationId.trim()
  const sampleId = opts.sampleId.trim()
  const code = sanitizeSectionCodeInput(opts.newSectionCode)

  if (!sampleAllocationId || !testAllocationId || !sampleId) {
    throw new Error('Section allocation is missing.')
  }
  if (!code) {
    throw new Error('Section code is required.')
  }

  const current = sanitizeSectionCodeInput(opts.currentSectionCode)
  if (code === current) return code

  const { data: duplicate, error: dupErr } = await supabase
    .from('sample_allocations')
    .select('id')
    .eq('sample_id', sampleId)
    .eq('section_code', code)
    .neq('id', sampleAllocationId)
    .maybeSingle()
  if (dupErr) throw dupErr
  if (duplicate?.id) {
    throw new Error('This section code is already used for another section on this SRF.')
  }

  const [sampleRes, testRes] = await Promise.all([
    supabase.from('sample_allocations').update({ section_code: code }).eq('id', sampleAllocationId),
    supabase.from('test_allocations').update({ section_code: code }).eq('id', testAllocationId),
  ])
  if (sampleRes.error) throw sampleRes.error
  if (testRes.error) throw testRes.error

  return code
}
