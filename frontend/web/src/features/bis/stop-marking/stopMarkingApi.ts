import { supabase } from '@/lib/supabaseClient'
import { currentUserId } from '../shared/bisLookupApi'
import type { OslSampleRequirementRow } from '../projects/oslSampleRequirementsModel'
import type { StopMarkingDocument } from './types'
import { NOTICE_TYPE_OPTIONS, noticeHoldsMarking, type StopMarkingAddForm, type StopMarkingCaseForm, type StopMarkingNoticeFilter, type StopMarkingRow, type StopMarkingStatusFilter } from './types'

/** Case types that prohibit marking, so they put the licence into Stop Marking status. */
const HOLDING_TYPES = NOTICE_TYPE_OPTIONS.filter((o) => o.holdsMarking).map((o) => o.value)

import { formatBisApiError } from '../projects/bisProjectsApi'

export { formatBisApiError }

const BUCKET = 'bis-stop-marking-files'
const SELECT_WITH_JOINS =
  '*, client:clients(company_name), is_code:is_codes(is_number, title, revision_year, part_no, section_no, standard_prefix)'

const sanitize = (raw: string) => raw.replace(/[,()"\\*%_]/g, ' ').replace(/\s+/g, ' ').trim()

export async function fetchStopMarkingPage({
  search,
  page,
  pageSize,
  statusFilter,
  noticeFilter = 'all',
}: {
  search: string
  page: number
  pageSize: number
  statusFilter: StopMarkingStatusFilter
  noticeFilter?: StopMarkingNoticeFilter
}): Promise<{ rows: StopMarkingRow[]; total: number }> {
  const term = sanitize(search)
  let orFilter: string | null = null
  if (term) {
    const parts = [`cm_l_digits.ilike.*${term}*`, `bis_reference.ilike.*${term}*`]
    const digits = term.replace(/\D/g, '')
    if (digits.length >= 3 && digits !== term) parts.push(`cm_l_digits.ilike.*${digits}*`)
    const [clients, isCodes] = await Promise.all([
      supabase.from('clients').select('id').ilike('company_name', `%${term}%`).limit(100),
      supabase.from('is_codes').select('id').or(`is_number.ilike.*${term}*,title.ilike.*${term}*`).limit(100),
    ])
    if (clients.error) throw clients.error
    if (isCodes.error) throw isCodes.error
    const clientIds = (clients.data ?? []).map((r) => String((r as { id: string }).id))
    const isCodeIds = (isCodes.data ?? []).map((r) => String((r as { id: string }).id))
    if (clientIds.length) parts.push(`client_id.in.(${clientIds.join(',')})`)
    if (isCodeIds.length) parts.push(`is_code_id.in.(${isCodeIds.join(',')})`)
    orFilter = parts.join(',')
  }
  let query = supabase.from('bis_stop_marking_cases').select(SELECT_WITH_JOINS, { count: 'exact' })
  if (statusFilter === 'active') query = query.neq('status', 'closed')
  else if (statusFilter === 'closed') query = query.eq('status', 'closed')
  if (noticeFilter !== 'all') query = query.eq('case_type', noticeFilter)
  if (orFilter) query = query.or(orFilter)
  query = query.order('stop_date', { ascending: false }).order('created_at', { ascending: false }).order('id')
  const from = (Math.max(1, page) - 1) * pageSize
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) throw error
  return { rows: (Array.isArray(data) ? data : []) as unknown as StopMarkingRow[], total: count ?? 0 }
}

/** Puts the licence back to the status it had before stop marking, unless another case on it is still open. */
async function restoreProjectStatus(projectId: string | null, previousStatus: string, excludeCaseIds: string[]) {
  if (!projectId) return
  let query = supabase
    .from('bis_stop_marking_cases')
    .select('id', { count: 'exact', head: true })
    .eq('bis_project_id', projectId)
    .in('case_type', HOLDING_TYPES)
    .neq('status', 'closed')
  if (excludeCaseIds.length) query = query.not('id', 'in', `(${excludeCaseIds.join(',')})`)
  const { count, error } = await query
  if (error) throw error
  if ((count ?? 0) > 0) return
  const { error: updateError } = await supabase
    .from('bis_projects')
    .update({ status: previousStatus || 'completed' })
    .eq('id', projectId)
    .eq('status', 'stop_marking')
  if (updateError) throw updateError
}

/** Opens a case for a BIS notice. A notice that prohibits marking also sets the licence's status to Stop Marking. */
export async function createStopMarkingCase(form: StopMarkingAddForm): Promise<{ id: string; letterError: string | null }> {
  let previous = 'completed'
  const holds = noticeHoldsMarking(form.noticeType)
  if (form.bisProjectId && holds) {
    const { data: project, error: projectError } = await supabase
      .from('bis_projects')
      .select('status')
      .eq('id', form.bisProjectId)
      .maybeSingle()
    if (projectError) throw projectError
    const current = String((project as { status?: string | null } | null)?.status ?? '').trim()
    if (current && current !== 'stop_marking') previous = current
    const { count, error: dupError } = await supabase
      .from('bis_stop_marking_cases')
      .select('id', { count: 'exact', head: true })
      .eq('bis_project_id', form.bisProjectId)
      .in('case_type', HOLDING_TYPES)
      .neq('status', 'closed')
    if (dupError) throw dupError
    if ((count ?? 0) > 0) throw new Error('This licence already has an open Stop Marking or Suspension case.')
  }
  const { data, error } = await supabase
    .from('bis_stop_marking_cases')
    .insert({
      client_id: form.clientId,
      is_code_id: form.isCodeId,
      bis_project_id: form.bisProjectId || null,
      cm_l_digits: form.cmLDigits || null,
      project_kind: form.projectKind || null,
      case_type: form.noticeType,
      stop_date: form.stopDate || new Date().toISOString().slice(0, 10),
      reason_type: form.reasonType,
      sample_code: form.sampleCode.trim(),
      sample_qr_code: form.sampleQrCode.trim(),
      previous_project_status: previous,
      created_by: await currentUserId(),
    })
    .select('id')
    .single()
  if (error) throw error
  if (form.bisProjectId && holds) {
    const { error: statusError } = await supabase.from('bis_projects').update({ status: 'stop_marking' }).eq('id', form.bisProjectId)
    if (statusError) throw statusError
  }
  const id = String((data as { id: string }).id)
  let letterError: string | null = null
  if (form.letterFile) {
    try {
      await uploadStopMarkingReport(id, form.letterFile)
    } catch (err) {
      letterError = formatBisApiError(err)
    }
  }
  return { id, letterError }
}

export async function saveStopMarkingCase(id: string, form: StopMarkingCaseForm): Promise<StopMarkingRow> {
  const { data, error } = await supabase
    .from('bis_stop_marking_cases')
    .update({
      stop_date: form.stopDate || new Date().toISOString().slice(0, 10),
      reason_type: form.reasonType,
      sample_code: form.sampleCode.trim(),
      sample_qr_code: form.sampleQrCode.trim(),
      bis_reference: form.bisReference.trim(),
      bis_reason: form.bisReason.trim(),
      bis_deadline: form.bisDeadline || null,
      review_notes: form.reviewNotes.trim(),
      report_review: form.reportReview.trim(),
      reply_draft: form.replyDraft,
      reply_date: form.replyDate || null,
      status: form.status === 'closed' ? 'reviewed' : form.status || 'open',
      notes: form.notes.trim(),
    })
    .eq('id', id)
    .select(SELECT_WITH_JOINS)
    .single()
  if (error) throw error
  return data as unknown as StopMarkingRow
}

/** Marking resumed: closes the case and restores the licence status. */
export async function closeStopMarkingCase(row: StopMarkingRow): Promise<void> {
  const { error } = await supabase
    .from('bis_stop_marking_cases')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) throw error
  if (noticeHoldsMarking(row.case_type)) await restoreProjectStatus(row.bis_project_id, row.previous_project_status, [])
}

export async function deleteStopMarkingCases(rows: StopMarkingRow[]): Promise<void> {
  const ids = rows.map((r) => r.id)
  const paths = rows.flatMap((r) => [r.report_path, r.test_report_path, ...(r.documents ?? []).map((d) => d.path)]).filter((p): p is string => Boolean(p?.trim()))
  const { error } = await supabase.from('bis_stop_marking_cases').delete().in('id', ids)
  if (error) throw error
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  for (const row of rows.filter((r) => r.status !== 'closed' && noticeHoldsMarking(r.case_type))) {
    await restoreProjectStatus(row.bis_project_id, row.previous_project_status, ids)
  }
}

export async function uploadStopMarkingReport(caseId: string, file: File): Promise<StopMarkingRow> {
  const path = `${caseId}/report_${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type || undefined })
  if (uploadError) throw uploadError
  const { data, error } = await supabase
    .from('bis_stop_marking_cases')
    .update({ report_path: path, report_name: file.name })
    .eq('id', caseId)
    .select(SELECT_WITH_JOINS)
    .single()
  if (error) throw error
  return data as unknown as StopMarkingRow
}

export async function clearStopMarkingReport(caseId: string, existingPath: string | null): Promise<StopMarkingRow> {
  if (existingPath?.trim()) await supabase.storage.from(BUCKET).remove([existingPath.trim()])
  const { data, error } = await supabase
    .from('bis_stop_marking_cases')
    .update({ report_path: null, report_name: null })
    .eq('id', caseId)
    .select(SELECT_WITH_JOINS)
    .single()
  if (error) throw error
  return data as unknown as StopMarkingRow
}

export async function openStopMarkingReport(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path.trim(), 60 * 10)
  if (error || !data?.signedUrl) throw error ?? new Error('Could not generate download link.')
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

/** The stored BIS report as a File, so the AI can read it. */
export async function downloadStopMarkingReport(path: string, name: string): Promise<File> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path.trim())
  if (error || !data) throw error ?? new Error('Could not download the report.')
  return new File([data], name || 'report.pdf', { type: data.type || 'application/pdf' })
}

/** Samples for the case's Factory Test Reports (the reports themselves are saved by the generator on the licence). */
export async function saveStopMarkingFtrSamples(id: string, samples: OslSampleRequirementRow[]): Promise<StopMarkingRow> {
  const { data, error } = await supabase
    .from('bis_stop_marking_cases')
    .update({ ftr_samples: samples })
    .eq('id', id)
    .select(SELECT_WITH_JOINS)
    .single()
  if (error) throw error
  return data as unknown as StopMarkingRow
}

/** One case by id (used when the address names a case that is not on the current list page). */
export async function fetchStopMarkingCase(id: string): Promise<StopMarkingRow | null> {
  const { data, error } = await supabase.from('bis_stop_marking_cases').select(SELECT_WITH_JOINS).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as unknown as StopMarkingRow | null) ?? null
}

/** The lab test report BIS sent with the notice (step 2). */
export async function uploadStopMarkingTestReport(caseId: string, file: File, existingPath: string | null): Promise<StopMarkingRow> {
  const path = `${caseId}/testreport_${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type || undefined })
  if (uploadError) throw uploadError
  if (existingPath?.trim()) await supabase.storage.from(BUCKET).remove([existingPath.trim()])
  const { data, error } = await supabase.from('bis_stop_marking_cases').update({ test_report_path: path, test_report_name: file.name }).eq('id', caseId).select(SELECT_WITH_JOINS).single()
  if (error) throw error
  return data as unknown as StopMarkingRow
}

/** Supporting documents for the submission (step 5): add one with a label, or remove one. */
export async function addStopMarkingDocument(caseId: string, current: StopMarkingDocument[], label: string, file: File): Promise<StopMarkingRow> {
  const path = `${caseId}/doc_${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type || undefined })
  if (uploadError) throw uploadError
  const next = [...current, { id: crypto.randomUUID(), label: label.trim() || file.name, name: file.name, path }]
  const { data, error } = await supabase.from('bis_stop_marking_cases').update({ documents: next }).eq('id', caseId).select(SELECT_WITH_JOINS).single()
  if (error) throw error
  return data as unknown as StopMarkingRow
}

export async function removeStopMarkingDocument(caseId: string, current: StopMarkingDocument[], documentId: string): Promise<StopMarkingRow> {
  const doc = current.find((d) => d.id === documentId)
  if (doc?.path) await supabase.storage.from(BUCKET).remove([doc.path])
  const { data, error } = await supabase.from('bis_stop_marking_cases').update({ documents: current.filter((d) => d.id !== documentId) }).eq('id', caseId).select(SELECT_WITH_JOINS).single()
  if (error) throw error
  return data as unknown as StopMarkingRow
}
