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
  onParamCreated,
  disabled = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId?: string | null
  isCodeLabel?: string | null
  selectedParamIds: Set<string>
  onToggleParam: (param: FtrMasterParam, checked: boolean) => void
  /** Called after a new master row is inserted (also selected onto FTR by parent). */
  onParamCreated: (param: FtrMasterParam) => void
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
  const [sortKey, setSortKey] = useState<TestParameterSortKey>('itemName')
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
          'id, item_name, clause_no, unit_value, specific_requirement, test_method, is_code_label',
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

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const valueOf = (r: TestParameterRow) => {
      switch (sortKey) {
        case 'isCode':
          return (r.is_code_label ?? '').toLowerCase()
        case 'testMethod':
          return (r.test_method ?? '').toLowerCase()
        case 'clause':
          return (r.clause_no ?? '').toLowerCase()
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
  }, [filteredRows, sortKey, sortDir])

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
          is_code_id: lockedId,
          is_code_label: lockedLabel || null,
          clause_no: normalizeText(inlineForm.clauseNo) || null,
          unit_value: normalizeText(inlineForm.unitValue) || null,
          test_method:
            formatTestMethodWithYear(
              normalizeText(inlineForm.testMethod) || lockedLabel,
              lockedLabel,
            ) || null,
          item_name: toProperTitleCase(normalizeText(inlineForm.itemName)),
          specific_requirement:
            toProperTitleCase(normalizeText(inlineForm.specificRequirement)) || null,
          under_accreditation_ids: [] as string[],
          uncertainty_mu: null,
          department: normalizeText(inlineForm.department) || null,
          designation: normalizeText(inlineForm.designation) || null,
        }
        const { data, error: insErr } = await supabase
          .from('test_parameters')
          .insert(payload)
          .select(
            'id, item_name, clause_no, unit_value, specific_requirement, test_method, is_code_label',
          )
          .single()
        if (insErr) throw insErr
        const created = data as FtrMasterParam
        setRows((prev) =>
          [...prev.filter((r) => r.id !== created.id), created].sort((a, b) =>
            a.item_name.localeCompare(b.item_name),
          ),
        )
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
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4">
          {saveMessage ? (
            <p
              className={cn(
                'mb-2 shrink-0 text-xs',
                saveMessage.startsWith('Saved') ? 'text-emerald-800' : 'text-red-700',
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
              onEdit={() => {
                /* IS-locked FTR view: add via blank row; edit in master if needed */
              }}
              onDelete={() => {
                /* keep master rows intact from FTR picker */
              }}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              inlineForm={inlineForm}
              onInlineFormChange={handleInlineFormChange}
              onInlineAdd={handleInlineAdd}
              inlineAddBusy={inlineAddBusy || disabled}
              isCodes={isCodes}
              parameterNameOptions={parameterNameOptions}
              editingRowId={null}
              editForm={inlineForm}
              onEditFormChange={handleInlineFormChange}
              onEditSave={() => {}}
              onEditCancel={() => {}}
              editBusy={false}
              onTrackSymbolTarget={handleTrackSymbolTarget}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-stone-400 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 sm:justify-between sm:px-4">
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-1">
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              <Input
                aria-label="Jump to page"
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
                <span className="sr-only">Previous page</span>
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
                <span className="sr-only">Next page</span>
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
