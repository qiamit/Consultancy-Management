import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  limsDarkBarGlowStyle,
  limsDeleteBtnClass,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { PrefixItem } from './types'
import { LabSettingsPanel } from './labSettingsUi'

type PrefixesTabProps = {
  saveMessage: string | null
  saveLoading: boolean
  onSave: () => void

  prefixDialogOpen: boolean
  setPrefixDialogOpen: (open: boolean) => void
  newPrefixName: string
  setNewPrefixName: (value: string) => void
  newPrefixValue: string
  setNewPrefixValue: (value: string) => void
  onAddPrefix: () => void

  prefixes: PrefixItem[]
  setPrefixes: React.Dispatch<React.SetStateAction<PrefixItem[]>>

  prefixDeleteTarget: { id: string; name: string } | null
  setPrefixDeleteTarget: (target: { id: string; name: string } | null) => void
  onDeletePrefix: () => void
}

export function PrefixesTab(props: PrefixesTabProps) {
  return (
    <LabSettingsPanel>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-800">Prefix&apos;s</h3>
          <Dialog open={props.prefixDialogOpen} onOpenChange={props.setPrefixDialogOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-stone-500 bg-stone-100 text-amber-800 shadow-sm transition-colors hover:bg-amber-500/15 hover:text-amber-950"
                aria-label="Add prefix"
                title="Add New"
              >
                <Plus size={14} strokeWidth={2.25} aria-hidden />
              </button>
            </DialogTrigger>
            <DialogContent
              persistOnFocusLoss
              aria-describedby={undefined}
              className={cn(limsDialogClass, 'max-w-lg p-0')}
            >
              <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
                <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
                <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                <DialogHeader className="relative pr-10 text-left">
                  <DialogTitle className="text-base font-semibold tracking-tight text-white">
                    Add New Prefix
                  </DialogTitle>
                </DialogHeader>
              </div>

              <div className="grid grid-cols-1 gap-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="prefix-name"
                    className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                  >
                    Prefix Name
                  </Label>
                  <Input
                    id="prefix-name"
                    placeholder="e.g., Invoice"
                    value={props.newPrefixName}
                    onChange={(e) => props.setNewPrefixName(e.target.value)}
                    className={limsFieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="prefix-value"
                    className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                  >
                    Prefix
                  </Label>
                  <Input
                    id="prefix-value"
                    placeholder="e.g., INV-"
                    value={props.newPrefixValue}
                    onChange={(e) => props.setNewPrefixValue(e.target.value)}
                    className={limsFieldClass}
                  />
                </div>
              </div>

              <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
                <Button
                  type="button"
                  className={cn(limsPrimaryBtnClass, 'h-9 min-w-[8.5rem]')}
                  onClick={props.onAddPrefix}
                  disabled={!props.newPrefixName.trim() || !props.newPrefixValue.trim()}
                >
                  Save & Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {props.prefixes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {props.prefixes.map((p) => (
              <div
                key={p.id}
                className="space-y-3 rounded-none border-2 border-stone-400 bg-white/90 p-4 shadow-sm ring-1 ring-amber-700/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <Label htmlFor={`prefix-name-${p.id}`} className="min-w-0 truncate">
                    {p.name}
                  </Label>
                  <button
                    type="button"
                    onClick={() => props.setPrefixDeleteTarget({ id: p.id, name: p.name })}
                    className="shrink-0 text-red-600 hover:text-red-800"
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <Input
                  id={`prefix-name-${p.id}`}
                  value={p.prefix}
                  onChange={(e) =>
                    props.setPrefixes((prev) =>
                      prev.map((entry) =>
                        entry.id === p.id ? { ...entry, prefix: e.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Enter Prefix"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={!!props.prefixDeleteTarget}
        onOpenChange={(open) => !open && props.setPrefixDeleteTarget(null)}
      >
        <DialogContent aria-describedby={undefined} className={cn(limsDialogClass, 'max-w-md p-0')}>
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">Delete Prefix</DialogTitle>
            </DialogHeader>
          </div>
          <div className="bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <DialogDescription className="text-sm text-stone-700">
              Are you sure you want to delete &quot;{props.prefixDeleteTarget?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </div>
          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end gap-2">
            <Button
              type="button"
              className={cn(limsOutlineBtnClass, 'h-9')}
              onClick={() => props.setPrefixDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" className={cn(limsDeleteBtnClass, 'h-9')} onClick={props.onDeletePrefix}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LabSettingsPanel>
  )
}
