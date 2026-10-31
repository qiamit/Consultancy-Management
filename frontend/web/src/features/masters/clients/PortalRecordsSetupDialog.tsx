import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Calculator, Download, Save, FlaskConical, Loader2, Pencil, Plus, Power, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { BisModuleImportDialog } from '@/features/bis/projects/BisModuleImportDialog'
import { fetchBisProjectById } from '@/features/bis/projects/bisProjectsApi'
import type { BisProjectRow } from '@/features/bis/projects/types'
import { FORMULA_FUNCTIONS, formulaProblem } from '@/lib/recordFormula'
import { limsDarkBarBtnClass, limsDarkBarGlowStyle, limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  COLUMN_TYPE_LABEL,
  SECTION_KIND_LABEL,
  columnKeyFrom,
  limitsText,
  type RecordColumnType,
} from '@/features/portal/recordLogic'
import {
  TRIAL_DAYS,
  addTestParameterColumns,
  copySectionsFrom,
  createSection,
  createStandardSections,
  deleteColumn,
  makeRoomForColumn,
  deleteSection,
  getRecordsService,
  listSections,
  moveColumn,
  saveColumn,
  setPaidUntil,
  setRecordsEnabled,
  updateSection,
  type AdminColumn,
  type AdminSection,
  serviceStatus,
  type RecordsService,
} from './portalRecordsAdminApi'
import { CalendarDateField } from './CalendarDateField'

const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-amber-200'
const td = 'border border-stone-200 px-2 py-1.5 align-middle text-sm text-stone-800'
const iconBtn = 'inline-flex h-7 w-7 items-center justify-center border border-stone-300 bg-white text-amber-800 hover:bg-amber-50 disabled:opacity-40'
// Attachments need customer file uploads, which come with the reports step.
const EDITABLE_TYPES: RecordColumnType[] = ['text', 'number', 'spec', 'date', 'select', 'formula', 'link', 'pass_fail']

function errText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

type Draft = {
  id?: string
  key?: string
  label: string
  col_type: RecordColumnType
  unit: string
  spec_min: string
  spec_max: string
  options: string
  formula: string
  decimals: string
  link_section: string
  required: boolean
  /** New column only: its place in the list (0 = first); missing = at the end. */
  insertAt?: number
}

function draftFrom(c?: AdminColumn): Draft {
  return {
    id: c?.id,
    key: c?.key,
    label: c?.label ?? '',
    col_type: c?.col_type ?? 'text',
    unit: c?.unit ?? '',
    spec_min: c?.spec_min != null ? String(c.spec_min) : '',
    spec_max: c?.spec_max != null ? String(c.spec_max) : '',
    options: (c?.config.options ?? []).join('\n'),
    formula: c?.config.formula ?? '',
    decimals: c?.config.decimals != null ? String(c.config.decimals) : '',
    link_section: c?.config.section_id ?? '',
    required: Boolean(c?.required),
  }
}

function ColumnEditor({
  section,
  sections,
  draft,
  onClose,
  onSaved,
}: {
  section: AdminSection
  sections: AdminSection[]
  draft: Draft
  onClose: () => void
  onSaved: () => void
}) {
  const [d, setD] = useState<Draft>(draft)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }))
  const otherKeys = section.columns.filter((c) => c.id !== d.id).map((c) => c.key)
  const key = d.key ?? columnKeyFrom(d.label || 'column', otherKeys)
  const ownColumns = section.columns.filter((c) => c.id !== d.id)
  // Columns of other sections reached through this section's link columns: <link key>.<column key>.
  const linkedGroups = ownColumns
    .filter((c) => c.col_type === 'link' && c.config.section_id)
    .map((link) => ({ link, target: sections.find((s) => s.id === link.config.section_id) }))
    .filter((g): g is { link: AdminColumn; target: AdminSection } => Boolean(g.target))
  const formulaKeys = [
    ...ownColumns.map((c) => c.key),
    ...linkedGroups.flatMap((g) => g.target.columns.filter((c) => c.col_type !== 'link').map((c) => `${g.link.key}.${c.key}`)),
  ]
  const problem = d.col_type === 'formula' ? formulaProblem(d.formula, formulaKeys) : ''
  const formulaBox = useRef<HTMLTextAreaElement>(null)
  // Puts text at the cursor of the formula box (or at the end) and keeps the cursor after it.
  const insert = (text: string) => {
    const box = formulaBox.current
    const start = box?.selectionStart ?? d.formula.length
    const end = box?.selectionEnd ?? d.formula.length
    const next = d.formula.slice(0, start) + text + d.formula.slice(end)
    set('formula', next)
    requestAnimationFrame(() => {
      box?.focus()
      box?.setSelectionRange(start + text.length, start + text.length)
    })
  }
  const hasLimits = d.col_type === 'spec' || d.col_type === 'formula'

  const save = async () => {
    if (!d.label.trim()) return toast.warning('Enter the Column Name')
    if (problem) return toast.warning(problem)
    if (d.col_type === 'select' && !d.options.trim()) return toast.warning('Enter the Dropdown Options')
    if (d.col_type === 'link' && !d.link_section) return toast.warning('Choose the Section to Link')
    const num = (s: string) => (s.trim() === '' ? null : Number(s))
    if ([d.spec_min, d.spec_max].some((s) => s.trim() !== '' && !Number.isFinite(Number(s)))) return toast.warning('Limits Must Be Numbers')
    setSaving(true)
    try {
      const at = d.id || d.insertAt == null ? section.columns.length : Math.min(d.insertAt, section.columns.length)
      if (!d.id && at < section.columns.length) await makeRoomForColumn(section.columns, at)
      await saveColumn(section.id, {
        id: d.id,
        key,
        label: d.label,
        col_type: d.col_type,
        unit: d.unit,
        spec_min: hasLimits ? num(d.spec_min) : null,
        spec_max: hasLimits ? num(d.spec_max) : null,
        config:
          d.col_type === 'select'
            ? { options: d.options.split(/\n|,/).map((o) => o.trim()).filter(Boolean) }
            : d.col_type === 'formula'
              ? { formula: d.formula.trim(), ...(d.decimals.trim() ? { decimals: Number(d.decimals) } : {}) }
              : d.col_type === 'link'
                ? { section_id: d.link_section }
                : {},
        required: d.required,
        sort_order: d.id ? section.columns.find((c) => c.id === d.id)?.sort_order ?? 0 : at,
      })
      toast.success('Column Saved')
      onSaved()
    } catch (err) {
      toast.error(errText(err, 'Could not save the column'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className={cn(limsDialogClass, 'w-[min(48rem,calc(100vw-1rem))]', 'max-w-none gap-0 overflow-hidden bg-white p-0')}>
        <div className="bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">{d.id ? 'Edit Column' : 'Add Column'} — {section.name}</DialogTitle>
          </DialogHeader>
        </div>
        <div className="max-h-[70dvh] space-y-3 overflow-y-auto bg-[#fffcf7] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.8fr)]">
            <div className="space-y-1">
              <Label htmlFor="col-label">Column Name</Label>
              <Input id="col-label" className="h-9" value={d.label} placeholder="Tensile Strength" onChange={(e) => set('label', e.target.value)} />
              <p className="text-[11px] text-stone-500">Formula Name: <code className="bg-stone-100 px-1">{key}</code></p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="col-type">Type</Label>
              <div className="flex gap-1.5">
                <select id="col-type" className="h-9 min-w-0 flex-1 border border-stone-400 bg-white px-2 text-sm" value={d.col_type} onChange={(e) => set('col_type', e.target.value as RecordColumnType)}>
                  {EDITABLE_TYPES.map((t) => (
                    <option key={t} value={t}>{COLUMN_TYPE_LABEL[t]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center border', d.col_type === 'formula' ? 'border-amber-700 bg-amber-700 text-white' : 'border-stone-400 bg-white text-amber-800 hover:bg-amber-50')}
                  title="Formula Builder"
                  aria-label="Formula Builder"
                  onClick={() => {
                    set('col_type', 'formula')
                    requestAnimationFrame(() => formulaBox.current?.focus())
                  }}
                >
                  <Calculator size={16} aria-hidden />
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="col-unit">Unit</Label>
              <Input id="col-unit" className="h-9" value={d.unit} placeholder="MPa, %, mm" onChange={(e) => set('unit', e.target.value)} />
            </div>
            </div>
            {hasLimits ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="col-min">Minimum</Label>
                  <Input id="col-min" inputMode="decimal" value={d.spec_min} onChange={(e) => set('spec_min', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="col-max">Maximum</Label>
                  <Input id="col-max" inputMode="decimal" value={d.spec_max} onChange={(e) => set('spec_max', e.target.value)} />
                </div>
                <p className="text-[11px] text-stone-500 sm:col-span-2">A value outside the limits marks the entry as Fail. Leave both empty for no check.</p>
              </>
            ) : null}
            {d.col_type === 'select' ? (
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="col-options">Dropdown Options (One per Line)</Label>
                <textarea id="col-options" rows={4} className="w-full border border-stone-400 bg-white p-2 text-sm" value={d.options} onChange={(e) => set('options', e.target.value)} />
              </div>
            ) : null}
            {d.col_type === 'formula' ? (
              <div className="space-y-2 border border-amber-300 bg-amber-50/40 p-3 sm:col-span-2">
                <div className="flex items-center gap-2">
                  <Calculator size={15} className="text-amber-800" aria-hidden />
                  <Label htmlFor="col-formula" className="text-sm font-semibold">Formula Builder</Label>
                  <span className={cn('ml-auto text-[11px] font-medium', problem ? 'text-red-700' : 'text-emerald-700')}>{problem || 'Formula OK'}</span>
                </div>
                <textarea
                  id="col-formula"
                  ref={formulaBox}
                  rows={2}
                  className="w-full border border-stone-400 bg-white p-2 font-mono text-sm"
                  value={d.formula}
                  placeholder="ROUND(load * 1000 / area, 1)"
                  onChange={(e) => set('formula', e.target.value)}
                />
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Columns of {section.name}</p>
                  <div className="flex flex-wrap gap-1">
                    {ownColumns.filter((c) => c.col_type !== 'link').length ? ownColumns.filter((c) => c.col_type !== 'link').map((c) => (
                      <button key={c.id} type="button" className="inline-flex items-center gap-1 border border-stone-300 bg-white px-1.5 py-0.5 text-xs text-stone-800 hover:border-amber-600 hover:bg-amber-50" title={`Insert ${c.key}`} onClick={() => insert(c.key)}>
                        {c.label} <code className="text-[10px] text-stone-500">{c.key}</code>
                      </button>
                    )) : <span className="text-xs text-stone-500">No other column yet.</span>}
                  </div>
                  {linkedGroups.map((g) => (
                    <div key={g.link.id} className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">From {g.target.name} (Linked Through {g.link.label})</p>
                      <div className="flex flex-wrap gap-1">
                        {g.target.columns.filter((c) => c.col_type !== 'link').map((c) => (
                          <button key={c.id} type="button" className="inline-flex items-center gap-1 border border-stone-300 bg-white px-1.5 py-0.5 text-xs text-stone-800 hover:border-amber-600 hover:bg-amber-50" title={`Insert ${g.link.key}.${c.key} (one value per linked entry; use SUM, AVG, … for several)`} onClick={() => insert(`${g.link.key}.${c.key}`)}>
                            {c.label} <code className="text-[10px] text-stone-500">{g.link.key}.{c.key}</code>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600">Operators</p>
                  <div className="flex flex-wrap gap-1">
                    {[['+', '+'], ['−', '-'], ['×', '*'], ['÷', '/'], ['^', '^'], ['(', '('], [')', ')'], [',', ', '], ['>', ' > '], ['<', ' < '], ['=', ' = '], ['≥', ' >= '], ['≤', ' <= ']].map(([label, text]) => (
                      <button key={label} type="button" className="inline-flex h-7 min-w-7 items-center justify-center border border-stone-400 bg-white px-1.5 font-mono text-sm text-stone-900 hover:bg-amber-50" onClick={() => insert(text!)}>{label}</button>
                    ))}
                  </div>
                  <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600">Functions</p>
                  <div className="flex flex-wrap gap-1">
                    {FORMULA_FUNCTIONS.map((f) => (
                      <button key={f.name} type="button" className="inline-flex h-7 items-center border border-amber-600/60 bg-white px-1.5 font-mono text-xs font-semibold text-amber-900 hover:bg-amber-50" title={f.help} onClick={() => insert(`${f.name}(`)}>{f.name}</button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-amber-200 pt-2">
                  <Label htmlFor="col-decimals" className="shrink-0">Decimals</Label>
                  <Input id="col-decimals" inputMode="numeric" className="h-8 w-20" value={d.decimals} onChange={(e) => set('decimals', e.target.value.replace(/\D/g, ''))} />
                  <p className="text-[11px] text-stone-500">Works only inside this licence. A copy made with Import keeps its own formulas and links.</p>
                </div>
              </div>
            ) : null}
            {d.col_type === 'link' ? (
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="col-link">Link to Entries of</Label>
                <select id="col-link" className="h-9 w-full border border-stone-400 bg-white px-2 text-sm" value={d.link_section} onChange={(e) => set('link_section', e.target.value)}>
                  <option value="">— Choose Section —</option>
                  {sections.filter((s) => s.id !== section.id).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-stone-500">The customer picks one or more entries of that section (e.g. the raw material lots used in a batch). This builds the traceability.</p>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-stone-800 sm:col-span-2">
              <input type="checkbox" className="h-4 w-4" checked={d.required} onChange={(e) => set('required', e.target.checked)} />
              Required (customer must fill it)
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3">
          <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-9')} onClick={onClose}>Cancel</Button>
          <Button type="button" className={cn(limsPrimaryBtnClass, 'h-9 min-w-[6rem]')} disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Admin: records service (trial / paid) and the record formats of one licence. Customers never edit formats. */
/** Section type from its name: a standard name keeps its kind (for the customer's labels and icons), else custom. */
function kindFromName(name: string): string {
  const n = name.trim().toLowerCase()
  const hit = Object.entries(SECTION_KIND_LABEL).find(([k, label]) => k !== 'custom' && label.toLowerCase() === n)
  if (hit) return hit[0]
  if (/^raw\s*material/.test(n)) return 'raw_material'
  if (/^in[\s-]*process/.test(n)) return 'in_process'
  if (/^final\s*test/.test(n)) return 'final_test'
  if (/^(batch|lot)\b/.test(n)) return 'batch'
  return 'custom'
}

/** The + of Sections: a table of sections; the first row adds one by name, other rows rename in place or delete. */
function ManageSectionsDialog({
  sections,
  busy,
  onClose,
  onAdd,
  onRename,
  onDelete,
  onImport,
}: {
  sections: AdminSection[]
  busy: boolean
  onImport: () => void
  onClose: () => void
  onAdd: (kind: string, name: string) => Promise<void>
  onRename: (section: AdminSection, name: string) => Promise<void>
  onDelete: (section: AdminSection) => Promise<void>
}) {
  const [name, setName] = useState('')
  const add = () => {
    const finalName = name.trim()
    if (!finalName) return
    void onAdd(kindFromName(finalName), finalName).then(() => setName(''))
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(limsDialogClass, '[&>button]:top-[10px] sm:[&>button]:top-[14px]', 'flex max-h-[85dvh] w-[min(34rem,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden bg-white p-0')}
      >
        {/* 56px bar: the import button sits beside the dialog's Close button, same size and line. */}
        <div className="flex h-14 shrink-0 items-center bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4">
          <DialogHeader className="flex-1 flex-row items-center gap-2 space-y-0 pr-10 text-left">
            <DialogTitle className="flex-1 text-base font-semibold text-white">Sections</DialogTitle>
            <Button type="button" variant="outline" className={cn(limsDarkBarBtnClass, 'h-9 min-h-9 w-9 p-0 sm:h-7 sm:min-h-7 sm:w-7')} disabled={busy} title="Import From Another Licence" aria-label="Import From Another Licence" onClick={onImport}>
              <Download size={14} aria-hidden />
            </Button>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cn(th, 'w-12 text-center')}>#</th>
                <th className={th}>Name</th>
                <th className={cn(th, 'w-[5.5rem] text-center')}>Columns</th>
                <th className={cn(th, 'w-[4rem] text-center')}>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-amber-50/70">
                <td className={cn(td, 'text-center text-xs font-semibold text-amber-800')}>New</td>
                <td className={td}>
                  <Input
                    value={name}
                    placeholder="Section Name, e.g. Test Certificate"
                    aria-label="New Section Name"
                    className="h-8 min-h-8"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && add()}
                  />
                </td>
                <td className={cn(td, 'text-center text-stone-400')}>—</td>
                <td className={cn(td, 'text-center')}>
                  <button type="button" className={cn(iconBtn, 'border-amber-600 bg-amber-600 text-white hover:bg-amber-700')} disabled={busy || !name.trim()} title="Add Section" aria-label="Add Section" onClick={add}>
                    <Plus size={15} />
                  </button>
                </td>
              </tr>
              {sections.map((sec, i) => (
                <tr key={sec.id} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                  <td className={cn(td, 'text-center text-xs text-stone-500')}>{i + 1}</td>
                  <td className={td}>
                    <Input
                      key={sec.name}
                      defaultValue={sec.name}
                      aria-label={`Name of ${sec.name}`}
                      disabled={busy}
                      className="h-8 min-h-8 border-transparent bg-transparent hover:border-stone-300 focus-visible:bg-white"
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      onBlur={(e) => {
                        const next = e.target.value.trim()
                        if (!next) {
                          e.target.value = sec.name
                          return
                        }
                        if (next !== sec.name) void onRename(sec, next)
                      }}
                    />
                  </td>
                  <td className={cn(td, 'text-center')}>{sec.columns.length}</td>
                  <td className={cn(td, 'text-center')}>
                    <button type="button" className={cn(iconBtn, 'text-red-700 hover:bg-red-50')} disabled={busy} title="Delete Section" aria-label={`Delete ${sec.name}`} onClick={() => void onDelete(sec)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-stone-200 bg-stone-50 px-4 py-2.5">
          <Button type="button" className={cn(limsPrimaryBtnClass, 'h-9 min-h-9')} onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function PortalRecordsSetupDialog({
  licence,
  onOpenChange,
}: {
  licence: { id: string; label: string } | null
  onOpenChange: (open: boolean) => void
}) {
  const [confirm, confirmDialog] = useConfirmDialog()
  const [service, setService] = useState<RecordsService | null>(null)
  const [sections, setSections] = useState<AdminSection[] | null>(null)
  const [activeId, setActiveId] = useState('')
  const [paid, setPaid] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [addingSection, setAddingSection] = useState(false)
  const [importTarget, setImportTarget] = useState<BisProjectRow | null>(null)
  const licenceId = licence?.id ?? ''

  const load = useCallback(
    () =>
      Promise.all([getRecordsService(licenceId), listSections(licenceId)])
        .then(([s, list]) => {
          setService(s)
          setPaid(s?.paid_until ?? '')
          setSections(list)
          setActiveId((prev) => (list.some((x) => x.id === prev) ? prev : list[0]?.id ?? ''))
        })
        .catch((err: unknown) => toast.error(errText(err, 'Could not load the records setup'))),
    [licenceId],
  )

  useEffect(() => {
    if (licenceId) void load()
  }, [licenceId, load])

  const run = async (key: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(key)
    try {
      await action()
      if (done) toast.success(done)
      await load()
    } catch (err) {
      toast.error(errText(err, 'Action failed'))
    } finally {
      setBusy(null)
    }
  }

  const active = useMemo(() => sections?.find((s) => s.id === activeId) ?? null, [sections, activeId])
  const status = serviceStatus(service)

  return (
    <Dialog open={licence != null} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className={cn(limsDialogClass, 'flex max-h-[92dvh] w-[min(64rem,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden bg-white p-0')}>
        {confirmDialog}
        <BisModuleImportDialog
          open={importTarget != null}
          onOpenChange={(open) => !open && setImportTarget(null)}
          targetRow={importTarget}
          kind={null}
          title="Record Sections"
          onPickSource={async (sourceId) => {
            const n = await copySectionsFrom(sourceId, licenceId)
            if (n === 0) throw new Error('That licence has no record sections')
            toast.success(n === 1 ? '1 Section Imported' : `${n} Sections Imported`)
            await load()
          }}
        />
        {addingSection && sections ? (
          <ManageSectionsDialog
            sections={sections}
            busy={busy != null}
            onClose={() => setAddingSection(false)}
            onAdd={async (kind, name) => {
              setBusy('add-section')
              try {
                const id = await createSection(licenceId, kind, name, sections.length)
                toast.success('Section Added')
                setActiveId(id)
                await load()
              } catch (err) {
                toast.error(errText(err, 'Could not add the section'))
              } finally {
                setBusy(null)
              }
            }}
            onImport={() => void fetchBisProjectById(licenceId)
              .then((row) => (row ? setImportTarget(row) : toast.error('Licence not found')))
              .catch((err: unknown) => toast.error(errText(err, 'Could not open the import')))}
            onRename={(sec, name) => run('rename', () => updateSection(sec.id, { name }), 'Section Renamed')}
            onDelete={async (sec) => {
              if (!(await confirm(`Delete the section "${sec.name}" with all its columns and the customer's entries in it?`, { title: 'Delete Section', confirmLabel: 'Delete', destructive: true }))) return
              await run('del-section', () => deleteSection(sec.id), 'Section Deleted')
            }}
          />
        ) : null}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="truncate text-base font-semibold text-white">Records Setup — {licence?.label}</DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#fffcf7] p-4">
          {sections == null ? (
            <p className="flex items-center gap-2 text-sm text-stone-600"><Loader2 size={16} className="animate-spin" /> Loading…</p>
          ) : (
            <>
              <section className="space-y-3 border border-stone-300 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('border px-1.5 py-0.5 text-[11px] font-medium', status.tone)} title="Records Service">{status.text}</span>
                  {service?.records_enabled ? (
                    <>
                      <Label htmlFor="paid-until" className="ml-1 text-sm">Paid Till</Label>
                      <CalendarDateField id="paid-until" label="Paid Till" className="w-[10.5rem]" value={paid} disabled={busy != null} onChange={setPaid} />
                      <Button type="button" className={cn(limsPrimaryBtnClass, 'h-10 w-10 p-0')} disabled={busy != null} title="Save Paid Date" aria-label="Save Paid Date"
                        onClick={() => void run('paid', () => setPaidUntil(licenceId, paid || null), 'Paid Date Saved')}>
                        <Save size={16} aria-hidden />
                      </Button>
                    </>
                  ) : null}
                  <Label htmlFor="records-section" className="ml-2 text-sm font-semibold text-stone-900">Sections</Label>
                  <LimsFieldWithAdd
                    className="w-full sm:w-[14rem]"
                    addButton={<LimsFieldAddButton aria-label="Add, Rename or Delete Sections" title="Add, Rename or Delete Sections" disabled={busy != null} onClick={() => setAddingSection(true)} />}
                  >
                    <select
                      id="records-section"
                      className="h-full w-full border-0 bg-stone-50 px-3 text-sm focus:outline-none"
                      value={activeId}
                      disabled={sections.length === 0}
                      onChange={(e) => setActiveId(e.target.value)}
                    >
                      {sections.length === 0 ? <option value="">No Section Yet</option> : null}
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </LimsFieldWithAdd>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {sections.length === 0 ? (
                      <Button type="button" className={cn(limsPrimaryBtnClass, 'h-10 gap-1 text-xs')} disabled={busy != null} onClick={() => void run('std', () => createStandardSections(licenceId, 0), 'Standard Sections Created')}>
                        {busy === 'std' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Create Standard Sections
                      </Button>
                    ) : null}
                    {active?.kind === 'final_test' ? (
                      <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10 p-0 text-amber-800')} disabled={busy != null}
                        title="Add From IS Test Parameters" aria-label="Add From IS Test Parameters"
                        onClick={() => void run('tp', async () => {
                          const n = await addTestParameterColumns(licenceId, active.id, active.columns.length, active.columns.map((c) => c.key))
                          toast.success(n ? `${n} Columns Added` : 'No Test Parameters for This IS Code')
                        })}>
                        <FlaskConical size={16} aria-hidden />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(limsOutlineBtnClass, 'h-10 w-10 p-0', service?.records_enabled ? 'text-red-700' : 'text-emerald-700')}
                      disabled={busy != null}
                      title={service?.records_enabled ? 'Switch Off Records Service' : `Switch On Records Service (${TRIAL_DAYS}-Day Free Trial)`}
                      aria-label={service?.records_enabled ? 'Switch Off Records Service' : 'Switch On Records Service'}
                      onClick={() =>
                        void run('svc', () => setRecordsEnabled(licenceId, !service?.records_enabled, service), service?.records_enabled ? 'Service Switched Off' : 'Service Switched On')
                      }
                    >
                      <Power size={17} aria-hidden />
                    </Button>
                  </div>
                </div>
                {sections.length === 0 ? (
                  <p className="text-sm text-stone-600">
                    Standard Sections makes Raw Material, In-Process, Final Testing and Batch / Lot. Final Testing columns come from this licence's IS Code test parameters, and Raw Material options from its Raw Material Reference. You can change everything afterwards.
                  </p>
                ) : (
                  <>
                    {active ? (
                      <div className="space-y-2">
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr>
                                <th className={cn(th, 'w-10 text-center')}>#</th>
                                <th className={th}>Column</th>
                                <th className={cn(th, 'text-center')}>Type</th>
                                <th className={cn(th, 'text-center')}>Unit / Limits</th>
                                <th className={cn(th, 'text-center')}>Details</th>
                                <th className={cn(th, 'w-[1%] text-center')}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {active.columns.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className={cn(td, 'py-4 text-center text-stone-500')}>No columns yet.</td>
                                  <td className={cn(td, 'text-center')}>
                                    <button type="button" className={cn(iconBtn, 'text-emerald-700')} title="Add Column" aria-label="Add Column" disabled={busy != null} onClick={() => setEditing({ ...draftFrom(), insertAt: 0 })}><Plus size={13} /></button>
                                  </td>
                                </tr>
                              ) : (
                                active.columns.map((c, i) => (
                                  <tr key={c.id} className={i % 2 ? 'bg-[#faf7f1]' : 'bg-white'}>
                                    <td className={cn(td, 'text-center text-stone-500')}>{i + 1}</td>
                                    <td className={td}>
                                      <span className="font-medium">{c.label}</span>{c.required ? <span className="text-red-600"> *</span> : null}
                                      <span className="block text-[11px] text-stone-500"><code>{c.key}</code></span>
                                    </td>
                                    <td className={cn(td, 'text-center text-xs')}>{COLUMN_TYPE_LABEL[c.col_type]}</td>
                                    <td className={cn(td, 'text-center text-xs')}>{limitsText(c) || c.unit || '—'}</td>
                                    <td className={cn(td, 'max-w-[16rem] truncate text-center text-xs text-stone-600')}>
                                      {c.col_type === 'formula' ? <code>= {c.config.formula}</code>
                                        : c.col_type === 'select' ? (c.config.options ?? []).join(', ')
                                          : c.col_type === 'link' ? `→ ${sections.find((s) => s.id === c.config.section_id)?.name ?? '?'}`
                                            : '—'}
                                    </td>
                                    <td className={cn(td, 'whitespace-nowrap')}>
                                      <span className="flex justify-center gap-1">
                                        <button type="button" className={iconBtn} title="Move Up" aria-label="Move Up" disabled={busy != null || i === 0} onClick={() => void run('mv', () => moveColumn(active.columns, i, -1))}><ArrowUp size={13} /></button>
                                        <button type="button" className={iconBtn} title="Move Down" aria-label="Move Down" disabled={busy != null || i === active.columns.length - 1} onClick={() => void run('mv', () => moveColumn(active.columns, i, 1))}><ArrowDown size={13} /></button>
                                        <button type="button" className={iconBtn} title="Edit" aria-label={`Edit ${c.label}`} onClick={() => setEditing(draftFrom(c))}><Pencil size={13} /></button>
                                        <button type="button" className={cn(iconBtn, 'text-emerald-700')} title="Add Column Below" aria-label={`Add Column Below ${c.label}`} disabled={busy != null} onClick={() => setEditing({ ...draftFrom(), insertAt: i + 1 })}><Plus size={13} /></button>
                                        <button type="button" className={cn(iconBtn, 'text-red-700')} title="Delete" aria-label={`Delete ${c.label}`} disabled={busy != null}
                                          onClick={() => void (async () => {
                                            if (!(await confirm(`Delete the column "${c.label}"? Values already entered in it stay in old entries but are no longer shown.`, { title: 'Delete Column', confirmLabel: 'Delete', destructive: true }))) return
                                            await run('del-col', () => deleteColumn(c.id), 'Column Deleted')
                                          })()}>
                                          <Trash2 size={13} />
                                        </button>
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            </>
          )}
        </div>
        {editing && active && sections ? (
          <ColumnEditor
            section={active}
            sections={sections}
            draft={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              void load()
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
