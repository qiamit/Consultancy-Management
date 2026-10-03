import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { resolveNamedLetterheadTemplates } from '@/features/sample-handling/report-preparation/reportScopeConfig'
import { waitForPrintDocumentReady } from '@/features/sample-handling/report-preparation/waitForPrintDocumentReady'
import { fetchLabDocumentTemplates } from '@/features/settings/lab-settings/documentTemplatesConfig'
import type {
  DocumentTemplateKind,
  FinanceDocumentTemplate,
} from '@/features/settings/lab-settings/documentTemplateTypes'
import {
  fetchQuotationBankDetails,
  QUOTATION_LETTER_FOOTER_NAME,
  QUOTATION_LETTER_HEADER_NAME,
} from './buildQuotationDocumentHtml'
import {
  QuotationDocumentView,
  paperHeightMm,
  paperWidthMm,
  type QuotationDocumentAssets,
} from './QuotationDocumentView'
import {
  fetchLabCompanySignContext,
  resolveSignatureSignedUrl,
} from './quotationSignatureStorage'
import type { QuotationRow } from './types'

async function loadAssets(
  template: FinanceDocumentTemplate,
  row: QuotationRow,
): Promise<QuotationDocumentAssets> {
  const headerName = template.headerTemplateName || QUOTATION_LETTER_HEADER_NAME
  const footerName = template.footerTemplateName || QUOTATION_LETTER_FOOTER_NAME
  const [letterhead, bank, companySign, signatureUrl] = await Promise.all([
    resolveNamedLetterheadTemplates(headerName, footerName),
    fetchQuotationBankDetails(),
    fetchLabCompanySignContext(),
    resolveSignatureSignedUrl(row.signature_image_path),
  ])
  return {
    headerUrl: template.showLetterHeader ? letterhead.headerUrl : null,
    footerUrl: template.showLetterFooter ? letterhead.footerUrl : null,
    companyName: companySign.labName,
    sealSignUrl: signatureUrl,
    bank,
  }
}

async function mountQuotationPages(
  rows: QuotationRow[],
  documentKind: DocumentTemplateKind = 'quotation',
): Promise<{
  host: HTMLDivElement
  root: Root
  template: FinanceDocumentTemplate
}> {
  const docs = await fetchLabDocumentTemplates()
  const template = docs[documentKind] ?? docs.quotation
  const assetsList = await Promise.all(rows.map((row) => loadAssets(template, row)))

  const host = document.createElement('div')
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;z-index:-1;background:#fff;pointer-events:none;'
  document.body.appendChild(host)

  const root = createRoot(host)
  root.render(
    createElement(
      'div',
      null,
      ...rows.map((row, i) =>
        createElement(QuotationDocumentView, {
          key: row.id,
          tpl: template,
          row,
          assets: assetsList[i]!,
          forOutput: true,
        }),
      ),
    ),
  )

  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  await waitForPrintDocumentReady(document, 12000)
  const imgs = Array.from(host.querySelectorAll('img'))
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          window.setTimeout(done, 8000)
        }),
    ),
  )
  await new Promise<void>((r) => window.setTimeout(r, 150))

  return { host, root, template }
}

function cleanupMount(host: HTMLDivElement, root: Root) {
  try {
    root.unmount()
  } catch {
    /* ignore */
  }
  try {
    host.remove()
  } catch {
    /* ignore */
  }
}

function collectAppCssText(): string {
  let cssText = ''
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      cssText += Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n')
    } catch {
      /* cross-origin stylesheet — skip */
    }
  }
  return cssText
}

/**
 * Opens the Templates layout in a print frame and triggers the browser print dialog.
 * Choosing "Save as PDF" / "Microsoft Print to PDF" produces a sharp vector PDF
 * (not a screenshot). html2canvas-based PDFs always look image-like.
 */
async function openTemplatePrintDialog(
  rows: QuotationRow[],
  opts?: { documentTitle?: string; documentKind?: DocumentTemplateKind },
): Promise<void> {
  if (rows.length === 0) throw new Error('No document selected to print.')
  const { host, root, template } = await mountQuotationPages(
    rows,
    opts?.documentKind ?? 'quotation',
  )
  const w = paperWidthMm(template)
  const h = paperHeightMm(template)

  const iframe = document.createElement('iframe')
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}mm;height:${h * rows.length}mm;border:0;`
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    cleanupMount(host, root)
    iframe.remove()
    throw new Error('Unable to open print frame')
  }

  const pageSizeCss =
    template.paperSize === 'Letter'
      ? 'letter'
      : template.paperSize === 'Legal'
        ? 'legal'
        : template.paperSize.toLowerCase()
  const title = opts?.documentTitle?.trim() || template.documentTitle || 'Document'

  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>${title.replace(/</g, '')}</title>
<style>${collectAppCssText()}
  @page { size: ${pageSizeCss}${template.pageOrientation === 'landscape' ? ' landscape' : ''}; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${host.innerHTML}</body></html>`)
  doc.close()
  await waitForPrintDocumentReady(doc)
  cleanupMount(host, root)

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

/** Print using the exact same React Templates layout (vector / printer quality). */
export async function printQuotationsWithTemplate(
  rows: QuotationRow[],
  documentKind: DocumentTemplateKind = 'quotation',
): Promise<void> {
  await openTemplatePrintDialog(rows, { documentKind })
}

/**
 * Save PDF via browser print engine (Destination → Save as PDF).
 * This keeps text crisp — unlike html2pdf/html2canvas which rasterizes the page.
 */
export async function downloadQuotationPdfWithTemplate(
  row: QuotationRow,
  filename?: string,
  documentKind: DocumentTemplateKind = 'quotation',
): Promise<void> {
  const title =
    (filename ?? '').replace(/\.pdf$/i, '') || row.quotation_number || documentKind
  await openTemplatePrintDialog([row], { documentTitle: title, documentKind })
}
