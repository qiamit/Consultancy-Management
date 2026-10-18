import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { downloadUndertakingSource, loadUndertakingSources, type UndertakingSource } from './undertakingSources'
import type { BisProjectRow } from './types'

export type UndertakingSourcesState = ReturnType<typeof useUndertakingSources>

/**
 * Source PDFs for undertaking AI: the IS Code master files (plus, for Undertaking Other, the application's and
 * client's documents) and PDFs attached from the computer. Standard / Product Manual files start selected.
 */
export function useUndertakingSources(row: BisProjectRow, active: boolean, includeApplication: boolean) {
  const [sources, setSources] = useState<UndertakingSource[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [localFiles, setLocalFiles] = useState<File[]>([])

  useEffect(() => {
    if (!active) return
    let live = true
    void loadUndertakingSources(row, includeApplication)
      .then((data) => {
        if (!live) return
        setSources(data.files)
        setError(data.error)
        setSelected(new Set(data.files.filter((f) => includeApplication || /manual|standard|specification|IS Document/i.test(`${f.documentKind} ${f.fileName}`)).map((f) => f.id)))
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : 'Could not load source PDFs.')
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [active, row, includeApplication])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const count = sources.filter((s) => selected.has(s.id)).length + localFiles.length

  /** The selected PDFs as files; stored files that cannot be read are skipped with a warning. */
  const files = async (): Promise<File[]> => {
    const chosen = sources.filter((s) => selected.has(s.id))
    const settled = await Promise.allSettled(chosen.map(downloadUndertakingSource))
    const missing = chosen.filter((_, i) => settled[i]!.status === 'rejected').map((s) => s.fileName)
    if (missing.length) toast.warning(`Could not read ${missing.join(', ')} — skipped.`)
    return [...settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : [])), ...localFiles]
  }

  return { sources, error, loading, selected, toggle, localFiles, setLocalFiles, count, files }
}
