/*
 * Dummy observed value of a Factory Test Report row (owner, 25 Nov 2026): "Requirements for This Sample" also fills a
 * plausible observed value that meets the specified requirement, so a draft report looks complete. Numbers only (the
 * unit is in its own column); a statement ("Free From Defects") gets "Complies".
 */

/** 0 … 1 from a text, so the same test gets the same dummy value every time. */
function seeded(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}

const decimalsOf = (...nums: string[]) => Math.max(0, ...nums.map((n) => (n.split('.')[1] ?? '').length))
const NUM = '(\\d+(?:\\.\\d+)?)'

/** A value inside the requirement: below a maximum, above a minimum, inside a range or a tolerance. */
export function dummyObservedValue(requirement: string, seed = ''): string {
  const text = requirement.replace(/(\d),(\d)/g, '$1$2').trim()
  if (!text) return ''
  const f = seeded(seed || text)

  // Nominal with an uneven tolerance: "14.20 mm +0.20 mm -0.00 mm", "25 +0.5/-0.2".
  const u = text.match(new RegExp(`${NUM}\\s*[^\\d+±]{0,8}?\\+\\s*${NUM}\\s*[^\\d+]{0,6}?[-−–]\\s*${NUM}`))
  if (u) {
    const nominal = Number(u[1])
    const lo = nominal - Number(u[3])
    const hi = nominal + Number(u[2])
    if (hi > lo) return (lo + (hi - lo) * (0.3 + 0.4 * f)).toFixed(decimalsOf(u[1], u[2], u[3]))
  }

  // Nominal with a tolerance: "330 mm ± 5 %", "110 mm ± 3.00 mm".
  let m = text.match(new RegExp(`${NUM}\\s*[^\\d±]{0,8}?±\\s*${NUM}\\s*(%?)`))
  if (m) {
    const nominal = Number(m[1])
    const tol = m[3] === '%' ? (nominal * Number(m[2])) / 100 : Number(m[2])
    const d = Math.max(decimalsOf(m[1]), m[3] === '%' ? 1 : decimalsOf(m[2]))
    return (nominal + tol * (f - 0.5) * 0.8).toFixed(d)
  }

  // A range: "8.5 % - 10.5 %", "14.20 mm to 14.40 mm".
  m = text.match(new RegExp(`${NUM}[^\\d]{0,12}?(?:-|–|\\bto\\b)\\s*${NUM}`, 'i'))
  if (m && Number(m[2]) > Number(m[1])) {
    const lo = Number(m[1])
    const hi = Number(m[2])
    return (lo + (hi - lo) * (0.3 + 0.4 * f)).toFixed(decimalsOf(m[1], m[2]))
  }

  const isMax = /\b(?:max(?:imum)?|not more than|nmt|up ?to)\b|≤|</i.test(text)
  const isMin = /\b(?:min(?:imum)?|not less than|nlt|at least)\b|≥|>/i.test(text)
  // A number glued to a letter ("2t" mandrel of a bend test) is not a limit of the result.
  const nums = [...text.matchAll(/(\d+(?:\.\d+)?)(?![A-Za-z\d.])/g)].map((x) => x[1]!)
  if (isMax && isMin && nums.length >= 2) {
    const [a, b] = [Number(nums[0]), Number(nums[1])].sort((x, y) => x - y)
    return (a + (b - a) * (0.3 + 0.4 * f)).toFixed(decimalsOf(nums[0]!, nums[1]!))
  }
  if ((isMax || isMin) && nums.length) {
    const limit = Number(nums[0])
    let d = decimalsOf(nums[0]!)
    const value = isMax ? limit * (0.6 + 0.3 * f) : limit * (1.05 + 0.2 * f)
    // A whole-number limit under 10 keeps one decimal, so the value does not round onto the limit.
    if (d === 0 && limit < 10) d = 1
    return value.toFixed(d)
  }
  return 'Complies'
}
