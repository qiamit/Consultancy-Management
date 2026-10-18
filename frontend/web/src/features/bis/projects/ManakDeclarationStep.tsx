import { UndertakingEditorDialog, type EditableUndertakingKind } from './UndertakingEditorDialog'
import { useEffect, useState } from 'react'
import { Check, ChevronDown, Download, Eye, FileDown, LoaderCircle, Pencil, Trash2, Upload } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { limsDialogClass } from '@/lib/limsThemeUi'
import { triggerPdfDownload } from '@/lib/playwrightPdfClient'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { createBisProjectFileUrls } from './bisProjectFilesApi'
import type { BisProjectRow } from './types'
import { AuthorizationLetterDialog } from './AuthorizationLetterDialog'
import { authorizationLetterSelectionError, authorizationLetterSettings } from './authorizationLetterModel'
import { APPLICATION_DECLARATION_KIND } from './manakModuleKinds'
import { ManakDocumentActions } from './ManakDocumentActions'
import { buildMergedBisProjectFilesPdf } from './mergeBisProjectFilesPdf'
import { FileAttachButton } from './RowFileAttachment'
import { ManakSupportingFilesDialog } from './ManakSupportingFilesDialog'
import { declarationFileFromProjectFile, declarationFileToProjectFile, type DeclarationFile as UploadRef, type DeclarationSupportingRow as SupportingRow } from './manakDeclarationFiles'

type YesNo = 'Yes' | 'No'
type GeneratedDeclarationKind = 'undertaking-other' | 'undertaking-indian-standards' | 'authorization-letter' | 'undertaking-option-2' | 'undertaking-general'
type UploadDocumentKey = 'statutoryPermissions' | 'otherInformation' | 'otherRequest' | 'authorizationLetter'
type UploadDocument = { key: UploadDocumentKey; label: string; applicable: YesNo; files: UploadRef[] }
type DeclarationForm = {
  statutoryPermissions: YesNo
  statutoryPermissionFile: UploadRef | null
  otherInformation: YesNo
  otherInformationRows: SupportingRow[]
  otherRequest: YesNo
  otherRequestRows: SupportingRow[]
  submitterName: string
  submitterDesignation: string
  authorizationLetter: YesNo
  authorizationFile: UploadRef | null
  weeklyOffs: YesNo
  offDays: string[]
  undertakingOption2: YesNo
  undertakingGeneral: YesNo
  undertakingIndianStandards: YesNo
  undertakingOther: YesNo
}

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const td = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'
const checkbox = 'h-4 w-4 rounded-none border-stone-500 text-amber-700 disabled:opacity-40'
const label = 'w-[1%] whitespace-nowrap border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-2 text-left align-top text-sm font-bold text-stone-800'
const control = 'h-9 rounded-none border-stone-400 bg-white px-2 text-sm'

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}
function yesNo(value: unknown, fallback: YesNo = 'No'): YesNo {
  return value === 'Yes' || value === 'No' ? value : fallback
}
function fileRef(value: unknown): UploadRef | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<UploadRef>
  return item.id && item.fileName && item.storagePath
    ? { id: item.id, fileName: item.fileName, storagePath: item.storagePath }
    : null
}
function rowList(value: unknown): SupportingRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    return [{ id: text(row.id) || crypto.randomUUID(), fileName: text(row.fileName), upload: fileRef(row.upload) }]
  })
}
function formFrom(value: Record<string, unknown> | null, defaults: { name: string; designation: string }): DeclarationForm {
  const weeklyOffs = yesNo(value?.weeklyOffs)
  const savedDays = Array.isArray(value?.offDays) ? days.filter((day) => (value.offDays as unknown[]).includes(day)) : []
  return {
    statutoryPermissions: yesNo(value?.statutoryPermissions),
    statutoryPermissionFile: fileRef(value?.statutoryPermissionFile),
    otherInformation: yesNo(value?.otherInformation),
    otherInformationRows: rowList(value?.otherInformationRows),
    otherRequest: yesNo(value?.otherRequest),
    otherRequestRows: rowList(value?.otherRequestRows),
    submitterName: text(value?.submitterName) || defaults.name,
    submitterDesignation: text(value?.submitterDesignation) || defaults.designation,
    authorizationLetter: yesNo(value?.authorizationLetter),
    authorizationFile: fileRef(value?.authorizationFile),
    weeklyOffs,
    offDays: weeklyOffs === 'Yes' ? savedDays.length ? savedDays : ['Sunday'] : [],
    undertakingOption2: yesNo(value?.undertakingOption2),
    undertakingGeneral: yesNo(value?.undertakingGeneral),
    undertakingIndianStandards: yesNo(value?.undertakingIndianStandards),
    undertakingOther: yesNo(value?.undertakingOther),
  }
}

function FileActions({ file, onRemove }: { file: UploadRef; onRemove?: () => void }) {
  const [urls, setUrls] = useState<{ viewUrl?: string; downloadUrl?: string }>({})
  useEffect(() => {
    let active = true
    void createBisProjectFileUrls(file.storagePath, file.fileName).then((result) => { if (active) setUrls(result) }).catch((error: unknown) => { if (active) toast.error(error instanceof Error ? error.message : 'Could not load file actions.') })
    return () => { active = false }
  }, [file.fileName, file.storagePath])
  return <span className="inline-flex flex-wrap items-center gap-1 text-xs">
    <span className="max-w-56 truncate" title={file.fileName}>{file.fileName}</span>
    {urls.viewUrl ? <a className="inline-flex items-center gap-1 border border-stone-300 px-2 py-1 text-stone-700 hover:bg-stone-100" href={urls.viewUrl} target="_blank" rel="noreferrer" aria-label={`View ${file.fileName}`}><Eye className="h-3.5 w-3.5" /> View</a> : null}
    {urls.downloadUrl ? <a className="inline-flex items-center gap-1 border border-stone-300 px-2 py-1 text-stone-700 hover:bg-stone-100" href={urls.downloadUrl} aria-label={`Download ${file.fileName}`}><Download className="h-3.5 w-3.5" /> Download</a> : null}
    {onRemove ? <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Remove</button> : null}
  </span>
}

export function ManakDeclarationStep({ projectRow, defaultName, defaultDesignation, onOpenUndertaking, renderDocActions, selection, onManagementChanged }: { projectRow: BisProjectRow; defaultName: string; defaultDesignation: string; onOpenUndertaking: (kind: 'undertaking-option-2' | 'undertaking-general') => void; renderDocActions?: (kind: GeneratedDeclarationKind, onModuleEdit: () => void) => ReactNode; selection?: { has: (kind: GeneratedDeclarationKind) => boolean; set: (kind: GeneratedDeclarationKind, selected: boolean) => void }; onManagementChanged?: () => void }) {
  const [undertakingEditor, setUndertakingEditor] = useState<EditableUndertakingKind | null>(null)
  const openUndertaking = (kind: 'undertaking-option-2' | EditableUndertakingKind) => {
    if (kind === 'undertaking-option-2') onOpenUndertaking(kind)
    else setUndertakingEditor(kind)
  }
  const projectId = projectRow.id
  const [form, setForm] = useState(() => formFrom(null, { name: defaultName, designation: defaultDesignation }))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [selectedUploads, setSelectedUploads] = useState<Set<UploadDocumentKey>>(new Set())
  const [selectedUndertakings, setSelectedUndertakings] = useState<Set<string>>(() => new Set([
    ...(selection?.has('undertaking-option-2') ? ['option-2'] : []),
    ...(selection?.has('undertaking-general') ? ['general'] : []),
    ...(selection?.has('undertaking-indian-standards') ? ['indian-standards'] : []),
    ...(selection?.has('undertaking-other') ? ['other'] : []),
  ]))
  const [editor, setEditor] = useState<Exclude<UploadDocumentKey, 'statutoryPermissions'> | null>(null)
  const [preview, setPreview] = useState<UploadDocumentKey | null>(null)
  const [previewFileId, setPreviewFileId] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [downloading, setDownloading] = useState(false)

  const uploadDocuments: UploadDocument[] = [
    { key: 'statutoryPermissions', label: 'Statutory Permissions for the Product Category', applicable: form.statutoryPermissions, files: form.statutoryPermissionFile ? [form.statutoryPermissionFile] : [] },
    { key: 'otherInformation', label: 'Other Information', applicable: form.otherInformation, files: form.otherInformationRows.flatMap((row) => row.upload ? [row.upload] : []) },
    { key: 'otherRequest', label: 'Other Request for Consideration', applicable: form.otherRequest, files: form.otherRequestRows.flatMap((row) => row.upload ? [row.upload] : []) },
    { key: 'authorizationLetter', label: 'Authorization Letter of Person Submitting the Application', applicable: form.authorizationLetter, files: form.authorizationFile ? [form.authorizationFile] : [] },
  ]
  const previewDocument = uploadDocuments.find((document) => document.key === preview)
  const previewFile = previewDocument?.files.find((file) => file.id === previewFileId) ?? previewDocument?.files[0]
  const previewPath = previewFile?.storagePath
  const previewName = previewFile?.fileName

  useEffect(() => {
    let active = true
    if (!previewPath || !previewName) return
    void createBisProjectFileUrls(previewPath, previewName)
      .then((urls) => { if (active) { if (!urls.viewUrl) throw new Error('Preview URL is unavailable.'); setPreviewUrl(urls.viewUrl) } })
      .catch((error: unknown) => { if (active) setPreviewError(error instanceof Error ? error.message : 'Could not preview this file.') })
    return () => { active = false }
  }, [previewPath, previewName])

  useEffect(() => {
    let active = true
    void fetchBisModulePayload(projectId, APPLICATION_DECLARATION_KIND)
      .then((payload) => { if (active) setForm(formFrom(payload, { name: defaultName, designation: defaultDesignation })) })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not load declaration details.'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, defaultName, defaultDesignation])

  const update = <K extends keyof DeclarationForm>(key: K, value: DeclarationForm[K]) => setForm((current) => ({ ...current, [key]: value }))
  const save = async () => {
    if (!form.submitterName.trim() || !form.submitterDesignation.trim()) {
      toast.error('Enter the submitting person’s name and designation.')
      return
    }
    if (form.statutoryPermissions === 'Yes' && !form.statutoryPermissionFile) {
      toast.error('Upload the statutory permission document or select No.')
      return
    }
    if (form.otherInformation === 'Yes' && (!form.otherInformationRows.length || form.otherInformationRows.some((row) => !row.upload || !row.fileName.trim()))) {
      toast.error('Add a file and file name for each additional information row.')
      return
    }
    if (form.otherRequest === 'Yes' && (!form.otherRequestRows.length || form.otherRequestRows.some((row) => !row.upload || !row.fileName.trim()))) {
      toast.error('Add a file and file name for each request row.')
      return
    }
    if (form.weeklyOffs === 'Yes' && !form.offDays.length) {
      toast.error('Select at least one weekly off day.')
      return
    }
    setSaving(true)
    try {
      if (form.authorizationLetter === 'Yes' && !form.authorizationFile) {
        const [letter, management] = await Promise.all([fetchBisModulePayload(projectId, 'authorization-letter'), fetchBisModulePayload(projectId, 'top-management')])
        const validation = authorizationLetterSelectionError(authorizationLetterSettings(letter, management), management)
        if (validation) throw new Error(`Authorization Letter: ${validation}`)
      }
      await saveBisModulePayload(projectId, APPLICATION_DECLARATION_KIND, form as unknown as Record<string, unknown>)
      toast.success('Declaration details saved.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save declaration details.') }
    finally { setSaving(false) }
  }

  const yesNoSelect = (value: YesNo, onChange: (next: YesNo) => void, ariaLabel: string) => <Select value={value} disabled={loading || saving || uploading !== null} onValueChange={(next) => onChange(next as YesNo)}><SelectTrigger aria-label={ariaLabel} className="mx-auto h-8 w-24 rounded-none border-stone-300 bg-white text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent></Select>

  const setUploadApplicable = (key: UploadDocumentKey, value: YesNo) => {
    update(key, value)
    if (key === 'authorizationLetter' && value === 'No') selection?.set('authorization-letter', false)
    if (value === 'No') setSelectedUploads((current) => { const next = new Set(current); next.delete(key); return next })
  }
  const toggleUploadSelection = (key: UploadDocumentKey, selected: boolean) => setSelectedUploads((current) => {
    const next = new Set(current)
    if (selected) next.add(key)
    else next.delete(key)
    return next
  })
  const showPreview = (key: UploadDocumentKey) => {
    setPreviewFileId('')
    setPreviewUrl('')
    setPreviewError('')
    setPreview(key)
  }
  const openUploadEditor = (key: UploadDocumentKey) => {
    if (key !== 'statutoryPermissions') setEditor(key)
  }
  const downloadAttachments = async (clicked?: UploadDocumentKey) => {
    const documents = uploadDocuments.filter((document) => document.applicable === 'Yes' && (selectedUploads.size ? selectedUploads.has(document.key) : document.key === clicked))
    if (!documents.length) return
    const missing = documents.find((document) => !document.files.length)
    if (missing) { toast.error(`Upload a file for ${missing.label} before downloading.`); return }
    const paths = new Set(documents.flatMap((document) => document.files.map((file) => file.storagePath)))
    setDownloading(true)
    try {
      const bytes = await buildMergedBisProjectFilesPdf(projectId, ['application-declaration'], { strict: true, storagePaths: [...paths] })
      if (!bytes) throw new Error('No attached PDF or image files were found for these documents.')
      const owned = new Uint8Array(bytes.byteLength)
      owned.set(bytes)
      triggerPdfDownload(new Blob([owned.buffer], { type: 'application/pdf' }), `${documents.length === 1 ? documents[0].label : 'Selected Declaration Attachments'}.pdf`)
      toast.success('Declaration attachments downloaded.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not download declaration attachments.') }
    finally { setDownloading(false) }
  }
  const undertakingDocuments = [
    { key: 'option-2', label: 'Undertaking for Option 2', kind: 'undertaking-option-2' as const, applicable: form.undertakingOption2, setApplicable: (value: YesNo) => update('undertakingOption2', value) },
    { key: 'general', label: 'Undertaking for General', kind: 'undertaking-general' as const, applicable: form.undertakingGeneral, setApplicable: (value: YesNo) => update('undertakingGeneral', value) },
    { key: 'indian-standards', label: 'Undertaking as per Indian Standards', kind: 'undertaking-indian-standards' as const, applicable: form.undertakingIndianStandards, setApplicable: (value: YesNo) => update('undertakingIndianStandards', value) },
    { key: 'other', label: 'Undertaking Other if Required', kind: 'undertaking-other' as const, applicable: form.undertakingOther, setApplicable: (value: YesNo) => update('undertakingOther', value) },
  ]
  const applicableUploads = uploadDocuments.filter((document) => document.key !== 'authorizationLetter' && document.applicable === 'Yes')
  const applicableUndertakings = undertakingDocuments.filter((document) => document.applicable === 'Yes')
  const toggleUndertakingSelection = (document: typeof undertakingDocuments[number], selected: boolean) => {
    const next = new Set(selectedUndertakings)
    if (selected) next.add(document.key)
    else next.delete(document.key)
    setSelectedUndertakings(next)
    // Each row has its own document and saved payload.
    selection?.set(document.kind, undertakingDocuments.some((item) => item.kind === document.kind && item.applicable === 'Yes' && next.has(item.key)))
  }
  const allSelected = applicableUploads.length + applicableUndertakings.length + (form.authorizationLetter === 'Yes' ? 1 : 0) > 0
    && applicableUploads.every((document) => selectedUploads.has(document.key))
    && applicableUndertakings.every((document) => selectedUndertakings.has(document.key))
    && (form.authorizationLetter !== 'Yes' || !!selection?.has('authorization-letter'))

  return <>
    {loading ? <p className="text-xs text-stone-500">Loading Declaration Details…</p> : null}
    <div className="mb-3 overflow-x-auto border border-stone-300 bg-white">
      <table className="w-full min-w-[760px] border-collapse text-sm"><tbody><tr>
        <th className={label}>Name of Person Submitted the Application <span className="text-red-600">*</span></th>
        <td className={td}><Input aria-label="Name of Person Submitted the Application" className={control} value={form.submitterName} onChange={(event) => update('submitterName', event.target.value)} /></td>
        <th className={label}>Designation <span className="text-red-600">*</span></th>
        <td className={td}><Input aria-label="Designation" className={control} value={form.submitterDesignation} onChange={(event) => update('submitterDesignation', event.target.value)} /></td>
      </tr></tbody></table>
    </div>
    <section className="mb-4 border-2 border-stone-500 bg-[#fffcf7] ring-1 ring-amber-700/20">
      <header className="flex items-center justify-between bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-sm text-white">
        <h3 className="font-semibold tracking-tight">Declaration and Undertaking</h3>
      </header>
      <div className="space-y-3 p-3">
    <section className="border border-stone-300 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead><tr>
            <th className={cn(th, 'w-8 px-1 text-center')}><input type="checkbox" className={checkbox} aria-label="Select All Applicable Declaration Documents" disabled={loading || !applicableUploads.length && !applicableUndertakings.length && form.authorizationLetter !== 'Yes'} checked={allSelected} onChange={(event) => {
              const selected = event.target.checked
              setSelectedUploads(new Set(selected ? applicableUploads.map((document) => document.key) : []))
              setSelectedUndertakings(new Set(selected ? applicableUndertakings.map((document) => document.key) : []))
              for (const kind of ['undertaking-option-2', 'undertaking-general', 'undertaking-indian-standards', 'undertaking-other'] as const) selection?.set(kind, selected && applicableUndertakings.some((document) => document.kind === kind))
              selection?.set('authorization-letter', selected && form.authorizationLetter === 'Yes')
            }} /></th>
            <th className={th}>Document Name</th>
            <th className={cn(th, 'w-[1%] whitespace-nowrap text-center')}>Applicable<span className="text-red-400">*</span></th>
            <th className={cn(th, 'w-[1%] text-center')}>Action</th>
          </tr></thead>
          <tbody>
            {uploadDocuments.map((document, index) => {
              const yes = document.applicable === 'Yes'
              return <tr key={document.key} className={index % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                <td className={cn(td, 'px-1 text-center')}><input type="checkbox" className={checkbox} aria-label={`Select ${document.label}`} disabled={!yes || loading} checked={yes && (document.key === 'authorizationLetter' ? !!selection?.has('authorization-letter') : selectedUploads.has(document.key))} onChange={(event) => document.key === 'authorizationLetter' ? selection?.set('authorization-letter', event.target.checked) : toggleUploadSelection(document.key, event.target.checked)} /></td>
                <td className={cn(td, 'font-semibold text-stone-800')}>{yes && document.key !== 'statutoryPermissions' ? <button type="button" className="text-left font-semibold hover:text-amber-800 hover:underline" onClick={() => openUploadEditor(document.key)}>{document.label}</button> : document.label}</td>
                <td className={cn(td, 'text-center')}>{yesNoSelect(document.applicable, (value) => setUploadApplicable(document.key, value), `${document.label} Applicable`)}</td>
                <td className={cn(td, 'whitespace-nowrap text-center')}>{yes ? document.key === 'authorizationLetter' ? renderDocActions?.('authorization-letter', () => setEditor('authorizationLetter')) ?? <ManakDocumentActions actions={[{ label: 'Edit — Authorization Letter', icon: Pencil, onClick: () => setEditor('authorizationLetter') }]} /> : document.key === 'statutoryPermissions' ? <FileAttachButton projectId={projectId} docKind="application-declaration" label="Statutory Permissions" file={form.statutoryPermissionFile ? declarationFileToProjectFile(form.statutoryPermissionFile) : null} disabled={loading || saving || downloading} onBusyChange={(busy) => setUploading(busy ? 'statutoryPermissions' : null)} onChange={async (file) => {
                  const next = file ? declarationFileFromProjectFile(file) : null
                  const current = await fetchBisModulePayload(projectId, APPLICATION_DECLARATION_KIND)
                  await saveBisModulePayload(projectId, APPLICATION_DECLARATION_KIND, { ...current, statutoryPermissions: form.statutoryPermissions, statutoryPermissionFile: next })
                  update('statutoryPermissionFile', next)
                }} /> : <ManakDocumentActions disabled={loading || saving || downloading || uploading !== null} actions={[
                  { label: `Edit — ${document.label}`, icon: Pencil, onClick: () => openUploadEditor(document.key) },
                  { label: `Preview — ${document.label}`, icon: Eye, onClick: () => showPreview(document.key), disabled: !document.files.length },
                  { label: `Download PDF — ${document.label}`, icon: FileDown, onClick: () => void downloadAttachments(document.key), disabled: !document.files.length },
                  { label: `Upload — ${document.label}`, icon: Upload, onClick: () => openUploadEditor(document.key) },
                ]} /> : <span className="text-xs text-stone-400">Not applicable</span>}</td>
              </tr>
            })}
            {undertakingDocuments.map((document, index) => <tr key={document.key} className={index % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
              <td className={cn(td, 'px-1 text-center')}><input type="checkbox" className={checkbox} aria-label={`Select ${document.label}`} disabled={document.applicable !== 'Yes' || !selection} checked={document.applicable === 'Yes' && selectedUndertakings.has(document.key)} onChange={(event) => toggleUndertakingSelection(document, event.target.checked)} /></td>
              <td className={cn(td, 'font-semibold text-stone-800')}>{document.applicable === 'Yes' ? <button type="button" className="text-left font-semibold hover:text-amber-800 hover:underline" onClick={() => openUndertaking(document.kind)}>{document.label}</button> : document.label}</td>
              <td className={cn(td, 'text-center')}>{yesNoSelect(document.applicable, (value) => {
                document.setApplicable(value)
                if (value === 'No') toggleUndertakingSelection(document, false)
              }, `${document.label} Applicable`)}</td>
              <td className={cn(td, 'whitespace-nowrap text-center')}>{document.applicable === 'Yes' ? renderDocActions?.(document.kind, () => openUndertaking(document.kind)) ?? <ManakDocumentActions actions={[{ label: `Edit — ${document.label}`, icon: Pencil, onClick: () => openUndertaking(document.kind) }]} /> : <span className="text-xs text-stone-400">Not applicable</span>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {selectedUploads.size > 0 ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-300 bg-stone-50 px-3 py-2">
        <span className="text-xs text-stone-600">{selectedUploads.size} Attachment {selectedUploads.size === 1 ? 'Row' : 'Rows'} Selected</span>
        <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => setSelectedUploads(new Set())}>Clear</Button>
        <Button type="button" variant="outline" size="sm" className="rounded-none text-amber-800" disabled={downloading || uploading !== null} onClick={() => void downloadAttachments()}><FileDown size={15} className="mr-1" />{downloading ? 'Downloading…' : 'Download Selected Attachments'}</Button>
      </div> : null}
    </section>

    <section className="border border-stone-300 bg-white">
      <h4 className="border-b border-stone-300 bg-stone-800 px-3 py-1.5 text-sm font-semibold text-amber-200">Weekly Offs</h4>
      <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><tbody>
        <tr>
          <td className={cn(td, 'w-[1%] whitespace-nowrap bg-[#f7f3eb]')}><div className="flex items-center gap-4"><span className="font-bold text-stone-800">Weekly Offs <span className="text-red-600">*</span></span>{yesNoSelect(form.weeklyOffs, (weeklyOffs) => setForm((current) => ({ ...current, weeklyOffs, offDays: weeklyOffs === 'Yes' ? current.offDays.length ? current.offDays : ['Sunday'] : [] })), 'Weekly offs')}</div></td>
          <td className={td}>{form.weeklyOffs === 'Yes' ? <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label="Off Days" className="h-8 min-w-48 max-w-full justify-between gap-4 rounded-none border-stone-300 bg-white text-sm font-normal" disabled={loading || saving || uploading !== null}><span className="truncate">{form.offDays.join(', ') || 'Select Off Days'}</span><ChevronDown size={14} className="shrink-0" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48 rounded-none">{days.map((day) => <DropdownMenuCheckboxItem key={day} className="gap-4 rounded-none pl-2 [&>span:first-child]:hidden" checked={form.offDays.includes(day)} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => setForm((current) => ({ ...current, offDays: days.filter((item) => item === day ? checked === true : current.offDays.includes(item)) }))}>{day}{form.offDays.includes(day) ? <Check size={14} className="ml-auto" aria-hidden /> : null}</DropdownMenuCheckboxItem>)}</DropdownMenuContent>
          </DropdownMenu> : null}</td>
        </tr>
      </tbody></table></div>
    </section>

    <div className="flex justify-end"><Button type="button" disabled={saving || loading || uploading !== null} onClick={() => void save()} className="rounded-none bg-amber-700 text-white hover:bg-amber-800">{saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}{saving ? 'Saving…' : 'Save Declaration'}</Button></div>
      </div>
    </section>
    {undertakingEditor ? <UndertakingEditorDialog key={`${projectId}-${undertakingEditor}`} row={projectRow} kind={undertakingEditor} open onOpenChange={(open) => { if (!open) setUndertakingEditor(null) }} /> : null}
    <AuthorizationLetterDialog projectRow={projectRow} legacyFile={form.authorizationFile} open={editor === 'authorizationLetter'} onOpenChange={(open) => setEditor(open ? 'authorizationLetter' : null)} onManagementChanged={onManagementChanged} onSaved={(person) => setForm((current) => ({ ...current, authorizationLetter: 'Yes', submitterName: person.name, submitterDesignation: person.designation }))} />
    <ManakSupportingFilesDialog projectId={projectId} kind="otherInformation" title="Other Information" rows={form.otherInformationRows} onRowsChange={(rows) => update('otherInformationRows', rows)} open={editor === 'otherInformation'} onOpenChange={(open) => setEditor(open ? 'otherInformation' : null)} />
    <ManakSupportingFilesDialog projectId={projectId} kind="otherRequest" title="Other Request for Consideration" rows={form.otherRequestRows} onRowsChange={(rows) => update('otherRequestRows', rows)} open={editor === 'otherRequest'} onOpenChange={(open) => setEditor(open ? 'otherRequest' : null)} />
    <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null) }}>
      <DialogContent persistOnFocusLoss layer="stacked" aria-describedby={undefined} className={cn(limsDialogClass, 'flex h-[85vh] w-[min(80rem,calc(100vw-1.5rem))] max-w-7xl flex-col p-0')}>
        <DialogHeader className="bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-2.5 pl-4 pr-12 text-left"><DialogTitle className="text-base font-semibold tracking-tight text-white">Preview — {previewDocument?.label}</DialogTitle></DialogHeader>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-300 bg-[#fffcf7] p-3">
          {(previewDocument?.files.length ?? 0) > 1 ? <select aria-label="Select Attachment to Preview" className={control} value={previewFile?.id ?? ''} onChange={(event) => { setPreviewFileId(event.target.value); setPreviewUrl(''); setPreviewError('') }}>{previewDocument?.files.map((file) => <option key={file.id} value={file.id}>{file.fileName}</option>)}</select> : null}
          {previewFile ? <FileActions key={previewFile.id} file={previewFile} /> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-stone-100">
          {previewError ? <p className="p-4 text-sm text-red-700">{previewError}</p> : !previewUrl ? <p className="p-4 text-sm text-stone-500">Loading Preview…</p> : /\.(png|jpe?g|gif|webp)$/i.test(previewName ?? '') ? <img src={previewUrl} alt={previewName} className="mx-auto max-h-full max-w-full object-contain" /> : /\.pdf$/i.test(previewName ?? '') ? <iframe src={previewUrl} title={`Preview ${previewName}`} className="h-full w-full border-0" /> : <p className="p-4 text-sm text-stone-600">Use View or Download above to open this file in its original format.</p>}
        </div>
      </DialogContent>
    </Dialog>
  </>
}
