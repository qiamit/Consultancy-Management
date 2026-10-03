import { supabase } from '@/lib/supabaseClient'
import {
  isResultsReviewStatusApproved,
  RESULTS_REVIEW_STATUS_APPROVED,
} from '../results-under-review/resultsUnderReviewPartitions'

type SectionApprovalOptions = {
  /** Pre–Approved-marker data: reviewer cleared and all results filled. */
  allowLegacyCompleteResults?: boolean
}

type SectionApprovalState = {
  sampleAllocationId: string
  testAllocationId: string
  sentForTesting: boolean
  approved: boolean
}

type ParamApprovalRow = {
  test_allocation_id: string
  results_reviewer_id?: string | null
  results_reviewer_name?: string | null
  results_review_status?: string | null
  results?: string | null
}

/** Section was approved in Results Under Review (status column; legacy name marker supported). */
function sectionParamsAreReviewApproved(
  rows: ParamApprovalRow[],
  options?: SectionApprovalOptions,
): boolean {
  if (rows.length === 0) return false

  const hasApprovedStatus = rows.some((p) =>
    isResultsReviewStatusApproved(p.results_review_status, p.results_reviewer_name),
  )
  if (hasApprovedStatus) return true

  const hasPendingReviewer = rows.some((p) => {
    const status = p.results_review_status
    if (String(status ?? '').trim().toLowerCase() === RESULTS_REVIEW_STATUS_APPROVED) return false
    return Boolean(p.results_reviewer_id)
  })
  if (hasPendingReviewer) return false

  if (options?.allowLegacyCompleteResults) {
    return rows.every((p) => String(p.results ?? '').trim().length > 0)
  }

  return false
}

function pickTestAllocationPerSection(
  taList: Array<{ id: string; sample_allocation_id: string; sent_for_testing?: boolean | null }>,
): Map<string, { id: string; sent_for_testing: boolean }> {
  const byAlloc = new Map<string, { id: string; sent_for_testing: boolean }>()
  for (const ta of taList) {
    const allocId = String(ta.sample_allocation_id ?? '').trim()
    const taId = String(ta.id ?? '').trim()
    if (!allocId || !taId) continue
    const sent = Boolean(ta.sent_for_testing)
    const existing = byAlloc.get(allocId)
    if (!existing || (sent && !existing.sent_for_testing)) {
      byAlloc.set(allocId, { id: taId, sent_for_testing: sent })
    }
  }
  return byAlloc
}

function paramsIndicateStillInReview(rows: ParamApprovalRow[]): boolean {
  return rows.some((p) => {
    if (isResultsReviewStatusApproved(p.results_review_status, p.results_reviewer_name)) return true
    return Boolean(p.results_reviewer_id)
  })
}

type ApprovalGraph = {
  stageBySample: Map<string, string>
  allocIdsBySample: Map<string, string[]>
  taByAlloc: Map<string, { id: string; sent_for_testing: boolean }>
  /** All test allocation ids per sample (for still-in-review; not only picked). */
  allTaIdsBySample: Map<string, string[]>
  paramsByTa: Map<string, ParamApprovalRow[]>
}

async function loadApprovalGraph(sampleIds: string[]): Promise<ApprovalGraph> {
  const ids = [...new Set(sampleIds.map((id) => id.trim()).filter(Boolean))]
  const stageBySample = new Map<string, string>()
  const allocIdsBySample = new Map<string, string[]>()
  const taByAlloc = new Map<string, { id: string; sent_for_testing: boolean }>()
  const allTaIdsBySample = new Map<string, string[]>()
  const paramsByTa = new Map<string, ParamApprovalRow[]>()

  if (ids.length === 0) {
    return { stageBySample, allocIdsBySample, taByAlloc, allTaIdsBySample, paramsByTa }
  }

  const { data: sampleRows, error: sampleErr } = await supabase
    .from('samples')
    .select('id, stage')
    .in('id', ids)
  if (sampleErr) throw sampleErr
  for (const row of Array.isArray(sampleRows) ? sampleRows : []) {
    const id = String((row as { id?: string }).id ?? '').trim()
    if (!id) continue
    stageBySample.set(id, String((row as { stage?: string | null }).stage ?? '').trim())
  }

  const { data: allocRows, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id, sample_id')
    .in('sample_id', ids)
  if (allocErr) throw allocErr

  const allAllocIds: string[] = []
  const sampleIdByAlloc = new Map<string, string>()
  for (const row of Array.isArray(allocRows) ? allocRows : []) {
    const sampleId = String((row as { sample_id?: string }).sample_id ?? '').trim()
    const allocId = String((row as { id?: string }).id ?? '').trim()
    if (!sampleId || !allocId) continue
    const list = allocIdsBySample.get(sampleId) ?? []
    list.push(allocId)
    allocIdsBySample.set(sampleId, list)
    allAllocIds.push(allocId)
    sampleIdByAlloc.set(allocId, sampleId)
  }

  if (allAllocIds.length === 0) {
    return { stageBySample, allocIdsBySample, taByAlloc, allTaIdsBySample, paramsByTa }
  }

  const { data: taRows, error: taErr } = await supabase
    .from('test_allocations')
    .select('id, sample_allocation_id, sent_for_testing')
    .in('sample_allocation_id', allAllocIds)
  if (taErr) throw taErr

  const taList = (Array.isArray(taRows) ? taRows : []) as Array<{
    id: string
    sample_allocation_id: string
    sent_for_testing?: boolean | null
  }>
  const picked = pickTestAllocationPerSection(taList)
  for (const [allocId, ta] of picked) {
    taByAlloc.set(allocId, ta)
  }

  const allTaIds: string[] = []
  for (const ta of taList) {
    const taId = String(ta.id ?? '').trim()
    const allocId = String(ta.sample_allocation_id ?? '').trim()
    if (!taId || !allocId) continue
    allTaIds.push(taId)
    const sampleId = sampleIdByAlloc.get(allocId)
    if (!sampleId) continue
    const list = allTaIdsBySample.get(sampleId) ?? []
    list.push(taId)
    allTaIdsBySample.set(sampleId, list)
  }

  const uniqueTaIds = [...new Set(allTaIds)]
  if (uniqueTaIds.length === 0) {
    return { stageBySample, allocIdsBySample, taByAlloc, allTaIdsBySample, paramsByTa }
  }

  const { data: paramRows, error: paramErr } = await supabase
    .from('test_allocation_parameters')
    .select(
      'test_allocation_id, results_reviewer_id, results_reviewer_name, results_review_status, results',
    )
    .in('test_allocation_id', uniqueTaIds)
  if (paramErr) throw paramErr

  for (const row of Array.isArray(paramRows) ? paramRows : []) {
    const p = row as ParamApprovalRow
    const taId = String(p.test_allocation_id ?? '').trim()
    if (!taId) continue
    const list = paramsByTa.get(taId) ?? []
    list.push(p)
    paramsByTa.set(taId, list)
  }

  return { stageBySample, allocIdsBySample, taByAlloc, allTaIdsBySample, paramsByTa }
}

function buildStatesFromGraph(
  sampleId: string,
  graph: ApprovalGraph,
): { states: SectionApprovalState[]; allowLegacyCompleteResults: boolean } {
  const sampleStage = graph.stageBySample.get(sampleId) ?? ''
  const allocIds = graph.allocIdsBySample.get(sampleId) ?? []

  const sampleParamRows: ParamApprovalRow[] = []
  for (const taId of graph.allTaIdsBySample.get(sampleId) ?? []) {
    sampleParamRows.push(...(graph.paramsByTa.get(taId) ?? []))
  }
  const stillInReview = paramsIndicateStillInReview(sampleParamRows)
  const allowLegacyCompleteResults =
    sampleStage === 'report_preparation' ||
    (sampleStage === 'results_review' && !stillInReview)

  const states: SectionApprovalState[] = []
  for (const allocId of allocIds) {
    const ta = graph.taByAlloc.get(allocId)
    if (!ta) {
      states.push({
        sampleAllocationId: allocId,
        testAllocationId: '',
        sentForTesting: false,
        approved: false,
      })
      continue
    }
    const approved = sectionParamsAreReviewApproved(graph.paramsByTa.get(ta.id) ?? [], {
      allowLegacyCompleteResults,
    })
    states.push({
      sampleAllocationId: allocId,
      testAllocationId: ta.id,
      sentForTesting: ta.sent_for_testing,
      approved,
    })
  }

  return { states, allowLegacyCompleteResults }
}

async function loadSampleSectionApprovalStates(
  sampleId: string,
): Promise<{ states: SectionApprovalState[]; allowLegacyCompleteResults: boolean }> {
  const graph = await loadApprovalGraph([sampleId])
  return buildStatesFromGraph(sampleId, graph)
}

/**
 * Batch visibility filter for Test Report Preparation list (avoids N+1 per SRF).
 */
export async function filterSampleIdsVisibleInReportPreparation(
  sampleIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(sampleIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return new Set()

  const graph = await loadApprovalGraph(ids)
  const visible = new Set<string>()
  for (const id of ids) {
    const { states } = buildStatesFromGraph(id, graph)
    if (states.some((s) => s.sentForTesting && s.approved)) {
      visible.add(id)
    }
  }

  return visible
}

/**
 * Show SRF in Test Report Preparation when at least one section was sent for testing
 * and its results were approved in Results Under Review.
 */
export async function isSampleVisibleInReportPreparation(sampleId: string): Promise<boolean> {
  const { states } = await loadSampleSectionApprovalStates(sampleId)
  return states.some((s) => s.sentForTesting && s.approved)
}

/**
 * SRF is fully ready to issue when every allocated section was sent for testing
 * and each section's results were approved in review.
 */
export async function isSampleReadyForReportPreparation(sampleId: string): Promise<boolean> {
  const { states } = await loadSampleSectionApprovalStates(sampleId)
  if (states.length === 0) return false
  return states.every((s) => s.sentForTesting && s.approved)
}

/** Any parameter still assigned to a results reviewer for this SRF. */
export async function sampleStillHasResultsInReview(sampleId: string): Promise<boolean> {
  const graph = await loadApprovalGraph([sampleId])
  const rows: ParamApprovalRow[] = []
  for (const taId of graph.allTaIdsBySample.get(sampleId) ?? []) {
    rows.push(...(graph.paramsByTa.get(taId) ?? []))
  }
  return paramsIndicateStillInReview(rows)
}

/** Keep sample stage aligned: report_preparation when any section is approved for prep. */
export async function syncSampleReportPreparationStages(
  sampleIds: string[],
): Promise<{ toPrep: string[]; toReview: string[]; changedIds: string[] }> {
  const ids = [...new Set(sampleIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return { toPrep: [], toReview: [], changedIds: [] }

  // Stage-only prefilter so we do not load allocation graphs for unrelated stages.
  const { data: stageRows, error: stageErr } = await supabase
    .from('samples')
    .select('id, stage')
    .in('id', ids)
  if (stageErr) throw stageErr

  const relevantIds = (Array.isArray(stageRows) ? stageRows : [])
    .filter((row) => {
      const stage = String((row as { stage?: string | null }).stage ?? '').trim()
      return (
        stage === 'results_review' ||
        stage === 'report_preparation' ||
        stage === 'under_testing'
      )
    })
    .map((row) => String((row as { id?: string }).id ?? '').trim())
    .filter(Boolean)

  if (relevantIds.length === 0) return { toPrep: [], toReview: [], changedIds: [] }

  const graph = await loadApprovalGraph(relevantIds)
  const toPrep: string[] = []
  const toReview: string[] = []

  for (const id of relevantIds) {
    const stage = graph.stageBySample.get(id) ?? ''
    const { states } = buildStatesFromGraph(id, graph)
    const visible = states.some((s) => s.sentForTesting && s.approved)
    if (visible) {
      if (stage !== 'report_preparation' && stage !== 'completed') toPrep.push(id)
      continue
    }
    if (stage === 'report_preparation') toReview.push(id)
  }

  if (toPrep.length > 0) {
    const { error } = await supabase
      .from('samples')
      .update({ stage: 'report_preparation' })
      .in('id', toPrep)
    if (error) throw error
  }
  if (toReview.length > 0) {
    const { error } = await supabase
      .from('samples')
      .update({ stage: 'results_review' })
      .in('id', toReview)
    if (error) throw error
  }

  return { toPrep, toReview, changedIds: [...toPrep, ...toReview] }
}

/** Keep sample stage aligned: report_preparation when any section is approved for prep. */
export async function syncSampleReportPreparationStage(sampleId: string): Promise<void> {
  await syncSampleReportPreparationStages([sampleId])
}
