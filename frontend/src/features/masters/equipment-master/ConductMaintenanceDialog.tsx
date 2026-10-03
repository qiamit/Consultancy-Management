import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConductMaintenanceAssistant } from './ConductMaintenanceAssistant'
import {
  checklistItemsToRows,
  defaultRepairForStatus,
  REPAIR_DEFAULT_OK,
  rowsToChecklistItems,
  type MaintenanceCheckpointRow,
  type MaintenanceCheckpointStatus,
} from './maintenanceChecklist'
import {
  newMaintenanceHistoryId,
  type MaintenanceHistoryRecord,
} from './maintenanceHistory'
import type { Frequency, MaintenanceChecklistItem } from './types'
import { calculateNextDueDate, sanitizeDateStr } from './types'

export type { MaintenanceCheckpointRow, MaintenanceCheckpointStatus }
export { REPAIR_DEFAULT_OK, REPAIR_DEFAULT_NOT_OK, defaultRepairForStatus } from './maintenanceChecklist'

const FULLSCREEN_OVERLAY = 'lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto'

const FULLSCREEN_DIALOG_CLASS = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
  'left-0 top-0',
  'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
)

function newCheckpointRow(checkPoint = ''): MaintenanceCheckpointRow {
  return {
    key: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    selected: true,
    checkPoint,
    status: 'OK',
    repairIfAny: REPAIR_DEFAULT_OK,
  }
}

export function ConductMaintenanceDialog({
  open,
  onOpenChange,
  equipmentName,
  assetCode,
  manufacturer,
  modelNumber,
  rangeCapacity,
  initialChecklist,
  maintenanceHistory,
  lastMaintenanceDate,
  nextMaintenanceDate,
  maintenanceDoneBy,
  maintenanceDoneByName,
  maintenanceScheduleFrequency,
  onSaveChecklist,
  onCompleteMaintenance,
  layer = 'default',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipmentName?: string
  assetCode?: string
  manufacturer?: string
  modelNumber?: string
  rangeCapacity?: string
  initialChecklist?: MaintenanceChecklistItem[]
  maintenanceHistory: MaintenanceHistoryRecord[]
  lastMaintenanceDate?: string
  nextMaintenanceDate?: string
  maintenanceDoneBy?: string
  maintenanceDoneByName?: string
  maintenanceScheduleFrequency?: Frequency
  onSaveChecklist: (items: MaintenanceChecklistItem[]) => void
  onCompleteMaintenance: (payload: {
    checklist: MaintenanceChecklistItem[]
    maintenanceHistory: MaintenanceHistoryRecord[]
    lastMaintenanceDate: string
    nextMaintenanceDate: string
  }) => void
  /** Raise above an already-open parent dialog (e.g. nested Maintenance form). */
  layer?: 'default' | 'nested' | 'stacked'
}) {
  const [rows, setRows] = useState<MaintenanceCheckpointRow[]>([])
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const snapshotRef = useRef({
    lastDate: '',
    nextDate: '',
    doneBy: '',
    doneByName: '',
    checklist: [] as MaintenanceChecklistItem[],
    history: [] as MaintenanceHistoryRecord[],
  })

  useEffect(() => {
    if (!open) return
    setSaveMessage(null)
    const saved = checklistItemsToRows(initialChecklist)
    setRows(saved.length > 0 ? saved : [newCheckpointRow()])
    snapshotRef.current = {
      lastDate: lastMaintenanceDate ?? '',
      nextDate: nextMaintenanceDate ?? '',
      doneBy: maintenanceDoneBy ?? '',
      doneByName: maintenanceDoneByName ?? '',
      checklist: [...(initialChecklist ?? [])],
      history: [...maintenanceHistory],
    }
    // Load only when dialog opens so parent re-renders do not wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const updateRow = (key: string, patch: Partial<MaintenanceCheckpointRow>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row
        const next = { ...row, ...patch }
        if (patch.status !== undefined && patch.repairIfAny === undefined) {
          next.repairIfAny = defaultRepairForStatus(patch.status)
        }
        return next
      }),
    )
  }

  const addRow = () => {
    setRows((prev) => [...prev, newCheckpointRow()])
  }

  const removeRow = (key: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.key !== key)))
  }

  const handleSaveAndClose = () => {
    const items = rowsToChecklistItems(rows)
    if (items.length === 0) {
      setSaveMessage('Add at least one check point before completing maintenance.')
      return
    }
    if (!maintenanceDoneBy?.trim()) {
      setSaveMessage('Select Maintenance Done By in Maintenance Details before completing.')
      return
    }

    const today = sanitizeDateStr(new Date().toISOString().split('T')[0])
    const nextDue = calculateNextDueDate(today, maintenanceScheduleFrequency ?? '') || ''
    const snap = snapshotRef.current

    let nextHistory = [...snap.history]

    const shouldArchivePrevious =
      snap.lastDate.trim() &&
      snap.checklist.length > 0 &&
      snap.lastDate !== today &&
      !nextHistory.some(
        (record) =>
          record.conductedOn === snap.lastDate &&
          record.doneBy === snap.doneBy &&
          record.checklist.length === snap.checklist.length,
      )

    if (shouldArchivePrevious) {
      nextHistory = [
        ...nextHistory,
        {
          id: newMaintenanceHistoryId(),
          conductedOn: snap.lastDate,
          doneBy: snap.doneBy,
          doneByName: snap.doneByName || maintenanceDoneByName || '',
          checklist: snap.checklist,
          nextDueDate: snap.nextDate || nextDue,
        },
      ]
    }

    onCompleteMaintenance({
      checklist: items,
      maintenanceHistory: nextHistory,
      lastMaintenanceDate: today,
      nextMaintenanceDate: nextDue,
    })
    onSaveChecklist(items)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer={layer === 'default' ? 'nested' : layer}
        overlayClassName={FULLSCREEN_OVERLAY}
        className={FULLSCREEN_DIALOG_CLASS}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Conduct Maintenance
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
            labRegistryFormClass,
          )}
        >
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-none border-2 border-stone-400 bg-stone-50 px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-stone-800">{equipmentName || 'Equipment'}</p>
            </div>
            <ConductMaintenanceAssistant
              equipment={{
                equipmentName,
                assetCode,
                manufacturer,
                modelNumber,
                rangeCapacity,
              }}
              onApplyChecklist={(next) =>
                setRows(next.length > 0 ? next : [newCheckpointRow()])
              }
            />
          </div>

          <div className="overflow-x-auto rounded-none border-2 border-stone-400">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-stone-800 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                  <th className="w-[5%] border border-stone-700 px-2 py-2 text-center">#</th>
                  <th className="border border-stone-700 px-2 py-2 text-center">
                    Maintenance Check Point
                  </th>
                  <th className="w-36 border border-stone-700 px-2 py-2 text-center">Status</th>
                  <th className="min-w-[180px] border border-stone-700 px-2 py-2 text-center">
                    Repair If Any
                  </th>
                  <th className="w-[7%] border border-stone-700 px-2 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="bg-[#f7f3eb]">
                {rows.map((row, index) => {
                  const isLastRow = index === rows.length - 1
                  return (
                    <tr key={row.key} className="hover:bg-amber-50/40">
                      <td className="border border-stone-300 px-2 py-1.5 text-center align-middle font-mono text-stone-500">
                        {index + 1}
                      </td>
                      <td className="border border-stone-300 px-1 py-0.5 text-left align-middle">
                        <Input
                          value={row.checkPoint}
                          placeholder={`Check point ${index + 1}`}
                          onChange={(e) => updateRow(row.key, { checkPoint: e.target.value })}
                          className="!h-7 min-h-0 px-2 py-0.5 text-left text-xs"
                        />
                      </td>
                      <td className="border border-stone-300 px-1 py-0.5 text-center align-middle">
                        <Select
                          value={row.status}
                          onValueChange={(value) =>
                            updateRow(row.key, { status: value as MaintenanceCheckpointStatus })
                          }
                        >
                          <SelectTrigger className="!h-7 min-h-0 px-2 py-0 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="OK">OK</SelectItem>
                            <SelectItem value="Not OK">Not OK</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="border border-stone-300 px-1 py-0.5 text-right align-middle">
                        <Input
                          value={row.repairIfAny}
                          placeholder={defaultRepairForStatus(row.status)}
                          onChange={(e) => updateRow(row.key, { repairIfAny: e.target.value })}
                          className="!h-7 min-h-0 px-2 py-0.5 text-right text-xs"
                          aria-label={`Repair if any for checkpoint ${index + 1}`}
                        />
                      </td>
                      <td className="border border-stone-300 py-0.5 text-center align-middle">
                        <div className="flex items-center justify-center">
                          {isLastRow ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-amber-800 hover:bg-amber-500/15"
                              aria-label="Add check point"
                              onClick={addRow}
                            >
                              <Plus size={12} />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:bg-rose-50"
                              aria-label={`Delete check point ${index + 1}`}
                              onClick={() => removeRow(row.key)}
                            >
                              <Trash2 size={10} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {saveMessage ? (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-none px-3 py-2">
              {saveMessage}
            </p>
          ) : null}
        </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
          <Button type="button" className={limsPrimaryBtnClass} onClick={handleSaveAndClose}>
            Save & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
