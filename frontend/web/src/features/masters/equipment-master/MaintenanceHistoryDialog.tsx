import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Search, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { sortMaintenanceHistoryNewestFirst, type MaintenanceHistoryRecord } from './maintenanceHistory'
import type { MaintenanceChecklistItem } from './types'

export type MaintenanceHistoryDirectorChange = {
  history: MaintenanceHistoryRecord[]
  currentLastDate: string
  currentDoneByName: string
  currentChecklist: MaintenanceChecklistItem[]
}

const FULLSCREEN_OVERLAY = 'lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto'

const FULLSCREEN_DIALOG_CLASS = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
  'left-0 top-0',
  'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
)

const CURRENT_ROW_ID = '__current__'

const GRID_TABLE =
  'table-fixed min-w-[720px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

type HistoryListRow = {
  id: string
  equipmentCode: string
  date: string
  doneBy: string
  checklist: MaintenanceChecklistItem[]
}

function formatDisplayDate(dateStr: string): string {
  return formatDate(dateStr)
}

export function MaintenanceHistoryDialog({
  open,
  onOpenChange,
  equipmentName,
  assetCode,
  history,
  currentLastDate,
  currentDoneByName,
  currentChecklist,
  onDirectorChange,
  layer = 'default',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipmentName?: string
  assetCode?: string
  history: MaintenanceHistoryRecord[]
  currentLastDate?: string
  currentDoneByName?: string
  currentChecklist?: MaintenanceChecklistItem[]
  onDirectorChange?: (next: MaintenanceHistoryDirectorChange) => void
  layer?: 'default' | 'nested' | 'stacked'
}) {
  const { designation } = useAuth()
  const canManageActions = isLaboratoryDirector(designation)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [viewing, setViewing] = useState<HistoryListRow | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editDate, setEditDate] = useState('')
  const [editDoneBy, setEditDoneBy] = useState('')
  const [editChecklist, setEditChecklist] = useState<MaintenanceChecklistItem[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const rows = useMemo(() => {
    const list: HistoryListRow[] = []
    const code = assetCode?.trim() || '—'
    if (currentLastDate?.trim() && (currentChecklist?.length ?? 0) > 0) {
      list.push({
        id: CURRENT_ROW_ID,
        equipmentCode: code,
        date: currentLastDate,
        doneBy: currentDoneByName?.trim() || '—',
        checklist: currentChecklist ?? [],
      })
    }
    for (const record of sortMaintenanceHistoryNewestFirst(history)) {
      list.push({
        id: record.id,
        equipmentCode: code,
        date: record.conductedOn,
        doneBy: record.doneByName?.trim() || record.doneBy?.trim() || '—',
        checklist: record.checklist,
      })
    }
    return list
  }, [assetCode, currentChecklist, currentDoneByName, currentLastDate, history])

  const filteredRows = useMemo(() => {
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return rows
    return rows.filter((row) => {
      const blob = [
        row.equipmentCode,
        row.doneBy,
        row.date,
        formatDisplayDate(row.date),
      ]
        .join(' ')
        .toLowerCase()
      return tokens.every((token) => blob.includes(token))
    })
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, safePage, pageSize])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set())
      setViewing(null)
      setIsEditing(false)
      setSearch('')
      setPage(1)
      setJumpTo('')
    }
  }, [open])

  const allChecked = pagedRows.length > 0 && pagedRows.every((r) => selectedIds.has(r.id))
  const someChecked = pagedRows.some((r) => selectedIds.has(r.id))

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (!checked) pagedRows.forEach((r) => next.delete(r.id))
      else pagedRows.forEach((r) => next.add(r.id))
      return next
    })
  }

  const goToPage = () => {
    const n = Number.parseInt(jumpTo, 10)
    if (!Number.isFinite(n)) return
    setPage(Math.min(pageCount, Math.max(1, n)))
  }

  const openEdit = (row: HistoryListRow) => {
    setViewing(row)
    setIsEditing(true)
    setEditDate(row.date.slice(0, 10))
    setEditDoneBy(row.doneBy === '—' ? '' : row.doneBy)
    setEditChecklist(row.checklist.map((item) => ({ ...item })))
  }

  const applyDirectorChange = (next: MaintenanceHistoryDirectorChange) => {
    onDirectorChange?.(next)
  }

  const saveEdit = () => {
    if (!viewing || !onDirectorChange) return
    const nextDate = editDate.trim()
    const nextDoneBy = editDoneBy.trim()
    const nextChecklist = editChecklist
      .map((item) => ({
        checkPoint: item.checkPoint.trim(),
        status: item.status === 'Not OK' ? 'Not OK' : 'OK',
        repairIfAny: item.repairIfAny.trim(),
      }))
      .filter((item) => item.checkPoint.length > 0) as MaintenanceChecklistItem[]

    if (viewing.id === CURRENT_ROW_ID) {
      applyDirectorChange({
        history,
        currentLastDate: nextDate,
        currentDoneByName: nextDoneBy,
        currentChecklist: nextChecklist,
      })
    } else {
      applyDirectorChange({
        history: history.map((record) =>
          record.id === viewing.id
            ? {
                ...record,
                conductedOn: nextDate,
                doneBy: nextDoneBy,
                doneByName: nextDoneBy,
                checklist: nextChecklist,
              }
            : record,
        ),
        currentLastDate: currentLastDate ?? '',
        currentDoneByName: currentDoneByName ?? '',
        currentChecklist: currentChecklist ?? [],
      })
    }
    setIsEditing(false)
    setViewing(null)
  }

  const deleteRecord = (row: HistoryListRow) => {
    if (!onDirectorChange) return
    const label = `${row.equipmentCode} · ${formatDisplayDate(row.date)}`
    if (!window.confirm(`Delete maintenance record ${label}?`)) return
    if (row.id === CURRENT_ROW_ID) {
      applyDirectorChange({
        history,
        currentLastDate: '',
        currentDoneByName: currentDoneByName ?? '',
        currentChecklist: [],
      })
    } else {
      applyDirectorChange({
        history: history.filter((record) => record.id !== row.id),
        currentLastDate: currentLastDate ?? '',
        currentDoneByName: currentDoneByName ?? '',
        currentChecklist: currentChecklist ?? [],
      })
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(row.id)
      return next
    })
    if (viewing?.id === row.id) {
      setViewing(null)
      setIsEditing(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          persistOnFocusLoss
          layer={layer === 'default' ? 'nested' : layer}
          overlayClassName={FULLSCREEN_OVERLAY}
          className={FULLSCREEN_DIALOG_CLASS}
          aria-describedby={undefined}
        >
          <div className={cn(limsPanelClass, 'shrink-0')}>
            <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <div className="relative flex flex-wrap items-center gap-2 pr-10 sm:flex-nowrap sm:gap-3">
                <DialogHeader className="shrink-0 space-y-0 text-left">
                  <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                    Maintenance Checklist History
                  </DialogTitle>
                </DialogHeader>
                <div className="order-3 flex w-full min-w-0 items-center gap-2 sm:order-none sm:mx-1 sm:w-auto sm:flex-none">
                  <div className="relative min-w-0 flex-1 sm:w-[70%] sm:max-w-[19.5rem] sm:flex-none">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search"
                      className={cn(limsDarkBarSearchClass, 'pl-9')}
                      aria-label="Search"
                      autoComplete="off"
                    />
                  </div>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => setPageSize(Number(v))}
                  >
                    <SelectTrigger
                      className={cn(limsDarkBarFieldClass, 'h-9 w-[7.5rem] shrink-0')}
                      aria-label="Rows per page"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 / Page</SelectItem>
                      <SelectItem value="10">10 / Page</SelectItem>
                      <SelectItem value="20">20 / Page</SelectItem>
                      <SelectItem value="50">50 / Page</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className={cn(limsPanelClass, 'min-h-0 flex-1 overflow-auto bg-[#f7f3eb]')}>
            {filteredRows.length === 0 ? (
              <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
                <p className="text-sm text-[#57534e]">
                  {search.trim()
                    ? 'No maintenance records match your search.'
                    : 'No lifetime maintenance records yet.'}
                </p>
              </div>
            ) : (
              <Table className={GRID_TABLE}>
                <colgroup>
                  <col className="w-[5%]" />
                  <col className={canManageActions ? 'w-[20%]' : 'w-[22%]'} />
                  <col className={canManageActions ? 'w-[18%]' : 'w-[22%]'} />
                  <col className={canManageActions ? 'w-[25%]' : 'w-[31%]'} />
                  <col className="w-[16%]" />
                  {canManageActions ? <col className="w-[16%]" /> : null}
                </colgroup>
                <TableHeader>
                  <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                    <TableHead className={cn('w-[5%]', thBase)}>
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label="Select all"
                        checked={allChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = !allChecked && someChecked
                        }}
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className={thBase}>Equipment Code</TableHead>
                    <TableHead className={thBase}>Date of Maintenance</TableHead>
                    <TableHead className={thBase}>Maintenance Done By</TableHead>
                    <TableHead className={thBase}>Check List</TableHead>
                    {canManageActions ? <TableHead className={thBase}>Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((row, index) => {
                    const selected = selectedIds.has(row.id)
                    const even = index % 2 === 0
                    return (
                      <TableRow
                        key={row.id}
                        data-state={selected ? 'selected' : undefined}
                        className={cn(
                          'border-[#e7e0d4] transition-colors',
                          selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass,
                        )}
                      >
                        <TableCell className="text-center align-middle">
                          <input
                            type="checkbox"
                            className={checkboxClass}
                            aria-label={`Select ${row.date}`}
                            checked={selected}
                            onChange={() => toggleRow(row.id)}
                          />
                        </TableCell>
                        <TableCell className="px-2 text-left align-middle font-mono text-[12px] font-semibold text-[#b45309]">
                          {row.equipmentCode}
                        </TableCell>
                        <TableCell className="px-2 text-center align-middle text-[12.5px] font-semibold text-[#292524]">
                          {formatDisplayDate(row.date)}
                        </TableCell>
                        <TableCell className="px-2 text-center align-middle text-[12.5px] font-semibold text-[#292524]">
                          {row.doneBy}
                        </TableCell>
                        <TableCell className="px-2 text-center align-middle">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn('h-7 px-3 text-xs', limsOutlineBtnClass)}
                            onClick={() => {
                              setIsEditing(false)
                              setViewing(row)
                            }}
                          >
                            View
                          </Button>
                        </TableCell>
                        {canManageActions ? (
                          <TableCell className="px-1 text-center align-middle">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 rounded-none px-0 text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]"
                                aria-label={`Edit ${row.equipmentCode} ${formatDisplayDate(row.date)}`}
                                onClick={() => openEdit(row)}
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 rounded-none px-0 text-destructive hover:bg-rose-50"
                                aria-label={`Delete ${row.equipmentCode} ${formatDisplayDate(row.date)}`}
                                onClick={() => deleteRecord(row)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <div className={cn(limsPanelClass, 'shrink-0')}>
            <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-1.5 text-white sm:px-5 sm:py-2">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <div className="relative flex min-w-0 flex-nowrap items-center justify-between gap-1.5 sm:gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {selectedIds.size > 0 ? (
                    <span className="hidden shrink-0 whitespace-nowrap text-[10px] text-stone-300 sm:inline sm:text-xs">
                      Selected: {selectedIds.size}
                    </span>
                  ) : (
                    <span className="hidden shrink-0 whitespace-nowrap text-[10px] text-stone-400 sm:inline sm:text-xs">
                      {filteredRows.length} record{filteredRows.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-nowrap items-center justify-end gap-1 overflow-x-auto sm:gap-1.5">
                  <Input
                    aria-label="Jump to page"
                    placeholder="Page"
                    value={jumpTo}
                    onChange={(e) => setJumpTo(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') goToPage()
                    }}
                    className={cn(
                      limsDarkBarFieldClass,
                      'h-7 w-10 shrink-0 text-[11px] sm:h-8 sm:w-12 sm:text-xs md:w-14',
                    )}
                    inputMode="numeric"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('hidden h-7 shrink-0 sm:inline-flex sm:h-8', limsDarkBarBtnClass)}
                    onClick={goToPage}
                  >
                    Jump
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn('h-7 w-7 shrink-0 sm:h-8 sm:w-8', limsDarkBarBtnClass)}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="shrink-0 whitespace-nowrap text-center text-[10px] font-medium text-stone-300 sm:min-w-[4.5rem] sm:text-xs">
                    <span className="hidden sm:inline">Page </span>
                    {safePage}/{pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn('h-7 w-7 shrink-0 sm:h-8 sm:w-8', limsDarkBarBtnClass)}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={safePage >= pageCount}
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </Button>
                  <Button
                    type="button"
                    className={cn(limsPrimaryBtnClass, 'h-7 px-3 text-xs sm:h-8')}
                    onClick={() => onOpenChange(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewing}
        onOpenChange={(next) => {
          if (!next) {
            setViewing(null)
            setIsEditing(false)
          }
        }}
      >
        <DialogContent
          persistOnFocusLoss
          layer="top"
          overlayClassName={FULLSCREEN_OVERLAY}
          className={FULLSCREEN_DIALOG_CLASS}
          aria-describedby={undefined}
        >
          <div className={cn(limsPanelClass, 'shrink-0')}>
            <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <DialogHeader className="relative flex flex-row items-center justify-between space-y-0 pr-10 text-left">
                <DialogTitle className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
                  {isEditing ? 'Edit Maintenance Record' : 'Maintenance Check List'}
                </DialogTitle>
                {viewing ? (
                  <p className="min-w-0 truncate text-right text-xs text-stone-300">
                    {viewing.equipmentCode} · {formatDisplayDate(isEditing ? editDate : viewing.date)} ·{' '}
                    {isEditing ? editDoneBy || viewing.doneBy : viewing.doneBy}
                  </p>
                ) : null}
              </DialogHeader>
            </div>
          </div>

          <div className={cn(limsPanelClass, 'min-h-0 flex-1 overflow-auto bg-[#f7f3eb]')}>
            {isEditing ? (
              <div className="grid grid-cols-12 gap-3 border-b border-[#e7e0d4] bg-[#fffcf7] px-3 py-3">
                <div className="col-span-12 space-y-1 md:col-span-4">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                    Date of Maintenance
                  </label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="h-9 rounded-none"
                  />
                </div>
                <div className="col-span-12 space-y-1 md:col-span-8">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                    Maintenance Done By
                  </label>
                  <Input
                    value={editDoneBy}
                    onChange={(e) => setEditDoneBy(e.target.value)}
                    placeholder="Name of Employee"
                    className="h-9 rounded-none"
                  />
                </div>
              </div>
            ) : null}
            <Table className={GRID_TABLE}>
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[48%]" />
                <col className="w-[16%]" />
                <col className="w-[30%]" />
              </colgroup>
              <TableHeader>
                <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                  <TableHead className={cn('w-[6%]', thBase)}>#</TableHead>
                  <TableHead className={cn('w-[48%]', thBase)}>Check Point</TableHead>
                  <TableHead className={cn('w-[16%]', thBase)}>Status</TableHead>
                  <TableHead className={cn('w-[30%]', thBase)}>Repair If Any</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(isEditing ? editChecklist : viewing?.checklist ?? []).map((item, index) => {
                  const even = index % 2 === 0
                  return (
                    <TableRow
                      key={`${item.checkPoint}-${index}`}
                      className={cn('border-[#e7e0d4]', even ? rowEvenClass : rowOddClass)}
                    >
                      <TableCell className="text-center font-mono text-stone-500">
                        {index + 1}
                      </TableCell>
                      {isEditing ? (
                        <>
                          <TableCell className="px-1">
                            <Input
                              value={item.checkPoint}
                              onChange={(e) =>
                                setEditChecklist((prev) =>
                                  prev.map((row, i) =>
                                    i === index ? { ...row, checkPoint: e.target.value } : row,
                                  ),
                                )
                              }
                              className="h-8 rounded-none text-xs"
                            />
                          </TableCell>
                          <TableCell className="px-1">
                            <Select
                              value={item.status}
                              onValueChange={(value) =>
                                setEditChecklist((prev) =>
                                  prev.map((row, i) =>
                                    i === index
                                      ? {
                                          ...row,
                                          status: value === 'Not OK' ? 'Not OK' : 'OK',
                                        }
                                      : row,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger className="h-8 rounded-none text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="OK">OK</SelectItem>
                                <SelectItem value="Not OK">Not OK</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="px-1">
                            <Input
                              value={item.repairIfAny}
                              onChange={(e) =>
                                setEditChecklist((prev) =>
                                  prev.map((row, i) =>
                                    i === index ? { ...row, repairIfAny: e.target.value } : row,
                                  ),
                                )
                              }
                              className="h-8 rounded-none text-xs"
                            />
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="px-2 text-left text-[12.5px] font-semibold text-[#292524]">
                            {item.checkPoint}
                          </TableCell>
                          <TableCell className="text-center text-[12.5px] font-semibold text-[#292524]">
                            {item.status}
                          </TableCell>
                          <TableCell className="px-2 text-left text-[12.5px] text-[#292524]">
                            {item.repairIfAny || '—'}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className={cn(limsPanelClass, 'shrink-0')}>
            <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white sm:px-5">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <div className="relative flex items-center justify-end gap-2">
                {isEditing ? (
                  <Button
                    type="button"
                    className={limsPrimaryBtnClass}
                    onClick={saveEdit}
                  >
                    Save & Close
                  </Button>
                ) : (
                  <Button type="button" className={limsPrimaryBtnClass} onClick={() => setViewing(null)}>
                    Close
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
