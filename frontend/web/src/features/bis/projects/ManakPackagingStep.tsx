import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Eye, Import, Loader2, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import { PACKAGING_MARKING_DEFAULTS } from '../print/manufacturingStepDocumentsHtml'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { createBisProjectFileUrls, uploadBisProjectFile } from './bisProjectFilesApi'
import { BisModuleImportDialog } from './BisModuleImportDialog'
import { PACKAGING_COMPONENTS_KIND } from './manakModuleKinds'
import { ManakPanel } from './ManakStepPages'
import type { BisProjectRow } from './types'

type Rec = Record<string, unknown>
type Payload = Rec | null | undefined
type YesNo = 'Yes' | 'No'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

const thCls =
  'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'
const checkCls = 'h-4 w-4 rounded-none border-stone-500 text-amber-700 disabled:opacity-40'
const headerBtn =
  'h-8 w-8 shrink-0 rounded-none border border-amber-500/60 bg-stone-800 p-0 text-amber-200 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-600 hover:text-white'
const labelCls = 'w-[1%] whitespace-nowrap border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-2 text-left align-top text-sm font-bold text-stone-800'
const valueCls = 'border border-[#e7e0d4] px-2 py-1.5 align-top'
const inputCls = 'h-9 rounded-none border-stone-400 bg-white px-2 text-sm'

type ComponentKey = 'packaging' | 'brand'
type PackagingComponent = { key: ComponentKey; label: string; printKind: BisPrintDocumentKind; editKind?: BisPrintDocumentKind }

const COMPONENTS: PackagingComponent[] = [
  // Preview / print / download give the Self Evaluation Form: packaging from here, plus raw materials,
  // quality control in-charge and brand names from their own modules.
  { key: 'packaging', label: 'Packaging and Marking', printKind: 'self-evaluation-form' },
  { key: 'brand', label: 'Brand Details', printKind: 'cmpf-307', editKind: 'cmpf-307' },
]

/** Manak Online "Method of Marking" choices. */
const MARKING_METHODS = ['Printing', 'Embossing', 'Engraving', 'Etching', 'Stencilling', 'Label / Sticker', 'Tag', 'Any Other']

type PackagingForm = {
  natureOfPackaging: string
  quantityPerPackage: string
  markingOnArticle: string
  methodOfMarking: string
  methodOfMarkingOther: string
  batchNumbering: string
  markingDeviation: string
  labelFileId: string
  labelFileName: string
  labelStoragePath: string
}

/** Prefilled for a new application (same defaults the document prints until details are saved). */
const DEFAULT_FORM: PackagingForm = {
  ...PACKAGING_MARKING_DEFAULTS,
  labelFileId: '',
  labelFileName: '',
  labelStoragePath: '',
}

function formFrom(payload: Payload): PackagingForm {
  if (!payload || !Object.keys(payload).length) return { ...DEFAULT_FORM }
  const form = Object.fromEntries(Object.keys(DEFAULT_FORM).map((k) => [k, str(payload[k])])) as PackagingForm
  // Added later: older saved details get the usual wording.
  if (!form.markingDeviation) form.markingDeviation = DEFAULT_FORM.markingDeviation
  return form
}

const REQUIRED: Array<[keyof PackagingForm, string]> = [
  ['natureOfPackaging', 'Nature of Packaging'],
  ['quantityPerPackage', 'Quantity Per Package'],
  ['markingOnArticle', 'Marking on Article'],
  ['methodOfMarking', 'Method of Marking'],
  ['batchNumbering', 'Batch or Code or Serial numbering'],
]

function PackagingMarkingDialog({
  open,
  onOpenChange,
  projectRow,
  saved,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectRow: BisProjectRow
  saved: Payload
  onSaved: () => void
}) {
  const [form, setForm] = useState<PackagingForm>(() => formFrom(saved))
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const set = (key: keyof PackagingForm, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    const missing = REQUIRED.find(([k]) => !form[k].trim())
    if (missing) {
      toast.error(`${missing[1]} is required.`)
      return
    }
    if (form.methodOfMarking === 'Any Other' && !form.methodOfMarkingOther.trim()) {
      toast.error('Describe the method of marking.')
      return
    }
    setBusy(true)
    try {
      await saveBisModulePayload(projectRow.id, 'packaging-marking', { ...form })
      toast.success('Packaging and Marking saved')
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const uploadLabel = async (file: File) => {
    setUploading(true)
    try {
      const uploaded = await uploadBisProjectFile(projectRow.id, file, 'packaging-label')
      setForm((f) => ({ ...f, labelFileId: uploaded.id, labelFileName: uploaded.file_name, labelStoragePath: uploaded.storage_path }))
      toast.success('Label attached — click Save to keep it.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const viewLabel = async () => {
    try {
      const urls = await createBisProjectFileUrls(form.labelStoragePath, form.labelFileName)
      if (urls.viewUrl) window.open(urls.viewUrl, '_blank', 'noopener')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the label')
    }
  }

  const text = (key: keyof PackagingForm, placeholder?: string) => (
    <Input className={inputCls} value={form[key]} placeholder={placeholder} disabled={busy} onChange={(e) => set(key, e.target.value)} />
  )
  const req = <span className="text-red-600">*</span>

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'flex max-h-[90vh] w-[min(64rem,calc(100vw-1.5rem))] max-w-5xl flex-col p-0')}
        >
          <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-2.5 pl-4 pr-12 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">Packaging and Marking</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={headerBtn}
              title="Import from another Application"
              aria-label="Import from another Application"
              onClick={() => setImportOpen(true)}
            >
              <Import size={15} aria-hidden />
            </Button>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fffcf7] p-4">
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr>
                  <th scope="row" className={labelCls}>Nature of Packaging{req}:</th>
                  <td className={valueCls}>{text('natureOfPackaging')}</td>
                </tr>
                <tr>
                  <th scope="row" className={labelCls}>Quantity Per Package{req}:</th>
                  <td className={valueCls}>{text('quantityPerPackage')}</td>
                </tr>
                <tr>
                  <th scope="row" className={labelCls}>Marking on Article{req}:</th>
                  <td className={valueCls}>{text('markingOnArticle')}</td>
                </tr>
                <tr>
                  <th scope="row" className={labelCls}>Method of Marking{req}:</th>
                  <td className={valueCls}>
                    <div className="grid gap-1.5 sm:grid-cols-[14rem_1fr]">
                    <Select value={form.methodOfMarking || undefined} onValueChange={(v) => set('methodOfMarking', v)}>
                      <SelectTrigger className="h-9 rounded-none border-stone-400 bg-white text-sm" aria-label="Method of Marking">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {MARKING_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.methodOfMarking === 'Any Other' ? text('methodOfMarkingOther', 'Describe the method') : null}
                    </div>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className={labelCls}>Form of Label(s):</th>
                  <td className={valueCls}>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void uploadLabel(file)
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || uploading}
                        className={cn(limsOutlineBtnClass, 'h-9 gap-1.5 rounded-none px-3 text-xs')}
                        onClick={() => fileRef.current?.click()}
                      >
                        {uploading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Paperclip size={14} aria-hidden />}
                        {form.labelFileName ? 'Replace file' : 'Choose file'}
                      </Button>
                      {form.labelFileName ? (
                        <>
                          <span className="max-w-[12rem] truncate text-xs text-stone-700" title={form.labelFileName}>
                            {form.labelFileName}
                          </span>
                          <Button type="button" variant="ghost" className="h-8 w-8 rounded-none border border-stone-400 p-0 text-amber-800" title="View label" onClick={() => void viewLabel()}>
                            <Eye size={14} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 w-8 rounded-none border border-stone-400 p-0 text-red-700"
                            title="Remove label"
                            onClick={() => setForm((f) => ({ ...f, labelFileId: '', labelFileName: '', labelStoragePath: '' }))}
                          >
                            <X size={14} />
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-stone-400">No file chosen</span>
                      )}
                    </div>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className={labelCls}>Batch / Code / Serial Numbering{req}:</th>
                  <td className={valueCls}>{text('batchNumbering')}</td>
                </tr>
                <tr>
                  <th scope="row" className={labelCls}>
                    In What Manner Marking Differs
                    <br />
                    from the Provisions in the IS:
                  </th>
                  <td className={valueCls}>{text('markingDeviation')}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3">
            <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'min-w-[6.5rem]')} disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} disabled={busy || uploading} onClick={() => void save()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <BisModuleImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        targetRow={projectRow}
        kind="packaging-marking"
        onPickSource={async (sourceProjectId) => {
          const source = await fetchBisModulePayload(sourceProjectId, 'packaging-marking')
          if (!source) throw new Error('The selected application has no Packaging and Marking details.')
          const fields = formFrom(source)
          // The label file belongs to the other application; keep this one's.
          setForm((f) => ({ ...fields, labelFileId: f.labelFileId, labelFileName: f.labelFileName, labelStoragePath: f.labelStoragePath }))
          toast.success('Packaging and Marking imported', { description: 'Click Save to keep it.' })
        }}
      />
    </>
  )
}

export function ManakPackagingStep({
  projectRow,
  payloads,
  onChanged,
  onEdit,
  renderDocActions,
  selection,
}: {
  projectRow: BisProjectRow
  payloads: Partial<Record<BisPrintDocumentKind, Payload>>
  onChanged: () => void
  onEdit: (kind: BisPrintDocumentKind) => void
  renderDocActions?: (kind: BisPrintDocumentKind, onModuleEdit: () => void) => ReactNode
  selection?: { has: (kind: BisPrintDocumentKind) => boolean; set: (kind: BisPrintDocumentKind, selected: boolean) => void }
}) {
  const savedApplicable = useMemo(() => {
    const raw = payloads[PACKAGING_COMPONENTS_KIND]?.applicable
    return raw && typeof raw === 'object' ? (raw as Partial<Record<ComponentKey, YesNo>>) : {}
  }, [payloads])
  const [pending, setPending] = useState<Partial<Record<ComponentKey, YesNo>>>({})
  const applicable = { ...savedApplicable, ...pending }
  const isApplicable = (c: PackagingComponent) => (applicable[c.key] ?? 'Yes') === 'Yes'
  const [packagingOpen, setPackagingOpen] = useState(false)

  const setComponentApplicable = async (c: PackagingComponent, value: YesNo) => {
    const next = { ...applicable, [c.key]: value }
    setPending((p) => ({ ...p, [c.key]: value }))
    if (value === 'No') selection?.set(c.printKind, false)
    try {
      await saveBisModulePayload(projectRow.id, PACKAGING_COMPONENTS_KIND, { ...(payloads[PACKAGING_COMPONENTS_KIND] ?? {}), applicable: next })
      onChanged()
    } catch (err) {
      setPending((p) => {
        const rest = { ...p }
        delete rest[c.key]
        return rest
      })
      toast.error(err instanceof Error ? err.message : 'Could not save')
    }
  }

  const editComponent = (c: PackagingComponent) => () => {
    if (c.editKind) onEdit(c.editKind)
    else setPackagingOpen(true)
  }

  return (
    <>
      <ManakPanel title="Packaging And Brand Details">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={cn(thCls, 'w-8 px-1 text-center')} aria-label="Select" />
                <th className={thCls}>Packaging Component</th>
                <th className={cn(thCls, 'w-[1%] whitespace-nowrap text-center')}>
                  Applicable<span className="text-red-400">*</span>
                </th>
                <th className={cn(thCls, 'w-[1%] text-center')}>Action</th>
              </tr>
            </thead>
            <tbody>
              {COMPONENTS.map((c, n) => {
                const yes = isApplicable(c)
                return (
                  <tr key={c.key} className={n % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                    <td className={cn(tdCls, 'px-1 text-center')}>
                      <input
                        type="checkbox"
                        className={checkCls}
                        aria-label={`Select ${c.label}`}
                        disabled={!yes || !selection}
                        checked={yes && Boolean(selection?.has(c.printKind))}
                        onChange={(e) => selection?.set(c.printKind, e.target.checked)}
                      />
                    </td>
                    <td className={cn(tdCls, 'font-semibold text-stone-800')}>
                      {yes ? (
                        <button type="button" className="text-left font-semibold hover:text-amber-800 hover:underline" onClick={editComponent(c)}>
                          {c.label}
                        </button>
                      ) : (
                        c.label
                      )}
                    </td>
                    <td className={cn(tdCls, 'text-center')}>
                      <Select value={yes ? 'Yes' : 'No'} onValueChange={(v) => void setComponentApplicable(c, v as YesNo)}>
                        <SelectTrigger className="mx-auto h-8 w-24 rounded-none border-stone-300 bg-white text-sm" aria-label={`${c.label} applicable`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className={cn(tdCls, 'whitespace-nowrap text-center')}>
                      {yes ? renderDocActions?.(c.printKind, editComponent(c)) : <span className="text-xs text-stone-400">Not applicable</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ManakPanel>
      {packagingOpen ? (
        <PackagingMarkingDialog
          open={packagingOpen}
          onOpenChange={setPackagingOpen}
          projectRow={projectRow}
          saved={payloads['packaging-marking']}
          onSaved={onChanged}
        />
      ) : null}
    </>
  )
}
