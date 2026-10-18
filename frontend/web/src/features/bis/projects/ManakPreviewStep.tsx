import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Eye, FileDown, FileSpreadsheet, FileType, Paperclip, Printer, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import { openPendingPrintWindow } from '../print/openPrintHtml'
import { fetchBisModulePayload } from './bisModuleDataApi'
import { createBisProjectFileUrls } from './bisProjectFilesApi'
import { writePdfViewerHtml } from './mergeBisProjectFilesPdf'
import { BIS_APPLICATION_STEPS } from './bisApplicationSteps'
import type { BisProjectRow } from './types'
import {
  APPLICATION_DOCUMENT_COMPONENT_KINDS,
  buildApplicationDocumentRows,
  isImageAsset,
  type PreviewFile,
  type PreviewSelection,
  type Row,
} from './applicationDocuments'

export type { PreviewFile, PreviewSelection } from './applicationDocuments'

type Rec = Record<string, unknown>

/* Step 8 — Preview Application: every generated document (only those marked Applicable on Steps 1–7) and every
   uploaded file, one row each, with Preview / PDF / Editable (Word or Excel) columns that can each be ticked and
   then previewed or downloaded together. */

/** Browser-viewable types for View (by file extension). */
const VIEW_TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

const thCls = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'
const checkCls = 'h-4 w-4 rounded-none border-stone-500 text-amber-700 disabled:opacity-30'
const iconBtn = 'h-8 w-8 rounded-none border border-stone-400 bg-white/70 p-0 text-amber-800 shadow-sm hover:border-amber-600 hover:bg-amber-50'

type Col = 'preview' | 'print' | 'pdf' | 'edit'
const COLS: Col[] = ['preview', 'print', 'pdf', 'edit']
const COL_TITLE: Record<Col, string> = { preview: 'Preview', print: 'Print', pdf: 'PDF', edit: 'Editable File' }
const EMPTY: PreviewSelection = { previewKinds: [], previewFiles: [], printKinds: [], printFiles: [], pdfKinds: [], pdfFiles: [], wordKinds: [], excelKinds: [] }

const toolbarBtn =
  'relative h-9 w-9 rounded-none border border-amber-700 bg-white p-0 text-amber-800 shadow-sm hover:bg-amber-50 disabled:opacity-40'

export function ManakPreviewStep({
  row,
  refreshKey,
  excelKinds,
  busy,
  onEditStep,
  onPreview,
  onPrint,
  onPdf,
  onEditable,
  onPreviewSelected,
  onPrintSelected,
  onDownloadSelected,
  onEditableSelected,
}: {
  row: BisProjectRow
  refreshKey: number
  /** Documents whose editable file is Excel (the rest are Word). */
  excelKinds: readonly BisPrintDocumentKind[]
  busy: boolean
  onEditStep: (stepIndex: number) => void
  onPreview: (kind: BisPrintDocumentKind) => void
  onPrint: (kind: BisPrintDocumentKind) => void
  onPdf: (kind: BisPrintDocumentKind) => void
  onEditable: (kind: BisPrintDocumentKind, format: 'word' | 'excel') => void
  onPreviewSelected: (selection: PreviewSelection) => void
  onPrintSelected: (selection: PreviewSelection) => void
  /** PDF column: one merged PDF. */
  onDownloadSelected: (selection: PreviewSelection) => void
  /** Editable column: Word / Excel files. */
  onEditableSelected: (selection: PreviewSelection) => void
}) {
  const [payloads, setPayloads] = useState<Partial<Record<string, Rec | null>>>({})
  const [files, setFiles] = useState<PreviewFile[]>([])
  const [loading, setLoading] = useState(true)
  const [ticked, setTicked] = useState<Record<Col, Set<string>>>({ preview: new Set(), print: new Set(), pdf: new Set(), edit: new Set() })

  useEffect(() => {
    let active = true
    const kinds = APPLICATION_DOCUMENT_COMPONENT_KINDS
    void Promise.all([
      Promise.all(kinds.map((k) => fetchBisModulePayload(row.id, k).catch(() => null))),
      supabase.from('bis_project_files').select('id, file_name, storage_path, doc_kind').eq('bis_project_id', row.id).order('created_at', { ascending: true }),
    ])
      .then(([loaded, filesRes]) => {
        if (!active) return
        setPayloads(Object.fromEntries(kinds.map((k, i) => [k, loaded[i] as Rec | null])))
        const list = ((filesRes.data ?? []) as PreviewFile[]).filter((f) => f.storage_path && !isImageAsset(f.doc_kind))
        setFiles(list)
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not load the application documents.'))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [row.id, refreshKey])

  const rows = useMemo<Row[]>(() => buildApplicationDocumentRows(row, payloads, files), [payloads, files, row])

  // Uploaded files have no generated preview or editable copy: View opens them, PDF and Print still work.
  const canTick = (r: Row, col: Col) => (col !== 'edit' && col !== 'preview') || r.type === 'doc'
  const toggle = (col: Col, id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev[col])
      if (on) next.add(id)
      else next.delete(id)
      return { ...prev, [col]: next }
    })
  const rowTicked = (r: Row) => COLS.filter((c) => canTick(r, c)).every((c) => ticked[c].has(r.id))
  const toggleRow = (r: Row, on: boolean) =>
    setTicked((prev) => {
      const next = { ...prev }
      for (const c of COLS) {
        if (!canTick(r, c)) continue
        const set = new Set(next[c])
        if (on) set.add(r.id)
        else set.delete(r.id)
        next[c] = set
      }
      return next
    })

  const selection = (): PreviewSelection => {
    const pick = (col: Col) => rows.filter((r) => ticked[col].has(r.id))
    const docKinds = (list: Row[]) => list.flatMap((r) => (r.type === 'doc' ? [r.kind] : []))
    const docFiles = (list: Row[]) => list.flatMap((r) => (r.type === 'file' ? [r.file] : []))
    const edit = docKinds(pick('edit'))
    return {
      previewKinds: docKinds(pick('preview')),
      previewFiles: docFiles(pick('preview')),
      printKinds: docKinds(pick('print')),
      printFiles: docFiles(pick('print')),
      pdfKinds: docKinds(pick('pdf')),
      pdfFiles: docFiles(pick('pdf')),
      wordKinds: edit.filter((k) => !excelKinds.includes(k)),
      excelKinds: edit.filter((k) => excelKinds.includes(k)),
    }
  }

  const viewFile = async (file: PreviewFile) => {
    const target = openPendingPrintWindow(`Opening ${file.file_name}…`)
    try {
      const urls = await createBisProjectFileUrls(file.storage_path, file.file_name)
      if (!urls.viewUrl) throw new Error('Unable to open this file.')
      // Re-type the bytes so the browser shows the file in the tab instead of downloading it.
      const res = await fetch(urls.viewUrl)
      if (!res.ok) throw new Error('Unable to open this file.')
      const ext = (file.file_name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
      const type = VIEW_TYPES[ext] ?? res.headers.get('content-type') ?? 'application/octet-stream'
      const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type }))
      // Write a viewer page into the tab (navigating a tab to a blob: URL is refused by some browsers).
      const win = target ?? window.open('', '_blank')
      if (!win) throw new Error('Allow popups to view the file.')
      if (type.startsWith('image/')) {
        win.document.open()
        win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${file.file_name.replace(/</g, '&lt;')}</title><style>html,body{margin:0;min-height:100%;background:#525659;display:flex;align-items:center;justify-content:center}img{max-width:100%;height:auto;background:#fff}</style></head><body><img src="${url}" alt=""/></body></html>`)
        win.document.close()
      } else writePdfViewerHtml(win, file.file_name, url, false)
      window.setTimeout(() => URL.revokeObjectURL(url), 600_000)
    } catch (err) {
      target?.close()
      toast.error(err instanceof Error ? err.message : 'Unable to open this file.')
    }
  }

  const cell = (r: Row, col: Col, button: ReactNode) => (
    <td className={cn(tdCls, 'text-center')}>
      <span className="inline-flex items-center gap-2">
        {button}
        <input
          type="checkbox"
          className={checkCls}
          aria-label={`Select ${COL_TITLE[col]} — ${r.label}`}
          disabled={!canTick(r, col)}
          checked={ticked[col].has(r.id)}
          onChange={(e) => toggle(col, r.id, e.target.checked)}
        />
      </span>
    </td>
  )

  /** Toolbar: one icon button per column, acting on that column's ticked rows. */
  const toolbar: Array<{ col: Col; title: string; icon: ReactNode; run: (sel: PreviewSelection) => void }> = [
    { col: 'preview', title: 'Preview Selected', icon: <Eye size={16} />, run: onPreviewSelected },
    { col: 'print', title: 'Print Selected', icon: <Printer size={16} />, run: onPrintSelected },
    { col: 'pdf', title: 'Download Selected (PDF)', icon: <FileDown size={16} />, run: onDownloadSelected },
    { col: 'edit', title: 'Download Selected Editable Files (Word / Excel)', icon: <FileType size={16} />, run: onEditableSelected },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-stone-900">Application Submission — Preview</h3>
        <div className="flex items-center gap-1.5">
          {toolbar.map(({ col, title, icon, run }) => (
            <Button
              key={col}
              type="button"
              variant="ghost"
              className={toolbarBtn}
              disabled={busy || ticked[col].size === 0}
              title={ticked[col].size ? `${title} (${ticked[col].size})` : title}
              aria-label={title}
              onClick={() => run(selection())}
            >
              {icon}
              {ticked[col].size ? (
                <span className="absolute -right-1.5 -top-1.5 min-w-[1rem] rounded-full bg-amber-700 px-1 text-[10px] font-bold leading-4 text-white">{ticked[col].size}</span>
              ) : null}
            </Button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-xs text-stone-500">Loading application documents…</p> : null}

      <div className="overflow-x-auto border border-stone-400 bg-[#fffcf7]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(thCls, 'w-8 px-1')} aria-label="Select row" />
              <th className={cn(thCls, 'text-left')}>Document &amp; Information Detail</th>
              <th className={cn(thCls, 'w-[1%] whitespace-nowrap text-center')}>Preview</th>
              <th className={cn(thCls, 'w-[1%] whitespace-nowrap text-center')}>Print</th>
              <th className={cn(thCls, 'w-[1%] whitespace-nowrap text-center')}>PDF</th>
              <th className={cn(thCls, 'w-[1%] text-center leading-tight')}>
                Editable
                <br />
                File
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, n) => {
              const header =
                n === 0 || rows[n - 1]!.step !== r.step ? (
                  <tr key={`step-${r.step}`} className="bg-stone-200/70">
                    <td colSpan={6} className="border border-[#e7e0d4] px-2 py-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-700">
                          {r.step + 1}. {BIS_APPLICATION_STEPS[r.step]?.title ?? 'Other'}
                        </span>
                        <button type="button" className="text-[11px] font-semibold text-amber-800 underline-offset-2 hover:underline" onClick={() => onEditStep(r.step)}>
                          Edit step
                        </button>
                      </span>
                    </td>
                  </tr>
                ) : null
              const editFormat: 'word' | 'excel' | null = r.type === 'doc' ? (excelKinds.includes(r.kind) ? 'excel' : 'word') : null
              return [
                header,
                <tr key={r.id} className={n % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                  <td className={cn(tdCls, 'px-1 text-center')}>
                    <input type="checkbox" className={checkCls} aria-label={`Select row — ${r.label}`} checked={rowTicked(r)} onChange={(e) => toggleRow(r, e.target.checked)} />
                  </td>
                  <td className={tdCls}>
                    <span className="flex items-center gap-2 font-semibold text-stone-800">
                      {r.type === 'doc' ? <ScrollText className="h-4 w-4 shrink-0 text-amber-800" aria-hidden /> : <Paperclip className="h-4 w-4 shrink-0 text-stone-500" aria-hidden />}
                      <span className="min-w-0 break-words">{r.label}</span>
                    </span>
                  </td>
                  {r.type === 'doc' ? (
                    cell(
                      r,
                      'preview',
                      <Button type="button" size="sm" variant="ghost" className={iconBtn} disabled={busy} title={`Preview — ${r.label}`} aria-label={`Preview — ${r.label}`} onClick={() => onPreview(r.kind)}>
                        <Eye size={15} />
                      </Button>,
                    )
                  ) : (
                    <td className={cn(tdCls, 'text-center')}>
                      <span className="inline-flex items-center gap-2">
                        <Button type="button" size="sm" variant="ghost" className={iconBtn} disabled={busy} title={`View — ${r.label} (opens in a new tab)`} aria-label={`View — ${r.label}`} onClick={() => void viewFile(r.file)}>
                          <Eye size={15} />
                        </Button>
                        <span className="inline-block h-4 w-4" aria-hidden />
                      </span>
                    </td>
                  )}
                  {cell(
                    r,
                    'print',
                    <Button type="button" size="sm" variant="ghost" className={iconBtn} disabled={busy} title={`Print — ${r.label}`} aria-label={`Print — ${r.label}`} onClick={() => (r.type === 'doc' ? onPrint(r.kind) : onPrintSelected({ ...EMPTY, printFiles: [r.file] }))}>
                      <Printer size={15} />
                    </Button>,
                  )}
                  {cell(
                    r,
                    'pdf',
                    <Button type="button" size="sm" variant="ghost" className={iconBtn} disabled={busy} title={`Download PDF — ${r.label}`} aria-label={`Download PDF — ${r.label}`} onClick={() => (r.type === 'doc' ? onPdf(r.kind) : onDownloadSelected({ ...EMPTY, pdfFiles: [r.file] }))}>
                      <FileDown size={15} />
                    </Button>,
                  )}
                  {editFormat && r.type === 'doc' ? (
                    cell(
                      r,
                      'edit',
                      <Button type="button" size="sm" variant="ghost" className={iconBtn} disabled={busy} title={`Download ${editFormat === 'excel' ? 'Excel' : 'Word'} — ${r.label}`} aria-label={`Download ${editFormat === 'excel' ? 'Excel' : 'Word'} — ${r.label}`} onClick={() => onEditable(r.kind, editFormat)}>
                        {editFormat === 'excel' ? <FileSpreadsheet size={15} /> : <FileType size={15} />}
                      </Button>,
                    )
                  ) : (
                    <td className={cn(tdCls, 'text-center text-xs text-stone-400')}>—</td>
                  )}
                </tr>,
              ]
            })}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={cn(tdCls, 'py-3 text-center text-stone-500')}>
                  No documents yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
