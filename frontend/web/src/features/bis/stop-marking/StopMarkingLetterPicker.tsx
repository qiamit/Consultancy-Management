import { Eye, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** BIS letter attachment: a file waiting to be saved with the case, or the file already stored on it. */
export function StopMarkingLetterPicker({
  pendingFile,
  storedName,
  disabled,
  busy,
  onPick,
  onClear,
  onOpen,
}: {
  pendingFile?: File | null
  storedName?: string | null
  disabled?: boolean
  busy?: boolean
  onPick: (file: File) => void
  onClear?: () => void
  onOpen?: () => void
}) {
  const name = pendingFile?.name || storedName || ''
  return (
    <div className="flex flex-wrap items-center gap-2 border border-stone-400 bg-white px-3 py-2 text-sm">
      <Paperclip size={15} className="shrink-0 text-amber-800" aria-hidden />
      <span className="min-w-0 flex-1 basis-40 truncate">{name || 'No letter attached'}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {name && onOpen ? (
          <Button type="button" variant="outline" className="h-8 gap-1.5 rounded-none border-stone-400 px-2.5 text-xs" disabled={busy} onClick={onOpen}>
            <Eye size={14} /> Open
          </Button>
        ) : null}
        {name && onClear ? (
          <Button type="button" variant="outline" className="h-8 gap-1.5 rounded-none border-stone-400 px-2.5 text-xs text-red-700" disabled={busy || disabled} onClick={onClear}>
            <X size={14} /> Remove
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
