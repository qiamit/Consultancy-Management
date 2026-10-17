import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList, Eye, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { usePdfViewer } from '@/components/ui/usePdfViewer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveBisModulePayload } from './bisModuleDataApi'
import {
  deleteBisProjectFile,
  formatBisProjectFilesError,
  listBisProjectFiles,
  uploadBisProjectFile,
  type BisProjectViewFile,
} from './bisProjectFilesApi'
import { parseCmpf311Payload } from './cmpf311Model'
import { ProductManualValue } from './ManakVarietiesTable'

const labelCls =
  'whitespace-nowrap border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-1.5 text-left align-middle text-sm font-bold text-stone-800'
const valueCls = 'border border-[#e7e0d4] px-2 py-1 align-middle text-sm text-stone-700'

/**
 * "Select SIT" line of the Indian Standard panel.
 * Yes = BIS SIT: the Product Manual number comes from the IS Code master and stays editable.
 * No = Own SIT: a button opens the Acceptance of SIT form (AI extraction of Annexure C, SIT table and notes).
 * Both choices are stored in the Acceptance of SIT module (cmpf-311).
 */
export function ManakSitRow({
  projectId,
  isCodeId,
  masterManualNumber,
  payload,
  onChanged,
  onOpenOwnSit,
}: {
  projectId: string | null
  isCodeId: string | null
  masterManualNumber: string
  payload: Record<string, unknown> | null
  onChanged: () => void
  onOpenOwnSit: () => void
}) {
  const saved = parseCmpf311Payload(payload)
  const bisSit = saved.mode === 'bis-sit'
  const storedNumber = payload ? saved.productManualNumber : ''
  // Yes (BIS SIT): always the Product Manual number maintained in IS Code master; No (Own SIT): only what is typed here.
  const shownDefault = bisSit ? masterManualNumber : storedNumber
  const [number, setNumber] = useState(shownDefault)
  useEffect(() => {
    setNumber(shownDefault)
  }, [shownDefault])

  const save = async (next: Partial<typeof saved>) => {
    if (!projectId) return
    try {
      await saveBisModulePayload(projectId, 'cmpf-311', { ...saved, ...next })
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the SIT selection.')
    }
  }

  const ownSummary = [
    saved.annexureSections.length ? `Annexure C: ${saved.annexureSections.length}` : '',
    saved.testRows.length ? `SIT table: ${saved.testRows.length}` : '',
    saved.notes.length ? `Notes: ${saved.notes.length}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
    <table className="-mt-px w-full table-fixed border-collapse">
      {/* The first label is as wide as the Standard Title label above (15%). */}
      <colgroup>
        <col style={{ width: '15%' }} />
        <col style={{ width: '17%' }} />
        <col style={{ width: '13%' }} />
        <col style={{ width: '28%' }} />
        <col style={{ width: '12%' }} />
        <col style={{ width: '15%' }} />
      </colgroup>
      <tbody>
        <tr>
          <th scope="row" className={labelCls}>
            Select SIT:
          </th>
          <td className={valueCls}>
            <Select
              value={bisSit ? 'yes' : 'no'}
              disabled={!projectId}
              onValueChange={(v) => {
                const mode = v === 'yes' ? 'bis-sit' : 'on-sit'
                // Yes takes the number from the IS Code master; No starts a separate Own SIT number.
                void save({ mode, productManualNumber: mode === 'bis-sit' ? masterManualNumber : '' })
              }}
            >
              <SelectTrigger className="h-8 rounded-none border-stone-300 bg-white text-sm" aria-label="Select SIT">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes (BIS SIT)</SelectItem>
                <SelectItem value="no">No (Own SIT)</SelectItem>
              </SelectContent>
            </Select>
          </td>
          <th scope="row" className={labelCls}>
            {bisSit ? 'Product Manual:' : 'Own SIT:'}
          </th>
          <td className={valueCls}>
            <div className="flex items-center gap-2">
              <Input
                className="h-8 min-w-0 flex-1 rounded-none border-stone-300 bg-white text-sm"
                aria-label="Product Manual number"
                value={number}
                placeholder={bisSit ? 'Set Product Manual Number in IS Code master' : 'Enter Product Manual / SIT number'}
                disabled={!projectId || bisSit}
                title={bisSit ? 'Comes from the selected IS Code master' : undefined}
                onChange={(e) => setNumber(e.target.value)}
                onBlur={() => {
                  if (!bisSit && number.trim() !== shownDefault) void save({ productManualNumber: number.trim() })
                }}
              />
              {bisSit ? (
                <ProductManualValue isCodeId={isCodeId} buttonOnly />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-8 shrink-0 rounded-none border-stone-400 bg-white p-0 text-amber-800 shadow-none hover:bg-amber-50"
                  title={ownSummary ? `Open Acceptance of SIT (${ownSummary})` : 'Open Acceptance of SIT: select Product Manual, generate Annexure C, SIT table and notes'}
                  aria-label="Open Own SIT"
                  onClick={onOpenOwnSit}
                >
                  <ClipboardList className="h-[15px] w-[15px]" aria-hidden />
                </Button>
              )}
            </div>
          </td>
          <th scope="row" className={labelCls}>
            Consent Letter:
          </th>
          <td className={valueCls}>
            <ConsentLetterControl projectId={projectId} />
          </td>
        </tr>
      </tbody>
    </table>
    </>
  )
}

/**
 * Consent letter control (applies to BIS SIT and Own SIT alike): a clip button uploads; once a letter exists its eye button
 * replaces it. Single click views the letter, double click deletes it.
 */
function ConsentLetterControl({ projectId }: { projectId: string | null }) {
  const [confirmAction, confirmDialog] = useConfirmDialog()
  const [viewFile, viewer] = usePdfViewer()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const clickTimer = useRef<number | null>(null)
  const [files, setFiles] = useState<BisProjectViewFile[]>([])
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async (id: string) => {
    setFiles(await listBisProjectFiles(id, 'consent-letter'))
  }, [])

  useEffect(() => {
    if (!projectId) {
      setFiles([])
      return
    }
    let active = true
    void listBisProjectFiles(projectId, 'consent-letter')
      .then((list) => {
        if (active) setFiles(list)
      })
      .catch((error: unknown) => {
        if (active) toast.error(formatBisProjectFilesError(error))
      })
    return () => {
      active = false
    }
  }, [projectId])

  const upload = async (file?: File) => {
    if (!projectId || !file) return
    setBusy(true)
    try {
      await uploadBisProjectFile(projectId, file, 'consent-letter')
      // One consent letter is enough: a new upload replaces the earlier ones.
      const latest = await listBisProjectFiles(projectId, 'consent-letter')
      await Promise.allSettled(latest.slice(1).map(deleteBisProjectFile))
      await reload(projectId)
      toast.success('Consent letter uploaded.')
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const view = (file: BisProjectViewFile) => viewFile(file.viewUrl, file.file_name, 'Consent letter file is unavailable.')

  const remove = async (file: BisProjectViewFile) => {
    if (!projectId) return
    if (!(await confirmAction(`Delete ${file.file_name}?`, { title: 'Delete consent letter' }))) return
    setBusy(true)
    try {
      await deleteBisProjectFile(file)
      await reload(projectId)
      toast.success('Consent letter deleted.')
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setBusy(false)
    }
  }

  const btn = 'h-8 w-8 shrink-0 rounded-none border-stone-400 bg-white p-0 text-amber-800 shadow-none hover:bg-amber-50'

  return (
    <div className="flex items-center gap-1">
      {confirmDialog}
      {viewer}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        className="hidden"
        disabled={!projectId || busy}
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      {files.length === 0 ? (
        <Button
          type="button"
          variant="outline"
          className={btn}
          disabled={!projectId || busy}
          title="Upload consent letter"
          aria-label="Upload consent letter"
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="h-[15px] w-[15px]" aria-hidden />
        </Button>
      ) : (
        [files[0]!].map((file) => (
          <Button
            key={file.id}
            type="button"
            variant="outline"
            className={btn}
            disabled={busy}
            title={`${file.file_name} — click to view, double-click to delete`}
            aria-label={`View consent letter ${file.file_name}`}
            onClick={() => {
              if (clickTimer.current) window.clearTimeout(clickTimer.current)
              clickTimer.current = window.setTimeout(() => view(file), 250)
            }}
            onDoubleClick={() => {
              if (clickTimer.current) window.clearTimeout(clickTimer.current)
              void remove(file)
            }}
          >
            <Eye className="h-[15px] w-[15px]" aria-hidden />
          </Button>
        ))
      )}
    </div>
  )
}
