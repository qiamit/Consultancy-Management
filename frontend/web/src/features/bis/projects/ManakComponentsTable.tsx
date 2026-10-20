import { useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { FileSpreadsheet, Import } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { BisModuleImportDialog } from './BisModuleImportDialog'
import { importCmpfSpreadsheetRows } from './cmpfSpreadsheetImport'
import { copyProjectFileToProject } from './bisModuleImportApi'
import { ManakPanel } from './ManakStepPages'
import type { BisProjectRow } from './types'

/* Component table shared by the Testing and Test Report steps (same look as Manufacturing / Packaging):
   Select | Component | Applicable | Action, with tables edited in a popup opened from Edit. */

type Rec = Record<string, unknown>
type Payload = Rec | null | undefined
export type YesNo = 'Yes' | 'No'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())
const rowsOf = (p: Payload, key = 'rows'): Rec[] => (Array.isArray(p?.[key]) ? (p?.[key] as Rec[]) : [])

const thCls =
  'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'
const checkCls = 'h-4 w-4 rounded-none border-stone-500 text-amber-700 disabled:opacity-40'
const headerBtn =
  'h-8 w-8 shrink-0 rounded-none border border-amber-500/60 bg-stone-800 p-0 text-amber-200 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-600 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-400/50'

export type ExcelColumn = { key: string; aliases: string[] }

export type StepComponent = {
  key: string
  label: string
  /** Document used by Preview / PDF / Word. */
  printKind: BisPrintDocumentKind
  /** Module dialog opened by Edit; absent → the popup below. */
  editKind?: BisPrintDocumentKind
  defaultApplicable: YesNo
  /** Custom editor opened by Edit (instead of editKind / popup). */
  onEdit?: () => void
  /** false: no bundle select box (upload-only rows that are not generated documents). */
  selectable?: boolean
  /** Replaces the Edit / Preview / PDF / Word buttons (e.g. upload-only documents). */
  actions?: (edit: () => void) => ReactNode
  /** Extra popup header buttons (e.g. AI), shown before Import. */
  popupHeaderExtra?: () => ReactNode
  /** Popup heading when it differs from the row label. */
  popupTitle?: string
  /** Popup body (tables edited in place). */
  popup?: (close: () => void) => ReactNode
  /** Rows the popup's "Import from another Application" copies. */
  importTable?: { kind: BisPrintDocumentKind; rowsKey: string; idKeys: string[] }
  /**
   * A Yes / No question in place of "Applicable" (e.g. in-house testing facility): the actions show only when the
   * answer equals actionsWhen; otherwise offText is shown.
   */
  choice?: { value: YesNo; onChange: (value: YesNo) => void; actionsWhen: YesNo; offText: string }
  /** "Import from Excel" in the popup header. */
  excel?: { kind: BisPrintDocumentKind; idKey: string; columns: ExcelColumn[] }
}


export function ManakComponentsTable({
  title,
  componentHeading,
  componentsKind,
  components,
  projectId,
  projectRow,
  payloads,
  onChanged,
  onEdit,
  renderDocActions,
  selection,
  before,
  after,
}: {
  title: string
  /** Heading of the component column. */
  componentHeading: string
  /** Payload holding the Applicable choices. */
  componentsKind: BisPrintDocumentKind
  components: StepComponent[]
  projectId: string
  projectRow: BisProjectRow | null
  payloads: Partial<Record<BisPrintDocumentKind, Payload>>
  onChanged: () => void
  onEdit: (kind: BisPrintDocumentKind) => void
  renderDocActions?: (kind: BisPrintDocumentKind, onModuleEdit: () => void) => ReactNode
  selection?: { has: (kind: BisPrintDocumentKind) => boolean; set: (kind: BisPrintDocumentKind, selected: boolean) => void }
  /** Shown above / below the table inside the panel. */
  before?: ReactNode
  after?: ReactNode
}) {
  const savedApplicable = useMemo(() => {
    const raw = payloads[componentsKind]?.applicable
    return raw && typeof raw === 'object' ? (raw as Record<string, YesNo>) : {}
  }, [payloads, componentsKind])
  const [pending, setPending] = useState<Record<string, YesNo>>({})
  const applicable = { ...savedApplicable, ...pending }
  const isApplicable = (c: StepComponent) => (applicable[c.key] ?? c.defaultApplicable) === 'Yes'

  const setComponentApplicable = async (c: StepComponent, value: YesNo) => {
    setPending((p) => ({ ...p, [c.key]: value }))
    if (value === 'No') selection?.set(c.printKind, false)
    try {
      const current = (await fetchBisModulePayload(projectId, componentsKind)) ?? {}
      const prev = current.applicable && typeof current.applicable === 'object' ? (current.applicable as Rec) : {}
      await saveBisModulePayload(projectId, componentsKind, { ...current, applicable: { ...prev, [c.key]: value } })
      onChanged()
    } catch (err) {
      setPending((p) => {
        const rest = { ...p }
        delete rest[c.key]
        return rest
      })
      toast.error(err instanceof Error ? err.message : 'Could not save')
    }
  }

  const [popup, setPopup] = useState<StepComponent | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const excelInputRef = useRef<HTMLInputElement | null>(null)

  const editComponent = (c: StepComponent) => () => {
    if (c.onEdit) c.onEdit()
    else if (c.editKind) onEdit(c.editKind)
    else setPopup(c)
  }

  const importExcel = async (file: File) => {
    const config = popup?.excel
    if (!config) return
    try {
      const imported = await importCmpfSpreadsheetRows<Record<string, string>>(
        file,
        config.columns.map((c) => ({ key: c.key, aliases: c.aliases })),
        (r) => Boolean(str(r[config.idKey])),
      )
      if (imported.length === 0) {
        toast.error('No Rows Were Found in the Selected Spreadsheet.')
        return
      }
      const current = (await fetchBisModulePayload(projectId, config.kind)) ?? {}
      const existing = rowsOf(current).filter((r) => str(r[config.idKey]))
      await saveBisModulePayload(projectId, config.kind, { ...current, rows: [...existing, ...imported] })
      toast.success(`Imported ${imported.length} row${imported.length === 1 ? '' : 's'}`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to import the spreadsheet.')
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = ''
    }
  }

  /** Adds the source application's rows, skipping ones already present (attached files are not copied). */
  const importRows = async (sourceProjectId: string) => {
    const table = popup?.importTable
    if (!popup || !table) return
    const rowKey = (r: Rec) => table.idKeys.map((k) => str(r[k]).toLowerCase()).join('|')
    const isRow = (r: Rec) => table.idKeys.some((k) => str(r[k]))
    // Attached files are copied into this application (a failed copy drops just that file).
    const withCopiedFiles = async (r: Rec): Promise<Rec> => {
      const next: Rec = { ...r }
      for (const [key, v] of Object.entries(r)) {
        if (!v || typeof v !== 'object' || !('storage_path' in (v as Rec))) continue
        const f = v as { id: string; file_name: string; storage_path: string }
        next[key] = await copyProjectFileToProject(sourceProjectId, projectId, f, String(table.kind)).catch(() => null)
      }
      return next
    }
    const sourceRows = rowsOf(await fetchBisModulePayload(sourceProjectId, table.kind), table.rowsKey).filter(isRow)
    if (sourceRows.length === 0) throw new Error(`The selected application has no ${popup.label}.`)
    const current = (await fetchBisModulePayload(projectId, table.kind)) ?? {}
    const existing = rowsOf(current, table.rowsKey).filter(isRow)
    const known = new Set(existing.map(rowKey))
    const added = await Promise.all(sourceRows.filter((r) => !known.has(rowKey(r))).map(withCopiedFiles))
    if (added.length === 0) {
      toast.message('Nothing New to Import', { description: `All ${popup.label} rows are already in this application.` })
      return
    }
    await saveBisModulePayload(projectId, table.kind, { ...current, [table.rowsKey]: [...existing, ...added] })
    toast.success(`Imported ${added.length} row${added.length === 1 ? '' : 's'}`, {
      description: added.length < sourceRows.length ? `${sourceRows.length - added.length} already present were skipped.` : undefined,
    })
    onChanged()
  }

  return (
    <>
      <ManakPanel title={title}>
        {before}
        {/* Phones: one card per component (name, Applicable, actions) instead of a table that scrolls sideways. */}
        <div className="space-y-2 md:hidden">
          {components.map((c) => {
            const yes = c.choice ? c.choice.value === c.choice.actionsWhen : isApplicable(c)
            const selected: YesNo = c.choice ? c.choice.value : yes ? 'Yes' : 'No'
            return (
              <article key={c.key} className={cn('border border-stone-300 bg-[#fffcf7] p-2.5', !yes && 'bg-[#f7f3eb]')}>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className={cn(checkCls, 'mt-0.5 shrink-0')}
                    aria-label={`Select ${c.label}`}
                    disabled={!yes || !selection || c.selectable === false}
                    checked={yes && c.selectable !== false && Boolean(selection?.has(c.printKind))}
                    onChange={(e) => selection?.set(c.printKind, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1 text-sm font-semibold leading-snug text-stone-800">
                    {yes && (c.editKind || c.popup || c.onEdit) ? (
                      <button type="button" className="text-left font-semibold hover:text-amber-800 hover:underline" onClick={editComponent(c)}>
                        {c.label}
                      </button>
                    ) : (
                      c.label
                    )}
                  </div>
                </div>
                {/* Applicable and the action buttons share one line; the buttons drop below only when they do not fit. */}
                <div className="mt-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5 border-t border-stone-200 pt-2">
                  <div className="flex flex-col items-start gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                    <span>
                      Applicable<span className="text-red-500">*</span>
                    </span>
                    <Select
                      value={selected}
                      onValueChange={(v) => {
                        if (c.choice) {
                          if (v !== c.choice.actionsWhen) selection?.set(c.printKind, false)
                          c.choice.onChange(v as YesNo)
                        } else void setComponentApplicable(c, v as YesNo)
                      }}
                    >
                      <SelectTrigger className="h-8 w-20 rounded-none border-stone-300 bg-white text-sm normal-case tracking-normal text-stone-900" aria-label={`${c.label} applicable`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-0.5">
                    {yes ? c.actions?.(editComponent(c)) ?? renderDocActions?.(c.printKind, editComponent(c)) ?? <span className="text-stone-400">—</span> : <span className="text-xs text-stone-400">{c.choice?.offText ?? 'Not applicable'}</span>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={cn(thCls, 'w-8 px-1 text-center')} aria-label="Select" />
                <th className={thCls}>{componentHeading}</th>
                <th className={cn(thCls, 'w-[1%] whitespace-nowrap text-center')}>
                  Applicable<span className="text-red-400">*</span>
                </th>
                <th className={cn(thCls, 'w-[1%] text-center')}>Action</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c, n) => {
                const yes = c.choice ? c.choice.value === c.choice.actionsWhen : isApplicable(c)
                const selected: YesNo = c.choice ? c.choice.value : yes ? 'Yes' : 'No'
                return (
                  <tr key={c.key} className={n % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                    <td className={cn(tdCls, 'px-1 text-center')}>
                      <input
                        type="checkbox"
                        className={checkCls}
                        aria-label={`Select ${c.label}`}
                        disabled={!yes || !selection || c.selectable === false}
                        checked={yes && c.selectable !== false && Boolean(selection?.has(c.printKind))}
                        onChange={(e) => selection?.set(c.printKind, e.target.checked)}
                      />
                    </td>
                    <td className={cn(tdCls, 'font-semibold text-stone-800')}>
                      {yes && (c.editKind || c.popup || c.onEdit) ? (
                        <button type="button" className="text-left font-semibold hover:text-amber-800 hover:underline" onClick={editComponent(c)}>
                          {c.label}
                        </button>
                      ) : (
                        c.label
                      )}
                    </td>
                    <td className={cn(tdCls, 'text-center')}>
                      <Select
                        value={selected}
                        onValueChange={(v) => {
                          if (c.choice) {
                            if (v !== c.choice.actionsWhen) selection?.set(c.printKind, false)
                            c.choice.onChange(v as YesNo)
                          } else void setComponentApplicable(c, v as YesNo)
                        }}
                      >
                        <SelectTrigger className="mx-auto h-8 w-24 rounded-none border-stone-300 bg-white text-sm" aria-label={`${c.label} applicable`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className={cn(tdCls, 'whitespace-nowrap text-center')}>
                      {yes ? c.actions?.(editComponent(c)) ?? renderDocActions?.(c.printKind, editComponent(c)) ?? <span className="text-stone-400">—</span> : <span className="text-xs text-stone-400">{c.choice?.offText ?? 'Not applicable'}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {after}
      </ManakPanel>

      <Dialog open={popup != null} onOpenChange={(open) => !open && setPopup(null)}>
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'flex max-h-[90vh] w-[min(76rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_1.5rem))] max-w-6xl flex-col p-0')}
        >
          <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-2.5 pl-4 pr-12 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">{popup?.popupTitle ?? popup?.label}</DialogTitle>
            <div className="flex shrink-0 items-center gap-1.5">
              {popup?.excel ? (
                <>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void importExcel(file)
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={headerBtn}
                    title="Import from Excel"
                    aria-label="Import from Excel"
                    onClick={() => excelInputRef.current?.click()}
                  >
                    <FileSpreadsheet size={15} aria-hidden />
                  </Button>
                </>
              ) : null}
              {components.find((c) => c.key === popup?.key)?.popupHeaderExtra?.()}
              {popup?.importTable && projectRow?.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={headerBtn}
                  title="Import from Another Application"
                  aria-label="Import from Another Application"
                  onClick={() => setImportOpen(true)}
                >
                  <Import size={15} aria-hidden />
                </Button>
              ) : null}
            </div>
          </DialogHeader>
          {/* Rendered from the current components so the table shows freshly saved rows. */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fffcf7] p-4">{components.find((c) => c.key === popup?.key)?.popup?.(() => setPopup(null))}</div>
          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3">
            <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} onClick={() => setPopup(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BisModuleImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        targetRow={projectRow}
        kind={popup?.printKind ?? null}
        onPickSource={importRows}
      />
    </>
  )
}
