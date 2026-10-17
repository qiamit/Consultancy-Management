import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList, Eye, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
      {/* Labels are the same width as the Standard Title label above (15%). */}
      <colgroup>
        <col style={{ width: '15%' }} />
        <col style={{ width: '35%' }} />
        <col style={{ width: '15%' }} />
        <col style={{ width: '35%' }} />
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
        </tr>
      </tbody>
    </table>
    <ConsentLetterRow projectId={projectId} />
    </>
  )
}

/** Consent letter upload line: applies to BIS SIT and Own SIT alike, so it lives outside the SIT module. */
function ConsentLetterRow({ projectId }: { projectId: string | null }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
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
      await reload(projectId)
      toast.success('Consent letter uploaded.')
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (file: BisProjectViewFile) => {
    if (!projectId) return
    setBusy(true)
    try {
      await deleteBisProjectFile(file)
      await reload(projectId)
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <table className="-mt-px w-full table-fixed border-collapse">
      <colgroup>
        <col style={{ width: '15%' }} />
        <col style={{ width: '85%' }} />
      </colgroup>
      <tbody>
        <tr>
          <th scope="row" className={labelCls}>
            Consent Letter:
          </th>
          <td className={valueCls}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                className="hidden"
                disabled={!projectId || busy}
                onChange={(event) => void upload(event.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none border-stone-400 bg-white text-xs text-amber-800 shadow-none hover:bg-amber-50"
                disabled={!projectId || busy}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-4 w-4" aria-hidden /> Upload Consent Letter
              </Button>
              {files.map((file) => (
                <span key={file.id} className="inline-flex max-w-full items-center gap-1 border border-stone-300 bg-white px-2 py-1 text-xs">
                  <span className="max-w-[240px] truncate" title={file.file_name}>
                    {file.file_name}
                  </span>
                  {file.viewUrl ? (
                    <a className="inline-flex h-6 w-6 items-center justify-center text-amber-800" href={file.viewUrl} target="_blank" rel="noreferrer" aria-label={`View ${file.file_name}`}>
                      <Eye size={14} />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center text-red-700 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void remove(file)}
                    aria-label={`Remove ${file.file_name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              ))}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  )
}
