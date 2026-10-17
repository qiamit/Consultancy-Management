import { useEffect, useMemo, useState } from 'react'
import { Check, Download, Eye, FileType, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { BisPrintClient } from '../print/loadBisPrintData'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import type { BisProjectRow } from './types'
import {
  emptyTechnicalStaffRow,
  fetchBisModulePayload,
  saveBisModulePayload,
} from './bisModuleDataApi'
import { StaffDocumentsCell } from './StaffDocumentsCell'
import { MasterOptionFieldWithAdd } from './MasterOptionFieldWithAdd'
import type { BisMasterOptionCategory } from './bisMasterOptions'
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

/** Preview / PDF / Word icon buttons shown in a panel header. */
function DocActions({ what, actions }: { what: string; actions?: { preview: () => void; pdf: () => void; word: () => void } }) {
  if (!actions) return null
  return (
    <div className="flex shrink-0 items-center gap-1">
      {(
        [
          [`Preview ${what}`, actions.preview, Eye],
          [`Download ${what} as PDF`, actions.pdf, Download],
          [`Download ${what} as Word`, actions.word, FileType],
        ] as const
      ).map(([label, handler, Icon]) => (
        <button
          key={label}
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-stone-400 bg-white text-amber-800 transition-colors hover:bg-amber-50"
          title={label}
          aria-label={label}
          onClick={handler}
        >
          <Icon size={15} aria-hidden />
        </button>
      ))}
    </div>
  )
}

/** Marks one top-management row as the Authorized Signatory (exclusive) and fills the fields the Authorization Letter reads. */
function withAuthorizedSignatory(payload: Rec, index: number | null): Rec {
  const rows: Rec[] = (Array.isArray(payload.rows) ? (payload.rows as Rec[]) : []).map((r, i) => ({ ...r, isAuthorizedSignatory: index === i }))
  const chosen = index == null ? null : rows[index]
  return {
    ...payload,
    rows,
    authorizedSignatoryMode: 'table',
    includeAuthorizedSignatory: Boolean(chosen),
    authorizedSignatoryName: chosen ? str(chosen.personName) : '',
    authorizedSignatoryDesignation: chosen ? str(chosen.designation) : '',
    authorizedSignatoryEmail: chosen ? str(chosen.email) : '',
    authorizedSignatoryMobile: chosen ? str(chosen.mobile) : '',
  }
}

function AuthorizedSignatoryCell({
  projectId,
  rowIndex,
  row,
  onChanged,
  onDraftChange,
}: {
  projectId: string
  rowIndex: number
  row: Rec
  onChanged: () => void
  onDraftChange?: (patch: Rec) => void
}) {
  const [busy, setBusy] = useState(false)
  const checked = Boolean(row.isAuthorizedSignatory)
  const toggle = async (next: boolean) => {
    if (onDraftChange) {
      onDraftChange({ isAuthorizedSignatory: next })
      return
    }
    setBusy(true)
    try {
      await patchPayload(projectId, 'top-management' as BisPrintDocumentKind, (p) => withAuthorizedSignatory(p, next ? rowIndex : null))
      toast.success(next ? 'Authorized Signatory set — the Authorization Letter is included in the documents' : 'Authorized Signatory removed')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }
  return (
    <label
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-700"
      title="Make this person the Authorized Signatory (the Authorization Letter is added to Preview / PDF / Word)"
    >
      <input
        type="checkbox"
        className="h-4 w-4 rounded-none accent-amber-600"
        disabled={busy}
        checked={checked}
        onChange={(e) => void toggle(e.target.checked)}
        aria-label="Authorized Signatory"
      />
      Auth. Sign
    </label>
  )
}

type Field = {
  key: string
  label: string
  placeholder?: string
  width?: string
  /** Not mandatory: no asterisk, and it may stay empty. */
  optional?: boolean
  /** Digits only, exactly this many when filled in. */
  digits?: number
  /** Select-or-add drop-down backed by a shared master list (the + button adds to it). */
  master?: BisMasterOptionCategory
}

const cleanField = (f: Field, value: string) => (f.digits ? value.replace(/[^0-9]/g, '').slice(0, f.digits) : value)
const fieldError = (fields: Field[], values: Rec): string | null => {
  for (const f of fields) {
    const v = str(values[f.key]).trim()
    if (f.digits && v && v.length !== f.digits) return `${f.label} must be ${f.digits} digits.`
  }
  return null
}

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
  extraColumns?: Array<{
    label: string
    render: (row: Rec, index: number) => React.ReactNode
    /** Cell for the input (draft) row; when absent a hint is shown. */
    renderDraft?: (draft: Rec, patchDraft: (patch: Rec) => void) => React.ReactNode
  }>
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
    const bad = fieldError(fields, draft)
    if (bad) {
      toast.error(bad)
      return
    }
    void run(async () => {
      await patchPayload(projectId, kind, (p) => {
        const list = rowsOf(p).filter((r) => fields.some((f) => str(r[f.key]).trim()))
        let next: Rec = { ...p, rows: [...list, { ...blank(), ...draft }] }
        if (draft.applySignatureToDocuments) {
          next = {
            ...next,
            rows: (next.rows as Rec[]).map((r, i, all) => ({ ...r, applySignatureToDocuments: i === all.length - 1 })),
            signatoryName: str(draft.personName) || str(p.signatoryName),
            signatoryDesignation: str(draft.designation) || str(p.signatoryDesignation),
          }
        }
        if (draft.isAuthorizedSignatory) next = withAuthorizedSignatory(next, (next.rows as Rec[]).length - 1)
        return next
      })
      setDraft(blank())
    }, 'Row added')
  }

  const saveEdit = () => {
    if (editIndex == null) return
    const bad = fieldError(fields, editDraft)
    if (bad) {
      toast.error(bad)
      return
    }
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
                <th key={f.key} className={cn(thCls, 'text-center')} style={f.width ? { width: f.width } : undefined}>
                  {f.label}
                  {f.optional ? null : <span className="text-red-400">*</span>}
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
                  {f.master ? (
                    <MasterOptionFieldWithAdd
                      category={f.master}
                      label={f.label}
                      manageTitle={f.label}
                      showLabel={false}
                      inputId={`er-${kind}-${f.key}-new`}
                      listId={`er-${kind}-${f.key}-new-list`}
                      value={str(draft[f.key])}
                      onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                      placeholder="Select or Add"
                    />
                  ) : (
                  <Input
                    className={inputCls}
                    placeholder={f.placeholder ?? f.label}
                    value={str(draft[f.key])}
                    onChange={(e) => setDraft({ ...draft, [f.key]: cleanField(f, e.target.value) })}
                    inputMode={f.digits ? 'numeric' : undefined}
                    maxLength={f.digits}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') add()
                    }}
                  />
                  )}
                </td>
              ))}
              {extraColumns?.map((c) => (
                <td key={c.label} className={cn(tdCls, c.renderDraft ? 'text-center' : 'text-center text-xs text-stone-400')}>
                  {c.renderDraft ? c.renderDraft(draft, (patch) => setDraft((d) => ({ ...d, ...patch }))) : 'Add the row, then attach documents'}
                </td>
              ))}
              <td className={cn(tdCls, 'text-center')}>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  className="h-7 w-7 rounded-none bg-amber-700 p-0 text-white hover:bg-amber-800"
                  onClick={add}
                  title={addLabel}
                  aria-label={addLabel}
                >
                  <Plus className="h-4 w-4" aria-hidden />
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
                      <td key={f.key} className={cn(tdCls, 'text-center')}>
                        {editing && f.master ? (
                          <MasterOptionFieldWithAdd
                            category={f.master}
                            label={f.label}
                            manageTitle={f.label}
                            showLabel={false}
                            inputId={`er-${kind}-${f.key}-${index}`}
                            listId={`er-${kind}-${f.key}-${index}-list`}
                            value={str(editDraft[f.key])}
                            onChange={(v) => setEditDraft((d) => ({ ...d, [f.key]: v }))}
                            placeholder="Select or Add"
                          />
                        ) : editing ? (
                          <Input
                            className={inputCls}
                            value={str(editDraft[f.key])}
                            onChange={(e) => setEditDraft({ ...editDraft, [f.key]: cleanField(f, e.target.value) })}
                            inputMode={f.digits ? 'numeric' : undefined}
                            maxLength={f.digits}
                          />
                        ) : (
                          str(r[f.key]) || <span className="text-stone-400">—</span>
                        )}
                      </td>
                    ))}
                    {extraColumns?.map((c) => (
                      <td key={c.label} className={tdCls}>
                        {c.render(r, index)}
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
  onTopManagement,
  onTechnicalStaff,
  projectRow,
}: {
  projectId: string
  client: BisPrintClient | undefined
  topManagement: Rec | null | undefined
  technicalStaff: Rec | null | undefined
  correspondence: Rec | null | undefined
  onChanged: () => void
  onOpenModule?: (kind: BisPrintDocumentKind) => void
  onTopManagement?: { preview: () => void; pdf: () => void; word: () => void }
  onTechnicalStaff?: { preview: () => void; pdf: () => void; word: () => void }
  projectRow?: BisProjectRow | null
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

  const blankTm = (): Rec => ({
    personName: '',
    designation: '',
    mobile: '',
    email: '',
    din: '',
    signatureFileId: '',
    signatureFileName: '',
    signatureStoragePath: '',
    applySignatureToDocuments: false,
  })

  return (
    <>
      <ManakPanel
        title="Firm's Management Details"
        headerExtra={<DocActions what="Top Management Details" actions={onTopManagement} />}
      >
        <ManakSubPanel title="Top Management Details">
          <EditableRows
            projectId={projectId}
            kind={'top-management' as BisPrintDocumentKind}
            fields={[
              { key: 'personName', label: 'Name' },
              { key: 'designation', label: 'Designation' },
              { key: 'mobile', label: 'Contact No.' },
              { key: 'email', label: 'Email ID' },
              { key: 'din', label: 'DIN (if applicable)', placeholder: '8 digit DIN', optional: true, digits: 8 },
            ]}
            extraColumns={[
              {
                label: 'Authorized Signatory',
                render: (r, index) => <AuthorizedSignatoryCell projectId={projectId} rowIndex={index} row={r} onChanged={onChanged} />,
                renderDraft: (draft, patchDraft) => (
                  <AuthorizedSignatoryCell projectId={projectId} rowIndex={-1} row={draft} onChanged={onChanged} onDraftChange={patchDraft} />
                ),
              },
              {
                label: 'Signature',
                render: (r, index) => <StaffDocumentsCell payloadKind="top-management" projectId={projectId} rowIndex={index} row={r} onChanged={onChanged} />,
                renderDraft: (draft, patchDraft) => (
                  <StaffDocumentsCell payloadKind="top-management" projectId={projectId} rowIndex={-1} row={draft} onChanged={onChanged} onDraftChange={patchDraft} />
                ),
              },
            ]}
            blank={blankTm}
            saved={tmRows}
            onChanged={onChanged}
            addLabel="Add top management person"
          />
        </ManakSubPanel>
        <ManakSubPanel
          title="Correspondence Details"
          headerExtra={
            <Button
              type="button"
              size="sm"
              disabled={corrBusy}
              className="h-7 rounded-none border border-amber-500/40 bg-amber-700 px-3 text-xs font-medium normal-case tracking-normal text-white hover:bg-amber-800"
              onClick={() => void saveCorr()}
            >
              Save
            </Button>
          }
        >
          {(() => {
            const field = (key: 'name' | 'designation' | 'email' | 'mobile') => (
              <Input className={inputCls} value={corr[key]} onChange={(e) => setCorr({ ...corr, [key]: e.target.value })} />
            )
            const thC = 'whitespace-nowrap border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-1.5 text-left align-middle font-bold text-stone-800'
            const tdC = 'border border-[#e7e0d4] px-2 py-1 align-middle text-stone-700'
            return (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '28%' }} />
                  </colgroup>
                  <tbody>
                    <tr>
                      <th scope="row" className={thC}>Address for Communication*:</th>
                      <td className={tdC}>
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
                      </td>
                      <th scope="row" className={thC}>Designation*:</th>
                      <td className={tdC}>{field('designation')}</td>
                      <th scope="row" className={thC}>Mobile*:</th>
                      <td className={tdC}>{field('mobile')}</td>
                    </tr>
                    <tr>
                      <th scope="row" className={thC}>Name of Contact Person*:</th>
                      <td className={tdC} colSpan={2}>{field('name')}</td>
                      <th scope="row" className={thC}>E-Mail Id*:</th>
                      <td className={tdC} colSpan={2}>{field('email')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          })()}
        </ManakSubPanel>
      </ManakPanel>

      <ManakPanel
        title="Technical Management / Quality Assurance / Control Personnel Details"
        headerExtra={<DocActions what="Technical Staff Details" actions={onTechnicalStaff} />}
      >
        <EditableRows
          projectId={projectId}
          kind={'technical-staff' as BisPrintDocumentKind}
          fields={[
            { key: 'personName', label: 'Name' },
            { key: 'designation', label: 'Designation', master: 'designation', width: '12rem' },
            { key: 'educationalQualification', label: 'Qualification', master: 'education', width: '12rem' },
            { key: 'experienceYears', label: 'Experience', master: 'experience', width: '11rem' },
          ]}
          blank={() => ({ ...emptyTechnicalStaffRow() })}
          extraColumns={[
            {
              label: 'Documents',
              render: (r, index) => <StaffDocumentsCell projectId={projectId} rowIndex={index} row={r} onChanged={onChanged} />,
              renderDraft: (draft, patchDraft) => (
                <StaffDocumentsCell projectId={projectId} rowIndex={-1} row={draft} onChanged={onChanged} onDraftChange={patchDraft} projectRow={projectRow} />
              ),
            },
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
