import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CalibrationPointRow, CalibrationPointsColumn } from './types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  layer?: 'default' | 'nested' | 'stacked' | 'top' | 'overlay' | 'above'
  columns: CalibrationPointsColumn[]
  rows: CalibrationPointRow[]
  onApply: (columns: CalibrationPointsColumn[], rows: CalibrationPointRow[]) => void
}

/** Minimal setup dialog stub (calibration package not vendored). */
export function CalibrationPointsTableSetupDialog({
  open,
  onOpenChange,
  title,
  layer = 'stacked',
  columns,
  rows,
  onApply,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer={layer} className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-stone-600">
          {columns.length} column(s), {rows.length} row(s). Edit tables from Intermediate Check
          history after go-live calibration UI is restored.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={() => { onApply(columns, rows); onOpenChange(false) }}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
