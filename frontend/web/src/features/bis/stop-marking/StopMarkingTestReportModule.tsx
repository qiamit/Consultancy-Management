import { useRef, useState } from 'react'
import { Eye, FileDown, FileType, Pencil, Printer, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { downloadPdfViaPlaywright } from '@/lib/playwrightPdfClient'
import { limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { applyBisDocumentPrintPageSettings, DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS } from '../print/bisDocumentPrintPageSettings'
import { paginateHtmlForDownload } from '../print/bisPreviewPagination'
import { buildFactoryTestReportHtml, factoryTestReportDataFromPrintData } from '../print/factoryTestReportHtml'
import { loadBisPrintData } from '../print/loadBisPrintData'
import { openPendingPrintWindow, openPrintHtml } from '../print/openPrintHtml'
import { buildOslSampleRequirementsHtml, oslSampleRequirementsDataFromPrintData, printableOslSampleRows } from '../print/oslSampleRequirementsHtml'
import { loadBisProjectPrintPageSettings } from '../projects/bisPrintPageSettingsApi'
import { buildWordDocx, combineWordHtml } from '../projects/bisWordExport'
import { factoryTestReportHasContent, parseFactoryTestReportPayload } from '../projects/factoryTestReportModel'
import { FactoryTestReportGenerateDialog } from '../projects/FactoryTestReportGenerateDialog'
import { ManakDocumentActions } from '../projects/ManakDocumentActions'
import { ManakPanel } from '../projects/ManakStepPages'
import { OslSampleRequirementsModuleFields } from '../projects/OslSampleRequirementsModuleFields'
import {
  emptyOslSampleRequirementRow,
  oslSampleRowHasContent,
  parseOslSampleRequirementsPayload,
  type OslSampleRequirementRow,
  type OslSampleRequirementsModulePayload,
} from '../projects/oslSampleRequirementsModel'
import { formatDisplayDate, isCodeDisplayLabel, type BisProjectRow } from '../projects/types'
import { saveStopMarkingTestReportModule } from './stopMarkingApi'
import { stopMarkingIsCodeLabel, type StopMarkingRow, type StopMarkingTestReportModule } from './types'

const thCls = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'

type Component = 'sample' | 'ftr'
const LABEL: Record<Component, string> = { sample: 'Sample Offer Letter & Test Request', ftr: 'Factory Test Report' }

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

/**
 * Step 3 of a Non-Conformity case: Test Report - Details, laid out like the application's Test Report step,
 * but the samples and reports belong to this case only (nothing is read from or written to the application / licence modules).
 */
export function StopMarkingTestReportModule({
  row,
  bisRow,
  closed,
  onUpdated,
}: {
  row: StopMarkingRow
  /** The licence, read only for the firm / IS Code / letterhead details on the printed documents. */
  bisRow: BisProjectRow | null
  closed: boolean
  onUpdated: (row: StopMarkingRow) => void
}) {
  const mod: StopMarkingTestReportModule = row.test_report_module ?? {}
  const modRef = useRef(mod)
  modRef.current = mod
  const osl = parseOslSampleRequirementsPayload(mod.osl ?? null)
  const samples = osl.rows.filter(oslSampleRowHasContent)
  const reports = parseFactoryTestReportPayload(mod.ftr ?? null).reports
  const generated = (id: string) => reports.some((r) => r.sampleRowId === id && factoryTestReportHasContent(r))
  const applicable = (c: Component) => (mod.applicable?.[c] ?? 'Yes') === 'Yes'

  const [busy, setBusy] = useState(false)
  const [sampleOpen, setSampleOpen] = useState(false)
  const [sampleDraft, setSampleDraft] = useState<OslSampleRequirementsModulePayload>(osl)
  const [ftrOpen, setFtrOpen] = useState(false)
  const [generateId, setGenerateId] = useState<string | null>(null)

  const persist = async (next: StopMarkingTestReportModule) => {
    const saved = await saveStopMarkingTestReportModule(row.id, next)
    modRef.current = saved.test_report_module ?? {}
    onUpdated(saved)
  }
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something Went Wrong.')
    } finally {
      setBusy(false)
    }
  }

  const setApplicable = (c: Component, value: 'Yes' | 'No') => void run(() => persist({ ...modRef.current, applicable: { ...modRef.current.applicable, [c]: value } }))

  const openSampleEditor = () => {
    setSampleDraft(parseOslSampleRequirementsPayload(modRef.current.osl ?? null))
    setSampleOpen(true)
  }
  const saveSamples = () =>
    void run(async () => {
      const rows = sampleDraft.rows.filter(oslSampleRowHasContent)
      await persist({
        ...modRef.current,
        osl: {
          rows: rows.length ? rows : [emptyOslSampleRequirementRow()],
          importedQrCodes: sampleDraft.importedQrCodes ?? [],
          signatoryName: sampleDraft.signatoryName.trim(),
          signatoryDesignation: sampleDraft.signatoryDesignation.trim(),
        },
      })
      setSampleOpen(false)
      toast.success('Sample Offer Letter Saved.')
    })
  /** Letterhead HTML of one component, built from this case's own data. */
  const buildHtml = async (c: Component): Promise<{ html: string; title: string }> => {
    if (!bisRow) throw new Error('The licence of this case could not be loaded.')
    const printData = await loadBisPrintData(bisRow)
    const settings = await loadBisProjectPrintPageSettings(bisRow.id).catch(() => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS)
    if (c === 'sample') {
      if (!printableOslSampleRows(osl.rows).length) throw new Error('Add a sample to the Sample Offer Letter first.')
      const html = buildOslSampleRequirementsHtml(oslSampleRequirementsDataFromPrintData({ ...printData, modulePayload: (mod.osl ?? {}) as Record<string, unknown> }))
      return { html: applyBisDocumentPrintPageSettings(html, settings), title: LABEL.sample }
    }
    const filled = reports.filter((r) => factoryTestReportHasContent(r))
    if (!filled.length) throw new Error('Generate a Factory Test Report first.')
    const html = buildFactoryTestReportHtml(factoryTestReportDataFromPrintData({ ...printData, modulePayload: (mod.ftr ?? {}) as Record<string, unknown> }))
    return { html: applyBisDocumentPrintPageSettings(html, settings), title: LABEL.ftr }
  }
  const showHtml = (c: Component, label: string) =>
    void run(async () => {
      const pending = openPendingPrintWindow(`Preparing ${label}…`)
      try {
        const err = openPrintHtml((await buildHtml(c)).html, { target: pending })
        if (err) toast.error(err)
      } catch (err) {
        try { pending?.close() } catch { /* ignore */ }
        throw err
      }
    })
  const pdf = (c: Component) =>
    void run(async () => {
      const { html, title } = await buildHtml(c)
      await downloadPdfViaPlaywright({ html, filename: `${title}.pdf` })
      toast.success('PDF Downloaded.')
    })
  const word = (c: Component) =>
    void run(async () => {
      const { html, title } = await buildHtml(c)
      const settings = bisRow ? await loadBisProjectPrintPageSettings(bisRow.id).catch(() => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS) : DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS
      const wordHtml = await combineWordHtml(title, [await paginateHtmlForDownload(html)], settings)
      downloadBlob(await buildWordDocx(wordHtml, title, settings), `${title}.docx`)
      toast.success('Word Downloaded.')
    })

  const actionsFor = (c: Component, edit: () => void) => (
    <ManakDocumentActions
      disabled={busy || !bisRow}
      actions={[
        { label: `Edit — ${LABEL[c]}`, onClick: edit, icon: Pencil, disabled: closed },
        { label: `Preview — ${LABEL[c]}`, onClick: () => showHtml(c, 'Preview'), icon: Eye },
        { label: `Download PDF — ${LABEL[c]}`, onClick: () => pdf(c), icon: FileDown },
        { label: `Download Word — ${LABEL[c]}`, onClick: () => word(c), icon: FileType },
        { label: `Print — ${LABEL[c]}`, onClick: () => showHtml(c, 'Print'), icon: Printer },
      ]}
    />
  )

  const rowsDef: Array<{ c: Component; edit: () => void; note: string }> = [
    { c: 'sample', edit: openSampleEditor, note: samples.length ? `${samples.length} Sample${samples.length > 1 ? 's' : ''}` : 'No Sample Yet' },
    { c: 'ftr', edit: () => setFtrOpen(true), note: samples.length ? `${samples.filter((s) => generated(s.id)).length} of ${samples.length} Generated` : 'Add a Sample First' },
  ]

  const picker = (c: Component) => (
    <Select value={applicable(c) ? 'Yes' : 'No'} onValueChange={(v) => setApplicable(c, v as 'Yes' | 'No')} disabled={closed || busy}>
      <SelectTrigger className="mx-auto h-8 w-24 rounded-none border-stone-300 bg-white text-sm" aria-label={`${LABEL[c]} applicable`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Yes">Yes</SelectItem>
        <SelectItem value="No">No</SelectItem>
      </SelectContent>
    </Select>
  )

  const sampleLabel = (s: OslSampleRequirementRow) => s.gradeTypeVariety.trim() || s.sampleDescription.trim() || '—'

  return (
    <>
      <ManakPanel title="Test Report - Details">
        {/* Phones: one card per component instead of a table that scrolls sideways. */}
        <div className="space-y-2 md:hidden">
          {rowsDef.map(({ c, edit, note }) => (
            <article key={c} className={cn('border border-stone-300 bg-[#fffcf7] p-2.5', !applicable(c) && 'bg-[#f7f3eb]')}>
              <button type="button" disabled={!applicable(c) || closed} className="text-left text-sm font-semibold text-stone-800 hover:text-amber-800 hover:underline" onClick={edit}>
                {LABEL[c]}
              </button>
              <p className="text-xs text-stone-600">{note}</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-2 border-t border-stone-200 pt-2">
                {picker(c)}
                <div className="ml-auto">{applicable(c) ? actionsFor(c, edit) : <span className="text-xs text-stone-400">Not Applicable</span>}</div>
              </div>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={thCls}>Test Report Component</th>
                <th className={cn(thCls, 'w-[1%] whitespace-nowrap text-center')}>Applicable<span className="text-red-400">*</span></th>
                <th className={cn(thCls, 'w-[1%] text-center')}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rowsDef.map(({ c, edit, note }, n) => (
                <tr key={c} className={n % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                  <td className={cn(tdCls, 'font-semibold text-stone-800')}>
                    <button type="button" disabled={!applicable(c) || closed} className="text-left font-semibold hover:text-amber-800 hover:underline disabled:no-underline" onClick={edit}>
                      {LABEL[c]}
                    </button>
                    <span className="ml-2 text-xs font-normal text-stone-500">{note}</span>
                  </td>
                  <td className={cn(tdCls, 'text-center')}>{picker(c)}</td>
                  <td className={cn(tdCls, 'whitespace-nowrap text-center')}>{applicable(c) ? actionsFor(c, edit) : <span className="text-xs text-stone-400">Not applicable</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ManakPanel>

      <Dialog open={sampleOpen} onOpenChange={(open) => { if (!open) setSampleOpen(false) }}>
        <DialogContent className="flex max-h-[92vh] w-[min(72rem,calc(100vw-1.5rem))] max-w-none flex-col gap-3 overflow-hidden rounded-none border-2 border-stone-500 bg-[#f7f3eb] p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-base">Sample Offer Letter &amp; Test Request</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OslSampleRequirementsModuleFields
              value={sampleDraft}
              onChange={setSampleDraft}
              disabled={busy || closed}
              projectId={null}
              clientId={row.client_id}
              isCodeId={row.is_code_id}
              isCodeLabel={stopMarkingIsCodeLabel(row)}
              isCodeSearch={String(row.is_code?.is_number ?? '').trim() || null}
              isCodeRevisionYear={String(row.is_code?.revision_year ?? '').trim() || null}
              qrOnlyFields
            />
          </div>
          <DialogFooter className="flex-row items-center justify-end gap-2">
            <div className="flex gap-2">
              <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-8')} onClick={() => setSampleOpen(false)}>Cancel</Button>
              <Button type="button" className={cn(limsPrimaryBtnClass, 'h-8')} disabled={busy || closed} onClick={saveSamples}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ftrOpen} onOpenChange={(open) => { if (!open) setFtrOpen(false) }}>
        <DialogContent className="flex max-h-[92vh] w-[min(52rem,calc(100vw-1.5rem))] max-w-none flex-col gap-3 overflow-hidden rounded-none border-2 border-stone-500 bg-[#f7f3eb] p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-base">Factory Test Report</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {samples.length === 0 ? (
              <p className="border border-dashed border-stone-400 bg-white px-3 py-6 text-center text-sm text-muted-foreground">No Sample in the Sample Offer Letter Yet. Add One There First.</p>
            ) : (
              <ul className="space-y-2">
                {samples.map((s, i) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-stone-300 bg-white px-3 py-2">
                    <span className="w-6 text-sm font-bold text-amber-800">{i + 1}</span>
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="break-words text-sm font-semibold text-stone-900">{sampleLabel(s)}</p>
                      <p className="text-xs text-stone-600">
                        Batch {s.batchNumber.trim() || '—'} · Mfg {s.dateOfManufacturing.trim() ? formatDisplayDate(s.dateOfManufacturing) : '—'} · Declared {s.declaredValue.trim() || '—'}
                      </p>
                    </div>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', generated(s.id) ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-stone-100 text-stone-700 ring-stone-300')}>
                      {generated(s.id) ? 'Report Generated' : 'Not Generated'}
                    </span>
                    <Button type="button" size="sm" className="h-8 w-8 rounded-none bg-amber-700 p-0 text-white hover:bg-amber-800" title={generated(s.id) ? 'Edit Test Report' : 'Generate Test Report'} aria-label={generated(s.id) ? 'Edit Test Report' : 'Generate Test Report'} disabled={closed} onClick={() => setGenerateId(s.id)}>
                      <ScrollText className="h-4 w-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <FactoryTestReportGenerateDialog
        projectId={row.bis_project_id}
        sample={generateId ? samples.find((s) => s.id === generateId) ?? null : null}
        samples={samples}
        isCodeId={row.is_code_id}
        isCodeLabel={bisRow ? isCodeDisplayLabel(bisRow) : stopMarkingIsCodeLabel(row)}
        onClose={() => setGenerateId(null)}
        storage={{
          load: async () => (modRef.current.ftr as Record<string, unknown> | undefined) ?? null,
          save: (payload) => persist({ ...modRef.current, ftr: payload }),
        }}
      />
    </>
  )
}
