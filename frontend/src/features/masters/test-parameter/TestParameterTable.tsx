import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, FlaskConical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import { limsFieldClass, limsPanelClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { useAnchoredPortalMenu } from '@/lib/useAnchoredPortalMenu'
import { cn } from '@/lib/utils'
import type { SymbolCaretTarget, SymbolTargetField, SymbolTargetScope } from './scientificSymbols'
import { normalizeText, type TestParameterForm, type TestParameterRow } from './types'

function symbolFieldHandlers(
  field: SymbolTargetField,
  scope: SymbolTargetScope,
  onTrack?: (target: SymbolCaretTarget) => void,
) {
  const track = (el: HTMLInputElement) => {
    if (!onTrack) return
    onTrack({
      field,
      scope,
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    })
  }
  return {
    'data-symbol-field': field,
    'data-symbol-scope': scope,
    onFocus: (e: FocusEvent<HTMLInputElement>) => track(e.currentTarget),
    onBlur: (e: FocusEvent<HTMLInputElement>) => track(e.currentTarget),
    onSelect: (e: SyntheticEvent<HTMLInputElement>) => track(e.currentTarget),
    onKeyUp: (e: SyntheticEvent<HTMLInputElement>) => track(e.currentTarget),
    onClick: (e: SyntheticEvent<HTMLInputElement>) => track(e.currentTarget),
  }
}

function InlinePortalMenu({
  open,
  anchorRef,
  optionCount,
  children,
}: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  optionCount: number
  children: ReactNode
}) {
  const pos = useAnchoredPortalMenu(open, anchorRef, optionCount)
  if (!open || !pos || typeof document === 'undefined') return null
  return createPortal(
    <div
      className="pointer-events-auto fixed z-[10000] rounded-none border border-stone-500 bg-white shadow-lg"
      style={{
        left: pos.left,
        width: pos.width,
        top: pos.top,
        bottom: pos.bottom,
      }}
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

type IsCodeOption = {
  id: string
  displayCode: string
  searchLabel: string
  defaultTestMethod: string
}

const inlineInputClass = cn(limsFieldClass, 'h-8 min-w-0 text-xs sm:text-sm')
const inlineEntryTone = 'bg-amber-50/40 hover:bg-amber-50/40'
const inlineEditTone = 'bg-sky-50/50 hover:bg-sky-50/50'

/** ~10" / desktop: row table. Below that: cards. */
const TABLE_MQ_SHOW = 'hidden lg:block'
const CARDS_MQ_SHOW = 'lg:hidden'

const GRID_TABLE =
  'w-full table-fixed border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_td]:static'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const tdClass = 'px-2 py-2 text-center align-middle text-sm text-[#292524]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

export type TestParameterSortKey =
  | 'isCode'
  | 'itemName'
  | 'testMethod'
  | 'clause'
  | 'unit'
  | 'requirement'

export type TestParameterSortDir = 'asc' | 'desc'

function SortableHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
  align = 'center',
}: {
  label: string
  columnKey: TestParameterSortKey
  sortKey: TestParameterSortKey
  sortDir: TestParameterSortDir
  onSort: (key: TestParameterSortKey) => void
  className?: string
  align?: 'left' | 'center'
}) {
  const active = sortKey === columnKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(
          'inline-flex w-full items-center gap-1 text-amber-200 transition-colors hover:text-amber-100',
          align === 'left' ? 'justify-start text-left' : 'justify-center text-center',
        )}
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-amber-300' : 'text-amber-200/60')} />
      </button>
    </TableHead>
  )
}

function useFocusAfterInlineAdd(
  busy: boolean,
  inputRef: RefObject<HTMLInputElement | null>,
) {
  const wasBusyRef = useRef(false)
  useEffect(() => {
    if (wasBusyRef.current && !busy) {
      const id = window.requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true })
      })
      wasBusyRef.current = false
      return () => window.cancelAnimationFrame(id)
    }
    wasBusyRef.current = busy
  }, [busy, inputRef])
}

function InlineIsCodePicker({
  value,
  isCodeId,
  isCodes,
  onChange,
  inputRef,
}: {
  value: string
  isCodeId: string
  isCodes: IsCodeOption[]
  onChange: (patch: Partial<Pick<TestParameterForm, 'isCodeId' | 'isCodeLabel' | 'testMethod'>>) => void
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (!query) return isCodes.slice(0, 10)
    return isCodes.filter((code) => code.searchLabel.toLowerCase().includes(query)).slice(0, 10)
  }, [isCodes, value])

  const pick = (match: IsCodeOption) => {
    onChange({
      isCodeId: match.id,
      isCodeLabel: match.displayCode,
      testMethod: match.defaultTestMethod || match.displayCode,
    })
    setOpen(false)
  }

  const syncExactMatch = (raw: string) => {
    const typed = raw.trim().toLowerCase()
    if (!typed) return
    const match = isCodes.find((c) => c.displayCode.trim().toLowerCase() === typed)
    if (match) pick(match)
  }

  return (
    <div ref={anchorRef} className="relative min-w-0">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          const next = e.target.value
          setOpen(true)
          setHighlight(0)
          const exact = isCodes.find(
            (c) => c.displayCode.trim().toLowerCase() === next.trim().toLowerCase(),
          )
          if (exact) {
            onChange({
              isCodeId: exact.id,
              isCodeLabel: exact.displayCode,
              testMethod: exact.defaultTestMethod || exact.displayCode,
            })
            return
          }
          onChange({
            isCodeId: '',
            isCodeLabel: next,
          })
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          syncExactMatch(value)
          setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) setOpen(true)
          if (e.key === 'ArrowDown' && filtered.length > 0) {
            e.preventDefault()
            setHighlight((prev) => (prev + 1) % filtered.length)
          }
          if (e.key === 'ArrowUp' && filtered.length > 0) {
            e.preventDefault()
            setHighlight((prev) => (prev - 1 + filtered.length) % filtered.length)
          }
          if (e.key === 'Enter' && filtered.length > 0) {
            e.preventDefault()
            pick(filtered[highlight])
          }
        }}
        placeholder="IS Code"
        autoComplete="off"
        className={cn(inlineInputClass, 'text-center')}
        aria-label="IS Code"
        data-inline-entry-is-code=""
      />
      <InlinePortalMenu open={open && filtered.length > 0} anchorRef={anchorRef} optionCount={filtered.length}>
        <ul className="max-h-48 overflow-auto text-xs">
          {filtered.map((code, index) => (
            <li key={code.id}>
              <button
                type="button"
                tabIndex={-1}
                className={cn(
                  'w-full px-2 py-1.5 text-center',
                  index === highlight ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]',
                  isCodeId === code.id && 'text-amber-800',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(code)}
                onMouseEnter={() => setHighlight(index)}
              >
                {code.displayCode}
              </button>
            </li>
          ))}
        </ul>
      </InlinePortalMenu>
    </div>
  )
}

/** Type-to-filter existing values; free text still allowed for new entries. */
function InlineSuggestPicker({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  symbolScope,
  onTrackSymbolTarget,
}: {
  value: string
  options: string[]
  onChange: (next: string) => void
  placeholder: string
  ariaLabel: string
  symbolScope?: SymbolTargetScope
  onTrackSymbolTarget?: (target: SymbolCaretTarget) => void
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const symbolHandlers =
    symbolScope && onTrackSymbolTarget
      ? symbolFieldHandlers('itemName', symbolScope, onTrackSymbolTarget)
      : null

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase()
    const list = !query
      ? options
      : options.filter((opt) => opt.toLowerCase().includes(query))
    return list.slice(0, 12)
  }, [options, value])

  const showUseTyped =
    Boolean(value.trim()) &&
    !options.some((opt) => opt.toLowerCase() === value.trim().toLowerCase())

  const totalOptions = filtered.length + (showUseTyped ? 1 : 0)

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <div ref={anchorRef} className="relative min-w-0">
      <Input
        value={value}
        onChange={(e) => {
          setOpen(true)
          setHighlight(0)
          onChange(e.target.value)
        }}
        onFocus={(e) => {
          setOpen(true)
          symbolHandlers?.onFocus(e)
        }}
        onBlur={(e) => {
          setTimeout(() => setOpen(false), 150)
          symbolHandlers?.onBlur(e)
        }}
        onSelect={symbolHandlers?.onSelect}
        onKeyUp={symbolHandlers?.onKeyUp}
        onClick={symbolHandlers?.onClick}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) setOpen(true)
          if (e.key === 'ArrowDown' && totalOptions > 0) {
            e.preventDefault()
            setHighlight((prev) => (prev + 1) % totalOptions)
          }
          if (e.key === 'ArrowUp' && totalOptions > 0) {
            e.preventDefault()
            setHighlight((prev) => (prev - 1 + totalOptions) % totalOptions)
          }
          if (e.key === 'Enter' && totalOptions > 0) {
            e.preventDefault()
            if (highlight < filtered.length) pick(filtered[highlight])
            else if (showUseTyped) {
              onChange(value.trim())
              setOpen(false)
            }
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(inlineInputClass, 'text-center')}
        aria-label={ariaLabel}
        {...(symbolHandlers
          ? {
              'data-symbol-field': symbolHandlers['data-symbol-field'],
              'data-symbol-scope': symbolHandlers['data-symbol-scope'],
            }
          : {})}
      />
      <InlinePortalMenu open={open && totalOptions > 0} anchorRef={anchorRef} optionCount={totalOptions}>
        <ul className="max-h-48 overflow-auto text-xs">
          {filtered.map((opt, index) => (
            <li key={`suggest-${opt}`}>
              <button
                type="button"
                tabIndex={-1}
                className={cn(
                  'w-full px-2 py-1.5 text-center',
                  index === highlight ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]',
                  value.trim().toLowerCase() === opt.toLowerCase() && 'text-amber-800',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
                onMouseEnter={() => setHighlight(index)}
              >
                {opt}
              </button>
            </li>
          ))}
          {showUseTyped ? (
            <li>
              <button
                type="button"
                tabIndex={-1}
                className={cn(
                  'w-full px-2 py-1.5 text-center text-amber-900',
                  highlight === filtered.length ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(value.trim())
                  setOpen(false)
                }}
                onMouseEnter={() => setHighlight(filtered.length)}
              >
                Use &quot;{value.trim()}&quot;
              </button>
            </li>
          ) : null}
        </ul>
      </InlinePortalMenu>
    </div>
  )
}

/** Same IS Code master list as IS Code field — picks Test Method only. */
function InlineTestMethodPicker({
  value,
  isCodes,
  onChange,
}: {
  value: string
  isCodes: IsCodeOption[]
  onChange: (testMethod: string) => void
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (!query) return isCodes.slice(0, 10)
    return isCodes
      .filter(
        (code) =>
          code.displayCode.toLowerCase().includes(query) ||
          code.defaultTestMethod.toLowerCase().includes(query) ||
          code.searchLabel.toLowerCase().includes(query),
      )
      .slice(0, 10)
  }, [isCodes, value])

  const pick = (match: IsCodeOption) => {
    onChange(match.defaultTestMethod || match.displayCode)
    setOpen(false)
  }

  const syncExactMatch = (raw: string) => {
    const typed = raw.trim().toLowerCase()
    if (!typed) return
    const match = isCodes.find(
      (c) =>
        c.displayCode.trim().toLowerCase() === typed ||
        c.defaultTestMethod.trim().toLowerCase() === typed,
    )
    if (match) pick(match)
  }

  return (
    <div ref={anchorRef} className="relative min-w-0">
      <Input
        value={value}
        onChange={(e) => {
          const next = e.target.value
          setOpen(true)
          setHighlight(0)
          const exact = isCodes.find(
            (c) =>
              c.displayCode.trim().toLowerCase() === next.trim().toLowerCase() ||
              c.defaultTestMethod.trim().toLowerCase() === next.trim().toLowerCase(),
          )
          if (exact) {
            onChange(exact.defaultTestMethod || exact.displayCode)
            return
          }
          onChange(next)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          syncExactMatch(value)
          setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) setOpen(true)
          if (e.key === 'ArrowDown' && filtered.length > 0) {
            e.preventDefault()
            setHighlight((prev) => (prev + 1) % filtered.length)
          }
          if (e.key === 'ArrowUp' && filtered.length > 0) {
            e.preventDefault()
            setHighlight((prev) => (prev - 1 + filtered.length) % filtered.length)
          }
          if (e.key === 'Enter' && filtered.length > 0) {
            e.preventDefault()
            pick(filtered[highlight])
          }
        }}
        placeholder="Test Method"
        autoComplete="off"
        className={cn(inlineInputClass, 'text-center')}
        aria-label="Test Method"
      />
      <InlinePortalMenu open={open && filtered.length > 0} anchorRef={anchorRef} optionCount={filtered.length}>
        <ul className="max-h-48 overflow-auto text-xs">
          {filtered.map((code, index) => {
            const label = code.defaultTestMethod || code.displayCode
            const selected =
              value.trim().toLowerCase() === label.trim().toLowerCase() ||
              value.trim().toLowerCase() === code.displayCode.trim().toLowerCase()
            return (
              <li key={`tm-${code.id}`}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    'w-full px-2 py-1.5 text-center',
                    index === highlight ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]',
                    selected && 'text-amber-800',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(code)}
                  onMouseEnter={() => setHighlight(index)}
                >
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
      </InlinePortalMenu>
    </div>
  )
}

function InlineEntryPlusButton({
  canAdd,
  busy,
  onAdd,
}: {
  canAdd: boolean
  busy: boolean
  onAdd: () => void
}) {
  return (
    <Button
      type="button"
      size="sm"
      className={cn('h-8 w-8 rounded-none p-0', limsPrimaryBtnClass)}
      disabled={!canAdd}
      aria-label="Add test parameter"
      title="Add test parameter"
      onClick={onAdd}
    >
      <Plus size={16} className={busy ? 'animate-pulse' : undefined} />
    </Button>
  )
}

function unitSymbolBind(
  scope: SymbolTargetScope,
  onTrack?: (target: SymbolCaretTarget) => void,
) {
  const handlers = symbolFieldHandlers('unitValue', scope, onTrack)
  return {
    onInputFocus: handlers.onFocus,
    onInputBlur: handlers.onBlur,
    onInputSelect: handlers.onSelect,
    inputDataAttrs: {
      'data-symbol-field': handlers['data-symbol-field'],
      'data-symbol-scope': handlers['data-symbol-scope'],
    },
  }
}

function InlineEntryTableRow({
  form,
  isCodes,
  parameterNameOptions,
  inlineAddBusy,
  onFormChange,
  onInlineAdd,
  onTrackSymbolTarget,
}: {
  form: TestParameterForm
  isCodes: IsCodeOption[]
  parameterNameOptions: string[]
  inlineAddBusy: boolean
  onFormChange: (next: TestParameterForm) => void
  onInlineAdd: () => void
  onTrackSymbolTarget?: (target: SymbolCaretTarget) => void
}) {
  const isCodeInputRef = useRef<HTMLInputElement | null>(null)
  useFocusAfterInlineAdd(inlineAddBusy, isCodeInputRef)
  const canInlineAdd = normalizeText(form.itemName).length > 0 && !inlineAddBusy
  const reqHandlers = symbolFieldHandlers('specificRequirement', 'inline', onTrackSymbolTarget)
  const unitBind = unitSymbolBind('inline', onTrackSymbolTarget)

  return (
    <TableRow className={cn(inlineEntryTone, 'border-l-2 border-l-amber-500')}>
      <TableCell className={tdClass} />
      <TableCell className={cn(tdClass, 'text-left')}>
        <InlineIsCodePicker
          value={form.isCodeLabel}
          isCodeId={form.isCodeId}
          isCodes={isCodes}
          onChange={(patch) => onFormChange({ ...form, ...patch })}
          inputRef={isCodeInputRef}
        />
      </TableCell>
      <TableCell className={cn(tdClass, 'text-left')}>
        <InlineSuggestPicker
          value={form.itemName}
          options={parameterNameOptions}
          onChange={(itemName) => onFormChange({ ...form, itemName })}
          placeholder="Test Parameter"
          ariaLabel="Test Parameter"
          symbolScope="inline"
          onTrackSymbolTarget={onTrackSymbolTarget}
        />
      </TableCell>
      <TableCell className={tdClass}>
        <InlineTestMethodPicker
          value={form.testMethod}
          isCodes={isCodes}
          onChange={(testMethod) => onFormChange({ ...form, testMethod })}
        />
      </TableCell>
      <TableCell className={tdClass}>
        <Input
          value={form.clauseNo}
          onChange={(e) => onFormChange({ ...form, clauseNo: e.target.value })}
          placeholder="Clause"
          className={cn(inlineInputClass, 'text-center')}
          aria-label="Clause"
        />
      </TableCell>
      <TableCell className={tdClass}>
        <MeasurementUnitSelect
          value={form.unitValue}
          onChange={(unitValue) => onFormChange({ ...form, unitValue })}
          showLabel={false}
          showManageButton={false}
          placeholder="Unit"
          className="min-w-0"
          inputClassName={cn(inlineInputClass, 'text-center')}
          shellClassName="min-w-0"
          {...unitBind}
        />
      </TableCell>
      <TableCell className={tdClass}>
        <Input
          value={form.specificRequirement}
          onChange={(e) => onFormChange({ ...form, specificRequirement: e.target.value })}
          placeholder="Requirements"
          className={cn(inlineInputClass, 'text-center')}
          aria-label="Requirements"
          {...reqHandlers}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey) return
            if (!canInlineAdd) return
            e.preventDefault()
            onInlineAdd()
          }}
        />
      </TableCell>
      <TableCell className={tdClass}>
        <div className="flex justify-center">
          <InlineEntryPlusButton canAdd={canInlineAdd} busy={inlineAddBusy} onAdd={onInlineAdd} />
        </div>
      </TableCell>
    </TableRow>
  )
}

function InlineEntryCard({
  form,
  isCodes,
  parameterNameOptions,
  inlineAddBusy,
  onFormChange,
  onInlineAdd,
  onTrackSymbolTarget,
}: {
  form: TestParameterForm
  isCodes: IsCodeOption[]
  parameterNameOptions: string[]
  inlineAddBusy: boolean
  onFormChange: (next: TestParameterForm) => void
  onInlineAdd: () => void
  onTrackSymbolTarget?: (target: SymbolCaretTarget) => void
}) {
  const isCodeInputRef = useRef<HTMLInputElement | null>(null)
  useFocusAfterInlineAdd(inlineAddBusy, isCodeInputRef)
  const canInlineAdd = normalizeText(form.itemName).length > 0 && !inlineAddBusy
  const reqHandlers = symbolFieldHandlers('specificRequirement', 'inline', onTrackSymbolTarget)
  const unitBind = unitSymbolBind('inline', onTrackSymbolTarget)

  return (
    <article
      className={cn(
        'overflow-hidden border-2 border-amber-600/50 font-jakarta shadow-sm ring-1 ring-amber-700/20',
        inlineEntryTone,
      )}
    >
      <div className="flex items-stretch">
        <div className="w-1 shrink-0 bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600" />
        <div className="min-w-0 flex-1 space-y-2 px-2.5 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800">New entry</p>
          <InlineIsCodePicker
            value={form.isCodeLabel}
            isCodeId={form.isCodeId}
            isCodes={isCodes}
            onChange={(patch) => onFormChange({ ...form, ...patch })}
            inputRef={isCodeInputRef}
          />
          <InlineSuggestPicker
            value={form.itemName}
            options={parameterNameOptions}
            onChange={(itemName) => onFormChange({ ...form, itemName })}
            placeholder="Test Parameter"
            ariaLabel="Test Parameter"
            symbolScope="inline"
            onTrackSymbolTarget={onTrackSymbolTarget}
          />
          <div className="grid grid-cols-2 gap-2">
            <InlineTestMethodPicker
              value={form.testMethod}
              isCodes={isCodes}
              onChange={(testMethod) => onFormChange({ ...form, testMethod })}
            />
            <Input
              value={form.clauseNo}
              onChange={(e) => onFormChange({ ...form, clauseNo: e.target.value })}
              placeholder="Clause"
              className={cn(inlineInputClass, 'text-center')}
              aria-label="Clause"
            />
          </div>
          <MeasurementUnitSelect
            value={form.unitValue}
            onChange={(unitValue) => onFormChange({ ...form, unitValue })}
            showLabel={false}
            showManageButton={false}
            placeholder="Unit"
            inputClassName={cn(inlineInputClass, 'text-center')}
            {...unitBind}
          />
          <Input
            value={form.specificRequirement}
            onChange={(e) => onFormChange({ ...form, specificRequirement: e.target.value })}
            placeholder="Requirements"
            className={cn(inlineInputClass, 'text-center')}
            aria-label="Requirements"
            {...reqHandlers}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey) return
              if (!canInlineAdd) return
              e.preventDefault()
              onInlineAdd()
            }}
          />
          <div className="flex justify-end pt-0.5">
            <InlineEntryPlusButton canAdd={canInlineAdd} busy={inlineAddBusy} onAdd={onInlineAdd} />
          </div>
        </div>
      </div>
    </article>
  )
}

function InlineEditSaveCancelButtons({
  canSave,
  busy,
  onSave,
  onCancel,
  itemName,
}: {
  canSave: boolean
  busy: boolean
  onSave: () => void
  onCancel: () => void
  itemName: string
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        size="sm"
        className={cn('h-8 w-8 rounded-none p-0', limsPrimaryBtnClass)}
        disabled={!canSave}
        aria-label={`Save ${itemName}`}
        title="Save"
        onClick={onSave}
      >
        <Check size={16} className={busy ? 'animate-pulse' : undefined} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 rounded-none p-0 text-stone-600 hover:bg-stone-100 hover:text-stone-800"
        disabled={busy}
        aria-label={`Cancel editing ${itemName}`}
        title="Cancel"
        onClick={onCancel}
      >
        <X size={16} />
      </Button>
    </div>
  )
}

function RowActions({
  row,
  onEdit,
  onDelete,
}: {
  row: TestParameterRow
  onEdit: (row: TestParameterRow) => void
  onDelete: (row: TestParameterRow) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 rounded-none p-0 text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]"
        aria-label={`Edit ${row.item_name}`}
        title="Edit"
        onClick={() => onEdit(row)}
      >
        <Pencil size={16} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 rounded-none p-0 text-red-700 hover:bg-red-50 hover:text-red-800"
        aria-label={`Delete ${row.item_name}`}
        title="Delete"
        onClick={() => onDelete(row)}
      >
        <Trash2 size={16} />
      </Button>
    </div>
  )
}

function InlineEditTableRow({
  form,
  isCodes,
  parameterNameOptions,
  editBusy,
  onFormChange,
  onSave,
  onCancel,
  onTrackSymbolTarget,
}: {
  form: TestParameterForm
  isCodes: IsCodeOption[]
  parameterNameOptions: string[]
  editBusy: boolean
  onFormChange: (next: TestParameterForm) => void
  onSave: () => void
  onCancel: () => void
  onTrackSymbolTarget?: (target: SymbolCaretTarget) => void
}) {
  const canSave = normalizeText(form.itemName).length > 0 && !editBusy
  const reqHandlers = symbolFieldHandlers('specificRequirement', 'edit', onTrackSymbolTarget)
  const unitBind = unitSymbolBind('edit', onTrackSymbolTarget)

  return (
    <TableRow className={cn(inlineEditTone, 'border-l-2 border-l-sky-500')}>
      <TableCell className={tdClass} />
      <TableCell className={cn(tdClass, 'text-left')}>
        <InlineIsCodePicker
          value={form.isCodeLabel}
          isCodeId={form.isCodeId}
          isCodes={isCodes}
          onChange={(patch) => onFormChange({ ...form, ...patch })}
        />
      </TableCell>
      <TableCell className={cn(tdClass, 'text-left')}>
        <InlineSuggestPicker
          value={form.itemName}
          options={parameterNameOptions}
          onChange={(itemName) => onFormChange({ ...form, itemName })}
          placeholder="Test Parameter"
          ariaLabel="Test Parameter"
          symbolScope="edit"
          onTrackSymbolTarget={onTrackSymbolTarget}
        />
      </TableCell>
      <TableCell className={tdClass}>
        <InlineTestMethodPicker
          value={form.testMethod}
          isCodes={isCodes}
          onChange={(testMethod) => onFormChange({ ...form, testMethod })}
        />
      </TableCell>
      <TableCell className={tdClass}>
        <Input
          value={form.clauseNo}
          onChange={(e) => onFormChange({ ...form, clauseNo: e.target.value })}
          placeholder="Clause"
          className={cn(inlineInputClass, 'text-center')}
          aria-label="Clause"
        />
      </TableCell>
      <TableCell className={tdClass}>
        <MeasurementUnitSelect
          value={form.unitValue}
          onChange={(unitValue) => onFormChange({ ...form, unitValue })}
          showLabel={false}
          showManageButton={false}
          placeholder="Unit"
          className="min-w-0"
          inputClassName={cn(inlineInputClass, 'text-center')}
          shellClassName="min-w-0"
          {...unitBind}
        />
      </TableCell>
      <TableCell className={tdClass}>
        <Input
          value={form.specificRequirement}
          onChange={(e) => onFormChange({ ...form, specificRequirement: e.target.value })}
          placeholder="Requirements"
          className={cn(inlineInputClass, 'text-center')}
          aria-label="Requirements"
          {...reqHandlers}
        />
      </TableCell>
      <TableCell className={tdClass}>
        <div className="flex justify-center">
          <InlineEditSaveCancelButtons
            canSave={canSave}
            busy={editBusy}
            onSave={onSave}
            onCancel={onCancel}
            itemName={form.itemName}
          />
        </div>
      </TableCell>
    </TableRow>
  )
}

function InlineEditCard({
  form,
  isCodes,
  parameterNameOptions,
  editBusy,
  onFormChange,
  onSave,
  onCancel,
  onTrackSymbolTarget,
}: {
  form: TestParameterForm
  isCodes: IsCodeOption[]
  parameterNameOptions: string[]
  editBusy: boolean
  onFormChange: (next: TestParameterForm) => void
  onSave: () => void
  onCancel: () => void
  onTrackSymbolTarget?: (target: SymbolCaretTarget) => void
}) {
  const canSave = normalizeText(form.itemName).length > 0 && !editBusy
  const reqHandlers = symbolFieldHandlers('specificRequirement', 'edit', onTrackSymbolTarget)
  const unitBind = unitSymbolBind('edit', onTrackSymbolTarget)

  return (
    <article
      className={cn(
        'overflow-hidden border-2 border-sky-600/50 font-jakarta shadow-sm ring-1 ring-sky-700/20',
        inlineEditTone,
      )}
    >
      <div className="flex items-stretch">
        <div className="w-1 shrink-0 bg-gradient-to-b from-sky-400 via-sky-500 to-sky-600" />
        <div className="min-w-0 flex-1 space-y-2 px-2.5 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-800">Editing</p>
          <InlineIsCodePicker
            value={form.isCodeLabel}
            isCodeId={form.isCodeId}
            isCodes={isCodes}
            onChange={(patch) => onFormChange({ ...form, ...patch })}
          />
          <InlineSuggestPicker
            value={form.itemName}
            options={parameterNameOptions}
            onChange={(itemName) => onFormChange({ ...form, itemName })}
            placeholder="Test Parameter"
            ariaLabel="Test Parameter"
            symbolScope="edit"
            onTrackSymbolTarget={onTrackSymbolTarget}
          />
          <div className="grid grid-cols-2 gap-2">
            <InlineTestMethodPicker
              value={form.testMethod}
              isCodes={isCodes}
              onChange={(testMethod) => onFormChange({ ...form, testMethod })}
            />
            <Input
              value={form.clauseNo}
              onChange={(e) => onFormChange({ ...form, clauseNo: e.target.value })}
              placeholder="Clause"
              className={cn(inlineInputClass, 'text-center')}
              aria-label="Clause"
            />
          </div>
          <MeasurementUnitSelect
            value={form.unitValue}
            onChange={(unitValue) => onFormChange({ ...form, unitValue })}
            showLabel={false}
            showManageButton={false}
            placeholder="Unit"
            inputClassName={cn(inlineInputClass, 'text-center')}
            {...unitBind}
          />
          <Input
            value={form.specificRequirement}
            onChange={(e) => onFormChange({ ...form, specificRequirement: e.target.value })}
            placeholder="Requirements"
            className={cn(inlineInputClass, 'text-center')}
            aria-label="Requirements"
            {...reqHandlers}
          />
          <div className="flex justify-end pt-0.5">
            <InlineEditSaveCancelButtons
              canSave={canSave}
              busy={editBusy}
              onSave={onSave}
              onCancel={onCancel}
              itemName={form.itemName}
            />
          </div>
        </div>
      </div>
    </article>
  )
}

export function TestParameterTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onDelete,
  sortKey,
  sortDir,
  onSort,
  inlineForm,
  onInlineFormChange,
  onInlineAdd,
  inlineAddBusy,
  isCodes,
  parameterNameOptions,
  editingRowId,
  editForm,
  onEditFormChange,
  onEditSave,
  onEditCancel,
  editBusy,
  onTrackSymbolTarget,
}: {
  rows: TestParameterRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: TestParameterRow) => void
  onDelete: (row: TestParameterRow) => void
  sortKey: TestParameterSortKey
  sortDir: TestParameterSortDir
  onSort: (key: TestParameterSortKey) => void
  inlineForm: TestParameterForm
  onInlineFormChange: (next: TestParameterForm) => void
  onInlineAdd: () => void
  inlineAddBusy: boolean
  isCodes: IsCodeOption[]
  parameterNameOptions: string[]
  editingRowId: string | null
  editForm: TestParameterForm
  onEditFormChange: (next: TestParameterForm) => void
  onEditSave: () => void
  onEditCancel: () => void
  editBusy: boolean
  onTrackSymbolTarget?: (target: SymbolCaretTarget) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  const renderRequirement = (requirement: string | null | undefined) => {
    const text = requirement?.trim() || '—'
    return <div className="whitespace-pre-wrap break-words text-center">{text}</div>
  }

  return (
    <div className={cn(limsPanelClass, 'flex h-full min-h-0 flex-col bg-[#f7f3eb]')}>
      {error ? (
        <p className="shrink-0 px-3 pt-3 text-sm text-red-600 sm:px-5 sm:pt-4">{error}</p>
      ) : null}

      {loading ? (
        <p className="shrink-0 px-3 py-1.5 text-center text-xs text-[#78716c] sm:px-5">Loading records…</p>
      ) : null}

      {searchActive && rows.length === 0 && !loading ? (
        <p className="shrink-0 px-3 py-1 text-center text-xs text-[#78716c] sm:px-5">
          No test parameters match your search.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {/* Cards — below ~10" / lg */}
          <div className={cn('space-y-2.5 p-2 sm:p-3', CARDS_MQ_SHOW)}>
            <div className="sticky top-0 z-[1] flex items-center gap-2 border border-stone-500 bg-stone-800 px-2.5 py-2 text-amber-200 shadow-sm">
              <input
                type="checkbox"
                className={checkboxClass}
                aria-label="Select all"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = !allChecked && someChecked
                }}
                onChange={(e) => onToggleAll(e.target.checked)}
                disabled={rows.length === 0}
              />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${rows.length} parameters`}
              </span>
            </div>

            <InlineEntryCard
              form={inlineForm}
              isCodes={isCodes}
              parameterNameOptions={parameterNameOptions}
              inlineAddBusy={inlineAddBusy}
              onFormChange={onInlineFormChange}
              onInlineAdd={onInlineAdd}
              onTrackSymbolTarget={onTrackSymbolTarget}
            />

            {rows.map((r, index) => {
              const selected = selectedIds.has(r.id)
              const isEditing = editingRowId === r.id
              const even = index % 2 === 0
              const tone = isEditing
                ? inlineEditTone
                : selected
                  ? 'bg-[#fde68a]/70'
                  : even
                    ? 'bg-[#fffcf7]'
                    : 'bg-white'

              if (isEditing) {
                return (
                  <InlineEditCard
                    key={r.id}
                    form={editForm}
                    isCodes={isCodes}
                    parameterNameOptions={parameterNameOptions}
                    editBusy={editBusy}
                    onFormChange={onEditFormChange}
                    onSave={onEditSave}
                    onCancel={onEditCancel}
                    onTrackSymbolTarget={onTrackSymbolTarget}
                  />
                )
              }

              return (
                <article
                  key={r.id}
                  className={cn(
                    'overflow-hidden border-2 border-stone-500 font-jakarta shadow-sm ring-1 ring-amber-700/20',
                    tone,
                    selected && 'ring-2 ring-amber-500/40',
                  )}
                >
                  <div className="flex items-stretch">
                    <div className="w-1 shrink-0 bg-gradient-to-b from-amber-500 via-amber-600 to-stone-700" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2 border-b border-[#e7e0d4] px-2.5 py-2.5">
                        <input
                          type="checkbox"
                          className={cn(checkboxClass, 'mt-1 shrink-0')}
                          aria-label={`Select ${r.item_name}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <FlaskConical className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                            <p className="truncate text-[14px] font-bold tracking-tight text-[#1c1917]">
                              {r.item_name || '—'}
                            </p>
                          </div>
                          <p className="mt-1 font-mono text-[11px] font-medium text-[#b45309]">
                            {r.is_code_label || '—'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-px border-b border-[#e7e0d4] bg-[#e7e0d4]">
                        <div className="bg-[#fffcf7] px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                            Test Method
                          </p>
                          <p className="mt-0.5 text-[12px] font-semibold text-[#292524]">
                            {r.test_method?.trim() || '—'}
                          </p>
                        </div>
                        <div className="bg-[#fffcf7] px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                            Clause
                          </p>
                          <p className="mt-0.5 text-[12px] font-semibold text-[#292524]">
                            {r.clause_no?.trim() || '—'}
                          </p>
                        </div>
                        <div className="bg-[#fffcf7] px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                            Unit
                          </p>
                          <p className="mt-0.5 text-[12px] font-semibold text-[#292524]">
                            {r.unit_value?.trim() || '—'}
                          </p>
                        </div>
                        <div className="col-span-3 bg-[#fffcf7] px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                            Requirements
                          </p>
                          <div className="mt-0.5 text-[12px] font-semibold text-[#292524]">
                            {renderRequirement(r.specific_requirement)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 bg-[#f7f3eb]/80 px-2.5 py-1.5">
                        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-stone-500">
                          Actions
                        </span>
                        <RowActions row={r} onEdit={onEdit} onDelete={onDelete} />
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <div className={TABLE_MQ_SHOW}>
            <Table className={GRID_TABLE}>
              <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '7.5%' }} />
                <col style={{ width: '7.5%' }} />
                <col style={{ width: '35%' }} />
                <col style={{ width: '6%' }} />
              </colgroup>
              <TableHeader>
                <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                  <TableHead className={thBase}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label="Select all"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = !allChecked && someChecked
                      }}
                      onChange={(e) => onToggleAll(e.target.checked)}
                    />
                  </TableHead>
                  <SortableHeader
                    label="IS Code"
                    columnKey="isCode"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={thBase}
                    align="left"
                  />
                  <SortableHeader
                    label="Test Parameter"
                    columnKey="itemName"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={thBase}
                    align="left"
                  />
                  <SortableHeader
                    label="Test Method"
                    columnKey="testMethod"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={thBase}
                  />
                  <SortableHeader
                    label="Clause"
                    columnKey="clause"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={thBase}
                  />
                  <SortableHeader
                    label="Unit"
                    columnKey="unit"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={thBase}
                  />
                  <SortableHeader
                    label="Requirements"
                    columnKey="requirement"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={thBase}
                  />
                  <TableHead className={thBase}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <InlineEntryTableRow
                  form={inlineForm}
                  isCodes={isCodes}
                  parameterNameOptions={parameterNameOptions}
                  inlineAddBusy={inlineAddBusy}
                  onFormChange={onInlineFormChange}
                  onInlineAdd={onInlineAdd}
                  onTrackSymbolTarget={onTrackSymbolTarget}
                />
                {rows.map((r, index) => {
                  const selected = selectedIds.has(r.id)
                  const isEditing = editingRowId === r.id

                  if (isEditing) {
                    return (
                      <InlineEditTableRow
                        key={r.id}
                        form={editForm}
                        isCodes={isCodes}
                        parameterNameOptions={parameterNameOptions}
                        editBusy={editBusy}
                        onFormChange={onEditFormChange}
                        onSave={onEditSave}
                        onCancel={onEditCancel}
                        onTrackSymbolTarget={onTrackSymbolTarget}
                      />
                    )
                  }

                  return (
                    <TableRow
                      key={r.id}
                      className={cn(
                        selected ? rowSelectedClass : index % 2 === 0 ? rowEvenClass : rowOddClass,
                      )}
                    >
                      <TableCell className={tdClass}>
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${r.item_name}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                      </TableCell>
                      <TableCell className={cn(tdClass, 'text-left')}>
                        <div className="font-mono text-[12px] font-semibold text-[#b45309]">
                          {r.is_code_label || '—'}
                        </div>
                      </TableCell>
                      <TableCell className={cn(tdClass, 'text-left')}>
                        <div className="text-[13px] font-bold tracking-tight text-[#1c1917]">
                          {r.item_name || '—'}
                        </div>
                      </TableCell>
                      <TableCell className={cn(tdClass, 'font-semibold')}>
                        {r.test_method?.trim() || '—'}
                      </TableCell>
                      <TableCell className={tdClass}>{r.clause_no?.trim() || '—'}</TableCell>
                      <TableCell className={tdClass}>{r.unit_value?.trim() || '—'}</TableCell>
                      <TableCell className={tdClass}>
                        {renderRequirement(r.specific_requirement)}
                      </TableCell>
                      <TableCell className={tdClass}>
                        <div className="flex justify-center">
                          <RowActions row={r} onEdit={onEdit} onDelete={onDelete} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
      </div>
    </div>
  )
}
