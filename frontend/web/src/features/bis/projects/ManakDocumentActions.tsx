import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ManakDocumentAction = {
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
}

/** Shared compact document controls for the Manak step tables. */
export function ManakDocumentActions({ actions, disabled }: { actions: ManakDocumentAction[]; disabled?: boolean }) {
  return <div className="inline-flex shrink-0 items-center justify-center gap-0.5">
    {actions.map(({ label, icon: Icon, onClick, disabled: actionDisabled }) => <Button
      key={label}
      type="button"
      size="sm"
      variant="ghost"
      className="h-8 w-8 rounded-none border border-stone-400 bg-white/70 p-0 text-amber-800 shadow-sm hover:border-amber-600 hover:bg-amber-50 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-500/40"
      title={label}
      aria-label={label}
      disabled={disabled || actionDisabled}
      onClick={onClick}
    ><Icon size={15} aria-hidden /></Button>)}
  </div>
}
