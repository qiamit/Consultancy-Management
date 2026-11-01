/** What a reply can quote: enough to know what is meant, without filling the chat. */
const MAX_QUOTE_CHARS = 1000

const cutQuote = (text: string) => {
  const clean = text.replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim()
  return clean.length > MAX_QUOTE_CHARS ? `${clean.slice(0, MAX_QUOTE_CHARS).trimEnd()}…` : clean
}

/** The message text with the quoted part on top, in Markdown ("> " lines), as saved and as the AI reads it. */
export function withQuote(quote: string | null | undefined, text: string): string {
  const q = quote ? cutQuote(quote) : ''
  return q ? `${q.split('\n').map((line) => `> ${line}`).join('\n')}\n\n${text}` : text
}

/** Splits a saved message back into its quote and its own text. */
export function splitQuote(content: string): { quote: string | null; text: string } {
  const lines = content.replace(/\r/g, '').split('\n')
  let n = 0
  while (n < lines.length && lines[n]!.startsWith('> ')) n += 1
  if (!n) return { quote: null, text: content }
  return { quote: lines.slice(0, n).map((l) => l.slice(2)).join('\n'), text: lines.slice(n).join('\n').trim() }
}
