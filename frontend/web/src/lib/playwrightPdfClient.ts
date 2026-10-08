/** Browser client for the local Playwright PDF service (same Chromium print engine). */

export type PlaywrightPdfFormat = 'a4' | 'a5' | 'letter' | 'legal'

export type PlaywrightPdfRequest = {
  html: string
  filename: string
  format?: PlaywrightPdfFormat
  landscape?: boolean
  /** CSS margin strings, e.g. "12mm". Prefer 0 when HTML already has page padding. */
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
}

function pdfServiceUrl(): string {
  const fromEnv = (import.meta.env.VITE_PDF_SERVICE_URL as string | undefined)?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  // Vite proxies /api/pdf → pdf-service in dev
  return '/api/pdf'
}

export function mapPageSizeToPlaywrightFormat(
  pageSize: string,
): PlaywrightPdfFormat {
  const s = pageSize.trim().toLowerCase()
  if (s === 'letter') return 'letter'
  if (s === 'legal') return 'legal'
  if (s === 'a5') return 'a5'
  return 'a4'
}

/** Trigger a browser download from PDF bytes. */
export function triggerPdfDownload(blob: Blob, filename: string): void {
  const safe =
    filename.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document.pdf'
  const outName = safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = outName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

function friendlyPdfServiceError(detail: string, status?: number): string {
  const raw = detail.trim()
  const lower = raw.toLowerCase()
  if (
    lower.includes('executable doesn') ||
    lower.includes('playwright install') ||
    lower.includes('browserType.launch'.toLowerCase())
  ) {
    return 'PDF browser is missing. In the project root run: npm run pdf:install'
  }
  if (
    status === 502 ||
    status === 504 ||
    lower.includes('econnrefused') ||
    lower.includes('not running') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror')
  ) {
    return 'PDF service is not running. Start it with: npm run pdf:dev'
  }
  if (raw && !raw.startsWith('<!') && raw.length < 400) return raw
  if (status) return `PDF service error (${status}). Start it with: npm run pdf:dev`
  return 'PDF download failed. Start PDF service with: npm run pdf:dev'
}

/** Render HTML → PDF bytes via Playwright service (does not trigger a download). */
export async function renderPdfViaPlaywright(
  request: PlaywrightPdfRequest,
): Promise<Blob> {
  const endpoint = pdfServiceUrl()
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: request.html,
        filename: request.filename,
        format: request.format ?? 'a4',
        landscape: request.landscape === true,
        margin: request.margin ?? {
          top: '0mm',
          right: '0mm',
          bottom: '0mm',
          left: '0mm',
        },
      }),
    })
  } catch {
    throw new Error(friendlyPdfServiceError('failed to fetch'))
  }

  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: string }
      detail = j.error?.trim() || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(friendlyPdfServiceError(detail, res.status))
  }

  const blob = await res.blob()
  if (!blob.size) throw new Error('PDF service returned an empty file')
  if (blob.type.includes('text/html')) {
    throw new Error(friendlyPdfServiceError('PDF service is not running'))
  }
  return blob
}

/**
 * Render HTML → PDF via Playwright service and download the file.
 * Throws a clear error if the service is not running or Chromium is missing.
 */
export async function downloadPdfViaPlaywright(
  request: PlaywrightPdfRequest,
): Promise<void> {
  const blob = await renderPdfViaPlaywright(request)
  triggerPdfDownload(blob, request.filename)
}
