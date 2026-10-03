import { useMemo } from 'react'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IntermediateCheckHistoryPanel } from './IntermediateCheckHistoryPanel'
import {
  filterIntermediateCheckHistoryLastYears,
  INTERMEDIATE_CHECK_HISTORY_YEARS,
  type IntermediateCheckHistoryRecord,
  type IntermediateCheckMasterSnapshot,
  type IntermediateCheckReadingItem,
} from './intermediateCheckHistory'

export function IntermediateCheckHistoryDialog({
  open,
  onOpenChange,
  equipmentName,
  assetCode,
  history,
  currentLastDate,
  currentDoneByName,
  currentStatus,
  currentSummary,
  currentReadings,
  currentTemperature,
  currentHumidity,
  currentMasters,
  currentNextDueDate,
  acceptanceCriteria,
  layer = 'default',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipmentName?: string
  assetCode?: string
  history: IntermediateCheckHistoryRecord[]
  currentLastDate?: string
  currentDoneByName?: string
  currentStatus?: IntermediateCheckHistoryRecord['status']
  currentSummary?: string
  currentReadings?: IntermediateCheckReadingItem[]
  currentTemperature?: string
  currentHumidity?: string
  currentMasters?: IntermediateCheckMasterSnapshot[]
  currentNextDueDate?: string
  acceptanceCriteria?: string
  layer?: 'default' | 'nested' | 'stacked'
}) {
  const visibleCount = useMemo(() => {
    const historyCount = filterIntermediateCheckHistoryLastYears(
      history,
      INTERMEDIATE_CHECK_HISTORY_YEARS,
    ).length
    const hasCurrent = !!currentLastDate?.trim() && (currentReadings?.length ?? 0) > 0
    return historyCount + (hasCurrent ? 1 : 0)
  }, [history, currentLastDate, currentReadings])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer={layer} className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Previous Intermediate Check Results
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="font-medium">{equipmentName || 'Equipment'}</p>
            {assetCode ? (
              <p className="text-xs text-muted-foreground font-mono">Asset Code: {assetCode}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Showing {visibleCount} record(s) from the last {INTERMEDIATE_CHECK_HISTORY_YEARS} years.
            </p>
          </div>

          <IntermediateCheckHistoryPanel
            history={history}
            currentLastDate={currentLastDate}
            currentDoneByName={currentDoneByName}
            currentStatus={currentStatus}
            currentSummary={currentSummary}
            currentReadings={currentReadings}
            currentTemperature={currentTemperature}
            currentHumidity={currentHumidity}
            currentMasters={currentMasters}
            currentNextDueDate={currentNextDueDate}
            acceptanceCriteria={acceptanceCriteria}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
