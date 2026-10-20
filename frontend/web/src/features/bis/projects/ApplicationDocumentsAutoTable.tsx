import { useEffect, useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { usePdfViewer } from '@/components/ui/usePdfViewer'
import { DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS } from '../print/bisDocumentPrintPageSettings'
import {
  loadApplicationDocumentRows,
  otherInformationDocumentRows,
  otherInformationUploadOn,
  setOtherInformationUpload,
  type OtherInformationUploadChoice,
  type Row,
} from './applicationDocuments'
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
export function ApplicationDocumentsAutoTable({
  projectRow,
  choice,
  onChoiceChange,
}: {
  projectRow: BisProjectRow
  /** Upload switches saved in Step 7; Manak Assist uploads only the documents switched ON. */
  choice: OtherInformationUploadChoice
  onChoiceChange: (next: OtherInformationUploadChoice) => Promise<void>
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [pending, setPending] = useState<OtherInformationUploadChoice | null>(null)
  const current = pending ?? choice
  const toggle = (row: Row, on: boolean) => {
    const next = setOtherInformationUpload(current, [row], on)
    setPending(next)
    void onChoiceChange(next)
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not save the selection'))
      .finally(() => setPending(null))
  }
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
  }, [projectRow])

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
    <div className="mt-3">
      {viewer}
      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${thCls} w-10 text-center`}>#</th>
              <th className={thCls}>File Name (Automatic)</th>
              <th className={`${thCls} w-28 text-center`}>
                Upload
              </th>
              <th className={`${thCls} w-20 text-center`}>PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows == null ? (
              <tr>
                <td colSpan={4} className={`${tdCls} text-center text-stone-500`}>
                  Loading application documents…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className={`${tdCls} text-center text-stone-500`}>
                  No application documents yet.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                  <td className={`${tdCls} text-center`}>{i + 1}</td>
                  <td className={tdCls}>{r.label}</td>
                  <td className={`${tdCls} text-center`}>
                    <UploadToggle on={otherInformationUploadOn(r, current)} label={`Upload ${r.label} on Manak`} onChange={(on) => toggle(r, on)} />
                  </td>
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
                      {opening === r.id ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <FileDown size={15} aria-hidden />}
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

/** On / off switch: ON = Manak Assist uploads this document as Other Information. */
function UploadToggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={on ? `${label}: ON` : `${label}: OFF`}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 ${
        on ? 'border-amber-700 bg-amber-600' : 'border-stone-400 bg-stone-300'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}
