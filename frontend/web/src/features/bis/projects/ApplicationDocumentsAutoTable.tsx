import { useEffect, useState } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { usePdfViewer } from '@/components/ui/usePdfViewer'
import { DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS } from '../print/bisDocumentPrintPageSettings'
import { loadApplicationDocumentRows, otherInformationDocumentRows, type Row } from './applicationDocuments'
import { buildBisDocumentPdfBlob } from './bisDocumentPdf'
import { loadBisProjectPrintPageSettings } from './bisPrintPageSettingsApi'
import { createBisProjectFileUrls } from './bisProjectFilesApi'
import type { BisProjectRow } from './types'

const thCls = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'

/**
 * Other Information (Step 7): every application document, attached automatically as a PDF — the same list as
 * Step 8 Preview. Manak Assist generates these PDFs and uploads them as Other Information on Manak.
 */
export function ApplicationDocumentsAutoTable({ projectRow, refreshKey }: { projectRow: BisProjectRow; refreshKey?: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void loadApplicationDocumentRows(projectRow)
      .then((all) => {
        if (active) setRows(otherInformationDocumentRows(all))
      })
      .catch(() => {
        if (active) setRows([])
      })
    return () => {
      active = false
    }
  }, [projectRow, refreshKey])

  // In-app viewer: window.open is blocked in embedded browsers.
  const [viewFile, viewer] = usePdfViewer()

  const open = async (r: Row) => {
    setOpening(r.id)
    try {
      let href = ''
      if (r.type === 'file') {
        const urls = await createBisProjectFileUrls(r.file.storage_path, r.file.file_name)
        href = urls.viewUrl || urls.downloadUrl || ''
      } else {
        const settings = await loadBisProjectPrintPageSettings(projectRow.id).catch(() => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS)
        href = URL.createObjectURL(await buildBisDocumentPdfBlob(projectRow, r.kind, settings))
      }
      viewFile(href, r.label, 'Could not open the PDF.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the PDF.')
    } finally {
      setOpening(null)
    }
  }

  return (
    <div className="mb-3">
      {viewer}
      <p className="mb-1.5 text-xs text-stone-600">
        All application documents are attached here automatically as PDFs (same list as Step 8). Manak Assist uploads them as Other
        Information; add any extra files below.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${thCls} w-10 text-center`}>#</th>
              <th className={thCls}>File Name (automatic)</th>
              <th className={`${thCls} w-20 text-center`}>PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows == null ? (
              <tr>
                <td colSpan={3} className={`${tdCls} text-center text-stone-500`}>
                  Loading application documents…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3} className={`${tdCls} text-center text-stone-500`}>
                  No application documents yet.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                  <td className={`${tdCls} text-center`}>{i + 1}</td>
                  <td className={tdCls}>{r.label}</td>
                  <td className={`${tdCls} text-center`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 rounded-none border border-stone-400 bg-white/70 p-0 text-amber-800 shadow-sm hover:border-amber-600 hover:bg-amber-50"
                      title={`View PDF — ${r.label}`}
                      aria-label={`View PDF — ${r.label}`}
                      disabled={opening != null}
                      onClick={() => void open(r)}
                    >
                      {opening === r.id ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Eye size={15} aria-hidden />}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
