import { useCallback, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
      <DialogContent className="flex h-[88vh] w-[min(64rem,calc(100vw-2rem))] max-w-none flex-col gap-2 rounded-none p-3">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle className="truncate text-base">{state?.title}</DialogTitle>
          <DialogDescription className="sr-only">Document viewer</DialogDescription>
        </DialogHeader>
        {state ? <iframe title={state.title} src={state.url} className="min-h-0 w-full flex-1 border border-stone-300 bg-white" /> : null}
      </DialogContent>
    </Dialog>
  )
  return [view, element]
}
