export type ConformityRemark = 'Confirm' | 'Not Confirm' | 'Not Applicable'

export const RESULT_REMARK_OPTIONS: ConformityRemark[] = [
  'Confirm',
  'Not Confirm',
  'Not Applicable',
]

const PLACEHOLDER = 'Not Applicable'

const CONFIRM_TERMS = [
  'pass',
  'satisfactory',
  'conforms',
  'confirm',
  'complies',
  'compliant',
  'acceptable',
  'absent',
  'nil',
  'nd',
  'not detected',
  'negative',
  'within limit',
  'within limits',
]

const NOT_CONFIRM_TERMS = [
  'fail',
  'unsatisfactory',
  'non-conform',
  'non conform',
  'not confirm',
  'does not meet',
  'non compliant',
  'non-compliant',
  'positive',
  'present',
  'exceed',
  'exceeds',
]

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isMissing(s: string): boolean {
  const t = s.trim()
  return t === '' || t === PLACEHOLDER
}

function parseFirstNumber(s: string): number | null {
  const cleaned = s.replace(/,/g, '')
  const match = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const n = Number.parseFloat(match[0])
  return Number.isFinite(n) ? n : null
}

function includesTerm(haystack: string, terms: string[]): boolean {
  return terms.some((t) => haystack.includes(t))
}

function evaluateQualitative(observed: string, requirement: string): ConformityRemark | null {
  const o = norm(observed)
  const r = norm(requirement)

  if (includesTerm(o, NOT_CONFIRM_TERMS)) return 'Not Confirm'
  if (includesTerm(o, CONFIRM_TERMS)) {
    if (r.includes('fail') || r.includes('not confirm')) return 'Not Confirm'
    return 'Confirm'
  }

  const absentReq = /\b(absent|nil|nd|not detected|negative)\b/i.test(requirement)
  if (absentReq && /\b(absent|nil|nd|not detected|negative)\b/i.test(observed)) {
    return 'Confirm'
  }
  if (absentReq && /\b(present|positive|detected)\b/i.test(observed)) {
    return 'Not Confirm'
  }

  if (o === r) return 'Confirm'

  return null
}

function evaluateNumeric(observed: number, requirement: string): ConformityRemark | null {
  const r = requirement.trim()

  const rangeMatch = r.match(
    /(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/i,
  )
  if (rangeMatch) {
    const low = Number.parseFloat(rangeMatch[1])
    const high = Number.parseFloat(rangeMatch[2])
    if (Number.isFinite(low) && Number.isFinite(high)) {
      const min = Math.min(low, high)
      const max = Math.max(low, high)
      return observed >= min && observed <= max ? 'Confirm' : 'Not Confirm'
    }
  }

  const plusMinus = r.match(/(-?\d+(?:\.\d+)?)\s*(?:±|\+-|\+\/-)\s*(-?\d+(?:\.\d+)?)/)
  if (plusMinus) {
    const center = Number.parseFloat(plusMinus[1])
    const tol = Number.parseFloat(plusMinus[2])
    if (Number.isFinite(center) && Number.isFinite(tol)) {
      return Math.abs(observed - center) <= tol ? 'Confirm' : 'Not Confirm'
    }
  }

  const maxLt = r.match(/<\s*(-?\d+(?:\.\d+)?)/)
  if (maxLt) {
    const limit = Number.parseFloat(maxLt[1])
    if (Number.isFinite(limit)) {
      return observed < limit ? 'Confirm' : 'Not Confirm'
    }
  }

  const maxLte = r.match(/(?:≤|<=)\s*(-?\d+(?:\.\d+)?)/)
  if (maxLte) {
    const limit = Number.parseFloat(maxLte[1])
    if (Number.isFinite(limit)) {
      return observed <= limit ? 'Confirm' : 'Not Confirm'
    }
  }

  const maxWord = r.match(
    /(?:max\.?|maximum|nmt|not\s+more\s+than|upto|up\s+to)\s*(-?\d+(?:\.\d+)?)/i,
  )
  if (maxWord) {
    const limit = Number.parseFloat(maxWord[1])
    if (Number.isFinite(limit)) {
      return observed <= limit ? 'Confirm' : 'Not Confirm'
    }
  }

  const maxSuffix = r.match(/(-?\d+(?:\.\d+)?)\s*(?:max\.?|maximum)\b/i)
  if (maxSuffix) {
    const limit = Number.parseFloat(maxSuffix[1])
    if (Number.isFinite(limit)) {
      return observed <= limit ? 'Confirm' : 'Not Confirm'
    }
  }

  const minGt = r.match(/>\s*(-?\d+(?:\.\d+)?)/)
  if (minGt) {
    const limit = Number.parseFloat(minGt[1])
    if (Number.isFinite(limit)) {
      return observed > limit ? 'Confirm' : 'Not Confirm'
    }
  }

  const minGte = r.match(/(?:≥|>=)\s*(-?\d+(?:\.\d+)?)/)
  if (minGte) {
    const limit = Number.parseFloat(minGte[1])
    if (Number.isFinite(limit)) {
      return observed >= limit ? 'Confirm' : 'Not Confirm'
    }
  }

  const minWord = r.match(
    /(?:min\.?|minimum|nlt|not\s+less\s+than|at\s+least)\s*(-?\d+(?:\.\d+)?)/i,
  )
  if (minWord) {
    const limit = Number.parseFloat(minWord[1])
    if (Number.isFinite(limit)) {
      return observed >= limit ? 'Confirm' : 'Not Confirm'
    }
  }

  const minSuffix = r.match(/(-?\d+(?:\.\d+)?)\s*(?:min\.?|minimum)\b/i)
  if (minSuffix) {
    const limit = Number.parseFloat(minSuffix[1])
    if (Number.isFinite(limit)) {
      return observed >= limit ? 'Confirm' : 'Not Confirm'
    }
  }

  const eqMatch = r.match(/(?:=|equals?)\s*(-?\d+(?:\.\d+)?)/i)
  if (eqMatch) {
    const target = Number.parseFloat(eqMatch[1])
    if (Number.isFinite(target)) {
      return Math.abs(observed - target) < 1e-9 ? 'Confirm' : 'Not Confirm'
    }
  }

  const numbersInReq = [...r.replace(/,/g, '').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) =>
    Number.parseFloat(m[0]),
  )
  if (numbersInReq.length === 1 && !/[<>=≤≥±]|max|min|range|to\b/i.test(r)) {
    const target = numbersInReq[0]
    return Math.abs(observed - target) < 1e-9 ? 'Confirm' : 'Not Confirm'
  }

  return null
}

/** Confirm when observed value meets specified requirement; otherwise Not Confirm. */
export function evaluateResultConformity(
  observedValue: string,
  specifiedRequirement: string,
): ConformityRemark {
  if (isMissing(observedValue) || isMissing(specifiedRequirement)) {
    return PLACEHOLDER
  }

  const qualitative = evaluateQualitative(observedValue, specifiedRequirement)
  if (qualitative) return qualitative

  const observedNum = parseFirstNumber(observedValue)
  if (observedNum !== null) {
    const numeric = evaluateNumeric(observedNum, specifiedRequirement)
    if (numeric) return numeric
  }

  const o = norm(observedValue)
  const r = norm(specifiedRequirement)
  if (o.includes(r) || r.includes(o)) {
    return 'Confirm'
  }

  return 'Not Confirm'
}
