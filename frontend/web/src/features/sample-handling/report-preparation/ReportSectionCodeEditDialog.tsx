import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SECTION_CODE_LENGTH,
  sanitizeSectionCodeInput,
} from '@/features/sample-handling/allocation/sectionCode'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { updateReportSectionCode } from './reportResultRows'

export type ReportSectionCodeEditTarget = {
  sectionCode: string
  sampleAllocationId: string
  testAllocationId: string
}

export function ReportSectionCodeEditDialog({
  open,
  onOpenChange,
  sampleId,
  target,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string | null
  target: ReportSectionCodeEditTarget | null
  onSaved: (oldCode: string, newCode: string) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !target) return
    setValue(sanitizeSectionCodeInput(target.sectionCode === '—' ? '' : target.sectionCode))
    setError(null)
  }, [open, target])

  const handleSave = () => {
    if (!target || !sampleId?.trim()) return
    void (async () => {
      setSaving(true)
      setError(null)
      try {
        const newCode = await updateReportSectionCode({
          sampleId,
          sampleAllocationId: target.sampleAllocationId,
          testAllocationId: target.testAllocationId,
          currentSectionCode: target.sectionCode,
          newSectionCode: value,
        })
        onSaved(target.sectionCode, newCode)
        onOpenChange(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update section code.')
      } finally {
        setSaving(false)
      }
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'flex w-[calc(100%-1.5rem)] max-w-md flex-col sm:w-full',
          'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Edit Section Code
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="space-y-3 bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4 sm:px-5">
          <div className="space-y-2">
            <Label
              htmlFor="report-section-code"
              className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
            >
              Section Code
            </Label>
            <Input
              id="report-section-code"
              value={value}
              onChange={(e) => setValue(sanitizeSectionCodeInput(e.target.value))}
              maxLength={SECTION_CODE_LENGTH}
              autoComplete="off"
              spellCheck={false}
              className={cn(limsFieldClass, 'font-mono uppercase tracking-wide')}
              disabled={saving}
            />
          </div>
          {error ? (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-stone-400 bg-stone-100/80 px-4 py-3 sm:px-5">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={handleSave}
            disabled={saving || !value.trim()}
          >
            {saving ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
