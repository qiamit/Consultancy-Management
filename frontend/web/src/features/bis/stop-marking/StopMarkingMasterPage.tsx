import { useCallback, useEffect, useRef, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'
import { limsDarkBarFieldClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
import { BisProjectsHeaderBar } from '../projects/BisProjectsHeaderBar'
import { BisProjectsFooterBar } from '../projects/BisProjectsFooterBar'
import { formatCmL } from '../projects/types'
import { downloadCsv } from '../shared/downloadCsv'
import { StopMarkingAddDialog } from './StopMarkingAddDialog'
import { StopMarkingEditDialog } from './StopMarkingEditDialog'
import { StopMarkingModuleDialog } from './StopMarkingModuleDialog'
import { openStopMarkingManak } from './stopMarkingManak'
import { emailStopMarkingReplyToClient } from './printStopMarkingReply'
import { StopMarkingTable } from './StopMarkingTable'
import { createStopMarkingCase, deleteStopMarkingCases, fetchStopMarkingCase, fetchStopMarkingPage, formatBisApiError } from './stopMarkingApi'
import {
  emptyStopMarkingAddForm,
  stopMarkingClientName,
  stopMarkingIsCodeLabel,
  stopMarkingStatusLabel,
  type StopMarkingAddForm,
  type StopMarkingRow,
  type StopMarkingStatusFilter,
} from './types'

const SEARCH_DEBOUNCE_MS = 350

/** License Stop Marking: add a licence, review the BIS report, reply with AI help, then resume marking. */
export default function StopMarkingMasterPage() {
  const { editId, viewId, setEdit, setView } = useMasterUiSearchState()
  const [, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<StopMarkingRow[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StopMarkingStatusFilter>('active')
  const [emailBusy, setEmailBusy] = useState(false)
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
  // A case named in the address that is not on this list page (closed, other page, direct link) is fetched by id.
  const [linkedCase, setLinkedCase] = useState<StopMarkingRow | null>(null)
  const findCase = (id: string | null) => (id ? rows.find((r) => r.id === id) ?? (linkedCase?.id === id ? linkedCase : null) : null)
  const editingCase = editId && editId !== 'new' ? findCase(editId) : null
  const moduleCase = findCase(viewId)
  const handleAddOpenChange = useFormDialogOpenChange((open) => {
    if (!open) setEdit(null)
  })
  const handleEditOpenChange = useFormDialogOpenChange((open) => {
    if (!open) setEdit(null)
  })
  const handleModuleOpenChange = useFormDialogOpenChange((open) => {
    if (!open) setView(null)
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
        const result = await fetchStopMarkingPage({ search, page, pageSize, statusFilter })
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
  }, [search, page, pageSize, statusFilter, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // A case id in the address that is not on this page (closed, deleted) is dropped once the list has loaded.
  useEffect(() => {
    const wanted = [editId && editId !== 'new' ? editId : null, viewId].filter((id): id is string => Boolean(id))
    const missing = wanted.find((id) => !rows.some((r) => r.id === id) && linkedCase?.id !== id)
    if (!missing || listLoading) return
    let cancelled = false
    void fetchStopMarkingCase(missing)
      .then((found) => {
        if (cancelled) return
        if (found) setLinkedCase(found)
        else {
          if (missing === editId) setEdit(null)
          if (missing === viewId) setView(null)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [editId, viewId, rows, linkedCase, listLoading, setEdit, setView])

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
      const { id, letterError } = await createStopMarkingCase(addForm)
      setMessage('Licence added to Stop Marking.')
      if (letterError) toast.warning('Case added, but the BIS letter was not uploaded', { description: `${letterError} — attach it again from Edit.` })
      setSearchInput('')
      setSearch('')
      setPage(1)
      reload()
      // One URL update: close the Add dialog and open the new case's module together.
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('edit')
        next.set('view', id)
        return next
      }, { replace: true })
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

  const handleEmailReply = async (row: StopMarkingRow) => {
    setEmailBusy(true)
    setMessage(null)
    try {
      setMessage(await emailStopMarkingReplyToClient(row))
    } catch (err) {
      setMessage(formatBisApiError(err))
    } finally {
      setEmailBusy(false)
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
        showListFilters={false}
        extraFilters={
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as StopMarkingStatusFilter)
              setPage(1)
            }}
          >
            <SelectTrigger className={cn(limsDarkBarFieldClass, 'h-8 w-[min(100%,11.5rem)] shrink-0 px-2 text-[11px] sm:w-[12.5rem] sm:text-xs')} aria-label="Filter by case status" title="Open cases / All cases / Closed cases">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="active">Open Cases</SelectItem>
              <SelectItem value="all">All Cases</SelectItem>
              <SelectItem value="closed">Closed Cases</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <StopMarkingTable
        rows={rows}
        loading={listLoading}
        error={listError}
        searchActive={search.length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={(row) => setEdit(row.id)}
        onModule={(row) => setView(row.id)}
        onManak={(row) => void openStopMarkingManak(row)}
        onEmail={(row) => void handleEmailReply(row)}
        emailBusy={emailBusy}
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
      <StopMarkingEditDialog
        row={editingCase}
        onOpenChange={handleEditOpenChange}
        onUpdated={(row) => {
          setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)))
          setLinkedCase((c) => (c?.id === row.id ? row : c))
        }}
      />
      <StopMarkingModuleDialog
        row={moduleCase}
        onOpenChange={handleModuleOpenChange}
        onUpdated={(row) => {
          setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)))
          setLinkedCase((c) => (c?.id === row.id ? row : c))
        }}
        onClosedCase={() => {
          setView(null)
          reload()
        }}
      />
    </div>
  )
}
