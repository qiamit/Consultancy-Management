/** One BIS document as a PDF, the same way the Documents dialog's PDF button builds it. */
import { mapPageSizeToPlaywrightFormat, renderPdfViaPlaywright } from '@/lib/playwrightPdfClient'
import { applyBisDocumentPrintPageSettings, type BisDocumentPrintPageSettings } from '../print/bisDocumentPrintPageSettings'
import { paginateHtmlForDownload } from '../print/bisPreviewPagination'
import {
  BIS_HYBRID_FILE_VIEW_KINDS,
  BIS_MERGE_PDF_MODULE_KINDS,
  BIS_PRINT_DOCUMENT_LABEL,
  buildBisDocumentHtml,
  printKindToStorageDocKind,
  type BisPrintDocumentKind,
} from '../print/printBisDocument'
import { buildApplicationDetailsPackPdf } from './buildApplicationDetailsPackPdf'
import { buildMergedBisProjectFilesPdf } from './mergeBisProjectFilesPdf'
import { formatCmL, type BisProjectRow } from './types'

export function safeFileBase(label: string, cmL: string): string {
  const raw = [label, cmL]
    .map((part) => part.trim())
    .filter((part) => part && !/^[-‒-―]+$/.test(part))
    .join('-')
  return raw
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'document'
}

export function pdfBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'application/pdf' })
}

export const isMergePdfModuleKind = (kind: BisPrintDocumentKind): boolean =>
  (BIS_MERGE_PDF_MODULE_KINDS as readonly string[]).includes(kind)

export const isHybridFileViewKind = (kind: BisPrintDocumentKind): boolean =>
  (BIS_HYBRID_FILE_VIEW_KINDS as readonly string[]).includes(kind)

/**
 * Application Details → its pack; merge / hybrid kinds → their attached files when there are any;
 * everything else → generated HTML with the project's page settings, rendered by the PDF service.
 */
export async function buildBisDocumentPdfBlob(
  row: BisProjectRow,
  kind: BisPrintDocumentKind,
  settings: BisDocumentPrintPageSettings,
): Promise<Blob> {
  const cmL = formatCmL(row.cm_l_digits)
  if (kind === 'application-details') {
    const html = await buildBisDocumentHtml(row, kind)
    return buildApplicationDetailsPackPdf(html, row.id, row.client_id, settings, `${safeFileBase(BIS_PRINT_DOCUMENT_LABEL[kind], cmL)}.pdf`)
  }

  if (isMergePdfModuleKind(kind) || isHybridFileViewKind(kind)) {
    const attached = await buildMergedBisProjectFilesPdf(row.id, [printKindToStorageDocKind(kind)], { strict: true })
    if (attached) return pdfBlob(attached)
    if (isMergePdfModuleKind(kind)) {
      throw new Error(`No attached files found for ${BIS_PRINT_DOCUMENT_LABEL[kind]}.`)
    }
  }

  // Same page breaks as the preview.
  const html = await paginateHtmlForDownload(applyBisDocumentPrintPageSettings(await buildBisDocumentHtml(row, kind), settings))
  return renderPdfViaPlaywright({
    html,
    filename: `${safeFileBase(BIS_PRINT_DOCUMENT_LABEL[kind], cmL)}.pdf`,
    format: mapPageSizeToPlaywrightFormat(settings.pageSize),
    landscape: settings.orientation === 'landscape',
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  })
}
