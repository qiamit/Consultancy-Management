import type React from 'react'
import { Eye, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** BIS letter attachment: a file waiting to be saved with the case, or the file already stored on it. */
export function StopMarkingLetterPicker({
  pendingFile,
  storedName,
  disabled,
  busy,
  compact,
  inline,
  extra,
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
  /** One line with labelled buttons (the module step): name, Open, Replace and an optional extra button. */
  inline?: boolean
  extra?: React.ReactNode
  onPick: (file: File) => void
  onClear?: () => void
  onOpen?: () => void
}) {
  const name = pendingFile?.name || storedName || ''
  const btnH = compact || inline ? 'h-full' : 'h-8'
  return (
    <div className={compact || inline ? 'flex h-9 items-center gap-2 border border-stone-400 bg-white pl-3 text-sm' : 'flex flex-wrap items-center gap-2 border border-stone-400 bg-white px-3 py-2 text-sm'}>
      <Paperclip size={15} className="shrink-0 text-amber-800" aria-hidden />
      <span className={compact || inline ? 'min-w-0 flex-1 truncate text-stone-700' : 'min-w-0 flex-1 basis-40 truncate'} title={name || undefined}>{name || 'No Letter Attached'}</span>
      <div className={compact || inline ? 'flex h-full shrink-0 items-stretch' : 'flex flex-wrap items-center gap-1.5'}>
        {name && onOpen ? (
          <Button type="button" variant="outline" className={`${btnH} gap-1.5 rounded-none border-stone-400 px-2.5 text-xs`} disabled={busy} onClick={onOpen} title="Open the Letter" aria-label="Open the Letter">
            <Eye size={14} /> {compact && !inline ? null : 'Open'}
          </Button>
        ) : null}
        {name && onClear ? (
          <Button type="button" variant="outline" className={`${btnH} gap-1.5 rounded-none border-stone-400 px-2.5 text-xs text-red-700`} disabled={busy || disabled} onClick={onClear} title="Remove the Letter" aria-label="Remove the Letter">
            <X size={14} /> {compact && !inline ? null : 'Remove'}
          </Button>
        ) : null}
        <label className={`inline-flex ${btnH} cursor-pointer items-center border border-stone-400 bg-white px-2.5 text-xs font-medium hover:bg-stone-100`}>
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
        {extra}
      </div>
    </div>
  )
}
