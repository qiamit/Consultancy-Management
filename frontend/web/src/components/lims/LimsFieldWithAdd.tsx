import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import {
  limsFieldAddBtnClass,
  limsFieldWithAddControlClass,
  limsFieldWithAddShellClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

/** Field row with Client Master “+” strip on the right of the control. */
export function LimsFieldWithAdd({
  children,
  addButton,
  className,
}: {
  children: ReactNode
  addButton: ReactNode
  className?: string
}) {
  return (
    <div className={cn(limsFieldWithAddShellClass, className)}>
      <div className={limsFieldWithAddControlClass}>{children}</div>
      {addButton}
    </div>
  )
}

export function LimsFieldAddButton({
  'aria-label': ariaLabel = 'Add',
  title = 'Add New',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(limsFieldAddBtnClass, className)}
      aria-label={ariaLabel}
      title={title}
      {...props}
    >
      <Plus size={14} strokeWidth={2.25} aria-hidden />
    </button>
  )
}
