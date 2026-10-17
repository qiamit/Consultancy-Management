import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpen, Eye, ExternalLink, FileText, Paperclip, Pencil, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { loadIsCodeFileLinks, type IsCodeFileLink } from '@/features/masters/is-codes/loadIsCodeFileLinks'
import { cn } from '@/lib/utils'
import {
  deleteBisProjectFile,
  formatBisProjectFilesError,
  listBisProjectFiles,
  uploadBisProjectFile,
  type BisProjectViewFile,
} from './bisProjectFilesApi'
import { isQeExtensionPresent } from './manakExtensionBridge'

const iconBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border bg-white transition-colors hover:bg-amber-50 disabled:opacity-40'

const isManualName = (name: string) => /product[_\s-]*manual|\bmanual\b|\bpm\b|^pm[_\s-]/i.test(name)

function pickIsFile(files: IsCodeFileLink[], kind: 'manual' | 'standard'): IsCodeFileLink | null {
  const usable = files.filter((f) => Boolean(f.url?.trim()))
  const pool = usable.length > 0 ? usable : files
  if (pool.length === 0) return null
  return kind === 'manual'
    ? pool.find((f) => isManualName(f.file_name)) ?? null
    : pool.find((f) => !isManualName(f.file_name)) ?? null
}

function openUrl(url: string | undefined, missing: string) {
  if (!url?.trim()) {
    toast.warning(missing)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Opens BIS Product Manuals online; the QE extension searches the IS number when installed. */
function openProductManualOnline(isNumber: string, setBusy: (busy: boolean) => void) {
  const url = 'https://standards.bis.gov.in/website/product-manuals'
  const selected = isNumber.trim()
  if (!selected) {
    window.open(url, '_blank', 'noopener,noreferrer')
    toast.warning('Product Manuals opened. This application has no IS number to search.')
    return
  }
  if (!isQeExtensionPresent()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    toast.warning('Reload the QE Consultancy extension to auto-search the IS number.')
    return
  }
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  setBusy(true)
  let done = false
  const finish = (message: string, isError: boolean) => {
    if (done) return
    done = true
    window.clearTimeout(timer)
    window.removeEventListener('message', onResult)
    setBusy(false)
    if (isError) toast.error(message)
    else toast.success(message)
  }
  const onResult = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return
    const data = event.data
    if (data?.type !== 'QE_PRODUCT_MANUAL_SEARCH_RESULT' || data.requestId !== requestId) return
    finish(String(data.message || (data.ok ? 'Product Manual search started.' : 'Could not search Product Manuals.')), !data.ok)
  }
  const timer = window.setTimeout(() => finish('The QE Consultancy extension did not respond. Reload it and try again.', true), 60000)
  window.addEventListener('message', onResult)
  window.postMessage({ type: 'QE_PRODUCT_MANUAL_SEARCH', requestId, isNumber: selected }, window.location.origin)
}

/** Product manual number with a view button when a manual PDF is attached to the IS Code master (opens in a new tab, no download). */
export function ProductManualValue({ isCodeId, value }: { isCodeId: string | null; value?: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const id = (isCodeId ?? '').trim()
    if (!id) {
      setUrl(null)
      return
    }
    let cancelled = false
    void loadIsCodeFileLinks(id).then((files) => {
      if (!cancelled) setUrl(pickIsFile(files, 'manual')?.url?.trim() || null)
    })
    return () => {
      cancelled = true
    }
  }, [isCodeId])
  return (
    <span className="inline-flex items-center gap-2">
      <span>{value || <span className="text-stone-400">—</span>}</span>
      {url ? (
        <button
          type="button"
          className={cn(iconBtn, 'h-7 w-7 border-stone-400 text-amber-800')}
          title="View product manual PDF"
          aria-label="View product manual PDF"
          onClick={() => openUrl(url, 'Product manual file not found for this IS Code.')}
        >
          <Eye size={14} aria-hidden />
        </button>
      ) : null}
    </span>
  )
}

const FILE_TYPES = ['Copy of Scope', 'Drawing', 'Other'] as const
const typeOf = (file: BisProjectViewFile) => FILE_TYPES.find((t) => file.file_name.startsWith(`${t} - `)) ?? 'Copy of Scope'

/**
 * Varieties with an Action column: view the specification, view the product manual file,
 * open the standard / product manual online, and attach scope files (copy of scope, drawings, other).
 */
export function ManakVarietiesTable({
  projectId,
  isCodeId,
  isNumber,
  varieties,
  onEdit,
  panel,
}: {
  projectId: string | null
  isCodeId: string | null
  isNumber: string
  varieties: string[]
  /** Opens the Sample Requirements module that holds the varieties. */
  onEdit?: () => void
  /** Wraps the table in its panel; the specification / manual / online buttons go in the panel header. */
  panel: (headerExtra: ReactNode, body: ReactNode) => ReactNode
}) {
  const [isFiles, setIsFiles] = useState<IsCodeFileLink[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [scopeFiles, setScopeFiles] = useState<BisProjectViewFile[]>([])
  const [filesOpen, setFilesOpen] = useState(false)
  const [fileType, setFileType] = useState<(typeof FILE_TYPES)[number]>('Copy of Scope')
  const [busy, setBusy] = useState(false)
  const [searchBusy, setSearchBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = (isCodeId ?? '').trim()
    if (!id) {
      setIsFiles([])
      return
    }
    let cancelled = false
    setFilesLoading(true)
    void loadIsCodeFileLinks(id).then((files) => {
      if (!cancelled) {
        setIsFiles(files)
        setFilesLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [isCodeId])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void listBisProjectFiles(projectId, 'manufacturing-scope')
      .then((files) => {
        if (!cancelled) setScopeFiles(files)
      })
      .catch(() => {
        if (!cancelled) setScopeFiles([])
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const standardFile = pickIsFile(isFiles, 'standard')
  const manualFile = pickIsFile(isFiles, 'manual')

  const upload = async (file?: File) => {
    if (!projectId || !file) return
    const okType = file.type === 'application/pdf' || /^image\//.test(file.type) || /\.(pdf|png|jpe?g|webp)$/i.test(file.name)
    if (!okType) {
      toast.error('Upload a PDF or image file.')
      return
    }
    setBusy(true)
    try {
      const displayName = `${fileType} - ${file.name}`
      const uploaded = await uploadBisProjectFile(projectId, file, 'manufacturing-scope', { displayName })
      // A new "Copy of Scope" replaces the previous one; drawings and other files are kept.
      const replaced = fileType === 'Copy of Scope' ? scopeFiles.filter((f) => typeOf(f) === 'Copy of Scope' && f.id !== uploaded.id) : []
      await Promise.allSettled(replaced.map(deleteBisProjectFile))
      setScopeFiles([...scopeFiles.filter((f) => !replaced.some((r) => r.id === f.id)), uploaded])
      toast.success(`${fileType} uploaded`)
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setBusy(false)
    }
  }

  const removeFile = async (file: BisProjectViewFile) => {
    setBusy(true)
    try {
      await deleteBisProjectFile(file)
      setScopeFiles((prev) => prev.filter((f) => f.id !== file.id))
      toast.success('File deleted')
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setBusy(false)
    }
  }

  const rows = varieties.length > 0 ? varieties : []
  const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
  const td = 'border border-[#e7e0d4] px-2 py-1.5 align-top text-sm text-stone-700'

  const docButtons = (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={cn(iconBtn, 'border-stone-400 text-amber-800')}
        disabled={filesLoading || !standardFile?.url}
        title={standardFile?.file_name ? `View specification: ${standardFile.file_name}` : 'No specification attached to this IS Code'}
        aria-label="View specification"
        onClick={() => openUrl(standardFile?.url, 'Specification file not found for this IS Code.')}
      >
        <BookOpen size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={cn(iconBtn, 'border-stone-400 text-amber-800')}
        disabled={filesLoading || !manualFile?.url}
        title={manualFile?.file_name ? `View product manual: ${manualFile.file_name}` : 'No product manual attached to this IS Code'}
        aria-label="View product manual"
        onClick={() => openUrl(manualFile?.url, 'Product manual file not found for this IS Code.')}
      >
        <FileText size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={cn(iconBtn, 'border-stone-400 text-amber-800')}
        disabled={searchBusy}
        title="Open the standard / product manual online (BIS) and search this IS number"
        aria-label="Open standard online"
        onClick={() => openProductManualOnline(isNumber, setSearchBusy)}
      >
        <ExternalLink size={15} aria-hidden />
      </button>
    </div>
  )

  const actions = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={cn(iconBtn, 'border-stone-400 text-amber-800')}
        disabled={!onEdit}
        title="Edit varieties (Sample Requirements)"
        aria-label="Edit varieties"
        onClick={onEdit}
      >
        <Pencil size={14} aria-hidden />
      </button>
      <button
        type="button"
        className={cn(iconBtn, scopeFiles.length > 0 ? 'border-emerald-600 text-emerald-800' : 'border-stone-400 text-amber-800')}
        disabled={!projectId}
        title={scopeFiles.length > 0 ? `Scope files (${scopeFiles.length}): view, upload or delete` : 'Upload copy of scope, drawing or other file'}
        aria-label="Scope files"
        onClick={() => setFilesOpen(true)}
      >
        <Paperclip size={15} aria-hidden />
      </button>
    </div>
  )

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,.pdf"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void upload(file)
        }}
      />
      {panel(
        docButtons,
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(th, 'w-8 px-1 text-center')}>#</th>
              <th className={th}>Variety applied for</th>
              <th className={cn(th, 'w-[1%] whitespace-nowrap')}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className={cn(td, 'py-3 text-center text-stone-500')}>
                  No varieties yet — they come from Sample Requirements.
                </td>
              </tr>
            ) : (
              rows.map((v, i) => (
                <tr key={i} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                  <td className={cn(td, 'px-1 text-center')}>{i + 1}</td>
                  <td className={td}>{v}</td>
                  <td className={cn(td, 'whitespace-nowrap')}>{actions}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>,
      )}
      <Dialog open={filesOpen} onOpenChange={setFilesOpen}>
        <DialogContent className="max-w-lg rounded-none">
          <DialogHeader>
            <DialogTitle>Scope files</DialogTitle>
            <DialogDescription>Copy of scope, drawings or any other supporting file for this application.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-56 divide-y divide-stone-200 overflow-y-auto border border-stone-300">
            {scopeFiles.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-stone-500">No files uploaded yet.</li>
            ) : (
              scopeFiles.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate" title={f.file_name}>
                    <span className="mr-2 inline-block rounded-none bg-stone-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                      {typeOf(f)}
                    </span>
                    {f.file_name.replace(`${typeOf(f)} - `, '')}
                  </span>
                  <span className="inline-flex shrink-0 gap-1">
                    <button type="button" className={cn(iconBtn, 'h-7 w-7 border-stone-400 text-amber-800')} title="View" aria-label="View file" onClick={() => openUrl(f.viewUrl, f.error || 'File is unavailable.')}>
                      <Eye size={14} aria-hidden />
                    </button>
                    <button type="button" className={cn(iconBtn, 'h-7 w-7 border-red-300 text-red-700')} title="Delete" aria-label="Delete file" disabled={busy} onClick={() => void removeFile(f)}>
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </span>
                </li>
              ))
            )}
          </ul>
          <div className="flex items-center gap-2">
            <select
              className="h-8 flex-1 rounded-none border border-stone-400 bg-white px-2 text-sm"
              value={fileType}
              onChange={(e) => setFileType(e.target.value as (typeof FILE_TYPES)[number])}
              aria-label="Type of file"
            >
              {FILE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button type="button" className="rounded-none bg-amber-700 text-white hover:bg-amber-800" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload size={14} className="mr-1.5" aria-hidden /> {busy ? 'Uploading…' : 'Upload file'}
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-none" onClick={() => setFilesOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
