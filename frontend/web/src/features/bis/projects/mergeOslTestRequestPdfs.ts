import { PDFDocument } from 'pdf-lib'
import { triggerPdfDownload } from '@/lib/playwrightPdfClient'
import { supabase } from '@/lib/supabaseClient'
import { BIS_PROJECT_FILES_BUCKET } from './bisProjectFilesApi'
import type { OslSampleRequirementRow } from './oslSampleRequirementsModel'

async function downloadBytes(storagePath: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from(BIS_PROJECT_FILES_BUCKET)
    .download(storagePath)
  if (error) throw error
  return new Uint8Array(await data.arrayBuffer())
}

/** Merge Test Request PDFs attached to selected OSL sample rows. */
export async function mergeSelectedOslTestRequestPdfs(
  rows: OslSampleRequirementRow[],
): Promise<Uint8Array> {
  const withFiles = rows.filter((r) => r.testRequestStoragePath.trim())
  if (withFiles.length === 0) {
    throw new Error('Selected samples have no Test Request PDF attached yet.')
  }

  const merged = await PDFDocument.create()
  let added = 0
  for (const row of withFiles) {
    const bytes = await downloadBytes(row.testRequestStoragePath.trim())
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const pages = await merged.copyPages(src, src.getPageIndices())
    for (const page of pages) merged.addPage(page)
    added += pages.length
  }
  if (added === 0) throw new Error('Could not build a merged Test Request PDF.')
  return merged.save()
}

export async function downloadMergedOslTestRequestPdfs(
  rows: OslSampleRequirementRow[],
  filename = 'OSL Test Request.pdf',
): Promise<void> {
  const bytes = await mergeSelectedOslTestRequestPdfs(rows)
  const safeName = filename.trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  const withExt = /\.pdf$/i.test(safeName) ? safeName : `${safeName || 'OSL Test Request'}.pdf`
  triggerPdfDownload(new Blob([bytes], { type: 'application/pdf' }), withExt)
}
