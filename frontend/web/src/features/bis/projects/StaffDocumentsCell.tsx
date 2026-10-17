import { useRef, useState } from 'react'
import { Calendar, Camera, Eye, FilePlus2, FileText, GraduationCap, Loader2, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { usePdfViewer } from '@/components/ui/usePdfViewer'
import { limsDarkBarGlowStyle, limsDialogClass, limsFieldAddBtnClass, limsFieldClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { buildAppointmentLetterHtmlForTechnicalStaff } from '../print/printBisDocument'
import { BisDocumentPrintPreviewDialog } from './BisDocumentPrintPreviewDialog'
import type { BisProjectRow } from './types'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import {
  createBisProjectFileUrls,
  deleteBisProjectFile,
  formatBisProjectFilesError,
  uploadBisProjectFile,
} from './bisProjectFilesApi'
import { removeSignatureImageBackground } from './removeSignatureBackground'

type Rec = Record<string, unknown>
type Slot = 'appointment' | 'education' | 'photo' | 'signature'

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const SLOTS: Array<{
  slot: Slot
  label: string
  docKind: string
  keys: { id: string; name: string; path: string }
  accept: string
  icon: typeof FileText
}> = [
  {
    slot: 'appointment',
    label: 'Appointment Letter',
    docKind: 'technical-staff-appointment',
    keys: { id: 'appointmentLetterFileId', name: 'appointmentLetterFileName', path: 'appointmentLetterStoragePath' },
    accept: '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp',
    icon: FileText,
  },
  {
    slot: 'education',
    label: 'Educational Certificate',
    docKind: 'technical-staff-education-certificate',
    keys: { id: 'educationCertificateFileId', name: 'educationCertificateFileName', path: 'educationCertificateStoragePath' },
    accept: '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp',
    icon: GraduationCap,
  },
  {
    slot: 'photo',
    label: 'Photo',
    docKind: 'technical-staff-photo',
    keys: { id: 'photoFileId', name: 'photoFileName', path: 'photoStoragePath' },
    accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
    icon: Camera,
  },
  {
    slot: 'signature',
    label: 'Signature',
    docKind: 'technical-staff-signature',
    keys: { id: 'signatureFileId', name: 'signatureFileName', path: 'signatureStoragePath' },
    accept: '.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf',
    icon: PenLine,
  },
]

const dateInputClass = cn(
  limsFieldClass,
  'min-w-0 pr-2 tabular-nums',
  '[&::-webkit-calendar-picker-indicator]:pointer-events-none',
  '[&::-webkit-calendar-picker-indicator]:opacity-0',
)

function openDatePicker(el: HTMLInputElement | null) {
  if (!el || el.disabled) return
  try {
    if (typeof el.showPicker === 'function') {
      el.showPicker()
      return
    }
  } catch {
    /* fall through */
  }
  el.focus()
  el.click()
}

const btnCls =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none border bg-white transition-colors disabled:opacity-50'

/**
 * Documents of one technical staff member: Appointment Letter, Educational Certificate, Photo and Signature.
 * Each slot is an upload button; once a file is attached it becomes a view button (click = view,
 * double click = delete after confirmation, then it goes back to upload). A checkbox beside the signature
 * applies it to the test reports.
 */
export function StaffDocumentsCell({
  projectId,
  rowIndex,
  row,
  onChanged,
  onDraftChange,
  projectRow = null,
  payloadKind = 'technical-staff',
}: {
  projectId: string
  rowIndex: number
  row: Rec
  onChanged: () => void
  /** Draft (input) row: changes stay in the draft until the row is added, and the Generate Appointment Letter button shows. */
  onDraftChange?: (patch: Rec) => void
  projectRow?: BisProjectRow | null
  /** 'top-management' shows only the signature slot (and its apply checkbox). */
  payloadKind?: 'technical-staff' | 'top-management'
}) {
  const isTop = payloadKind === 'top-management'
  const slots = isTop ? SLOTS.filter((x) => x.slot === 'signature').map((x) => ({ ...x, docKind: 'top-management-signature' })) : SLOTS
  const [genOpen, setGenOpen] = useState(false)
  const [genDate, setGenDate] = useState('')
  const [genRef, setGenRef] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const genDateRef = useRef<HTMLInputElement>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [busy, setBusy] = useState<Slot | null>(null)
  const [viewFile, viewer] = usePdfViewer()
  const [confirm, confirmDialog] = useConfirmDialog()
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const patchRow = async (patch: Rec, mutatePayload?: (payload: Rec) => Rec) => {
    if (onDraftChange) {
      onDraftChange(patch)
      return
    }
    const current = (await fetchBisModulePayload(projectId, payloadKind)) ?? {}
    const rows = Array.isArray((current as Rec).rows) ? ([...((current as Rec).rows as Rec[])] as Rec[]) : []
    if (!rows[rowIndex]) throw new Error('This row is no longer available.')
    rows[rowIndex] = { ...rows[rowIndex], ...patch }
    const next = mutatePayload ? mutatePayload({ ...(current as Rec), rows }) : { ...(current as Rec), rows }
    await saveBisModulePayload(projectId, payloadKind, next)
  }

  const upload = async (s: (typeof SLOTS)[number], file: File | undefined) => {
    const input = inputs.current[s.slot]
    if (input) input.value = ''
    if (!file) return
    setBusy(s.slot)
    try {
      const prepared = s.slot === 'signature' ? await removeSignatureImageBackground(file) : file
      const person = str(row.personName).trim() || `Person ${rowIndex + 1}`
      const uploaded = await uploadBisProjectFile(projectId, prepared, s.docKind, { displayName: `${s.label} — ${person}` })
      await patchRow({
        [s.keys.id]: uploaded.id,
        [s.keys.name]: uploaded.file_name,
        [s.keys.path]: uploaded.storage_path,
      })
      toast.success(`${s.label} attached`)
      onChanged()
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    } finally {
      setBusy(null)
    }
  }

  const view = async (s: (typeof SLOTS)[number]) => {
    try {
      const urls = await createBisProjectFileUrls(str(row[s.keys.path]), str(row[s.keys.name]))
      viewFile(urls.viewUrl, `${s.label} — ${str(row.personName)}`, `${s.label} file is not available. Upload it again.`)
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    }
  }

  const remove = async (s: (typeof SLOTS)[number]) => {
    if (!(await confirm(`Delete the ${s.label} of ${str(row.personName) || 'this person'}?`, { title: `Delete ${s.label}`, confirmLabel: 'Delete', destructive: true }))) return
    setBusy(s.slot)
    try {
      await deleteBisProjectFile({
        id: str(row[s.keys.id]),
        file_name: str(row[s.keys.name]) || s.label,
        storage_path: str(row[s.keys.path]),
      })
      await patchRow(
        { [s.keys.id]: '', [s.keys.name]: '', [s.keys.path]: '', ...(s.slot === 'signature' ? { applySignatureToDocuments: false } : {}) },
      )
      toast.success(`${s.label} deleted`)
      onChanged()
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    } finally {
      setBusy(null)
    }
  }

  const onViewClick = (s: (typeof SLOTS)[number]) => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      void view(s)
    }, 250)
  }
  const onViewDoubleClick = (s: (typeof SLOTS)[number]) => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = null
    void remove(s)
  }

  const hasSignature = Boolean(str(row.signatureFileId).trim())
  const applySignature = Boolean(row.applySignatureToDocuments)

  const setApply = async (checked: boolean) => {
    try {
      await patchRow({ applySignatureToDocuments: checked }, (payload) => {
        const all: Rec[] = (payload.rows as Rec[]).map((r, i) => ({ ...r, applySignatureToDocuments: checked ? i === rowIndex : false }))
        const chosen = checked ? all[rowIndex] : null
        return {
          ...payload,
          rows: all,
          signatoryName: str(chosen?.personName) || str(payload.signatoryName),
          signatoryDesignation: str(chosen?.designation) || str(payload.signatoryDesignation),
        }
      })
      onChanged()
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    }
  }

  const showGenerated = async () => {
    if (!projectRow) return
    try {
      const html = await buildAppointmentLetterHtmlForTechnicalStaff(projectRow, {
        personName: str(row.personName),
        designation: str(row.designation),
        educationalQualification: str(row.educationalQualification),
        experienceYears: str(row.experienceYears),
        appointmentDate: str(row.appointmentDate),
        appointmentReferenceNo: str(row.appointmentReferenceNo),
      })
      setPreviewHtml(html)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not prepare Appointment Letter.')
    }
  }
  const deleteGenerated = async () => {
    if (!(await confirm(`Delete the generated Appointment Letter of ${str(row.personName) || 'this person'}?`, { title: 'Delete Appointment Letter', confirmLabel: 'Delete', destructive: true }))) return
    try {
      await patchRow({ appointmentDate: '', appointmentReferenceNo: '' })
      toast.success('Appointment Letter deleted')
      onChanged()
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    }
  }
  const onGeneratedClick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      void showGenerated()
    }, 250)
  }
  const onGeneratedDoubleClick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = null
    void deleteGenerated()
  }

  const openGenerate = () => {
    if (!projectRow) {
      toast.warning('Save the license first, then create the Appointment Letter.')
      return
    }
    if (!str(row.personName).trim()) {
      toast.warning('Enter the person name before creating the Appointment Letter.')
      return
    }
    setGenDate(str(row.appointmentDate) || new Date().toISOString().slice(0, 10))
    setGenRef(str(row.appointmentReferenceNo))
    setGenOpen(true)
  }

  const generate = async () => {
    if (!projectRow || !genDate.trim()) return
    setGenBusy(true)
    try {
      const html = await buildAppointmentLetterHtmlForTechnicalStaff(projectRow, {
        personName: str(row.personName),
        designation: str(row.designation),
        educationalQualification: str(row.educationalQualification),
        experienceYears: str(row.experienceYears),
        appointmentDate: genDate.trim(),
        appointmentReferenceNo: genRef.trim(),
      })
      await patchRow({ appointmentDate: genDate.trim(), appointmentReferenceNo: genRef.trim() })
      setGenOpen(false)
      setPreviewHtml(html)
      if (!onDraftChange) onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not prepare Appointment Letter.')
    } finally {
      setGenBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-center gap-1">
      {slots.map((s) => {
        const attached = Boolean(str(row[s.keys.id]).trim())
        const Icon = s.icon
        const loading = busy === s.slot
        const isAppointment = s.slot === 'appointment' && !isTop
        const generated = isAppointment && !attached && Boolean(str(row.appointmentDate).trim())
        return (
          <span key={s.slot} className="inline-flex gap-1">
            {isAppointment ? (
              generated ? (
                <button
                  type="button"
                  className={cn(btnCls, 'border-emerald-600 text-emerald-700 hover:bg-emerald-50')}
                  title="View the generated Appointment Letter (double click to delete)"
                  aria-label="View generated Appointment Letter"
                  onClick={onGeneratedClick}
                  onDoubleClick={onGeneratedDoubleClick}
                >
                  <Eye size={14} aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={attached}
                  className={cn(btnCls, 'border-stone-400 text-amber-800 hover:bg-amber-50')}
                  title={attached ? 'An Appointment Letter is already uploaded' : 'Generate Appointment Letter'}
                  aria-label="Generate Appointment Letter"
                  onClick={openGenerate}
                >
                  <FilePlus2 size={14} aria-hidden />
                </button>
              )
            ) : null}
            <input
              ref={(el) => {
                inputs.current[s.slot] = el
              }}
              type="file"
              className="sr-only"
              accept={s.accept}
              tabIndex={-1}
              onChange={(e) => void upload(s, e.target.files?.[0])}
            />
            {attached ? (
              <button
                type="button"
                disabled={loading}
                className={cn(btnCls, 'border-emerald-600 text-emerald-700 hover:bg-emerald-50')}
                title={`View ${s.label} (double click to delete)`}
                aria-label={`View ${s.label}`}
                onClick={() => onViewClick(s)}
                onDoubleClick={() => onViewDoubleClick(s)}
              >
                {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Eye size={14} aria-hidden />}
              </button>
            ) : (
              <button
                type="button"
                disabled={loading || generated}
                className={cn(btnCls, 'border-stone-400 text-amber-800 hover:bg-amber-50')}
                title={generated ? 'An Appointment Letter is already generated' : `Upload ${s.label}`}
                aria-label={`Upload ${s.label}`}
                onClick={() => inputs.current[s.slot]?.click()}
              >
                {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Icon size={14} aria-hidden />}
              </button>
            )}
          </span>
        )
      })}
      <label
        className={cn('ml-1 inline-flex items-center gap-1 text-[11px] font-medium text-stone-700', !hasSignature && 'opacity-50')}
        title={hasSignature ? 'Apply this signature to the test reports' : 'Upload the signature first'}
      >
        <input
          type="checkbox"
          className="h-4 w-4 rounded-none accent-amber-600"
          disabled={!hasSignature}
          checked={applySignature && hasSignature}
          onChange={(e) => void setApply(e.target.checked)}
          aria-label="Apply signature to test reports"
        />
      </label>
      {viewer}
      {confirmDialog}
      {!isTop ? (
        <>
          <Dialog open={genOpen} onOpenChange={(next) => !genBusy && setGenOpen(next)}>
            <DialogContent
              persistOnFocusLoss
              layer="stacked"
              aria-describedby={undefined}
              className={cn(limsDialogClass, 'w-[min(36rem,calc(100vw-1.5rem))] max-w-xl p-0')}
            >
              <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
                <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
                <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                <DialogHeader className="relative pr-10 text-left">
                  <DialogTitle className="text-base font-semibold tracking-tight text-white">Create Appointment Letter</DialogTitle>
                </DialogHeader>
              </div>
              <div className="space-y-3 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
                <p className="text-sm font-medium text-stone-800">
                  {str(row.personName).trim()}
                  {str(row.designation).trim() ? ` · ${str(row.designation).trim()}` : ''}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="sdc-date" className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Date of Joining</Label>
                    <LimsFieldWithAdd
                      addButton={
                        <button
                          type="button"
                          className={limsFieldAddBtnClass}
                          aria-label="Open calendar"
                          title="Pick date"
                          disabled={genBusy}
                          onClick={() => openDatePicker(genDateRef.current)}
                        >
                          <Calendar size={14} strokeWidth={2.25} aria-hidden />
                        </button>
                      }
                    >
                      <Input ref={genDateRef} id="sdc-date" type="date" value={genDate} onChange={(e) => setGenDate(e.target.value)} disabled={genBusy} className={dateInputClass} />
                    </LimsFieldWithAdd>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="sdc-ref" className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Reference Number</Label>
                    <Input id="sdc-ref" value={genRef} onChange={(e) => setGenRef(e.target.value)} disabled={genBusy} placeholder="Enter Reference Number" className={limsFieldClass} />
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
                <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'min-w-[6.5rem]')} onClick={() => setGenOpen(false)} disabled={genBusy}>
                  Cancel
                </Button>
                <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')} onClick={() => void generate()} disabled={genBusy || !genDate.trim()}>
                  {genBusy ? 'Preparing…' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <BisDocumentPrintPreviewDialog
            open={previewHtml != null}
            onOpenChange={(next) => {
              if (!next) setPreviewHtml(null)
            }}
            row={projectRow}
            kind="appointment-letter"
            generatedHtml={previewHtml}
          />
        </>
      ) : null}
    </div>
  )
}
