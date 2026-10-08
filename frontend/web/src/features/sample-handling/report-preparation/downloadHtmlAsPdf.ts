import type { PrintPageSize } from '@/features/settings/lab-settings/printSettingsTypes'
import type { PrintPageMarginsMm } from './buildPrintStylesCss'
import {
  downloadPdfViaPlaywright,
  mapPageSizeToPlaywrightFormat,
  renderPdfViaPlaywright,
} from '@/lib/playwrightPdfClient'

/**
 * Download HTML as PDF via Playwright (Chromium) — same visual engine as Chrome Print.
 *
 * Default: Playwright outer margins are 0. Letterhead / report HTML already defines
 * `@page { margin: … }` (or sheet padding). Passing applyOuterMargins: true re-adds
 * a second margin layer and shifts layout vs browser print / preview.
 */
export async function downloadHtmlAsPdf(
  html: string,
  filename: string,
  pageSize: PrintPageSize,
  marginsMm?: PrintPageMarginsMm,
  _pagebreakMode?: Array<'css' | 'legacy' | 'avoid-all'>,
  options?: {
    orientation?: 'portrait' | 'landscape'
    qualityScale?: number
    /** When true, apply Playwright margins (rare). Default false — use CSS @page. */
    applyOuterMargins?: boolean
    pageWidthMm?: number
    pageHeightMm?: number
    captureSelector?: string
  },
): Promise<void> {
  const applyOuter = options?.applyOuterMargins === true
  const m = applyOuter
    ? (marginsMm ?? { top: 12, right: 12, bottom: 12, left: 12 })
    : { top: 0, right: 0, bottom: 0, left: 0 }

  const pdfRequest = {
    html,
    filename,
    format: mapPageSizeToPlaywrightFormat(pageSize),
    landscape: options?.orientation === 'landscape',
    margin: {
      top: `${m.top}mm`,
      right: `${m.right}mm`,
      bottom: `${m.bottom}mm`,
      left: `${m.left}mm`,
    },
  }

  await downloadPdfViaPlaywright(pdfRequest)
}

/** Same as downloadHtmlAsPdf, but returns PDF bytes for email attachments. */
export async function htmlToPdfBlob(
  html: string,
  filename: string,
  pageSize: PrintPageSize,
  marginsMm?: PrintPageMarginsMm,
  _pagebreakMode?: Array<'css' | 'legacy' | 'avoid-all'>,
  options?: {
    orientation?: 'portrait' | 'landscape'
    qualityScale?: number
    applyOuterMargins?: boolean
    pageWidthMm?: number
    pageHeightMm?: number
    captureSelector?: string
  },
): Promise<Blob> {
  const applyOuter = options?.applyOuterMargins === true
  const m = applyOuter
    ? (marginsMm ?? { top: 12, right: 12, bottom: 12, left: 12 })
    : { top: 0, right: 0, bottom: 0, left: 0 }

  return renderPdfViaPlaywright({
    html,
    filename,
    format: mapPageSizeToPlaywrightFormat(pageSize),
    landscape: options?.orientation === 'landscape',
    margin: {
      top: `${m.top}mm`,
      right: `${m.right}mm`,
      bottom: `${m.bottom}mm`,
      left: `${m.left}mm`,
    },
  })
}
