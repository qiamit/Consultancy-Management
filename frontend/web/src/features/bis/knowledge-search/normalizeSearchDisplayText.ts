/**
 * Display-only paragraph-aware normalization for BIS knowledge search results.
 * Does NOT mutate indexed/source text — call only when rendering.
 */

const LAYOUT_NOTE_RE = /\[layout_note:[^\]]*\]/gi
const DIAGNOSTIC_BLOCK_RE =
  /\n*=====?\s*(?:LAYOUT_[A-Z0-9_]+|LAYOUT_NOTE)[^\n]*=====?\n[\s\S]*$/i

/** Lines that should usually keep their own line break (lists / headings / formulas). */
function isStructuralLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  // Clause / annex headings
  if (/^(ANNEX\s+[A-Z]\b|[A-Z]-?\d+(?:\.\d+)*\b|\d+(?:\.\d+)*\b)\s/i.test(t)) return true
  if (/^(SCOPE|REFERENCES|TYPES|REQUIREMENTS|PACKING|MARKING|SAMPLING|TESTS|PRINCIPLE|PROCEDURE|CALCULATION)\b/i.test(t))
    return true
  // Numbered / bulleted lists
  if (/^([a-z]\)|\([a-z]\)|\d+[\).]|[-•*–—])\s+/i.test(t)) return true
  // Table-ish rows (many pipes or aligned numeric cells)
  if ((t.match(/\|/g) || []).length >= 2) return true
  if (/^Table\s+\d+/i.test(t)) return true
  // Formula-ish: short math lines / fraction remnants
  if (/^[𝑀M]\s*[₁1]?\s*([+/×x*]|$)/u.test(t) && t.length < 40) return true
  if (/[=×]\s*100\b/.test(t) && t.length < 80) return true
  if (/^where\b/i.test(t)) return true
  return false
}

function endsLikeSentence(line: string): boolean {
  return /[.!?।:]$/.test(line.trim())
}

/**
 * Soft-wrap PDF extraction breaks → spaces; keep paragraphs / lists / formulas.
 */
export function normalizeSearchDisplayText(raw: string): string {
  if (!raw) return ''

  let text = raw.replace(LAYOUT_NOTE_RE, '')
  text = text.replace(DIAGNOSTIC_BLOCK_RE, '')
  // Drop orphan layout_note lines
  text = text
    .split('\n')
    .filter((line) => !/^\s*\[layout_note:/i.test(line))
    .join('\n')

  // Normalize newlines
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // Collapse 3+ blank lines to paragraph break
  text = text.replace(/\n{3,}/g, '\n\n')

  const paragraphs = text.split(/\n\n/)
  const outParas: string[] = []

  for (const para of paragraphs) {
    const lines = para.split('\n').map((l) => l.replace(/[ \t]+$/g, ''))
    if (lines.every((l) => !l.trim())) continue

    // If any structural line, join carefully line-by-line
    const hasStructural = lines.some((l) => l.trim() && isStructuralLine(l))
    if (hasStructural) {
      const rebuilt: string[] = []
      let buf = ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          if (buf) {
            rebuilt.push(buf)
            buf = ''
          }
          continue
        }
        if (isStructuralLine(trimmed)) {
          if (buf) {
            rebuilt.push(buf)
            buf = ''
          }
          rebuilt.push(trimmed)
          continue
        }
        // Soft-wrap continuation into buffer
        if (!buf) {
          buf = trimmed
        } else if (endsLikeSentence(buf) || isStructuralLine(buf)) {
          rebuilt.push(buf)
          buf = trimmed
        } else {
          buf = `${buf} ${trimmed}`
        }
      }
      if (buf) rebuilt.push(buf)
      outParas.push(rebuilt.join('\n'))
      continue
    }

    // Plain paragraph: join single newlines with spaces
    const joined = lines
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/[ \t]{2,}/g, ' ')
    outParas.push(joined)
  }

  return outParas
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}
