import { useRef, useState } from 'react'
import { Camera, Eye, FileText, GraduationCap, Loader2, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { usePdfViewer } from '@/components/ui/usePdfViewer'
import { cn } from '@/lib/utils'
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
}: {
  projectId: string
  rowIndex: number
  row: Rec
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<Slot | null>(null)
  const [viewFile, viewer] = usePdfViewer()
  const [confirm, confirmDialog] = useConfirmDialog()
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const patchRow = async (patch: Rec, mutatePayload?: (payload: Rec) => Rec) => {
    const current = (await fetchBisModulePayload(projectId, 'technical-staff')) ?? {}
    const rows = Array.isArray((current as Rec).rows) ? ([...((current as Rec).rows as Rec[])] as Rec[]) : []
    if (!rows[rowIndex]) throw new Error('This row is no longer available.')
    rows[rowIndex] = { ...rows[rowIndex], ...patch }
    const next = mutatePayload ? mutatePayload({ ...(current as Rec), rows }) : { ...(current as Rec), rows }
    await saveBisModulePayload(projectId, 'technical-staff', next)
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

  return (
    <div className="flex items-center justify-center gap-1">
      {SLOTS.map((s) => {
        const attached = Boolean(str(row[s.keys.id]).trim())
        const Icon = s.icon
        const loading = busy === s.slot
        return (
          <span key={s.slot} className="inline-flex">
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
                disabled={loading}
                className={cn(btnCls, 'border-stone-400 text-amber-800 hover:bg-amber-50')}
                title={`Upload ${s.label}`}
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
        Sign
      </label>
      {viewer}
      {confirmDialog}
    </div>
  )
}
