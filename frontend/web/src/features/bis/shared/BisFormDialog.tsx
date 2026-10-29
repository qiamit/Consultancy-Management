import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
  limsFullscreenDialogClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

/** Full-height LIMS-themed form dialog shared by BIS list modules. */
export function BisFormDialog({
  open,
  onOpenChange,
  title,
  saveLabel,
  canSave,
  saving,
  errorMessage,
  onSave,
  footerExtra,
  compact = false,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  saveLabel: string
  canSave: boolean
  saving: boolean
  errorMessage: string | null
  onSave: () => void
  /** Extra buttons at the left of the footer (for example "Close case"). */
  footerExtra?: ReactNode
  /** A centered dialog sized to its content (in the main area, beside the sidebar) instead of a full-height sheet. */
  compact?: boolean
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        className={
          compact
            ? cn(
                limsDialogClass,
                '!flex w-[min(40rem,calc(100vw-1.5rem))] max-w-none bg-white',
                '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
              )
            : cn(
                '!flex z-50 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:rounded-none',
                limsFullscreenDialogClass,
                'border-stone-600 ring-1 ring-amber-700/20',
                '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
              )
        }
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {title}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
          {errorMessage ? (
            <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
          <div className={limsRegistryFormClass}>
            <div className="grid grid-cols-12 gap-4">{children}</div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t-2 border-stone-500 bg-stone-100 px-4 py-3 sm:px-6">
          {footerExtra ? <div className="mr-auto flex flex-wrap items-center gap-2">{footerExtra}</div> : null}
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-none border-stone-500"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={onSave}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving…' : saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
