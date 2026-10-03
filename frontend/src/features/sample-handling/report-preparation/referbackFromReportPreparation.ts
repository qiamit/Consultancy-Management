import { supabase } from '@/lib/supabaseClient'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import {
  deleteTestAllocationsForSampleAllocations,
  referbackSectionToSampleReceiving,
} from '@/features/sample-handling/referbackFlow'
import { ensureTestAllocationParameterRows } from '@/features/sample-handling/shared/ensureTestAllocationParameterRows'
import { isResultsReviewStatusApproved } from '@/features/sample-handling/results-under-review/resultsUnderReviewPartitions'
import type { SampleStage } from '@/features/sample-handling/types'

export type ReportPrepReferbackTarget =
  | 'results_review'
  | 'under_testing'
  | 'test_allocation'
  | 'allocation'
  | 'receiving'

export type ReportPrepReferbackPayload = {
  sampleId: string
  sampleAllocationId: string
  testAllocationId: string
  targetStage: ReportPrepReferbackTarget
  remark: string
  assignee?: { id: string; name: string }
}

type SectionState = {
  sampleAllocationId: string
  testAllocationId: string | null
  sentForTesting: boolean
  hasActiveReviewer: boolean
  isApproved: boolean
}

async function saveReferbackRemark(sampleAllocationId: string, remark: string): Promise<void> {
  const text = remark.trim()
  if (!text) return
  const { error } = await supabase
    .from('sample_allocations')
    .update({ referback_remark: text })
    .eq('id', sampleAllocationId)
  if (error && !isSupabaseMissingColumnError(error, 'referback_remark')) throw error
}

async function loadSectionStates(sampleId: string): Promise<SectionState[]> {
  const { data: allocRows, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id')
    .eq('sample_id', sampleId)
  if (allocErr) throw allocErr
  const allocIds = (Array.isArray(allocRows) ? allocRows : [])
    .map((r) => String((r as { id?: string }).id ?? '').trim())
    .filter(Boolean)
  if (allocIds.length === 0) return []

  const { data: taRows, error: taErr } = await supabase
    .from('test_allocations')
    .select('id, sample_allocation_id, sent_for_testing')
    .in('sample_allocation_id', allocIds)
  if (taErr) throw taErr

  const taByAlloc = new Map<string, { id: string; sentForTesting: boolean }>()
  for (const row of Array.isArray(taRows) ? taRows : []) {
    const allocId = String((row as { sample_allocation_id?: string }).sample_allocation_id ?? '').trim()
    const id = String((row as { id?: string }).id ?? '').trim()
    if (!allocId || !id) continue
    taByAlloc.set(allocId, {
      id,
      sentForTesting: (row as { sent_for_testing?: boolean }).sent_for_testing === true,
    })
  }

  const taIds = [...taByAlloc.values()].map((t) => t.id)
  const paramsByTa = new Map<
    string,
    Array<{
      results_reviewer_id?: string | null
      results_reviewer_name?: string | null
      results_review_status?: string | null
    }>
  >()

  if (taIds.length > 0) {
    const { data: paramRows, error: paramErr } = await supabase
      .from('test_allocation_parameters')
      .select('test_allocation_id, results_reviewer_id, results_reviewer_name, results_review_status')
      .in('test_allocation_id', taIds)
    if (paramErr) throw paramErr
    for (const p of Array.isArray(paramRows) ? paramRows : []) {
      const taId = String((p as { test_allocation_id?: string }).test_allocation_id ?? '').trim()
      if (!taId) continue
      if (!paramsByTa.has(taId)) paramsByTa.set(taId, [])
      paramsByTa.get(taId)!.push(
        p as {
          results_reviewer_id?: string | null
          results_reviewer_name?: string | null
          results_review_status?: string | null
        },
      )
    }
  }

  return allocIds.map((allocId) => {
    const ta = taByAlloc.get(allocId)
    const params = ta ? (paramsByTa.get(ta.id) ?? []) : []
    const isApproved = params.some((p) =>
      isResultsReviewStatusApproved(p.results_review_status, p.results_reviewer_name),
    )
    const hasActiveReviewer = params.some((p) => {
      if (isResultsReviewStatusApproved(p.results_review_status, p.results_reviewer_name)) return false
      const id = p.results_reviewer_id?.trim()
      const name = p.results_reviewer_name?.trim()
      return Boolean(id) || Boolean(name)
    })
    return {
      sampleAllocationId: allocId,
      testAllocationId: ta?.id ?? null,
      sentForTesting: ta?.sentForTesting ?? false,
      hasActiveReviewer,
      isApproved,
    }
  })
}

async function syncSampleStageAfterReferback(sampleId: string): Promise<SampleStage | 'report_preparation'> {
  const sections = await loadSectionStates(sampleId)
  if (sections.length === 0) {
    const { error } = await supabase
      .from('samples')
      .update({ stage: 'receiving', referback_from_allocation: true })
      .eq('id', sampleId)
    if (error) throw error
    return 'receiving'
  }

  const allInResultsReview = sections.every((s) => s.testAllocationId && s.hasActiveReviewer)
  if (allInResultsReview) {
    const { error } = await supabase
      .from('samples')
      .update({
        stage: 'results_review',
        referback_from_allocation: false,
        test_report_issued_at: null,
        test_report_nabl_issued_at: null,
      })
      .eq('id', sampleId)
    if (error && !isSupabaseMissingColumnError(error, 'test_report_nabl_issued_at')) throw error
    if (error && isSupabaseMissingColumnError(error, 'test_report_nabl_issued_at')) {
      const { error: retry } = await supabase
        .from('samples')
        .update({ stage: 'results_review', referback_from_allocation: false, test_report_issued_at: null })
        .eq('id', sampleId)
      if (retry) throw retry
    }
    return 'results_review'
  }

  const allAtTestAllocation = sections.every((s) => s.testAllocationId && !s.sentForTesting && !s.hasActiveReviewer)
  if (allAtTestAllocation) {
    const { error } = await supabase
      .from('samples')
      .update({ stage: 'test_allocation', referback_from_allocation: false })
      .eq('id', sampleId)
    if (error) throw error
    return 'test_allocation'
  }

  const allAtAllocationOnly = sections.every((s) => !s.testAllocationId)
  if (allAtAllocationOnly) {
    const { error } = await supabase
      .from('samples')
      .update({ stage: 'allocation', referback_from_allocation: true })
      .eq('id', sampleId)
    if (error) throw error
    return 'allocation'
  }

  const anyInReview = sections.some((s) => s.hasActiveReviewer)
  const anyReportPrepReady = sections.some((s) => s.isApproved && !s.hasActiveReviewer)
  if (!anyInReview && !anyReportPrepReady) {
    const { error } = await supabase
      .from('samples')
      .update({ stage: 'under_testing', referback_from_allocation: false })
      .eq('id', sampleId)
    if (error) throw error
    return 'under_testing'
  }

  const anyWithoutTestAlloc = sections.some((s) => !s.testAllocationId)
  const { error } = await supabase
    .from('samples')
    .update({ referback_from_allocation: anyWithoutTestAlloc })
    .eq('id', sampleId)
  if (error) throw error
  return 'report_preparation'
}

async function clearSectionReviewMarkers(testAllocationId: string): Promise<void> {
  const { error } = await supabase
    .from('test_allocation_parameters')
    .update({
      results_reviewer_id: null,
      results_reviewer_name: null,
      results_review_status: null,
    })
    .eq('test_allocation_id', testAllocationId)
  if (error) throw error
}

async function referbackToResultsReview(testAllocationId: string): Promise<void> {
  await ensureTestAllocationParameterRows(testAllocationId)
  await clearSectionReviewMarkers(testAllocationId)
  const patch: Record<string, unknown> = {
    sent_for_testing: true,
    referred_back_from_review: false,
  }
  const { error: taErr } = await supabase.from('test_allocations').update(patch).eq('id', testAllocationId)
  if (taErr && !isSupabaseMissingColumnError(taErr, 'referred_back_from_review')) throw taErr
  if (taErr && isSupabaseMissingColumnError(taErr, 'referred_back_from_review')) {
    const { error: retryErr } = await supabase
      .from('test_allocations')
      .update({ sent_for_testing: true })
      .eq('id', testAllocationId)
    if (retryErr) throw retryErr
  }
}

async function referbackToUnderTesting(
  testAllocationId: string,
  assignee: { id: string; name: string },
): Promise<void> {
  await ensureTestAllocationParameterRows(testAllocationId)
  await clearSectionReviewMarkers(testAllocationId)
  const patch: Record<string, unknown> = {
    sent_for_testing: true,
    assigned_employee_id: assignee.id,
    assigned_employee_name: assignee.name,
    referred_back_from_review: true,
  }
  const { error } = await supabase.from('test_allocations').update(patch).eq('id', testAllocationId)
  if (error && !isSupabaseMissingColumnError(error, 'referred_back_from_review')) throw error
  if (error && isSupabaseMissingColumnError(error, 'referred_back_from_review')) {
    const { referred_back_from_review: _drop, ...fallback } = patch
    void _drop
    const { error: retryErr } = await supabase.from('test_allocations').update(fallback).eq('id', testAllocationId)
    if (retryErr) throw retryErr
  }
}

async function referbackToTestAllocation(testAllocationId: string): Promise<void> {
  await ensureTestAllocationParameterRows(testAllocationId)
  await clearSectionReviewMarkers(testAllocationId)
  const { error } = await supabase
    .from('test_allocations')
    .update({
      sent_for_testing: false,
      assigned_employee_id: null,
      assigned_employee_name: null,
    })
    .eq('id', testAllocationId)
  if (error) throw error
}

export async function syncSampleStageAfterReportPrepReferback(
  sampleId: string,
): Promise<SampleStage | 'report_preparation'> {
  return syncSampleStageAfterReferback(sampleId)
}

/**
 * Refer back one section from Test Report Preparation.
 * Only workflow fields required for the target stage are updated; test results and parameters are kept
 * except when referring to Sample Allocation or Sample Receiving (existing delete flows).
 * Pass `skipStageSync: true` when referring multiple sections, then call
 * `syncSampleStageAfterReportPrepReferback` once.
 */
export async function referbackSectionFromReportPreparation(
  payload: ReportPrepReferbackPayload & { skipStageSync?: boolean },
): Promise<{ sampleStage: SampleStage | 'report_preparation' | null }> {
  const sampleId = payload.sampleId.trim()
  const sampleAllocationId = payload.sampleAllocationId.trim()
  const testAllocationId = payload.testAllocationId.trim()
  const remark = payload.remark.trim()

  if (!sampleId || !sampleAllocationId) {
    throw new Error('Missing sample or section.')
  }
  if (!remark) {
    throw new Error('Enter a remark explaining why you are referring back.')
  }

  await saveReferbackRemark(sampleAllocationId, remark)

  switch (payload.targetStage) {
    case 'results_review': {
      if (!testAllocationId) throw new Error('No test allocation for this section.')
      await referbackToResultsReview(testAllocationId)
      break
    }
    case 'under_testing': {
      if (!testAllocationId) throw new Error('No test allocation for this section.')
      if (!payload.assignee?.id) throw new Error('Select a testing engineer.')
      await referbackToUnderTesting(testAllocationId, payload.assignee)
      break
    }
    case 'test_allocation': {
      if (!testAllocationId) throw new Error('No test allocation for this section.')
      await referbackToTestAllocation(testAllocationId)
      break
    }
    case 'allocation': {
      await deleteTestAllocationsForSampleAllocations([sampleAllocationId])
      break
    }
    case 'receiving': {
      await referbackSectionToSampleReceiving(sampleAllocationId, sampleId)
      break
    }
    default:
      throw new Error('Select where to refer back.')
  }

  if (payload.skipStageSync) {
    return { sampleStage: null }
  }

  const sampleStage = await syncSampleStageAfterReferback(sampleId)
  return { sampleStage }
}
