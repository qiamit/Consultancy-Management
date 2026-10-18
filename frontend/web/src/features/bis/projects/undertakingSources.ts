import { supabase } from '@/lib/supabaseClient'
import { CERT_BUCKET, listClientCertificates } from '@/features/masters/clients/clientsApi'
import { BIS_PROJECT_FILES_BUCKET } from './bisProjectFilesApi'
import { loadCmpf311MasterData, downloadCmpf311MasterFile, type Cmpf311MasterFileOption } from './cmpf311Model'
import type { BisProjectRow } from './types'

export type UndertakingSource = Cmpf311MasterFileOption & { origin: 'master' | 'application' | 'client' }

export async function loadUndertakingSources(row: BisProjectRow, includeApplication: boolean): Promise<{ files: UndertakingSource[]; error: string }> {
  const results = await Promise.allSettled([
    loadCmpf311MasterData(row.is_code_id ?? ''),
    includeApplication ? supabase.from('bis_project_files').select('id,file_name,storage_path,mime_type,doc_kind').eq('bis_project_id', row.id).then((result) => {
      if (result.error) throw new Error(result.error.message)
      return result.data
    }) : Promise.resolve([]),
    includeApplication && row.client_id ? listClientCertificates(row.client_id) : Promise.resolve([]),
  ])
  const files: UndertakingSource[] = []
  const errors: string[] = []
  const [master, application, client] = results
  if (master.status === 'fulfilled') files.push(...master.value.availableFiles.filter((file) => /\.pdf$/i.test(file.fileName) || /\.pdf$/i.test(file.storagePath)).map((file) => ({ ...file, id: `master:${file.id}`, origin: 'master' as const })))
  else errors.push(`IS Code sources: ${master.reason instanceof Error ? master.reason.message : 'Could not load source PDFs.'}`)
  if (application.status === 'fulfilled') files.push(...application.value.filter((file) => file.mime_type === 'application/pdf' || /\.pdf$/i.test(file.file_name) || /\.pdf$/i.test(file.storage_path)).map((file) => ({ id: `application:${file.id}`, fileName: file.file_name, storagePath: file.storage_path, documentKind: `Application · ${file.doc_kind}`, origin: 'application' as const })))
  else errors.push(`Application sources: ${application.reason instanceof Error ? application.reason.message : 'Could not load source PDFs.'}`)
  if (client.status === 'fulfilled') files.push(...client.value.filter((file) => file.mime_type === 'application/pdf' || /\.pdf$/i.test(file.file_name) || /\.pdf$/i.test(file.storage_path)).map((file) => ({ id: `client:${file.id}`, fileName: file.file_name, storagePath: file.storage_path, documentKind: `Application · ${file.cert_name}`, origin: 'client' as const })))
  else errors.push(`Client document sources: ${client.reason instanceof Error ? client.reason.message : 'Could not load source PDFs.'}`)
  // Duplicate metadata rows can point to the same stored PDF.
  return { files: files.filter((file, index) => files.findIndex((other) => other.origin === file.origin && other.storagePath === file.storagePath) === index), error: errors.join('\n') }
}

export async function downloadUndertakingSource(source: UndertakingSource): Promise<File> {
  const label = /\.pdf$/i.test(source.fileName) ? source.fileName : `${source.fileName}.pdf`
  if (source.origin === 'master') {
    const file = await downloadCmpf311MasterFile({ ...source, fileName: label })
    return new File([file], label, { type: 'application/pdf' })
  }
  const { data, error } = await supabase.storage.from(source.origin === 'client' ? CERT_BUCKET : BIS_PROJECT_FILES_BUCKET).download(source.storagePath)
  if (error || !data) throw new Error(`Could not read ${source.fileName}: ${error?.message || 'File unavailable.'}`)
  return new File([data], label, { type: 'application/pdf' })
}
