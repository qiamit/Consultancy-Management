import { useEffect, useState, type HTMLAttributes } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  clientFieldClass,
  clientManageDialogClass,
  clientManageListItemClass,
  clientPrimaryBtnClass,
} from './clientsFormUi'

type ManageItem = { id: string; label: string }

export function ClientManageDialogContent({
  open,
  title,
  addLabel,
  inputId,
  placeholder,
  value,
  onValueChange,
  inputMode,
  onSave,
  onUpdate,
  saveDisabled,
  items,
  canDelete,
  onDelete,
  getEditValue,
  layer = 'stacked',
}: {
  open: boolean
  title: string
  addLabel: string
  inputId: string
  placeholder: string
  value: string
  onValueChange: (value: string) => void
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  onSave: () => void
  onUpdate: (id: string) => void
  saveDisabled: boolean
  items: ManageItem[]
  canDelete: (item: ManageItem) => boolean
  onDelete: (id: string) => void
  getEditValue?: (item: ManageItem) => string
  /** Raise above an already-open parent dialog (Allot Tests → Add Test Parameter, etc.) */
  layer?: 'default' | 'nested' | 'stacked' | 'top'
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) setEditingId(null)
  }, [open])

  const fieldLabel = editingId ? addLabel.replace(/^Add\b/, 'Edit') : addLabel

  return (
    <DialogContent
      persistOnFocusLoss
      layer={layer}
      className={clientManageDialogClass}
      aria-describedby={undefined}
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
          <DialogTitle className="text-base font-semibold tracking-tight text-white">{title}</DialogTitle>
        </DialogHeader>
      </div>

      <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
        <div className="space-y-2">
          <Label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            {fieldLabel}
          </Label>
          <Input
            id={inputId}
            inputMode={inputMode}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className={clientFieldClass}
          />
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">Existing</p>
          <div className="max-h-40 space-y-1 overflow-auto">
            {items.map((item) => (
              <div key={item.id} className={clientManageListItemClass}>
                <span className="min-w-0 truncate">{item.label}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(item.id)
                      onValueChange(getEditValue ? getEditValue(item) : item.label)
                      window.requestAnimationFrame(() => {
                        document.getElementById(inputId)?.focus()
                      })
                    }}
                    className="text-amber-800 hover:text-amber-950"
                    aria-label={`Edit ${item.label}`}
                  >
                    <Pencil size={14} />
                  </button>
                  {canDelete(item) ? (
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="text-red-600 hover:text-red-800"
                      aria-label={`Delete ${item.label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
        <Button
          type="button"
          className={clientPrimaryBtnClass}
          onClick={() => {
            if (editingId) onUpdate(editingId)
            else onSave()
          }}
          disabled={saveDisabled}
        >
          Save & Close
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
