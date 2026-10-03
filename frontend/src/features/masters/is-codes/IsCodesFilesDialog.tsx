import { useRef } from 'react'
import { Download, Eye, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  limsDarkBarGlowStyle,
  limsDeleteBtnClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export type IsCodeViewFile = {
  id: string
  file_name: string
  storage_path: string
  /** Inline/view URL (no download disposition). Prefer over `url`. */
  viewUrl?: string
  /** Forced download URL (`Content-Disposition: attachment`). */
  downloadUrl?: string
  /** @deprecated Prefer `viewUrl`; kept for older callers. */
  url?: string
  error?: string
}

export function IsCodesFilesDialog({
  open,
  onOpenChange,
  title,
  files,
  loading,
  status,
  busy,
  onAddFiles,
  onDeleteFile,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  files: IsCodeViewFile[]
  loading: boolean
  status: string | null
  busy: boolean
  onAddFiles: (files: File[]) => void
  onDeleteFile: (file: IsCodeViewFile) => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'max-h-[85vh] w-[calc(100%-1.5rem)] max-w-xl overflow-hidden p-0 sm:w-full',
          'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              IS Code Files
            </DialogTitle>
            <p className="mt-0.5 truncate text-xs text-stone-300">{title}</p>
          </DialogHeader>
        </div>

        <div className="space-y-3 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'h-8 gap-1.5 px-3 text-xs')}
              disabled={busy || loading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} aria-hidden />
              Add Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = e.target.files
                if (!list?.length) return
                onAddFiles(Array.from(list))
                e.target.value = ''
              }}
            />
          </div>

          {status ? <p className="text-xs text-stone-600">{status}</p> : null}

          {loading ? (
            <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
          ) : files.length === 0 ? (
            <div className="rounded-none border border-dashed border-stone-400 bg-stone-50 px-3 py-6 text-center text-sm text-stone-500">
              No files yet. Use Add Files to upload.
            </div>
          ) : (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-none border border-stone-500 bg-stone-50 px-3 py-2"
                >
                  <p className="min-w-0 flex-1 truncate text-sm text-stone-900" title={file.file_name}>
                    {file.file_name}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {file.viewUrl || file.url ? (
                      <a
                        href={file.viewUrl || file.url}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          limsOutlineBtnClass,
                          'inline-flex h-8 items-center gap-1 px-2.5 text-xs',
                        )}
                        aria-label={`View ${file.file_name}`}
                      >
                        <Eye size={14} aria-hidden />
                        View
                      </a>
                    ) : (
                      <span className="max-w-[9rem] truncate text-[11px] text-stone-500">
                        {file.error || 'Unavailable'}
                      </span>
                    )}
                    {file.downloadUrl ? (
                      <a
                        href={file.downloadUrl}
                        download={file.file_name}
                        className={cn(
                          limsOutlineBtnClass,
                          'inline-flex h-8 items-center gap-1 px-2.5 text-xs',
                        )}
                        aria-label={`Download ${file.file_name}`}
                      >
                        <Download size={14} aria-hidden />
                        Download
                      </a>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      className={cn(limsDeleteBtnClass, 'h-8 gap-1 px-2.5 text-xs')}
                      disabled={busy}
                      onClick={() => onDeleteFile(file)}
                      aria-label={`Delete ${file.file_name}`}
                    >
                      <Trash2 size={14} aria-hidden />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
