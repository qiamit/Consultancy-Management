import { useRef } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { UndertakingSourcesState } from './useUndertakingSources'

/** "Select Source" dialog: switch stored PDFs on/off, or attach PDFs from the computer. */
export function UndertakingSourcePicker({
  open,
  onOpenChange,
  state,
  heading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: UndertakingSourcesState
  heading: string
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const { sources, selected, toggle, localFiles, setLocalFiles, loading, error } = state
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer="top" aria-describedby={undefined} className="max-w-xl overflow-hidden rounded-none border border-stone-500 p-0">
        <DialogHeader className="border-b border-amber-700 bg-stone-900 px-4 py-3 text-left text-white">
          <DialogTitle className="text-base font-semibold">Select Source PDFs</DialogTitle>
        </DialogHeader>
        <div className="max-h-[55dvh] space-y-2 overflow-y-auto p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">{heading}</p>
          {error ? <p role="alert" className="text-xs text-amber-800">{error}</p> : null}
          {sources.length ? (
            sources.map((file) => {
              const on = selected.has(file.id)
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => toggle(file.id)}
                  className={cn('flex w-full items-center gap-3 border px-3 py-2 text-left text-sm', on ? 'border-amber-700 bg-amber-50' : 'border-stone-300 bg-white hover:bg-stone-50')}
                >
                  <FileText className="h-4 w-4 shrink-0 text-amber-800" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{file.fileName}</span>
                    <span className="block text-xs text-stone-500">{file.documentKind}</span>
                  </span>
                  <span
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? 'Selected' : 'Not selected'}: ${file.fileName}`}
                    className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors', on ? 'border-amber-700 bg-amber-700' : 'border-stone-400 bg-stone-200')}
                  >
                    <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
                  </span>
                </button>
              )
            })
          ) : (
            <p className="border border-dashed border-stone-300 p-3 text-sm text-stone-500">{loading ? 'Loading source PDFs…' : 'No stored source PDFs found. Attach a PDF below.'}</p>
          )}
          {localFiles.length ? (
            <div className="space-y-1 border-t border-stone-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">From Computer ({localFiles.length})</p>
              {localFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-amber-800" aria-hidden />
                  <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
                  <Button type="button" variant="ghost" className="h-7 w-7 rounded-none p-0 text-red-700" aria-label={`Remove ${file.name}`} onClick={() => setLocalFiles((prev) => prev.filter((_, i) => i !== index))}>
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="border-t border-stone-200 pt-3">
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                setLocalFiles((prev) => [...prev, ...picked])
                e.target.value = ''
              }}
            />
            <Button type="button" variant="outline" size="sm" className="h-8 rounded-none text-amber-800" onClick={() => fileInput.current?.click()}>
              <Upload size={14} className="mr-1.5" aria-hidden /> Attach PDF from Computer
            </Button>
          </div>
        </div>
        <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3">
          <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[6rem]')} onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
