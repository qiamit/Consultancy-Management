/** window.postMessage bridge for QE Consultancy browser extension (see frontend/extensions/qe-consultancy-chrome/bridge.js). */

import { getPortalPasswordForExtension } from './bisPortalSecretApi'

export const MANAK_EBIS_LOGIN_URL = 'https://www.manakonline.in/MANAK/eBISLogin'
export const MANAK_HOME_URL = 'https://www.manakonline.in/MANAK/login'
export const MANAK_LICENCE_RELATED_RPT_URL =
  'https://www.manakonline.in/MANAK/ApplicationLicenceRelatedrpt'

const BLOCKED_OPEN =
  /play\.google\.com|apps\.apple\.com|com\.bis\.app|itunes\.apple\.com/i

export type IsCodeFillPayload = {
  fields?: Record<string, string>
  files?: unknown[]
  notes?: string[]
  partial?: boolean
  done?: boolean
}

declare global {
  interface Window {
    __QE_CONSULTANCY__?: boolean
  }
}

export function isQeExtensionPresent(): boolean {
  try {
    return (
      document.documentElement.dataset.qeConsultancy === '1' ||
      Boolean(window.__QE_CONSULTANCY__)
    )
  } catch {
    return false
  }
}

/** API gateway origin for Manak PDF inbox — prefer VITE_SUPABASE_URL over the frontend host. */
export function getManakApiOrigin(): string {
  const fromEnv = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return window.location.origin.replace(/\/$/, '')
}

export function getManakPdfApiUrl(): string {
  return `${getManakApiOrigin()}/api/osl/manak-pdf`
}

export function manakEbisLoginHref(portalUserId?: string | null): string {
  const userId = String(portalUserId ?? '').trim()
  if (!userId) return MANAK_EBIS_LOGIN_URL
  try {
    const url = new URL(MANAK_EBIS_LOGIN_URL)
    url.searchParams.set('userId', userId)
    return url.toString()
  } catch {
    return MANAK_EBIS_LOGIN_URL
  }
}

function openManakUrl(url: string): void {
  const href = url.trim()
  if (!href || BLOCKED_OPEN.test(href)) return
  window.open(href, '_blank', 'noopener,noreferrer')
}

/** Ping extension via QE_IS_CODE_PING → QE_IS_CODE_PONG. */
export function pingExtension(timeoutMs = 400): Promise<boolean> {
  if (isQeExtensionPresent()) return Promise.resolve(true)
  return new Promise((resolve) => {
    function onPong(event: MessageEvent) {
      if (event.source !== window) return
      if (event.data?.type !== 'QE_IS_CODE_PONG') return
      window.removeEventListener('message', onPong)
      resolve(true)
    }
    window.addEventListener('message', onPong)
    window.postMessage({ type: 'QE_IS_CODE_PING' }, window.location.origin)
    window.setTimeout(() => {
      window.removeEventListener('message', onPong)
      resolve(isQeExtensionPresent())
    }, timeoutMs)
  })
}

export async function registerManakPdfInbox(
  token: string,
  sampleId = '',
): Promise<void> {
  try {
    const { supabase } = await import('@/lib/supabaseClient')
    const { data } = await supabase.auth.getSession()
    const jwt = data.session?.access_token ?? ''
    await fetch(getManakPdfApiUrl(), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify({ action: 'register', token, sampleId }),
    })
  } catch {
    /* inbox optional */
  }
}

export type OpenManakEbisResult = {
  extensionUsed: boolean
}

/** Digits only from CM/L (expects 10-digit licence number). */
export function cmLDigitsOnly(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * Open Manak Application / Licence Related Report and copy the 10-digit CM/L to clipboard.
 */
export async function openManakLicenceRelatedRpt(
  cmLDigits: string | null | undefined,
): Promise<{ digits: string; copied: boolean }> {
  const digits = cmLDigitsOnly(cmLDigits)
  let copied = false
  if (digits) {
    try {
      await navigator.clipboard.writeText(digits)
      copied = true
    } catch {
      copied = false
    }
  }
  openManakUrl(MANAK_LICENCE_RELATED_RPT_URL)
  return { digits, copied }
}

/**
 * Open Manak eBIS login (User ID / Password pre-filled when provided).
 * Sends QE_MANAK_OPEN with loginOnly; falls back to a new tab if extension is missing.
 */
export async function openManakEbisAssist(options: {
  portalUserId?: string | null
  projectId?: string | null
}): Promise<OpenManakEbisResult> {
  const portalUserId = String(options.portalUserId ?? '').trim()
  const loginUrl = manakEbisLoginHref(portalUserId)
  const present = await pingExtension()
  if (!present) {
    openManakUrl(loginUrl)
    return { extensionUsed: false }
  }
  const portalPassword = options.projectId
    ? ((await getPortalPasswordForExtension(options.projectId)) ?? '')
    : ''

  let acked = isQeExtensionPresent()

  return new Promise((resolve) => {
    function onAck(event: MessageEvent) {
      if (event.source !== window) return
      if (event.data?.type !== 'QE_MANAK_OPEN_ACK') return
      acked = true
      window.removeEventListener('message', onAck)
      resolve({ extensionUsed: true })
    }

    window.addEventListener('message', onAck)
    window.postMessage(
      {
        type: 'QE_MANAK_OPEN',
        payload: null,
        loginOnly: true,
        loginUrl,
        portalUserId,
        portalPassword,
      },
      window.location.origin,
    )

    window.setTimeout(() => {
      window.removeEventListener('message', onAck)
      if (acked) return
      openManakUrl(loginUrl)
      resolve({ extensionUsed: false })
    }, 400)
  })
}

/**
 * Start Manak “Not Used” QR import via QE Consultancy extension (same as QE Import Codes).
 * Codes arrive later as `QE_MANAK_QR_IMPORT` — use {@link subscribeManakQrImport}.
 */
export async function importManakQrCodes(options: {
  portalUserId?: string | null
  projectId?: string | null
  qrCount?: number
}): Promise<OpenManakEbisResult> {
  const portalUserId = String(options.portalUserId ?? '').trim()
  const loginUrl = manakEbisLoginHref(portalUserId)
  const qrCount = Math.max(1, Math.min(5, Number(options.qrCount) || 5))
  const present = await pingExtension()
  if (!present) {
    openManakUrl(loginUrl)
    return { extensionUsed: false }
  }
  const portalPassword = options.projectId
    ? ((await getPortalPasswordForExtension(options.projectId)) ?? '')
    : ''

  let acked = isQeExtensionPresent()

  return new Promise((resolve) => {
    function onAck(event: MessageEvent) {
      if (event.source !== window) return
      if (event.data?.type !== 'QE_MANAK_OPEN_ACK') return
      acked = true
      window.removeEventListener('message', onAck)
      resolve({ extensionUsed: true })
    }

    window.addEventListener('message', onAck)
    window.postMessage(
      {
        type: 'QE_MANAK_OPEN',
        payload: null,
        loginOnly: false,
        importQr: true,
        qrCount,
        loginUrl,
        homeUrl: MANAK_HOME_URL,
        portalUserId,
        portalPassword,
      },
      window.location.origin,
    )

    window.setTimeout(() => {
      window.removeEventListener('message', onAck)
      if (acked) return
      openManakUrl(loginUrl)
      resolve({ extensionUsed: false })
    }, 400)
  })
}

/** Listen for QR codes published by the extension after Import Codes. */
export function subscribeManakQrImport(
  onCodes: (codes: string[]) => void,
): () => void {
  let lastKey = ''
  let lastAt = 0
  function onMessage(event: MessageEvent) {
    if (event.source !== window) return
    if (event.data?.type !== 'QE_MANAK_QR_IMPORT') return
    const raw = event.data?.result?.qr_codes
    const codes = Array.isArray(raw)
      ? raw.map((c: unknown) => String(c ?? '').replace(/\D/g, '')).filter((c: string) => c.length >= 12)
      : []
    if (!codes.length) return
    const key = codes.join(',')
    const now = Date.now()
    // Extension may post the same import twice (bridge + scripting); ignore dupes.
    if (key === lastKey && now - lastAt < 8000) return
    lastKey = key
    lastAt = now
    onCodes(codes)
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}

export function isNumberFromLabel(label: string | null | undefined): string {
  const raw = String(label ?? '').trim()
  if (!raw) return ''
  const colon = raw.indexOf(':')
  return (colon >= 0 ? raw.slice(0, colon) : raw).trim()
}

/**
 * Manak "Enter the IS Number" accepts digits only (e.g. `10748`).
 * Strips `IS` prefix and revision year (`: 2024`).
 */
export function manakIsSearchDigits(label: string | null | undefined): string {
  const base = isNumberFromLabel(label)
  if (!base) return ''
  const nums = base.replace(/^is\s*/i, '').match(/\d{3,7}/g) || []
  const notYear = nums.filter((n) => !/^(19|20)\d{2}$/.test(n))
  return (notYear.sort((a, b) => b.length - a.length)[0] || nums[0] || '').trim()
}

/** Optional 4-digit revision year for picking the right IS from Manak search results. */
export function manakIsRevisionYear(
  labelOrYear: string | null | undefined,
): string {
  const raw = String(labelOrYear ?? '').trim()
  if (!raw) return ''
  const m = raw.match(/\b((?:19|20)\d{2})\b/)
  return m ? m[1] : ''
}

export type FetchIsCodeHandlers = {
  onProgress?: (message: string) => void
  onPartial?: (payload: IsCodeFillPayload) => void
  onDone?: (payload: IsCodeFillPayload) => void
  onMissingExtension?: () => void
}

/**
 * Ask the extension to fetch IS Code data from BIS portals.
 * Sends QE_IS_CODE_PING then QE_IS_CODE_FETCH (matches bridge.js).
 */
export function fetchIsCodeViaExtension(
  isNumber: string,
  handlers: FetchIsCodeHandlers = {},
): () => void {
  const trimmed = isNumber.trim()
  if (!trimmed) {
    handlers.onProgress?.('Type an IS Number first.')
    return () => {}
  }

  let acked = isQeExtensionPresent()
  let active = true

  function onAck(event: MessageEvent) {
    if (!active || event.source !== window) return
    const type = event.data?.type
    if (type !== 'QE_IS_CODE_FETCH_ACK' && type !== 'QE_IS_CODE_PONG') return
    acked = true
    window.removeEventListener('message', onAck)
    handlers.onProgress?.('Extension connected. Fetching from BIS portals…')
  }

  function onMessage(event: MessageEvent) {
    if (!active || event.source !== window) return
    const data = event.data
    if (!data || typeof data !== 'object') return
    if (data.type === 'QE_IS_CODE_PROGRESS') {
      handlers.onProgress?.(String(data.message || 'Fetching portal data…'))
      return
    }
    if (data.type !== 'QE_IS_CODE_FILL') return
    const payload = (data.payload || {}) as IsCodeFillPayload
    if (payload.done) handlers.onDone?.(payload)
    else handlers.onPartial?.(payload)
  }

  window.addEventListener('message', onAck)
  window.addEventListener('message', onMessage)
  handlers.onProgress?.('Connecting to QE Consultancy extension…')
  window.postMessage({ type: 'QE_IS_CODE_PING' }, window.location.origin)
  window.postMessage({ type: 'QE_IS_CODE_FETCH', isNumber: trimmed }, window.location.origin)

  const missTimer = window.setTimeout(() => {
    window.removeEventListener('message', onAck)
    if (!active || acked) return
    handlers.onMissingExtension?.()
  }, 4000)

  return () => {
    active = false
    window.clearTimeout(missTimer)
    window.removeEventListener('message', onAck)
    window.removeEventListener('message', onMessage)
  }
}

export type ManakTrFillPayload = {
  kind: 'QE_MANAK_TR_V1'
  sampleId: string
  returnUrl: string
  returnToken: string
  application: { isSearch: string; isYear?: string }
  sample: Record<string, string>
  portalUserId?: string
  portalPassword?: string
  copiedAt?: number
}

export type ManakTrResult = {
  sampleId: string
  sample_code: string
  qr_code: string
  pdfName: string
  pdfBase64: string
  filledAt?: number
}

/** Build Manak Test Request fill payload from an OSL sample row + IS number. */
export function buildManakTrPayload(opts: {
  sampleId: string
  isSearch: string
  /** Optional revision year — used only to pick the matching IS from search results. */
  isYear?: string | null
  sample: Record<string, string>
  portalUserId?: string | null
  portalPassword?: string | null
  returnToken: string
}): ManakTrFillPayload {
  const digits = manakIsSearchDigits(opts.isSearch)
  const year =
    manakIsRevisionYear(opts.isYear) || manakIsRevisionYear(opts.isSearch) || undefined
  return {
    kind: 'QE_MANAK_TR_V1',
    sampleId: opts.sampleId.trim(),
    returnUrl: getManakApiOrigin(),
    returnToken: opts.returnToken.trim(),
    application: {
      // Manak search box: digits only — never include `: YYYY`.
      isSearch: digits || opts.isSearch.trim(),
      ...(year ? { isYear: year } : {}),
    },
    sample: opts.sample,
    portalUserId: String(opts.portalUserId ?? '').trim() || undefined,
    portalPassword: String(opts.portalPassword ?? '').trim() || undefined,
    copiedAt: Date.now(),
  }
}

/**
 * Start Manak Test Request Auto-fill (not login-only).
 * Extension captures PDF and posts QE_MANAK_RESULT / uploads inbox.
 */
export async function openManakTestRequestFill(options: {
  payload: ManakTrFillPayload
  portalUserId?: string | null
  projectId?: string | null
}): Promise<OpenManakEbisResult> {
  const portalUserId =
    String(options.portalUserId ?? options.payload.portalUserId ?? '').trim()
  const loginUrl = manakEbisLoginHref(portalUserId)
  const present = await pingExtension()
  if (!present) {
    openManakUrl(loginUrl)
    return { extensionUsed: false }
  }
  const portalPassword = options.projectId
    ? ((await getPortalPasswordForExtension(options.projectId)) ?? '')
    : ''
  const payload: ManakTrFillPayload = {
    ...options.payload,
    portalPassword: portalPassword || undefined,
  }

  let acked = false

  return new Promise((resolve) => {
    function onAck(event: MessageEvent) {
      if (event.source !== window) return
      if (event.data?.type !== 'QE_MANAK_OPEN_ACK') return
      acked = true
      window.removeEventListener('message', onAck)
      resolve({ extensionUsed: true })
    }

    window.addEventListener('message', onAck)
    window.postMessage(
      {
        type: 'QE_MANAK_OPEN',
        payload,
        loginOnly: false,
        importQr: false,
        loginUrl,
        homeUrl: MANAK_HOME_URL,
        portalUserId,
        portalPassword,
      },
      window.location.origin,
    )

    window.setTimeout(() => {
      window.removeEventListener('message', onAck)
      if (acked) return
      openManakUrl(loginUrl)
      resolve({ extensionUsed: false })
    }, 600)
  })
}

/** Listen for Manak Test Request results (includes PDF when available). */
export function subscribeManakTestRequestResult(
  onResult: (result: ManakTrResult) => void,
): () => void {
  let lastKey = ''
  let lastAt = 0
  function onMessage(event: MessageEvent) {
    if (event.source !== window) return
    if (event.data?.type !== 'QE_MANAK_RESULT') return
    const raw = event.data?.result
    if (!raw || typeof raw !== 'object') return
    const sampleId = String((raw as { sampleId?: string }).sampleId ?? '').trim()
    const sample_code = String((raw as { sample_code?: string }).sample_code ?? '').trim()
    const pdfBase64 = String((raw as { pdfBase64?: string }).pdfBase64 ?? '')
      .replace(/^data:application\/pdf;base64,/i, '')
      .replace(/\s+/g, '')
    if (!sampleId && !sample_code) return
    // Light inject without PDF — wait for chunked PDF delivery.
    if (!pdfBase64) return
    const key = `${sampleId}|${sample_code}|${pdfBase64.length}`
    const now = Date.now()
    if (key === lastKey && now - lastAt < 8000) return
    lastKey = key
    lastAt = now
    onResult({
      sampleId,
      sample_code,
      qr_code: String((raw as { qr_code?: string }).qr_code ?? '').trim(),
      pdfName: String((raw as { pdfName?: string }).pdfName ?? 'Test_Request.pdf').trim(),
      pdfBase64,
      filledAt: Number((raw as { filledAt?: number }).filledAt) || Date.now(),
    })
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}

/** Poll API inbox until PDF is ready (backup when postMessage is blocked). */
export async function pollManakPdfInbox(
  token: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<ManakTrResult | null> {
  const timeoutMs = opts?.timeoutMs ?? 12 * 60 * 1000
  const intervalMs = opts?.intervalMs ?? 2500
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(
        `${getManakPdfApiUrl()}?token=${encodeURIComponent(token)}`,
        { credentials: 'include' },
      )
      if (res.ok) {
        const data = (await res.json()) as {
          ready?: boolean
          sampleId?: string
          sample_code?: string
          pdfName?: string
          pdfBase64?: string
        }
        const pdfBase64 = String(data.pdfBase64 ?? '').replace(/\s+/g, '')
        if (data.ready && pdfBase64) {
          return {
            sampleId: String(data.sampleId ?? '').trim(),
            sample_code: String(data.sample_code ?? '').trim(),
            qr_code: '',
            pdfName: String(data.pdfName ?? 'Test_Request.pdf').trim(),
            pdfBase64,
          }
        }
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => window.setTimeout(r, intervalMs))
  }
  return null
}

