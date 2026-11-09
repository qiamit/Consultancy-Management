import { supabase } from '@/lib/supabaseClient'
import { BIS_PROJECT_FILES_BUCKET } from './bisProjectFilesApi'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import type { BisPrintDocumentKind } from '../print/printBisDocument'

/**
 * Module data (Technical Staff photos and qualification documents, Top Management signatures …) points at its files by
 * storage path ("<project id>/<doc kind>/<uuid>_<name>") and file id. Importing a module from another Application /
 * License copied only that data, so the files stayed the other project's: deleted or replaced there, the link broke,
 * and the Manak extension found no file to upload. This gives the project its own copy of every such file and points
 * the data at it.
 */

type FileRow = { id: string; file_name: string; storage_path: string; file_size: number | null; mime_type: string | null; doc_kind: string }

/** Every "…StoragePath" value in the data that is not in this project's own folder. */
function foreignPaths(value: unknown, projectId: string, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => foreignPaths(v, projectId, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/StoragePath$/.test(k) && typeof v === 'string' && v.trim() && !v.startsWith(`${projectId}/`)) out.add(v.trim())
      else foreignPaths(v, projectId, out)
    }
  }
  return out
}

/** The data with each moved path (and its "…FileId" next to it) replaced. */
function rewrite(value: unknown, moved: Map<string, { path: string; id: string }>): unknown {
  if (Array.isArray(value)) return value.map((v) => rewrite(v, moved))
  if (!value || typeof value !== 'object') return value
  const obj = { ...(value as Record<string, unknown>) }
  for (const [k, v] of Object.entries(obj)) {
    if (/StoragePath$/.test(k) && typeof v === 'string' && moved.has(v.trim())) {
      const to = moved.get(v.trim())!
      obj[k] = to.path
      const idKey = k.replace(/StoragePath$/, 'FileId')
      if (idKey in obj) obj[idKey] = to.id
    } else if (v && typeof v === 'object') obj[k] = rewrite(v, moved)
  }
  return obj
}

async function copyToProject(path: string, projectId: string): Promise<{ path: string; id: string }> {
  const { data: rows } = await supabase
    .from('bis_project_files')
    .select('id, file_name, storage_path, file_size, mime_type, doc_kind')
    .eq('storage_path', path)
    .limit(1)
  const source = ((rows ?? []) as FileRow[])[0]
  const { data: blob, error: dlErr } = await supabase.storage.from(BIS_PROJECT_FILES_BUCKET).download(path)
  if (dlErr || !blob) throw new Error('missing')
  const stored = path.split('/').pop() || 'file'
  const fileName = source?.file_name || stored.replace(/^[0-9a-f-]{36}_/i, '')
  const docKind = source?.doc_kind || path.split('/')[1] || 'legal'
  const safeName = stored.replace(/^[0-9a-f-]{36}_/i, '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'file'
  const newPath = `${projectId}/${docKind}/${crypto.randomUUID()}_${safeName}`
  const contentType = source?.mime_type?.trim() || blob.type || 'application/octet-stream'
  const { error: upErr } = await supabase.storage.from(BIS_PROJECT_FILES_BUCKET).upload(newPath, blob, { upsert: false, contentType })
  if (upErr) throw upErr
  const { data: inserted, error: metaErr } = await supabase
    .from('bis_project_files')
    .insert({ bis_project_id: projectId, doc_kind: docKind, file_name: fileName, storage_path: newPath, file_size: source?.file_size ?? blob.size, mime_type: contentType })
    .select('id')
    .single()
  if (metaErr) throw metaErr
  return { path: newPath, id: String((inserted as { id: string }).id) }
}

/**
 * Gives the project its own copy of every file its module data borrows from another project. Returns how many files
 * were copied and the names of those that no longer exist anywhere (to attach again).
 */
export async function relinkModuleFiles(projectId: string, kind: BisPrintDocumentKind): Promise<{ copied: number; missing: string[] }> {
  const payload = await fetchBisModulePayload(projectId, kind)
  if (!payload) return { copied: 0, missing: [] }
  const paths = [...foreignPaths(payload, projectId)]
  if (!paths.length) return { copied: 0, missing: [] }
  const moved = new Map<string, { path: string; id: string }>()
  const missing: string[] = []
  for (const path of paths) {
    try {
      moved.set(path, await copyToProject(path, projectId))
    } catch {
      missing.push((path.split('/').pop() || path).replace(/^[0-9a-f-]{36}_/i, ''))
    }
  }
  if (moved.size) await saveBisModulePayload(projectId, kind, rewrite(payload, moved) as Record<string, unknown>)
  return { copied: moved.size, missing }
}
