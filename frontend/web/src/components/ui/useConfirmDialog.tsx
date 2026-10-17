import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
      <DialogContent className="max-w-sm rounded-none">
        <DialogHeader>
          <DialogTitle>{state?.title ?? 'Please confirm'}</DialogTitle>
          <DialogDescription>{state?.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-none" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className={state?.destructive === false ? 'rounded-none' : 'rounded-none bg-red-700 text-white hover:bg-red-800'}
            onClick={() => settle(true)}
          >
            {state?.confirmLabel ?? 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return [confirm, element]
}
