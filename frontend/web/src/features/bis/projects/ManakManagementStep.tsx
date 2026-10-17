import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { BisPrintClient } from '../print/loadBisPrintData'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import {
  emptyTechnicalStaffRow,
  fetchBisModulePayload,
  saveBisModulePayload,
} from './bisModuleDataApi'
import { ManakPanel, ManakSubPanel } from './ManakStepPages'

type Rec = Record<string, unknown>

const CORRESPONDENCE_KIND = 'application-correspondence' as BisPrintDocumentKind
const ADDRESS_TYPES = ['Office', 'Factory'] as const

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const rowsOf = (p: Rec | null | undefined): Rec[] => (Array.isArray(p?.rows) ? (p?.rows as Rec[]) : [])

const inputCls = 'h-8 rounded-none border-stone-400 bg-white px-2 text-sm'
const iconBtn =
  'h-7 w-7 rounded-none border border-stone-400 bg-white/70 p-0 text-amber-800 hover:border-amber-600 hover:bg-amber-50'
const checkCls = 'h-4 w-4 rounded-none border-stone-500 text-amber-700'
const thCls =
  'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'

async function patchPayload(
  projectId: string,
  kind: BisPrintDocumentKind,
  mutate: (payload: Rec) => Rec,
): Promise<void> {
  const current = (await fetchBisModulePayload(projectId, kind)) ?? {}
  await saveBisModulePayload(projectId, kind, mutate({ ...current }))
}

type Field = { key: string; label: string; placeholder?: string; width?: string }

/**
 * Manak-style editable table: an input row on top with "+", then saved rows
 * with Edit / Delete in the same row. A narrow checkbox column replaces S.No.
 */
function EditableRows({
  projectId,
  kind,
  fields,
  blank,
  extraColumns,
  saved,
  onChanged,
  addLabel,
}: {
  projectId: string
  kind: BisPrintDocumentKind
  fields: Field[]
  blank: () => Rec
  extraColumns?: Array<{ label: string; render: (row: Rec) => React.ReactNode }>
  saved: Rec[]
  onChanged: () => void
  addLabel: string
}) {
  const [draft, setDraft] = useState<Rec>(() => blank())
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Rec>({})
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  const rows = useMemo(
    () => saved.map((r, index) => ({ r, index })).filter(({ r }) => fields.some((f) => str(r[f.key]).trim())),
    [saved, fields],
  )

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    if (!fields[0] || !str(draft[fields[0].key]).trim()) {
      toast.error(`${fields[0]?.label ?? 'Name'} is required.`)
      return
    }
    void run(async () => {
      await patchPayload(projectId, kind, (p) => {
        const list = rowsOf(p).filter((r) => fields.some((f) => str(r[f.key]).trim()))
        return { ...p, rows: [...list, { ...blank(), ...draft }] }
      })
      setDraft(blank())
    }, 'Row added')
  }

  const saveEdit = () => {
    if (editIndex == null) return
    void run(async () => {
      await patchPayload(projectId, kind, (p) => {
        const list = rowsOf(p).map((r, i) => (i === editIndex ? { ...r, ...editDraft } : r))
        return { ...p, rows: list }
      })
      setEditIndex(null)
    }, 'Row updated')
  }

  const remove = (indexes: number[]) => {
    if (indexes.length === 0) return
    void run(async () => {
      await patchPayload(projectId, kind, (p) => {
        const list = rowsOf(p).filter((_, i) => !indexes.includes(i))
        return { ...p, rows: list.length > 0 ? list : [blank()] }
      })
      setSelected(new Set())
    }, indexes.length > 1 ? 'Rows deleted' : 'Row deleted')
  }

  const toggle = (index: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  return (
    <div className="space-y-2">
      {selected.size > 0 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-7 rounded-none border-red-300 text-xs text-red-700 hover:bg-red-50"
            onClick={() => remove([...selected])}
          >
            <Trash2 className="mr-1 h-3 w-3" aria-hidden /> Delete selected ({selected.size})
          </Button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(thCls, 'w-8 px-1 text-center')} aria-label="Select" />
              {fields.map((f) => (
                <th key={f.key} className={thCls} style={f.width ? { width: f.width } : undefined}>
                  {f.label}
                  <span className="text-red-400">*</span>
                </th>
              ))}
              {extraColumns?.map((c) => (
                <th key={c.label} className={thCls}>
                  {c.label}
                </th>
              ))}
              <th className={cn(thCls, 'w-24 text-center')}>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-[#fffcf7]">
              <td className={tdCls} />
              {fields.map((f) => (
                <td key={f.key} className={tdCls}>
                  <Input
                    className={inputCls}
                    placeholder={f.placeholder ?? f.label}
                    value={str(draft[f.key])}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') add()
                    }}
                  />
                </td>
              ))}
              {extraColumns?.map((c) => (
                <td key={c.label} className={cn(tdCls, 'text-xs text-stone-400')}>
                  via Edit module
                </td>
              ))}
              <td className={cn(tdCls, 'text-center')}>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  className="h-7 rounded-none bg-amber-700 px-2 text-xs text-white hover:bg-amber-800"
                  onClick={add}
                  title={addLabel}
                >
                  <Plus className="mr-1 h-3 w-3" aria-hidden /> Add
                </Button>
              </td>
            </tr>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={fields.length + (extraColumns?.length ?? 0) + 2} className={cn(tdCls, 'py-3 text-center text-stone-500')}>
                  No records yet.
                </td>
              </tr>
            ) : (
              rows.map(({ r, index }, n) => {
                const editing = editIndex === index
                return (
                  <tr key={index} className={n % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                    <td className={cn(tdCls, 'px-1 text-center')}>
                      <input
                        type="checkbox"
                        className={checkCls}
                        aria-label={`Select row ${n + 1}`}
                        checked={selected.has(index)}
                        onChange={() => toggle(index)}
                      />
                    </td>
                    {fields.map((f) => (
                      <td key={f.key} className={tdCls}>
                        {editing ? (
                          <Input
                            className={inputCls}
                            value={str(editDraft[f.key])}
                            onChange={(e) => setEditDraft({ ...editDraft, [f.key]: e.target.value })}
                          />
                        ) : (
                          str(r[f.key]) || <span className="text-stone-400">—</span>
                        )}
                      </td>
                    ))}
                    {extraColumns?.map((c) => (
                      <td key={c.label} className={tdCls}>
                        {c.render(r)}
                      </td>
                    ))}
                    <td className={cn(tdCls, 'text-center')}>
                      <span className="inline-flex gap-1">
                        {editing ? (
                          <>
                            <Button type="button" variant="ghost" className={iconBtn} disabled={busy} title="Save" onClick={saveEdit}>
                              <Check size={14} />
                            </Button>
                            <Button type="button" variant="ghost" className={iconBtn} title="Cancel" onClick={() => setEditIndex(null)}>
                              <X size={14} />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              className={iconBtn}
                              title="Edit row"
                              onClick={() => {
                                setEditIndex(index)
                                setEditDraft({ ...r })
                              }}
                            >
                              <Pencil size={13} />
                            </Button>
                            <Button type="button" variant="ghost" className={iconBtn} disabled={busy} title="Delete row" onClick={() => remove([index])}>
                              <Trash2 size={13} />
                            </Button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ManakManagementStep({
  projectId,
  client,
  topManagement,
  technicalStaff,
  correspondence,
  onChanged,
  onOpenModule,
}: {
  projectId: string
  client: BisPrintClient | undefined
  topManagement: Rec | null | undefined
  technicalStaff: Rec | null | undefined
  correspondence: Rec | null | undefined
  onChanged: () => void
  onOpenModule: (kind: BisPrintDocumentKind) => void
}) {
  const tmRows = rowsOf(topManagement)
  const firstTm = tmRows.find((r) => str(r.personName).trim())

  const initial = useMemo(
    () => ({
      addressType: str(correspondence?.addressType) || 'Factory',
      name: str(correspondence?.name) || str(firstTm?.personName) || client?.contactPerson || '',
      designation: str(correspondence?.designation) || str(firstTm?.designation) || '',
      email: str(correspondence?.email) || str(firstTm?.email) || client?.email || '',
      mobile: str(correspondence?.mobile) || str(firstTm?.mobile) || client?.mobile || '',
    }),
    [correspondence, firstTm, client],
  )
  const [corr, setCorr] = useState(initial)
  const [corrBusy, setCorrBusy] = useState(false)
  useEffect(() => setCorr(initial), [initial])

  const addressFor = (type: string) =>
    type === 'Factory' ? client?.factoryAddress || client?.address : client?.officeAddress || client?.address

  const saveCorr = async () => {
    setCorrBusy(true)
    try {
      await saveBisModulePayload(projectId, CORRESPONDENCE_KIND, { ...corr })
      toast.success('Correspondence details saved')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setCorrBusy(false)
    }
  }

  const yes = (v: unknown) => (str(v).trim() ? 'Yes' : 'No')
  const blankTm = (): Rec => ({
    personName: '',
    designation: '',
    mobile: '',
    email: '',
    signatureFileId: '',
    signatureFileName: '',
    signatureStoragePath: '',
    applySignatureToDocuments: false,
  })

  return (
    <>
      <ManakPanel title="Firm's Management Details" onEdit={() => onOpenModule('top-management')} editLabel="Open module">
        <ManakSubPanel title="Top Management Details">
          <EditableRows
            projectId={projectId}
            kind={'top-management' as BisPrintDocumentKind}
            fields={[
              { key: 'personName', label: 'Name' },
              { key: 'designation', label: 'Designation' },
              { key: 'mobile', label: 'Contact No.' },
              { key: 'email', label: 'Email ID' },
            ]}
            blank={blankTm}
            saved={tmRows}
            onChanged={onChanged}
            addLabel="Add top management person"
          />
        </ManakSubPanel>
        <ManakSubPanel title="Correspondence Details">
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm md:grid-cols-2">
            <label className="grid grid-cols-[minmax(8rem,12rem)_1fr] items-center gap-2">
              <span className="font-bold text-stone-800">Correspondence Address Communication*:</span>
              <select
                className={cn(inputCls, 'w-full border px-2')}
                value={corr.addressType}
                onChange={(e) => setCorr({ ...corr, addressType: e.target.value })}
              >
                {ADDRESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-[minmax(8rem,12rem)_1fr] items-center gap-2">
              <span className="font-bold text-stone-800">Address:</span>
              <span className="min-w-0 break-words text-stone-700">{addressFor(corr.addressType) || '—'}</span>
            </div>
            {(
              [
                ['name', 'Name of Contact Person*'],
                ['designation', 'Designation of Contact Person*'],
                ['email', 'E-Mail Id*'],
                ['mobile', 'Contact Number*'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="grid grid-cols-[minmax(8rem,12rem)_1fr] items-center gap-2">
                <span className="font-bold text-stone-800">{label}:</span>
                <Input
                  className={inputCls}
                  value={corr[key]}
                  onChange={(e) => setCorr({ ...corr, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-stone-600">
              Kindly note that the above correspondence will be used for all communications / alerts from BIS.
            </p>
            <Button
              type="button"
              size="sm"
              disabled={corrBusy}
              className="h-7 rounded-none bg-amber-700 px-3 text-xs text-white hover:bg-amber-800"
              onClick={() => void saveCorr()}
            >
              Save
            </Button>
          </div>
        </ManakSubPanel>
      </ManakPanel>

      <ManakPanel title="Technical Management / Quality Assurance / Control Personnel Details" onEdit={() => onOpenModule('technical-staff')} editLabel="Open module">
        <EditableRows
          projectId={projectId}
          kind={'technical-staff' as BisPrintDocumentKind}
          fields={[
            { key: 'personName', label: 'Name' },
            { key: 'designation', label: 'Designation' },
            { key: 'educationalQualification', label: 'Qualification' },
            { key: 'experienceYears', label: 'Experience (in years)', width: '9rem' },
          ]}
          blank={() => ({ ...emptyTechnicalStaffRow() })}
          extraColumns={[
            { label: 'Qualification Document', render: (r) => yes(r.educationCertificateFileId) },
            { label: 'Photo', render: (r) => yes(r.photoFileId) },
          ]}
          saved={rowsOf(technicalStaff)}
          onChanged={onChanged}
          addLabel="Add technical person"
        />
      </ManakPanel>
    </>
  )
}

export { CORRESPONDENCE_KIND }
