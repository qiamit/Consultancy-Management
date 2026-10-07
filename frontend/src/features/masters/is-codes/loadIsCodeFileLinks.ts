import { supabase } from '@/lib/supabaseClient'

const PRIMARY_BUCKET = 'is-code-files'
/** Legacy / alternate bucket ids seen on Railway DBs. */
const FALLBACK_BUCKETS = ['is_code_documents', 'documents'] as const

export type IsCodeFileLink = {
  file_name: string
  storage_path?: string
  url?: string
  bucket?: string
  error?: string
}

async function resolveFromBucket(
  bucket: string,
  storagePath: string,
): Promise<{ url?: string; error?: string }> {
  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 10)
  if (!signErr && signed?.signedUrl) {
    return { url: signed.signedUrl }
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from(bucket)
    .download(storagePath)
  if (!dlErr && blob) {
    return { url: URL.createObjectURL(blob) }
  }

  return {
    error: signErr?.message || dlErr?.message || 'Could not open file',
  }
}

async function resolveFileUrl(
  storagePath: string,
): Promise<{ url?: string; bucket?: string; error?: string }> {
  const buckets = [PRIMARY_BUCKET, ...FALLBACK_BUCKETS]
  let lastError = ''
  for (const bucket of buckets) {
    try {
      const result = await resolveFromBucket(bucket, storagePath)
      if (result.url) return { url: result.url, bucket }
      if (result.error) lastError = result.error
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Could not open file'
    }
  }
  return { error: lastError || 'File missing in storage' }
}

/**
 * Load IS Code attached files for view dialogs.
 * Never throws — returns [] on missing table/bucket/policy errors.
 */
export async function loadIsCodeFileLinks(isCodeId: string): Promise<IsCodeFileLink[]> {
  const id = isCodeId.trim()
  if (!id) return []

  try {
    const { data: fileRows, error } = await supabase
      .from('is_code_files')
      .select('file_name, storage_path')
      .eq('is_code_id', id)
      .order('created_at', { ascending: false })

    let fileList: Array<{ file_name: string; storage_path: string }> = []
    if (!error && Array.isArray(fileRows) && fileRows.length > 0) {
      fileList = fileRows.map((r) => ({
        file_name: String((r as { file_name?: string }).file_name ?? 'File'),
        storage_path: String((r as { storage_path?: string }).storage_path ?? ''),
      }))
    } else {
      for (const bucket of [PRIMARY_BUCKET, ...FALLBACK_BUCKETS]) {
        const { data: objects, error: listErr } = await supabase.storage
          .from(bucket)
          .list(id, { limit: 50 })
        if (listErr || !Array.isArray(objects) || objects.length === 0) continue
        fileList = objects
          .map((o) => {
            const name = String((o as { name?: string }).name ?? '')
            if (!name || name.endsWith('/')) return null
            return { file_name: name, storage_path: `${id}/${name}` }
          })
          .filter((x): x is { file_name: string; storage_path: string } => x !== null)
        if (fileList.length > 0) break
      }
    }

    const out: IsCodeFileLink[] = []
    for (const f of fileList) {
      if (!f.storage_path) {
        out.push({ file_name: f.file_name, error: 'Missing storage path' })
        continue
      }
      const resolved = await resolveFileUrl(f.storage_path)
      out.push({
        file_name: f.file_name,
        storage_path: f.storage_path,
        url: resolved.url,
        bucket: resolved.bucket,
        error: resolved.url ? undefined : resolved.error,
      })
    }
    return out
  } catch {
    return []
  }
}
