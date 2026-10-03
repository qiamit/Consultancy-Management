import { useEffect, useState } from 'react'
import { Eye, Pencil, Star, Trash2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { DocumentTemplateKind } from '@/features/settings/lab-settings/documentTemplateTypes'
import {
  deleteQuotationNote,
  fetchQuotationNotes,
  insertQuotationNote,
  setDefaultQuotationNote,
  updateQuotationNote,
  type QuotationNoteRow,
} from './quotationNotesApi'

export function ManageQuotationNotesDialog({
  open,
  onOpenChange,
  onChanged,
  onDefaultSet,
  documentKind = 'quotation',
  documentLabel = 'Quotation',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: (notes: QuotationNoteRow[], defaultContent: string) => void
  onDefaultSet?: (content: string) => void
  documentKind?: DocumentTemplateKind
  documentLabel?: string
}) {
  const [notes, setNotes] = useState<QuotationNoteRow[]>([])
  const [draftLabel, setDraftLabel] = useState('')
  const [draftText, setDraftText] = useState('')
  const [setAsDefault, setSetAsDefault] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewingNote, setViewingNote] = useState<QuotationNoteRow | null>(null)

  const resetDraft = () => {
    setDraftLabel('')
    setDraftText('')
    setEditingId(null)
    setSetAsDefault(true)
  }

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchQuotationNotes(documentKind)
      setNotes(rows)
      const def = rows.find((n) => n.isDefault)?.content ?? ''
      onChanged?.(rows, def)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) {
      resetDraft()
      setError(null)
      setViewingNote(null)
      return
    }
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on open only
  }, [open, documentKind])

  const canSave = draftLabel.trim().length > 0 && draftText.trim().length > 0

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const label = draftLabel.trim()
      const content = draftText.trim()
      if (editingId) {
        await updateQuotationNote(editingId, label, content)
        if (setAsDefault) {
          await setDefaultQuotationNote(editingId, documentKind)
          onDefaultSet?.(content)
        }
      } else {
        const makeDefault = setAsDefault || notes.length === 0
        await insertQuotationNote(label, content, makeDefault, documentKind)
        if (makeDefault) onDefaultSet?.(content)
      }
      resetDraft()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note')
    } finally {
      setSaving(false)
    }
  }

  const handleSetDefault = async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      await setDefaultQuotationNote(id, documentKind)
      const content = notes.find((n) => n.id === id)?.content
      if (content) onDefaultSet?.(content)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (notes.length <= 1) return
    setSaving(true)
    setError(null)
    try {
      const wasDefault = notes.find((n) => n.id === id)?.isDefault
      await deleteQuotationNote(id)
      const remaining = notes.filter((n) => n.id !== id)
      if (wasDefault && remaining[0]) {
        await setDefaultQuotationNote(remaining[0].id, documentKind)
      }
      if (editingId === id) resetDraft()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(limsDialogClass, 'w-[min(720px,96vw)] max-w-3xl')}
          aria-describedby={undefined}
          layer="nested"
          persistOnFocusLoss
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
              }}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Manage Notes — {documentLabel}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <div className="space-y-3 rounded-none border border-stone-500 bg-stone-50/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-700">
                  {editingId ? 'Edit Note' : 'Add Note'}
                </p>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  <input
                    type="checkbox"
                    checked={setAsDefault}
                    onChange={(e) => setSetAsDefault(e.target.checked)}
                    className="h-4 w-4 rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                  />
                  Set as Default
                </label>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="quotation-note-label"
                  className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                >
                  Note Label
                </Label>
                <Input
                  id="quotation-note-label"
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  placeholder="e.g. General"
                  className="h-10 rounded-none border-stone-500 bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="quotation-note-text"
                  className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                >
                  Note Text
                </Label>
                <Textarea
                  id="quotation-note-text"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Add New Note"
                  rows={3}
                  className="min-h-[72px] resize-y rounded-none border-stone-500 bg-white"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  className={cn(limsPrimaryBtnClass, 'h-9 px-3 text-sm')}
                  disabled={!canSave || saving}
                  onClick={() => void handleSave()}
                >
                  {saving ? 'Saving…' : editingId ? 'Update' : 'Add'}
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-none border border-stone-500">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-stone-800 text-amber-200">
                    <th className="w-12 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider">
                      #
                    </th>
                    <th className="w-[24%] px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider">
                      Note Label
                    </th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider">
                      Note Text
                    </th>
                    <th className="w-36 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-[#f7f3eb]">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-center text-stone-500">
                        Loading…
                      </td>
                    </tr>
                  ) : notes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-center text-stone-500">
                        No notes yet. Add one above.
                      </td>
                    </tr>
                  ) : (
                    notes.map((note, index) => (
                      <tr key={note.id} className="border-t border-stone-300">
                        <td className="px-2 py-2 text-center align-middle text-xs font-medium tabular-nums text-stone-600">
                          {index + 1}
                        </td>
                        <td className="max-w-0 px-3 py-2 text-left align-middle text-stone-800">
                          <span className="block min-w-0 truncate font-medium" title={note.label}>
                            {note.label}
                          </span>
                        </td>
                        <td className="max-w-0 px-3 py-2 text-center align-middle text-stone-800">
                          <div className="flex items-center justify-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-full max-w-[9rem] rounded-none border-stone-500 px-2 text-[11px] font-semibold uppercase tracking-wide text-stone-700"
                              onClick={() => setViewingNote(note)}
                              aria-label={`View ${note.label}`}
                              title={note.content}
                            >
                              <Eye size={13} aria-hidden />
                              View
                            </Button>
                          </div>
                        </td>
                        <td className="w-36 px-3 py-2 align-middle">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              className={cn(
                                'text-stone-500 hover:text-amber-800',
                                note.isDefault && 'text-amber-700',
                              )}
                              aria-label={note.isDefault ? 'This note is default' : 'Set as default'}
                              title={note.isDefault ? 'Default' : 'Set as default'}
                              disabled={saving || note.isDefault}
                              onClick={() => void handleSetDefault(note.id)}
                            >
                              <Star
                                size={15}
                                fill={note.isDefault ? 'currentColor' : 'none'}
                                aria-hidden
                              />
                            </button>
                            <button
                              type="button"
                              className="text-amber-800 hover:text-amber-950"
                              aria-label="Edit note"
                              title="Edit"
                              disabled={saving}
                              onClick={() => {
                                setEditingId(note.id)
                                setDraftLabel(note.label)
                                setDraftText(note.content)
                                setSetAsDefault(note.isDefault)
                                window.requestAnimationFrame(() => {
                                  document.getElementById('quotation-note-label')?.focus()
                                })
                              }}
                            >
                              <Pencil size={14} aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="text-red-600 hover:text-red-800 disabled:opacity-40"
                              aria-label="Delete note"
                              title="Delete"
                              disabled={saving || notes.length <= 1}
                              onClick={() => void handleDelete(note.id)}
                            >
                              <Trash2 size={14} aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>

          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              onClick={() => onOpenChange(false)}
            >
              Save &amp; Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewingNote != null} onOpenChange={(next) => !next && setViewingNote(null)}>
        <DialogContent
          className={cn(limsDialogClass, 'w-[min(560px,94vw)] max-w-lg')}
          aria-describedby={undefined}
          layer="stacked"
          persistOnFocusLoss
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                {viewingNote?.label || 'Note'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="max-h-[50vh] overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-800">
              {viewingNote?.content}
            </p>
          </div>
          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              onClick={() => setViewingNote(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
