import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabaseClient'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatTestMethodWithYear } from '@/features/masters/is-codes/formatIsCodeLabel'
import { AddSymbolDialog } from '@/features/masters/test-parameter/AddSymbolDialog'
import { buildTestParametersListAssistantContext } from '@/features/masters/test-parameter/buildTestParameterAssistantContext'
import {
  insertAtCaret,
  type SymbolCaretTarget,
} from '@/features/masters/test-parameter/scientificSymbols'
import { TestParameterHeaderBar } from '@/features/masters/test-parameter/TestParameterHeaderBar'
import {
  TestParameterTable,
  type TestParameterSortDir,
  type TestParameterSortKey,
} from '@/features/masters/test-parameter/TestParameterTable'
import {
  emptyTestParameterForm,
  normalizeText,
  toProperTitleCase,
  type TestParameterForm,
  type TestParameterRow,
} from '@/features/masters/test-parameter/types'

export type FtrMasterParam = {
  id: string
  item_name: string
  clause_no: string | null
  unit_value: string | null
  specific_requirement: string | null
  test_method: string | null
  is_code_label: string | null
  /** Manual order from dragging; null = placed by clause number. */
  display_order?: number | null
}

const PARAM_COLUMNS =
  'id, item_name, clause_no, unit_value, specific_requirement, test_method, is_code_label, display_order'

function compareClause(a: string | null | undefined, b: string | null | undefined) {
  const x = (a ?? '').trim()
  const y = (b ?? '').trim()
  if (!x || !y) return x ? -1 : y ? 1 : 0
  return x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true })
}

/**
 * Clause order with the user's drags kept: rows with a manual order stay in that order;
 * every other row goes right after the last row whose clause is not higher.
 */
export function orderFtrParams(rows: FtrMasterParam[]): FtrMasterParam[] {
  const byClause = (a: FtrMasterParam, b: FtrMasterParam) =>
    compareClause(a.clause_no, b.clause_no) || a.item_name.localeCompare(b.item_name)
  const out = rows
    .filter((r) => r.display_order != null)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || byClause(a, b))
  const rest = rows.filter((r) => r.display_order == null).sort(byClause)
  for (const r of rest) {
    let at = -1
    out.forEach((x, i) => {
      if (compareClause(x.clause_no, r.clause_no) <= 0) at = i
    })
    out.splice(at + 1, 0, r)
  }
  return out
}

function lockedIsOption(isCodeId: string, isCodeLabel: string) {
  const label = isCodeLabel.trim()
  return {
    id: isCodeId.trim(),
    displayCode: label,
    searchLabel: label,
    defaultTestMethod: label,
  }
}

function toTableRow(p: FtrMasterParam, isCodeId: string): TestParameterRow {
  return {
    id: p.id,
    is_code_id: isCodeId.trim() || null,
    is_code_label: p.is_code_label,
    clause_no: p.clause_no,
    unit_value: p.unit_value,
    test_method: p.test_method,
    item_name: p.item_name,
    specific_requirement: p.specific_requirement,
    under_accreditation_ids: [],
    uncertainty_mu: null,
    uncertainty_calculation_data: null,
    uncertainty_mu_history: null,
    department: null,
    designation: null,
    acceptance_criteria: null,
  }
}

function withLockedIs(
  form: TestParameterForm,
  isCodeId: string,
  isCodeLabel: string,
): TestParameterForm {
  const label = isCodeLabel.trim()
  return {
    ...form,
    isCodeId: isCodeId.trim(),
    isCodeLabel: label,
    testMethod: form.testMethod.trim() || label,
  }
}

/** Full-window Test Parameter UI for one IS only (used inside Factory Test Report). */
export function FtrIsTestParameterDialog({
  open,
  onOpenChange,
  isCodeId,
  isCodeLabel,
  selectedParamIds,
  onToggleParam,
  onToggleParams,
  onParamCreated,
  onParamUpdated,
  onOrderChange,
  disabled = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId?: string | null
  isCodeLabel?: string | null
  selectedParamIds: Set<string>
  onToggleParam: (param: FtrMasterParam, checked: boolean) => void
  /** Select All: toggles every listed parameter in one update. */
  onToggleParams?: (params: FtrMasterParam[], checked: boolean) => void
  /** Called after a new master row is inserted (also selected onto FTR by parent). */
  onParamCreated: (param: FtrMasterParam) => void
  /** Called after a master row is edited here (parent refreshes its copy on the report). */
  onParamUpdated?: (param: FtrMasterParam) => void
  /** Master order of this IS (clause + drags), so the report lists parameters the same way. */
  onOrderChange?: (orderedIds: string[]) => void
  disabled?: boolean
}) {
  const lockedId = (isCodeId ?? '').trim()
  const lockedLabel = (isCodeLabel ?? '').trim()

  const [rows, setRows] = useState<FtrMasterParam[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [inlineForm, setInlineForm] = useState<TestParameterForm>(() =>
    withLockedIs(emptyTestParameterForm(), lockedId, lockedLabel),
  )
  const [inlineAddBusy, setInlineAddBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TestParameterForm>(() => emptyTestParameterForm())
  const [editBusy, setEditBusy] = useState(false)
  const [sortKey, setSortKey] = useState<TestParameterSortKey>('clause')
  const [sortDir, setSortDir] = useState<TestParameterSortDir>('asc')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')
  const [symbolDialogOpen, setSymbolDialogOpen] = useState(false)
  const symbolTargetRef = useRef<SymbolCaretTarget>({
    field: 'itemName',
    scope: 'inline',
    start: 0,
    end: 0,
  })

  const isCodes = useMemo(
    () => (lockedId || lockedLabel ? [lockedIsOption(lockedId || 'locked', lockedLabel || '—')] : []),
    [lockedId, lockedLabel],
  )

  const isCodeOptions = useMemo(
    () =>
      lockedId || lockedLabel
        ? [
            {
              id: lockedId || 'locked',
              label: lockedLabel || '—',
              displayCode: lockedLabel || undefined,
            },
          ]
        : [],
    [lockedId, lockedLabel],
  )

  const tableRows = useMemo(
    () => rows.map((r) => toTableRow(r, lockedId)),
    [rows, lockedId],
  )

  const parameterNameOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.item_name.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [rows],
  )

  const loadRows = async () => {
    if (!lockedId) {
      setRows([])
      setError(
        lockedLabel
          ? 'This project has no IS code id linked. Link an IS code first.'
          : 'This project has no IS code linked. Link an IS code first.',
      )
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: qErr } = await supabase
        .from('test_parameters')
        .select(
          PARAM_COLUMNS,
        )
        .eq('is_code_id', lockedId)
        .order('item_name', { ascending: true })
      if (qErr) throw qErr
      setRows((Array.isArray(data) ? data : []) as FtrMasterParam[])
    } catch (err) {
      setRows([])
      setError(err instanceof Error ? err.message : 'Unable to load test parameters.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setSaveMessage(null)
    setSearch('')
    setPage(1)
    setJumpTo('')
    setInlineForm(withLockedIs(emptyTestParameterForm(), lockedId, lockedLabel))
    setEditingId(null)
    void loadRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when dialog opens / IS changes
  }, [open, lockedId, lockedLabel])

  const handleSort = (key: TestParameterSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tableRows
    return tableRows.filter((r) => {
      const blob = [
        r.is_code_label ?? '',
        r.test_method ?? '',
        r.clause_no ?? '',
        r.unit_value ?? '',
        r.item_name ?? '',
        r.specific_requirement ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [tableRows, search])

  const orderedParams = useMemo(() => orderFtrParams(rows), [rows])

  useEffect(() => {
    if (!open || orderedParams.length === 0) return
    onOrderChange?.(orderedParams.map((r) => r.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report only when the order changes
  }, [open, orderedParams])

  const sortedRows = useMemo(() => {
    if (sortKey === 'clause') {
      const pos = new Map(orderedParams.map((r, i) => [r.id, i]))
      const sorted = [...filteredRows].sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))
      return sortDir === 'asc' ? sorted : sorted.reverse()
    }
    const dir = sortDir === 'asc' ? 1 : -1
    const valueOf = (r: TestParameterRow) => {
      switch (sortKey) {
        case 'isCode':
          return (r.is_code_label ?? '').toLowerCase()
        case 'testMethod':
          return (r.test_method ?? '').toLowerCase()
        case 'unit':
          return (r.unit_value ?? '').toLowerCase()
        case 'requirement':
          return (r.specific_requirement ?? '').toLowerCase()
        case 'itemName':
        default:
          return (r.item_name ?? '').toLowerCase()
      }
    }
    return [...filteredRows].sort((a, b) => {
      const cmp = valueOf(a).localeCompare(valueOf(b), undefined, {
        sensitivity: 'base',
        numeric: true,
      })
      return cmp * dir
    })
  }, [filteredRows, sortKey, sortDir, orderedParams])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount))
  }, [pageCount])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, page, pageSize])

  const assistantContext = useMemo(
    () => buildTestParametersListAssistantContext(filteredRows, search),
    [filteredRows, search],
  )

  const handleInlineFormChange = (next: TestParameterForm) => {
    setInlineForm(withLockedIs(next, lockedId, lockedLabel))
  }

  const handleTrackSymbolTarget = (target: SymbolCaretTarget) => {
    symbolTargetRef.current = target
  }

  const handleInsertSymbol = (symbol: string) => {
    const target = symbolTargetRef.current
    const field = target.field
    const current = inlineForm[field] ?? ''
    const { next, caret } = insertAtCaret(current, symbol, target.start, target.end)
    setInlineForm((prev) => withLockedIs({ ...prev, [field]: next }, lockedId, lockedLabel))
    symbolTargetRef.current = { field, scope: 'inline', start: caret, end: caret }
    requestAnimationFrame(() => {
      const nodes = document.querySelectorAll<HTMLInputElement>(
        `[data-symbol-field="${field}"][data-symbol-scope="inline"]`,
      )
      for (const el of nodes) {
        if (el.offsetParent === null && el.getClientRects().length === 0) continue
        el.focus({ preventScroll: true })
        el.setSelectionRange(caret, caret)
        break
      }
    })
  }

  const buildFieldsPayload = (form: TestParameterForm) => ({
    is_code_id: lockedId,
    is_code_label: lockedLabel || null,
    clause_no: normalizeText(form.clauseNo) || null,
    unit_value: normalizeText(form.unitValue) || null,
    test_method:
      formatTestMethodWithYear(normalizeText(form.testMethod) || lockedLabel, lockedLabel) || null,
    item_name: toProperTitleCase(normalizeText(form.itemName)),
    specific_requirement: toProperTitleCase(normalizeText(form.specificRequirement)) || null,
  })

  /** The form as it was when the row opened (or was last saved) — only real changes are written. */
  const editOriginalRef = useRef('')

  const saveEdit = async (id: string, form: TestParameterForm): Promise<boolean> => {
    try {
      const before = rows.find((r) => r.id === id)
      const clauseChanged = normalizeText(before?.clause_no ?? '') !== normalizeText(form.clauseNo)
      const { data, error: upErr } = await supabase
        .from('test_parameters')
        // A new clause number moves the row to that clause's place.
        .update({ ...buildFieldsPayload(form), ...(clauseChanged ? { display_order: null } : {}) })
        .eq('id', id)
        .select(PARAM_COLUMNS)
      if (upErr) throw upErr
      const updated = (Array.isArray(data) ? data[0] : null) as FtrMasterParam | null
      if (!updated) throw new Error('You do not have edit access for this record (view-only).')
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      onParamUpdated?.(updated)
      setSaveMessage('Saved to Test Parameter master.')
      return true
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Unable to save test parameter.')
      return false
    }
  }

  /** Saves the open row if it changed; `close` also ends editing (unless another row opened meanwhile). */
  const commitEdit = (close: boolean) => {
    const id = editingId
    const form = editForm
    if (!id) return
    const closeIfCurrent = () => {
      if (close) setEditingId((cur) => (cur === id ? null : cur))
    }
    if (JSON.stringify(form) === editOriginalRef.current) {
      closeIfCurrent()
      return
    }
    if (normalizeText(form.itemName).length === 0) {
      setSaveMessage('Test Parameter name is required.')
      return
    }
    editOriginalRef.current = JSON.stringify(form)
    setEditBusy(true)
    setSaveMessage(null)
    void saveEdit(id, form).then((ok) => {
      setEditBusy(false)
      if (ok) closeIfCurrent()
    })
  }

  const handleEdit = (row: TestParameterRow) => {
    if (disabled) return
    // Double-click on another row: the row being edited is saved first.
    if (editingId && editingId !== row.id) commitEdit(false)
    setSaveMessage(null)
    const form = withLockedIs(
      {
        ...emptyTestParameterForm(),
        clauseNo: row.clause_no ?? '',
        unitValue: row.unit_value ?? '',
        testMethod: row.test_method ?? '',
        itemName: row.item_name ?? '',
        specificRequirement: row.specific_requirement ?? '',
      },
      lockedId,
      lockedLabel,
    )
    editOriginalRef.current = JSON.stringify(form)
    setEditForm(form)
    setEditingId(row.id)
  }

  const handleEditSave = () => commitEdit(true)

  /** Drag-and-drop: save the whole IS order (1, 2, 3 …) so later rows keep their places. */
  const handleReorder = (draggedId: string, targetId: string, place: 'before' | 'after') => {
    if (disabled) return
    const order = orderedParams.filter((r) => r.id !== draggedId)
    const dragged = orderedParams.find((r) => r.id === draggedId)
    const at = order.findIndex((r) => r.id === targetId)
    if (!dragged || at < 0) return
    order.splice(place === 'before' ? at : at + 1, 0, dragged)
    const changed = order
      .map((r, i) => ({ ...r, display_order: i + 1 }))
      .filter((r) => rows.find((x) => x.id === r.id)?.display_order !== r.display_order)
    if (changed.length === 0) return
    const previous = rows
    setRows((prev) =>
      prev.map((r) => {
        const c = changed.find((x) => x.id === r.id)
        return c ? { ...r, display_order: c.display_order } : r
      }),
    )
    setSaveMessage(null)
    void (async () => {
      const results = await Promise.all(
        changed.map((r) =>
          supabase
            .from('test_parameters')
            .update({ display_order: r.display_order })
            .eq('id', r.id)
            .select('id'),
        ),
      )
      const failed = results.find((r) => r.error || !r.data || r.data.length === 0)
      if (failed) {
        setRows(previous)
        setSaveMessage(failed.error?.message ?? 'You do not have edit access for this record (view-only).')
      }
    })()
  }

  const handleDelete = (row: TestParameterRow) => {
    void (async () => {
      if (disabled) return
      const label = row.item_name?.trim() || 'this record'
      const ok = window.confirm(
        `Permanently delete "${label}" from the Test Parameter master? Records still used elsewhere will be skipped. This cannot be undone.`,
      )
      if (!ok) return
      setSaveMessage(null)
      try {
        const { data, error: delErr } = await supabase.rpc('delete_master_rows', {
          p_table: 'test_parameters',
          p_ids: [row.id],
        })
        if (delErr) throw delErr
        const deleted = (data as { deleted?: string[] | null } | null)?.deleted ?? []
        if (!deleted.includes(row.id)) {
          setSaveMessage(`"${label}" is still used elsewhere, so it was not deleted.`)
          return
        }
        const param = rows.find((r) => r.id === row.id)
        if (param && selectedParamIds.has(row.id)) onToggleParam(param, false)
        if (editingId === row.id) setEditingId(null)
        setRows((prev) => prev.filter((r) => r.id !== row.id))
        setSaveMessage(`Deleted "${label}" from Test Parameter master.`)
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete test parameter.')
      }
    })()
  }

  const handleInlineAdd = () => {
    void (async () => {
      if (disabled || inlineAddBusy) return
      if (!lockedId) {
        setSaveMessage('Link an IS code on this project before adding test parameters.')
        return
      }
      if (normalizeText(inlineForm.itemName).length === 0) return
      setInlineAddBusy(true)
      setSaveMessage(null)
      try {
        const payload = {
          ...buildFieldsPayload(inlineForm),
          under_accreditation_ids: [] as string[],
          uncertainty_mu: null,
          department: normalizeText(inlineForm.department) || null,
          designation: normalizeText(inlineForm.designation) || null,
        }
        const { data, error: insErr } = await supabase
          .from('test_parameters')
          .insert(payload)
          .select(
            PARAM_COLUMNS,
          )
          .single()
        if (insErr) throw insErr
        const created = data as FtrMasterParam
        setRows((prev) => [...prev.filter((r) => r.id !== created.id), created])
        onParamCreated(created)
        onToggleParam(created, true)
        setInlineForm(
          withLockedIs(
            {
              ...emptyTestParameterForm(),
              clauseNo: inlineForm.clauseNo,
              specificRequirement: inlineForm.specificRequirement,
              unitValue: inlineForm.unitValue,
              testMethod: inlineForm.testMethod,
            },
            lockedId,
            lockedLabel,
          ),
        )
        setSaveMessage('Saved to Test Parameter master and added to this report.')
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to save test parameter.')
      } finally {
        setInlineAddBusy(false)
      }
    })()
  }

  const handleToggle = (id: string) => {
    if (disabled) return
    const param = rows.find((r) => r.id === id)
    if (!param) return
    onToggleParam(param, !selectedParamIds.has(id))
  }

  const handleToggleAll = (checked: boolean) => {
    if (disabled) return
    if (onToggleParams) {
      const params = pagedRows
        .map((row) => rows.find((r) => r.id === row.id))
        .filter((param): param is FtrMasterParam => Boolean(param))
      onToggleParams(params, checked)
      return
    }
    for (const row of pagedRows) {
      const param = rows.find((r) => r.id === row.id)
      if (!param) continue
      const isOn = selectedParamIds.has(param.id)
      if (checked && !isOn) onToggleParam(param, true)
      if (!checked && isOn) onToggleParam(param, false)
    }
  }

  const pageNavBtnClass = cn(limsDarkBarBtnClass, 'h-8 w-8 shrink-0')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="overlay"
        aria-describedby={undefined}
        className={cn(
          'flex !flex-col gap-0 overflow-hidden p-0',
          '!flex h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 rounded-none border-0 bg-stone-100 shadow-none sm:rounded-none',
          'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0',
          'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
          'border-stone-600 ring-1 ring-amber-700/20',
        )}
      >
        <DialogTitle className="sr-only">
          Test Parameters{lockedLabel ? ` — ${lockedLabel}` : ''}
        </DialogTitle>

        <div className="shrink-0 border-b border-stone-600">
          <TestParameterHeaderBar
            reserveCloseButtonSpace
            search={search}
            onSearchChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            assistantContext={
              lockedLabel
                ? `Factory Test Report — IS-locked parameters for ${lockedLabel}.\n\n${assistantContext}`
                : assistantContext
            }
            onAssistantDataChanged={() => void loadRows()}
            isCodeOptions={isCodeOptions}
            onAddSymbol={() => setSymbolDialogOpen(true)}
          />
        </div>

        <AddSymbolDialog
          open={symbolDialogOpen}
          onOpenChange={setSymbolDialogOpen}
          onInsert={handleInsertSymbol}
          layer="above"
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4">
          {saveMessage ? (
            <p
              className={cn(
                'mb-2 shrink-0 text-xs',
                /^(Saved|Deleted)/.test(saveMessage) ? 'text-emerald-800' : 'text-red-700',
              )}
            >
              {saveMessage}
            </p>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">
            <TestParameterTable
              rows={pagedRows}
              loading={loading}
              error={error}
              searchActive={search.trim().length > 0}
              selectedIds={selectedParamIds}
              onToggle={handleToggle}
              onToggleAll={handleToggleAll}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReorder={
                !disabled && sortKey === 'clause' && sortDir === 'asc' && !search.trim()
                  ? handleReorder
                  : undefined
              }
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              inlineForm={inlineForm}
              onInlineFormChange={handleInlineFormChange}
              onInlineAdd={handleInlineAdd}
              inlineAddBusy={inlineAddBusy || disabled}
              isCodes={isCodes}
              parameterNameOptions={parameterNameOptions}
              editingRowId={editingId}
              editForm={editForm}
              onEditFormChange={(next) => setEditForm(withLockedIs(next, lockedId, lockedLabel))}
              onEditSave={handleEditSave}
              onEditCancel={() => setEditingId(null)}
              editBusy={editBusy}
              onTrackSymbolTarget={handleTrackSymbolTarget}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-stone-400 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 sm:justify-between sm:px-4">
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-1">
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              <Input
                aria-label="Jump to Page"
                placeholder="Page"
                value={jumpTo}
                onChange={(e) => setJumpTo(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  const n = Number(jumpTo)
                  if (!Number.isFinite(n) || n <= 0) return
                  setPage(Math.min(pageCount, Math.max(1, n)))
                }}
                className={cn(limsDarkBarFieldClass, 'h-8 w-12 shrink-0 text-xs sm:w-14')}
                inputMode="numeric"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={pageNavBtnClass}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={loading || page <= 1}
              >
                <ChevronLeft size={16} />
                <span className="sr-only">Previous Page</span>
              </Button>
              <span className="shrink-0 whitespace-nowrap text-center text-xs font-medium text-stone-300 sm:min-w-[5rem]">
                <span className="hidden sm:inline">Page </span>
                {page}/{pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={pageNavBtnClass}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={loading || page >= pageCount}
              >
                <ChevronRight size={16} />
                <span className="sr-only">Next Page</span>
              </Button>
            </div>
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
