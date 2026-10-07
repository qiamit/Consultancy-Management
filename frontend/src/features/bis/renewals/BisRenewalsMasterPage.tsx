import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
import { BisProjectsHeaderBar } from '../projects/BisProjectsHeaderBar'
import { BisProjectsFooterBar } from '../projects/BisProjectsFooterBar'
import { BisRenewalsTable } from './BisRenewalsTable'
import { BisRenewalsForm } from './BisRenewalsForm'
import {
  deleteRenewals,
  fetchRenewalProjectSummary,
  fetchRenewalsPage,
  formatBisApiError,
  saveRenewal,
} from './bisRenewalsApi'
import {
  emptyRenewalForm,
  rowToRenewalForm,
  type BisRenewalForm,
  type BisRenewalRow,
} from './types'
import { downloadCsv } from '../shared/downloadCsv'
import { formatCmL } from '../projects/types'
import { emailRenewalFormToClient, printRenewalForm } from './printRenewalForm'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'

const SEARCH_DEBOUNCE_MS = 350

export default function BisRenewalsMasterPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { editId, setEdit } = useMasterUiSearchState()
  const [rows, setRows] = useState<BisRenewalRow[]>([])
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

  const [form, setForm] = useState<BisRenewalForm>(() => emptyRenewalForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [emailBusy, setEmailBusy] = useState(false)

  const requestRef = useRef(0)
  const prefillHandledRef = useRef<string | null>(null)
  const hydratedEditRef = useRef<string | null>(null)

  const showForm = editId != null
  const editingId = editId && editId !== 'new' ? editId : null
  const handleFormOpenChange = useFormDialogOpenChange((open) => {
    if (!open) {
      hydratedEditRef.current = null
      setEdit(null)
    }
  })

  useEffect(() => {
    const projectId = (searchParams.get('projectId') ?? '').trim()
    if (!projectId || prefillHandledRef.current === projectId) return
    prefillHandledRef.current = projectId
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('projectId')
    setSearchParams(nextParams, { replace: true })

    void (async () => {
      try {
        const summary = await fetchRenewalProjectSummary(projectId)
        if (!summary) {
          setMessage('License not found for renewal.')
          return
        }
        setForm({
          ...emptyRenewalForm(),
          projectId,
          projectLabel: summary.projectLabel,
          clientId: summary.clientId,
          clientLabel: summary.clientLabel,
          currentValidity: summary.currentValidity,
          cmLDigits: summary.cmLDigits,
          isCodeLabel: summary.isCodeLabel,
        })
        setFormError(null)
        hydratedEditRef.current = 'new'
        setEdit('new')
        setMessage(`Renewal started for ${summary.projectLabel}.`)
      } catch (err) {
        setMessage(formatBisApiError(err))
      }
    })()
  }, [searchParams, setSearchParams])

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
        const result = await fetchRenewalsPage({ search, page, pageSize })
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
  }, [search, page, pageSize, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    if (!editId) {
      hydratedEditRef.current = null
      return
    }
    if (hydratedEditRef.current === editId) return

    if (editId === 'new') {
      if (!form.projectId) setForm(emptyRenewalForm())
      setFormError(null)
      hydratedEditRef.current = 'new'
      return
    }

    const fromPage = rows.find((r) => r.id === editId)
    if (fromPage) {
      setForm(rowToRenewalForm(fromPage))
      setFormError(null)
      hydratedEditRef.current = editId
      return
    }

    if (!listLoading) setEdit(null)
  }, [editId, rows, listLoading, form.projectId, setEdit])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const canSave = !saving && form.projectId.length > 0 && form.renewalStatus.length > 0

  const openNew = () => {
    setForm(emptyRenewalForm())
    setFormError(null)
    hydratedEditRef.current = 'new'
    setEdit('new')
  }

  const openEdit = (row: BisRenewalRow) => {
    setForm(rowToRenewalForm(row))
    setFormError(null)
    hydratedEditRef.current = row.id
    setEdit(row.id)
  }

  const handleSave = async () => {
    if (!canSave) return
    if (form.newValidityFrom && form.newValidityTo && form.newValidityTo < form.newValidityFrom) {
      setFormError('New validity "to" date cannot be before the "from" date.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await saveRenewal(form, editingId)
      hydratedEditRef.current = null
      setEdit(null)
      setMessage(editingId ? 'Saved changes.' : 'Saved new renewal.')
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

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} renewal(s)? This cannot be undone.`)) return
    setMessage(null)
    try {
      await deleteRenewals(ids)
      setSelectedIds(new Set())
      setMessage(`Deleted ${ids.length} renewal(s).`)
      reload()
    } catch (err) {
      setMessage(formatBisApiError(err))
    }
  }

  const handlePrintRenewal = () => {
    if (selectedIds.size !== 1) {
      setMessage('Select exactly one renewal to print the form.')
      return
    }
    const id = [...selectedIds][0]
    const row = rows.find((r) => r.id === id)
    if (!row) {
      setMessage('Selected renewal is not on this page. Open it or change page.')
      return
    }
    void (async () => {
      setMessage(null)
      const err = await printRenewalForm(row)
      setMessage(err)
    })()
  }

  const handleEmailRenewal = () => {
    if (selectedIds.size !== 1) {
      setMessage('Select exactly one renewal to email the client.')
      return
    }
    const id = [...selectedIds][0]
    const row = rows.find((r) => r.id === id)
    if (!row) {
      setMessage('Selected renewal is not on this page. Open it or change page.')
      return
    }
    void (async () => {
      setEmailBusy(true)
      setMessage(null)
      try {
        setMessage(await emailRenewalFormToClient(row))
      } catch (err) {
        setMessage(formatBisApiError(err))
      } finally {
        setEmailBusy(false)
      }
    })()
  }

  const handleExport = () => {
    const source = selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : rows
    if (source.length === 0) {
      setMessage('Nothing to export on this page.')
      return
    }
    downloadCsv(
      'bis_renewals.csv',
      ['firm', 'cm_l', 'is_code', 'status', 'application_date', 'new_validity_to'],
      source.map((r) => ({
        firm: (r.client?.company_name ?? '').trim(),
        cm_l: formatCmL(r.project?.cm_l_digits),
        is_code: formatIsCodeLabelFromParts(
          r.project?.is_code?.is_number,
          r.project?.is_code?.revision_year,
        ),
        status: r.renewal_status ?? '',
        application_date: r.application_date ?? '',
        new_validity_to: r.new_validity_to ?? '',
      })),
    )
    setMessage(`Exported ${source.length} row(s).`)
  }

  return (
    <div className={limsPageShellClass}>
      <BisProjectsHeaderBar
        title="BIS License Renewals"
        addLabel="Add Renewal"
        search={searchInput}
        onSearchChange={setSearchInput}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={openNew}
      />
      <BisRenewalsTable
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
        onExport={handleExport}
        onPrintList={handlePrintRenewal}
        printListLabel="Print Renewal Form"
        onEmailClient={handleEmailRenewal}
        emailClientLabel="Email Renewal"
        printDocsBusy={emailBusy}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number.parseInt(jumpTo, 10)
          if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />
      <BisRenewalsForm
        open={showForm}
        onOpenChange={handleFormOpenChange}
        editing={editingId != null}
        form={form}
        onChange={setForm}
        canSave={canSave}
        saving={saving}
        errorMessage={formError}
        onSave={() => void handleSave()}
      />
    </div>
  )
}
