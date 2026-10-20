import { useEffect, useRef, useState } from 'react'
import { Calendar, Check, Eye, LoaderCircle, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { usePdfViewer } from '@/components/ui/usePdfViewer'
import { cn } from '@/lib/utils'
import { limsDialogClass, limsFieldAddBtnClass, limsFieldClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { createBisProjectFileUrls, deleteBisProjectFile, uploadBisProjectFile } from './bisProjectFilesApi'
import { authorizationLetterSelectionError, authorizationLetterSettings, authorizationPeople, authorizationPersonKey, type AuthorizationPerson } from './authorizationLetterModel'
import { ManakDocumentActions } from './ManakDocumentActions'
import { removeSignatureImageBackground } from './removeSignatureBackground'
import type { DeclarationFile } from './manakDeclarationFiles'
import type { BisProjectRow } from './types'
import { APPLICATION_DECLARATION_KIND } from './manakModuleKinds'

const th = 'border border-stone-700 bg-stone-800 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-amber-200'
const td = 'border border-stone-300 px-3 py-2 text-center align-middle'
const imageAccept = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'

export function AuthorizationLetterDialog({ open, onOpenChange, projectRow, legacyFile, onManagementChanged, onSaved }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectRow: BisProjectRow
  legacyFile: DeclarationFile | null
  onManagementChanged?: () => void
  onSaved: (person: Pick<AuthorizationPerson, 'name' | 'designation'>) => void
}) {
  const [tm, setTm] = useState<Record<string, unknown> | null>(null)
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState(() => authorizationLetterSettings(null, null))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [viewFile, viewer] = usePdfViewer()
  const dateInput = useRef<HTMLInputElement>(null)
  const people = authorizationPeople(tm)

  useEffect(() => {
    if (!open) return
    let active = true
    void Promise.all([fetchBisModulePayload(projectRow.id, 'top-management'), fetchBisModulePayload(projectRow.id, 'authorization-letter')])
      .then(([management, saved]) => {
        if (!active) return
        setTm(management)
        setRaw(saved)
        setForm(authorizationLetterSettings(saved, management))
        setError('')
      })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load authorization details.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, projectRow.id])

  const close = (next: boolean) => {
    if (busy) return
    if (!next) { setLoading(true) }
    onOpenChange(next)
  }
  const view = async (file: DeclarationFile, title: string) => {
    try {
      const urls = await createBisProjectFileUrls(file.storagePath, file.fileName)
      viewFile(urls.viewUrl, title, 'This file is unavailable. Please upload it again.')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not open the image.') }
  }
  const uploadImage = async (file: File | undefined, person: AuthorizationPerson) => {
    if (!file) return
    if (!/\.(png|jpe?g|webp)$/i.test(file.name) || (file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) {
      toast.error('Choose a PNG, JPG or WebP image for the signature or seal.')
      return
    }
    setBusy(true)
    try {
      const prepared = await removeSignatureImageBackground(file)
      // Re-read before changing a management signature; never target a row by its table index.
      const current = await fetchBisModulePayload(projectRow.id, 'top-management')
      const rows = Array.isArray(current?.rows) ? current.rows as Record<string, unknown>[] : []
      const matches = rows.filter((row) => row && authorizationPersonKey(row) === person.key)
      if (matches.length !== 1) throw new Error('This management entry has changed. Close and reopen the letter to select it again.')
      const uploaded = await uploadBisProjectFile(projectRow.id, prepared, 'top-management-signature', { displayName: `Signature — ${person.name}` })
      try {
        const next = { ...current, rows: rows.map((row) => row === matches[0] ? { ...row, signatureFileId: uploaded.id, signatureFileName: uploaded.file_name, signatureStoragePath: uploaded.storage_path } : row) }
        await saveBisModulePayload(projectRow.id, 'top-management', next)
        setTm(next)
        onManagementChanged?.()
      } catch (err) {
        await deleteBisProjectFile(uploaded).catch(() => undefined)
        throw err
      }
      toast.success(`Signature saved for ${person.name}.`)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not upload the image.') }
    finally { setBusy(false) }
  }
  /** Saves the letter choices; the letter is previewed / downloaded from its row on Step 7. */
  const save = async () => {
    setBusy(true)
    try {
      const current = await fetchBisModulePayload(projectRow.id, 'top-management')
      setTm(current)
      const validation = authorizationLetterSelectionError(form, current)
      if (validation) throw new Error(validation)
      const payload = { ...raw, ...form }
      await saveBisModulePayload(projectRow.id, 'authorization-letter', payload)
      setRaw(payload)
      const person = authorizationPeople(current).find((item) => item.key === form.authorizedPersonKey)!
      const declaration = await fetchBisModulePayload(projectRow.id, APPLICATION_DECLARATION_KIND)
      await saveBisModulePayload(projectRow.id, APPLICATION_DECLARATION_KIND, { ...declaration, authorizationLetter: 'Yes', submitterName: person.name, submitterDesignation: person.designation })
      onSaved(person)
      toast.success('Authorization Letter Saved.')
      onOpenChange(false)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not save the Authorization Letter.') }
    finally { setBusy(false) }
  }
  const selectPerson = (role: 'person' | 'by') => {
    const key = role === 'person' ? 'authorizedPersonKey' : 'authorizedByKey'
    const selected = people.find((person) => person.key === form[key])
    const signatureFlag = role === 'person' ? 'includePersonSignature' : 'includeBySignature'
    const roleLabel = role === 'person' ? 'Authorized Person' : 'Authorized By'
    return <tr className={role === 'person' ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
      <td className={cn(td, 'lc-title font-semibold')}>{roleLabel} <span className="text-red-600">*</span></td>
      <td data-label="Name" className={cn(td, 'lc-wide')}><select aria-label={roleLabel} className={cn(limsFieldClass, 'w-full min-w-48 text-center [text-align-last:center]')} disabled={loading || busy || !!error} value={form[key]} onChange={(event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))}>
        <option value="">Select from Top Management</option>
        {form[key] && !selected ? <option value={form[key]}>Previously Selected Person — No Longer Available</option> : null}
        {people.map((person) => <option key={person.key} value={person.key}>{person.name}</option>)}
      </select></td>
      <td data-label="Designation" className={cn(td, 'text-center')}>{selected?.designation || '—'}</td>
      <td className={cn(td, 'lc-actions')}><div className="flex flex-wrap items-center justify-center gap-2">
        {selected?.signature ? <>
          <Button type="button" variant="ghost" size="sm" title={`Include Signature — ${roleLabel}`} aria-label={`Include Signature — ${roleLabel}`} aria-pressed={form[signatureFlag]} disabled={busy || loading || !!error} className={cn('h-8 w-8 rounded-none border border-stone-400 p-0 shadow-sm focus-visible:ring-2 focus-visible:ring-amber-500/40', form[signatureFlag] ? 'border-amber-700 bg-amber-700 text-white hover:bg-amber-800 hover:text-white' : 'bg-white/70 text-amber-800 hover:bg-amber-50')} onClick={() => setForm((previous) => ({ ...previous, [signatureFlag]: !previous[signatureFlag] }))}><Check size={15} aria-hidden /></Button>
          <ManakDocumentActions disabled={busy || loading} actions={[{ label: `View Signature — ${roleLabel}`, icon: Eye, onClick: () => void view(selected.signature!, `${selected.name} — Signature`) }]} />
        </> : null}
        <label title={`${selected?.signature ? 'Upload' : 'Add'} Signature — ${roleLabel}`} className={cn('inline-flex h-8 w-8 cursor-pointer items-center justify-center border border-stone-400 bg-white/70 text-amber-800 hover:bg-amber-50', (!selected || busy || loading || !!error) && 'pointer-events-none opacity-40')}>{selected?.signature ? <Upload size={15} /> : <Plus size={15} />}<span className="sr-only">{selected?.signature ? 'Upload' : 'Add'} Signature — {roleLabel}</span><input type="file" accept={imageAccept} className="sr-only" disabled={!selected || busy || loading || !!error} onChange={(event) => { if (selected) void uploadImage(event.target.files?.[0], selected); event.target.value = '' }} /></label>
      </div></td>
    </tr>
  }

  return <>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent persistOnFocusLoss layer="stacked" aria-describedby={undefined} className={cn(limsDialogClass, 'flex max-h-[90vh] w-[min(64rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_2rem))] min-w-0 max-w-6xl flex-col p-0')}>
        <DialogHeader className="bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-2.5 pl-4 pr-12 text-left"><DialogTitle className="text-base font-semibold text-white">Authorization Letter of Person Submitting the Application</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-[#fffcf7] p-4">
          {loading ? <p className="text-sm text-stone-500">Loading Top Management…</p> : error ? <p role="alert" className="text-sm text-red-700">{error}</p> : !people.length ? <p className="text-sm text-amber-800">Add the persons in Step 2 → Top Management before generating this letter.</p> : null}
          <div className="max-w-xs space-y-1"><label htmlFor="authorization-letter-date" className="text-xs font-semibold">Letter Date</label><LimsFieldWithAdd addButton={<button type="button" className={limsFieldAddBtnClass} aria-label="Open Letter Date Calendar" disabled={busy || loading} onClick={() => { try { dateInput.current?.showPicker() } catch { dateInput.current?.focus() } }}><Calendar size={14} /></button>}><input id="authorization-letter-date" ref={dateInput} type="date" className={cn(limsFieldClass, 'min-w-0 tabular-nums [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:opacity-0')} disabled={busy || loading} value={form.letterDate} onChange={(event) => setForm((previous) => ({ ...previous, letterDate: event.target.value }))} /></LimsFieldWithAdd></div>
          <div className="overflow-x-auto"><table className="list-cards w-full min-w-[780px] border-collapse text-sm"><thead><tr><th className={th}>Role</th><th className={th}>Name</th><th className={cn(th, 'text-center')}>Designation</th><th className={cn(th, 'text-center')}>Action</th></tr></thead><tbody>
            {selectPerson('person')}{selectPerson('by')}
          </tbody></table></div>
          {legacyFile ? <Button type="button" variant="outline" className="rounded-none" onClick={() => void view(legacyFile, 'Previously Uploaded Authorization Letter')}><Eye size={15} className="mr-2" />View Previously Uploaded Letter</Button> : null}
        </div>
        <DialogFooter className="flex-wrap gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3">
          <Button type="button" variant="outline" className="rounded-none" disabled={busy} onClick={() => close(false)}>Close</Button>
          <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} disabled={busy || loading || !!error || !people.length} onClick={() => void save()}>{busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {viewer}
  </>
}
