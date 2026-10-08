import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { saveReportSpecifiedRequirement } from './reportResultRows'

export type ReportSpecifiedRequirementEditTarget = {
  parameterId: string
  sectionCode: string
  testName: string
  value: string
}

export function ReportSpecifiedRequirementEditDialog({
  open,
  onOpenChange,
  target,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: ReportSpecifiedRequirementEditTarget | null
  onSaved: (nextValue: string) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !target) return
    setValue(target.value === '—' ? '' : target.value)
    setError(null)
  }, [open, target])

  const handleSave = () => {
    if (!target?.parameterId?.trim()) return
    void (async () => {
      setSaving(true)
      setError(null)
      try {
        const nextValue = value.trim()
        await saveReportSpecifiedRequirement(target.parameterId, nextValue || null)
        onSaved(nextValue)
        onOpenChange(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update specified requirement.')
      } finally {
        setSaving(false)
      }
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit Specified Requirements — Section {target?.sectionCode?.trim() || '—'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {target?.testName?.trim() ? (
            <p className="text-sm font-medium">{target.testName}</p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="report-spec-req-value">Specified Requirement</Label>
            <Textarea
              id="report-spec-req-value"
              rows={3}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 0.10 Maximum"
              disabled={saving}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
