import { useId, useRef, useState } from 'react'
import { Check, ChevronDown, Eye, LoaderCircle, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import { cn } from '@/lib/utils'
import { limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { openPendingPrintWindow } from '../print/openPrintHtml'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { createBisProjectFileUrls, deleteBisProjectFile, uploadBisProjectFile } from './bisProjectFilesApi'
import { APPLICATION_DECLARATION_KIND } from './manakModuleKinds'
import { declarationFileFromProjectFile, declarationFileToProjectFile, type DeclarationFile, type DeclarationSupportingRow, type SupportingDeclarationKind } from './manakDeclarationFiles'

const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const td = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'
const iconButton = 'h-7 w-7 rounded-none border border-stone-400 bg-white/70 p-0 text-amber-800 hover:border-amber-600 hover:bg-amber-50'
const checkbox = 'h-4 w-4 rounded-none border-stone-500 text-amber-700'
const blank = (): DeclarationSupportingRow => ({ id: crypto.randomUUID(), fileName: '', upload: null })

function FileNameSelect({ value, onChange, names, disabled }: { value: string; onChange: (value: string) => void; names: string[]; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const term = value.trim().toLowerCase()
  const options = [...new Set(names.filter((name) => name.trim()))].filter((name) => !term || name.toLowerCase().includes(term)).map((name) => ({ id: name, label: name }))
  return <>
    <label className="sr-only" htmlFor={id}>File Name</label>
    <div className="flex items-center"><div className="min-w-0 flex-1"><FilterCombobox inputId={id} listId={`${id}-options`} value={value} onValueChange={(next) => { onChange(next); setOpen(true) }} options={options} onSelectOption={(option) => { onChange(option.label); setOpen(false) }} open={open && options.length > 0} onOpenChange={setOpen} onInputFocus={() => setOpen(true)} placeholder="Select or Enter File Name" inputClassName="h-8 rounded-none border-stone-400 bg-white px-2 text-sm" disabled={disabled} showSerialNumbers={false} /></div><button type="button" className="flex h-8 w-8 items-center justify-center border border-l-0 border-stone-400 bg-white text-stone-600 disabled:opacity-50" aria-label="Show File Name Options" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((current) => !current)}><ChevronDown size={14} /></button></div>
  </>
}

function AttachmentCell({ file, editable, disabled, onUpload }: { file: DeclarationFile | null; editable: boolean; disabled: boolean; onUpload: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const view = async () => {
    if (!file) return
    const target = openPendingPrintWindow(`Opening ${file.fileName}…`)
    if (!target) { toast.error('Allow popups to view this file.'); return }
    target.opener = null
    try {
      const { viewUrl } = await createBisProjectFileUrls(file.storagePath, file.fileName)
      if (!viewUrl) throw new Error('The file could not be opened.')
      target.location.replace(viewUrl)
    } catch (error) { target.close(); toast.error(error instanceof Error ? error.message : 'Could not open the file.') }
  }
  return <span className="inline-flex items-center gap-1">
    <input ref={input} type="file" className="hidden" aria-label="Upload Supporting File" disabled={disabled} onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ''; if (picked) onUpload(picked) }} />
    {file ? <Button type="button" variant="ghost" className={iconButton} disabled={disabled} title={`View ${file.fileName}`} aria-label={`View ${file.fileName}`} onClick={() => void view()}><Eye size={14} /></Button> : null}
    {editable ? <Button type="button" variant="ghost" className={iconButton} disabled={disabled} title={file ? 'Replace File' : 'Upload File'} aria-label={file ? 'Replace File' : 'Upload File'} onClick={() => input.current?.click()}><Upload size={14} /></Button> : null}
    {!file && !editable ? <span className="text-xs text-stone-400">No file</span> : null}
  </span>
}

/** Same input-row / saved-row pattern as the other Manak tables. */
export function ManakSupportingFilesDialog({ projectId, kind, title, rows, onRowsChange, open, onOpenChange }: {
  projectId: string
  kind: SupportingDeclarationKind
  title: string
  rows: DeclarationSupportingRow[]
  onRowsChange: (rows: DeclarationSupportingRow[]) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [draft, setDraft] = useState(blank)
  const [editing, setEditing] = useState<DeclarationSupportingRow | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const saved = rows.filter((row) => row.fileName.trim() || row.upload)
  const rowsKey = kind === 'otherInformation' ? 'otherInformationRows' : 'otherRequestRows'
  const names = [title, ...saved.map((row) => row.fileName), draft.upload?.fileName ?? '', editing?.upload?.fileName ?? '']

  const commit = async (next: DeclarationSupportingRow[]) => {
    const current = await fetchBisModulePayload(projectId, APPLICATION_DECLARATION_KIND)
    await saveBisModulePayload(projectId, APPLICATION_DECLARATION_KIND, { ...current, [kind]: 'Yes', [rowsKey]: next })
    onRowsChange(next)
  }
  const cleanUp = async (file: DeclarationFile | null) => {
    if (file) await deleteBisProjectFile(declarationFileToProjectFile(file))
  }
  const upload = async (picked: File, target: 'draft' | 'edit') => {
    const row = target === 'draft' ? draft : editing
    if (!row) return
    setBusy(true)
    try {
      const file = declarationFileFromProjectFile(await uploadBisProjectFile(projectId, picked, 'application-declaration'))
      const next = { ...row, upload: file, fileName: row.fileName || picked.name }
      if (target === 'draft') setDraft(next)
      else setEditing(next)
      // Replacing an uncommitted upload can be cleaned up; a saved row's old file stays until Save.
      const original = saved.find((item) => item.id === row.id)?.upload
      if (row.upload && row.upload.id !== original?.id) await cleanUp(row.upload)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not upload the file.') }
    finally { setBusy(false) }
  }
  const addOrSave = async (row: DeclarationSupportingRow, edit: boolean) => {
    if (!row.fileName.trim() || !row.upload) { toast.error('Select or enter a file name and upload a file first.'); return }
    setBusy(true)
    try {
      const next = { ...row, fileName: row.fileName.trim() }
      const original = edit ? saved.find((item) => item.id === row.id)?.upload : null
      await commit(edit ? saved.map((item) => item.id === row.id ? next : item) : [...saved, next])
      if (edit) setEditing(null)
      else setDraft(blank())
      if (original && original.id !== row.upload.id && !saved.some((item) => item.id !== row.id && item.upload?.id === original.id)) await cleanUp(original)
      toast.success(edit ? 'Row updated.' : 'Row added.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save the row.') }
    finally { setBusy(false) }
  }
  const clearDraft = async () => {
    if (draft.upload && !window.confirm('Clear this draft and delete its uploaded file?')) return
    setBusy(true)
    try { await cleanUp(draft.upload); setDraft(blank()) }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not clear the draft.') }
    finally { setBusy(false) }
  }
  const cancelEdit = async () => {
    if (!editing) return
    const original = saved.find((row) => row.id === editing.id)?.upload
    setBusy(true)
    try { if (editing.upload && editing.upload.id !== original?.id) await cleanUp(editing.upload); setEditing(null) }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not cancel the edit.') }
    finally { setBusy(false) }
  }
  const removeRows = async (ids: string[]) => {
    if (!ids.length || !window.confirm(`Delete ${ids.length === 1 ? 'this file row' : `${ids.length} selected file rows`} and its uploaded files?`)) return
    setBusy(true)
    try {
      const next = saved.filter((row) => !ids.includes(row.id))
      await commit(next)
      setSelected(new Set())
      if (editing && ids.includes(editing.id)) setEditing(null)
      const remaining = new Set(next.flatMap((row) => row.upload ? [row.upload.id] : []))
      const files = new Map(saved.filter((row) => ids.includes(row.id)).flatMap((row) => row.upload ? [[row.upload.id, row.upload] as const] : []))
      for (const [id, file] of files) if (!remaining.has(id)) await cleanUp(file)
      toast.success('File rows deleted.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete the file rows.') }
    finally { setBusy(false) }
  }
  const toggle = (id: string, checked: boolean) => setSelected((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next })

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
    <DialogContent persistOnFocusLoss layer="stacked" aria-describedby={undefined} className={cn(limsDialogClass, 'flex max-h-[90vh] w-[min(64rem,calc(100vw-1.5rem))] max-w-5xl flex-col p-0')}>
      <DialogHeader className="bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-2.5 pl-4 pr-12 text-left"><DialogTitle className="text-base font-semibold tracking-tight text-white">{title}</DialogTitle></DialogHeader>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto bg-[#fffcf7] p-4">
        {selected.size ? <div className="flex justify-end"><Button type="button" variant="outline" size="sm" className="rounded-none border-red-300 text-red-700" disabled={busy} onClick={() => void removeRows([...selected])}><Trash2 size={14} className="mr-1" />Delete Selected ({selected.size})</Button></div> : null}
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead><tr><th className={cn(th, 'w-8 px-1 text-center')}><input type="checkbox" className={checkbox} aria-label="Select All File Rows" disabled={busy || !saved.length} checked={saved.length > 0 && saved.every((row) => selected.has(row.id))} onChange={(event) => setSelected(new Set(event.target.checked ? saved.map((row) => row.id) : []))} /></th><th className={th}>File Name<span className="text-red-400">*</span></th><th className={cn(th, 'w-[1%] whitespace-nowrap text-center')}>Upload File<span className="text-red-400">*</span></th><th className={cn(th, 'w-24 text-center')}>Action</th></tr></thead>
          <tbody>
            <tr className="bg-[#fffcf7]"><td className={td} /><td className={td}><FileNameSelect value={draft.fileName} onChange={(fileName) => setDraft({ ...draft, fileName })} names={names} disabled={busy} /></td><td className={cn(td, 'text-center')}><AttachmentCell file={draft.upload} editable disabled={busy} onUpload={(file) => void upload(file, 'draft')} /></td><td className={cn(td, 'text-center')}><span className="inline-flex gap-1"><Button type="button" className="h-7 w-7 rounded-none bg-amber-700 p-0 text-white hover:bg-amber-800" disabled={busy} title="Add File Row" aria-label="Add File Row" onClick={() => void addOrSave(draft, false)}><Plus size={14} /></Button><Button type="button" variant="ghost" className={iconButton} disabled={busy} title="Clear New File Row" aria-label="Clear New File Row" onClick={() => void clearDraft()}><Trash2 size={14} /></Button></span></td></tr>
            {saved.map((row, index) => {
              const edit = editing?.id === row.id
              const value = edit && editing ? editing : row
              return <tr key={row.id} className={index % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}><td className={cn(td, 'px-1 text-center')}><input type="checkbox" className={checkbox} aria-label={`Select ${row.fileName}`} disabled={busy} checked={selected.has(row.id)} onChange={(event) => toggle(row.id, event.target.checked)} /></td><td className={td}>{edit ? <FileNameSelect value={value.fileName} onChange={(fileName) => setEditing({ ...value, fileName })} names={names} disabled={busy} /> : row.fileName}</td><td className={cn(td, 'text-center')}><AttachmentCell file={value.upload} editable={edit} disabled={busy} onUpload={(file) => void upload(file, 'edit')} /></td><td className={cn(td, 'text-center')}><span className="inline-flex gap-1">{edit ? <><Button type="button" variant="ghost" className={iconButton} disabled={busy} title="Save File Row" aria-label="Save File Row" onClick={() => void addOrSave(value, true)}><Check size={14} /></Button><Button type="button" variant="ghost" className={iconButton} disabled={busy} title="Cancel Edit" aria-label="Cancel Edit" onClick={() => void cancelEdit()}><X size={14} /></Button></> : <><Button type="button" variant="ghost" className={iconButton} disabled={busy || editing !== null} title={`Edit ${row.fileName}`} aria-label={`Edit ${row.fileName}`} onClick={() => setEditing({ ...row })}><Pencil size={14} /></Button><Button type="button" variant="ghost" className={iconButton} disabled={busy || editing !== null} title={`Delete ${row.fileName}`} aria-label={`Delete ${row.fileName}`} onClick={() => void removeRows([row.id])}><Trash2 size={14} /></Button></>}</span></td></tr>
            })}
            {!saved.length ? <tr><td colSpan={4} className={cn(td, 'py-3 text-center text-stone-500')}>No records yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3"><Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} disabled={busy} onClick={() => onOpenChange(false)}>{busy ? <LoaderCircle className="mr-1 h-4 w-4 animate-spin" /> : null}Done</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
