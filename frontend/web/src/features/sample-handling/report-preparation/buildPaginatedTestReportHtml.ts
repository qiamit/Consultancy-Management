import type { TestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'
import { resolvePrintPageSizeMm } from '@/features/settings/lab-settings/printSettingsTypes'
import { buildLiveTestReportHtml, type BuildLiveTestReportHtmlInput } from './buildLiveTestReportHtml'
import { paginateTestReportPreview } from './paginateTestReportPreview'
import {
  buildTestReportSheetLayoutCss,
  buildTestReportSheetPrintCss,
  injectCssIntoHtml,
} from './testReportSheetCss'
import { waitForPrintDocumentReady } from './waitForPrintDocumentReady'
import { inlineDocumentImagesAsDataUrls } from './embedPrintImages'

const CSS_PX_PER_MM = 96 / 25.4

/**
 * Build the same paginated sheet HTML the live preview shows, ready for browser Print / PDF.
 */
export async function buildPaginatedTestReportHtml(
  input: BuildLiveTestReportHtmlInput,
): Promise<string> {
  const continuous = await buildLiveTestReportHtml(input)
  return paginateContinuousTestReportHtml(continuous, input.printSettings)
}

/**
 * Paginate already-built continuous test-report HTML into `.preview-sheet` pages.
 */
export async function paginateContinuousTestReportHtml(
  continuousHtml: string,
  printSettings: TestReportPrintSettings,
): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('Paginated print requires a browser document.')
  }

  const page = resolvePrintPageSizeMm(printSettings)
  const pageW = Math.round(page.width * CSS_PX_PER_MM)
  const pageH = Math.round(page.height * CSS_PX_PER_MM)

  const withLayout = injectCssIntoHtml(continuousHtml, buildTestReportSheetLayoutCss(printSettings))

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = [
    'position:fixed',
    'left:-12000px',
    'top:0',
    `width:${pageW}px`,
    `height:${pageH}px`,
    'border:0',
    'opacity:0',
    'pointer-events:none',
  ].join(';')
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) throw new Error('Unable to open print layout frame.')

    doc.open()
    doc.write(withLayout)
    doc.close()

    await waitForPrintDocumentReady(doc)
    await paginateTestReportPreview(doc, printSettings)
    await inlineDocumentImagesAsDataUrls(doc)

    const printCss = buildTestReportSheetPrintCss(printSettings)
    const styleEl = doc.createElement('style')
    styleEl.setAttribute('data-sheet-print', '1')
    styleEl.textContent = printCss
    doc.head.appendChild(styleEl)

    // Prefer mm sheet size for print engine (paginator set px for measurement).
    doc.querySelectorAll<HTMLElement>('.preview-sheet').forEach((sheet) => {
      sheet.style.width = `${page.width}mm`
      sheet.style.height = `${page.height}mm`
    })

    return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
  } finally {
    try {
      document.body.removeChild(iframe)
    } catch {
      /* ignore */
    }
  }
}
