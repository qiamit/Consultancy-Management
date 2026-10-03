/** window.postMessage bridge for QE Consultancy browser extension (see extensions/qe-consultancy-chrome/bridge.js). */

export const MANAK_EBIS_LOGIN_URL = 'https://www.manakonline.in/MANAK/eBISLogin'
export const MANAK_HOME_URL = 'https://www.manakonline.in/MANAK/login'

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

export function manakEbisLoginHref(
  portalUserId?: string | null,
  portalPassword?: string | null,
): string {
  const userId = String(portalUserId ?? '').trim()
  const password = String(portalPassword ?? '').trim()
  if (!userId && !password) return MANAK_EBIS_LOGIN_URL
  try {
    const url = new URL(MANAK_EBIS_LOGIN_URL)
    if (userId) url.searchParams.set('userId', userId)
    if (password) url.searchParams.set('passwd', password)
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
    window.postMessage({ type: 'QE_IS_CODE_PING' }, '*')
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
    await fetch(getManakPdfApiUrl(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', token, sampleId }),
    })
  } catch {
    /* inbox optional */
  }
}

export type OpenManakEbisResult = {
  extensionUsed: boolean
}

/**
 * Open Manak eBIS login (User ID / Password pre-filled when provided).
 * Sends QE_MANAK_OPEN with loginOnly; falls back to a new tab if extension is missing.
 */
export async function openManakEbisAssist(options: {
  portalUserId?: string | null
  portalPassword?: string | null
}): Promise<OpenManakEbisResult> {
  const portalUserId = String(options.portalUserId ?? '').trim()
  const portalPassword = String(options.portalPassword ?? '').trim()
  const loginUrl = manakEbisLoginHref(portalUserId, portalPassword)

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
      '*',
    )

    window.setTimeout(() => {
      window.removeEventListener('message', onAck)
      if (acked) return
      openManakUrl(loginUrl)
      resolve({ extensionUsed: false })
    }, 400)
  })
}

export function isNumberFromLabel(label: string | null | undefined): string {
  const raw = String(label ?? '').trim()
  if (!raw) return ''
  const colon = raw.indexOf(':')
  return (colon >= 0 ? raw.slice(0, colon) : raw).trim()
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
  window.postMessage({ type: 'QE_IS_CODE_PING' }, '*')
  window.postMessage({ type: 'QE_IS_CODE_FETCH', isNumber: trimmed }, '*')

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
