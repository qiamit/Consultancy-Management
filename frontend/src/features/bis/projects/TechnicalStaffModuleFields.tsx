import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, Download, Eye, FilePlus2, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldAddBtnClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

function openDatePicker(el: HTMLInputElement | null) {
  if (!el || el.disabled) return
  try {
    if (typeof el.showPicker === 'function') {
      el.showPicker()
      return
    }
  } catch {
    // fall through
  }
  el.focus()
  el.click()
}

const dateInputClass = cn(
  limsFieldClass,
  'min-w-0 pr-2 tabular-nums',
  '[&::-webkit-calendar-picker-indicator]:pointer-events-none',
  '[&::-webkit-calendar-picker-indicator]:opacity-0',
)
import { buildAppointmentLetterHtmlForTechnicalStaff } from '../print/printBisDocument'
import type { TechnicalStaffRow } from '../print/technicalStaffHtml'
import {
  emptyTechnicalStaffRow,
  type TechnicalStaffModulePayload,
} from './bisModuleDataApi'
import {
  createBisProjectFileUrls,
  deleteBisProjectFile,
  formatBisProjectFilesError,
  uploadBisProjectFile,
} from './bisProjectFilesApi'
import { BisDocumentPrintPreviewDialog } from './BisDocumentPrintPreviewDialog'
import { MasterOptionFieldWithAdd } from './MasterOptionFieldWithAdd'
import { removeSignatureImageBackground } from './removeSignatureBackground'
import type { BisProjectRow } from './types'

const DOC_APPOINTMENT = 'technical-staff-appointment'
const DOC_EDUCATION_CERT = 'technical-staff-education-certificate'
const DOC_PHOTO = 'technical-staff-photo'
const DOC_SIGNATURE = 'technical-staff-signature'

const DOC_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp'
const PHOTO_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'
const SIGNATURE_ACCEPT =
  '.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf'

type FileSlot = 'appointment' | 'education' | 'photo' | 'signature'

type SignatureUrlCache = Record<string, { viewUrl?: string; downloadUrl?: string }>

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
const sigActionBtnClass = cn(
  limsOutlineBtnClass,
  'inline-flex h-7 w-7 items-center justify-center p-0',
)
const cardFieldLabelClass =
  'mb-1 text-[10px] font-bold uppercase tracking-wide text-stone-500'

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function normalizeStaffRow(row: Partial<TechnicalStaffRow> | null | undefined): TechnicalStaffRow {
  const base = emptyTechnicalStaffRow()
  if (!row) return base
  return {
    personName: str(row.personName),
    designation: str(row.designation),
    educationalQualification: str(row.educationalQualification),
    experienceYears: str(row.experienceYears),
    appointmentDate: str(row.appointmentDate),
    appointmentReferenceNo: str(row.appointmentReferenceNo),
    appointmentLetterFileId: str(row.appointmentLetterFileId),
    appointmentLetterFileName: str(row.appointmentLetterFileName),
    appointmentLetterStoragePath: str(row.appointmentLetterStoragePath),
    educationCertificateFileId: str(row.educationCertificateFileId),
    educationCertificateFileName: str(row.educationCertificateFileName),
    educationCertificateStoragePath: str(row.educationCertificateStoragePath),
    photoFileId: str(row.photoFileId),
    photoFileName: str(row.photoFileName),
    photoStoragePath: str(row.photoStoragePath),
    signatureFileId: str(row.signatureFileId),
    signatureFileName: str(row.signatureFileName),
    signatureStoragePath: str(row.signatureStoragePath),
    applySignatureToDocuments: Boolean(row.applySignatureToDocuments),
  }
}

function isRowFilled(row: TechnicalStaffRow): boolean {
  return Boolean(
    row.personName ||
      row.designation ||
      row.educationalQualification ||
      row.experienceYears,
  )
}

function slotMeta(row: TechnicalStaffRow, slot: FileSlot) {
  if (slot === 'appointment') {
    return {
      fileId: row.appointmentLetterFileId || '',
      fileName: row.appointmentLetterFileName || '',
      storagePath: row.appointmentLetterStoragePath || '',
      docKind: DOC_APPOINTMENT,
      label: 'Appointment Letter',
    }
  }
  if (slot === 'education') {
    return {
      fileId: row.educationCertificateFileId || '',
      fileName: row.educationCertificateFileName || '',
      storagePath: row.educationCertificateStoragePath || '',
      docKind: DOC_EDUCATION_CERT,
      label: 'Education Certificate',
    }
  }
  if (slot === 'photo') {
    return {
      fileId: row.photoFileId || '',
      fileName: row.photoFileName || '',
      storagePath: row.photoStoragePath || '',
      docKind: DOC_PHOTO,
      label: 'Photo',
    }
  }
  return {
    fileId: row.signatureFileId || '',
    fileName: row.signatureFileName || '',
    storagePath: row.signatureStoragePath || '',
    docKind: DOC_SIGNATURE,
    label: 'Signature',
  }
}

export function TechnicalStaffModuleFields({
  value,
  onChange,
  disabled = false,
  projectId = null,
  projectRow = null,
}: {
  value: TechnicalStaffModulePayload
  onChange: (next: TechnicalStaffModulePayload) => void
  disabled?: boolean
  projectId?: string | null
  projectRow?: BisProjectRow | null
}) {
  const rows =
    value.rows.length > 0
      ? value.rows.map((row) => normalizeStaffRow(row))
      : [emptyTechnicalStaffRow()]
  const [selected, setSelected] = useState(() => new Set<number>())
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [fileBusyKey, setFileBusyKey] = useState<string | null>(null)
  const [urlCache, setUrlCache] = useState(() => ({} as SignatureUrlCache))
  const [createIndex, setCreateIndex] = useState<number | null>(null)
  const [createDate, setCreateDate] = useState('')
  const [createReferenceNo, setCreateReferenceNo] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const appointmentInputRef = useRef<HTMLInputElement>(null)
  const educationInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const signatureInputRef = useRef<HTMLInputElement>(null)
  const createDateRef = useRef<HTMLInputElement>(null)
  const pendingUpload = useRef<{ index: number; slot: FileSlot } | null>(null)

  const createDialogOpen = createIndex != null
  const handleCreateDialogOpenChange = useFormDialogOpenChange((next) => {
    if (!next) {
      setCreateIndex(null)
      setCreateDate('')
      setCreateReferenceNo('')
      setCreateBusy(false)
    }
  })

  const signatureKey = useMemo(
    () =>
      rows
        .map(
          (r) =>
            [
              r.appointmentLetterFileId,
              r.educationCertificateFileId,
              r.photoFileId,
              r.signatureFileId,
            ].join(':'),
        )
        .join('|'),
    [rows],
  )

  useEffect(() => {
    let cancelled = false
    const targets = rows.flatMap((r) => {
      const out: { id: string; path: string; name: string }[] = []
      ;(
        [
          {
            id: r.appointmentLetterFileId,
            path: r.appointmentLetterStoragePath,
            name: r.appointmentLetterFileName || 'appointment-letter',
          },
          {
            id: r.educationCertificateFileId,
            path: r.educationCertificateStoragePath,
            name: r.educationCertificateFileName || 'education-certificate',
          },
          {
            id: r.photoFileId,
            path: r.photoStoragePath,
            name: r.photoFileName || 'photo',
          },
          {
            id: r.signatureFileId,
            path: r.signatureStoragePath,
            name: r.signatureFileName || 'signature',
          },
        ] as const
      ).forEach((t) => {
        if (t.id.trim() && t.path.trim()) out.push(t)
      })
      return out
    })
    if (targets.length === 0) return
    void (async () => {
      const next: SignatureUrlCache = {}
      await Promise.all(
        targets.map(async (t) => {
          try {
            const urls = await createBisProjectFileUrls(t.path, t.name)
            next[t.id] = urls
          } catch {
            /* ignore */
          }
        }),
      )
      if (!cancelled) setUrlCache((prev) => ({ ...prev, ...next }))
    })()
    return () => {
      cancelled = true
    }
  }, [signatureKey, rows])

  const setRows = (nextRows: TechnicalStaffRow[]) => {
    onChange({ ...value, rows: nextRows })
  }

  const setRow = <K extends keyof TechnicalStaffRow>(
    index: number,
    key: K,
    raw: TechnicalStaffRow[K],
  ) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, [key]: raw } : row)))
  }

  const addRow = () => setRows([...rows, emptyTechnicalStaffRow()])

  const removeRow = (index: number) => {
    if (rows.length <= 1) return
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

  const removeSelected = () => {
    if (selected.size === 0) return
    if (selected.size >= rows.length) {
      setRows([emptyTechnicalStaffRow()])
    } else {
      setRows(rows.filter((_, i) => !selected.has(i)))
    }
    setSelected(new Set())
    setEditingIndex(null)
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

  const openFilePicker = (index: number, slot: FileSlot) => {
    if (!projectId || disabled) {
      toast.warning('Save the license first, then attach files.')
      return
    }
    pendingUpload.current = { index, slot }
    if (slot === 'appointment') appointmentInputRef.current?.click()
    else if (slot === 'education') educationInputRef.current?.click()
    else if (slot === 'photo') photoInputRef.current?.click()
    else signatureInputRef.current?.click()
  }

  const patchRowFiles = (
    index: number,
    slot: FileSlot,
    patch: { fileId: string; fileName: string; storagePath: string },
  ) => {
    setRows(
      rows.map((row, i) => {
        if (i !== index) return row
        if (slot === 'appointment') {
          return {
            ...row,
            appointmentLetterFileId: patch.fileId,
            appointmentLetterFileName: patch.fileName,
            appointmentLetterStoragePath: patch.storagePath,
          }
        }
        if (slot === 'education') {
          return {
            ...row,
            educationCertificateFileId: patch.fileId,
            educationCertificateFileName: patch.fileName,
            educationCertificateStoragePath: patch.storagePath,
          }
        }
        if (slot === 'photo') {
          return {
            ...row,
            photoFileId: patch.fileId,
            photoFileName: patch.fileName,
            photoStoragePath: patch.storagePath,
          }
        }
        return {
          ...row,
          signatureFileId: patch.fileId,
          signatureFileName: patch.fileName,
          signatureStoragePath: patch.storagePath,
        }
      }),
    )
  }

  const handleFilePicked = async (file: File | undefined) => {
    const pending = pendingUpload.current
    pendingUpload.current = null
    if (appointmentInputRef.current) appointmentInputRef.current.value = ''
    if (educationInputRef.current) educationInputRef.current.value = ''
    if (photoInputRef.current) photoInputRef.current.value = ''
    if (signatureInputRef.current) signatureInputRef.current.value = ''
    if (!pending || !file || !projectId) return

    const { index, slot } = pending
    const current = rows[index]
    if (!current) return
    const meta = slotMeta(current, slot)
    const busyKey = `${index}:${slot}`
    setFileBusyKey(busyKey)
    try {
      const uploadFile =
        slot === 'signature' ? await removeSignatureImageBackground(file) : file
      if (meta.fileId.trim() && meta.storagePath.trim()) {
        await deleteBisProjectFile({
          id: meta.fileId,
          file_name: meta.fileName || meta.label,
          storage_path: meta.storagePath,
        })
      }
      const person = current.personName.trim() || `Person ${index + 1}`
      const uploaded = await uploadBisProjectFile(projectId, uploadFile, meta.docKind, {
        displayName: `${meta.label} — ${person}`,
      })
      patchRowFiles(index, slot, {
        fileId: uploaded.id,
        fileName: uploaded.file_name,
        storagePath: uploaded.storage_path,
      })
      setUrlCache((prev) => ({
        ...prev,
        [uploaded.id]: {
          viewUrl: uploaded.viewUrl,
          downloadUrl: uploaded.downloadUrl,
        },
      }))
      toast.success(`${meta.label} attached`)
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    } finally {
      setFileBusyKey(null)
    }
  }

  const setApplySignatureToDocuments = (index: number, checked: boolean) => {
    const nextRows = rows.map((row, i) => ({
      ...row,
      applySignatureToDocuments: checked ? i === index : false,
    }))
    const selectedRow = checked ? nextRows[index] : null
    onChange({
      ...value,
      rows: nextRows,
      signatoryName: str(selectedRow?.personName) || str(value.signatoryName),
      signatoryDesignation: str(selectedRow?.designation) || str(value.signatoryDesignation),
    })
  }

  const openCreateAppointment = (index: number) => {
    if (disabled) return
    if (!projectRow) {
      toast.warning('Save the license first, then create Appointment Letter.')
      return
    }
    const row = rows[index]
    if (!row) return
    if (!str(row.personName)) {
      toast.warning('Enter the person name before creating Appointment Letter.')
      return
    }
    setCreateIndex(index)
    setCreateDate(str(row.appointmentDate) || new Date().toISOString().slice(0, 10))
    setCreateReferenceNo(str(row.appointmentReferenceNo))
  }

  const saveAndCreateAppointment = () => {
    if (createIndex == null || !projectRow) return
    const index = createIndex
    const row = rows[index]
    if (!row) return
    const appointmentDate = createDate.trim()
    const appointmentReferenceNo = createReferenceNo.trim()
    if (!appointmentDate) {
      toast.warning('Date of Joining is required.')
      return
    }

    const nextRow: TechnicalStaffRow = {
      ...row,
      appointmentDate,
      appointmentReferenceNo,
    }
    setRows(rows.map((r, i) => (i === index ? nextRow : r)))

    setCreateBusy(true)
    void (async () => {
      try {
        const html = await buildAppointmentLetterHtmlForTechnicalStaff(projectRow, {
          personName: nextRow.personName,
          designation: nextRow.designation,
          educationalQualification: nextRow.educationalQualification,
          experienceYears: nextRow.experienceYears,
          appointmentDate: nextRow.appointmentDate,
          appointmentReferenceNo: nextRow.appointmentReferenceNo,
        })
        handleCreateDialogOpenChange(false)
        setPreviewHtml(html)
        setPreviewOpen(true)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Could not prepare Appointment Letter.',
        )
      } finally {
        setCreateBusy(false)
      }
    })()
  }

  const renderFileButtons = (opts: {
    index: number
    slot: FileSlot
    showApply?: boolean
  }) => {
    const row = rows[opts.index]
    if (!row) return null
    const meta = slotMeta(row, opts.slot)
    const hasFile = Boolean(meta.storagePath.trim())
    const urls = meta.fileId ? urlCache[meta.fileId] : undefined
    const busy = fileBusyKey === `${opts.index}:${opts.slot}`
    return (
      <div className="inline-flex items-center justify-center gap-0.5">
        {opts.slot === 'appointment' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={sigActionBtnClass}
            disabled={disabled || createBusy || !projectRow}
            title="Create Appointment Letter"
            aria-label="Create Appointment Letter"
            onClick={() => openCreateAppointment(opts.index)}
          >
            <FilePlus2 size={14} aria-hidden />
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={sigActionBtnClass}
          disabled={disabled || busy || !projectId}
          title={hasFile ? `Upload / Replace ${meta.label}` : `Upload ${meta.label}`}
          aria-label={hasFile ? `Upload or replace ${meta.label}` : `Upload ${meta.label}`}
          onClick={() => openFilePicker(opts.index, opts.slot)}
        >
          <Upload size={14} aria-hidden />
        </Button>
        {hasFile && urls?.viewUrl ? (
          <a
            href={urls.viewUrl}
            target="_blank"
            rel="noreferrer"
            className={sigActionBtnClass}
            title={`View ${meta.fileName || meta.label}`}
            aria-label={`View ${meta.label}`}
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
            title={hasFile ? 'View unavailable' : `View (upload ${meta.label} first)`}
            aria-label={`View ${meta.label}`}
          >
            <Eye size={14} aria-hidden />
          </Button>
        )}
        {hasFile && urls?.downloadUrl ? (
          <a
            href={urls.downloadUrl}
            download={meta.fileName || meta.label}
            className={sigActionBtnClass}
            title={`Download ${meta.fileName || meta.label}`}
            aria-label={`Download ${meta.label}`}
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
            title={hasFile ? 'Download unavailable' : `Download (upload ${meta.label} first)`}
            aria-label={`Download ${meta.label}`}
          >
            <Download size={14} aria-hidden />
          </Button>
        )}
        {opts.showApply ? (
          <label
            className={cn(
              sigActionBtnClass,
              'cursor-pointer',
              disabled && 'pointer-events-none opacity-50',
            )}
            title="Apply this signature on Factory Test Report (right side)"
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 shrink-0 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
              checked={Boolean(row.applySignatureToDocuments)}
              disabled={disabled}
              aria-label={`Apply signature for person ${opts.index + 1} on Factory Test Report`}
              onChange={(e) => setApplySignatureToDocuments(opts.index, e.target.checked)}
            />
          </label>
        ) : null}
      </div>
    )
  }

  const renderPersonActions = (
    index: number,
    isLast: boolean,
    filled: boolean,
    isDone: boolean,
  ) => (
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
          aria-label={
            isDone ? `Edit person ${index + 1}` : `Done editing person ${index + 1}`
          }
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

  return (
    <div className="space-y-3 rounded-none border border-stone-400 bg-[#fffcf7] p-2 sm:p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
        Technical Staff Details
      </p>

      <input
        ref={appointmentInputRef}
        type="file"
        accept={DOC_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handleFilePicked(e.target.files?.[0])
        }}
      />
      <input
        ref={educationInputRef}
        type="file"
        accept={DOC_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handleFilePicked(e.target.files?.[0])
        }}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handleFilePicked(e.target.files?.[0])
        }}
      />
      <input
        ref={signatureInputRef}
        type="file"
        accept={SIGNATURE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handleFilePicked(e.target.files?.[0])
        }}
      />

      {/* Cards — below lg */}
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
            {selected.size > 0
              ? `${selected.size} selected`
              : `${rows.length} person${rows.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {rows.map((row, index) => {
          const isLast = index === rows.length - 1
          const filled = isRowFilled(row)
          const isDone = !isLast && filled && editingIndex !== index
          const canEditFields = !disabled && (isLast || !isDone)
          return (
            <article
              key={`ts-card-${index}`}
              className={cn(
                'space-y-2 border border-stone-400 p-2.5',
                selected.has(index) ? 'bg-[#fde68a]/50' : 'bg-[#f7f3eb]',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={selected.has(index)}
                    disabled={disabled}
                    onChange={() => toggleSelected(index)}
                    aria-label={`Select person ${index + 1}`}
                  />
                  {String(index + 1).padStart(2, '0')}
                </label>
                {renderPersonActions(index, isLast, filled, isDone)}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className={cardFieldLabelClass}>Name of the Person</p>
                  <Input
                    className={cellInputClass}
                    value={row.personName}
                    disabled={!canEditFields}
                    placeholder="Name"
                    onChange={(e) => setRow(index, 'personName', e.target.value)}
                  />
                </div>
                <div>
                  <p className={cardFieldLabelClass}>Designation</p>
                  <MasterOptionFieldWithAdd
                    category="designation"
                    label="Designation"
                    manageTitle="Designation"
                    showLabel={false}
                    inputId={`ts-card-desig-${index}`}
                    listId={`ts-card-desig-list-${index}`}
                    value={row.designation}
                    onChange={(v) => setRow(index, 'designation', v)}
                    disabled={!canEditFields}
                    placeholder="Select or Add"
                  />
                </div>
                <div>
                  <p className={cardFieldLabelClass}>Education</p>
                  <MasterOptionFieldWithAdd
                    category="education"
                    label="Education"
                    manageTitle="Education"
                    showLabel={false}
                    inputId={`ts-card-edu-${index}`}
                    listId={`ts-card-edu-list-${index}`}
                    value={row.educationalQualification}
                    onChange={(v) => setRow(index, 'educationalQualification', v)}
                    disabled={!canEditFields}
                    placeholder="Select or Add"
                  />
                </div>
                <div>
                  <p className={cardFieldLabelClass}>Experience</p>
                  <MasterOptionFieldWithAdd
                    category="experience"
                    label="Experience"
                    manageTitle="Experience"
                    showLabel={false}
                    inputId={`ts-card-exp-${index}`}
                    listId={`ts-card-exp-list-${index}`}
                    value={row.experienceYears}
                    onChange={(v) => setRow(index, 'experienceYears', v)}
                    disabled={!canEditFields}
                    placeholder="Select or Add"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <p className={cardFieldLabelClass}>Appointment Letter</p>
                  {renderFileButtons({ index, slot: 'appointment' })}
                </div>
                <div>
                  <p className={cardFieldLabelClass}>Education Certificate</p>
                  {renderFileButtons({ index, slot: 'education' })}
                </div>
                <div>
                  <p className={cardFieldLabelClass}>Photo</p>
                  {renderFileButtons({ index, slot: 'photo' })}
                </div>
                <div>
                  <p className={cardFieldLabelClass}>Signature</p>
                  {renderFileButtons({ index, slot: 'signature', showApply: true })}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {/* Table — lg+ */}
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
              <TableHead className={cn(thBase, 'w-[28%]')}>Name of the Person</TableHead>
              <TableHead className={cn(thBase, 'w-[22%]')}>Designation</TableHead>
              <TableHead className={cn(thBase, 'w-[26%]')}>Education</TableHead>
              <TableHead className={cn(thBase, 'w-[12%]')}>Experience</TableHead>
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
              const rowBg = selected.has(index)
                ? 'bg-[#fde68a]/70'
                : 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
              return (
                <Fragment key={`ts-block-${index}`}>
                  <TableRow className={cn('border-b border-[#e7e0d4]', rowBg)}>
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
                          onChange={(e) => setRow(index, 'personName', e.target.value)}
                        />
                      ) : (
                        <p className="truncate text-left text-sm font-medium text-[#292524]">
                          {row.personName.trim() || '—'}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className={tdClass}>
                      {canEditFields ? (
                        <MasterOptionFieldWithAdd
                          category="designation"
                          label="Designation"
                          manageTitle="Designation"
                          showLabel={false}
                          inputId={`ts-desig-${index}`}
                          listId={`ts-desig-list-${index}`}
                          value={row.designation}
                          onChange={(v) => setRow(index, 'designation', v)}
                          disabled={disabled}
                          placeholder="Select or Add"
                        />
                      ) : (
                        <p className="truncate text-left text-sm text-[#292524]">
                          {row.designation.trim() || '—'}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className={tdClass}>
                      {canEditFields ? (
                        <MasterOptionFieldWithAdd
                          category="education"
                          label="Education"
                          manageTitle="Education"
                          showLabel={false}
                          inputId={`ts-edu-${index}`}
                          listId={`ts-edu-list-${index}`}
                          value={row.educationalQualification}
                          onChange={(v) => setRow(index, 'educationalQualification', v)}
                          disabled={disabled}
                          placeholder="Select or Add"
                        />
                      ) : (
                        <p className="truncate text-left text-sm text-[#292524]">
                          {row.educationalQualification.trim() || '—'}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className={tdClass}>
                      {canEditFields ? (
                        <MasterOptionFieldWithAdd
                          category="experience"
                          label="Experience"
                          manageTitle="Experience"
                          showLabel={false}
                          inputId={`ts-exp-${index}`}
                          listId={`ts-exp-list-${index}`}
                          value={row.experienceYears}
                          onChange={(v) => setRow(index, 'experienceYears', v)}
                          disabled={disabled}
                          placeholder="Select or Add"
                        />
                      ) : (
                        <p className="tabular-nums text-sm text-[#292524]">
                          {row.experienceYears.trim() || '—'}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className={tdClass}>
                      {renderPersonActions(index, isLast, filled, isDone)}
                    </TableCell>
                  </TableRow>
                  <TableRow className={cn('border-b-2 border-stone-400', rowBg)}>
                    <TableCell colSpan={6} className="px-2 py-2">
                      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                        <div className="flex flex-col items-center gap-1 rounded-none border border-stone-300 bg-[#fffcf7] px-2 py-1.5">
                          <p className={cardFieldLabelClass}>Appointment Letter</p>
                          {renderFileButtons({ index, slot: 'appointment' })}
                        </div>
                        <div className="flex flex-col items-center gap-1 rounded-none border border-stone-300 bg-[#fffcf7] px-2 py-1.5">
                          <p className={cardFieldLabelClass}>Education Certificate</p>
                          {renderFileButtons({ index, slot: 'education' })}
                        </div>
                        <div className="flex flex-col items-center gap-1 rounded-none border border-stone-300 bg-[#fffcf7] px-2 py-1.5">
                          <p className={cardFieldLabelClass}>Photo</p>
                          {renderFileButtons({ index, slot: 'photo' })}
                        </div>
                        <div className="flex flex-col items-center gap-1 rounded-none border border-stone-300 bg-[#fffcf7] px-2 py-1.5">
                          <p className={cardFieldLabelClass}>Signature</p>
                          {renderFileButtons({
                            index,
                            slot: 'signature',
                            showApply: true,
                          })}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                </Fragment>
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
            className={cn(limsOutlineBtnClass, 'h-7 text-red-700')}
            disabled={disabled}
            onClick={removeSelected}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete selected ({selected.size})
          </Button>
        </div>
      ) : null}

      <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'w-[min(36rem,calc(100vw-1.5rem))] max-w-xl p-0')}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Create Appointment Letter
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-3 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            {createIndex != null && rows[createIndex]?.personName.trim() ? (
              <p className="text-sm font-medium text-stone-800">
                {rows[createIndex]!.personName.trim()}
                {rows[createIndex]!.designation.trim()
                  ? ` · ${rows[createIndex]!.designation.trim()}`
                  : ''}
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label
                  htmlFor="ts-appointment-date"
                  className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                >
                  Date of Joining
                </Label>
                <LimsFieldWithAdd
                  addButton={
                    <button
                      type="button"
                      className={limsFieldAddBtnClass}
                      aria-label="Open calendar"
                      title="Pick date"
                      disabled={createBusy}
                      onClick={() => openDatePicker(createDateRef.current)}
                    >
                      <Calendar size={14} strokeWidth={2.25} aria-hidden />
                    </button>
                  }
                >
                  <Input
                    ref={createDateRef}
                    id="ts-appointment-date"
                    type="date"
                    value={createDate}
                    onChange={(e) => setCreateDate(e.target.value)}
                    disabled={createBusy}
                    className={dateInputClass}
                  />
                </LimsFieldWithAdd>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label
                  htmlFor="ts-appointment-ref"
                  className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                >
                  Reference Number
                </Label>
                <Input
                  id="ts-appointment-ref"
                  value={createReferenceNo}
                  onChange={(e) => setCreateReferenceNo(e.target.value)}
                  disabled={createBusy}
                  placeholder="Enter Reference Number"
                  className={limsFieldClass}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'min-w-[6.5rem]')}
              onClick={() => handleCreateDialogOpenChange(false)}
              disabled={createBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
              onClick={saveAndCreateAppointment}
              disabled={createBusy || !createDate.trim()}
            >
              {createBusy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BisDocumentPrintPreviewDialog
        open={previewOpen}
        onOpenChange={(next) => {
          setPreviewOpen(next)
          if (!next) setPreviewHtml(null)
        }}
        row={projectRow}
        kind="appointment-letter"
        generatedHtml={previewHtml}
      />
    </div>
  )
}
