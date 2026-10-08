export type GstRateRow = {
  id: string
  rate: number
  created_at?: string | null
}

/** Normalize user/typed GST % for compare & storage display (e.g. 18 → "18.00"). */
export function normalizeGstRateInput(raw: string): string {
  const trimmed = raw.trim().replace(/%/g, '')
  if (!trimmed) return ''
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return trimmed
  return n.toFixed(2)
}

export function formatGstRateLabel(rate: number): string {
  const n = Number(rate)
  if (!Number.isFinite(n)) return String(rate)
  const whole = Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-9
  return whole ? `${Math.round(n)}%` : `${n.toFixed(2)}%`
}

export function parseGstRateValue(raw: string): number | null {
  const trimmed = raw.trim().replace(/%/g, '')
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100) / 100
}
