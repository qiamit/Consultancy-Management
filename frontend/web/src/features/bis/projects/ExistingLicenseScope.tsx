import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { fetchExistingLicenseScopesByCmL, type BisExistingLicenseScopeRecord } from './bisProjectsApi'
import { listBisProjectFiles, type BisProjectViewFile } from './bisProjectFilesApi'
import { parseBisNotesScope } from './types'

type ExistingScopeRecord = BisExistingLicenseScopeRecord & { files: BisProjectViewFile[] }

export function ExistingLicenseScope({ cmLDigits }: { cmLDigits: string }) {
  const digits = cmLDigits.replace(/\D/g, '')
  const [result, setResult] = useState<{
    digits: string
    records: ExistingScopeRecord[]
    error: string
  } | null>(null)

  useEffect(() => {
    if (!digits) return
    let cancelled = false
    void (async () => {
      try {
        const scopes = await fetchExistingLicenseScopesByCmL(digits)
        const withFiles = await Promise.all(scopes.map(async (scope) => ({
          ...scope,
          files: await listBisProjectFiles(scope.id, 'manufacturing-scope').catch(() => []),
        })))
        if (!cancelled) setResult({ digits, records: withFiles, error: '' })
      } catch {
        if (!cancelled) setResult({
          digits,
          records: [],
          error: 'Could not load the existing license scope for this CM/L number.',
        })
      }
    })()
    return () => { cancelled = true }
  }, [digits])

  if (!digits) return null
  const currentResult = result?.digits === digits ? result : null
  const records = currentResult?.records ?? []
  const loading = currentResult == null
  const error = currentResult?.error ?? ''

  return (
    <section className="space-y-3 border border-stone-400 bg-white p-3 sm:p-4" aria-label="Existing License Scope">
      <div className="border-b border-stone-300 pb-2">
        <h3 className="text-sm font-semibold text-stone-900">Existing License Scope</h3>
      </div>

      {loading ? <p className="text-sm text-stone-600">Loading Existing Scope…</p> : null}
      {error ? <p role="status" className="text-sm text-red-700">{error}</p> : null}
      {!loading && !error && records.length === 0 ? (
        <p className="text-sm text-stone-600">No Existing License Scope Was Found for This CM/L Number.</p>
      ) : null}

      {records.map((record) => {
        const scope = parseBisNotesScope(record.notes)
        const populatedRows = scope.mode === 'table'
          ? scope.rows.filter((row) => row.some((cell) => cell.trim()))
          : []
        return (
          <article key={record.id} className="min-w-0 border border-stone-300 bg-stone-50 p-3">
            {scope.mode === 'plain' && scope.text.trim() ? (
              <p className="whitespace-pre-wrap break-words text-sm text-stone-800">{scope.text}</p>
            ) : scope.mode === 'table' && populatedRows.length ? (
              <div className="w-full overflow-hidden border border-stone-300 bg-white">
                <table className="w-full table-fixed border-collapse text-left text-xs">
                  {scope.headers.length === 2 ? (
                    <colgroup><col className="w-px min-w-[7rem]" /><col /></colgroup>
                  ) : null}
                  <thead className="bg-stone-100 text-stone-800">
                    <tr>{scope.headers.map((header, index) => (
                      <th key={`${index}-${header}`} className="whitespace-normal break-words [overflow-wrap:anywhere] border-b border-r border-stone-300 px-2 py-1.5 font-semibold last:border-r-0">{header || `Column ${index + 1}`}</th>
                    ))}</tr>
                  </thead>
                  <tbody>{populatedRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="odd:bg-white even:bg-stone-50">
                      {scope.headers.map((_, cellIndex) => (
                        <td key={cellIndex} className="whitespace-normal break-words [overflow-wrap:anywhere] border-b border-r border-stone-200 px-2 py-1.5 align-top last:border-r-0">{row[cellIndex] || '—'}</td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-stone-500">No Text or Table Scope Is Saved on This License.</p>
            )}

            {record.files.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {record.files.map((file) => (
                  file.viewUrl ? (
                    <a key={file.id} href={file.viewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 border border-stone-400 bg-white px-2 py-1 text-xs font-medium text-stone-800 hover:bg-amber-50">
                      {file.file_name}<ExternalLink size={12} aria-hidden />
                    </a>
                  ) : (
                    <span key={file.id} title={file.error} className="border border-stone-300 px-2 py-1 text-xs text-stone-500">{file.file_name} (unavailable)</span>
                  )
                ))}
              </div>
            ) : null}
          </article>
        )
      })}
    </section>
  )
}
