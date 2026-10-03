/** Convert amount to Indian Rupees words (e.g. One Thousand Rupees Only). */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  const ten = Math.floor(n / 10)
  const one = n % 10
  return [TENS[ten], ONES[one]].filter(Boolean).join(' ')
}

function threeDigits(n: number): string {
  if (n === 0) return ''
  const hundred = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundred > 0) parts.push(`${ONES[hundred]} Hundred`)
  if (rest > 0) parts.push(twoDigits(rest))
  return parts.join(' ')
}

/** Words for integer rupees using Indian grouping (thousand / lakh / crore). */
function integerToWords(n: number): string {
  if (n === 0) return 'Zero'
  if (n < 0) return `Minus ${integerToWords(-n)}`

  const crore = Math.floor(n / 1_00_00_000)
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000)
  const thousand = Math.floor((n % 1_00_000) / 1000)
  const hundred = n % 1000

  const parts: string[] = []
  if (crore > 0) parts.push(`${threeDigits(crore)} Crore`)
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`)
  if (hundred > 0) parts.push(threeDigits(hundred))
  return parts.join(' ')
}

export function amountInIndianRupeesWords(amount: number): string {
  if (!Number.isFinite(amount)) return 'Zero Rupees Only'

  const rounded = Math.round(Math.abs(amount) * 100) / 100
  const rupees = Math.floor(rounded)
  const paise = Math.round((rounded - rupees) * 100)

  const sign = amount < 0 ? 'Minus ' : ''
  const rupeePart = `${integerToWords(rupees)} Rupee${rupees === 1 ? '' : 's'}`
  if (paise <= 0) return `${sign}${rupeePart} Only`

  const paisePart = `${twoDigits(paise)} Paise`
  return `${sign}${rupeePart} and ${paisePart} Only`
}
