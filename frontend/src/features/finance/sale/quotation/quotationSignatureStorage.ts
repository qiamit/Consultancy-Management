import type { DocumentTemplateKind } from '@/features/settings/lab-settings/documentTemplateTypes'
import { supabase } from '@/lib/supabaseClient'

export const QUOTATION_SIGNATURE_BUCKET = 'quotation-signatures'
export const LAB_FILES_BUCKET = 'laboratory-files'

/** Lab Seal & Sign uploads use pathPrefix "company" under laboratory-files. */
export function isLabSealStoragePath(path: string): boolean {
  const p = path.trim()
  if (!p) return false
  return (
    p.startsWith('company/') ||
    p.startsWith('letterheads/') ||
    p.startsWith(`${LAB_FILES_BUCKET}:`)
  )
}

function normalizeStoragePath(path: string): { bucket: string; objectPath: string } {
  const raw = path.trim()
  if (raw.startsWith(`${LAB_FILES_BUCKET}:`)) {
    return { bucket: LAB_FILES_BUCKET, objectPath: raw.slice(LAB_FILES_BUCKET.length + 1) }
  }
  if (isLabSealStoragePath(raw)) {
    return { bucket: LAB_FILES_BUCKET, objectPath: raw }
  }
  return { bucket: QUOTATION_SIGNATURE_BUCKET, objectPath: raw }
}

export async function resolveSignatureSignedUrl(path: string | null | undefined): Promise<string | null> {
  const p = String(path ?? '').trim()
  if (!p) return null
  if (/^https?:\/\//i.test(p)) return p

  const { bucket, objectPath } = normalizeStoragePath(p)
  const primary = await supabase.storage.from(bucket).createSignedUrl(objectPath, 60 * 60)
  if (!primary.error && primary.data?.signedUrl) return primary.data.signedUrl

  // Fallback: try the other bucket (older rows / mixed paths)
  const other = bucket === QUOTATION_SIGNATURE_BUCKET ? LAB_FILES_BUCKET : QUOTATION_SIGNATURE_BUCKET
  const fallback = await supabase.storage.from(other).createSignedUrl(objectPath, 60 * 60)
  if (!fallback.error && fallback.data?.signedUrl) return fallback.data.signedUrl
  return null
}

export async function downloadSignatureObject(path: string): Promise<Blob> {
  const { bucket, objectPath } = normalizeStoragePath(path)
  const primary = await supabase.storage.from(bucket).download(objectPath)
  if (!primary.error && primary.data) return primary.data

  const other = bucket === QUOTATION_SIGNATURE_BUCKET ? LAB_FILES_BUCKET : QUOTATION_SIGNATURE_BUCKET
  const fallback = await supabase.storage.from(other).download(objectPath)
  if (fallback.error || !fallback.data) {
    throw fallback.error ?? primary.error ?? new Error('Unable to download signature image')
  }
  return fallback.data
}

/** Only delete objects owned by quotation-signatures (never delete lab Seal & Sign). */
export async function removeQuotationOwnedSignature(path: string): Promise<void> {
  const p = path.trim()
  if (!p || isLabSealStoragePath(p)) return
  await supabase.storage.from(QUOTATION_SIGNATURE_BUCKET).remove([p])
}

export async function fetchDefaultLabSealSignPath(): Promise<string> {
  const ctx = await fetchLabCompanySignContext()
  return ctx.sealSignPath
}

export type SaleDocumentSignatureDefault = {
  signatureText: string
  signatureImagePath: string
}

export async function fetchDefaultSignatureForKind(
  documentKind: DocumentTemplateKind,
): Promise<SaleDocumentSignatureDefault> {
  const { data, error } = await supabase
    .from('sale_document_signature_defaults')
    .select('signature_text, signature_image_path')
    .eq('document_kind', documentKind)
    .maybeSingle()
  if (error) throw error
  const row = data as { signature_text?: string | null; signature_image_path?: string | null } | null
  const signatureText = String(row?.signature_text ?? '').trim()
  const signatureImagePath = String(row?.signature_image_path ?? '').trim()
  if (signatureText || signatureImagePath) {
    return { signatureText, signatureImagePath }
  }
  const labPath = await fetchDefaultLabSealSignPath().catch(() => '')
  return { signatureText: '', signatureImagePath: labPath }
}

export async function saveDefaultSignatureForKind(
  documentKind: DocumentTemplateKind,
  signatureText: string,
  signatureImagePath: string,
): Promise<void> {
  const { error } = await supabase.from('sale_document_signature_defaults').upsert(
    {
      document_kind: documentKind,
      signature_text: signatureText.trim(),
      signature_image_path: signatureImagePath.trim(),
    },
    { onConflict: 'document_kind' },
  )
  if (error) throw error
}

/** Lab company name + Seal & Sign storage path from Lab Settings. */
export async function fetchLabCompanySignContext(): Promise<{
  labName: string
  sealSignPath: string
}> {
  const { data, error } = await supabase
    .from('lab_settings')
    .select('lab_name, seal_sign_path')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return { labName: '', sealSignPath: '' }
  const row = data as { lab_name?: string | null; seal_sign_path?: string | null }
  return {
    labName: String(row.lab_name ?? '').trim(),
    sealSignPath: String(row.seal_sign_path ?? '').trim(),
  }
}
