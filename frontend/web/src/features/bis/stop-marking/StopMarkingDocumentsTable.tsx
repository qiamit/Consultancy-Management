import { useEffect, useMemo, useState } from 'react'
import { Eye, FileDown, FileType, LoaderCircle, Paperclip, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BisProjectRow } from '../projects/types'
import { BisDocumentPrintPreviewDialog } from '../projects/BisDocumentPrintPreviewDialog'
import { ManakDocumentActions } from '../projects/ManakDocumentActions'
import { openStopMarkingReport } from './stopMarkingApi'
import {
  downloadDocumentPdf,
  downloadDocumentWord,
  downloadSelectedPdf,
  downloadSelectedWord,
  listCaseDocuments,
  previewHtmlFor,
  printDocument,
  type CaseDocument,
} from './stopMarkingDocuments'
import type { StopMarkingRow } from './types'

const thCls = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'
const checkCls = 'h-4 w-4 rounded-none border-stone-500 text-amber-700 disabled:opacity-40'
const tbtn = 'h-8 gap-1.5 rounded-none border-stone-400 px-2.5 text-xs'

/**
 * Step 5: every document of the case in one table — the BIS letter and test reports, the letters the system generates
 * (reply, Sample Offer Letter, Factory Test Report) and the supporting documents — each with Preview, Print, PDF and Word,
 * and tick boxes to preview, print or download the selected ones together.
 */
export function StopMarkingDocumentsTable({ row, bisRow }: { row: StopMarkingRow; bisRow: BisProjectRow | null }) {
  const docs = useMemo(() => listCaseDocuments(row), [row])
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewDocs, setPreviewDocs] = useState<CaseDocument[]>([])
  const [previewTitle, setPreviewTitle] = useState('Documents')
  const seen = useRefSet()

  // Everything available is ticked at first; new uploads join the selection.
  useEffect(() => {
    setPicked((cur) => {
      const next = new Set(cur)
      for (const d of docs) if (d.available && !cur.has(d.id) && !seen.current.has(d.id)) next.add(d.id)
      for (const d of docs) seen.current.add(d.id)
      for (const id of [...next]) if (!docs.some((d) => d.id === id && d.available)) next.delete(id)
      return next
    })
  }, [docs]) // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = docs.filter((d) => picked.has(d.id) && d.available)
  const allOn = docs.filter((d) => d.available).length > 0 && docs.filter((d) => d.available).every((d) => picked.has(d.id))
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something Went Wrong.')
    } finally {
      setBusy(null)
    }
  }

  const preview = (list: CaseDocument[]) =>
    run('preview', async () => {
      const files = list.filter((d) => d.kind === 'file')
      if (list.length === 1 && files.length === 1) return openStopMarkingReport(files[0]!.path)
      const html = await previewHtmlFor(row, bisRow, list)
      setPreviewDocs(list)
      setPreviewTitle(list.length === 1 ? list[0]!.label : 'Selected Documents')
      setPreviewHtml(html)
    })

  const actions = (d: CaseDocument) => (
    <ManakDocumentActions
      disabled={busy !== null || !d.available}
      actions={[
        { label: `Preview — ${d.label}`, onClick: () => void preview([d]), icon: Eye },
        { label: `Print — ${d.label}`, onClick: () => void run(`p-${d.id}`, () => printDocument(row, bisRow, d)), icon: Printer },
        { label: `Download PDF — ${d.label}`, onClick: () => void run(`f-${d.id}`, () => downloadDocumentPdf(row, bisRow, d)), icon: FileDown },
        {
          label: d.kind === 'generated' ? `Download Word — ${d.label}` : 'Word Is Available for Generated Letters Only',
          onClick: () => d.kind === 'generated' && void run(`w-${d.id}`, () => downloadDocumentWord(row, bisRow, d)),
          icon: FileType,
          disabled: d.kind !== 'generated',
        },
      ]}
    />
  )

  const bulk = (label: string, key: string, icon: typeof Eye, fn: () => Promise<void>) => (
    <Button type="button" variant="outline" className={tbtn} disabled={busy !== null || chosen.length === 0} onClick={() => void run(key, fn)}>
      {busy === key ? <LoaderCircle size={14} className="animate-spin" /> : (() => { const Icon = icon; return <Icon size={14} /> })()} {label}
    </Button>
  )
  const title = `Non-Conformity Documents${row.cm_l_digits ? ` CM-L-${row.cm_l_digits}` : ''}`

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600">Documents</span>
        <span className="text-xs text-stone-600">{chosen.length} Selected</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {bulk('Preview Selected', 'preview', Eye, () => preview(chosen))}
          {bulk('Print Selected', 'print-all', Printer, async () => {
            const gens = chosen.filter((d) => d.kind === 'generated')
            if (!gens.length) throw new Error('Print Selected works for the letters the system generates. Use Download PDF for the rest.')
            const html = await previewHtmlFor(row, bisRow, gens)
            const { openPendingPrintWindow, openPrintHtml } = await import('../print/openPrintHtml')
            const err = openPrintHtml(html, { target: openPendingPrintWindow('Preparing documents…') })
            if (err) throw new Error(err)
          })}
          {bulk('Download Selected PDF', 'pdf-all', FileDown, async () => {
            await downloadSelectedPdf(row, bisRow, chosen, `${title}.pdf`)
            toast.success(`${chosen.length} Document${chosen.length > 1 ? 's' : ''} Downloaded as One PDF.`)
          })}
          {bulk('Download Selected Word', 'word-all', FileType, async () => {
            const n = await downloadSelectedWord(row, bisRow, chosen, title)
            toast.success(`${n} Letter${n > 1 ? 's' : ''} Downloaded as One Word File.`)
          })}
        </div>
      </div>

      <div className="overflow-x-auto border border-stone-300 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(thCls, 'w-8 px-1 text-center')}>
                <input
                  type="checkbox"
                  className={checkCls}
                  aria-label="Select All Documents"
                  checked={allOn}
                  onChange={(e) => setPicked(e.target.checked ? new Set(docs.filter((d) => d.available).map((d) => d.id)) : new Set())}
                />
              </th>
              <th className={thCls}>Document</th>
              <th className={cn(thCls, 'hidden md:table-cell')}>Detail</th>
              <th className={cn(thCls, 'w-[1%] text-center')}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d, n) => (
              <tr key={d.id} className={cn(n % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]', !d.available && 'opacity-60')}>
                <td className={cn(tdCls, 'px-1 text-center')}>
                  <input
                    type="checkbox"
                    className={checkCls}
                    aria-label={`Select ${d.label}`}
                    disabled={!d.available}
                    checked={picked.has(d.id) && d.available}
                    onChange={(e) => setPicked((cur) => { const next = new Set(cur); if (e.target.checked) next.add(d.id); else next.delete(d.id); return next })}
                  />
                </td>
                <td className={cn(tdCls, 'font-semibold text-stone-800')}>
                  <span className="inline-flex items-center gap-1.5">
                    {d.kind === 'file' ? <Paperclip size={13} className="shrink-0 text-amber-800" aria-hidden /> : null}
                    {d.label}
                  </span>
                  <span className="block text-xs font-normal text-stone-500 md:hidden">{d.note}</span>
                </td>
                <td className={cn(tdCls, 'hidden text-xs text-stone-600 md:table-cell')}>{d.note}</td>
                <td className={cn(tdCls, 'whitespace-nowrap text-center')}>{d.available ? actions(d) : <span className="text-xs text-stone-400">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BisDocumentPrintPreviewDialog
        open={previewHtml !== null}
        onOpenChange={(open) => { if (!open) setPreviewHtml(null) }}
        row={bisRow}
        kind="osl-sample-requirements"
        title={previewTitle}
        generatedHtml={previewHtml}
        editable={{
          format: 'word',
          onDownload: () => void run('word-prev', async () => {
            const n = await downloadSelectedWord(row, bisRow, previewDocs, previewTitle)
            toast.success(`${n} Letter${n > 1 ? 's' : ''} Downloaded as Word.`)
          }),
        }}
      />
    </div>
  )
}

/** A set that survives re-renders without causing one. */
function useRefSet() {
  const [ref] = useState(() => ({ current: new Set<string>() }))
  return ref
}
