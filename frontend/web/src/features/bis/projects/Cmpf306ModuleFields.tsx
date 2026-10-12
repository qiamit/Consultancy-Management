import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, FileSpreadsheet, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsFieldClass, limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  cmpf306RowHasContent,
  emptyCmpf306EquipmentRow,
  type Cmpf306EquipmentRow,
  type Cmpf306ModulePayload,
} from './cmpf306Model'
import { importCmpfSpreadsheetRows } from './cmpfSpreadsheetImport'
import {
  deleteBisProjectFile,
  formatBisProjectFilesError,
  listBisProjectFiles,
  uploadBisProjectFile,
  type BisProjectDocKind,
  type BisProjectViewFile,
} from './bisProjectFilesApi'
import {
  SavedValueSuggestInput,
  uniqueSavedColumnValues,
} from './SavedValueSuggestInput'

const thClass =
  'bg-stone-800 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200'
const actionBtnClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none p-0 text-amber-900 hover:bg-amber-100 hover:text-amber-950'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const cellInputClass = cn(limsFieldClass, 'h-8 min-w-0 text-xs sm:text-sm')

type StickyField = Exclude<keyof Cmpf306EquipmentRow, 'equipmentName'>

export function Cmpf306ModuleFields({
  value,
  onChange,
  disabled = false,
  projectId,
}: {
  value: Cmpf306ModulePayload
  onChange: (next: Cmpf306ModulePayload) => void
  disabled?: boolean
  projectId: string | null
}) {
  const savedRows = value.rows.filter(cmpf306RowHasContent)
  const [draft, setDraft] = useState<Cmpf306EquipmentRow>(() => emptyCmpf306EquipmentRow())
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const calibrationInputRef = useRef<HTMLInputElement | null>(null)
  const consentInputRef = useRef<HTMLInputElement | null>(null)
  const [attachmentState, setAttachmentState] = useState<{
    projectId: string | null
    files: Record<string, BisProjectViewFile[]>
  }>({ projectId: null, files: {} })
  const [attachmentBusy, setAttachmentBusy] = useState<BisProjectDocKind | null>(null)
  const attachments = attachmentState.projectId === projectId ? attachmentState.files : {}

  const fetchAttachments = useCallback(async (id: string) => {
    const [calibration, consent] = await Promise.all([
      listBisProjectFiles(id, 'calibration-certificates'),
      listBisProjectFiles(id, 'consent-letter'),
    ])
    return { 'calibration-certificates': calibration, 'consent-letter': consent }
  }, [])

  useEffect(() => {
    if (!projectId) return
    let active = true
    const load = async () => {
      try {
        const files = await fetchAttachments(projectId)
        if (active) setAttachmentState({ projectId, files })
      } catch (error) {
        if (active) toast.error(formatBisProjectFilesError(error))
      }
    }
    void load()
    return () => { active = false }
  }, [projectId, fetchAttachments])

  const reloadAttachments = async (id: string) => {
    const files = await fetchAttachments(id)
    setAttachmentState({ projectId: id, files })
  }

  const uploadAttachment = async (kind: BisProjectDocKind, file?: File) => {
    if (!projectId || !file) return
    setAttachmentBusy(kind)
    try {
      await uploadBisProjectFile(projectId, file, kind)
      await reloadAttachments(projectId)
      toast.success(kind === 'calibration-certificates' ? 'Calibration certificate uploaded.' : 'Consent letter uploaded.')
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setAttachmentBusy(null)
      if (kind === 'calibration-certificates' && calibrationInputRef.current) calibrationInputRef.current.value = ''
      if (kind === 'consent-letter' && consentInputRef.current) consentInputRef.current.value = ''
    }
  }

  const removeAttachment = async (kind: BisProjectDocKind, file: BisProjectViewFile) => {
    if (!projectId) return
    setAttachmentBusy(kind)
    try {
      await deleteBisProjectFile(file)
      await reloadAttachments(projectId)
      toast.success('Attachment removed.')
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setAttachmentBusy(null)
    }
  }

  const importSpreadsheet = async (file: File) => {
    try {
      const importedRows = await importCmpfSpreadsheetRows<Cmpf306EquipmentRow>(
        file,
        [
          { key: 'equipmentName', aliases: ['test equipments chemicals', 'test equipment', 'equipment name', 'equipment', 'chemical'] },
          { key: 'make', aliases: ['make', 'manufacturer'] },
          { key: 'leastCount', aliases: ['least count', 'leastcount', 'resolution'] },
          { key: 'range', aliases: ['range', 'measurement range'] },
          { key: 'calibrationStatus', aliases: ['calibration status', 'calibration', 'calibration due'] },
          { key: 'clauseNo', aliases: ['clause no', 'clause number', 'clause'] },
          { key: 'quantity', aliases: ['quantity', 'qty', 'number'] },
        ],
        cmpf306RowHasContent,
      )
      if (!importedRows.length) {
        toast.error('No testing equipment rows were found in the selected spreadsheet.')
        return
      }
      onChange({ ...value, rows: [...savedRows, ...importedRows] })
      toast.success(`Imported ${importedRows.length} testing equipment row(s).`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to import the spreadsheet.')
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const columnSuggestions = useMemo(() => {
    const pick = (key: StickyField) =>
      uniqueSavedColumnValues(savedRows.map((row) => row[key]))
    return {
      make: pick('make'),
      leastCount: pick('leastCount'),
      range: pick('range'),
      calibrationStatus: pick('calibrationStatus'),
      clauseNo: pick('clauseNo'),
      quantity: pick('quantity'),
    }
  }, [savedRows])

  useEffect(() => {
    // Do not wipe sticky draft fields (Make…Quantity) when a row is added.
    setEditingIndex(null)
  }, [value.rows.length])

  const focusName = () => {
    requestAnimationFrame(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    })
  }

  const patchDraft = <K extends keyof Cmpf306EquipmentRow>(key: K, raw: string) => {
    setDraft((prev) => ({ ...prev, [key]: raw }))
  }

  const setSavedRows = (rows: Cmpf306EquipmentRow[]) => {
    onChange({ ...value, rows })
  }

  const commitDraft = () => {
    if (disabled) return
    if (!draft.equipmentName.trim()) {
      toast.error('Enter the name of the test equipment before adding.')
      focusName()
      return
    }
    if (!cmpf306RowHasContent(draft)) {
      toast.error('Enter testing equipment details before adding.')
      focusName()
      return
    }
    const nextRow: Cmpf306EquipmentRow = {
      equipmentName: draft.equipmentName.trim(),
      make: draft.make.trim(),
      leastCount: draft.leastCount.trim(),
      range: draft.range.trim(),
      calibrationStatus: draft.calibrationStatus.trim(),
      clauseNo: draft.clauseNo.trim(),
      quantity: draft.quantity.trim(),
    }
    if (editingIndex != null && editingIndex >= 0 && editingIndex < savedRows.length) {
      setSavedRows(savedRows.map((row, i) => (i === editingIndex ? nextRow : row)))
    } else {
      setSavedRows([...savedRows, nextRow])
    }
    // Keep Make / Least Count / Range / Calibration / Clause / Qty for the next entry.
    setDraft((prev) => ({
      ...prev,
      equipmentName: '',
    }))
    setEditingIndex(null)
    focusName()
  }

  const startEdit = (index: number) => {
    if (disabled) return
    const row = savedRows[index]
    if (!row) return
    setDraft({ ...row })
    setEditingIndex(index)
    focusName()
  }

  const removeSaved = (index: number) => {
    if (disabled) return
    setSavedRows(savedRows.filter((_, i) => i !== index))
    if (editingIndex === index) {
      setDraft(emptyCmpf306EquipmentRow())
      setEditingIndex(null)
      focusName()
    } else if (editingIndex != null && editingIndex > index) {
      setEditingIndex(editingIndex - 1)
    }
  }

  const onDraftKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    commitDraft()
  }

  const stickySuggest = (
    field: StickyField,
    placeholder: string,
    extraClass?: string,
  ) => (
    <SavedValueSuggestInput
      className={cn(cellInputClass, 'text-center', extraClass)}
      value={draft[field]}
      disabled={disabled}
      placeholder={placeholder}
      suggestions={columnSuggestions[field]}
      onChange={(next) => patchDraft(field, next)}
      onKeyDown={onDraftKeyDown}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
          List of Testing Equipment
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {editingIndex != null ? (
            <p className="text-[11px] font-medium text-amber-800">
              Editing row {editingIndex + 1} — press + to update
            </p>
          ) : null}
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importSpreadsheet(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(limsOutlineBtnClass, 'h-8')}
            disabled={disabled}
            onClick={() => importInputRef.current?.click()}
          >
            <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden /> Import Excel
          </Button>
          <input ref={calibrationInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="hidden" disabled={disabled || !projectId || attachmentBusy !== null} onChange={(event) => void uploadAttachment('calibration-certificates', event.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" className={cn(limsOutlineBtnClass, 'h-8')} disabled={disabled || !projectId || attachmentBusy !== null} onClick={() => calibrationInputRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" aria-hidden /> Upload Calibration Certificate
          </Button>
          <input ref={consentInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="hidden" disabled={disabled || !projectId || attachmentBusy !== null} onChange={(event) => void uploadAttachment('consent-letter', event.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" className={cn(limsOutlineBtnClass, 'h-8')} disabled={disabled || !projectId || attachmentBusy !== null} onClick={() => consentInputRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" aria-hidden /> Upload Consent Letter
          </Button>
        </div>
      </div>

      {(['calibration-certificates', 'consent-letter'] as const).map((kind) => {
        const label = kind === 'calibration-certificates' ? 'Calibration Certificates' : 'Consent Letters'
        const files = attachments[kind] ?? []
        if (!files.length) return null
        return <div key={kind} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-stone-600">{label}:</span>
          {files.map((file) => <span key={file.id} className="inline-flex max-w-full items-center gap-1 border border-stone-300 bg-white px-2 py-1">
            {file.viewUrl ? <a className="max-w-[220px] truncate text-amber-900 underline" href={file.viewUrl} target="_blank" rel="noreferrer">{file.file_name}</a> : <span className="max-w-[220px] truncate">{file.file_name}</span>}
            <a className="inline-flex h-6 w-6 items-center justify-center" href={file.viewUrl} target="_blank" rel="noreferrer" aria-label={`View ${file.file_name}`}><Eye size={14} /></a>
            <button type="button" className="inline-flex h-6 w-6 items-center justify-center text-red-700 disabled:opacity-50" disabled={disabled || attachmentBusy !== null} onClick={() => void removeAttachment(kind, file)} aria-label={`Remove ${file.file_name}`}><Trash2 size={14} /></button>
          </span>)}
        </div>
      })}

      <div className="shrink-0 overflow-hidden rounded-none border-2 border-stone-500 bg-[#f7f3eb]">
        <div className="overflow-x-auto">
          <Table className="w-full min-w-[1100px] border-collapse [&_td]:border [&_td]:border-stone-400 [&_th]:border [&_th]:border-stone-700">
            <TableHeader>
              <TableRow className="border-stone-700 hover:bg-transparent">
                <TableHead className={cn(thClass, 'w-[22%]')}>
                  Test Equipments / Chemicals
                </TableHead>
                <TableHead className={cn(thClass, 'w-[10%]')}>Make</TableHead>
                <TableHead className={cn(thClass, 'w-[10%]')}>Least Count</TableHead>
                <TableHead className={cn(thClass, 'w-[10%]')}>Range</TableHead>
                <TableHead className={cn(thClass, 'w-[12%]')}>Calibration Status</TableHead>
                <TableHead className={cn(thClass, 'w-[10%]')}>Clause No.</TableHead>
                <TableHead className={cn(thClass, 'w-[10%]')}>Quantity</TableHead>
                <TableHead className={cn(thClass, 'w-[8%]')}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className={cn('border-stone-400', rowOddClass)}>
                <TableCell className="px-1 py-1">
                  <Input
                    ref={nameInputRef}
                    className={cellInputClass}
                    value={draft.equipmentName}
                    disabled={disabled}
                    placeholder="Name of the Test Equipment"
                    onChange={(e) => patchDraft('equipmentName', e.target.value)}
                    onKeyDown={onDraftKeyDown}
                  />
                </TableCell>
                <TableCell className="px-1 py-1">{stickySuggest('make', 'Make')}</TableCell>
                <TableCell className="px-1 py-1">
                  {stickySuggest('leastCount', 'Least count')}
                </TableCell>
                <TableCell className="px-1 py-1">{stickySuggest('range', 'Range')}</TableCell>
                <TableCell className="px-1 py-1">
                  {stickySuggest('calibrationStatus', 'Calibration')}
                </TableCell>
                <TableCell className="px-1 py-1">{stickySuggest('clauseNo', 'Clause')}</TableCell>
                <TableCell className="px-1 py-1">
                  {stickySuggest('quantity', 'Qty', 'tabular-nums')}
                </TableCell>
                <TableCell className="px-1 text-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn(limsOutlineBtnClass, actionBtnClass)}
                    disabled={disabled}
                    onClick={commitDraft}
                    title={editingIndex != null ? 'Update row' : 'Add row'}
                    aria-label={editingIndex != null ? 'Update row' : 'Add row'}
                  >
                    <Plus size={15} aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-2 border-stone-500 bg-[#f7f3eb]">
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {savedRows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-stone-500">
              No testing equipment added yet — fill the row above and press +.
            </p>
          ) : (
            <Table className="w-full min-w-[1100px] border-collapse [&_td]:border [&_td]:border-stone-400 [&_th]:border [&_th]:border-stone-700">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="border-stone-700 hover:bg-transparent">
                  <TableHead className={cn(thClass, 'w-[4%]')}>Sr</TableHead>
                  <TableHead className={cn(thClass, 'w-[20%]')}>
                    Test Equipments / Chemicals
                  </TableHead>
                  <TableHead className={cn(thClass, 'w-[10%]')}>Make</TableHead>
                  <TableHead className={cn(thClass, 'w-[10%]')}>Least Count</TableHead>
                  <TableHead className={cn(thClass, 'w-[10%]')}>Range</TableHead>
                  <TableHead className={cn(thClass, 'w-[12%]')}>Calibration Status</TableHead>
                  <TableHead className={cn(thClass, 'w-[10%]')}>Clause No.</TableHead>
                  <TableHead className={cn(thClass, 'w-[10%]')}>Quantity</TableHead>
                  <TableHead className={cn(thClass, 'w-[8%]')}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedRows.map((row, index) => (
                  <TableRow
                    key={`c306-saved-${index}-${row.equipmentName}`}
                    className={cn(
                      'border-stone-400',
                      editingIndex === index
                        ? 'bg-amber-100/70 hover:bg-amber-100/70'
                        : index % 2 === 0
                          ? rowEvenClass
                          : rowOddClass,
                    )}
                  >
                    <TableCell className="px-1 text-center text-xs font-semibold text-stone-700">
                      {index + 1}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-sm text-stone-800">
                      {row.equipmentName || '—'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-center text-sm text-stone-700">
                      {row.make || '—'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-center text-sm text-stone-700">
                      {row.leastCount || '—'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-center text-sm text-stone-700">
                      {row.range || '—'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-center text-sm text-stone-700">
                      {row.calibrationStatus || '—'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-center text-sm text-stone-700">
                      {row.clauseNo || '—'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-center text-sm tabular-nums text-stone-700">
                      {row.quantity || '—'}
                    </TableCell>
                    <TableCell className="px-1 text-center">
                      <div className="inline-flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn(limsOutlineBtnClass, actionBtnClass)}
                          disabled={disabled}
                          onClick={() => startEdit(index)}
                          title="Edit row"
                          aria-label="Edit row"
                        >
                          <Pencil size={14} aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn(
                            limsOutlineBtnClass,
                            actionBtnClass,
                            'text-red-700 hover:bg-red-50 hover:text-red-800',
                          )}
                          disabled={disabled}
                          onClick={() => removeSaved(index)}
                          title="Delete row"
                          aria-label="Delete row"
                        >
                          <Trash2 size={15} aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}
