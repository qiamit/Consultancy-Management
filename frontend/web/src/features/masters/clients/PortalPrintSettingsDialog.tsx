import { useEffect, useMemo, useState } from 'react'
import { Loader2, Printer, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchBisProjectById } from '@/features/bis/projects/bisProjectsApi'
import { clientDisplayName, formatCmL, isCodeDisplayLabel } from '@/features/bis/projects/types'
import {
  buildRecordPrintHtml,
  DEFAULT_SIGNATURES,
  printSettingsOf,
  type PrintHeader,
  type PrintOrientation,
} from '@/features/portal/recordPrint'
import { limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { printHtmlInFrame } from '@/lib/printHtmlInFrame'
import { cn } from '@/lib/utils'
import { updateSection, type AdminSection } from './portalRecordsAdminApi'

/**
 * Records Setup → Print Settings of one section (owner, 21 Nov 2026): how the customer's printed register looks.
 * The columns come from the section itself; here: title, page, which columns print, blank rows, signature boxes.
 * The preview shows the blank register with this licence's header.
 */
export function PortalPrintSettingsDialog({
  section,
  licenceId,
  onClose,
  onSaved,
}: {
  section: AdminSection
  licenceId: string
  onClose: () => void
  onSaved: () => void
}) {
  const initial = useMemo(() => printSettingsOf(section.print_settings), [section.print_settings])
  const [title, setTitle] = useState(initial.title)
  const [note, setNote] = useState(initial.note)
  const [orientation, setOrientation] = useState<PrintOrientation>(initial.orientation)
  const [hidden, setHidden] = useState<string[]>(initial.hidden_columns)
  const [blankRows, setBlankRows] = useState(String(initial.blank_rows))
  const [signatures, setSignatures] = useState(initial.signatures.join(', '))
  const [showResult, setShowResult] = useState(initial.show_result)
  const [showLimits, setShowLimits] = useState(initial.show_limits)
  const [header, setHeader] = useState<PrintHeader>({ company: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchBisProjectById(licenceId)
      .then((row) => {
        if (cancelled || !row) return
        setHeader({
          company: clientDisplayName(row),
          licence: row.cm_l_digits ? formatCmL(row.cm_l_digits) : '',
          isLabel: isCodeDisplayLabel(row),
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [licenceId])

  const settings = useMemo(
    () => ({
      title: title.trim(),
      note: note.trim(),
      orientation,
      hidden_columns: hidden.filter((k) => section.columns.some((c) => c.key === k)),
      blank_rows: Math.min(60, Math.max(1, Math.round(Number(blankRows) || 20))),
      signatures: signatures
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 5),
      show_result: showResult,
      show_limits: showLimits,
    }),
    [title, note, orientation, hidden, blankRows, signatures, showResult, showLimits, section.columns],
  )

  const previewHtml = useMemo(
    () => buildRecordPrintHtml({ section: { ...section, print_settings: settings }, header, entries: null }),
    [section, settings, header],
  )

  const save = async () => {
    setSaving(true)
    try {
      await updateSection(section.id, { print_settings: settings })
      toast.success('Print Settings Saved')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Save the Print Settings')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (key: string, show: boolean) =>
    setHidden((prev) => (show ? prev.filter((k) => k !== key) : [...new Set([...prev, key])]))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(limsDialogClass, 'flex max-h-[92dvh] w-[min(64rem,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden bg-white p-0')}
      >
        <div className="flex h-14 shrink-0 items-center bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4">
          <DialogHeader className="flex-1 space-y-0 pr-10 text-left">
            <DialogTitle className="truncate text-base font-semibold text-white">Print Settings — {section.name}</DialogTitle>
          </DialogHeader>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="print-title">Print Title</Label>
              <Input id="print-title" placeholder={section.name} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="print-note">Line Under the Title (Optional)</Label>
              <Input id="print-note" placeholder="e.g. Frequency: Every Heat" value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="print-page">Page</Label>
                <select
                  id="print-page"
                  className="h-10 w-full border border-stone-300 bg-white px-2 text-sm"
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as PrintOrientation)}
                >
                  <option value="auto">Auto (by Columns)</option>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="print-rows">Rows in Blank Format</Label>
                <Input id="print-rows" type="number" min={1} max={60} value={blankRows} onChange={(e) => setBlankRows(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="print-signs">Signature Boxes (Comma Separated)</Label>
              <Input
                id="print-signs"
                placeholder={DEFAULT_SIGNATURES.join(', ')}
                value={signatures}
                maxLength={200}
                onChange={(e) => setSignatures(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={showResult} onChange={(e) => setShowResult(e.target.checked)} /> Result Column
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={showLimits} onChange={(e) => setShowLimits(e.target.checked)} /> Limits Under Headings
              </label>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-stone-900">Columns in the Print</p>
              {section.columns.length === 0 ? (
                <p className="text-xs text-stone-600">This Section Has No Columns Yet.</p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto border border-stone-200 p-2">
                  {section.columns.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!hidden.includes(c.key)} onChange={(e) => toggle(c.key, e.target.checked)} />
                      <span className="truncate">{c.label}</span>
                      {c.unit ? <span className="text-xs text-stone-500">({c.unit})</span> : null}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-stone-600">S. No, Date and the Ref No Column Always Print. The Header (Company, Licence, IS) Comes From the Licence.</p>
            </div>
          </div>
          <div className="flex min-h-[26rem] flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-stone-900">Preview (Blank Format)</p>
              <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-8 gap-1.5 text-xs')} onClick={() => printHtmlInFrame(previewHtml)}>
                <Printer size={14} aria-hidden /> Print Preview
              </Button>
            </div>
            <iframe title="Print Preview" className="min-h-[26rem] w-full flex-1 border border-stone-300 bg-white" srcDoc={previewHtml} sandbox="allow-same-origin" />
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3">
          <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
