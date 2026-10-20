import { useCallback, useEffect, useRef, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
import { BisProjectsHeaderBar } from '../projects/BisProjectsHeaderBar'
import { BisProjectsFooterBar } from '../projects/BisProjectsFooterBar'
import { formatCmL } from '../projects/types'
import { downloadCsv } from '../shared/downloadCsv'
import { StopMarkingAddDialog } from './StopMarkingAddDialog'
import { StopMarkingCaseDialog } from './StopMarkingCaseDialog'
import { StopMarkingTable } from './StopMarkingTable'
import { createStopMarkingCase, deleteStopMarkingCases, fetchStopMarkingPage, formatBisApiError } from './stopMarkingApi'
import {
  emptyStopMarkingAddForm,
  stopMarkingClientName,
  stopMarkingIsCodeLabel,
  stopMarkingStatusLabel,
  type StopMarkingAddForm,
  type StopMarkingRow,
} from './types'

const SEARCH_DEBOUNCE_MS = 350

/** License Stop Marking: add a licence, review the BIS report, reply with AI help, then resume marking. */
export default function StopMarkingMasterPage() {
  const { editId, setEdit } = useMasterUiSearchState()
  const [rows, setRows] = useState<StopMarkingRow[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [jumpTo, setJumpTo] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [addForm, setAddForm] = useState<StopMarkingAddForm>(() => emptyStopMarkingAddForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const adding = editId === 'new'
  const openCase = editId && editId !== 'new' ? rows.find((r) => r.id === editId) ?? null : null
  const handleAddOpenChange = useFormDialogOpenChange((open) => {
    if (!open) setEdit(null)
  })
  const handleCaseOpenChange = useFormDialogOpenChange((open) => {
    if (!open) setEdit(null)
  })

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch((prev) => {
        const next = searchInput.trim()
        if (prev !== next) setPage(1)
        return next
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [searchInput])

  useEffect(() => {
    const requestId = ++requestRef.current
    setListLoading(true)
    setListError(null)
    void (async () => {
      try {
        const result = await fetchStopMarkingPage({ search, page, pageSize, showClosed })
        if (requestId !== requestRef.current) return
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
        if (result.rows.length === 0 && result.total > 0 && page > lastPage) {
          setPage(lastPage)
          return
        }
        setRows(result.rows)
        setTotal(result.total)
      } catch (err) {
        if (requestId !== requestRef.current) return
        setListError(formatBisApiError(err))
        setRows([])
        setTotal(0)
      } finally {
        if (requestId === requestRef.current) setListLoading(false)
      }
    })()
  }, [search, page, pageSize, showClosed, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // A case id in the address that is not on this page (closed, deleted) is dropped once the list has loaded.
  useEffect(() => {
    if (editId && editId !== 'new' && !listLoading && !rows.some((r) => r.id === editId)) setEdit(null)
  }, [editId, rows, listLoading, setEdit])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const openAdd = () => {
    setAddForm(emptyStopMarkingAddForm())
    setFormError(null)
    setEdit('new')
  }

  const handleAdd = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const id = await createStopMarkingCase(addForm)
      setMessage('Licence added to Stop Marking.')
      setSearchInput('')
      setSearch('')
      setPage(1)
      reload()
      setEdit(id)
    } catch (err) {
      setFormError(formatBisApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAllOnPage = (checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of rows) {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })

  const handleDeleteSelected = async () => {
    const chosen = rows.filter((r) => selectedIds.has(r.id))
    if (chosen.length === 0) return
    if (!window.confirm(`Delete ${chosen.length} case(s)? Licences still in Stop Marking go back to their earlier status. This cannot be undone.`)) return
    try {
      await deleteStopMarkingCases(chosen)
      setSelectedIds(new Set())
      setMessage(`Deleted ${chosen.length} case(s).`)
      reload()
    } catch (err) {
      setMessage(formatBisApiError(err))
    }
  }

  const handleExport = () => {
    const source = selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : rows
    if (source.length === 0) {
      setMessage('Nothing to export on this page.')
      return
    }
    downloadCsv(
      'bis_stop_marking.csv',
      ['firm', 'cm_l', 'is_code', 'stopped_on', 'reply_due', 'status'],
      source.map((r) => ({
        firm: stopMarkingClientName(r),
        cm_l: formatCmL(r.cm_l_digits),
        is_code: stopMarkingIsCodeLabel(r),
        stopped_on: r.stop_date?.slice(0, 10) ?? '',
        reply_due: r.bis_deadline?.slice(0, 10) ?? '',
        status: stopMarkingStatusLabel(r.status),
      })),
    )
    setMessage(`Exported ${source.length} row(s).`)
  }

  return (
    <div className={limsPageShellClass}>
      <BisProjectsHeaderBar
        title="License in Stop Marking"
        search={searchInput}
        onSearchChange={setSearchInput}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={openAdd}
        addLabel="Add License"
        searchPlaceholder="Search firm, IS code, CM/L…"
        searchAriaLabel="Search by firm, IS code or CM/L number"
      />
      <label className="flex w-fit cursor-pointer items-center gap-2 px-1 text-xs font-medium text-stone-700">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={showClosed}
          onChange={(e) => {
            setShowClosed(e.target.checked)
            setPage(1)
          }}
        />
        Show closed cases
      </label>
      <StopMarkingTable
        rows={rows}
        loading={listLoading}
        error={listError}
        searchActive={search.length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onOpen={(row) => setEdit(row.id)}
        onRetry={reload}
      />
      <BisProjectsFooterBar
        message={message}
        loading={listLoading || saving}
        selectedCount={selectedIds.size}
        totalCount={total}
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        onDeleteSelected={() => void handleDeleteSelected()}
        onExport={handleExport}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number.parseInt(jumpTo, 10)
          if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />
      <StopMarkingAddDialog
        open={adding}
        onOpenChange={handleAddOpenChange}
        form={addForm}
        onChange={setAddForm}
        saving={saving}
        errorMessage={formError}
        onSave={() => void handleAdd()}
      />
      <StopMarkingCaseDialog
        row={openCase}
        onOpenChange={handleCaseOpenChange}
        onUpdated={(row) => setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)))}
        onClosedCase={() => {
          setEdit(null)
          reload()
        }}
      />
    </div>
  )
}
