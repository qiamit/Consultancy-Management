import { useEffect, useRef, useState } from 'react'
import { FileCheck2, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { openPendingPrintWindow } from '../print/openPrintHtml'
import {
  createBisProjectFileUrls,
  deleteBisProjectFile,
  formatBisProjectFilesError,
  listBisProjectFiles,
  uploadBisProjectFile,
  type BisProjectViewFile,
} from './bisProjectFilesApi'

const btn = 'inline-flex h-8 w-8 items-center justify-center rounded-none border p-0 text-white shadow-sm transition-colors disabled:opacity-60'

/** One icon button: red "Upload" until a PDF is attached, then green — click to view, double-click to delete. */
export function FileAttachButton({
  projectId,
  docKind,
  label,
  file,
  onChange,
  disabled = false,
  onBusyChange,
}: {
  projectId: string
  /** bis_project_files doc_kind for the upload. */
  docKind: string
  label: string
  file: BisProjectViewFile | null
  onChange: (file: BisProjectViewFile | null) => Promise<void> | void
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(clickTimer.current), [])
  const setWorking = (value: boolean) => { setBusy(value); onBusyChange?.(value) }

  const upload = async (picked: File) => {
    if (picked.type !== 'application/pdf' && !picked.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please select a PDF file.')
      return
    }
    setWorking(true)
    try {
      const uploaded = await uploadBisProjectFile(projectId, picked, docKind)
      await onChange(uploaded)
      if (file) await deleteBisProjectFile(file).catch(() => undefined)
      toast.success(`${label} uploaded.`)
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    } finally {
      setWorking(false)
    }
  }

  const view = async (f: BisProjectViewFile) => {
    const target = openPendingPrintWindow(`Opening ${label}…`)
    if (!target) { toast.error('Allow popups to view this PDF.'); return }
    target.opener = null
    try {
      const urls = await createBisProjectFileUrls(f.storage_path, f.file_name)
      if (!urls.viewUrl) throw new Error('Unable to open this PDF.')
      target.location.replace(urls.viewUrl)
    } catch (err) {
      target.close()
      toast.error(formatBisProjectFilesError(err))
    }
  }

  const remove = async (f: BisProjectViewFile) => {
    setWorking(true)
    try {
      await onChange(null)
      await deleteBisProjectFile(f)
      toast.success(`${label} removed.`)
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    } finally {
      setWorking(false)
    }
  }

  if (!file) {
    return (
      <label
        title={busy ? 'Uploading PDF…' : `Upload ${label} (PDF)`}
        aria-label={busy ? 'Uploading PDF' : `Upload ${label} PDF`}
        className={cn(btn, 'cursor-pointer border-red-700 bg-red-600 hover:bg-red-700', (disabled || busy) && 'pointer-events-none opacity-60')}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={disabled || busy}
          onChange={(event) => {
            const picked = event.target.files?.[0]
            if (picked) void upload(picked)
            event.target.value = ''
          }}
        />
      </label>
    )
  }
  return (
    <button
      type="button"
      disabled={disabled || busy}
      title={`${file.file_name || label} — click to view, double-click to delete`}
      aria-label={`View ${label} (double-click to delete)`}
      className={cn(btn, 'border-green-800 bg-green-600 hover:bg-green-700')}
      onClick={() => {
        clearTimeout(clickTimer.current)
        clickTimer.current = setTimeout(() => void view(file), 250)
      }}
      onDoubleClick={() => {
        clearTimeout(clickTimer.current)
        if (window.confirm(`Delete the ${label}?`)) void remove(file)
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileCheck2 className="h-4 w-4" aria-hidden />}
    </button>
  )
}

const SHARED_FILE_EVENT = 'bis-shared-project-file-changed'

/**
 * One project-level PDF shared by several screens (e.g. the SIT consent letter on Step 1 and on Step 5):
 * the same red / green button, reading and writing the same bis_project_files kind. A new upload replaces the old one.
 */
export function SharedProjectFileButton({ projectId, docKind, label }: { projectId: string; docKind: string; label: string }) {
  const [file, setFile] = useState<BisProjectViewFile | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    listBisProjectFiles(projectId, docKind)
      .then((list) => {
        if (active) setFile(list[0] ?? null)
      })
      .catch((err) => {
        if (active) toast.error(formatBisProjectFilesError(err))
      })
    return () => {
      active = false
    }
  }, [projectId, docKind, tick])

  // Every button showing this file refreshes when any of them uploads or deletes it.
  useEffect(() => {
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<string>).detail === docKind) setTick((t) => t + 1)
    }
    window.addEventListener(SHARED_FILE_EVENT, onChanged)
    return () => window.removeEventListener(SHARED_FILE_EVENT, onChanged)
  }, [docKind])

  return (
    <FileAttachButton
      projectId={projectId}
      docKind={docKind}
      label={label}
      file={file}
      onChange={async (next) => {
        if (next) {
          // Keep only the newest letter.
          const all = await listBisProjectFiles(projectId, docKind)
          await Promise.allSettled(all.filter((f) => f.id !== next.id && f.id !== file?.id).map(deleteBisProjectFile))
        }
        setFile(next)
        window.dispatchEvent(new CustomEvent(SHARED_FILE_EVENT, { detail: docKind }))
      }}
    />
  )
}
