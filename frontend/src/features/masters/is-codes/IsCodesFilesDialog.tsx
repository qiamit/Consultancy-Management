import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { IsCodeFilesTable, type IsCodeViewFile } from './IsCodeFilesTable'

export type { IsCodeViewFile }

export function IsCodesFilesDialog({
  open,
  onOpenChange,
  title,
  files,
  loading,
  status,
  busy,
  onAddFiles,
  onReplaceFile,
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
  onReplaceFile?: (existing: IsCodeViewFile, next: File) => void
  onDeleteFile: (file: IsCodeViewFile) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        className={cn(
          limsDialogClass,
          'flex !flex-col gap-0 overflow-hidden p-0',
          'max-h-[min(92vh,860px)] w-[min(48rem,calc(100vw-1.5rem))] max-w-3xl bg-white',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              IS Code Files
            </DialogTitle>
            <p className="mt-0.5 truncate text-xs text-stone-300">{title}</p>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
          <IsCodeFilesTable
            files={files}
            loading={loading}
            busy={busy}
            status={status}
            onAddFiles={onAddFiles}
            onReplaceFile={onReplaceFile}
            onDeleteFile={onDeleteFile}
            resetKey={open}
            scrollClassName="max-h-[min(56vh,520px)]"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
