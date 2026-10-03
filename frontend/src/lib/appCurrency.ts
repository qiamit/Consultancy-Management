/** Lab Settings currency preference — symbol/code used across money display. */

export const APP_CURRENCY_STORAGE_KEY = 'consultancy.appCurrency'
export const APP_CURRENCY_LABEL_STORAGE_KEY = 'consultancy.appCurrencyLabel'

export const DEFAULT_APP_CURRENCY = 'inr'

export type AppCurrencyMeta = {
  id: string
  code: string
  symbol: string
  label: string
}

export const BUILTIN_CURRENCY_OPTIONS: AppCurrencyMeta[] = [
  { id: 'inr', code: 'INR', symbol: '₹', label: '₹ (INR) — Indian Rupee' },
  { id: 'usd', code: 'USD', symbol: '$', label: '$ (USD) — US Dollar' },
  { id: 'eur', code: 'EUR', symbol: '€', label: '€ (EUR) — Euro' },
  { id: 'gbp', code: 'GBP', symbol: '£', label: '£ (GBP) — British Pound' },
  { id: 'aed', code: 'AED', symbol: 'د.إ', label: 'د.إ (AED) — UAE Dirham' },
  { id: 'sar', code: 'SAR', symbol: '﷼', label: '﷼ (SAR) — Saudi Riyal' },
  { id: 'jpy', code: 'JPY', symbol: '¥', label: '¥ (JPY) — Japanese Yen' },
  { id: 'cny', code: 'CNY', symbol: '¥', label: '¥ (CNY) — Chinese Yuan' },
  { id: 'aud', code: 'AUD', symbol: 'A$', label: 'A$ (AUD) — Australian Dollar' },
  { id: 'cad', code: 'CAD', symbol: 'C$', label: 'C$ (CAD) — Canadian Dollar' },
  { id: 'sgd', code: 'SGD', symbol: 'S$', label: 'S$ (SGD) — Singapore Dollar' },
  { id: 'chf', code: 'CHF', symbol: 'CHF', label: 'CHF — Swiss Franc' },
]

const BY_ID = new Map(BUILTIN_CURRENCY_OPTIONS.map((c) => [c.id, c]))

type Listener = () => void

let currencyId = DEFAULT_APP_CURRENCY
let currencyLabelHint = ''
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((l) => l())
}

export function subscribeAppCurrency(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAppCurrencyId(): string {
  return currencyId
}

export function getAppCurrencySnapshot(): string {
  return `${currencyId}||${currencyLabelHint}`
}

/** Parse symbol/code from labels like "INR (₹) - Indian Rupee" or "₹ (INR)". */
export function parseCurrencyFromLabel(label: string, fallbackId = 'custom'): AppCurrencyMeta {
  const raw = label.trim()
  if (!raw) {
    return { id: fallbackId, code: 'CUR', symbol: '¤', label: 'Custom' }
  }

  const paren = raw.match(/\(([^)]+)\)/)
  const inside = paren?.[1]?.trim() ?? ''
  const before = raw.slice(0, paren?.index ?? raw.length).trim()
  const after = paren
    ? raw.slice((paren.index ?? 0) + paren[0].length).replace(/^[\s—–-]+/, '').trim()
    : ''

  const looksLikeCode = (s: string) => /^[A-Z]{3}$/i.test(s.trim())
  const looksLikeSymbol = (s: string) => s.length > 0 && s.length <= 4 && !looksLikeCode(s)

  let code = 'CUR'
  let symbol = '¤'

  if (looksLikeCode(inside)) {
    code = inside.toUpperCase()
    if (looksLikeSymbol(before)) symbol = before
    else if (after && looksLikeSymbol(after.split(/\s+/)[0] ?? '')) {
      symbol = after.split(/\s+/)[0]!
    }
  } else if (looksLikeSymbol(inside)) {
    symbol = inside
    if (looksLikeCode(before)) code = before.toUpperCase()
    else {
      const codeMatch = raw.match(/\b([A-Za-z]{3})\b/)
      if (codeMatch) code = codeMatch[1]!.toUpperCase()
    }
  } else {
    const codeMatch = raw.match(/\b([A-Za-z]{3})\b/)
    if (codeMatch) code = codeMatch[1]!.toUpperCase()
    const symMatch = raw.match(/[₹$€£¥¢¤﷼]/)
    if (symMatch) symbol = symMatch[0]!
    else symbol = code
  }

  const id = fallbackId === 'custom' ? code.toLowerCase() : fallbackId
  return { id, code, symbol, label: raw }
}

export function resolveCurrencyMeta(
  id: string | null | undefined,
  labelHint?: string | null,
): AppCurrencyMeta {
  const key = String(id ?? '').trim().toLowerCase()
  const builtin = BY_ID.get(key)
  if (builtin) return builtin
  if (labelHint?.trim()) return parseCurrencyFromLabel(labelHint, key || 'custom')
  if (key) {
    return {
      id: key,
      code: key.toUpperCase().slice(0, 3) || 'CUR',
      symbol: key.toUpperCase().slice(0, 3) || '¤',
      label: key.toUpperCase(),
    }
  }
  return BY_ID.get(DEFAULT_APP_CURRENCY)!
}

export function normalizeAppCurrencyId(value: string | null | undefined): string {
  const key = String(value ?? '').trim().toLowerCase()
  if (!key) return DEFAULT_APP_CURRENCY
  if (BY_ID.has(key)) return key
  return key
}

export function persistAppCurrency(id: string, label = '') {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(APP_CURRENCY_STORAGE_KEY, id)
    if (label) window.localStorage.setItem(APP_CURRENCY_LABEL_STORAGE_KEY, label)
  } catch {
    /* ignore */
  }
}

export function readStoredAppCurrency(): { id: string; label: string } {
  if (typeof window === 'undefined') {
    return { id: DEFAULT_APP_CURRENCY, label: '' }
  }
  try {
    return {
      id: normalizeAppCurrencyId(window.localStorage.getItem(APP_CURRENCY_STORAGE_KEY)),
      label: window.localStorage.getItem(APP_CURRENCY_LABEL_STORAGE_KEY) ?? '',
    }
  } catch {
    return { id: DEFAULT_APP_CURRENCY, label: '' }
  }
}

export function setAppCurrency(id: string, labelHint?: string) {
  const next = normalizeAppCurrencyId(id)
  const nextLabel = labelHint?.trim() ?? currencyLabelHint
  if (next === currencyId && nextLabel === currencyLabelHint) {
    persistAppCurrency(next, nextLabel)
    return
  }
  currencyId = next
  currencyLabelHint = nextLabel
  persistAppCurrency(next, nextLabel)
  emit()
}

export function getCurrencyMeta(): AppCurrencyMeta {
  return resolveCurrencyMeta(currencyId, currencyLabelHint)
}

export function getCurrencySymbol(): string {
  return getCurrencyMeta().symbol
}

export function getCurrencyCode(): string {
  return getCurrencyMeta().code
}

/** Prefix amount text with active currency symbol (e.g. "₹ 1,234.00"). */
export function withCurrencySymbol(amountText: string): string {
  const sym = getCurrencySymbol()
  const t = String(amountText ?? '').trim()
  if (!t) return sym
  return `${sym} ${t}`
}

/** Strip common currency symbols / separators from money inputs. */
export function stripCurrencyNoise(value: string): string {
  return value.replace(/[₹$€£¥¢¤﷼,\s]/g, '')
}

export function initAppCurrencyFromStorage() {
  const stored = readStoredAppCurrency()
  currencyId = stored.id
  currencyLabelHint = stored.label
}

if (typeof window !== 'undefined') {
  initAppCurrencyFromStorage()
}
