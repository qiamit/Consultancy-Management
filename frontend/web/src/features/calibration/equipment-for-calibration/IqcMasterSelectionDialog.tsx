import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Master = { id: string; equipment_name?: string | null; asset_code?: string | null }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  masters: Master[]
  selectedIds: string[]
  onSelectedIdsChange: (masterIds: string[]) => void
}

export function IqcMasterSelectionDialog({
  open,
  onOpenChange,
  masters,
  selectedIds,
  onSelectedIdsChange,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer="stacked" className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>IQC Masters</DialogTitle>
        </DialogHeader>
        <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
          {masters.length === 0 ? (
            <li className="text-stone-500">No master equipment loaded.</li>
          ) : (
            masters.map((m) => {
              const checked = selectedIds.includes(m.id)
              return (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-center gap-2 border border-stone-300 px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        onSelectedIdsChange(
                          checked
                            ? selectedIds.filter((id) => id !== m.id)
                            : [...selectedIds, m.id],
                        )
                      }}
                    />
                    <span className="min-w-0 truncate">
                      {m.equipment_name || m.asset_code || m.id}
                    </span>
                  </label>
                </li>
              )
            })
          )}
        </ul>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
