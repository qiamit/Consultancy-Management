import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { useNavigate } from 'react-router-dom'
import { Select, SelectContent, selectFitTriggerClass, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { limsDarkBarFieldClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { fetchOpenNoticeCounts } from './bisOpenNotices'
import { cn } from '@/lib/utils'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
import { BisProjectsHeaderBar } from './BisProjectsHeaderBar'
import { BisProjectsTable } from './BisProjectsTable'
import { BisProjectsFooterBar } from './BisProjectsFooterBar'
import { BisProjectsForm } from './BisProjectsForm'
import { BisLicenseDocumentsDialog } from './BisLicenseDocumentsDialog'
import { RenewalRemindersDialog } from '../renewals/RenewalRemindersDialog'
import { RenewalReminderSendDialog } from '../renewals/RenewalReminderSendDialog'
import { IsCodeDetailsDialog } from '@/features/masters/is-codes/IsCodeDetailsDialog'
import { ClientDetailsDialog } from '@/features/masters/clients/ClientDetailsDialog'
import {
  cancelInclusion,
  deleteBisProjects,
  fetchBisProjectById,
  fetchInclusionNewScope,
  fetchBisProjectsPage,
  formatBisApiError,
  saveBisProject,
  type BisLicenseStatusFilter,
  type BisProjectKindFilter,
  type BisProjectSortDir,
  type BisProjectSortKey,
  type BisQeManagedFilter,
  type BisSchemeFilter,
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
  bisLicenseFormIssue,
  clientDisplayName,
  defaultProjectKindForListMode,
  emptyBisProjectForm,
  formatCmL,
  isCodeDisplayLabel,
  isInclusionKind,
  rowToBisProjectForm,
  sanitizeBisLicenseScopeNotes,
  type BisProjectForm,
  type BisProjectRow,
  type BisProjectsListMode,
} from './types'

const SEARCH_DEBOUNCE_MS = 350

/**
 * Inclusion form: the editable notes are the New Scope (inclusion-details.newScope), never the live licence
 * scope. The licence's own fields (QE managed, billing …) are left as loaded; the inclusion save does not
 * write them.
 */
function formForListMode(
  form: BisProjectForm,
  listMode: BisProjectsListMode,
  newScope?: string,
): BisProjectForm {
  if (listMode !== 'inclusion') return form
  return {
    ...form,
    projectKind: 'Inclusion',
    ...(newScope !== undefined ? { notes: sanitizeBisLicenseScopeNotes(newScope) } : {}),
  }
}

export default function BisProjectsMasterPage({ listMode }: { listMode: BisProjectsListMode }) {
  const navigate = useNavigate()
  const [confirm, confirmDialog] = useConfirmDialog()
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
  } = useMasterUiSearchState({
    detailKey: 'isCode',
  })

  const [rows, setRows] = useState<BisProjectRow[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [reminderRow, setReminderRow] = useState<BisProjectRow | null>(null)
  const [remindersOpen, setRemindersOpen] = useState(false)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [qeManagedFilter, setQeManagedFilter] = useState<BisQeManagedFilter>('managed')
  const [schemeFilter, setSchemeFilter] = useState<BisSchemeFilter>('all')
  const [openNoticeFilter, setOpenNoticeFilter] = useState<'all' | 'open'>('all')
  const [noticeCounts, setNoticeCounts] = useState<Record<string, number>>({})
  const [projectKindFilter, setProjectKindFilter] = useState<BisProjectKindFilter>('all')
  const [licenseStatusFilter, setLicenseStatusFilter] =
    useState<BisLicenseStatusFilter>('all')
  /** Least days remaining on License Validity first. */
  const [sortKey, setSortKey] = useState<BisProjectSortKey>('validity')
  const [sortDir, setSortDir] = useState<BisProjectSortDir>('asc')
  const [jumpTo, setJumpTo] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const showListFilters =
    listMode !== 'applications' && listMode !== 'inclusion' && listMode !== 'due_soon'

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
  /** Inclusion list: New Scope loaded for this licence id (the form cannot be saved before). */
  const inclusionScopeRef = useRef<{ id: string; notes: string } | null>(null)
  const [inclusionScopeLoadedId, setInclusionScopeLoadedId] = useState<string | null>(null)

  const [printDocsBusy, setPrintDocsBusy] = useState(false)
  /** Form-I / Auth / More BIS pack — available on any project list that selects one row. */
  const canPrintBisForms = true
  const [documentsRow, setDocumentsRow] = useState<BisProjectRow | null>(null)
  const hydratedViewRef = useRef<string | null>(null)

  const requestRef = useRef(0)

  const formFromRow = useCallback((row: BisProjectRow): BisProjectForm => {
    const scope = inclusionScopeRef.current
    // New Scope not loaded yet → empty (Save waits for the load below).
    return formForListMode(
      rowToBisProjectForm(row),
      listMode,
      scope?.id === row.id ? scope.notes : emptyBisProjectForm().notes,
    )
  }, [listMode])

  const buildNewForm = useCallback((): BisProjectForm => {
    const next = emptyBisProjectForm(defaultProjectKindForListMode(listMode))
    if (listMode === 'stop_marking') next.status = 'stop_marking'
    if (listMode === 'our') next.isQeManaged = true
    return formForListMode(next, listMode)
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
          qeManagedFilter: listMode === 'due_soon' ? 'managed' : showListFilters ? qeManagedFilter : 'all',
          schemeFilter,
          projectKindFilter: showListFilters ? projectKindFilter : 'all',
          licenseStatusFilter: showListFilters ? licenseStatusFilter : 'all',
          openNoticeFilter: showListFilters ? openNoticeFilter : 'all',
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
    schemeFilter,
    projectKindFilter,
    licenseStatusFilter,
    openNoticeFilter,
    showListFilters,
    sortKey,
    sortDir,
  ])

  // Open BIS notices per licence on this page (badge on the row).
  useEffect(() => {
    let cancelled = false
    void fetchOpenNoticeCounts(rows.map((r) => r.id))
      .then((counts) => {
        if (!cancelled) setNoticeCounts(counts)
      })
      .catch(() => {
        if (!cancelled) setNoticeCounts({})
      })
    return () => {
      cancelled = true
    }
  }, [rows])

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
      setForm(formFromRow(fromPage))
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
        setForm(formFromRow(row))
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
  }, [editId, rows, buildNewForm, formFromRow, setEdit])

  // Inclusion list: load the New Scope of the licence being edited (inclusion-details.newScope).
  useEffect(() => {
    if (listMode !== 'inclusion' || !editId || editId === 'new') return
    let cancelled = false
    void fetchInclusionNewScope(editId)
      .then((notes) => {
        if (cancelled) return
        inclusionScopeRef.current = { id: editId, notes }
        setForm((prev) => (hydratedEditRef.current === editId
          ? { ...prev, notes: sanitizeBisLicenseScopeNotes(notes) }
          : prev))
        setInclusionScopeLoadedId(editId)
      })
      .catch((err) => {
        if (!cancelled) setFormError(`Could Not Load the New Scope: ${formatBisApiError(err)}`)
      })
    return () => {
      cancelled = true
      // Reopening must load again: a scope saved meanwhile would otherwise be overwritten by this copy.
      inclusionScopeRef.current = null
      setInclusionScopeLoadedId(null)
    }
  }, [listMode, editId])

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
  const isInclusionMode = listMode === 'inclusion'
  // Inclusion: CM/L, dates and the rest belong to the licence and are not edited here.
  const formIssue = isInclusionMode ? null : bisLicenseFormIssue(form)
  const canSave =
    !saving &&
    form.clientId.length > 0 &&
    form.status.length > 0 &&
    !formIssue &&
    // CM/L + Validity required for License (not for Application).
    (isApplicationProject ||
      (form.cmLDigits.length > 0 && (isInclusionMode || form.licenseValidityDate.trim().length > 0))) &&
    // Inclusion saves on a selected licence once its New Scope has loaded.
    (!isInclusionMode || (editingId != null && inclusionScopeLoadedId === editingId))

  const openNew = () => {
    setForm(buildNewForm())
    setFormError(null)
    hydratedEditRef.current = 'new'
    setEdit('new')
  }

  const openEdit = (row: BisProjectRow) => {
    setForm(formFromRow(row))
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
      await saveBisProject(formForListMode(form, listMode), editingId)
      hydratedEditRef.current = null
      setEdit(null)
      setMessage(isInclusionMode
        ? 'Inclusion saved on the existing license.'
        : editingId ? 'Saved changes.' : form.projectKind.trim().toLowerCase() === 'application' ? 'Saved new application.' : 'Saved new license.')
      reload()
    } catch (err) {
      setFormError(formatBisApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleFinishInclusion = async () => {
    if (!isInclusionMode || !editingId || !canSave || saving) return
    setSaving(true)
    setFormError(null)
    try {
      await saveBisProject(formForListMode(form, listMode), editingId, true)
      hydratedEditRef.current = null
      setEdit(null)
      setMessage('Inclusion completed. Updates are saved on the existing license.')
      reload()
    } catch (err) {
      setFormError(formatBisApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleSelectExistingLicenseForInclusion = (row: BisProjectRow) => {
    const nextId = row.id
    // Existing scope stays in ExistingLicenseScope; this field is only the new scope to set.
    setForm(formFromRow(row))
    setFormError(null)
    hydratedEditRef.current = nextId
    setEdit(nextId)
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
  const handleStartRenewal = () => {
    if (!selectedRow) {
      setMessage('Select exactly one license to start renewal.')
      return
    }
    navigate(`/bis/license-renewals?projectId=${encodeURIComponent(selectedRow.id)}`)
  }

  const startRenewalForRow = (row: BisProjectRow) => {
    navigate(`/bis/license-renewals?view=applications&projectId=${encodeURIComponent(row.id)}`)
  }

  const prepareRenewalReminder = (row: BisProjectRow) => {
    setReminderRow(row)
  }

  /** Inclusion list: closes the inclusion on each selected licence. The licence itself is never deleted. */
  const handleCancelInclusions = async () => {
    const selected = rows.filter((r) => selectedIds.has(r.id))
    if (selected.length === 0) return
    // Old separate Inclusion rows are not licences; only inclusions running on a licence can be cancelled.
    const licences = selected.filter((r) => !isInclusionKind(r.project_kind))
    const skipped = selected.length - licences.length
    if (licences.length === 0) {
      setMessage('Old Inclusion Records Cannot Be Cancelled Here.')
      return
    }
    if (!(await confirm(`Cancel the Inclusion on ${licences.length} License(s)? The License and Its Scope Stay as They Are.`, { title: 'Cancel Inclusion', confirmLabel: 'Cancel Inclusion', destructive: false }))) return
    setMessage(null)
    try {
      for (const row of licences) await cancelInclusion(row.id)
      setSelectedIds(new Set())
      setMessage(`Cancelled ${licences.length} Inclusion(s).${skipped ? ` ${skipped} Old Inclusion Record(s) Skipped.` : ''}`)
      reload()
    } catch (err) {
      setMessage(formatBisApiError(err))
      reload()
    }
  }

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!(await confirm(`Delete ${ids.length} License(s)? This Cannot Be Undone.`, { title: 'Delete Licenses', confirmLabel: 'Delete', destructive: true }))) return
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
        'bis-projects-responsive-page flex h-full min-h-0 flex-col overflow-hidden !space-y-0 gap-2 sm:gap-3 md:gap-3',
      )}
    >
      {confirmDialog}
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
          onNew={listMode === 'due_soon' ? undefined : openNew}
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
          extraFilters={
            <>
            <Select
              value={schemeFilter}
              onValueChange={(v) => {
                setSchemeFilter(v as BisSchemeFilter)
                setPage(1)
              }}
            >
              <SelectTrigger className={cn(limsDarkBarFieldClass, 'bis-projects-filter-trigger h-8 w-[min(100%,8.5rem)] shrink-0 px-2 text-[11px] sm:w-[9.5rem] sm:text-xs')} aria-label="Filter by Scheme" title="Domestic / FMCS (Foreign Manufacturers)">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end" className={selectFitTriggerClass}>
                <SelectItem value="all">All Schemes</SelectItem>
                <SelectItem value="domestic">Domestic</SelectItem>
                <SelectItem value="fmcs">FMCS</SelectItem>
              </SelectContent>
            </Select>
            {showListFilters ? (
              <Select
                value={openNoticeFilter}
                onValueChange={(v) => {
                  setOpenNoticeFilter(v as 'all' | 'open')
                  setPage(1)
                }}
              >
                <SelectTrigger className={cn(limsDarkBarFieldClass, 'bis-projects-filter-trigger h-8 w-[min(100%,10.5rem)] shrink-0 px-2 text-[11px] sm:w-[11.5rem] sm:text-xs')} aria-label="Filter by open BIS notice" title="All Licences / Licences with an Open BIS Notice">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" className={selectFitTriggerClass}>
                  <SelectItem value="all">All Notice Status</SelectItem>
                  <SelectItem value="open">With Open Notice</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            </>
          }
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
          renewalMode={listMode === 'due_soon'}
          inclusionMode={listMode === 'inclusion'}
          noticeCounts={noticeCounts}
          onStartRenewal={startRenewalForRow}
          onRenewalReminder={prepareRenewalReminder}
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
          onDeleteSelected={() => void (isInclusionMode ? handleCancelInclusions() : handleDeleteSelected())}
          deleteLabel={isInclusionMode ? 'Cancel Inclusion' : undefined}
          deleteTitle={isInclusionMode ? 'Cancel the Inclusion on the Selected License(s)' : undefined}
          onExport={handleExport}
          onPrintList={handlePrintList}
          onStartRenewal={
            listMode === 'due_soon' || listMode === 'expired' ? handleStartRenewal : undefined
          }
          onAutoReminders={listMode === 'due_soon' ? () => setRemindersOpen(true) : undefined}
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
        validationMessage={formIssue}
        onSave={() => void handleSave()}
        onCompleteInclusion={isInclusionMode ? () => void handleFinishInclusion() : undefined}
        onExistingLicenseSelected={isInclusionMode ? handleSelectExistingLicenseForInclusion : undefined}
        inclusionMode={listMode === 'inclusion'}
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
        inclusionMode={listMode === 'inclusion'}
      />

      <RenewalReminderSendDialog row={reminderRow} onOpenChange={(next) => { if (!next) setReminderRow(null) }} />
      <RenewalRemindersDialog open={remindersOpen} onOpenChange={setRemindersOpen} />

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
