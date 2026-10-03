import { supabase } from '@/lib/supabaseClient'
import { currentUserId } from '../shared/bisLookupApi'
import type {
  SampleFailureAttachmentKind,
  SampleFailureReplyForm,
  SampleFailureReplyRow,
} from './types'

export type { SampleFailureAttachmentKind } from './types'
export { formatBisApiError } from '../projects/bisProjectsApi'

const BUCKET = 'bis-sample-failure-files'

const SELECT_WITH_JOINS =
  '*, client:clients(company_name), is_code:is_codes(is_number, title, revision_year), bis_project:bis_projects(title, license_number)'

const ATTACHMENT_COLUMNS: Record<
  SampleFailureAttachmentKind,
  { path: keyof SampleFailureReplyRow; name: keyof SampleFailureReplyRow }
> = {
  failure_letter: { path: 'failure_letter_path', name: 'failure_letter_name' },
  offer_letter: { path: 'offer_letter_path', name: 'offer_letter_name' },
  factory_test_report: {
    path: 'factory_test_report_path',
    name: 'factory_test_report_name',
  },
}

async function ensureBucket(): Promise<void> {
  try {
    await supabase.storage.createBucket(BUCKET, { public: false })
  } catch {
    // bucket may already exist
  }
}

const LOOKUP_ID_LIMIT = 100

function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()"\\*%_]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function matchingClientIds(term: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .ilike('company_name', `%${term}%`)
    .limit(LOOKUP_ID_LIMIT)
  if (error) throw error
  return (data ?? []).map((r) => String((r as { id: string }).id))
}

async function matchingIsCodeIds(term: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('is_codes')
    .select('id')
    .or(`is_number.ilike.*${term}*,title.ilike.*${term}*`)
    .limit(LOOKUP_ID_LIMIT)
  if (error) throw error
  return (data ?? []).map((r) => String((r as { id: string }).id))
}

export async function fetchSampleFailureRepliesPage({
  search,
  page,
  pageSize,
}: {
  search: string
  page: number
  pageSize: number
}): Promise<{ rows: SampleFailureReplyRow[]; total: number }> {
  const term = sanitizeSearchTerm(search)

  let orFilter: string | null = null
  if (term) {
    const parts = [
      `sample_code.ilike.*${term}*`,
      `sample_qr_code.ilike.*${term}*`,
      `cm_l_digits.ilike.*${term}*`,
    ]
    const digits = term.replace(/\D/g, '')
    if (digits.length >= 3 && digits !== term) parts.push(`cm_l_digits.ilike.*${digits}*`)
    const [clientIds, isCodeIds] = await Promise.all([
      matchingClientIds(term),
      matchingIsCodeIds(term),
    ])
    if (clientIds.length > 0) parts.push(`client_id.in.(${clientIds.join(',')})`)
    if (isCodeIds.length > 0) parts.push(`is_code_id.in.(${isCodeIds.join(',')})`)
    orFilter = parts.join(',')
  }

  let query = supabase.from('bis_sample_failure_replies').select(SELECT_WITH_JOINS, { count: 'exact' })
  if (orFilter) query = query.or(orFilter)
  query = query.order('created_at', { ascending: false }).order('id', { ascending: true })

  const from = (Math.max(1, page) - 1) * pageSize
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) throw error

  return {
    rows: (Array.isArray(data) ? data : []) as unknown as SampleFailureReplyRow[],
    total: count ?? 0,
  }
}

export async function saveSampleFailureReply(
  form: SampleFailureReplyForm,
  editingId: string | null,
): Promise<void> {
  const payload = {
    client_id: form.clientId,
    is_code_id: form.isCodeId,
    bis_project_id: form.bisProjectId || null,
    cm_l_digits: form.cmLDigits || null,
    project_kind: form.projectKind || null,
    sample_failure_type: form.sampleFailureType,
    sample_code: form.sampleCode.trim(),
    sample_qr_code: form.sampleQrCode.trim(),
    reply_draft: form.replyDraft,
    status: form.status || 'open',
    notes: form.notes.trim(),
  }

  if (editingId) {
    const { error } = await supabase
      .from('bis_sample_failure_replies')
      .update(payload)
      .eq('id', editingId)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('bis_sample_failure_replies')
    .insert({ ...payload, created_by: await currentUserId() })
  if (error) throw error
}

export async function deleteSampleFailureReplies(ids: string[]): Promise<void> {
  const { error } = await supabase.from('bis_sample_failure_replies').delete().in('id', ids)
  if (error) throw error
}

export async function uploadSampleFailureAttachment(
  replyId: string,
  kind: SampleFailureAttachmentKind,
  file: File,
): Promise<SampleFailureReplyRow> {
  await ensureBucket()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${replyId}/${kind}_${crypto.randomUUID()}_${safeName}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  })
  if (upErr) throw upErr

  const cols = ATTACHMENT_COLUMNS[kind]
  const { data, error } = await supabase
    .from('bis_sample_failure_replies')
    .update({ [cols.path]: path, [cols.name]: file.name })
    .eq('id', replyId)
    .select(SELECT_WITH_JOINS)
    .single()
  if (error) throw error
  return data as unknown as SampleFailureReplyRow
}

export async function clearSampleFailureAttachment(
  replyId: string,
  kind: SampleFailureAttachmentKind,
  existingPath: string | null,
): Promise<SampleFailureReplyRow> {
  if (existingPath?.trim()) {
    await supabase.storage.from(BUCKET).remove([existingPath.trim()])
  }
  const cols = ATTACHMENT_COLUMNS[kind]
  const { data, error } = await supabase
    .from('bis_sample_failure_replies')
    .update({ [cols.path]: null, [cols.name]: null })
    .eq('id', replyId)
    .select(SELECT_WITH_JOINS)
    .single()
  if (error) throw error
  return data as unknown as SampleFailureReplyRow
}

export async function openSampleFailureAttachment(path: string): Promise<void> {
  const p = path.trim()
  if (!p) throw new Error('No file path.')
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(p, 60 * 10)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('Could not generate download link.')
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}
