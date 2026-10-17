import { useEffect, useRef, useState } from 'react'
import { BookOpen, ExternalLink, FileText, ScrollText, Upload } from 'lucide-react'
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

/**
 * Varieties with an Action column: view the specification, view the product manual file,
 * open the standard / product manual online, and the copy of scope PDF
 * (click uploads or views, double-click offers delete).
 */
export function ManakVarietiesTable({
  projectId,
  isCodeId,
  isNumber,
  varieties,
}: {
  projectId: string | null
  isCodeId: string | null
  isNumber: string
  varieties: string[]
}) {
  const [isFiles, setIsFiles] = useState<IsCodeFileLink[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [scopeFile, setScopeFile] = useState<BisProjectViewFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [searchBusy, setSearchBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const timer = useRef<number | null>(null)

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
        if (!cancelled) setScopeFile(files[0] ?? null)
      })
      .catch(() => {
        if (!cancelled) setScopeFile(null)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  const standardFile = pickIsFile(isFiles, 'standard')
  const manualFile = pickIsFile(isFiles, 'manual')

  const upload = async (file?: File) => {
    if (!projectId || !file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Copy of scope must be a PDF file.')
      return
    }
    setBusy(true)
    try {
      const uploaded = await uploadBisProjectFile(projectId, file, 'manufacturing-scope', { displayName: 'Manufacturing Scope.pdf' })
      if (scopeFile && scopeFile.id !== uploaded.id) await deleteBisProjectFile(scopeFile).catch(() => undefined)
      setScopeFile(uploaded)
      toast.success('Copy of scope uploaded')
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setBusy(false)
    }
  }

  const removeScope = async () => {
    if (!scopeFile) return
    setBusy(true)
    try {
      await deleteBisProjectFile(scopeFile)
      setScopeFile(null)
      setConfirmDelete(false)
      toast.success('Copy of scope deleted')
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setBusy(false)
    }
  }

  const onScopeClick = () => {
    if (busy || !projectId) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      if (scopeFile) openUrl(scopeFile.viewUrl, scopeFile.error || 'Copy of scope is unavailable.')
      else fileRef.current?.click()
    }, 250)
  }
  const onScopeDouble = () => {
    if (busy || !projectId || !scopeFile) return
    if (timer.current) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    setConfirmDelete(true)
  }

  const rows = varieties.length > 0 ? varieties : []
  const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
  const td = 'border border-[#e7e0d4] px-2 py-1.5 align-top text-sm text-stone-700'

  const actions = (
    <div className="flex items-center gap-1">
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
      <button
        type="button"
        className={cn(iconBtn, scopeFile ? 'border-emerald-600 text-emerald-800' : 'border-red-500 text-red-700')}
        disabled={busy || !projectId}
        title={scopeFile ? 'Copy of scope: click to view, double-click to delete' : 'Copy of scope: click to upload PDF'}
        aria-label={scopeFile ? 'View copy of scope' : 'Upload copy of scope'}
        onClick={onScopeClick}
        onDoubleClick={onScopeDouble}
      >
        {scopeFile ? <ScrollText size={15} aria-hidden /> : <Upload size={15} aria-hidden />}
      </button>
    </div>
  )

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void upload(file)
        }}
      />
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
      </div>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm rounded-none">
          <DialogHeader>
            <DialogTitle>Delete copy of scope?</DialogTitle>
            <DialogDescription>The uploaded scope PDF is removed from this application. You can upload it again afterwards.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="rounded-none" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button type="button" className="rounded-none bg-red-700 text-white hover:bg-red-800" disabled={busy} onClick={() => void removeScope()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
