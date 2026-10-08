import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, ChevronUp, Columns3, Eye, FileText, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  limsDarkBarGlowStyle,
  limsManageDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  loadIsCodeFileLinks,
  type IsCodeFileLink,
} from '@/features/masters/is-codes/loadIsCodeFileLinks'
import {
  BIS_NOTES_COLUMN_COUNT_OPTIONS,
  bisNotesScopeColumnCount,
  parseBisNotesScope,
  sanitizeBisLicenseScopeNotes,
  serializeBisNotesScope,
  setBisNotesScopeColumnCount,
} from './types'

function pickIsCodeFile(
  files: IsCodeFileLink[],
  kind: 'manual' | 'standard',
): IsCodeFileLink | null {
  const usable = files.filter((f) => Boolean(f.url?.trim()))
  const pool = usable.length > 0 ? usable : files
  if (pool.length === 0) return null

  const isManualName = (name: string) =>
    /product[_\s-]*manual|\bmanual\b|\bpm\b|^pm[_\s-]/i.test(name)

  if (kind === 'manual') {
    return (
      pool.find((f) => isManualName(f.file_name)) ??
      (pool.length === 1 ? pool[0]! : null)
    )
  }

  return (
    pool.find((f) => !isManualName(f.file_name)) ??
    pool.find((f) => /\bis[\s._-]?\d/i.test(f.file_name)) ??
    pool[0] ??
    null
  )
}

function openFileInBrowser(file: IsCodeFileLink | null, label: string) {
  const url = file?.url?.trim()
  if (!url) {
    toast.warning(
      file?.error
        ? `${label}: ${file.error}`
        : `${label} file not found for this IS Code.`,
    )
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Same Notes / License Scope editor used on Add Application/Licence and Manufacturing Scope module. */
export function LicenseScopeFields({
  value,
  onChange,
  disabled = false,
  label = 'Notes / License Scope',
  inputId = 'bis-license-scope',
  className,
  isCodeId = null,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  label?: string
  inputId?: string
  className?: string
  /** When set, shows View buttons for Indian Standard + Product Manual of this IS Code. */
  isCodeId?: string | null
}) {
  // parseBisNotesScope already strips imported checklist JSON for display.
  const notesScope = parseBisNotesScope(value)
  const notesColumnCount = bisNotesScopeColumnCount(value)
  const [columnDialogOpen, setColumnDialogOpen] = useState(false)
  const [draftColumnCount, setDraftColumnCount] = useState('1')
  const [isFiles, setIsFiles] = useState<IsCodeFileLink[]>([])
  const [filesLoading, setFilesLoading] = useState(false)

  useEffect(() => {
    const id = (isCodeId ?? '').trim()
    if (!id) {
      setIsFiles([])
      setFilesLoading(false)
      return
    }
    let cancelled = false
    setFilesLoading(true)
    void (async () => {
      const files = await loadIsCodeFileLinks(id)
      if (!cancelled) {
        setIsFiles(files)
        setFilesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isCodeId])

  const openColumnDialog = () => {
    setDraftColumnCount(String(notesColumnCount))
    setColumnDialogOpen(true)
  }

  const applyColumnCount = () => {
    onChange(
      setBisNotesScopeColumnCount(
        sanitizeBisLicenseScopeNotes(value),
        Number(draftColumnCount),
      ),
    )
    setColumnDialogOpen(false)
  }

  const updateNotesTable = (
    updater: (table: Extract<typeof notesScope, { mode: 'table' }>) => {
      headers: string[]
      rows: string[][]
    },
  ) => {
    if (notesScope.mode !== 'table') return
    const next = updater(notesScope)
    onChange(serializeBisNotesScope({ mode: 'table', ...next }))
  }

  const addNotesTableRow = () => {
    updateNotesTable((table) => ({
      headers: table.headers,
      rows: [...table.rows, table.headers.map(() => '')],
    }))
  }

  const removeNotesTableRow = (rowIndex: number) => {
    updateNotesTable((table) => ({
      headers: table.headers,
      rows: table.rows.length <= 1 ? table.rows : table.rows.filter((_, i) => i !== rowIndex),
    }))
  }

  const moveNotesTableRow = (rowIndex: number, direction: -1 | 1) => {
    updateNotesTable((table) => {
      const target = rowIndex + direction
      if (target < 0 || target >= table.rows.length) return table
      const rows = table.rows.map((r) => [...r])
      const tmp = rows[rowIndex]!
      rows[rowIndex] = rows[target]!
      rows[target] = tmp
      return { headers: table.headers, rows }
    })
  }

  const standardFile = pickIsCodeFile(isFiles, 'standard')
  const manualFile = pickIsCodeFile(isFiles, 'manual')
  const showIsFileButtons = Boolean((isCodeId ?? '').trim())
  const filesReady = !filesLoading && isFiles.length > 0
  const filesMissing =
    showIsFileButtons && !filesLoading && isFiles.length === 0

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {showIsFileButtons ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(limsOutlineBtnClass, 'h-7 gap-1.5 px-2.5 text-xs')}
                disabled={disabled || filesLoading || !standardFile?.url}
                title={
                  standardFile?.file_name
                    ? `View ${standardFile.file_name}`
                    : 'Indian Standard file not attached on this IS Code'
                }
                onClick={() => openFileInBrowser(standardFile, 'Indian Standard')}
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                <Eye className="h-3.5 w-3.5" aria-hidden />
                IS Standard
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(limsOutlineBtnClass, 'h-7 gap-1.5 px-2.5 text-xs')}
                disabled={disabled || filesLoading || !manualFile?.url}
                title={
                  manualFile?.file_name
                    ? `View ${manualFile.file_name}`
                    : 'Product Manual file not attached on this IS Code'
                }
                onClick={() => openFileInBrowser(manualFile, 'Product Manual')}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Product Manual
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(limsOutlineBtnClass, 'h-7 gap-1.5 px-2.5 text-xs')}
            onClick={openColumnDialog}
            disabled={disabled}
            title="Set License Scope columns (1 = plain text, 2+ = table)"
          >
            <Columns3 className="h-3.5 w-3.5" aria-hidden />
            Column
          </Button>
        </div>
      </div>

      {showIsFileButtons ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-600">
          {filesLoading ? (
            <span className="text-stone-500">Loading IS files…</span>
          ) : null}
          {filesMissing ? (
            <span className="text-amber-800">
              No files on this IS Code — attach IS Standard / Product Manual in IS Code Master.
            </span>
          ) : null}
          {filesReady ? (
            <>
              <span className="min-w-0 truncate" title={standardFile?.file_name}>
                <span className="font-semibold text-stone-700">IS:</span>{' '}
                {standardFile?.url
                  ? standardFile.file_name
                  : standardFile?.file_name
                    ? `${standardFile.file_name} (unavailable)`
                    : '—'}
              </span>
              <span className="min-w-0 truncate" title={manualFile?.file_name}>
                <span className="font-semibold text-stone-700">PM:</span>{' '}
                {manualFile?.url
                  ? manualFile.file_name
                  : manualFile?.file_name
                    ? `${manualFile.file_name} (unavailable)`
                    : '—'}
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      {notesScope.mode === 'plain' ? (
        <Textarea
          id={inputId}
          rows={5}
          className="rounded-none border-stone-500 bg-stone-50"
          value={notesScope.text}
          disabled={disabled}
          placeholder="Enter manufacturing / license scope (you decide the wording here)."
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-none border border-stone-500 bg-stone-50">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr className="bg-stone-800">
                  <th className="w-[4.5rem] border border-stone-700 bg-stone-800 px-1 text-center text-[10px] font-bold uppercase tracking-wide text-amber-200">
                    Move
                  </th>
                  {notesScope.headers.map((header, colIndex) => (
                    <th
                      key={`${inputId}-h-${colIndex}`}
                      className="border border-stone-700 p-0 font-normal"
                    >
                      <Input
                        value={header}
                        aria-label={`Column ${colIndex + 1} header`}
                        disabled={disabled}
                        className="h-8 rounded-none border-0 bg-transparent px-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-200 shadow-none placeholder:text-amber-200/50 focus-visible:bg-stone-900 focus-visible:ring-1 focus-visible:ring-amber-500/40"
                        placeholder={`Column ${colIndex + 1}`}
                        onChange={(e) =>
                          updateNotesTable((table) => {
                            const headers = [...table.headers]
                            headers[colIndex] = e.target.value
                            return { headers, rows: table.rows }
                          })
                        }
                      />
                    </th>
                  ))}
                  <th className="w-[4.5rem] border border-stone-700 bg-stone-800" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {notesScope.rows.map((row, rowIndex) => {
                  const isLastRow = rowIndex === notesScope.rows.length - 1
                  return (
                    <tr key={`${inputId}-r-${rowIndex}`} className="bg-stone-50">
                      <td className="border border-stone-400 p-0 text-center">
                        <div className="inline-flex items-center justify-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-none p-0 text-amber-800 hover:bg-amber-50 hover:text-amber-950"
                            disabled={disabled || rowIndex === 0}
                            title="Move row up"
                            aria-label={`Move row ${rowIndex + 1} up`}
                            onClick={() => moveNotesTableRow(rowIndex, -1)}
                          >
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-none p-0 text-amber-800 hover:bg-amber-50 hover:text-amber-950"
                            disabled={disabled || isLastRow}
                            title="Move row down"
                            aria-label={`Move row ${rowIndex + 1} down`}
                            onClick={() => moveNotesTableRow(rowIndex, 1)}
                          >
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </td>
                      {row.map((cell, colIndex) => (
                        <td
                          key={`${inputId}-c-${rowIndex}-${colIndex}`}
                          className="border border-stone-400 p-0"
                        >
                          <Input
                            value={cell}
                            aria-label={`${notesScope.headers[colIndex] || `Column ${colIndex + 1}`} row ${rowIndex + 1}`}
                            disabled={disabled}
                            className="h-8 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-amber-500/30"
                            onChange={(e) =>
                              updateNotesTable((table) => {
                                const rows = table.rows.map((r) => [...r])
                                rows[rowIndex][colIndex] = e.target.value
                                return { headers: table.headers, rows }
                              })
                            }
                          />
                        </td>
                      ))}
                      <td className="border border-stone-400 p-0 text-center">
                        <div className="inline-flex items-center justify-center">
                          {isLastRow ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 rounded-none p-0 text-amber-800 hover:bg-amber-50 hover:text-amber-950"
                              disabled={disabled}
                              title="Add row"
                              aria-label="Add row"
                              onClick={addNotesTableRow}
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-none p-0 text-stone-500 hover:bg-red-50 hover:text-red-700"
                            disabled={disabled || notesScope.rows.length <= 1}
                            title="Remove row"
                            aria-label="Remove row"
                            onClick={() => removeNotesTableRow(rowIndex)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={columnDialogOpen} onOpenChange={setColumnDialogOpen}>
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(limsManageDialogClass, 'max-w-sm bg-white')}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Add Columns
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className={cn(limsRegistryFormClass, 'space-y-3 px-4 py-4')}>
            <div className="space-y-2">
              <Label htmlFor={`${inputId}-column-count`}>Number of columns</Label>
              <Select value={draftColumnCount} onValueChange={setDraftColumnCount}>
                <SelectTrigger id={`${inputId}-column-count`} className="h-8 rounded-none">
                  <SelectValue placeholder="Select columns" />
                </SelectTrigger>
                <SelectContent>
                  {BIS_NOTES_COLUMN_COUNT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n === 1 ? '1 column (plain text)' : `${n} columns (table)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className={limsOutlineBtnClass}
                onClick={() => setColumnDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" className={limsPrimaryBtnClass} onClick={applyColumnCount}>
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
