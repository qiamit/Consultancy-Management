import { supabase } from '@/lib/supabaseClient'

export const BIS_PROJECT_FILES_BUCKET = 'bis-project-files'

/** Storage `doc_kind` slug for module files (legacy + print-kind slugs). */
export type BisProjectDocKind = string

/** Application Details also reads legacy license/branch uploads. */
export function docKindsForList(docKind: BisProjectDocKind): BisProjectDocKind[] {
  if (docKind === 'application') return ['application', 'license', 'branch']
  return [docKind]
}

export type BisProjectFileRow = {
  id: string
  bis_project_id: string
  doc_kind: string
  file_name: string
  storage_path: string
  file_size: number | null
  mime_type: string | null
  created_at: string
}

export type BisProjectViewFile = {
  id: string
  file_name: string
  storage_path: string
  viewUrl?: string
  downloadUrl?: string
  error?: string
}

function formatApiError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message?: unknown }).message ?? '').trim()
    if (msg) return msg
  }
  return 'Something went wrong'
}

function assertUploadable(file: File) {
  const maxBytes = 25 * 1024 * 1024
  if (file.size <= 0) throw new Error(`Empty file: ${file.name}`)
  if (file.size > maxBytes) throw new Error(`File too large (max 25 MB): ${file.name}`)
}

function contentType(file: File): string {
  if (file.type.trim()) return file.type
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (lower.endsWith('.xlsx'))
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  return 'application/octet-stream'
}

async function signedUrl(
  storagePath: string,
  opts?: { download?: string | boolean },
): Promise<string | undefined> {
  const { data, error } = await supabase.storage
    .from(BIS_PROJECT_FILES_BUCKET)
    .createSignedUrl(
      storagePath,
      60 * 10,
      opts?.download != null ? { download: opts.download } : undefined,
    )
  if (error) throw error
  return data.signedUrl
}

export async function listBisProjectFiles(
  projectId: string,
  docKind: BisProjectDocKind = 'legal',
): Promise<BisProjectViewFile[]> {
  const kinds = docKindsForList(docKind)
  let query = supabase
    .from('bis_project_files')
    .select('id, file_name, storage_path')
    .eq('bis_project_id', projectId)
    .order('created_at', { ascending: false })
  query = kinds.length === 1 ? query.eq('doc_kind', kinds[0]) : query.in('doc_kind', kinds)
  const { data, error } = await query
  if (error) throw new Error(formatApiError(error))

  const rows = (Array.isArray(data) ? data : []) as Array<{
    id: string
    file_name: string
    storage_path: string
  }>

  return Promise.all(
    rows.map(async (row) => {
      try {
        const [viewUrl, downloadUrl] = await Promise.all([
          signedUrl(row.storage_path),
          signedUrl(row.storage_path, { download: row.file_name }),
        ])
        return {
          id: row.id,
          file_name: row.file_name,
          storage_path: row.storage_path,
          viewUrl,
          downloadUrl,
        }
      } catch (err) {
        return {
          id: row.id,
          file_name: row.file_name,
          storage_path: row.storage_path,
          error: formatApiError(err),
        }
      }
    }),
  )
}

export async function createBisProjectFileUrls(
  storagePath: string,
  fileName: string,
): Promise<{ viewUrl?: string; downloadUrl?: string }> {
  const path = storagePath.trim()
  if (!path) return {}
  const [viewUrl, downloadUrl] = await Promise.all([
    signedUrl(path),
    signedUrl(path, { download: fileName.trim() || true }),
  ])
  return { viewUrl, downloadUrl }
}

/** Upload one file and return metadata + signed URLs. */
export async function uploadBisProjectFile(
  projectId: string,
  file: File,
  docKind: BisProjectDocKind = 'legal',
  options?: { displayName?: string },
): Promise<BisProjectViewFile> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
  if (sessionErr) throw sessionErr
  if (!sessionData.session?.access_token) {
    throw new Error('Your session expired. Please sign in again, then retry the file upload.')
  }

  const displayName = (options?.displayName ?? '').trim() || file.name.trim()
  if (!displayName) {
    throw new Error('Document name is required before uploading.')
  }

  assertUploadable(file)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${projectId}/${docKind}/${crypto.randomUUID()}_${safeName}`
  const { error: upErr } = await supabase.storage.from(BIS_PROJECT_FILES_BUCKET).upload(path, file, {
    upsert: false,
    contentType: contentType(file),
  })
  if (upErr) {
    const msg = upErr.message || 'Upload failed'
    if (/failed to fetch/i.test(msg)) {
      throw new Error(
        'File upload blocked by network/CORS. Refresh the page and try again.',
      )
    }
    if (/bucket/i.test(msg)) {
      throw new Error(
        `Storage bucket missing. Apply migration for bucket: ${BIS_PROJECT_FILES_BUCKET}`,
      )
    }
    throw upErr
  }

  const { data: inserted, error: metaErr } = await supabase
    .from('bis_project_files')
    .insert({
      bis_project_id: projectId,
      doc_kind: docKind,
      file_name: displayName,
      storage_path: path,
      file_size: file.size,
      mime_type: contentType(file),
    })
    .select('id, file_name, storage_path')
    .single()
  if (metaErr) throw new Error(formatApiError(metaErr))

  const row = inserted as { id: string; file_name: string; storage_path: string }
  try {
    const urls = await createBisProjectFileUrls(row.storage_path, row.file_name)
    return {
      id: row.id,
      file_name: row.file_name,
      storage_path: row.storage_path,
      ...urls,
    }
  } catch (err) {
    return {
      id: row.id,
      file_name: row.file_name,
      storage_path: row.storage_path,
      error: formatApiError(err),
    }
  }
}

export async function uploadBisProjectFiles(
  projectId: string,
  files: File[],
  docKind: BisProjectDocKind = 'legal',
  options?: { displayName?: string },
): Promise<void> {
  for (const file of files) {
    await uploadBisProjectFile(projectId, file, docKind, options)
  }
}

export async function updateBisProjectFileName(id: string, fileName: string): Promise<void> {
  const name = fileName.trim()
  if (!name) throw new Error('Document name is required.')
  const { error } = await supabase.from('bis_project_files').update({ file_name: name }).eq('id', id)
  if (error) throw new Error(formatApiError(error))
}

export async function deleteBisProjectFile(file: BisProjectViewFile): Promise<void> {
  // Delete DB row first so the UI list clears even if storage object is already gone.
  const { error: dbErr } = await supabase.from('bis_project_files').delete().eq('id', file.id)
  if (dbErr) throw new Error(formatApiError(dbErr))

  if (file.storage_path.trim()) {
    const { error: storageErr } = await supabase.storage
      .from(BIS_PROJECT_FILES_BUCKET)
      .remove([file.storage_path])
    // Ignore missing-object errors; row is already removed.
    if (storageErr && !/not found|no such|404/i.test(storageErr.message ?? '')) {
      throw new Error(formatApiError(storageErr))
    }
  }
}

export { formatApiError as formatBisProjectFilesError }
