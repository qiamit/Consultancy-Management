import { useCallback, useEffect, useRef, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { BisProjectsHeaderBar } from './BisProjectsHeaderBar'
import { BisProjectsTable } from './BisProjectsTable'
import { BisProjectsFooterBar } from './BisProjectsFooterBar'
import { BisProjectsForm } from './BisProjectsForm'
import {
  deleteBisProjects,
  fetchBisProjectsPage,
  formatBisApiError,
  saveBisProject,
} from './bisProjectsApi'
import { printBisProjectsList } from './printBisProjectsList'
import { printBisDocument, type BisPrintDocumentKind } from '../print/printBisDocument'
import {
  BIS_PROJECTS_LIST_TITLES,
  emptyBisProjectForm,
  rowToBisProjectForm,
  type BisProjectForm,
  type BisProjectRow,
  type BisProjectsListMode,
} from './types'

const SEARCH_DEBOUNCE_MS = 350

export default function BisProjectsMasterPage({ listMode }: { listMode: BisProjectsListMode }) {
  const [rows, setRows] = useState<BisProjectRow[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [jumpTo, setJumpTo] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<BisProjectForm>(() => emptyBisProjectForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [printDocsBusy, setPrintDocsBusy] = useState(false)
  const canPrintBisForms = listMode === 'applications' || listMode === 'all'

  const requestRef = useRef(0)

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
        const result = await fetchBisProjectsPage({ listMode, search, page, pageSize })
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
  }, [listMode, search, page, pageSize, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const canSave =
    !saving && form.clientId.length > 0 && form.cmLDigits.length > 0 && form.status.length > 0

  const openNew = () => {
    setEditingId(null)
    setForm(emptyBisProjectForm())
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (row: BisProjectRow) => {
    setEditingId(row.id)
    setForm(rowToBisProjectForm(row))
    setFormError(null)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setFormError(null)
    try {
      await saveBisProject(form, editingId)
      setShowForm(false)
      setEditingId(null)
      setMessage(editingId ? 'Saved changes.' : 'Saved new license.')
      reload()
    } catch (err) {
      setFormError(formatBisApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of rows) {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  const handlePrintList = () => {
    const source =
      selectedIds.size > 0 ? rows.filter((row) => selectedIds.has(row.id)) : rows
    const printError = printBisProjectsList(source, BIS_PROJECTS_LIST_TITLES[listMode], {
      page: Math.min(page, pageCount),
      pageCount,
      selectedCount: selectedIds.size > 0 ? selectedIds.size : undefined,
    })
    if (printError) setMessage(printError)
  }

  const handlePrintDocument = async (row: BisProjectRow | undefined, kind: BisPrintDocumentKind) => {
    if (!row) {
      setMessage('Select a saved row first.')
      return
    }
    setPrintDocsBusy(true)
    try {
      const error = await printBisDocument(row, kind)
      setMessage(error)
    } finally {
      setPrintDocsBusy(false)
    }
  }

  const selectedRow = selectedIds.size === 1 ? rows.find((r) => selectedIds.has(r.id)) : undefined
  const editingRow = editingId ? rows.find((r) => r.id === editingId) : undefined

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} license(s)? This cannot be undone.`)) return
    setMessage(null)
    try {
      await deleteBisProjects(ids)
      setSelectedIds(new Set())
      setMessage(`Deleted ${ids.length} license(s).`)
      reload()
    } catch (err) {
      setMessage(formatBisApiError(err))
    }
  }

  return (
    <div className={limsPageShellClass}>
      <BisProjectsHeaderBar
        title={BIS_PROJECTS_LIST_TITLES[listMode]}
        search={searchInput}
        onSearchChange={setSearchInput}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={openNew}
      />
      <BisProjectsTable
        rows={rows}
        loading={listLoading}
        error={listError}
        searchActive={search.length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={openEdit}
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
        onPrintList={handlePrintList}
        onPrintForm1={
          canPrintBisForms ? () => void handlePrintDocument(selectedRow, 'form1') : undefined
        }
        onPrintAuthLetter={
          canPrintBisForms
            ? () => void handlePrintDocument(selectedRow, 'authorization-letter')
            : undefined
        }
        onPrintDocument={
          canPrintBisForms ? (kind) => void handlePrintDocument(selectedRow, kind) : undefined
        }
        printDocsBusy={printDocsBusy}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number.parseInt(jumpTo, 10)
          if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />
      <BisProjectsForm
        open={showForm}
        onOpenChange={handleFormOpenChange}
        editing={editingId != null}
        form={form}
        onChange={setForm}
        canSave={canSave}
        saving={saving}
        errorMessage={formError}
        onSave={() => void handleSave()}
        onPrintForm1={
          canPrintBisForms ? () => void handlePrintDocument(editingRow, 'form1') : undefined
        }
        onPrintAuthLetter={
          canPrintBisForms
            ? () => void handlePrintDocument(editingRow, 'authorization-letter')
            : undefined
        }
        onPrintDocument={
          canPrintBisForms ? (kind) => void handlePrintDocument(editingRow, kind) : undefined
        }
        printBusy={printDocsBusy}
      />
    </div>
  )
}
