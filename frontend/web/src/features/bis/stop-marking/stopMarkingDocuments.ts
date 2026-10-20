import { PDFDocument } from 'pdf-lib'
import { downloadPdfViaPlaywright, renderPdfViaPlaywright, triggerPdfDownload } from '@/lib/playwrightPdfClient'
import { applyBisDocumentPrintPageSettings, DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS } from '../print/bisDocumentPrintPageSettings'
import { paginateHtmlForDownload } from '../print/bisPreviewPagination'
import { buildFactoryTestReportHtml, factoryTestReportDataFromPrintData } from '../print/factoryTestReportHtml'
import { loadBisPrintData } from '../print/loadBisPrintData'
import { openPendingPrintWindow, openPrintHtml } from '../print/openPrintHtml'
import { buildOslSampleRequirementsHtml, oslSampleRequirementsDataFromPrintData, printableOslSampleRows } from '../print/oslSampleRequirementsHtml'
import { combinePrintHtmlDocuments } from '../print/printBisDocument'
import { loadBisProjectPrintPageSettings } from '../projects/bisPrintPageSettingsApi'
import { buildWordDocx, combineWordHtml } from '../projects/bisWordExport'
import { factoryTestReportHasContent, parseFactoryTestReportPayload } from '../projects/factoryTestReportModel'
import { parseOslSampleRequirementsPayload } from '../projects/oslSampleRequirementsModel'
import type { BisProjectRow } from '../projects/types'
import { buildStopMarkingReplyHtml } from './printStopMarkingReply'
import { downloadStopMarkingReport, openStopMarkingReport } from './stopMarkingApi'
import type { StopMarkingRow } from './types'

export type GeneratedDocKind = 'reply' | 'sample' | 'ftr'

/** One row of the Documents table of step 5: a letter the system generates, or a file that was uploaded. */
export type CaseDocument =
  | { id: string; label: string; kind: 'generated'; gen: GeneratedDocKind; available: boolean; note: string }
  | { id: string; label: string; kind: 'file'; path: string; name: string; available: true; note: string }

const GEN_LABEL: Record<GeneratedDocKind, string> = {
  reply: 'Reply Letter to BIS',
  sample: 'Sample Offer Letter & Test Request',
  ftr: 'Factory Test Report',
}

export function listCaseDocuments(row: StopMarkingRow): CaseDocument[] {
  const mod = row.test_report_module ?? {}
  const osl = parseOslSampleRequirementsPayload((mod.osl ?? null) as Record<string, unknown> | null)
  const hasSamples = printableOslSampleRows(osl.rows).length > 0
  const hasFtr = parseFactoryTestReportPayload((mod.ftr ?? null) as Record<string, unknown> | null).reports.some((r) => factoryTestReportHasContent(r))
  const hasReply = Boolean((row.reply_draft ?? '').trim() || Object.values(row.reply_sections ?? {}).some((v) => String(v ?? '').trim()))
  const docs: CaseDocument[] = []
  if (row.report_path) docs.push({ id: 'letter', label: 'BIS Letter', kind: 'file', path: row.report_path, name: row.report_name || 'BIS Letter.pdf', available: true, note: row.report_name || '' })
  for (const d of row.test_reports ?? []) docs.push({ id: `tr-${d.id}`, label: 'BIS Test Report', kind: 'file', path: d.path, name: d.name, available: true, note: d.name })
  docs.push({ id: 'gen-reply', label: GEN_LABEL.reply, kind: 'generated', gen: 'reply', available: hasReply, note: hasReply ? 'Letter' : 'Not Written Yet' })
  docs.push({ id: 'gen-sample', label: GEN_LABEL.sample, kind: 'generated', gen: 'sample', available: hasSamples, note: hasSamples ? `${printableOslSampleRows(osl.rows).length} Sample${printableOslSampleRows(osl.rows).length > 1 ? 's' : ''}` : 'No Sample Yet' })
  docs.push({ id: 'gen-ftr', label: GEN_LABEL.ftr, kind: 'generated', gen: 'ftr', available: hasFtr, note: hasFtr ? 'Generated' : 'Not Generated Yet' })
  for (const d of row.documents ?? []) docs.push({ id: `doc-${d.id}`, label: d.label || d.name, kind: 'file', path: d.path, name: d.name, available: true, note: d.name })
  return docs
}

/** Letterhead HTML of a generated document, built from this case's own data. */
export async function generatedDocumentHtml(row: StopMarkingRow, bisRow: BisProjectRow | null, gen: GeneratedDocKind): Promise<string> {
  if (gen === 'reply') return buildStopMarkingReplyHtml(row)
  if (!bisRow) throw new Error('The licence of this case could not be loaded.')
  const printData = await loadBisPrintData(bisRow)
  const settings = await loadBisProjectPrintPageSettings(bisRow.id).catch(() => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS)
  const mod = row.test_report_module ?? {}
  if (gen === 'sample') {
    return applyBisDocumentPrintPageSettings(buildOslSampleRequirementsHtml(oslSampleRequirementsDataFromPrintData({ ...printData, modulePayload: (mod.osl ?? {}) as Record<string, unknown> })), settings)
  }
  return applyBisDocumentPrintPageSettings(buildFactoryTestReportHtml(factoryTestReportDataFromPrintData({ ...printData, modulePayload: (mod.ftr ?? {}) as Record<string, unknown> })), settings)
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document'
const baseName = (name: string) => safeName(name.replace(/\.[^.]+$/, ''))

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

/** The HTML to show for these documents (generated ones only; uploaded files open in their own tab). */
export async function previewHtmlFor(row: StopMarkingRow, bisRow: BisProjectRow | null, docs: CaseDocument[]): Promise<string> {
  const gens = docs.filter((d): d is Extract<CaseDocument, { kind: 'generated' }> => d.kind === 'generated')
  const htmls = await Promise.all(gens.map((d) => generatedDocumentHtml(row, bisRow, d.gen)))
  if (!htmls.length) throw new Error('Nothing to preview here: uploaded files open with their own View button.')
  return htmls.length === 1 ? htmls[0]! : combinePrintHtmlDocuments('Selected Documents', htmls)
}

export async function printDocument(row: StopMarkingRow, bisRow: BisProjectRow | null, doc: CaseDocument): Promise<void> {
  if (doc.kind === 'file') return openStopMarkingReport(doc.path)
  const pending = openPendingPrintWindow(`Preparing ${doc.label}…`)
  try {
    const err = openPrintHtml(await generatedDocumentHtml(row, bisRow, doc.gen), { target: pending })
    if (err) throw new Error(err)
  } catch (err) {
    try { pending?.close() } catch { /* ignore */ }
    throw err
  }
}

export async function downloadDocumentPdf(row: StopMarkingRow, bisRow: BisProjectRow | null, doc: CaseDocument): Promise<void> {
  if (doc.kind === 'file') {
    const file = await downloadStopMarkingReport(doc.path, doc.name)
    downloadBlob(file, doc.name)
    return
  }
  await downloadPdfViaPlaywright({ html: await generatedDocumentHtml(row, bisRow, doc.gen), filename: `${safeName(doc.label)}.pdf` })
}

export async function downloadDocumentWord(row: StopMarkingRow, bisRow: BisProjectRow | null, doc: Extract<CaseDocument, { kind: 'generated' }>): Promise<void> {
  const settings = bisRow ? await loadBisProjectPrintPageSettings(bisRow.id).catch(() => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS) : DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS
  const html = await generatedDocumentHtml(row, bisRow, doc.gen)
  const wordHtml = await combineWordHtml(doc.label, [await paginateHtmlForDownload(html)], settings)
  downloadBlob(await buildWordDocx(wordHtml, doc.label, settings), `${safeName(doc.label)}.docx`)
}

/** All selected documents as one PDF: generated letters first-class, uploaded PDFs and images appended in table order. */
export async function downloadSelectedPdf(row: StopMarkingRow, bisRow: BisProjectRow | null, docs: CaseDocument[], filename: string): Promise<void> {
  const merged = await PDFDocument.create()
  for (const doc of docs) {
    if (doc.kind === 'generated') {
      const blob = await renderPdfViaPlaywright({ html: await generatedDocumentHtml(row, bisRow, doc.gen), filename: `${safeName(doc.label)}.pdf` })
      const src = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), { ignoreEncryption: true })
      ;(await merged.copyPages(src, src.getPageIndices())).forEach((p) => merged.addPage(p))
      continue
    }
    const file = await downloadStopMarkingReport(doc.path, doc.name)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const lower = doc.name.toLowerCase()
    if (lower.endsWith('.pdf')) {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
      ;(await merged.copyPages(src, src.getPageIndices())).forEach((p) => merged.addPage(p))
    } else if (/\.(png|jpe?g)$/.test(lower)) {
      const img = lower.endsWith('.png') ? await merged.embedPng(bytes) : await merged.embedJpg(bytes)
      const page = merged.addPage([595.28, 841.89])
      const scale = Math.min((595.28 - 40) / img.width, (841.89 - 40) / img.height, 1)
      page.drawImage(img, { x: (595.28 - img.width * scale) / 2, y: 841.89 - 20 - img.height * scale, width: img.width * scale, height: img.height * scale })
    }
  }
  if (merged.getPageCount() === 0) throw new Error('Nothing to download in the selection.')
  triggerPdfDownload(new Blob([(await merged.save()) as unknown as BlobPart], { type: 'application/pdf' }), filename)
}

/** The selected generated documents as one Word file (uploaded files cannot be converted). */
export async function downloadSelectedWord(row: StopMarkingRow, bisRow: BisProjectRow | null, docs: CaseDocument[], title: string): Promise<number> {
  const gens = docs.filter((d): d is Extract<CaseDocument, { kind: 'generated' }> => d.kind === 'generated')
  if (!gens.length) throw new Error('Word is available for the letters the system generates. Select one of them.')
  const settings = bisRow ? await loadBisProjectPrintPageSettings(bisRow.id).catch(() => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS) : DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS
  const pages = await Promise.all(gens.map(async (d) => paginateHtmlForDownload(await generatedDocumentHtml(row, bisRow, d.gen))))
  downloadBlob(await buildWordDocx(await combineWordHtml(title, pages, settings), title, settings), `${safeName(title)}.docx`)
  return gens.length
}

export { baseName }
