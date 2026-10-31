import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, FlaskConical, Loader2, Pencil, Plus, Power, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { formulaProblem } from '@/lib/recordFormula'
import { limsDarkBarGlowStyle, limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
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
  createSection,
  createStandardSections,
  deleteColumn,
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
  // A formula may use the columns before it (they are calculated in order).
  const formulaKeys = section.columns.filter((c) => c.id !== d.id).map((c) => c.key)
  const problem = d.col_type === 'formula' ? formulaProblem(d.formula, formulaKeys) : ''
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
        sort_order: d.id ? section.columns.find((c) => c.id === d.id)?.sort_order ?? 0 : section.columns.length,
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
      <DialogContent aria-describedby={undefined} className={cn(limsDialogClass, 'w-[min(36rem,calc(100vw-1rem))] max-w-none gap-0 overflow-hidden bg-white p-0')}>
        <div className="bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">{d.id ? 'Edit Column' : 'Add Column'} — {section.name}</DialogTitle>
          </DialogHeader>
        </div>
        <div className="max-h-[70dvh] space-y-3 overflow-y-auto bg-[#fffcf7] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="col-label">Column Name</Label>
              <Input id="col-label" value={d.label} placeholder="Tensile Strength" onChange={(e) => set('label', e.target.value)} />
              <p className="text-[11px] text-stone-500">Formula Name: <code className="bg-stone-100 px-1">{key}</code></p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="col-type">Type</Label>
              <select id="col-type" className="h-9 w-full border border-stone-400 bg-white px-2 text-sm" value={d.col_type} onChange={(e) => set('col_type', e.target.value as RecordColumnType)}>
                {EDITABLE_TYPES.map((t) => (
                  <option key={t} value={t}>{COLUMN_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="col-unit">Unit</Label>
              <Input id="col-unit" value={d.unit} placeholder="MPa, %, mm" onChange={(e) => set('unit', e.target.value)} />
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
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="col-formula">Formula</Label>
                <Input id="col-formula" className="font-mono" value={d.formula} placeholder="ROUND(load * 1000 / area, 1)" onChange={(e) => set('formula', e.target.value)} />
                <p className={cn('text-[11px]', problem ? 'text-red-700' : 'text-emerald-700')}>{problem || 'Formula OK'}</p>
                <p className="text-[11px] text-stone-500">
                  Columns: {formulaKeys.length ? formulaKeys.map((k) => <code key={k} className="mr-1 bg-stone-100 px-1">{k}</code>) : 'none yet'}
                  <br />Functions: SUM, AVG, MIN, MAX, ROUND(x, digits), ABS, SQRT, IF(condition, a, b), AND, OR, NOT · Operators + − × (*) ÷ (/) ^ and &gt; &lt; =
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Label htmlFor="col-decimals" className="shrink-0">Decimals</Label>
                  <Input id="col-decimals" inputMode="numeric" className="h-8 w-20" value={d.decimals} onChange={(e) => set('decimals', e.target.value.replace(/\D/g, ''))} />
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
/** The + of Sections: add a section (type and name), rename or delete the existing ones. */
function ManageSectionsDialog({
  sections,
  busy,
  onClose,
  onAdd,
  onRename,
  onDelete,
}: {
  sections: AdminSection[]
  busy: boolean
  onClose: () => void
  onAdd: (kind: string, name: string) => Promise<void>
  onRename: (section: AdminSection, name: string) => Promise<void>
  onDelete: (section: AdminSection) => Promise<void>
}) {
  const [kind, setKind] = useState('custom')
  const [name, setName] = useState('')
  const finalName = name.trim() || (kind === 'custom' ? '' : SECTION_KIND_LABEL[kind] ?? '')
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className={cn(limsDialogClass, 'flex max-h-[85dvh] w-[min(40rem,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden bg-white p-0')}>
        <div className="bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">Sections</DialogTitle>
          </DialogHeader>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-b border-stone-200 bg-stone-50 p-3">
          <div className="space-y-1">
            <Label htmlFor="new-section-kind">Type</Label>
            <select id="new-section-kind" className="block h-10 w-[10rem] border border-stone-500 bg-white px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(SECTION_KIND_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[10rem] flex-1 space-y-1">
            <Label htmlFor="new-section-name">Name</Label>
            <Input id="new-section-name" value={name} placeholder={kind === 'custom' ? 'e.g. Test Certificate' : SECTION_KIND_LABEL[kind]} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button
            type="button"
            className={cn(limsPrimaryBtnClass, 'gap-1')}
            disabled={busy || !finalName}
            onClick={() => void onAdd(kind, finalName).then(() => setName(''))}
          >
            <Plus size={15} /> Add
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {sections.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">No section yet.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={cn(th, 'w-10 text-center')}>#</th>
                  <th className={th}>Name</th>
                  <th className={cn(th, 'w-[8rem] text-center')}>Type</th>
                  <th className={cn(th, 'w-[5.5rem] text-center')}>Columns</th>
                  <th className={cn(th, 'w-[3.5rem] text-center')}>Delete</th>
                </tr>
              </thead>
              <tbody>
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
                    <td className={cn(td, 'text-center text-xs')}>{SECTION_KIND_LABEL[sec.kind] ?? sec.kind}</td>
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
          )}
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
              <section className="flex flex-wrap items-center gap-2 border border-stone-300 bg-white p-3">
                <h3 className="text-sm font-semibold text-stone-900">Records Service</h3>
                <span className={cn('border px-1.5 py-0.5 text-[11px] font-medium', status.tone)}>{status.text}</span>
                {service?.records_enabled ? (
                  <>
                    <Label htmlFor="paid-until" className="ml-2 text-sm">Paid Till</Label>
                    <CalendarDateField id="paid-until" label="Paid Till" className="w-[11.5rem]" value={paid} disabled={busy != null} onChange={setPaid} />
                    <Button type="button" className={cn(limsPrimaryBtnClass, 'h-10 text-xs')} disabled={busy != null} onClick={() => void run('paid', () => setPaidUntil(licenceId, paid || null), 'Paid Date Saved')}>
                      Save Paid Date
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className={cn(limsOutlineBtnClass, 'ml-auto h-10 w-10 p-0', service?.records_enabled ? 'text-red-700' : 'text-emerald-700')}
                  disabled={busy != null}
                  title={service?.records_enabled ? 'Switch Off' : `Switch On (${TRIAL_DAYS}-Day Free Trial)`}
                  aria-label={service?.records_enabled ? 'Switch Off Records Service' : 'Switch On Records Service'}
                  onClick={() =>
                    void run('svc', () => setRecordsEnabled(licenceId, !service?.records_enabled, service), service?.records_enabled ? 'Service Switched Off' : 'Service Switched On')
                  }
                >
                  <Power size={17} aria-hidden />
                </Button>
              </section>

              <section className="space-y-3 border border-stone-300 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="records-section" className="text-sm font-semibold text-stone-900">Sections</Label>
                  <LimsFieldWithAdd
                    className="w-full sm:w-[20rem]"
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
                        <option key={s.id} value={s.id}>{s.name} ({s.columns.length})</option>
                      ))}
                    </select>
                  </LimsFieldWithAdd>
                  {sections.length === 0 ? (
                    <Button type="button" className={cn(limsPrimaryBtnClass, 'h-10 gap-1 text-xs')} disabled={busy != null} onClick={() => void run('std', () => createStandardSections(licenceId, 0), 'Standard Sections Created')}>
                      {busy === 'std' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Create Standard Sections
                    </Button>
                  ) : null}
                  {active ? (
                    <div className="ml-auto flex flex-wrap gap-2">
                      {active.kind === 'final_test' ? (
                        <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 gap-1 px-3 text-xs')} disabled={busy != null}
                          onClick={() => void run('tp', async () => {
                            const n = await addTestParameterColumns(licenceId, active.id, active.columns.length, active.columns.map((c) => c.key))
                            toast.success(n ? `${n} Columns Added` : 'No Test Parameters for This IS Code')
                          })}>
                          <FlaskConical size={13} /> Add From IS Test Parameters
                        </Button>
                      ) : null}
                      <Button type="button" className={cn(limsPrimaryBtnClass, 'h-10 gap-1 text-xs')} disabled={busy != null} onClick={() => setEditing(draftFrom())}>
                        <Plus size={14} /> Add Column
                      </Button>
                    </div>
                  ) : null}
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
                                <th className={th}>Type</th>
                                <th className={th}>Unit / Limits</th>
                                <th className={th}>Details</th>
                                <th className={cn(th, 'w-[1%]')} />
                              </tr>
                            </thead>
                            <tbody>
                              {active.columns.length === 0 ? (
                                <tr><td colSpan={6} className={cn(td, 'py-4 text-center text-stone-500')}>No columns yet.</td></tr>
                              ) : (
                                active.columns.map((c, i) => (
                                  <tr key={c.id} className={i % 2 ? 'bg-[#faf7f1]' : 'bg-white'}>
                                    <td className={cn(td, 'text-center text-stone-500')}>{i + 1}</td>
                                    <td className={td}>
                                      <span className="font-medium">{c.label}</span>{c.required ? <span className="text-red-600"> *</span> : null}
                                      <span className="block text-[11px] text-stone-500"><code>{c.key}</code></span>
                                    </td>
                                    <td className={cn(td, 'text-xs')}>{COLUMN_TYPE_LABEL[c.col_type]}</td>
                                    <td className={cn(td, 'text-xs')}>{limitsText(c) || c.unit || '—'}</td>
                                    <td className={cn(td, 'max-w-[16rem] truncate text-xs text-stone-600')}>
                                      {c.col_type === 'formula' ? <code>= {c.config.formula}</code>
                                        : c.col_type === 'select' ? (c.config.options ?? []).join(', ')
                                          : c.col_type === 'link' ? `→ ${sections.find((s) => s.id === c.config.section_id)?.name ?? '?'}`
                                            : '—'}
                                    </td>
                                    <td className={cn(td, 'whitespace-nowrap')}>
                                      <span className="flex gap-1">
                                        <button type="button" className={iconBtn} title="Move Up" aria-label="Move Up" disabled={busy != null || i === 0} onClick={() => void run('mv', () => moveColumn(active.columns, i, -1))}><ArrowUp size={13} /></button>
                                        <button type="button" className={iconBtn} title="Move Down" aria-label="Move Down" disabled={busy != null || i === active.columns.length - 1} onClick={() => void run('mv', () => moveColumn(active.columns, i, 1))}><ArrowDown size={13} /></button>
                                        <button type="button" className={iconBtn} title="Edit" aria-label={`Edit ${c.label}`} onClick={() => setEditing(draftFrom(c))}><Pencil size={13} /></button>
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
