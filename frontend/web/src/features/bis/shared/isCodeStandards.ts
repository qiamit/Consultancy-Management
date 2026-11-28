import { supabase } from '@/lib/supabaseClient'
import { fetchIsCodeEdition, fetchStandardFolders, pickStandardDocs } from '@/features/masters/is-codes/requiredTestsApi'
import { downloadCmpf311MasterFile, extractProductManualText, loadCmpf311MasterData } from '../projects/cmpf311Model'

type StandardText = { name: string; kind: string; text: string }

/**
 * The IS Code's own Standard (with its Amendments) and Product Manual from the Standards Library, as text. The files
 * once uploaded to the IS Code Master were removed on 20 Nov 2026, so Stop Marking found "no Indian Standard" for IS 398
 * Part 1 although the library has it (owner, 28 Nov 2026).
 */
async function libraryStandardTexts(isCodeId: string): Promise<StandardText[]> {
  const [folders, edition] = await Promise.all([fetchStandardFolders(isCodeId), fetchIsCodeEdition(isCodeId)])
  if (!folders.length) return []
  const { standards, manuals } = await pickStandardDocs(folders, edition)
  const relpaths = [...standards, ...manuals]
  if (!relpaths.length) return []
  const { data: docs, error } = await supabase.from('standard_docs').select('id, relpath, kind').in('relpath', relpaths)
  if (error || !docs?.length) return []
  const out: StandardText[] = []
  for (const d of docs as Array<{ id: number; relpath: string; kind: string }>) {
    const { data: pages } = await supabase.from('standard_pages').select('page, text').eq('doc_id', d.id).order('page').limit(400)
    const text = ((pages ?? []) as Array<{ page: number; text: string }>).map((p) => `[Page ${p.page}]\n${p.text ?? ''}`).join('\n').trim()
    if (text.length > 40) out.push({ name: d.relpath.split('/').pop() ?? d.relpath, kind: d.kind, text })
  }
  return out
}

/** The IS Code's Standard and Product Manual as text: from the Standards Library, else the PDFs attached to the IS Code master. */
export async function loadStandardTexts(isCodeId: string): Promise<StandardText[]> {
  const fromLibrary = await libraryStandardTexts(isCodeId).catch(() => [])
  if (fromLibrary.length) return fromLibrary
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
  return out.filter((x): x is StandardText => x !== null)
}

const WORD = /[a-z0-9.]{3,}/g

/** The passages of the standards that talk about the given parameters, so the AI gets a short, relevant prompt. */
export function relevantExcerpts(standards: StandardText[], queries: string[], budget: number): string {
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

