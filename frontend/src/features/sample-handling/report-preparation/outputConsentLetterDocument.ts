import { fetchTestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import { printHtmlDocument } from './buildScopedTestReportPrintHtml'

/** Opens print dialog or downloads PDF per Lab Settings → Print tab. */
export async function outputConsentLetterDocument(
  html: string,
  filenameBase: string,
): Promise<void> {
  const settings = await fetchTestReportPrintSettings()

  if (settings.pdfOutputMode === 'playwright') {
    const { downloadHtmlAsPdf } = await import('./downloadHtmlAsPdf')
    const safeName = filenameBase.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'consent-letter'
    // Consent HTML already has @page margins — do not double them in Playwright.
    await downloadHtmlAsPdf(html, `${safeName}.pdf`, settings.pageSize, undefined, undefined, {
      orientation: settings.pageOrientation,
      applyOuterMargins: false,
    })
    return
  }

  await printHtmlDocument(html)
}
