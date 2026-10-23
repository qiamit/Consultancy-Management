import { supabase } from '@/lib/supabaseClient'

// The only IS Code bucket on Railway. (The old fallbacks is_code_documents / documents do not exist, and trying
// them made six failing requests for every file missing from storage.)
const PRIMARY_BUCKET = 'is-code-files'

export const IS_CODE_MISSING_FILE_MESSAGE = 'File missing in storage — upload it again'

/**
 * Which of these storage paths really exist in the IS Code bucket. Folders are listed (a list answers 200 even
 * for a missing file), so files missing from storage are known without a failing sign request.
 * Returns null when the listing itself fails; callers then go on as before.
 */
export async function existingIsCodeStoragePaths(paths: readonly string[]): Promise<Set<string> | null> {
  const folders = new Map<string, string[]>()
  for (const path of paths) {
    const cut = path.lastIndexOf('/')
    const folder = cut > 0 ? path.slice(0, cut) : ''
    folders.set(folder, [...(folders.get(folder) ?? []), path])
  }
  const existing = new Set<string>()
  try {
    for (const folder of folders.keys()) {
      const { data, error } = await supabase.storage.from(PRIMARY_BUCKET).list(folder, { limit: 1000 })
      if (error) return null
      for (const entry of data ?? []) {
        const name = String((entry as { name?: string }).name ?? '')
        if (name) existing.add(folder ? `${folder}/${name}` : name)
      }
    }
  } catch {
    return null
  }
  return existing
}

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
  // Signing fails only when the file is not in storage; a download would fail the same way.
  return { error: /not found/i.test(signErr?.message ?? '') ? IS_CODE_MISSING_FILE_MESSAGE : signErr?.message || 'Could not open file' }
}

async function resolveFileUrl(
  storagePath: string,
): Promise<{ url?: string; bucket?: string; error?: string }> {
  const buckets = [PRIMARY_BUCKET]
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
      for (const bucket of [PRIMARY_BUCKET]) {
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

    const existing = await existingIsCodeStoragePaths(fileList.map((f) => f.storage_path).filter(Boolean))
    const out: IsCodeFileLink[] = []
    for (const f of fileList) {
      if (!f.storage_path) {
        out.push({ file_name: f.file_name, error: 'Missing storage path' })
        continue
      }
      if (existing && !existing.has(f.storage_path)) {
        out.push({ file_name: f.file_name, storage_path: f.storage_path, error: IS_CODE_MISSING_FILE_MESSAGE })
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
