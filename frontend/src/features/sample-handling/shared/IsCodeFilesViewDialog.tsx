import { useEffect, useState } from 'react'
import { ExternalLink, Files } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass, limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { normalizeIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import { loadIsCodeFiles, type IsCodeFileLink } from './fetchSampleSrfViewDetails'

export function IsCodeFilesViewDialog({
  open,
  onOpenChange,
  isCodeId,
  isCodeLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId: string | null | undefined
  isCodeLabel?: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<IsCodeFileLink[]>([])

  const titleLabel = normalizeIsCodeLabel(isCodeLabel) || 'IS Code'

  useEffect(() => {
    if (!open) {
      setFiles([])
      setError(null)
      setLoading(false)
      return
    }
    const id = isCodeId?.trim()
    if (!id) {
      setFiles([])
      setError('No IS Code selected.')
      return
    }

    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const list = await loadIsCodeFiles(id)
        if (!cancelled) setFiles(list)
      } catch {
        if (!cancelled) {
          setFiles([])
          setError('Failed to load IS Code files.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, isCodeId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'max-h-[min(72vh,520px)] w-[calc(100%-1.5rem)] max-w-lg p-0 sm:w-full',
          'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              IS Code Files
            </DialogTitle>
            <p className="mt-0.5 text-xs text-stone-300">{titleLabel}</p>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4">
          {loading ? (
            <p className="text-sm text-stone-600">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : files.length === 0 ? (
            <p className="rounded-none border border-dashed border-stone-400 bg-stone-50 px-3 py-6 text-center text-sm text-stone-500">
              No files in IS Code directory for this code.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li
                  key={f.file_name}
                  className="flex items-center justify-between gap-3 rounded-none border border-stone-500 bg-white px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Files className="h-3.5 w-3.5 shrink-0 text-amber-800" aria-hidden />
                    <span className="truncate text-sm text-stone-900" title={f.file_name}>
                      {f.file_name}
                    </span>
                  </div>
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        limsOutlineBtnClass,
                        'inline-flex h-7 shrink-0 items-center gap-1 px-2.5 text-xs font-medium',
                      )}
                    >
                      View
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-stone-400">—</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
