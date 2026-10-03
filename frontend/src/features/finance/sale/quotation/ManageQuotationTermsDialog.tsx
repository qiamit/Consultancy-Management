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
  deleteQuotationTerm,
  fetchQuotationTerms,
  insertQuotationTerm,
  setDefaultQuotationTerm,
  updateQuotationTerm,
  type QuotationTermRow,
} from './quotationTermsApi'

export function ManageQuotationTermsDialog({
  open,
  onOpenChange,
  onChanged,
  onDefaultSet,
  documentKind = 'quotation',
  documentLabel = 'Quotation',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: (terms: QuotationTermRow[], defaultContent: string) => void
  onDefaultSet?: (content: string) => void
  documentKind?: DocumentTemplateKind
  documentLabel?: string
}) {
  const [terms, setTerms] = useState<QuotationTermRow[]>([])
  const [draftLabel, setDraftLabel] = useState('')
  const [draftText, setDraftText] = useState('')
  const [setAsDefault, setSetAsDefault] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewingTerm, setViewingTerm] = useState<QuotationTermRow | null>(null)

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
      const rows = await fetchQuotationTerms(documentKind)
      setTerms(rows)
      const def = rows.find((t) => t.isDefault)?.content ?? ''
      onChanged?.(rows, def)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load terms')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) {
      resetDraft()
      setError(null)
      setViewingTerm(null)
      return
    }
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on open / module
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
        await updateQuotationTerm(editingId, label, content)
        if (setAsDefault) {
          await setDefaultQuotationTerm(editingId, documentKind)
          onDefaultSet?.(content)
        }
      } else {
        const makeDefault = setAsDefault || terms.length === 0
        await insertQuotationTerm(label, content, makeDefault, documentKind)
        if (makeDefault) onDefaultSet?.(content)
      }
      resetDraft()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save term')
    } finally {
      setSaving(false)
    }
  }

  const handleSetDefault = async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      await setDefaultQuotationTerm(id, documentKind)
      const content = terms.find((t) => t.id === id)?.content
      if (content) onDefaultSet?.(content)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (terms.length <= 1) return
    setSaving(true)
    setError(null)
    try {
      const wasDefault = terms.find((t) => t.id === id)?.isDefault
      await deleteQuotationTerm(id)
      const remaining = terms.filter((t) => t.id !== id)
      if (wasDefault && remaining[0]) {
        await setDefaultQuotationTerm(remaining[0].id, documentKind)
      }
      if (editingId === id) resetDraft()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete term')
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
                Manage Terms &amp; Conditions — {documentLabel}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <div className="space-y-3 rounded-none border border-stone-500 bg-stone-50/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-700">
                  {editingId ? 'Edit Term & Condition' : 'Add Term & Condition'}
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
                  htmlFor="quotation-term-label"
                  className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                >
                  Term &amp; Condition Label
                </Label>
                <Input
                  id="quotation-term-label"
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  placeholder="e.g. Standard Payment Terms"
                  className="h-10 rounded-none border-stone-500 bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="quotation-term-text"
                  className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                >
                  Term &amp; Condition Text
                </Label>
                <Textarea
                  id="quotation-term-text"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Add New Term & Condition"
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
                      Term &amp; Condition Label
                    </th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider">
                      Term &amp; Condition Text
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
                  ) : terms.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-center text-stone-500">
                        No terms yet. Add one above.
                      </td>
                    </tr>
                  ) : (
                    terms.map((term, index) => {
                      return (
                        <tr key={term.id} className="border-t border-stone-300">
                          <td className="px-2 py-2 text-center align-middle text-xs font-medium tabular-nums text-stone-600">
                            {index + 1}
                          </td>
                          <td className="max-w-0 px-3 py-2 text-left align-middle text-stone-800">
                            <span className="block min-w-0 truncate font-medium" title={term.label}>
                              {term.label}
                            </span>
                          </td>
                          <td className="max-w-0 px-3 py-2 text-center align-middle text-stone-800">
                            <div className="flex items-center justify-center">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 w-full max-w-[9rem] rounded-none border-stone-500 px-2 text-[11px] font-semibold uppercase tracking-wide text-stone-700"
                                onClick={() => setViewingTerm(term)}
                                aria-label={`View ${term.label}`}
                                title={term.content}
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
                                  term.isDefault && 'text-amber-700',
                                )}
                                aria-label={
                                  term.isDefault ? 'This term is default' : 'Set as default'
                                }
                                title={term.isDefault ? 'Default' : 'Set as default'}
                                disabled={saving || term.isDefault}
                                onClick={() => void handleSetDefault(term.id)}
                              >
                                <Star
                                  size={15}
                                  fill={term.isDefault ? 'currentColor' : 'none'}
                                  aria-hidden
                                />
                              </button>
                              <button
                                type="button"
                                className="text-amber-800 hover:text-amber-950"
                                aria-label="Edit term"
                                title="Edit"
                                disabled={saving}
                                onClick={() => {
                                  setEditingId(term.id)
                                  setDraftLabel(term.label)
                                  setDraftText(term.content)
                                  setSetAsDefault(term.isDefault)
                                  window.requestAnimationFrame(() => {
                                    document.getElementById('quotation-term-label')?.focus()
                                  })
                                }}
                              >
                                <Pencil size={14} aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="text-red-600 hover:text-red-800 disabled:opacity-40"
                                aria-label="Delete term"
                                title="Delete"
                                disabled={saving || terms.length <= 1}
                                onClick={() => void handleDelete(term.id)}
                              >
                                <Trash2 size={14} aria-hidden />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
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

      <Dialog open={viewingTerm != null} onOpenChange={(next) => !next && setViewingTerm(null)}>
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
                {viewingTerm?.label || 'Term & Condition'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="max-h-[50vh] overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-800">
              {viewingTerm?.content}
            </p>
          </div>
          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              onClick={() => setViewingTerm(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
