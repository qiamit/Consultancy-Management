/** GST state codes seeded in S7 (`india_states`). */
export const INDIA_GST_STATE_CODES = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '26', '27', '28', '29', '30', '31',
  '32', '33', '34', '35', '36', '37', '38', '97',
] as const

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export function gstinStateCode(gstin: string): string {
  const v = gstin.trim().toUpperCase()
  return v.length >= 2 ? v.slice(0, 2) : ''
}

export function panFromGstin(gstin: string): string {
  const v = gstin.trim().toUpperCase()
  return GSTIN_SHAPE.test(v) ? v.slice(2, 12) : ''
}

export function isValidPan(value: string): boolean {
  const v = value.trim().toUpperCase()
  if (!v) return true
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)
}

export function isValidIndianPinCode(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  return /^[1-9][0-9]{5}$/.test(v)
}

/** Indian mobile when the country code is +91. Empty is valid. */
export function isValidIndianMobile(value: string, countryCode: string): boolean {
  const v = value.trim()
  if (!v) return true
  const code = countryCode.trim()
  if (code !== '+91' && code !== '91') return true
  return /^[6-9][0-9]{9}$/.test(v)
}

export function isValidGstin(value: string): boolean {
  const v = value.trim().toUpperCase()
  if (!v) return true
  if (!GSTIN_SHAPE.test(v)) return false
  if (!INDIA_GST_STATE_CODES.includes(v.slice(0, 2) as (typeof INDIA_GST_STATE_CODES)[number])) return false
  let sum = 0
  for (let i = 0; i < 14; i += 1) {
    const code = GSTIN_CHARS.indexOf(v[i] ?? '')
    if (code < 0) return false
    const product = code * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  const check = (36 - (sum % 36)) % 36
  return GSTIN_CHARS[check] === v[14]
}
