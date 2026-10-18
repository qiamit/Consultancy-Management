/* Clean-up for AI-written text in BIS documents: consistent spacing, sentence capitalisation and
   a closing full stop, without touching abbreviations (BIS, IS, QC, CR…) or numbers. */

/** Rules added to AI prompts so the text comes back properly written. */
export const AI_WRITING_RULES = `Writing rules:
- Proper formal English with correct grammar and punctuation.
- Sentence case: start every sentence with a capital letter and end it with a full stop.
- Keep abbreviations and codes in capitals exactly (BIS, IS, ISI, QC, CRM, GOL, PPE, IS 17631:2022); capitalise proper nouns and names of standards.
- No ALL-CAPS words for emphasis, no emojis, no markdown.`

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])

function tidySpacing(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/([,;:])(?=[^\s\d])/g, '$1 ')
    .trim()
}

/** Capitalises the first letter of the text and of every sentence; keeps the rest of each word as written. */
function capitaliseSentences(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase())
}

/** A full sentence / paragraph: tidy spacing, sentence capitals, closing full stop. */
export function formatAiSentence(raw: string): string {
  // Drop a leading list marker the AI may add ("1.", "2)", "-", "•"); real leading numbers stay.
  let text = tidySpacing(raw.replace(/^\s*(?:[-–•*]|\d{1,2}[.)])\s+/, ''))
  if (!text) return ''
  text = capitaliseSentences(text)
  if (!/[.!?)"']$/.test(text)) text += '.'
  return text
}

/** A short heading / label (e.g. a hygiene aspect): Title Case, small words lower-case, no closing full stop. */
export function formatAiLabel(raw: string): string {
  const text = tidySpacing(raw).replace(/[.;:]+$/, '')
  return text
    .split(' ')
    .map((word, i) => {
      if (!word) return word
      // Leave abbreviations / codes (BIS, QC, IS 17631) and mixed-case words as written.
      if (/[A-Z].*[A-Z]|\d/.test(word) || /[a-z][A-Z]/.test(word)) return word
      const lower = word.toLowerCase()
      if (i > 0 && SMALL_WORDS.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

/** Optional short note (e.g. remarks): tidy and capitalise, no forced full stop. */
export function formatAiNote(raw: string): string {
  const text = tidySpacing(raw)
  return text ? capitaliseSentences(text) : ''
}
