import { useCallback, type ReactNode } from 'react'
import { toast } from 'sonner'
import { openFileInNewTab } from '@/lib/fileViewer'

/**
 * View-only PDF/image viewer: opens the file in a new browser tab on the app's own viewer page (never a download).
 * Usage: const [viewFile, viewer] = usePdfViewer(); viewFile(url, 'Title', 'message when missing'); render {viewer}.
 * The second value is kept for existing callers and renders nothing.
 */
export function usePdfViewer(): [(url: string | undefined, title?: string, missing?: string) => void, ReactNode] {
  const view = useCallback((url: string | undefined, title = 'Document', missing = 'This file is unavailable.') => {
    if (!openFileInNewTab(url, title)) toast.warning(missing)
  }, [])
  return [view, null]
}
