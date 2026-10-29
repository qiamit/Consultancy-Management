import { useCallback, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsManageDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

/**
 * View-only PDF/image viewer shown inside the app. Opening a file with window.open does nothing in embedded browsers
 * (and a download link would save the file), so the signed URL is shown in a dialog instead.
 * Usage: const [viewFile, viewer] = usePdfViewer(); viewFile(url, 'Title', 'message when missing'); render {viewer}.
 */
export function usePdfViewer(): [(url: string | undefined, title?: string, missing?: string) => void, ReactNode] {
  const [state, setState] = useState<{ url: string; title: string } | null>(null)
  const view = useCallback((url: string | undefined, title = 'Document', missing = 'This file is unavailable.') => {
    if (!url?.trim()) {
      toast.warning(missing)
      return
    }
    setState({ url, title })
  }, [])
  const element = (
    <Dialog open={state != null} onOpenChange={(open) => !open && setState(null)}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        className={cn(limsManageDialogClass, 'flex h-[88dvh] w-[min(64rem,calc(100vw-2rem))] max-w-none flex-col gap-0 bg-white p-0')}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="truncate text-base font-semibold tracking-tight text-white">{state?.title}</DialogTitle>
          </DialogHeader>
        </div>
        {state ? <iframe title={state.title} src={state.url} className="m-3 min-h-0 flex-1 border border-stone-300 bg-white" /> : null}
      </DialogContent>
    </Dialog>
  )
  return [view, element]
}
