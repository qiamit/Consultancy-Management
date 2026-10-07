import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
}: {
  value: Cmpf306ModulePayload
  onChange: (next: Cmpf306ModulePayload) => void
  disabled?: boolean
}) {
  const savedRows = value.rows.filter(cmpf306RowHasContent)
  const [draft, setDraft] = useState<Cmpf306EquipmentRow>(() => emptyCmpf306EquipmentRow())
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

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
        {editingIndex != null ? (
          <p className="text-[11px] font-medium text-amber-800">
            Editing row {editingIndex + 1} — press + to update
          </p>
        ) : null}
      </div>

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
