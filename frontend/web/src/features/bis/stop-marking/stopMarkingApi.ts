import { supabase } from '@/lib/supabaseClient'
import { currentUserId } from '../shared/bisLookupApi'
import type { StopMarkingAddForm, StopMarkingCaseForm, StopMarkingRow } from './types'

export { formatBisApiError } from '../projects/bisProjectsApi'

const BUCKET = 'bis-stop-marking-files'
const SELECT_WITH_JOINS =
  '*, client:clients(company_name), is_code:is_codes(is_number, title, revision_year, part_no, section_no, standard_prefix)'

async function ensureBucket(): Promise<void> {
  try {
    await supabase.storage.createBucket(BUCKET, { public: false })
  } catch {
    // bucket may already exist
  }
}

const sanitize = (raw: string) => raw.replace(/[,()"\\*%_]/g, ' ').replace(/\s+/g, ' ').trim()

export async function fetchStopMarkingPage({
  search,
  page,
  pageSize,
  showClosed,
}: {
  search: string
  page: number
  pageSize: number
  showClosed: boolean
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
  if (!showClosed) query = query.neq('status', 'closed')
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

/** Adds a licence to Stop Marking: opens a case and marks the licence's status as Stop Marking. */
export async function createStopMarkingCase(form: StopMarkingAddForm): Promise<string> {
  let previous = 'completed'
  if (form.bisProjectId) {
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
      .neq('status', 'closed')
    if (dupError) throw dupError
    if ((count ?? 0) > 0) throw new Error('This licence already has an open Stop Marking case.')
  }
  const { data, error } = await supabase
    .from('bis_stop_marking_cases')
    .insert({
      client_id: form.clientId,
      is_code_id: form.isCodeId,
      bis_project_id: form.bisProjectId || null,
      cm_l_digits: form.cmLDigits || null,
      project_kind: form.projectKind || null,
      stop_date: form.stopDate || new Date().toISOString().slice(0, 10),
      previous_project_status: previous,
      created_by: await currentUserId(),
    })
    .select('id')
    .single()
  if (error) throw error
  if (form.bisProjectId) {
    const { error: statusError } = await supabase.from('bis_projects').update({ status: 'stop_marking' }).eq('id', form.bisProjectId)
    if (statusError) throw statusError
  }
  return String((data as { id: string }).id)
}

export async function saveStopMarkingCase(id: string, form: StopMarkingCaseForm): Promise<StopMarkingRow> {
  const { data, error } = await supabase
    .from('bis_stop_marking_cases')
    .update({
      stop_date: form.stopDate || new Date().toISOString().slice(0, 10),
      bis_reference: form.bisReference.trim(),
      bis_reason: form.bisReason.trim(),
      bis_deadline: form.bisDeadline || null,
      review_notes: form.reviewNotes.trim(),
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
  await restoreProjectStatus(row.bis_project_id, row.previous_project_status, [])
}

export async function deleteStopMarkingCases(rows: StopMarkingRow[]): Promise<void> {
  const ids = rows.map((r) => r.id)
  const paths = rows.map((r) => r.report_path).filter((p): p is string => Boolean(p?.trim()))
  const { error } = await supabase.from('bis_stop_marking_cases').delete().in('id', ids)
  if (error) throw error
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  for (const row of rows.filter((r) => r.status !== 'closed')) {
    await restoreProjectStatus(row.bis_project_id, row.previous_project_status, ids)
  }
}

export async function uploadStopMarkingReport(caseId: string, file: File): Promise<StopMarkingRow> {
  await ensureBucket()
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
