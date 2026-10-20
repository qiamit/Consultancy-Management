import { Eye, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** BIS letter attachment: a file waiting to be saved with the case, or the file already stored on it. */
export function StopMarkingLetterPicker({
  pendingFile,
  storedName,
  disabled,
  busy,
  compact,
  onPick,
  onClear,
  onOpen,
}: {
  pendingFile?: File | null
  storedName?: string | null
  disabled?: boolean
  busy?: boolean
  /** Sits in a half-width column: one line, file name truncated, icon-only Open / Remove. */
  compact?: boolean
  onPick: (file: File) => void
  onClear?: () => void
  onOpen?: () => void
}) {
  const name = pendingFile?.name || storedName || ''
  return (
    <div className={compact ? 'flex h-8 items-center gap-2 border border-stone-500 bg-stone-50 pl-2.5 text-sm' : 'flex flex-wrap items-center gap-2 border border-stone-400 bg-white px-3 py-2 text-sm'}>
      <Paperclip size={15} className="shrink-0 text-amber-800" aria-hidden />
      <span className={compact ? 'min-w-0 flex-1 truncate text-stone-600' : 'min-w-0 flex-1 basis-40 truncate'} title={name || undefined}>{name || 'No letter attached'}</span>
      <div className={compact ? 'flex h-full shrink-0 items-stretch' : 'flex flex-wrap items-center gap-1.5'}>
        {name && onOpen ? (
          <Button type="button" variant="outline" className="h-8 gap-1.5 rounded-none border-stone-400 px-2.5 text-xs" disabled={busy} onClick={onOpen} title="Open the letter" aria-label="Open the letter">
            <Eye size={14} /> {compact ? null : 'Open'}
          </Button>
        ) : null}
        {name && onClear ? (
          <Button type="button" variant="outline" className="h-8 gap-1.5 rounded-none border-stone-400 px-2.5 text-xs text-red-700" disabled={busy || disabled} onClick={onClear} title="Remove the letter" aria-label="Remove the letter">
            <X size={14} /> {compact ? null : 'Remove'}
          </Button>
        ) : null}
        <label className="inline-flex h-8 cursor-pointer items-center border border-stone-400 bg-white px-2.5 text-xs font-medium hover:bg-stone-100">
          {busy ? 'Uploading…' : name ? 'Replace' : 'Attach Letter'}
          <input
            type="file"
            className="sr-only"
            disabled={busy || disabled}
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onPick(file)
            }}
          />
        </label>
      </div>
    </div>
  )
}
