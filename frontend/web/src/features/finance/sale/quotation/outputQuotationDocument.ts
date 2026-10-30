import { waitForPrintDocumentReady } from '@/features/sample-handling/report-preparation/waitForPrintDocumentReady'
import {
  type BookDocumentKind,
  type FinanceDocumentTemplate,
} from '@/features/settings/lab-settings/documentTemplateTypes'
import {
  downloadPdfViaPlaywright,
  mapPageSizeToPlaywrightFormat,
} from '@/lib/playwrightPdfClient'
import { prepareQuotationDocumentHtml } from './buildQuotationDocumentHtml'
import type { QuotationRow } from './types'

/**
 * Prints the exact HTML the PDF download renders (same builder, same CSS) from a hidden frame, so Print and PDF
 * always agree. Choosing "Save as PDF" gives a sharp vector PDF.
 */
async function openTemplatePrintDialog(
  rows: QuotationRow[],
  opts?: { documentTitle?: string; documentKind?: BookDocumentKind },
): Promise<void> {
  if (rows.length === 0) throw new Error('No document selected to print.')
  const prepared = await prepareQuotationDocumentHtml(rows, opts?.documentKind ?? 'quotation')
  const title = (opts?.documentTitle?.trim() || '').replace(/</g, '')
  const html = title
    ? prepared.html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    : prepared.html

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:1400px;border:0;'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    throw new Error('Unable to open print frame')
  }

  doc.open()
  doc.write(html)
  doc.close()
  await (doc.fonts?.ready ?? Promise.resolve())
  await waitForPrintDocumentReady(doc)

  try {
    win.focus()
    win.print()
  } finally {
    window.setTimeout(() => {
      try {
        iframe.remove()
      } catch {
        /* ignore */
      }
    }, 1500)
  }
}

/** Print using the same HTML as the PDF download (vector / printer quality). */
export async function printQuotationsWithTemplate(
  rows: QuotationRow[],
  documentKind: BookDocumentKind = 'quotation',
): Promise<void> {
  await openTemplatePrintDialog(rows, { documentKind })
}

/** Read-only HTML for the in-app Preview dialog (not the edit form). */
export async function previewQuotationsWithTemplate(
  rows: QuotationRow[],
  documentKind: BookDocumentKind = 'quotation',
  templateOverride?: FinanceDocumentTemplate,
): Promise<{ html: string; title: string }> {
  if (rows.length === 0) throw new Error('No document selected to preview.')
  const prepared = await prepareQuotationDocumentHtml(rows, documentKind, templateOverride)
  const title =
    rows.length === 1
      ? `${prepared.template.documentTitle || 'Document'} ${rows[0]?.quotation_number ?? ''}`.trim()
      : prepared.template.documentTitle || 'Documents'
  return { html: prepared.html, title: title || 'Preview' }
}

/**
 * Download a real PDF via the Playwright PDF service (does not open the print dialog).
 * HTML uses the same Lab Templates layout as print / email.
 */
export async function downloadQuotationPdfWithTemplate(
  row: QuotationRow,
  filename?: string,
  documentKind: BookDocumentKind = 'quotation',
): Promise<void> {
  const prepared = await prepareQuotationDocumentHtml([row], documentKind)
  const base =
    (filename ?? '').replace(/\.pdf$/i, '').trim() ||
    row.quotation_number.trim() ||
    prepared.template.documentTitle.trim() ||
    documentKind
  await downloadPdfViaPlaywright({
    html: prepared.html,
    filename: `${base}.pdf`,
    format: mapPageSizeToPlaywrightFormat(prepared.template.paperSize),
    landscape: prepared.template.pageOrientation === 'landscape',
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  })
}
