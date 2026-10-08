import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
import { BisProjectsHeaderBar } from './BisProjectsHeaderBar'
import { BisProjectsTable } from './BisProjectsTable'
import { BisProjectsFooterBar } from './BisProjectsFooterBar'
import { BisProjectsForm } from './BisProjectsForm'
import { BisLicenseDocumentsDialog } from './BisLicenseDocumentsDialog'
import { IsCodeDetailsDialog } from '@/features/masters/is-codes/IsCodeDetailsDialog'
import { ClientDetailsDialog } from '@/features/masters/clients/ClientDetailsDialog'
import {
  deleteBisProjects,
  fetchBisProjectById,
  fetchBisProjectsPage,
  formatBisApiError,
  saveBisProject,
  type BisLicenseStatusFilter,
  type BisProjectKindFilter,
  type BisProjectSortDir,
  type BisProjectSortKey,
  type BisQeManagedFilter,
} from './bisProjectsApi'
import { downloadCsv } from '../shared/downloadCsv'
import { printBisProjectsList } from './printBisProjectsList'
import { emailBisDocumentToClient } from '../print/emailBisDocument'
import {
  BIS_FILE_MODULE_KINDS,
  LEGACY_FILE_MODULE_ALIASES,
  printBisDocument,
  type BisPrintDocumentKind,
} from '../print/printBisDocument'
import {
  BIS_PROJECTS_LIST_TITLES,
  clientDisplayName,
  defaultProjectKindForListMode,
  emptyBisProjectForm,
  formatCmL,
  isCodeDisplayLabel,
  rowToBisProjectForm,
  type BisProjectForm,
  type BisProjectRow,
  type BisProjectsListMode,
} from './types'

const SEARCH_DEBOUNCE_MS = 350

export default function BisProjectsMasterPage({ listMode }: { listMode: BisProjectsListMode }) {
  const navigate = useNavigate()
  const {
    editId,
    viewId,
    moduleSlug,
    detailId,
    clientId,
    setEdit,
    setView,
    setModule,
    setDetail,
    setClient,
  } = useMasterUiSearchState({ detailKey: 'isCode' })

  const [rows, setRows] = useState<BisProjectRow[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [qeManagedFilter, setQeManagedFilter] = useState<BisQeManagedFilter>('managed')
  const [projectKindFilter, setProjectKindFilter] = useState<BisProjectKindFilter>('all')
  const [licenseStatusFilter, setLicenseStatusFilter] =
    useState<BisLicenseStatusFilter>('all')
  /** Least days remaining on License Validity first. */
  const [sortKey, setSortKey] = useState<BisProjectSortKey>('validity')
  const [sortDir, setSortDir] = useState<BisProjectSortDir>('asc')
  const [jumpTo, setJumpTo] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const showListFilters = listMode !== 'applications' && listMode !== 'inclusion'

  const handleSort = (key: BisProjectSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // New column: ascending (validity = least days remaining first).
      setSortDir('asc')
    }
    setPage(1)
  }

  const showForm = editId != null
  const editingId = editId && editId !== 'new' ? editId : null
  const [form, setForm] = useState<BisProjectForm>(() => emptyBisProjectForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const hydratedEditRef = useRef<string | null>(null)

  const [printDocsBusy, setPrintDocsBusy] = useState(false)
  /** Form-I / Auth / More BIS pack — available on any project list that selects one row. */
  const canPrintBisForms = true
  const [documentsRow, setDocumentsRow] = useState<BisProjectRow | null>(null)
  const hydratedViewRef = useRef<string | null>(null)

  const requestRef = useRef(0)

  const buildNewForm = useCallback((): BisProjectForm => {
    const next = emptyBisProjectForm(defaultProjectKindForListMode(listMode))
    if (listMode === 'stop_marking') next.status = 'stop_marking'
    if (listMode === 'our') next.isQeManaged = true
    return next
  }, [listMode])

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
        const result = await fetchBisProjectsPage({
          listMode,
          search,
          page,
          pageSize,
          qeManagedFilter: showListFilters ? qeManagedFilter : 'all',
          projectKindFilter: showListFilters ? projectKindFilter : 'all',
          licenseStatusFilter: showListFilters ? licenseStatusFilter : 'all',
          sortKey,
          sortDir,
        })
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
  }, [
    listMode,
    search,
    page,
    pageSize,
    reloadKey,
    qeManagedFilter,
    projectKindFilter,
    licenseStatusFilter,
    showListFilters,
    sortKey,
    sortDir,
  ])

  // Restore Add/Edit form from URL (refresh-safe).
  useEffect(() => {
    if (!editId) {
      hydratedEditRef.current = null
      return
    }
    if (hydratedEditRef.current === editId) return

    if (editId === 'new') {
      setForm(buildNewForm())
      setFormError(null)
      hydratedEditRef.current = 'new'
      return
    }

    const fromPage = rows.find((r) => r.id === editId)
    if (fromPage) {
      setForm(rowToBisProjectForm(fromPage))
      setFormError(null)
      hydratedEditRef.current = editId
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const row = await fetchBisProjectById(editId)
        if (cancelled) return
        if (!row) {
          setEdit(null)
          return
        }
        setForm(rowToBisProjectForm(row))
        setFormError(null)
        hydratedEditRef.current = editId
      } catch (err) {
        if (cancelled) return
        setMessage(formatBisApiError(err))
        setEdit(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editId, rows, buildNewForm, setEdit])

  // Restore View Documents from URL (refresh-safe).
  useEffect(() => {
    if (!viewId) {
      setDocumentsRow(null)
      hydratedViewRef.current = null
      return
    }
    if (documentsRow?.id === viewId) {
      hydratedViewRef.current = viewId
      return
    }
    if (hydratedViewRef.current === viewId && documentsRow?.id === viewId) return

    const fromPage = rows.find((r) => r.id === viewId)
    if (fromPage) {
      setDocumentsRow(fromPage)
      hydratedViewRef.current = viewId
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const row = await fetchBisProjectById(viewId)
        if (cancelled) return
        if (!row) {
          setView(null)
          return
        }
        setDocumentsRow(row)
        hydratedViewRef.current = viewId
      } catch (err) {
        if (cancelled) return
        setMessage(formatBisApiError(err))
        setView(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [viewId, rows, documentsRow?.id, setView])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const refreshDocumentsRow = useCallback(async () => {
    if (!viewId) return
    reload()
    try {
      const row = await fetchBisProjectById(viewId)
      if (row) setDocumentsRow(row)
    } catch {
      /* list reload still runs */
    }
  }, [viewId, reload])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const isApplicationProject =
    form.projectKind.trim().toLowerCase() === 'application'
  const canSave =
    !saving &&
    form.clientId.length > 0 &&
    form.status.length > 0 &&
    // CM/L + Validity required for License (not for Application).
    (isApplicationProject ||
      (form.cmLDigits.length > 0 && form.licenseValidityDate.trim().length > 0))

  const openNew = () => {
    setForm(buildNewForm())
    setFormError(null)
    hydratedEditRef.current = 'new'
    setEdit('new')
  }

  const openEdit = (row: BisProjectRow) => {
    setForm(rowToBisProjectForm(row))
    setFormError(null)
    hydratedEditRef.current = row.id
    setEdit(row.id)
  }

  const openDocuments = (row: BisProjectRow) => {
    setDocumentsRow(row)
    hydratedViewRef.current = row.id
    setView(row.id)
  }

  const handleFormOpenChange = useFormDialogOpenChange((open) => {
    if (!open) {
      hydratedEditRef.current = null
      setEdit(null)
    }
  })

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setFormError(null)
    try {
      await saveBisProject(form, editingId)
      hydratedEditRef.current = null
      setEdit(null)
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

  const handleExport = () => {
    const source = selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : rows
    if (source.length === 0) {
      setMessage('Nothing to export on this page.')
      return
    }
    const headers = [
      'firm',
      'cm_l',
      'is_code',
      'project_kind',
      'status',
      'license_number',
      'validity',
      'application_number',
    ]
    downloadCsv(
      `bis_${listMode}.csv`,
      headers,
      source.map((r) => ({
        firm: clientDisplayName(r),
        cm_l: formatCmL(r.cm_l_digits),
        is_code: isCodeDisplayLabel(r),
        project_kind: r.project_kind ?? '',
        status: r.status ?? '',
        license_number: r.license_number ?? '',
        validity: r.license_validity_date ?? '',
        application_number: r.application_number ?? '',
      })),
    )
    setMessage(`Exported ${source.length} row(s).`)
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

  const handleEmailDocument = async (
    row: BisProjectRow | undefined,
    kind: BisPrintDocumentKind,
  ) => {
    if (!row) {
      setMessage('Select exactly one license to email the client.')
      return
    }
    setPrintDocsBusy(true)
    setMessage(null)
    try {
      setMessage(await emailBisDocumentToClient(row, kind))
    } catch (err) {
      setMessage(formatBisApiError(err))
    } finally {
      setPrintDocsBusy(false)
    }
  }

  const selectedRow = selectedIds.size === 1 ? rows.find((r) => selectedIds.has(r.id)) : undefined
  const editingRow =
    editingId != null
      ? (rows.find((r) => r.id === editingId) ??
        (documentsRow?.id === editingId ? documentsRow : undefined))
      : undefined

  const handleStartRenewal = () => {
    if (!selectedRow) {
      setMessage('Select exactly one license to start renewal.')
      return
    }
    navigate(`/bis/license-renewals?projectId=${encodeURIComponent(selectedRow.id)}`)
  }

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
    <div
      data-master-scroll="table"
      className={cn(
        limsPageShellClass,
        'flex h-full min-h-0 flex-col overflow-hidden !space-y-0 gap-2 sm:gap-3 md:gap-3',
      )}
    >
      <div className="shrink-0">
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
          showListFilters={showListFilters}
          qeManagedFilter={qeManagedFilter}
          onQeManagedFilterChange={(value) => {
            setQeManagedFilter(value)
            setPage(1)
          }}
          projectKindFilter={projectKindFilter}
          onProjectKindFilterChange={(value) => {
            setProjectKindFilter(value)
            setPage(1)
          }}
          licenseStatusFilter={licenseStatusFilter}
          onLicenseStatusFilterChange={(value) => {
            setLicenseStatusFilter(value)
            setPage(1)
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <BisProjectsTable
          rows={rows}
          loading={listLoading}
          error={listError}
          searchActive={search.length > 0}
          selectedIds={selectedIds}
          onToggle={toggleRow}
          onToggleAll={toggleAllOnPage}
          onEdit={openEdit}
          onViewDocuments={openDocuments}
          onEmailDocument={
            canPrintBisForms
              ? (row, kind) => void handleEmailDocument(row, kind)
              : undefined
          }
          emailBusy={printDocsBusy}
          onOpenIsCode={(isCodeId) => setDetail(isCodeId)}
          onOpenClient={(id) => setClient(id)}
          onRetry={reload}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      </div>

      <div className="shrink-0">
        <BisProjectsFooterBar
          message={message}
          loading={listLoading || saving}
          selectedCount={selectedIds.size}
          totalCount={total}
          page={Math.min(page, pageCount)}
          pageCount={pageCount}
          onDeleteSelected={() => void handleDeleteSelected()}
          onExport={handleExport}
          onPrintList={handlePrintList}
          onStartRenewal={
            listMode === 'due_soon' || listMode === 'expired' ? handleStartRenewal : undefined
          }
          onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
          jumpTo={jumpTo}
          onJumpToChange={setJumpTo}
          onJumpToGo={() => {
            const n = Number.parseInt(jumpTo, 10)
            if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
          }}
        />
      </div>

      <BisProjectsForm
        open={showForm}
        onOpenChange={handleFormOpenChange}
        editing={editingId != null}
        projectId={editingId}
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
        onEmailDocument={
          canPrintBisForms ? (kind) => void handleEmailDocument(editingRow, kind) : undefined
        }
        printBusy={printDocsBusy}
      />

      <BisLicenseDocumentsDialog
        open={viewId != null}
        onOpenChange={(next) => {
          if (!next) {
            // Ignore dismiss while URL still has view= but row is still hydrating —
            // otherwise refresh races clear view+module and dump to the list.
            if (viewId && !documentsRow) return
            hydratedViewRef.current = null
            setView(null)
          }
        }}
        row={documentsRow}
        busy={printDocsBusy || (viewId != null && documentsRow == null)}
        onViewDocument={(kind) => void handlePrintDocument(documentsRow ?? undefined, kind)}
        moduleKind={(() => {
          if (!moduleSlug || !documentsRow) return null
          const resolved =
            LEGACY_FILE_MODULE_ALIASES[moduleSlug] ??
            (moduleSlug as BisPrintDocumentKind)
          return BIS_FILE_MODULE_KINDS.includes(resolved) ? resolved : null
        })()}
        onModuleKindChange={(kind) => setModule(kind)}
        onProjectSaved={() => void refreshDocumentsRow()}
      />

      <IsCodeDetailsDialog
        open={detailId != null}
        onOpenChange={(next) => {
          if (!next) setDetail(null)
        }}
        isCodeId={detailId}
        onSaved={reload}
      />

      <ClientDetailsDialog
        open={clientId != null}
        onOpenChange={(next) => {
          if (!next) setClient(null)
        }}
        clientId={clientId}
        onSaved={reload}
      />
    </div>
  )
}
