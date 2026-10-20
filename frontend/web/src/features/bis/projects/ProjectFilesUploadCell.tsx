import { useEffect, useState } from 'react'
import { Eye, FileCheck2, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  createBisProjectFileUrls,
  deleteBisProjectFile,
  formatBisProjectFilesError,
  listBisProjectFiles,
  uploadBisProjectFile,
  type BisProjectViewFile,
} from './bisProjectFilesApi'

const btn = 'inline-flex h-8 w-8 items-center justify-center rounded-none border p-0 text-white shadow-sm transition-colors'

/**
 * Upload-only action cell for documents that are always supplied as PDFs (e.g. outsourced Calibration Certificates):
 * red Upload until a file exists, then green with the count — click it to view or delete the uploaded files.
 */
export function ProjectFilesUploadCell({ projectId, docKind, label }: { projectId: string; docKind: string; label: string }) {
  const [files, setFiles] = useState<BisProjectViewFile[]>([])
  const [busy, setBusy] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  const [tick, setTick] = useState(0)
  const reload = () => setTick((t) => t + 1)

  useEffect(() => {
    let cancelled = false
    listBisProjectFiles(projectId, docKind)
      .then((list) => {
        if (!cancelled) setFiles(list)
      })
      .catch((err) => toast.error(formatBisProjectFilesError(err)))
    return () => {
      cancelled = true
    }
  }, [projectId, docKind, tick])

  const upload = async (picked: File[]) => {
    const pdfs = picked.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length < picked.length) toast.error('Only PDF Files Can Be Uploaded.')
    if (pdfs.length === 0) return
    setBusy(true)
    try {
      for (const file of pdfs) await uploadBisProjectFile(projectId, file, docKind)
      toast.success(`${pdfs.length} ${label} file${pdfs.length === 1 ? '' : 's'} uploaded.`)
      reload()
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    } finally {
      setBusy(false)
    }
  }

  const view = async (file: BisProjectViewFile) => {
    try {
      const urls = await createBisProjectFileUrls(file.storage_path, file.file_name)
      if (!urls.viewUrl) throw new Error('Unable to open this PDF.')
      window.open(urls.viewUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    }
  }

  const remove = async (file: BisProjectViewFile) => {
    if (!window.confirm(`Delete ${file.file_name}?`)) return
    try {
      await deleteBisProjectFile(file)
      reload()
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    }
  }

  const has = files.length > 0
  return (
    <div className="inline-flex items-center gap-1">
      <label
        title={busy ? 'Uploading…' : `Upload ${label} (PDF)`}
        aria-label={`Upload ${label} PDF`}
        className={cn(
          btn,
          'cursor-pointer',
          has ? 'border-amber-700 bg-amber-600 hover:bg-amber-700' : 'border-red-700 bg-red-600 hover:bg-red-700',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        <input
          type="file"
          multiple
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (picked.length) void upload(picked)
          }}
        />
      </label>
      {has ? (
        <button
          type="button"
          title={`${files.length} ${label} file${files.length === 1 ? '' : 's'} uploaded — click to view`}
          aria-label={`View uploaded ${label}`}
          className={cn(btn, 'relative border-green-800 bg-green-600 hover:bg-green-700')}
          onClick={() => setListOpen(true)}
        >
          <FileCheck2 className="h-4 w-4" aria-hidden />
          <span className="absolute -right-1.5 -top-1.5 min-w-[1rem] rounded-full bg-stone-900 px-1 text-[10px] font-bold leading-4 text-white">{files.length}</span>
        </button>
      ) : null}

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent layer="stacked" aria-describedby={undefined} className={cn(limsDialogClass, 'w-[min(36rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_1.5rem))] p-0')}>
          <DialogHeader className="bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-2.5 pl-4 pr-12 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">{label}</DialogTitle>
          </DialogHeader>
          <ul className="max-h-[60vh] divide-y divide-[#e7e0d4] overflow-y-auto bg-[#fffcf7] px-4 py-2 text-left">
            {files.map((file, i) => (
              <li key={file.id} className="flex items-center gap-2 py-2 text-sm text-stone-800">
                <span className="w-6 shrink-0 text-stone-500">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate">{file.file_name}</span>
                <Button type="button" variant="ghost" className="h-7 w-7 rounded-none border border-stone-400 p-0 text-amber-800" title="View" onClick={() => void view(file)}>
                  <Eye size={13} />
                </Button>
                <Button type="button" variant="ghost" className="h-7 w-7 rounded-none border border-stone-400 p-0 text-red-700" title="Delete" onClick={() => void remove(file)}>
                  <Trash2 size={13} />
                </Button>
              </li>
            ))}
            {files.length === 0 ? <li className="py-3 text-center text-sm text-stone-500">No Files Uploaded.</li> : null}
          </ul>
          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3">
            <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} onClick={() => setListOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
