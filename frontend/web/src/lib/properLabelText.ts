import { Children, isValidElement, type ReactNode } from 'react'

/** Small words stay lowercase, except when they are the first or last word. */
const SMALL_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'for',
  'to',
  'in',
  'on',
  'at',
  'by',
  'as',
  'nor',
  'but',
  'so',
  'yet',
  'via',
  'per',
  'vs',
  'from',
  'with',
])

/**
 * These stay in this exact form. Short words that are also normal English
 * (IS, IT) are only kept when the source is already all capitals.
 */
const ACRONYMS = new Set([
  'AI',
  'API',
  'BIS',
  'CGST',
  'CIN',
  'CSV',
  'EMI',
  'FAQ',
  'FTR',
  'FY',
  'GST',
  'GSTIN',
  'HSN',
  'ID',
  'IEC',
  'IFSC',
  'IGST',
  'IIT',
  'IS',
  'ILAC',
  'ISO',
  'LLPIN',
  'LUT',
  'MRP',
  'MSME',
  'NABL',
  'NABCB',
  'NEFT',
  'NIT',
  'OEM',
  'OK',
  'OSL',
  'OTP',
  'PAN',
  'PDF',
  'PIN',
  'QAI',
  'QE',
  'QR',
  'ROM',
  'RTGS',
  'SAC',
  'SEZ',
  'SGST',
  'SMS',
  'TDS',
  'UPI',
  'URL',
])

const ROMAN =
  /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV|XXX)$/

/** UI chrome only. Skips emails, long sentences, and document numbers. */
export function isUiLabelText(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 64) return false
  if (trimmed.includes('@')) return false
  if (/[A-Za-z]{1,8}[-/]\d/.test(trimmed)) return false
  const words = trimmed.split(/\s+/).filter(Boolean)
  return words.length > 0 && words.length <= 8
}

function formatLetters(letters: string, forceCapital: boolean): string {
  const upper = letters.toUpperCase()
  const lower = letters.toLowerCase()
  if (ROMAN.test(upper)) return upper
  // Author already wrote a short form in capitals (AK, BIS, IS). Do not soften it.
  if (letters.length >= 2 && letters === upper) return letters
  if (ACRONYMS.has(upper)) return upper
  if (!forceCapital && SMALL_WORDS.has(lower)) return lower
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
}

function formatToken(token: string, forceCapital: boolean): string {
  if (!token) return token
  if (/\d/.test(token)) return token
  if (token.includes('/')) {
    return token
      .split('/')
      .map((part, index) => formatToken(part, forceCapital && index === 0))
      .join('/')
  }
  if (token.includes('-')) {
    return token
      .split('-')
      .map((part, index) => formatToken(part, forceCapital && index === 0))
      .join('-')
  }
  const match = token.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z']*)([^A-Za-z]*)$/)
  if (!match) return token
  const [, prefix, letters, suffix] = match
  return `${prefix}${formatLetters(letters, forceCapital)}${suffix}`
}

/** Title case for buttons and labels. Safe to run more than once. */
export function toProperLabelText(value: string): string {
  if (!isUiLabelText(value)) return value
  return value
    .split('\n')
    .map((line) => {
      const pieces = line.split(/(\s+)/)
      const wordIndexes: number[] = []
      pieces.forEach((piece, index) => {
        if (piece && !/^\s+$/.test(piece)) wordIndexes.push(index)
      })
      const first = wordIndexes[0]
      const last = wordIndexes[wordIndexes.length - 1]
      return pieces
        .map((piece, index) => {
          if (!piece || /^\s+$/.test(piece)) return piece
          return formatToken(piece, index === first || index === last)
        })
        .join('')
    })
    .join('\n')
}

export function mapProperLabelChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') return toProperLabelText(child)
    if (isValidElement(child)) return child
    return child
  })
}
