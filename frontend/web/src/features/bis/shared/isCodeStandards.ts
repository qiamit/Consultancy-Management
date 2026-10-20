import { downloadCmpf311MasterFile, extractProductManualText, loadCmpf311MasterData } from '../projects/cmpf311Model'

/** The Indian Standard and product manual PDFs attached to the IS Code master, as text. */
export async function loadStandardTexts(isCodeId: string): Promise<Array<{ name: string; kind: string; text: string }>> {
  const master = await loadCmpf311MasterData(isCodeId).catch(() => null)
  const files = (master?.availableFiles ?? []).filter((f) => f.fileName.toLowerCase().endsWith('.pdf'))
  const out = await Promise.all(
    files.map(async (option) => {
      try {
        const text = (await extractProductManualText(await downloadCmpf311MasterFile(option))).trim()
        return text.length > 40 ? { name: option.fileName, kind: option.documentKind, text } : null
      } catch {
        return null // A file that cannot be read must not stop the review.
      }
    }),
  )
  return out.filter((x): x is { name: string; kind: string; text: string } => x !== null)
}

const WORD = /[a-z0-9.]{3,}/g

/** The passages of the standards that talk about the given parameters, so the AI gets a short, relevant prompt. */
export function relevantExcerpts(standards: Array<{ name: string; kind: string; text: string }>, queries: string[], budget: number): string {
  const queryWords = new Set(queries.flatMap((q) => q.toLowerCase().match(WORD) ?? []))
  const chunks: Array<{ label: string; text: string; score: number }> = []
  for (const s of standards) {
    const lines = s.text.split('\n')
    for (let i = 0; i < lines.length; i += 14) {
      const text = lines.slice(i, i + 18).join('\n')
      const words = text.toLowerCase().match(WORD) ?? []
      const score = words.reduce((n, w) => n + (queryWords.has(w) ? 1 : 0), 0) / Math.sqrt(words.length + 20)
      chunks.push({ label: `${s.kind}: ${s.name}`, text, score })
    }
  }
  const picked: string[] = []
  let used = 0
  for (const c of chunks.sort((a, b) => b.score - a.score)) {
    if (c.score <= 0 || used + c.text.length > budget) continue
    picked.push(`[${c.label}]\n${c.text}`)
    used += c.text.length
  }
  return picked.join('\n\n')
}

