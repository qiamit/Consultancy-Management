import { useCallback, useEffect, useRef, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { BisProjectsHeaderBar } from '../projects/BisProjectsHeaderBar'
import { BisProjectsFooterBar } from '../projects/BisProjectsFooterBar'
import { SampleFailureReplyForm } from './SampleFailureReplyForm'
import { SampleFailureReplyTable } from './SampleFailureReplyTable'
import {
  clearSampleFailureAttachment,
  deleteSampleFailureReplies,
  fetchSampleFailureRepliesPage,
  formatBisApiError,
  openSampleFailureAttachment,
  saveSampleFailureReply,
  uploadSampleFailureAttachment,
  type SampleFailureAttachmentKind,
} from './sampleFailureReplyApi'
import { downloadCsv } from '../shared/downloadCsv'
import { formatCmL } from '../projects/types'
import { emailSampleFailureReplyToClient, printSampleFailureReply } from './printSampleFailureReply'
import {
  emptySampleFailureReplyForm,
  rowToSampleFailureReplyForm,
  sampleFailureClientName,
  sampleFailureIsCodeLabel,
  sampleFailureStatusLabel,
  sampleFailureTypeLabel,
  type SampleFailureReplyForm as SampleFailureReplyFormValue,
  type SampleFailureReplyRow,
} from './types'

const SEARCH_DEBOUNCE_MS = 350

export default function BisSampleFailureReplyMasterPage() {
  const [rows, setRows] = useState<SampleFailureReplyRow[]>([])
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
  const [editingRow, setEditingRow] = useState<SampleFailureReplyRow | null>(null)
  const [form, setForm] = useState<SampleFailureReplyFormValue>(() => emptySampleFailureReplyForm())
  const [saving, setSaving] = useState(false)
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

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
        const result = await fetchSampleFailureRepliesPage({ search, page, pageSize })
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

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const canSave =
    !saving &&
    form.clientId.length > 0 &&
    form.isCodeId.length > 0 &&
    form.sampleFailureType.length > 0

  const openNew = () => {
    setEditingRow(null)
    setForm(emptySampleFailureReplyForm())
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (row: SampleFailureReplyRow) => {
    setEditingRow(row)
    setForm(rowToSampleFailureReplyForm(row))
    setFormError(null)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setFormError(null)
    try {
      await saveSampleFailureReply(form, editingRow?.id ?? null)
      setShowForm(false)
      setMessage(editingRow ? 'Saved changes.' : 'Saved new sample failure reply.')
      setEditingRow(null)
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
    if (!window.confirm(`Delete ${ids.length} sample failure repl${ids.length === 1 ? 'y' : 'ies'}? This cannot be undone.`))
      return
    setMessage(null)
    try {
      await deleteSampleFailureReplies(ids)
      setSelectedIds(new Set())
      setMessage(`Deleted ${ids.length} record(s).`)
      reload()
    } catch (err) {
      setMessage(formatBisApiError(err))
    }
  }

  const handlePrintReply = () => {
    if (selectedIds.size !== 1) {
      setMessage('Select exactly one sample failure reply to print.')
      return
    }
    const id = [...selectedIds][0]
    const row = rows.find((r) => r.id === id)
    if (!row) {
      setMessage('Selected reply is not on this page. Open it or change page.')
      return
    }
    void (async () => {
      setMessage(null)
      setMessage(await printSampleFailureReply(row))
    })()
  }

  const handleEmailReply = () => {
    if (selectedIds.size !== 1) {
      setMessage('Select exactly one sample failure reply to email the client.')
      return
    }
    const id = [...selectedIds][0]
    const row = rows.find((r) => r.id === id)
    if (!row) {
      setMessage('Selected reply is not on this page. Open it or change page.')
      return
    }
    void (async () => {
      setEmailBusy(true)
      setMessage(null)
      try {
        setMessage(await emailSampleFailureReplyToClient(row))
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
      'bis_sample_failure_replies.csv',
      ['firm', 'cm_l', 'is_code', 'type', 'status', 'sample_code'],
      source.map((r) => ({
        firm: sampleFailureClientName(r),
        cm_l: formatCmL(r.cm_l_digits),
        is_code: sampleFailureIsCodeLabel(r),
        type: sampleFailureTypeLabel(r.sample_failure_type),
        status: sampleFailureStatusLabel(r.status),
        sample_code: r.sample_code ?? '',
      })),
    )
    setMessage(`Exported ${source.length} row(s).`)
  }

  const applyEditedRow = (row: SampleFailureReplyRow) => {
    setEditingRow(row)
    setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)))
  }

  const handleUploadAttachment = async (kind: SampleFailureAttachmentKind, file: File) => {
    if (!editingRow) return
    setAttachmentBusy(true)
    setFormError(null)
    try {
      const updated = await uploadSampleFailureAttachment(editingRow.id, kind, file)
      applyEditedRow(updated)
      setMessage('Attachment uploaded.')
    } catch (err) {
      setFormError(formatBisApiError(err))
    } finally {
      setAttachmentBusy(false)
    }
  }

  const handleClearAttachment = async (kind: SampleFailureAttachmentKind) => {
    if (!editingRow) return
    if (!window.confirm('Remove this attachment?')) return
    const path =
      kind === 'failure_letter'
        ? editingRow.failure_letter_path
        : kind === 'offer_letter'
          ? editingRow.offer_letter_path
          : editingRow.factory_test_report_path
    setAttachmentBusy(true)
    setFormError(null)
    try {
      const updated = await clearSampleFailureAttachment(editingRow.id, kind, path)
      applyEditedRow(updated)
      setMessage('Attachment removed.')
    } catch (err) {
      setFormError(formatBisApiError(err))
    } finally {
      setAttachmentBusy(false)
    }
  }

  const handleOpenAttachment = async (path: string) => {
    setFormError(null)
    try {
      await openSampleFailureAttachment(path)
    } catch (err) {
      setFormError(formatBisApiError(err))
    }
  }

  return (
    <div className={limsPageShellClass}>
      <BisProjectsHeaderBar
        title="BIS Sample Failure Reply"
        search={searchInput}
        onSearchChange={setSearchInput}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={openNew}
        addLabel="Add Sample Failure"
        searchPlaceholder="Search firm, IS code, CM/L, sample code…"
        searchAriaLabel="Search by firm, IS code, CM/L number or sample code"
      />
      <SampleFailureReplyTable
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
        loading={listLoading || saving || attachmentBusy}
        selectedCount={selectedIds.size}
        totalCount={total}
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        onDeleteSelected={() => void handleDeleteSelected()}
        onExport={handleExport}
        onPrintList={handlePrintReply}
        printListLabel="Print Reply"
        onEmailClient={handleEmailReply}
        emailClientLabel="Email Reply"
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
      <SampleFailureReplyForm
        open={showForm}
        onOpenChange={handleFormOpenChange}
        editingRow={editingRow}
        form={form}
        onChange={setForm}
        canSave={canSave}
        saving={saving}
        errorMessage={formError}
        onSave={() => void handleSave()}
        attachmentBusy={attachmentBusy}
        onUploadAttachment={(kind, file) => void handleUploadAttachment(kind, file)}
        onClearAttachment={(kind) => void handleClearAttachment(kind)}
        onOpenAttachment={(path) => void handleOpenAttachment(path)}
      />
    </div>
  )
}
