import { fetchTestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import type { TestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'
import { paginateContinuousTestReportHtml } from './buildPaginatedTestReportHtml'
import { printHtmlDocument } from './buildScopedTestReportPrintHtml'

export type OutputTestReportDocumentOptions = {
  /**
   * When true (default), continuous HTML is paginated into `.preview-sheet` pages
   * so Print/PDF match the live preview. Pass false only for pre-paginated HTML.
   */
  paginateSheets?: boolean
  /** Prefer caller settings (e.g. prepare dialog) over re-fetched lab settings for pagination. */
  printSettings?: TestReportPrintSettings
}

/** Opens print dialog or downloads PDF per Lab Settings → Print tab. */
export async function outputTestReportDocument(
  html: string,
  filenameBase: string,
  options?: OutputTestReportDocumentOptions,
): Promise<void> {
  const settings = options?.printSettings ?? (await fetchTestReportPrintSettings())
  const shouldPaginate =
    options?.paginateSheets !== false && !html.includes('preview-sheets')

  const outHtml = shouldPaginate
    ? await paginateContinuousTestReportHtml(html, settings)
    : html

  if (settings.pdfOutputMode === 'playwright') {
    const { downloadHtmlAsPdf } = await import('./downloadHtmlAsPdf')
    const safeName = filenameBase.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'test-report'
    await downloadHtmlAsPdf(outHtml, `${safeName}.pdf`, settings.pageSize, undefined, undefined, {
      orientation: settings.pageOrientation,
      applyOuterMargins: false,
    })
    return
  }

  await printHtmlDocument(outHtml)
}
