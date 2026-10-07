import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Eye, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsFieldClass, limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { TopManagementModulePayload } from './bisModuleDataApi'
import type { TopManagementRow } from '../print/topManagementHtml'
import {
  createBisProjectFileUrls,
  deleteBisProjectFile,
  formatBisProjectFilesError,
  uploadBisProjectFile,
} from './bisProjectFilesApi'
import { removeSignatureImageBackground } from './removeSignatureBackground'

const SIGNATURE_DOC_KIND = 'top-management-signature'
const AUTHORIZED_SIGNATURE_DOC_KIND = 'top-management-authorized-signature'
const AUTHORIZED_UPLOAD_INDEX = -1
const SIGNATURE_ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf'

const AUTHORIZED_BY_NONE = '__none__'

function hasSignatoryData(value: TopManagementModulePayload): boolean {
  return Boolean(
    value.includeAuthorizedSignatory ||
      value.authorizedSignatoryName.trim() ||
      value.authorizedSignatoryDesignation.trim() ||
      value.authorizedSignatoryEmail.trim() ||
      value.authorizedSignatoryMobile.trim() ||
      value.authorizedBy.trim() ||
      value.authorizedSignatureFileId.trim() ||
      value.authorizedSignatureStoragePath.trim() ||
      value.applyAuthorizedSignatureToDocuments,
  )
}

const EMPTY_ROW = (): TopManagementRow => ({
  personName: '',
  designation: '',
  email: '',
  mobile: '',
  signatureFileId: '',
  signatureFileName: '',
  signatureStoragePath: '',
  applySignatureToDocuments: false,
})

const sigActionBtnClass = cn(
  limsOutlineBtnClass,
  'inline-flex h-7 w-7 items-center justify-center p-0',
)

function isRowFilled(row: TopManagementRow): boolean {
  return Boolean(
    row.personName.trim() ||
      row.designation.trim() ||
      row.email.trim() ||
      row.mobile.trim(),
  )
}

/** ~10″ / desktop: row table. Below that: stacked cards. */
const TABLE_MQ_SHOW = 'hidden lg:block'
const CARDS_MQ_SHOW = 'lg:hidden'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
const tdClass = 'px-1.5 py-1.5 text-center align-middle'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
const actionBtnClass =
  'h-7 w-7 rounded-none p-0 text-amber-800 hover:bg-amber-100 hover:text-amber-950'
const deleteBtnClass =
  'h-7 w-7 rounded-none p-0 text-red-700 hover:bg-red-50 hover:text-red-900'
const cellInputClass = cn(limsFieldClass, 'h-8 min-w-0 text-xs sm:text-sm')
/** Fits a 10-digit mobile number without clipping (padding + tabular digits). */
const mobileInputClass = cn(cellInputClass, 'px-2 text-center tabular-nums tracking-wide')
/** Slightly tighter horizontal padding so longer emails fit the column. */
const emailInputClass = cn(cellInputClass, 'px-2 text-left')
const cardFieldLabelClass =
  'mb-1 text-[10px] font-bold uppercase tracking-wide text-stone-500'

type SignatureUrlCache = Record<string, { viewUrl?: string; downloadUrl?: string }>

export function TopManagementModuleFields({
  value,
  onChange,
  disabled = false,
  projectId = null,
}: {
  value: TopManagementModulePayload
  onChange: (next: TopManagementModulePayload) => void
  disabled?: boolean
  projectId?: string | null
}) {
  const rows = value.rows.length > 0 ? value.rows : [EMPTY_ROW()]
  const [selected, setSelected] = useState(() => new Set<number>())
  /** Non-last filled row unlocked for editing (last row is always editable). */
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [showSignatory, setShowSignatory] = useState(() => hasSignatoryData(value))
  const [signatureBusyIndex, setSignatureBusyIndex] = useState<number | null>(null)
  const [urlCache, setUrlCache] = useState(() => ({} as SignatureUrlCache))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingUploadIndex = useRef<number | null>(null)

  const authorizedKey = [
    value.includeAuthorizedSignatory ? '1' : '0',
    value.authorizedSignatoryName,
    value.authorizedSignatoryDesignation,
    value.authorizedSignatoryEmail,
    value.authorizedSignatoryMobile,
    value.authorizedBy,
    value.authorizedSignatureFileId,
    value.authorizedSignatureStoragePath,
    value.applyAuthorizedSignatureToDocuments ? '1' : '0',
  ].join('\0')

  const signatureKey = [
    ...rows.map((r) => `${r.signatureFileId}:${r.signatureStoragePath}`),
    `auth:${value.authorizedSignatureFileId}:${value.authorizedSignatureStoragePath}`,
  ].join('|')

  const availableNames = useMemo(() => {
    const seen = new Set<string>()
    const names: string[] = []
    for (const row of rows) {
      const name = row.personName.trim()
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      names.push(name)
    }
    return names
  }, [rows])

  useEffect(() => {
    if (hasSignatoryData(value)) setShowSignatory(true)
  }, [authorizedKey, value])

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<number>()
      for (const i of prev) {
        if (i >= 0 && i < rows.length) next.add(i)
      }
      return next.size === prev.size ? prev : next
    })
    setEditingIndex((prev) => (prev != null && prev < rows.length - 1 ? prev : null))
  }, [rows.length])

  useEffect(() => {
    let cancelled = false
    const targets: Array<{ id: string; path: string; name: string }> = rows
      .filter((r) => r.signatureStoragePath.trim() && r.signatureFileId.trim())
      .map((r) => ({
        id: r.signatureFileId,
        path: r.signatureStoragePath,
        name: r.signatureFileName || 'signature',
      }))
    if (
      value.authorizedSignatureFileId.trim() &&
      value.authorizedSignatureStoragePath.trim()
    ) {
      targets.push({
        id: value.authorizedSignatureFileId,
        path: value.authorizedSignatureStoragePath,
        name: value.authorizedSignatureFileName || 'authorized-signature',
      })
    }
    if (targets.length === 0) return
    void (async () => {
      const entries = await Promise.all(
        targets.map(async (t) => {
          try {
            const urls = await createBisProjectFileUrls(t.path, t.name)
            return [t.id, urls] as const
          } catch {
            return [t.id, {}] as const
          }
        }),
      )
      if (cancelled) return
      setUrlCache((prev) => {
        const next = { ...prev }
        for (const [id, urls] of entries) next[id] = urls
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [signatureKey, rows, value.authorizedSignatureFileId, value.authorizedSignatureFileName, value.authorizedSignatureStoragePath])

  const setRows = (nextRows: TopManagementRow[]) => {
    onChange({ ...value, rows: nextRows.length > 0 ? nextRows : [EMPTY_ROW()] })
  }

  const setRow = (index: number, key: keyof TopManagementRow, raw: string) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, [key]: raw } : row)))
  }

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index))
    setSelected((prev) => {
      const next = new Set<number>()
      for (const i of prev) {
        if (i === index) continue
        next.add(i > index ? i - 1 : i)
      }
      return next
    })
    setEditingIndex((prev) => {
      if (prev == null) return null
      if (prev === index) return null
      return prev > index ? prev - 1 : prev
    })
  }

  const addRow = () => {
    const last = rows[rows.length - 1]
    if (!last || !isRowFilled(last)) return
    setEditingIndex(null)
    setRows([...rows, EMPTY_ROW()])
  }

  const toggleSelected = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const allSelected = rows.length > 0 && rows.every((_, i) => selected.has(i))
  const someSelected = rows.some((_, i) => selected.has(i))

  const applyAuthorizedBy = (name: string) => {
    // Only set Authorized By — do not overwrite Authorized Person fields.
    onChange({
      ...value,
      authorizedBy: name,
    })
  }

  const patchRowSignature = (
    index: number,
    patch: Pick<
      TopManagementRow,
      'signatureFileId' | 'signatureFileName' | 'signatureStoragePath'
    >,
  ) => {
    setRows(
      rows.map((row, i) =>
        i === index
          ? {
              ...row,
              ...patch,
            }
          : row,
      ),
    )
  }

  const openSignaturePicker = (index: number) => {
    if (!projectId || disabled) {
      toast.warning('Save the license first, then attach signatures.')
      return
    }
    pendingUploadIndex.current = index
    fileInputRef.current?.click()
  }

  const handleSignaturePicked = async (file: File | undefined) => {
    const index = pendingUploadIndex.current
    pendingUploadIndex.current = null
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (index == null || !file || !projectId) return

    setSignatureBusyIndex(index)
    try {
      // Strip white/paper background before storing so stamp/sign sits clean on documents.
      const uploadFile = await removeSignatureImageBackground(file)

      if (index === AUTHORIZED_UPLOAD_INDEX) {
        if (
          value.authorizedSignatureFileId.trim() &&
          value.authorizedSignatureStoragePath.trim()
        ) {
          await deleteBisProjectFile({
            id: value.authorizedSignatureFileId,
            file_name: value.authorizedSignatureFileName || 'authorized-signature',
            storage_path: value.authorizedSignatureStoragePath,
          })
        }
        const displayName = value.authorizedSignatoryName.trim()
          ? `Authorized Signature — ${value.authorizedSignatoryName.trim()}`
          : 'Authorized Signature'
        const uploaded = await uploadBisProjectFile(
          projectId,
          uploadFile,
          AUTHORIZED_SIGNATURE_DOC_KIND,
          { displayName },
        )
        onChange({
          ...value,
          authorizedSignatureFileId: uploaded.id,
          authorizedSignatureFileName: uploaded.file_name,
          authorizedSignatureStoragePath: uploaded.storage_path,
        })
        setUrlCache((prev) => ({
          ...prev,
          [uploaded.id]: {
            viewUrl: uploaded.viewUrl,
            downloadUrl: uploaded.downloadUrl,
          },
        }))
        toast.success('Authorized signature attached')
        return
      }

      const current = rows[index]
      if (!current) return
      if (current.signatureFileId.trim() && current.signatureStoragePath.trim()) {
        await deleteBisProjectFile({
          id: current.signatureFileId,
          file_name: current.signatureFileName || 'signature',
          storage_path: current.signatureStoragePath,
        })
      }
      const displayName = current.personName.trim()
        ? `Signature — ${current.personName.trim()}`
        : `Signature — Person ${index + 1}`
      const uploaded = await uploadBisProjectFile(projectId, uploadFile, SIGNATURE_DOC_KIND, {
        displayName,
      })
      patchRowSignature(index, {
        signatureFileId: uploaded.id,
        signatureFileName: uploaded.file_name,
        signatureStoragePath: uploaded.storage_path,
      })
      setUrlCache((prev) => ({
        ...prev,
        [uploaded.id]: {
          viewUrl: uploaded.viewUrl,
          downloadUrl: uploaded.downloadUrl,
        },
      }))
      toast.success('Signature attached')
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    } finally {
      setSignatureBusyIndex(null)
    }
  }

  const clearSignatory = () => {
    setShowSignatory(false)
    onChange({
      ...value,
      includeAuthorizedSignatory: false,
      authorizedSignatoryName: '',
      authorizedSignatoryDesignation: '',
      authorizedSignatoryEmail: '',
      authorizedSignatoryMobile: '',
      authorizedBy: '',
      authorizedSignatureFileId: '',
      authorizedSignatureFileName: '',
      authorizedSignatureStoragePath: '',
      applyAuthorizedSignatureToDocuments: false,
    })
  }

  const openSignatory = () => {
    setShowSignatory(true)
    onChange({ ...value, includeAuthorizedSignatory: true })
  }

  const setApplySignatureToDocuments = (index: number, checked: boolean) => {
    const nextRows = rows.map((row, i) => ({
      ...row,
      // Single-select: only one person signature applies to all docs.
      applySignatureToDocuments: checked ? i === index : false,
    }))
    onChange({
      ...value,
      rows: nextRows,
      // Person-row apply clears authorized "all docs".
      applyAuthorizedSignatureToDocuments: checked
        ? false
        : value.applyAuthorizedSignatureToDocuments,
    })
  }

  const setApplyAuthorizedSignatureToDocuments = (checked: boolean) => {
    onChange({
      ...value,
      applyAuthorizedSignatureToDocuments: checked,
      rows: checked
        ? rows.map((row) => ({ ...row, applySignatureToDocuments: false }))
        : value.rows,
    })
  }

  const renderSignatureButtons = (opts: {
    hasSignature: boolean
    fileId: string
    fileName: string
    busy: boolean
    onUpload: () => void
    ariaPrefix: string
    applyToDocuments?: boolean
    onApplyToDocumentsChange?: (checked: boolean) => void
  }) => {
    const urls = opts.fileId ? urlCache[opts.fileId] : undefined
    return (
      <div className="inline-flex items-center justify-center gap-0.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={sigActionBtnClass}
          disabled={disabled || opts.busy || !projectId}
          title={opts.hasSignature ? 'Upload / Replace signature' : 'Upload signature'}
          aria-label={
            opts.hasSignature
              ? `Upload or replace ${opts.ariaPrefix}`
              : `Upload ${opts.ariaPrefix}`
          }
          onClick={opts.onUpload}
        >
          <Upload size={14} aria-hidden />
        </Button>
        {opts.hasSignature && urls?.viewUrl ? (
          <a
            href={urls.viewUrl}
            target="_blank"
            rel="noreferrer"
            className={sigActionBtnClass}
            title={`View ${opts.fileName || 'signature'}`}
            aria-label={`View ${opts.ariaPrefix}`}
          >
            <Eye size={14} aria-hidden />
          </a>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={sigActionBtnClass}
            disabled
            title={
              opts.hasSignature
                ? 'View unavailable'
                : 'View (upload a signature first)'
            }
            aria-label={`View ${opts.ariaPrefix}`}
          >
            <Eye size={14} aria-hidden />
          </Button>
        )}
        {opts.hasSignature && urls?.downloadUrl ? (
          <a
            href={urls.downloadUrl}
            download={opts.fileName || 'signature'}
            className={sigActionBtnClass}
            title={`Download ${opts.fileName || 'signature'}`}
            aria-label={`Download ${opts.ariaPrefix}`}
          >
            <Download size={14} aria-hidden />
          </a>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={sigActionBtnClass}
            disabled
            title={
              opts.hasSignature
                ? 'Download unavailable'
                : 'Download (upload a signature first)'
            }
            aria-label={`Download ${opts.ariaPrefix}`}
          >
            <Download size={14} aria-hidden />
          </Button>
        )}
        {opts.onApplyToDocumentsChange ? (
          <label
            className={cn(
              sigActionBtnClass,
              'cursor-pointer',
              disabled && 'pointer-events-none opacity-50',
            )}
            title="Apply this signature on all BIS documents"
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 shrink-0 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
              checked={Boolean(opts.applyToDocuments)}
              disabled={disabled}
              aria-label={`Apply ${opts.ariaPrefix} on all documents`}
              onChange={(e) => opts.onApplyToDocumentsChange?.(e.target.checked)}
            />
          </label>
        ) : null}
      </div>
    )
  }

  const renderPersonActions = (index: number, isLast: boolean, filled: boolean, isDone: boolean) => (
    <div className="inline-flex items-center justify-center gap-0.5">
      {isLast ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={actionBtnClass}
          disabled={disabled || !filled}
          title="Add person"
          aria-label="Add person"
          onClick={addRow}
        >
          <Plus size={14} />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={actionBtnClass}
          disabled={disabled}
          title={isDone ? 'Edit person' : 'Editing'}
          aria-label={isDone ? `Edit person ${index + 1}` : `Done editing person ${index + 1}`}
          onClick={() => setEditingIndex((prev) => (prev === index ? null : index))}
        >
          <Pencil size={14} />
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={deleteBtnClass}
        disabled={disabled || rows.length <= 1}
        title="Delete person"
        aria-label={`Delete person ${index + 1}`}
        onClick={() => removeRow(index)}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  )

  const renderAuthorizedBySelect = () => (
    <Select
      value={value.authorizedBy.trim() || AUTHORIZED_BY_NONE}
      disabled={disabled || availableNames.length === 0}
      onValueChange={(next) => {
        if (next === AUTHORIZED_BY_NONE) {
          onChange({ ...value, authorizedBy: '' })
          return
        }
        applyAuthorizedBy(next)
      }}
    >
      <SelectTrigger className={cn(cellInputClass, 'w-full')} aria-label="Authorized By">
        <SelectValue
          placeholder={
            availableNames.length === 0 ? 'Add names in the table first' : 'Select person'
          }
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTHORIZED_BY_NONE}>—</SelectItem>
        {availableNames.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
        {value.authorizedBy.trim() && !availableNames.includes(value.authorizedBy.trim()) ? (
          <SelectItem value={value.authorizedBy.trim()}>{value.authorizedBy.trim()}</SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  )

  const authorizedSignatureButtons = () =>
    renderSignatureButtons({
      hasSignature: Boolean(value.authorizedSignatureStoragePath.trim()),
      fileId: value.authorizedSignatureFileId,
      fileName: value.authorizedSignatureFileName,
      busy: signatureBusyIndex === AUTHORIZED_UPLOAD_INDEX,
      onUpload: () => openSignaturePicker(AUTHORIZED_UPLOAD_INDEX),
      ariaPrefix: 'authorized signature',
      applyToDocuments: value.applyAuthorizedSignatureToDocuments,
      onApplyToDocumentsChange: setApplyAuthorizedSignatureToDocuments,
    })

  return (
    <div className="space-y-3 rounded-none border border-stone-400 bg-[#fffcf7] p-2 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
          Top Management Details
        </p>
        {showSignatory ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(limsOutlineBtnClass, 'h-7 gap-1 px-2 text-[11px]')}
            disabled={disabled}
            title="Hide & clear authorized signatory fields"
            onClick={clearSignatory}
          >
            <X className="h-3.5 w-3.5" />
            Remove Signatory
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(limsOutlineBtnClass, 'h-7 gap-1 px-2 text-[11px]')}
            disabled={disabled}
            title="Add Authorized Signatory"
            onClick={openSignatory}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Signatory
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={SIGNATURE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          void handleSignaturePicked(file)
        }}
      />

      {/* Cards — below ~10″ / lg */}
      <div className={cn(CARDS_MQ_SHOW, 'space-y-2')}>
        <div className="flex items-center gap-2 border border-stone-500 bg-stone-800 px-2.5 py-2 text-amber-200">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected
            }}
            disabled={disabled || rows.length === 0}
            onChange={(e) => {
              if (e.target.checked) setSelected(new Set(rows.map((_, i) => i)))
              else setSelected(new Set())
            }}
            aria-label="Select all persons"
          />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
            {selected.size > 0 ? `${selected.size} selected` : `${rows.length} person${rows.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {rows.map((row, index) => {
          const isLast = index === rows.length - 1
          const filled = isRowFilled(row)
          const isDone = !isLast && filled && editingIndex !== index
          const canEditFields = !disabled && (isLast || !isDone)
          const hasSignature = Boolean(row.signatureStoragePath.trim())
          const sigBusy = signatureBusyIndex === index
          const selectedRow = selected.has(index)

          return (
            <article
              key={`tm-card-${index}`}
              className={cn(
                'border border-stone-400 p-2.5',
                selectedRow ? 'bg-[#fde68a]/80' : index % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]',
              )}
            >
              <div className="mb-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  className={cn(checkboxClass, 'mt-1 shrink-0')}
                  checked={selectedRow}
                  disabled={disabled}
                  onChange={() => toggleSelected(index)}
                  aria-label={`Select person ${index + 1}`}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className={cardFieldLabelClass}>Name</p>
                    {canEditFields ? (
                      <Input
                        className={cn(cellInputClass, 'px-2 text-left')}
                        value={row.personName}
                        disabled={disabled}
                        placeholder="Name"
                        title={row.personName.trim() || undefined}
                        onChange={(e) => setRow(index, 'personName', e.target.value)}
                      />
                    ) : (
                      <p
                        className="truncate text-left text-sm font-medium text-[#292524]"
                        title={row.personName.trim() || undefined}
                      >
                        {row.personName.trim() || '—'}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className={cardFieldLabelClass}>Designation</p>
                    {canEditFields ? (
                      <Input
                        className={cn(cellInputClass, 'px-2 text-left')}
                        value={row.designation}
                        disabled={disabled}
                        placeholder="Designation"
                        title={row.designation.trim() || undefined}
                        onChange={(e) => setRow(index, 'designation', e.target.value)}
                      />
                    ) : (
                      <p
                        className="truncate text-left text-sm text-[#292524]"
                        title={row.designation.trim() || undefined}
                      >
                        {row.designation.trim() || '—'}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className={cardFieldLabelClass}>Email</p>
                    {canEditFields ? (
                      <Input
                        className={emailInputClass}
                        value={row.email}
                        disabled={disabled}
                        placeholder="Email"
                        inputMode="email"
                        title={row.email.trim() || undefined}
                        onChange={(e) => setRow(index, 'email', e.target.value)}
                      />
                    ) : (
                      <p
                        className="truncate text-left text-sm text-[#292524]"
                        title={row.email.trim() || undefined}
                      >
                        {row.email.trim() || '—'}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className={cardFieldLabelClass}>Mobile</p>
                    {canEditFields ? (
                      <Input
                        className={cn(mobileInputClass, 'text-left')}
                        value={row.mobile}
                        disabled={disabled}
                        placeholder="Mobile"
                        inputMode="tel"
                        onChange={(e) => setRow(index, 'mobile', e.target.value)}
                      />
                    ) : (
                      <p className="tabular-nums text-sm tracking-wide text-[#292524]">
                        {row.mobile.trim() || '—'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-2 border-t border-[#e7e0d4] pt-2">
                <div>
                  <p className={cardFieldLabelClass}>Signature</p>
                  {renderSignatureButtons({
                    hasSignature,
                    fileId: row.signatureFileId,
                    fileName: row.signatureFileName,
                    busy: sigBusy,
                    onUpload: () => openSignaturePicker(index),
                    ariaPrefix: `signature for person ${index + 1}`,
                    applyToDocuments: row.applySignatureToDocuments,
                    onApplyToDocumentsChange: (checked) =>
                      setApplySignatureToDocuments(index, checked),
                  })}
                </div>
                <div>
                  <p className={cardFieldLabelClass}>Action</p>
                  {renderPersonActions(index, isLast, filled, isDone)}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {/* Table — ~10″ / lg+ */}
      <div className={cn(TABLE_MQ_SHOW, 'overflow-x-auto rounded-none border border-stone-500')}>
        <Table
          className={cn(
            'w-full min-w-[1020px] table-fixed border-collapse font-jakarta',
            '[&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4]',
            '[&_th]:p-[1mm] [&_td]:!p-[1mm]',
          )}
        >
          <TableHeader>
            <TableRow className="border-b border-stone-700 hover:bg-transparent">
              <TableHead className={cn(thBase, 'w-10')}>
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected
                  }}
                  disabled={disabled || rows.length === 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(new Set(rows.map((_, i) => i)))
                    else setSelected(new Set())
                  }}
                  aria-label="Select all persons"
                />
              </TableHead>
              <TableHead className={cn(thBase, 'min-w-[11.5rem] w-[20%]')}>Name</TableHead>
              <TableHead className={cn(thBase, 'min-w-[10.5rem] w-[16%]')}>Designation</TableHead>
              <TableHead className={cn(thBase, 'min-w-[13.5rem] w-[22%]')}>Email</TableHead>
              <TableHead className={cn(thBase, 'w-[8.75rem] whitespace-nowrap')}>Mobile</TableHead>
              <TableHead className={cn(thBase, 'w-[7.75rem] whitespace-nowrap px-1')}>
                Signature
              </TableHead>
              <TableHead className={cn(thBase, 'w-[4.25rem] whitespace-nowrap px-1')}>
                Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const isLast = index === rows.length - 1
              const filled = isRowFilled(row)
              const isDone = !isLast && filled && editingIndex !== index
              const canEditFields = !disabled && (isLast || !isDone)
              const hasSignature = Boolean(row.signatureStoragePath.trim())
              const sigBusy = signatureBusyIndex === index

              return (
                <TableRow
                  key={`tm-${index}`}
                  className={cn(
                    'border-b border-[#e7e0d4]',
                    selected.has(index) ? 'bg-[#fde68a]/70' : 'bg-[#f7f3eb] hover:bg-[#f3e9d8]',
                  )}
                >
                  <TableCell className={tdClass}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={selected.has(index)}
                      disabled={disabled}
                      onChange={() => toggleSelected(index)}
                      aria-label={`Select person ${index + 1}`}
                    />
                  </TableCell>
                  <TableCell className={tdClass}>
                    {canEditFields ? (
                      <Input
                        className={cn(cellInputClass, 'px-2 text-left')}
                        value={row.personName}
                        disabled={disabled}
                        placeholder="Name"
                        title={row.personName.trim() || undefined}
                        onChange={(e) => setRow(index, 'personName', e.target.value)}
                      />
                    ) : (
                      <p
                        className="truncate text-left text-sm font-medium text-[#292524]"
                        title={row.personName.trim() || undefined}
                      >
                        {row.personName.trim() || '—'}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className={tdClass}>
                    {canEditFields ? (
                      <Input
                        className={cn(cellInputClass, 'px-2 text-left')}
                        value={row.designation}
                        disabled={disabled}
                        placeholder="Designation"
                        title={row.designation.trim() || undefined}
                        onChange={(e) => setRow(index, 'designation', e.target.value)}
                      />
                    ) : (
                      <p
                        className="truncate text-left text-sm text-[#292524]"
                        title={row.designation.trim() || undefined}
                      >
                        {row.designation.trim() || '—'}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className={tdClass}>
                    {canEditFields ? (
                      <Input
                        className={emailInputClass}
                        value={row.email}
                        disabled={disabled}
                        placeholder="Email"
                        inputMode="email"
                        title={row.email.trim() || undefined}
                        onChange={(e) => setRow(index, 'email', e.target.value)}
                      />
                    ) : (
                      <p
                        className="truncate text-left text-sm text-[#292524]"
                        title={row.email.trim() || undefined}
                      >
                        {row.email.trim() || '—'}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className={tdClass}>
                    {canEditFields ? (
                      <Input
                        className={mobileInputClass}
                        value={row.mobile}
                        disabled={disabled}
                        placeholder="Mobile"
                        inputMode="tel"
                        onChange={(e) => setRow(index, 'mobile', e.target.value)}
                      />
                    ) : (
                      <p className="tabular-nums text-sm tracking-wide text-[#292524]">
                        {row.mobile.trim() || '—'}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className={tdClass}>
                    {renderSignatureButtons({
                      hasSignature,
                      fileId: row.signatureFileId,
                      fileName: row.signatureFileName,
                      busy: sigBusy,
                      onUpload: () => openSignaturePicker(index),
                      ariaPrefix: `signature for person ${index + 1}`,
                      applyToDocuments: row.applySignatureToDocuments,
                      onApplyToDocumentsChange: (checked) =>
                        setApplySignatureToDocuments(index, checked),
                    })}
                  </TableCell>
                  <TableCell className={tdClass}>
                    {renderPersonActions(index, isLast, filled, isDone)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {selected.size > 0 ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none border-red-700/40 text-red-800 hover:bg-red-50"
            disabled={disabled}
            onClick={() => {
              const keep = rows.filter((_, i) => !selected.has(i))
              setRows(keep.length > 0 ? keep : [EMPTY_ROW()])
              setSelected(new Set())
              setEditingIndex(null)
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete selected ({selected.size})
          </Button>
        </div>
      ) : null}

      {showSignatory ? (
        <div className="space-y-2 border-t border-stone-300 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
            Authorized Signatory
          </p>

          {/* Cards — below ~10″ / lg */}
          <article
            className={cn(CARDS_MQ_SHOW, 'space-y-2 border border-stone-400 bg-[#f7f3eb] p-2.5')}
          >
            <div>
              <p className={cardFieldLabelClass}>Authorized Signatory Name</p>
              <Input
                className={cellInputClass}
                value={value.authorizedSignatoryName}
                disabled={disabled}
                placeholder="Name"
                onChange={(e) =>
                  onChange({ ...value, authorizedSignatoryName: e.target.value })
                }
              />
            </div>
            <div>
              <p className={cardFieldLabelClass}>Designation</p>
              <Input
                className={cellInputClass}
                value={value.authorizedSignatoryDesignation}
                disabled={disabled}
                placeholder="Designation"
                onChange={(e) =>
                  onChange({
                    ...value,
                    authorizedSignatoryDesignation: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <p className={cardFieldLabelClass}>Email ID</p>
              <Input
                className={emailInputClass}
                value={value.authorizedSignatoryEmail}
                disabled={disabled}
                placeholder="Email"
                inputMode="email"
                onChange={(e) =>
                  onChange({ ...value, authorizedSignatoryEmail: e.target.value })
                }
              />
            </div>
            <div>
              <p className={cardFieldLabelClass}>Mobile Number</p>
              <Input
                className={mobileInputClass}
                value={value.authorizedSignatoryMobile}
                disabled={disabled}
                placeholder="Mobile"
                inputMode="tel"
                onChange={(e) =>
                  onChange({ ...value, authorizedSignatoryMobile: e.target.value })
                }
              />
            </div>
            <div>
              <p className={cardFieldLabelClass}>Authorized By</p>
              {renderAuthorizedBySelect()}
            </div>
            <div>
              <p className={cardFieldLabelClass}>Signature</p>
              {authorizedSignatureButtons()}
            </div>
          </article>

          {/* Table — ~10″ / lg+ */}
          <div className={cn(TABLE_MQ_SHOW, 'overflow-x-auto rounded-none border border-stone-500')}>
            <Table
              className={cn(
                'w-full min-w-[820px] table-fixed border-collapse font-jakarta',
                '[&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4]',
                '[&_th]:p-[1mm] [&_td]:!p-[1mm]',
              )}
            >
              <TableHeader>
                <TableRow className="border-b border-stone-700 hover:bg-transparent">
                  <TableHead className={cn(thBase, 'w-[18%]')}>
                    Authorized Signatory Name
                  </TableHead>
                  <TableHead className={cn(thBase, 'w-[14%]')}>Designation</TableHead>
                  <TableHead className={cn(thBase, 'w-[20%]')}>Email ID</TableHead>
                  <TableHead className={cn(thBase, 'w-[12%]')}>Mobile Number</TableHead>
                  <TableHead className={cn(thBase, 'w-[18%]')}>Authorized By</TableHead>
                  <TableHead className={cn(thBase, 'w-[7.75rem] whitespace-nowrap px-1')}>
                    Signature
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="border-b border-[#e7e0d4] bg-[#f7f3eb] hover:bg-[#f3e9d8]">
                  <TableCell className={tdClass}>
                    <Input
                      className={cellInputClass}
                      value={value.authorizedSignatoryName}
                      disabled={disabled}
                      placeholder="Name"
                      onChange={(e) =>
                        onChange({ ...value, authorizedSignatoryName: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell className={tdClass}>
                    <Input
                      className={cellInputClass}
                      value={value.authorizedSignatoryDesignation}
                      disabled={disabled}
                      placeholder="Designation"
                      onChange={(e) =>
                        onChange({
                          ...value,
                          authorizedSignatoryDesignation: e.target.value,
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className={tdClass}>
                    <Input
                      className={emailInputClass}
                      value={value.authorizedSignatoryEmail}
                      disabled={disabled}
                      placeholder="Email"
                      inputMode="email"
                      title={value.authorizedSignatoryEmail.trim() || undefined}
                      onChange={(e) =>
                        onChange({ ...value, authorizedSignatoryEmail: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell className={tdClass}>
                    <Input
                      className={cn(mobileInputClass, 'text-left')}
                      value={value.authorizedSignatoryMobile}
                      disabled={disabled}
                      placeholder="Mobile"
                      inputMode="tel"
                      onChange={(e) =>
                        onChange({ ...value, authorizedSignatoryMobile: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell className={tdClass}>{renderAuthorizedBySelect()}</TableCell>
                  <TableCell className={tdClass}>{authorizedSignatureButtons()}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
