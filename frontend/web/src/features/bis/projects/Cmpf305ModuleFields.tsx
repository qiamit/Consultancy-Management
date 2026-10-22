import { useEffect, useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsFieldClass, limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { importCmpfSpreadsheetRows } from './cmpfSpreadsheetImport'
import {
  cmpf305RowHasContent,
  emptyCmpf305MachineryRow,
  type Cmpf305MachineryRow,
  type Cmpf305ModulePayload,
} from './cmpf305Model'
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

type StickyField = Exclude<keyof Cmpf305MachineryRow, 'machineryName'>

export function Cmpf305ModuleFields({
  value,
  onChange,
  disabled = false,
}: {
  value: Cmpf305ModulePayload
  onChange: (next: Cmpf305ModulePayload) => void
  disabled?: boolean
}) {
  const savedRows = value.rows.filter(cmpf305RowHasContent)
  const [draft, setDraft] = useState<Cmpf305MachineryRow>(() => emptyCmpf305MachineryRow())
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const importSpreadsheet = async (file: File) => {
    try {
      const importedRows = await importCmpfSpreadsheetRows<Cmpf305MachineryRow>(
        file,
        [
          { key: 'machineryName', aliases: ['machinery name', 'machinery', 'machine', 'equipment name'] },
          { key: 'make', aliases: ['make', 'identification no', 'make identification no', 'make id'] },
          { key: 'capacityPerDay', aliases: ['production capacity per day', 'production capacity day', 'capacity per day', 'capacity'] },
          { key: 'number', aliases: ['number', 'qty', 'quantity'] },
          { key: 'remarks', aliases: ['remarks', 'remark'] },
        ],
        cmpf305RowHasContent,
      )
      if (!importedRows.length) {
        toast.error('No Machinery Rows Were Found in the Selected Spreadsheet.')
        return
      }
      onChange({ ...value, rows: [...savedRows, ...importedRows] })
      toast.success(`Imported ${importedRows.length} machinery row(s).`)
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
      capacityPerDay: pick('capacityPerDay'),
      number: pick('number'),
      remarks: pick('remarks'),
    }
  }, [savedRows])

  useEffect(() => {
    // Do not wipe sticky draft fields (Make…Remarks) when a row is added.
    setEditingIndex(null)
  }, [value.rows.length])

  const focusName = () => {
    requestAnimationFrame(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    })
  }

  const patchDraft = <K extends keyof Cmpf305MachineryRow>(key: K, raw: string) => {
    setDraft((prev) => ({ ...prev, [key]: raw }))
  }

  const setSavedRows = (rows: Cmpf305MachineryRow[]) => {
    onChange({ ...value, rows })
  }

  const commitDraft = () => {
    if (disabled) return
    if (!draft.machineryName.trim()) {
      toast.error('Enter the Name of the Machinery Before Adding.')
      focusName()
      return
    }
    if (!cmpf305RowHasContent(draft)) {
      toast.error('Enter Machinery Details Before Adding.')
      focusName()
      return
    }
    const nextRow: Cmpf305MachineryRow = {
      machineryName: draft.machineryName.trim(),
      make: draft.make.trim(),
      capacityPerDay: draft.capacityPerDay.trim(),
      number: draft.number.trim(),
      remarks: draft.remarks.trim(),
    }
    if (editingIndex != null && editingIndex >= 0 && editingIndex < savedRows.length) {
      setSavedRows(savedRows.map((row, i) => (i === editingIndex ? nextRow : row)))
    } else {
      setSavedRows([...savedRows, nextRow])
    }
    // Keep Make / Capacity / Number / Remarks for the next entry.
    setDraft((prev) => ({
      ...prev,
      machineryName: '',
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
      setDraft(emptyCmpf305MachineryRow())
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
          Manufacturing Machinery
        </p>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Entry row — always a single add/update form */}
      <div className="shrink-0 overflow-hidden rounded-none border-2 border-stone-500 bg-[#f7f3eb]">
        <Table className="w-full min-w-[880px] border-collapse [&_td]:border [&_td]:border-stone-400 [&_th]:border [&_th]:border-stone-700">
          <TableHeader>
            <TableRow className="border-stone-700 hover:bg-transparent">
              <TableHead className={cn(thClass, 'w-[28%]')}>Name of the Machinery</TableHead>
              <TableHead className={cn(thClass, 'w-[14%]')}>Make</TableHead>
              <TableHead className={cn(thClass, 'w-[18%]')}>Production Capacity</TableHead>
              <TableHead className={cn(thClass, 'w-[10%]')}>Number</TableHead>
              <TableHead className={cn(thClass, 'w-[20%]')}>Remarks</TableHead>
              <TableHead className={cn(thClass, 'w-[10%]')}>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className={cn('border-stone-400', rowOddClass)}>
              <TableCell className="px-1 py-1">
                <Input
                  ref={nameInputRef}
                  className={cellInputClass}
                  value={draft.machineryName}
                  disabled={disabled}
                  placeholder="Name of the Machinery"
                  onChange={(e) => patchDraft('machineryName', e.target.value)}
                  onKeyDown={onDraftKeyDown}
                />
              </TableCell>
              <TableCell className="px-1 py-1">{stickySuggest('make', 'Make / ID No.')}</TableCell>
              <TableCell className="px-1 py-1">
                {stickySuggest('capacityPerDay', 'If Applicable')}
              </TableCell>
              <TableCell className="px-1 py-1">
                {stickySuggest('number', 'Qty', 'tabular-nums')}
              </TableCell>
              <TableCell className="px-1 py-1">
                {stickySuggest('remarks', 'Remarks')}
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

      {/* Saved machinery list */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-2 border-stone-500 bg-[#f7f3eb]">
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {savedRows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-stone-500">
              No machinery added yet — fill the row above and press +.
            </p>
          ) : (
            <Table className="w-full min-w-[880px] border-collapse [&_td]:border [&_td]:border-stone-400 [&_th]:border [&_th]:border-stone-700">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="border-stone-700 hover:bg-transparent">
                  <TableHead className={cn(thClass, 'w-[5%]')}>Sr</TableHead>
                  <TableHead className={cn(thClass, 'w-[26%]')}>Name of the Machinery</TableHead>
                  <TableHead className={cn(thClass, 'w-[14%]')}>Make</TableHead>
                  <TableHead className={cn(thClass, 'w-[16%]')}>Production Capacity</TableHead>
                  <TableHead className={cn(thClass, 'w-[10%]')}>Number</TableHead>
                  <TableHead className={cn(thClass, 'w-[19%]')}>Remarks</TableHead>
                  <TableHead className={cn(thClass, 'w-[10%]')}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedRows.map((row, index) => (
                  <TableRow
                    title={disabled ? undefined : 'Double-Click to Edit'}
                    onDoubleClick={() => { if (!disabled) startEdit(index) }}
                    key={`c305-saved-${index}-${row.machineryName}`}
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
                    <TableCell className="px-2 py-1.5 text-left text-sm text-stone-800">
                      {row.machineryName || '—'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-center text-sm text-stone-700">
                      {row.make || '—'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-center text-sm text-stone-700">
                      {row.capacityPerDay || '—'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-center text-sm tabular-nums text-stone-700">
                      {row.number || '—'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-center text-sm text-stone-700">
                      {row.remarks || '—'}
                    </TableCell>
                    <TableCell className="px-1 text-center">
                      <div className="inline-flex items-center justify-center gap-0.5">
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
                          title="Delete Row"
                          aria-label="Delete Row"
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
