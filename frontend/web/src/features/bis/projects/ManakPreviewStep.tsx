import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Eye, FileDown, FileSpreadsheet, FileType, Paperclip, Printer, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { BIS_PRINT_DOCUMENT_LABEL, type BisPrintDocumentKind } from '../print/printBisDocument'
import { openPendingPrintWindow } from '../print/openPrintHtml'
import { fetchBisModulePayload } from './bisModuleDataApi'
import { createBisProjectFileUrls, type BisProjectViewFile } from './bisProjectFilesApi'
import { writePdfViewerHtml } from './mergeBisProjectFilesPdf'
import { BIS_APPLICATION_STEPS } from './bisApplicationSteps'
import {
  APPLICATION_DECLARATION_KIND,
  MANUFACTURING_COMPONENTS_KIND,
  PACKAGING_COMPONENTS_KIND,
  TEST_REPORT_COMPONENTS_KIND,
  TESTING_COMPONENTS_KIND,
} from './manakModuleKinds'
import { rowToBisApplicationDetailsForm, type BisProjectRow } from './types'

/* Step 8 — Preview Application: every generated document (only those marked Applicable on Steps 1–7) and every
   uploaded file, one row each, with Preview / PDF / Editable (Word or Excel) columns that can each be ticked and
   then previewed or downloaded together. */

type Rec = Record<string, unknown>
type YesNo = 'Yes' | 'No'
export type PreviewFile = BisProjectViewFile & { doc_kind: string }

export type PreviewSelection = {
  previewKinds: BisPrintDocumentKind[]
  previewFiles: PreviewFile[]
  printKinds: BisPrintDocumentKind[]
  printFiles: PreviewFile[]
  pdfKinds: BisPrintDocumentKind[]
  pdfFiles: PreviewFile[]
  wordKinds: BisPrintDocumentKind[]
  excelKinds: BisPrintDocumentKind[]
}

type DocRow = { id: string; step: number; type: 'doc'; kind: BisPrintDocumentKind; label: string }
type FileRow = { id: string; step: number; type: 'file'; file: PreviewFile; label: string }
type Row = DocRow | FileRow

/** Generated documents per step; `when` decides if the row applies (Applicable choices on the step). */
type Entry = { step: number; kind: BisPrintDocumentKind; label?: string; when?: (ctx: Ctx) => boolean }
type Ctx = { applicable: (componentsKind: BisPrintDocumentKind, key: string, fallback: YesNo) => boolean; payloads: Partial<Record<string, Rec | null>>; option2: boolean }

const ENTRIES: Entry[] = [
  { step: 0, kind: 'application-copy', label: 'Application Copy' },
  { step: 0, kind: 'location-map', label: 'Location Map' },
  { step: 0, kind: 'manufacturing-scope', label: 'Undertaking for Manufacturing Scope' },
  { step: 0, kind: 'marking-fee-acceptance', label: 'Acceptance of Marking Fee' },
  { step: 0, kind: 'cmpf-311' },
  { step: 1, kind: 'top-management' },
  { step: 1, kind: 'technical-staff' },
  { step: 2, kind: 'raw-material-details', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'raw-material', 'Yes') },
  { step: 2, kind: 'certified-reference-materials', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'crm', 'No') },
  { step: 2, kind: 'process-flow-chart', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'process-flow-chart', 'Yes') },
  { step: 2, kind: 'process-description', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'process-description', 'Yes') },
  { step: 2, kind: 'plant-layout', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'plant-layout', 'Yes') },
  { step: 2, kind: 'cmpf-305', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'machinery', 'Yes') },
  { step: 2, kind: 'manufacturing-subcontracting', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'subcontracting', 'No') },
  { step: 2, kind: 'hygiene-conditions', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'hygiene', 'No') },
  { step: 3, kind: 'self-evaluation-form', when: (c) => c.applicable(PACKAGING_COMPONENTS_KIND, 'packaging', 'Yes') },
  { step: 3, kind: 'cmpf-307', when: (c) => c.applicable(PACKAGING_COMPONENTS_KIND, 'brand', 'Yes') },
  { step: 4, kind: 'cmpf-306', when: (c) => c.applicable(TESTING_COMPONENTS_KIND, 'equipment', 'Yes') },
  { step: 4, kind: 'subcontracted-tests', label: 'Tests Intended to be Sub-Contracted', when: (c) => c.payloads[TESTING_COMPONENTS_KIND]?.inHouseTesting === 'No' },
  { step: 5, kind: 'osl-offer-and-test-request', when: (c) => c.applicable(TEST_REPORT_COMPONENTS_KIND, 'sample-offer', 'Yes') },
  { step: 5, kind: 'factory-test-report', when: (c) => c.applicable(TEST_REPORT_COMPONENTS_KIND, 'factory-test-report', 'Yes') },
  { step: 5, kind: 'undertaking-long-duration', when: (c) => c.applicable(TEST_REPORT_COMPONENTS_KIND, 'long-duration', 'No') },
  { step: 5, kind: 'raw-material-test-reports', when: (c) => c.applicable(TEST_REPORT_COMPONENTS_KIND, 'raw-material-test-reports', 'No') },
  { step: 6, kind: 'authorization-letter', when: (c) => c.applicable(APPLICATION_DECLARATION_KIND, 'authorizationLetter', 'Yes') },
  { step: 6, kind: 'undertaking-option-2', when: (c) => c.applicable(APPLICATION_DECLARATION_KIND, 'undertakingOption2', c.option2 ? 'Yes' : 'No') },
  { step: 6, kind: 'undertaking-general', when: (c) => c.applicable(APPLICATION_DECLARATION_KIND, 'undertakingGeneral', 'Yes') },
  { step: 6, kind: 'undertaking-indian-standards', when: (c) => c.applicable(APPLICATION_DECLARATION_KIND, 'undertakingIndianStandards', 'No') },
  { step: 6, kind: 'undertaking-other', when: (c) => c.applicable(APPLICATION_DECLARATION_KIND, 'undertakingOther', 'No') },
]

/** Browser-viewable types for View (by file extension). */
const VIEW_TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

/** Where each uploaded file kind belongs, and how it is named. Signatures, seals and other photos are images used inside documents. */
const FILE_KINDS: Record<string, { step: number; label: string; fixed?: boolean; after?: BisPrintDocumentKind }> = {
  legal: { step: 0, label: 'Legal Document' },
  application: { step: 0, label: 'Application Document' },
  license: { step: 0, label: 'Licence Document' },
  branch: { step: 0, label: 'Branch Document' },
  'manufacturing-scope': { step: 0, label: 'Attach Copy of Manufacturing Scope (Drawings)', fixed: true, after: 'manufacturing-scope' },
  // QCI: Quality Control Incharge (Technical Staff).
  'technical-staff-appointment': { step: 1, label: 'Appointment Letter of QCI', fixed: true },
  'technical-staff-education-certificate': { step: 1, label: 'Educational Certificate of QCI', fixed: true },
  'technical-staff-photo': { step: 1, label: 'Passport Size Photo of QCI', fixed: true },
  'packaging-label': { step: 3, label: 'Form of Label' },
  'cmpf-307-agreement': { step: 3, label: 'Brand Agreement' },
  'cmpf-307-trademark-certificate': { step: 3, label: 'Trademark Certificate' },
  'calibration-certificates': { step: 4, label: 'Calibration Certificate' },
  'consent-letter': { step: 4, label: 'Consent Letter' },
  'osl-sample-test-request': { step: 5, label: 'Test Request' },
  'osl-sample-test-report': { step: 5, label: 'Test Report' },
  'osl-courier-slip': { step: 5, label: 'Courier Slip' },
  'long-duration-inhouse-report': { step: 5, label: 'In House / Old Test Report' },
  'long-duration-lab-report': { step: 5, label: 'Long Duration Test Report' },
  'raw-material-test-report': { step: 5, label: 'Raw Material Test Report' },
  'application-declaration': { step: 6, label: 'Declaration Attachment' },
}
// The QCI passport photo is a submission document; other photos, signatures and seals only appear inside documents.
const isImageAsset = (docKind: string) => docKind !== 'technical-staff-photo' && /signature|photo|seal/i.test(docKind)

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
    const kinds = [MANUFACTURING_COMPONENTS_KIND, PACKAGING_COMPONENTS_KIND, TESTING_COMPONENTS_KIND, TEST_REPORT_COMPONENTS_KIND, APPLICATION_DECLARATION_KIND]
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

  const rows = useMemo<Row[]>(() => {
    const ctx: Ctx = {
      payloads,
      option2: rowToBisApplicationDetailsForm(row).applicationProcess === 'simplified',
      applicable: (componentsKind, key, fallback) => {
        const p = payloads[componentsKind]
        const map = p?.applicable && typeof p.applicable === 'object' ? (p.applicable as Rec) : {}
        const legacy = p?.[key]
        const value = map[key] ?? (legacy === 'Yes' || legacy === 'No' ? legacy : undefined) ?? fallback
        return value === 'Yes'
      },
    }
    const docs: Row[] = ENTRIES.filter((e) => !e.when || e.when(ctx)).map((e) => ({
      id: `doc:${e.kind}`,
      step: e.step,
      type: 'doc',
      kind: e.kind,
      label: e.label ?? BIS_PRINT_DOCUMENT_LABEL[e.kind],
    }))
    const placed = new Map<string, Row[]>()
    const loose: Row[] = []
    files.forEach((file) => {
      const meta = FILE_KINDS[file.doc_kind] ?? { step: 6, label: 'Uploaded File' }
      const r: Row = { id: `file:${file.id}`, step: meta.step, type: 'file', file, label: meta.fixed ? meta.label : `${meta.label} — ${file.file_name}` }
      if (meta.after && docs.some((d) => d.type === 'doc' && d.kind === meta.after)) placed.set(meta.after, [...(placed.get(meta.after) ?? []), r])
      else loose.push(r)
    })
    // Files tied to a document sit right below it; other files close their step.
    const ordered: Row[] = []
    for (let step = 0; step <= 6; step++) {
      for (const d of docs.filter((x) => x.step === step)) {
        ordered.push(d)
        if (d.type === 'doc') ordered.push(...(placed.get(d.kind) ?? []))
      }
      ordered.push(...loose.filter((x) => x.step === step))
    }
    return ordered
  }, [payloads, files, row])

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
