import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, Download, Eye, FileType, GripVertical, Import, Plus, Printer, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { BisPrintClient } from '../print/loadBisPrintData'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import { formatDisplayDate, isFmcsProject, type BisProjectRow } from './types'
import {
  emptyTechnicalStaffRow,
  fetchBisModulePayload,
  saveBisModulePayload,
} from './bisModuleDataApi'
import { StaffDocumentsCell } from './StaffDocumentsCell'
import { MasterOptionFieldWithAdd } from './MasterOptionFieldWithAdd'
import type { BisMasterOptionCategory } from './bisMasterOptions'
import { ManakPanel, ManakSubPanel } from './ManakStepPages'
import { AIR_KIND, AIR_NOMINATION_DOC_KIND, AIR_RESIDENCY_OPTIONS, CORRESPONDENCE_KIND } from './manakModuleKinds'
import { SharedProjectFileButton } from './RowFileAttachment'
import { manakEmailError } from './manakChecks'
import { RemoteLookupCombobox } from '@/features/bis/shared/RemoteLookupCombobox'
import { LimsDatePicker } from '@/components/lims/LimsDatePicker'
import { FilterCombobox, elementFromEventTarget, isFilterComboboxDropdownTarget } from '@/features/sample-handling/receiving/FilterCombobox'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'

type Rec = Record<string, unknown>

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

export type ImportDataBundle = { label: string; kinds: BisPrintDocumentKind[] }

/** Import / Preview / PDF / Word icon buttons shown in a panel header. */
function DocActions({
  what,
  actions,
  onImport,
}: {
  what: string
  actions?: { preview: () => void; pdf: () => void; word: () => void; print?: () => void }
  /** Import this panel's data from another Application / License. */
  onImport?: () => void
}) {
  if (!actions && !onImport) return null
  return (
    <div className="flex shrink-0 items-center gap-1">
      {(
        [
          ...(onImport ? ([[`Import ${what} from another Application / License`, onImport, Import]] as const) : []),
          ...(actions ? ([
          [`Preview ${what}`, actions.preview, Eye],
          [`Download ${what} as PDF`, actions.pdf, Download],
          [`Download ${what} as Word`, actions.word, FileType],
          ...(actions.print ? ([[`Print ${what}`, actions.print, Printer]] as const) : []),
          ] as const) : []),
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
      className="inline-flex items-center justify-center"
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
    </label>
  )
}

export type Field = {
  key: string
  label: string
  placeholder?: string
  width?: string
  /** Left-align the saved value (default is centred). */
  alignLeft?: boolean
  /** Not mandatory: no asterisk, and it may stay empty. */
  optional?: boolean
  /** Digits only, exactly this many when filled in. */
  digits?: number
  /** Email address checked the way Manak does: shown inline, and Add / Save are refused while it is invalid. */
  email?: boolean
  /** Select-or-add drop-down backed by a shared master list (the + button adds to it). */
  master?: BisMasterOptionCategory
  /** Fixed drop-down choices. */
  options?: string[]
  /** With options: tick several (saved as "a, b" in the options' order). */
  multiple?: boolean
  /** Applied to the value when a row is added or saved (e.g. "1" → "1 Nos"). */
  normalize?: (value: string, row: Rec) => string
  /** Native input type (e.g. date). */
  type?: 'date'
  /** Free text with a suggestions drop-down (any other value can still be typed). */
  suggestions?: string[]
  /** Type-to-search drop-down backed by a master (the selected record's id is kept in idKey). */
  lookup?: {
    search: (term: string) => Promise<Array<{ id: string; label: string; secondaryLabel?: string }>>
    idKey: string
    placeholder?: string
  }
}

/** Free-text cell with suggestions filtered as you type. */
function SuggestCell({ field, id, value, onChange }: { field: Field; id: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const term = value.trim().toLowerCase()
  const options = (field.suggestions ?? [])
    .filter((o, i, all) => o.trim() && all.indexOf(o) === i && (!term || o.toLowerCase().includes(term)))
    .map((o) => ({ id: o, label: o }))
  return (
    <FilterCombobox
      value={value}
      onValueChange={(v) => {
        onChange(v)
        setOpen(true)
      }}
      options={options}
      onSelectOption={(o) => {
        onChange(o.label)
        setOpen(false)
      }}
      open={open && options.length > 0}
      onOpenChange={setOpen}
      onInputFocus={() => setOpen(true)}
      placeholder={field.placeholder ?? field.label}
      inputId={id}
      listId={`${id}-options`}
      inputClassName={inputCls}
      showSerialNumbers={false}
    />
  )
}

/** Searchable master drop-down for one EditableRows cell. */
function LookupCell({ field, id, row, onChange }: { field: Field; id: string; row: Rec; onChange: (patch: Rec) => void }) {
  const lookup = field.lookup!
  return (
    <div className="border border-stone-400 bg-white">
      <RemoteLookupCombobox
        inputId={id}
        listId={`${id}-options`}
        placeholder={lookup.placeholder ?? field.placeholder ?? field.label}
        inputClassName="h-[30px] border-0 px-2 text-sm shadow-none focus-visible:ring-0"
        label={str(row[field.key])}
        selectedId={str(row[lookup.idKey])}
        search={lookup.search}
        onChange={({ id: picked, label }) => onChange({ [field.key]: label, [lookup.idKey]: picked })}
      />
    </div>
  )
}

const splitMulti = (value: string) => value.split(',').map((v) => v.trim()).filter(Boolean)

/** Several fixed choices in one drop-down (ticks); the value is the ticked ones joined by ", ". */
function MultiOptionSelect({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  const picked = splitMulti(value)
  const toggle = (o: string, on: boolean) => {
    const next = (field.options ?? []).filter((x) => (x === o ? on : picked.includes(x)))
    onChange(next.join(', '))
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={field.label}
          className="mx-auto flex h-8 w-full min-w-[6rem] items-center justify-between gap-1 rounded-none border border-stone-400 bg-white px-3 text-left text-sm text-foreground focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        >
          <span className={cn('min-w-0 flex-1 truncate', !picked.length && 'text-muted-foreground')}>{picked.length ? picked.join(', ') : 'Select'}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-none">
        {(field.options ?? []).length ? (
          (field.options ?? []).map((o) => (
            <DropdownMenuCheckboxItem
              key={o}
              className="gap-2 pl-2 [&>span:first-child]:hidden"
              checked={picked.includes(o)}
              onCheckedChange={(on) => toggle(o, on === true)}
              onSelect={(e) => e.preventDefault()}
            >
              <span
                aria-hidden
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center border',
                  picked.includes(o) ? 'border-amber-700 bg-amber-700 text-white' : 'border-stone-400 bg-white',
                )}
              >
                {picked.includes(o) ? <Check className="h-3 w-3" /> : null}
              </span>
              {o}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <p className="px-2 py-1.5 text-sm text-stone-500">No Choices</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Fixed-choice drop-down styled like the other step controls. */
function OptionSelect({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  return (
    // A value outside the choices (old data) shows the "Select" placeholder rather than a blank box.
    <Select value={field.options?.includes(value) ? value : ''} onValueChange={onChange}>
      <SelectTrigger className="mx-auto h-8 w-full min-w-[6rem] rounded-none border-stone-400 bg-white text-sm" aria-label={field.label}>
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent>
        {field.options?.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const cleanField = (f: Field, value: string) => (f.digits ? value.replace(/[^0-9]/g, '').slice(0, f.digits) : value)
/** Problem shown under the cell itself (saved rows included). */
const inlineError = (f: Field, value: string): string | null => {
  if (f.email) return manakEmailError(value)
  // A fixed drop-down holding an old or typed-in value: the drop-down cannot show it and Manak will not accept it.
  if (f.options && value.trim() && !f.options.includes(value.trim())) return `"${value.trim()}" is not one of the choices — edit the row and pick one.`
  return null
}
const fieldError = (fields: Field[], values: Rec): string | null => {
  for (const f of fields) {
    const v = str(values[f.key]).trim()
    if (f.digits && v && v.length !== f.digits) return `${f.label} must be ${f.digits} digits.`
    if (inlineError(f, v)) return `${f.label}: ${inlineError(f, v)}`
  }
  return null
}

function InlineError({ message }: { message: string | null }) {
  return message ? <p className="mt-0.5 text-left text-[11px] font-medium leading-tight text-red-700">{message}</p> : null
}
const invalidInputCls = 'border-red-500 bg-red-50/60 focus-visible:ring-red-500/30'

/** Order of a saved table: sorted by one column, or the user's own (dragged) order. */
type RowOrder = { key: string; dir: 'asc' | 'desc' } | 'manual'

const parseRowOrder = (value: unknown, fields: Field[]): RowOrder | null => {
  if (value === 'manual') return 'manual'
  if (!value || typeof value !== 'object') return null
  const { key, dir } = value as Rec
  return typeof key === 'string' && fields.some((f) => f.key === key) && (dir === 'asc' || dir === 'desc') ? { key, dir } : null
}

/** Column comparison: numbers in text sort naturally, empty cells go last either way. */
const byRowOrder = (order: { key: string; dir: 'asc' | 'desc' }) => (a: Rec, b: Rec) => {
  const x = str(a[order.key]).trim()
  const y = str(b[order.key]).trim()
  if (!x || !y) return x ? -1 : y ? 1 : 0
  return x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true }) * (order.dir === 'asc' ? 1 : -1)
}

/** Portaled pickers (drop-downs, date picker, suggestions) belong to the cell that opened them. */
const isPickerTarget = (el: Element) =>
  isFilterComboboxDropdownTarget(el) ||
  Boolean(el.closest('[data-radix-select-content], [data-radix-dropdown-menu-content], [data-radix-popper-content-wrapper]'))

/**
 * Manak-style editable table: an input row on top with "+", then saved rows. Double-click any cell of a saved row
 * to edit it; leaving the row (a click elsewhere, Enter or ✓) saves it, Escape cancels. Headers sort the table and
 * rows can be dragged into a custom order; either way the saved list (and so every document) follows what is shown.
 * A narrow checkbox column (with Select All) replaces S.No.
 */
export function EditableRows({
  projectId,
  kind,
  fields,
  blank,
  extraColumns,
  saved,
  payload,
  defaultSort,
  onChanged,
  addLabel,
  rowsKey = 'rows',
}: {
  projectId: string
  kind: BisPrintDocumentKind
  /** Payload key holding the row list (default "rows"). */
  rowsKey?: string
  fields: Field[]
  blank: () => Rec
  extraColumns?: Array<{
    label: string
    /** Centre the cells and shrink the column to its minimum width. */
    compact?: boolean
    render: (row: Rec, index: number) => React.ReactNode
    /** Cell for the input (draft) row; when absent a hint is shown. */
    renderDraft?: (draft: Rec, patchDraft: (patch: Rec) => void) => React.ReactNode
  }>
  saved: Rec[]
  /** Stored payload, read for the saved order ("<rowsKey>Order"); without it the order chosen here lasts until reload. */
  payload?: Rec | null
  /** Column sorted by (ascending) until the user sorts or drags; absent → the order rows were added in. */
  defaultSort?: string
  onChanged: () => void
  addLabel: string
}) {
  const [draft, setDraft] = useState<Rec>(() => blank())
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Rec>({})
  /** Field whose cell was double-clicked; its input gets the focus. */
  const [editFocus, setEditFocus] = useState<string | null>(null)
  /** Required cells are flagged only after a save of the row was refused. */
  const [showRequired, setShowRequired] = useState(false)
  // Refs: the row as stored (to find it again if the list was reordered meanwhile), the values last sent,
  // and a token that changes whenever another row opens or editing ends.
  const editBaseRef = useRef('')
  const editSentRef = useRef('')
  const editTokenRef = useRef(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirm, confirmDialog] = useConfirmDialog()
  // Inline errors wait until the user leaves the cell, so a half-typed value is not flagged.
  const [focusedCell, setFocusedCell] = useState<string | null>(null)
  const cellFocus = (cellId: string) => ({
    onFocus: () => setFocusedCell(cellId),
    onBlur: () => setFocusedCell((c) => (c === cellId ? null : c)),
  })
  const typingError = (f: Field, cellId: string, value: string) => (focusedCell === cellId ? null : inlineError(f, value))
  const listOf = (p: Rec): Rec[] => (Array.isArray(p[rowsKey]) ? (p[rowsKey] as Rec[]) : [])
  // A row counts once its first (required) column is filled; defaulted drop-downs alone do not.
  const isFilled = (r: Rec) => Boolean(fields[0] && str(r[fields[0].key]).trim())
  const missingRequired = (values: Rec) => fields.filter((f) => !f.optional && !str(values[f.key]).trim())

  const orderKey = `${rowsKey}Order`
  // A choice made here shows at once; the stored one catches up after the reload.
  const [localOrder, setLocalOrder] = useState<RowOrder | null>(null)
  const storedOrder = payload?.[orderKey]
  const order = useMemo<RowOrder>(
    () =>
      localOrder ??
      parseRowOrder(storedOrder, fields) ??
      (defaultSort && fields.some((f) => f.key === defaultSort) ? { key: defaultSort, dir: 'asc' } : 'manual'),
    [localOrder, storedOrder, fields, defaultSort],
  )
  /** Row indexes in the order just dropped, shown until the saved list (a new signature) arrives. */
  const [dropped, setDropped] = useState<{ sig: string; ids: number[] } | null>(null)
  const savedSig = useMemo(() => JSON.stringify(saved), [saved])
  const dragOrder = dropped?.sig === savedSig ? dropped.ids : null
  const setDragOrder = (ids: number[] | null) => setDropped(ids ? { sig: savedSig, ids } : null)

  const rows = useMemo(() => {
    const filled = saved.map((r, index) => ({ r, index })).filter(({ r }) => Boolean(fields[0] && str(r[fields[0].key]).trim()))
    if (dragOrder) {
      const at = new Map(dragOrder.map((index, n) => [index, n]))
      return [...filled].sort((a, b) => (at.get(a.index) ?? Infinity) - (at.get(b.index) ?? Infinity))
    }
    if (order === 'manual') return filled
    const compare = byRowOrder(order)
    return [...filled].sort((a, b) => compare(a.r, b.r))
  }, [saved, fields, dragOrder, order])

  // Saves run one after another, so a quick edit, add and reorder never overwrite each other.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const pendingRef = useRef(0)
  const run = (fn: () => Promise<void>, ok?: string): Promise<boolean> => {
    pendingRef.current += 1
    setBusy(true)
    const job = queueRef.current.then(async () => {
      try {
        await fn()
        if (ok) toast.success(ok)
        onChanged()
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save')
        return false
      } finally {
        pendingRef.current -= 1
        if (pendingRef.current === 0) setBusy(false)
      }
    })
    queueRef.current = job
    return job
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
    const sortedBy = order
    void run(async () => {
      await patchPayload(projectId, kind, (p) => {
        const row: Rec = { ...blank(), ...draft }
        // A drop-down left on an invalid value saves the default shown on screen.
        for (const f of fields) {
          if (!f.options) continue
          if (f.multiple) row[f.key] = splitMulti(str(row[f.key])).filter((v) => f.options!.includes(v)).join(', ')
          else if (!f.options.includes(str(row[f.key]))) row[f.key] = blank()[f.key]
        }
        for (const f of fields) if (f.normalize) row[f.key] = f.normalize(str(row[f.key]), row)
        // A sorted table keeps the saved list sorted, so the new row lands where it shows.
        const list = [...listOf(p).filter(isFilled), row]
        if (sortedBy !== 'manual') list.sort(byRowOrder(sortedBy))
        let next: Rec = { ...p, [rowsKey]: list, ...(sortedBy !== 'manual' ? { [orderKey]: sortedBy } : {}) }
        if (draft.applySignatureToDocuments) {
          next = {
            ...next,
            rows: (next.rows as Rec[]).map((r) => ({ ...r, applySignatureToDocuments: r === row })),
            signatoryName: str(draft.personName) || str(p.signatoryName),
            signatoryDesignation: str(draft.designation) || str(p.signatoryDesignation),
          }
        }
        if (draft.isAuthorizedSignatory) next = withAuthorizedSignatory(next, list.indexOf(row))
        return next
      })
      setDraft(blank())
      setSelected(new Set())
    }, 'Row added')
  }

  const startEdit = (index: number, row: Rec, key: string) => {
    if (editIndex === index) return
    // Moving to another row saves the open one first; a row with a required cell empty stays open.
    if (editIndex != null && !commitEdit(false)) return
    editTokenRef.current += 1
    editBaseRef.current = JSON.stringify(row)
    editSentRef.current = JSON.stringify(row)
    setEditIndex(index)
    setEditDraft({ ...row })
    setEditFocus(key)
    setShowRequired(false)
  }
  const cancelEdit = () => {
    editTokenRef.current += 1
    setEditIndex(null)
  }

  /** Saves the open row if it changed; `close` also ends editing (unless another row opened meanwhile). False = refused. */
  const commitEdit = (close: boolean): boolean => {
    if (editIndex == null) return true
    const index = editIndex
    const values = editDraft
    const base = editBaseRef.current
    const token = editTokenRef.current
    const closeIfCurrent = () => {
      if (close && editTokenRef.current === token) cancelEdit()
    }
    if (JSON.stringify(values) === editSentRef.current) {
      closeIfCurrent()
      return true
    }
    const missing = missingRequired(values)
    if (missing.length > 0) {
      setShowRequired(true)
      toast.error(`Fill In ${missing.map((f) => f.label.replace(/\n/g, ' ')).join(', ')} Before Leaving the Row.`, { id: 'er-required' })
      return false
    }
    const bad = fieldError(fields, values)
    if (bad) {
      toast.error(bad, { id: 'er-required' })
      return false
    }
    const previousSent = editSentRef.current
    editSentRef.current = JSON.stringify(values)
    const sortedBy = order
    void run(async () => {
      await patchPayload(projectId, kind, (p) => {
        const normalized = (r: Rec) => fields.reduce((acc, f) => (f.normalize ? { ...acc, [f.key]: f.normalize(str(acc[f.key]), acc) } : acc), r)
        const current = listOf(p)
        // The row as it was opened; its old place when it cannot be found (e.g. a list shown with defaults filled in).
        const found = JSON.stringify(current[index]) === base ? index : current.findIndex((r) => JSON.stringify(r) === base)
        const at = found >= 0 ? found : index
        const list = current.map((r, i) => (i === at ? normalized({ ...r, ...values }) : r))
        if (sortedBy !== 'manual') list.sort(byRowOrder(sortedBy))
        return { ...p, [rowsKey]: list }
      })
    }, 'Row updated').then((ok) => {
      if (ok) closeIfCurrent()
      // Not saved: the row stays open and the next leave tries again.
      else if (editTokenRef.current === token) editSentRef.current = previousSent
    })
    return true
  }
  const commitRef = useRef(commitEdit)
  useEffect(() => {
    commitRef.current = commitEdit
  })

  // A save elsewhere may have moved the open row (sorted list); keep editing the same row.
  useEffect(() => {
    if (editIndex == null) return
    const base = editBaseRef.current
    if (saved[editIndex] && JSON.stringify(saved[editIndex]) === base) return
    const at = saved.findIndex((r) => JSON.stringify(r) === base)
    if (at >= 0) setEditIndex(at)
  }, [saved, editIndex])

  // Leaving the row saves it: a click anywhere else on the page / dialog commits the edit.
  // A click on another row waits a moment, so a double-click there can switch rows first
  // (startEdit saves the old row while switching) without the rows jumping under the mouse.
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (editIndex == null) return
    const onDown = (e: MouseEvent) => {
      const t = elementFromEventTarget(e.target)
      if (!t || t.closest('[data-er-editing]') || isPickerTarget(t)) return
      const root = rootRef.current
      // Another dialog on top (confirm, master list…) is not leaving the row.
      if (t.closest('[role=dialog]') !== (root?.closest('[role=dialog]') ?? null)) return
      const token = editTokenRef.current
      if (root?.contains(t) && t.closest('[data-er-row]')) {
        window.setTimeout(() => {
          if (editTokenRef.current === token) commitRef.current(true)
        }, 350)
        return
      }
      commitRef.current(true)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [editIndex])

  /** Header click: sort by that column (again → reverse), and save the list in that order. */
  const sortBy = (key: string) => {
    const previous = localOrder
    const next: RowOrder = order !== 'manual' && order.key === key ? { key, dir: order.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    setLocalOrder(next)
    setDragOrder(null)
    setSelected(new Set())
    void run(async () => {
      await patchPayload(projectId, kind, (p) => ({ ...p, [rowsKey]: listOf(p).filter(isFilled).sort(byRowOrder(next)), [orderKey]: next }))
    }).then((ok) => {
      if (!ok) setLocalOrder(previous)
    })
  }

  /** Drag-and-drop: the shown order becomes the saved (custom) order until a header is clicked again. */
  const reorder = (dragged: number, target: number, place: 'before' | 'after') => {
    const ids = rows.map(({ index }) => index).filter((i) => i !== dragged)
    const at = ids.indexOf(target)
    if (at < 0) return
    ids.splice(place === 'before' ? at : at + 1, 0, dragged)
    const previous = localOrder
    const expected = saved.length
    setDragOrder(ids)
    setLocalOrder('manual')
    setSelected(new Set())
    void run(async () => {
      await patchPayload(projectId, kind, (p) => {
        const list = listOf(p)
        if (list.length !== expected) throw new Error('The Table Changed Meanwhile — Please Try Again.')
        const rest = list.filter((r, i) => !ids.includes(i) && isFilled(r))
        return { ...p, [rowsKey]: [...ids.map((i) => list[i]), ...rest], [orderKey]: 'manual' }
      })
    }).then((ok) => {
      if (ok) return
      setDragOrder(null)
      setLocalOrder(previous)
    })
  }

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ index: number; place: 'before' | 'after' } | null>(null)
  // Refs: dragover/drop can fire before React re-renders with the new state.
  const dragIndexRef = useRef<number | null>(null)
  const dropTargetRef = useRef<{ index: number; place: 'before' | 'after' } | null>(null)
  const dragEnabled = editIndex == null && !busy && rows.length > 1
  const endDrag = () => {
    dragIndexRef.current = null
    dropTargetRef.current = null
    setDragIndex(null)
    setDropTarget(null)
  }
  const dragRowProps = (index: number) =>
    dragEnabled
      ? {
          draggable: true,
          onDragStart: (e: DragEvent<HTMLTableRowElement>) => {
            dragIndexRef.current = index
            setDragIndex(index)
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', String(index))
          },
          onDragOver: (e: DragEvent<HTMLTableRowElement>) => {
            const dragging = dragIndexRef.current
            if (dragging == null || dragging === index) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            const rect = e.currentTarget.getBoundingClientRect()
            const place = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
            dropTargetRef.current = { index, place }
            setDropTarget((prev) => (prev?.index === index && prev.place === place ? prev : { index, place }))
          },
          onDrop: (e: DragEvent<HTMLTableRowElement>) => {
            e.preventDefault()
            const dragging = dragIndexRef.current
            const target = dropTargetRef.current
            if (dragging != null && target && dragging !== target.index) reorder(dragging, target.index, target.place)
            endDrag()
          },
          onDragEnd: endDrag,
        }
      : {}

  const remove = (indexes: number[]) => {
    if (indexes.length === 0) return
    void run(async () => {
      await patchPayload(projectId, kind, (p) => {
        const list = listOf(p).filter((_, i) => !indexes.includes(i))
        return { ...p, [rowsKey]: list.length > 0 ? list : [blank()] }
      })
      setSelected(new Set())
    }, indexes.length > 1 ? 'Rows deleted' : 'Row deleted')
  }
  const removeSelected = async () => {
    const indexes = [...selected]
    const n = indexes.length
    if (n === 0) return
    const ok = await confirm(`Delete ${n} selected row${n === 1 ? '' : 's'}? This cannot be undone.`, {
      title: 'Delete Selected Rows',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (ok) remove(indexes)
  }

  const toggle = (index: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  const allSelected = rows.length > 0 && rows.every(({ index }) => selected.has(index))
  const someSelected = rows.some(({ index }) => selected.has(index))

  return (
    <div ref={rootRef} className="space-y-2">
      {selected.size > 0 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-7 rounded-none border-red-300 text-xs text-red-700 hover:bg-red-50"
            onClick={() => void removeSelected()}
          >
            <Trash2 className="mr-1 h-3 w-3" aria-hidden /> Delete Selected ({selected.size})
          </Button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="er-table w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(thCls, 'w-8 px-1 text-center')}>
                <input
                  type="checkbox"
                  className={cn(checkCls, 'align-middle')}
                  aria-label="Select All"
                  title="Select All"
                  disabled={rows.length === 0}
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allSelected && someSelected
                  }}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map(({ index }) => index)) : new Set())}
                />
              </th>
              {fields.map((f) => {
                const active = order !== 'manual' && order.key === f.key
                const Icon = active ? (order.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
                const label = f.label.replace(/\n/g, ' ')
                return (
                  <th key={f.key} className={cn(thCls, 'whitespace-pre-line text-center')} style={f.width ? { width: f.width } : undefined}>
                    <button
                      type="button"
                      className="inline-flex w-full items-center justify-center gap-1 uppercase transition-colors hover:text-amber-100"
                      title={order === 'manual' ? `Custom Order — Click to Sort by ${label}` : `Sort by ${label}`}
                      aria-label={`Sort by ${label}${active ? `, ${order.dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                      onClick={() => sortBy(f.key)}
                    >
                      <span>
                        {f.label}
                        {f.optional ? null : <span className="text-red-400">*</span>}
                      </span>
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-amber-300' : 'text-amber-200/50')} aria-hidden />
                    </button>
                  </th>
                )
              })}
              {extraColumns?.map((c) => (
                <th key={c.label} className={cn(thCls, c.compact && 'w-[1%] text-center')}>
                  {c.label}
                </th>
              ))}
              <th className={cn(thCls, 'w-[1%] whitespace-nowrap px-1 text-center text-[10px] tracking-normal')}>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr className="er-draft bg-[#fffcf7]">
              <td className={cn(tdCls, 'er-select')} />
              {fields.map((f) => (
                <td key={f.key} className={tdCls} data-label={`${f.label.replace(/\n/g, ' ')}${f.optional ? '' : ' *'}`}>
                  {f.options && f.multiple ? (
                    <MultiOptionSelect field={f} value={str(draft[f.key])} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
                  ) : f.options ? (
                    <OptionSelect
                      field={f}
                      value={f.options.includes(str(draft[f.key])) ? str(draft[f.key]) : str(blank()[f.key])}
                      onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                    />
                  ) : f.type === 'date' ? (
                    <LimsDatePicker aria-label={f.label} className="h-8 w-full" value={str(draft[f.key])} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
                  ) : f.suggestions ? (
                    <SuggestCell field={f} id={`er-${kind}-${f.key}-new`} value={str(draft[f.key])} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
                  ) : f.lookup ? (
                    <LookupCell field={f} id={`er-${kind}-${f.key}-new`} row={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
                  ) : f.master ? (
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
                  (() => {
                    const cellId = `new:${f.key}`
                    const err = typingError(f, cellId, str(draft[f.key]))
                    return (
                      <>
                        <Input
                          className={cn(inputCls, err && invalidInputCls)}
                          type={f.type ?? (f.email ? 'email' : undefined)}
                          placeholder={f.placeholder ?? f.label}
                          value={str(draft[f.key])}
                          onChange={(e) => setDraft({ ...draft, [f.key]: cleanField(f, e.target.value) })}
                          inputMode={f.digits ? 'numeric' : f.email ? 'email' : undefined}
                          maxLength={f.digits}
                          aria-invalid={err ? true : undefined}
                          {...cellFocus(cellId)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') add()
                          }}
                        />
                        <InlineError message={err} />
                      </>
                    )
                  })()
                  )}
                </td>
              ))}
              {extraColumns?.map((c) => (
                <td key={c.label} data-label={c.label} className={cn(tdCls, c.renderDraft ? 'text-center' : 'er-hint text-center text-xs text-stone-400', c.compact && 'w-[1%]')}>
                  {c.renderDraft ? c.renderDraft(draft, (patch) => setDraft((d) => ({ ...d, ...patch }))) : 'Add the row, then attach documents'}
                </td>
              ))}
              <td className={cn(tdCls, 'er-actions w-[1%] whitespace-nowrap px-1 text-center')}>
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
                <td colSpan={fields.length + (extraColumns?.length ?? 0) + 2} className={cn(tdCls, 'er-empty py-3 text-center text-stone-500')}>
                  No records yet.
                </td>
              </tr>
            ) : (
              rows.map(({ r, index }, n) => {
                const editing = editIndex === index
                return (
                  <tr
                    key={index}
                    data-er-row=""
                    data-er-editing={editing ? '' : undefined}
                    title={editing ? undefined : dragEnabled ? 'Double-Click to Edit · Drag to Move' : 'Double-Click to Edit'}
                    {...dragRowProps(index)}
                    className={cn(
                      n % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]',
                      dragIndex === index && 'opacity-40',
                      dropTarget?.index === index &&
                        (dropTarget.place === 'before' ? '[&>td]:border-t-2 [&>td]:border-t-amber-600' : '[&>td]:border-b-2 [&>td]:border-b-amber-600'),
                    )}
                  >
                    <td className={cn(tdCls, 'er-select px-1 text-center')}>
                      <div className="flex items-center justify-center gap-0.5">
                        {dragEnabled ? <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-stone-400" aria-hidden /> : null}
                        <input
                          type="checkbox"
                          className={checkCls}
                          aria-label={`Select row ${n + 1}`}
                          checked={selected.has(index)}
                          onChange={() => toggle(index)}
                        />
                      </div>
                    </td>
                    {fields.map((f) => {
                      const required = editing && showRequired && !f.optional && !str(editDraft[f.key]).trim() ? 'Required' : null
                      return (
                      <td
                        key={f.key}
                        data-label={f.label.replace(/\n/g, ' ')}
                        className={cn(tdCls, f.alignLeft ? 'text-left' : 'text-center', !editing && 'cursor-default select-none')}
                        onDoubleClick={() => startEdit(index, r, f.key)}
                        onKeyDown={editing ? (e) => {
                          if (e.key === 'Escape') cancelEdit()
                          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') commitEdit(true)
                        } : undefined}
                      >
                        {editing && f.options && f.multiple ? (
                          <>
                            <MultiOptionSelect field={f} value={str(editDraft[f.key])} onChange={(v) => setEditDraft((d) => ({ ...d, [f.key]: v }))} />
                            <InlineError message={required} />
                          </>
                        ) : editing && f.options ? (
                          <>
                            <OptionSelect field={f} value={str(editDraft[f.key])} onChange={(v) => setEditDraft((d) => ({ ...d, [f.key]: v }))} />
                            <InlineError message={required ?? inlineError(f, str(editDraft[f.key]))} />
                          </>
                        ) : editing && f.suggestions ? (
                          <>
                            <SuggestCell field={f} id={`er-${kind}-${f.key}-${index}`} value={str(editDraft[f.key])} onChange={(v) => setEditDraft((d) => ({ ...d, [f.key]: v }))} />
                            <InlineError message={required} />
                          </>
                        ) : editing && f.type === 'date' ? (
                          <>
                            <LimsDatePicker aria-label={f.label} className="h-8 w-full" value={str(editDraft[f.key])} onChange={(v) => setEditDraft((d) => ({ ...d, [f.key]: v }))} />
                            <InlineError message={required} />
                          </>
                        ) : editing && f.lookup ? (
                          <>
                            <LookupCell field={f} id={`er-${kind}-${f.key}-${index}`} row={editDraft} onChange={(patch) => setEditDraft((d) => ({ ...d, ...patch }))} />
                            <InlineError message={required} />
                          </>
                        ) : editing && f.master ? (
                          <>
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
                            <InlineError message={required} />
                          </>
                        ) : editing ? (
                          (() => {
                            const cellId = `${index}:${f.key}`
                            const err = required ?? typingError(f, cellId, str(editDraft[f.key]))
                            return (
                              <>
                                <Input
                                  className={cn(inputCls, err && invalidInputCls)}
                                  type={f.type ?? (f.email ? 'email' : undefined)}
                                  autoFocus={editFocus === f.key}
                                  value={str(editDraft[f.key])}
                                  onChange={(e) => setEditDraft({ ...editDraft, [f.key]: cleanField(f, e.target.value) })}
                                  inputMode={f.digits ? 'numeric' : f.email ? 'email' : undefined}
                                  maxLength={f.digits}
                                  aria-invalid={err ? true : undefined}
                                  {...cellFocus(cellId)}
                                />
                                <InlineError message={err} />
                              </>
                            )
                          })()
                        ) : inlineError(f, str(r[f.key])) ? (
                          <>
                            <span className="font-medium text-red-700">{str(r[f.key])}</span>
                            <InlineError message={inlineError(f, str(r[f.key]))} />
                          </>
                        ) : (
                          (f.type === 'date' && str(r[f.key]) ? formatDisplayDate(str(r[f.key])) : str(r[f.key])) || <span className="text-stone-400">—</span>
                        )}
                      </td>
                      )
                    })}
                    {extraColumns?.map((c) => (
                      <td key={c.label} data-label={c.label} className={cn(tdCls, c.compact && 'w-[1%] text-center')}>
                        {c.render(r, index)}
                      </td>
                    ))}
                    <td className={cn(tdCls, 'er-actions w-[1%] whitespace-nowrap px-1 text-center')}>
                      {editing ? (
                        <Button type="button" variant="ghost" className={iconBtn} title="Save (Enter) · Esc to Cancel" aria-label="Save Row" onClick={() => commitEdit(true)}>
                          <Check size={14} />
                        </Button>
                      ) : (
                        <Button type="button" variant="ghost" className={iconBtn} disabled={busy} title="Delete Row" aria-label="Delete Row" onClick={() => remove([index])}>
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {confirmDialog}
    </div>
  )
}

export function ManakManagementStep({
  projectId,
  client,
  topManagement,
  technicalStaff,
  correspondence,
  air,
  onChanged,
  onTopManagement,
  onTechnicalStaff,
  projectRow,
  onImportData,
}: {
  projectId: string
  client: BisPrintClient | undefined
  topManagement: Rec | null | undefined
  technicalStaff: Rec | null | undefined
  correspondence: Rec | null | undefined
  /** FMCS only: the Authorised Indian Representative payload. */
  air?: Rec | null
  onChanged: () => void
  onOpenModule?: (kind: BisPrintDocumentKind) => void
  onTopManagement?: { preview: () => void; pdf: () => void; word: () => void; print?: () => void }
  onTechnicalStaff?: { preview: () => void; pdf: () => void; word: () => void; print?: () => void }
  projectRow?: BisProjectRow | null
  /** Opens the import dialog for a group of modules (any client's Application / License). */
  onImportData?: (bundle: ImportDataBundle) => void
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
  const [corrEmailFocused, setCorrEmailFocused] = useState(false)
  useEffect(() => setCorr(initial), [initial])
  const corrEmailError = manakEmailError(corr.email)

  const saveCorr = async () => {
    if (corrEmailError) {
      toast.error(`Correspondence E-Mail Id: ${corrEmailError}`)
      return
    }
    setCorrBusy(true)
    try {
      await saveBisModulePayload(projectId, CORRESPONDENCE_KIND, { ...corr })
      toast.success('Correspondence Details Saved')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setCorrBusy(false)
    }
  }

  const fmcs = isFmcsProject(projectRow)
  const airInitial = useMemo(
    () => ({
      name: str(air?.name),
      designation: str(air?.designation) || 'Authorised Indian Representative',
      mobile: str(air?.mobile),
      email: str(air?.email),
      din: str(air?.din),
      address: str(air?.address),
      residency: str(air?.residency) || AIR_RESIDENCY_OPTIONS[0],
    }),
    [air],
  )
  const [airForm, setAirForm] = useState(airInitial)
  const [airBusy, setAirBusy] = useState(false)
  useEffect(() => setAirForm(airInitial), [airInitial])
  const airEmailError = manakEmailError(airForm.email)

  const saveAir = async () => {
    if (!airForm.name.trim()) {
      toast.error('Enter the Name of the Authorised Indian Representative')
      return
    }
    if (airEmailError) {
      toast.error(`AIR E-Mail Id: ${airEmailError}`)
      return
    }
    setAirBusy(true)
    try {
      await saveBisModulePayload(projectId, AIR_KIND, { ...airForm })
      toast.success('AIR Details Saved')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setAirBusy(false)
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
        headerExtra={
          <DocActions
            what="Firm's Management Details"
            actions={onTopManagement}
            onImport={onImportData ? () => onImportData({ label: "Firm's Management Details", kinds: ['top-management' as BisPrintDocumentKind, CORRESPONDENCE_KIND] }) : undefined}
          />
        }
      >
        <ManakSubPanel title="Top Management Details">
          <EditableRows
            projectId={projectId}
            kind={'top-management' as BisPrintDocumentKind}
            fields={[
              { key: 'personName', label: 'Name', alignLeft: true },
              { key: 'designation', label: 'Designation' },
              { key: 'mobile', label: 'Contact No.', width: '9rem' },
              { key: 'email', label: 'Email ID', width: '17rem', email: true },
              { key: 'din', label: 'DIN', placeholder: '8 Digit DIN', optional: true, digits: 8, width: '7.5rem' },
            ]}
            extraColumns={[
              {
                label: 'Authorized Signatory',
                compact: true,
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
            payload={topManagement}
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
            const emailErr = corrEmailFocused ? null : corrEmailError
            const thC = 'break-words border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-1.5 text-left align-middle font-bold text-stone-800'
            const tdC = 'border border-[#e7e0d4] px-2 py-1 align-middle text-stone-700'
            return (
              <div className="manak-kv overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '11%' }} />
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
                      <td className={tdC} colSpan={2}>
                        <Input
                          className={cn(inputCls, emailErr && invalidInputCls)}
                          type="email"
                          inputMode="email"
                          value={corr.email}
                          aria-invalid={emailErr ? true : undefined}
                          onFocus={() => setCorrEmailFocused(true)}
                          onBlur={() => setCorrEmailFocused(false)}
                          onChange={(e) => setCorr({ ...corr, email: e.target.value })}
                        />
                        <InlineError message={emailErr} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          })()}
        </ManakSubPanel>
      </ManakPanel>

      {fmcs ? (
        <ManakPanel
          title="AIR Details (Authorised Indian Representative)"
          headerExtra={
            <Button
              type="button"
              size="sm"
              disabled={airBusy}
              className="h-7 rounded-none border border-amber-500/40 bg-amber-700 px-3 text-xs font-medium normal-case tracking-normal text-white hover:bg-amber-800"
              onClick={() => void saveAir()}
            >
              Save
            </Button>
          }
        >
          {(() => {
            const thC = 'break-words border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-1.5 text-left align-middle font-bold text-stone-800'
            const tdC = 'border border-[#e7e0d4] px-2 py-1 align-middle text-stone-700'
            const field = (key: 'name' | 'designation' | 'mobile' | 'email' | 'din' | 'address', placeholder?: string) => (
              <Input
                className={cn(inputCls, key === 'email' && airEmailError && invalidInputCls)}
                value={airForm[key]}
                placeholder={placeholder}
                aria-label={`AIR ${key}`}
                onChange={(e) => setAirForm({ ...airForm, [key]: e.target.value })}
              />
            )
            return (
              <div className="manak-kv overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '16%' }} />
                  </colgroup>
                  <tbody>
                    <tr>
                      <th scope="row" className={thC}>Name*:</th>
                      <td className={tdC}>{field('name')}</td>
                      <th scope="row" className={thC}>Designation*:</th>
                      <td className={tdC}>{field('designation')}</td>
                      <th scope="row" className={thC}>Contact No.*:</th>
                      <td className={tdC}>{field('mobile', '+91 ...')}</td>
                    </tr>
                    <tr>
                      <th scope="row" className={thC}>Email ID*:</th>
                      <td className={tdC}>
                        {field('email')}
                        <InlineError message={airEmailError} />
                      </td>
                      <th scope="row" className={thC}>DIN (If Applicable):</th>
                      <td className={tdC}>{field('din')}</td>
                      <th scope="row" className={thC}>Nomination Letter*:</th>
                      <td className={tdC}>
                        <SharedProjectFileButton projectId={projectId} docKind={AIR_NOMINATION_DOC_KIND} label="AIR Nomination Letter" />
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className={thC}>Address in India:</th>
                      <td className={tdC} colSpan={3}>{field('address')}</td>
                      <th scope="row" className={thC}>Residency Status*:</th>
                      <td className={tdC}>
                        <select
                          className={cn(inputCls, 'w-full border px-2')}
                          aria-label="AIR Residency Status"
                          value={airForm.residency}
                          onChange={(e) => setAirForm({ ...airForm, residency: e.target.value })}
                        >
                          {AIR_RESIDENCY_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          })()}
        </ManakPanel>
      ) : null}

      <ManakPanel
        title="Technical Management / Quality Assurance / Control Personnel Details"
        headerExtra={
          <DocActions
            what="Technical Staff Details"
            actions={onTechnicalStaff}
            onImport={onImportData ? () => onImportData({ label: 'Technical Staff Details', kinds: ['technical-staff' as BisPrintDocumentKind] }) : undefined}
          />
        }
      >
        <EditableRows
          projectId={projectId}
          kind={'technical-staff' as BisPrintDocumentKind}
          fields={[
            { key: 'personName', label: 'Name', alignLeft: true },
            { key: 'designation', label: 'Designation', master: 'designation', width: '12rem' },
            { key: 'educationalQualification', label: 'Qualification', master: 'education', width: '12rem' },
            { key: 'experienceYears', label: 'Experience', master: 'experience', width: '11rem' },
          ]}
          blank={() => ({ ...emptyTechnicalStaffRow() })}
          extraColumns={[
            {
              label: 'Documents',
              render: (r, index) => <StaffDocumentsCell projectId={projectId} rowIndex={index} row={r} onChanged={onChanged} projectRow={projectRow} />,
              renderDraft: (draft, patchDraft) => (
                <StaffDocumentsCell projectId={projectId} rowIndex={-1} row={draft} onChanged={onChanged} onDraftChange={patchDraft} projectRow={projectRow} />
              ),
            },
          ]}
          saved={rowsOf(technicalStaff)}
          payload={technicalStaff}
          onChanged={onChanged}
          addLabel="Add technical person"
        />
      </ManakPanel>
    </>
  )
}

