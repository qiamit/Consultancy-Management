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
  'into',
  'onto',
  'with',
  'without',
  'over',
  'under',
  'than',
  'if',
  'etc',
])

function titleCaseWord(word: string, forceCapitalize: boolean): string {
  if (!word) return word
  if (word.includes('/')) {
    return word
      .split('/')
      .map((part, index) => titleCaseWord(part, forceCapitalize && index === 0))
      .join('/')
  }
  if (word.includes('-')) {
    return word
      .split('-')
      .map((part, index) => titleCaseWord(part, forceCapitalize && index === 0))
      .join('-')
  }

  const match = word.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z']*)([^A-Za-z]*)$/)
  if (!match) return word
  const [, prefix, letters, suffix] = match
  const lower = letters.toLowerCase()
  if (!forceCapitalize && SMALL_WORDS.has(lower)) return `${prefix}${lower}${suffix}`
  return `${prefix}${lower.charAt(0).toUpperCase()}${lower.slice(1)}${suffix}`
}

/** Title-case requirement text; keep small words like and/or/of/for lowercase (except the first word). */
export function toProperRequirementText(value: string): string {
  if (!value.trim()) return value
  return value
    .split('\n')
    .map((line) => {
      const pieces = line.split(/(\s+)/)
      let firstWord = true
      return pieces
        .map((piece) => {
          if (!piece || /^\s+$/.test(piece)) return piece
          const next = titleCaseWord(piece, firstWord)
          firstWord = false
          return next
        })
        .join('')
    })
    .join('\n')
}
