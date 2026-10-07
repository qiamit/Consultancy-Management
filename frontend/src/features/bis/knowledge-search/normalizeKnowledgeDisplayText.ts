/**
 * Display-only text normalization for BIS knowledge search results.
 * Does NOT modify indexed/source text — only UI presentation.
 */

/** Strip internal diagnostic blocks that must never face the user. */
export function stripInternalDiagnostics(text: string): string {
  let t = text || ''
  t = t.replace(/\[\s*layout_note\s*:[^\]]*\]/gi, '')
  t = t.replace(/=====+\s*LAYOUT_[^=\n]*=====+/gi, '')
  t = t.replace(/=====+\s*LAYOUT[^=\n]*=====+/gi, '')
  return t
}

function isLikelyHeading(line: string): boolean {
  const s = line.trim()
  if (!s) return false
  // Keep short structural headings only — not long clause prose that starts with a number.
  if (/^ANNEX\s+[A-Z]\b.{0,80}$/i.test(s)) return true
  if (/^A-\d+(?:\.\d+)*\s+[A-Z][A-Z0-9 /,—\-]{0,60}$/i.test(s)) return true
  if (/^\d+(?:\.\d+)*\s*$/.test(s)) return true
  // e.g. "1 SCOPE", "4 REQUIREMENTS" (short ALL-CAPS style titles)
  if (/^\d+(?:\.\d+)*\s+[A-Z][A-Z0-9 /,—\-]{1,60}$/.test(s) && s.length <= 72) return true
  if (
    /^(SCOPE|REFERENCES|TYPES|REQUIREMENTS|PACKING|MARKING|SAMPLING|TESTS|FOREWORD|PRINCIPLE|PROCEDURE|CALCULATION)\b$/i.test(
      s,
    )
  ) {
    return true
  }
  return false
}

function isListItem(line: string): boolean {
  const s = line.trim()
  return /^(?:[a-z]\)|\([a-z]\)|[ivx]+\)|\d+[.)]|[-•*])\s+/i.test(s)
}

function isFormulaish(line: string): boolean {
  const s = line.trim()
  if (!s) return false
  if (/[×÷=]|\/\s*\(|M\s*\/\s*\(|M1|percent by mass\s*=/i.test(s)) return true
  if (/^\s*where\b/i.test(s)) return true
  if (/^\s*M\s*=/.test(s) || /^\s*M1\s*=/.test(s)) return true
  return false
}

function isTableish(line: string): boolean {
  const s = line.trim()
  if (!s) return false
  if (/\|/.test(s)) return true
  if (/^Table\s+\d+/i.test(s)) return true
  if (/\|\|/.test(s)) return true
  const nums = (s.match(/\d+(?:\.\d+)?/g) || []).length
  const words = (s.match(/[A-Za-z\u0900-\u097F]+/g) || []).length
  if (nums >= 4 && words <= 6 && s.length < 120) return true
  return false
}

/**
 * Paragraph-aware normalization of PDF hard wraps for display.
 * - Single newlines inside paragraphs → spaces
 * - Blank lines (paragraph breaks) preserved
 * - Headings, lists, formulas, tables kept on their own lines
 */
export function normalizeKnowledgeDisplayText(raw: string): string {
  let text = stripInternalDiagnostics(raw)
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  text = text.replace(/\n{3,}/g, '\n\n')

  const lines = text.split('\n')
  const out: string[] = []
  let paraBuf = ''

  const flushPara = () => {
    if (!paraBuf) return
    const cleaned = paraBuf.replace(/[ \t]{2,}/g, ' ').trim()
    if (cleaned) out.push(cleaned)
    paraBuf = ''
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    if (!trimmed) {
      flushPara()
      if (out.length && out[out.length - 1] !== '') out.push('')
      continue
    }

    const special =
      isLikelyHeading(trimmed) ||
      isListItem(trimmed) ||
      isFormulaish(trimmed) ||
      isTableish(trimmed)

    if (special) {
      flushPara()
      out.push(trimmed)
      continue
    }

    if (!paraBuf) {
      paraBuf = trimmed
    } else if (/[-–—]$/.test(paraBuf)) {
      paraBuf = paraBuf.replace(/[-–—]$/, '') + trimmed
    } else {
      paraBuf = `${paraBuf} ${trimmed}`
    }
  }
  flushPara()

  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}
