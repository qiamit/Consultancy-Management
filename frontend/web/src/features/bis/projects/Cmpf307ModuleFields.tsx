import { useRef, useState } from 'react'
import { FileCheck2, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LimsDatePicker } from '@/components/lims/LimsDatePicker'
import { cn } from '@/lib/utils'
import { emptyCmpf307BrandRow, type Cmpf307BrandRow, type Cmpf307ModulePayload } from './cmpf307Model'
import {
  createBisProjectFileUrls,
  deleteBisProjectFile,
  formatBisProjectFilesError,
  uploadBisProjectFile,
  type BisProjectViewFile,
} from './bisProjectFilesApi'
import { openFileInNewTab } from '@/lib/fileViewer'

const inputClass = 'h-9 w-full border border-stone-400 bg-white px-2 text-sm text-stone-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60'
const labelClass = 'flex flex-col gap-1 text-xs font-semibold text-stone-700'
const headingClass = 'border border-stone-700 bg-stone-800 px-2 py-2 text-center text-[10px] font-bold text-amber-200'
type AttachmentKey = 'agreement' | 'trademark'

function fileFromRow(row: Cmpf307BrandRow, key: AttachmentKey): BisProjectViewFile | null {
  const id = key === 'agreement' ? row.agreementFileId : row.trademarkFileId
  const file_name = key === 'agreement' ? row.agreementFileName : row.trademarkFileName
  const storage_path = key === 'agreement' ? row.agreementStoragePath : row.trademarkStoragePath
  return id && file_name && storage_path ? { id, file_name, storage_path } : null
}

function filePatch(key: AttachmentKey, file: BisProjectViewFile | null): Partial<Cmpf307BrandRow> {
  return key === 'agreement'
    ? { agreementFileId: file?.id ?? '', agreementFileName: file?.file_name ?? '', agreementStoragePath: file?.storage_path ?? '' }
    : { trademarkFileId: file?.id ?? '', trademarkFileName: file?.file_name ?? '', trademarkStoragePath: file?.storage_path ?? '' }
}

export function Cmpf307ModuleFields({ value, onChange, disabled = false, projectId }: {
  value: Cmpf307ModulePayload
  onChange: (next: Cmpf307ModulePayload) => void
  disabled?: boolean
  projectId: string | null
}) {
  const [confirm, confirmDialog] = useConfirmDialog()
  const [uploading, setUploading] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<string[]>([])
  const updateRow = (rowId: string, patch: Partial<Cmpf307BrandRow>) => onChange({
    ...value,
    rows: value.rows.map((row) => row.rowId === rowId ? { ...row, ...patch } : row),
  })

  const uploadAttachment = async (row: Cmpf307BrandRow, key: AttachmentKey, file?: File) => {
    if (!file) return
    if (!projectId) { toast.error('Save the Project Before Uploading an Attachment.'); return }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please Select a PDF File.')
      return
    }
    const uploadKey = `${row.rowId}:${key}`
    setUploading(uploadKey)
    try {
      const docKind = key === 'agreement' ? 'cmpf-307-agreement' : 'cmpf-307-trademark-certificate'
      const uploaded = await uploadBisProjectFile(projectId, file, docKind)
      const previous = fileFromRow(row, key)
      updateRow(row.rowId, filePatch(key, uploaded))
      if (previous) await deleteBisProjectFile(previous)
      toast.success(key === 'agreement' ? 'Agreement copy uploaded.' : 'Trademark certificate uploaded.')
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setUploading(null)
    }
  }

  const removeAttachment = async (row: Cmpf307BrandRow, key: AttachmentKey) => {
    const file = fileFromRow(row, key)
    if (!file) return
    try {
      await deleteBisProjectFile(file)
      updateRow(row.rowId, filePatch(key, null))
    } catch (error) { toast.error(formatBisProjectFilesError(error)) }
  }

  const viewAttachment = async (file: BisProjectViewFile) => {
    try {
      const urls = await createBisProjectFileUrls(file.storage_path, file.file_name)
      if (!urls.viewUrl) throw new Error('Unable to open this PDF.')
      openFileInNewTab(urls.viewUrl, file.file_name)
    } catch (error) { toast.error(formatBisProjectFilesError(error)) }
  }

  // One button per attachment: red "Upload" until a PDF is attached, then green — click to view, double-click to delete.
  const clickTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const attachmentControl = (row: Cmpf307BrandRow, key: AttachmentKey, label: string) => {
    const file = fileFromRow(row, key)
    const uploadKey = `${row.rowId}:${key}`
    const busy = uploading === uploadKey
    const btn = 'inline-flex h-8 w-8 items-center justify-center rounded-none border p-0 text-white shadow-sm transition-colors disabled:opacity-60'
    return <div className="mt-1 flex w-full items-center justify-center">
      {!file ? <label
        title={busy ? 'Uploading PDF…' : `Upload ${label} (PDF)`}
        aria-label={busy ? 'Uploading PDF' : `Upload ${label} PDF`}
        className={cn(btn, 'cursor-pointer border-red-700 bg-red-600 hover:bg-red-700', (disabled || uploading !== null) && 'pointer-events-none opacity-60')}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={disabled || uploading !== null} onChange={(event) => {
          const picked = event.target.files?.[0]
          if (picked) void uploadAttachment(row, key, picked)
          event.target.value = ''
        }} />
      </label> : <button
        type="button"
        disabled={disabled}
        title={`${file.file_name} — click to view, double-click to delete`}
        aria-label={`View ${label} (double-click to delete)`}
        className={cn(btn, 'border-green-800 bg-green-600 hover:bg-green-700')}
        onClick={() => {
          clearTimeout(clickTimers.current[uploadKey])
          clickTimers.current[uploadKey] = setTimeout(() => void viewAttachment(file), 250)
        }}
        onDoubleClick={() => {
          clearTimeout(clickTimers.current[uploadKey])
          void confirm(`Delete the ${label}?`, { title: `Delete ${label}`, confirmLabel: 'Delete', destructive: true }).then((ok) => { if (ok) void removeAttachment(row, key) })
        }}
      >
        <FileCheck2 className="h-4 w-4" aria-hidden />
      </button>}
    </div>
  }

  const allSelected = value.rows.length > 0 && selectedRows.length === value.rows.length
  return <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-5">
    {confirmDialog}
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-stone-800">Brand Names / Trade Marks to Be Marked on BIS Standard Mark Product</h3>
      <div className="overflow-x-auto border border-stone-400 bg-white"><table className="list-cards w-full min-w-[900px] table-fixed border-collapse text-xs"><thead><tr>
        <th className={cn(headingClass, 'w-[6%]')}><input type="checkbox" aria-label="Select All Brand Rows" checked={allSelected} disabled={disabled} onChange={(event) => setSelectedRows(event.target.checked ? value.rows.map((row) => row.rowId) : [])} /></th>
        <th className={cn(headingClass, 'w-[31%]')}>Brand Name / Trade Mark</th>
        <th className={cn(headingClass, 'w-[18%]')}>Self / Others</th>
        <th className={cn(headingClass, 'w-[18%]')}>Registered / Unregistered</th>
        <th className={cn(headingClass, 'w-[17%]')}>Date of Introduction</th>
        <th className={cn(headingClass, 'w-[10%]')}>Action</th>
      </tr></thead><tbody>
        {value.rows.map((row, index) => <tr key={row.rowId} className="odd:bg-stone-50">
          <td className="lc-check border border-stone-300 p-2 text-center"><input type="checkbox" aria-label={`Select brand row ${index + 1}`} checked={selectedRows.includes(row.rowId)} disabled={disabled} onChange={(event) => setSelectedRows((current) => event.target.checked ? [...current, row.rowId] : current.filter((id) => id !== row.rowId))} /></td>
          <td data-label="Brand Name / Trade Mark" className="lc-wide border border-stone-300 p-1"><input aria-label={`Brand name or trade mark row ${index + 1}`} className={inputClass} value={row.brandName} disabled={disabled} onChange={(event) => updateRow(row.rowId, { brandName: event.target.value })} /></td>
          <td data-label="Self / Others" className="border border-stone-300 p-1"><Select value={row.ownedBy || 'Self'} disabled={disabled} onValueChange={(ownedBy) => updateRow(row.rowId, { ownedBy })}><SelectTrigger aria-label={`Owner row ${index + 1}`} className="h-9 w-full rounded-none border-stone-400 bg-white px-2 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Self">Self</SelectItem><SelectItem value="Others">Others</SelectItem></SelectContent></Select>{row.ownedBy === 'Others' && attachmentControl(row, 'agreement', 'agreement copy')}</td>
          <td data-label="Registered / Unregistered" className="border border-stone-300 p-1"><Select value={row.registeredStatus || 'Unregistered'} disabled={disabled} onValueChange={(registeredStatus) => updateRow(row.rowId, { registeredStatus })}><SelectTrigger aria-label={`Registration status row ${index + 1}`} className="h-9 w-full rounded-none border-stone-400 bg-white px-2 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Registered">Registered</SelectItem><SelectItem value="Unregistered">Unregistered</SelectItem></SelectContent></Select>{row.registeredStatus === 'Registered' && attachmentControl(row, 'trademark', 'trademark license certificate')}</td>
          <td data-label="Date of Introduction" className="lc-wide border border-stone-300 p-1"><LimsDatePicker aria-label={`Date of introduction row ${index + 1}`} className="h-9 w-full" value={row.registrationDate} disabled={disabled} onChange={(registrationDate) => updateRow(row.rowId, { registrationDate })} /></td>
          <td className="lc-actions border border-stone-300 p-1 text-center"><div className="flex items-center justify-center gap-1"><Button type="button" variant="outline" size="icon" aria-label={`Add brand after row ${index + 1}`} className="h-8 w-8" disabled={disabled} onClick={() => onChange({ ...value, rows: [...value.rows.slice(0, index + 1), emptyCmpf307BrandRow(), ...value.rows.slice(index + 1)] })}><Plus className="h-4 w-4" aria-hidden /></Button><Button type="button" variant="outline" size="icon" aria-label={`Delete brand row ${index + 1}`} className="h-8 w-8" disabled={disabled || value.rows.length === 1} onClick={() => {
            const attachments = [fileFromRow(row, 'agreement'), fileFromRow(row, 'trademark')].filter((file): file is BisProjectViewFile => file !== null)
            void Promise.all(attachments.map(deleteBisProjectFile)).then(() => onChange({ ...value, rows: value.rows.filter((item) => item.rowId !== row.rowId) })).catch((error: unknown) => toast.error(formatBisProjectFilesError(error)))
          }}><Trash2 className="h-4 w-4 text-red-700" aria-hidden /></Button></div></td>
        </tr>)}
      </tbody></table></div>
    </section>

    <label className={labelClass}>Other Brand Names / Trade Marks Used for the Same Product Without BIS Standard Mark — Give Reasons<textarea className={cn(inputClass, 'min-h-20 resize-y py-2')} value={value.brandsWithoutMarkReasons} disabled={disabled} onChange={(event) => onChange({ ...value, brandsWithoutMarkReasons: event.target.value })} /></label>
  </div>
}
