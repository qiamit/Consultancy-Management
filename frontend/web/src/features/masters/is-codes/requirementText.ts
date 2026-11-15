/**
 * Requirement text of a test in the house style: words instead of signs ("0.12 % Maximum", "500 MPa Minimum") and a
 * range with its unit on both ends ("8.5 % - 10.5 %"). Text that is not a plain limit or range stays as it is.
 */
const NUM = String.raw`[+-]?\d+(?:[.,]\d+)?`
const UNIT = String.raw`(?:%|‰|°\s?[CF]?|[A-Za-zµμΩ°/²³·.\-\d]*[A-Za-zµμΩ°%²³])`

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function formatRequirement(raw: string, unit = ''): string {
  // The specified requirement only: a permitted variation / tolerance note of the product analysis is left out.
  let s = clean(raw.replace(/\s*[,;]?\s*\(?\s*(?:permissible\s+|permitted\s+)?variation\b.*$/i, ''))
  if (!s) return s
  // "≤ 0.12 %", "<= 0.12 %", "Max. 0.12 %", "Not More Than 0.12 %"  →  "0.12 % Maximum"
  const limit = s.match(new RegExp(String.raw`^(≤|<=|=<|max\.?|maximum|not more than|up to|≥|>=|=>|min\.?|minimum|not less than|<|>)\s*(${NUM})\s*(${UNIT})?\s*(.*)$`, 'i'))
  if (limit) {
    const sign = limit[1].toLowerCase()
    const word = /^(≥|>=|=>|min|minimum|not less than)/.test(sign) ? 'Minimum' : sign === '<' ? 'Less Than' : sign === '>' ? 'More Than' : 'Maximum'
    const u = (limit[3] || unit || '').trim()
    // The value may run on ("0.12 × d mm²/mm (d < 10 mm)"): the word goes after it, before a closing condition.
    // A note after a comma ("…, Variation +0.01 %") stays after the word.
    const restText = (limit[4] ?? '').trim()
    const note = restText.match(/^[,;].*$/)?.[0] ?? ''
    const body = note ? '' : restText
    const cond = body.match(/\s*(\(.*\))\s*$/)
    const tail = cond ? body.slice(0, cond.index).trim() : body
    const value = [limit[2] + (u ? ` ${u}` : ''), tail].filter(Boolean).join(' ')
    const rest = note || (cond ? ` ${cond[1]}` : '')
    return word === 'Less Than' || word === 'More Than' ? `${word} ${value}${rest}` : `${value} ${word}${rest}`
  }
  // "8.5 – 10.5 %", "8.5 to 10.5 %"  →  "8.5 % - 10.5 %"
  const range = s.match(new RegExp(String.raw`^(${NUM})\s*(${UNIT})?\s*(?:-|–|—|to)\s*(${NUM})\s*(${UNIT})?\s*(.*)$`, 'i'))
  if (range && (range[2] || range[4] || unit)) {
    const u1 = (range[2] || range[4] || unit).trim()
    const u2 = (range[4] || range[2] || unit).trim()
    const more = (range[5] ?? '').trim()
    const rest = more ? (/^[,;.]/.test(more) ? more : ` ${more}`) : ''
    return `${range[1]} ${u1} - ${range[3]} ${u2}${rest}`
  }
  // Signs left inside a longer text: "≤" → "Maximum", "≥" → "Minimum" after the value they qualify.
  s = s.replace(new RegExp(String.raw`(≤|<=)\s*(${NUM}\s*${UNIT}?)`, 'g'), '$2 Maximum').replace(new RegExp(String.raw`(≥|>=)\s*(${NUM}\s*${UNIT}?)`, 'g'), '$2 Minimum')
  return clean(s)
}

/** A finished-product test name: "Carbon (Ladle Analysis)" → "Carbon". */
export function finalProductTestName(name: string): string {
  return clean(name.replace(/\s*[(,–-]\s*(ladle|heat|cast)\s+analysis\s*\)?\s*$/i, ''))
}
