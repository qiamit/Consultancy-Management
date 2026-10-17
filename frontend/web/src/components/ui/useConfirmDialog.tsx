import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsManageDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass, limsRegistryFormClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

type ConfirmOptions = { title?: string; confirmLabel?: string; destructive?: boolean }

/**
 * In-app replacement for window.confirm (embedded browsers such as the desktop app pane answer confirm() with "false"
 * immediately, which makes confirm-guarded actions silently do nothing).
 * Usage: const [confirm, confirmDialog] = useConfirmDialog(); if (!(await confirm('Delete x?'))) return; ... render {confirmDialog}.
 */
export function useConfirmDialog(): [(message: string, options?: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<({ message: string } & ConfirmOptions) | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false)
      resolver.current = resolve
      setState({ message, ...options })
    })
  }, [])

  const settle = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setState(null)
  }

  const element = (
    <Dialog open={state != null} onOpenChange={(open) => !open && settle(false)}>
      <DialogContent persistOnFocusLoss layer="stacked" aria-describedby={undefined} className={cn(limsManageDialogClass, 'max-w-sm bg-white')}>
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">{state?.title ?? 'Please confirm'}</DialogTitle>
          </DialogHeader>
        </div>
        <div className={cn(limsRegistryFormClass, 'space-y-4 px-4 py-4')}>
          <p className="text-sm text-stone-700">{state?.message}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, state?.destructive !== false && 'bg-red-700 hover:bg-red-800')}
              onClick={() => settle(true)}
            >
              {state?.confirmLabel ?? 'Delete'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  return [confirm, element]
}
