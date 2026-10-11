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
  inlineAdd = false,
  onInlineAdd,
  layer = 'stacked',
  message,
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
  /** Button on the right end of the name field. Adds without closing. */
  inlineAdd?: boolean
  onInlineAdd?: () => void
  /** Raise above an already-open parent dialog (Allot Tests → Add Test Parameter, etc.) */
  layer?: 'default' | 'nested' | 'stacked' | 'top'
  message?: string | null
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
          {inlineAdd ? (
            <div className="flex h-8 min-w-0 items-stretch overflow-hidden rounded-none border border-stone-500 bg-stone-50 focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20">
              <Input
                id={inputId}
                inputMode={inputMode}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || saveDisabled) return
                  event.preventDefault()
                  if (editingId) onUpdate(editingId)
                  else (onInlineAdd ?? onSave)()
                }}
                className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
              />
              <button
                type="button"
                className="inline-flex h-full shrink-0 items-center border-l border-stone-500 bg-amber-700 px-3 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={saveDisabled}
                onClick={() => {
                  if (editingId) onUpdate(editingId)
                  else (onInlineAdd ?? onSave)()
                }}
              >
                Add
              </button>
            </div>
          ) : (
            <Input
              id={inputId}
              inputMode={inputMode}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              className={clientFieldClass}
            />
          )}
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
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-amber-700 bg-white p-0 text-amber-800 hover:bg-amber-50 hover:text-amber-950"
                    aria-label={`Edit ${item.label}`}
                    title="Edit"
                  >
                    <Pencil size={15} aria-hidden />
                  </button>
                  {canDelete(item) ? (
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-red-600 bg-white p-0 text-red-700 hover:bg-red-50 hover:text-red-800"
                      aria-label={`Delete ${item.label}`}
                      title="Delete"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        {message ? <p className="text-xs text-red-700" role="alert">{message}</p> : null}
      </div>

      {inlineAdd ? null : (
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
      )}
    </DialogContent>
  )
}
