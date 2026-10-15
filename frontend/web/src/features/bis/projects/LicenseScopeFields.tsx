import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronUp, Columns3, Download, Eye, FileText, Plus, Trash2, Upload } from 'lucide-react'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  limsDarkBarGlowStyle,
  limsManageDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { isQeExtensionPresent } from './manakExtensionBridge'
import {
  loadIsCodeFileLinks,
  type IsCodeFileLink,
} from '@/features/masters/is-codes/loadIsCodeFileLinks'
import {
  deleteBisProjectFile,
  formatBisProjectFilesError,
  listBisProjectFiles,
  uploadBisProjectFile,
  type BisProjectViewFile,
} from './bisProjectFilesApi'
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
    return pool.find((f) => isManualName(f.file_name)) ?? null
  }

  return pool.find((f) => !isManualName(f.file_name)) ?? null
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

function AutoResizeScopeCell({
  value,
  onChange,
  disabled,
  label,
  fillCell = false,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  label: string
  fillCell?: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || fillCell) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [fillCell, value])

  return (
    <Textarea
      ref={textareaRef}
      rows={1}
      value={value}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'min-h-8 w-full resize-none overflow-hidden rounded-none border-0 bg-transparent px-2 py-1.5 leading-5 shadow-none focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-amber-500/30',
        fillCell && 'absolute inset-0 h-full',
      )}
      onChange={(event) => onChange(event.target.value)}
    />
  )
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
  isNumber = '',
  projectId = null,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  label?: string
  inputId?: string
  className?: string
  /** When set, shows View buttons for the Specification + Product Manual of this IS Code. */
  isCodeId?: string | null
  /** Selected IS number used by the BIS Product Manual search. */
  isNumber?: string
  /** Existing project required to store an uploaded manufacturing scope PDF. */
  projectId?: string | null
}) {
  // parseBisNotesScope already strips imported checklist JSON for display.
  const notesScope = parseBisNotesScope(value)
  const notesColumnCount = value.trim() ? bisNotesScopeColumnCount(value) : 2
  const [columnDialogOpen, setColumnDialogOpen] = useState(false)
  const [draftColumnCount, setDraftColumnCount] = useState('2')
  const [isFiles, setIsFiles] = useState<IsCodeFileLink[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [scopeFiles, setScopeFiles] = useState<BisProjectViewFile[]>([])
  const [scopeFilesProjectId, setScopeFilesProjectId] = useState('')
  const [scopeUploadBusy, setScopeUploadBusy] = useState(false)
  const [manualSearchBusy, setManualSearchBusy] = useState(false)
  const scopeUploadRef = useRef<HTMLInputElement | null>(null)
  const scopeProjectId = (projectId ?? '').trim()

  useEffect(() => {
    if (!scopeProjectId) return
    let cancelled = false
    void listBisProjectFiles(scopeProjectId, 'manufacturing-scope')
      .then((files) => {
        if (!cancelled) {
          setScopeFiles(files)
          setScopeFilesProjectId(scopeProjectId)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setScopeFiles([])
          setScopeFilesProjectId(scopeProjectId)
          toast.error(formatBisProjectFilesError(error))
        }
      })
    return () => {
      cancelled = true
    }
  }, [scopeProjectId])

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
  const showIsFileButtons = Boolean((isCodeId ?? '').trim())
  const filesMissing =
    showIsFileButtons && !filesLoading && isFiles.length === 0
  const scopeFilesLoading = Boolean(scopeProjectId) && scopeFilesProjectId !== scopeProjectId
  const scopeFile = scopeFilesProjectId === scopeProjectId ? scopeFiles[0] ?? null : null

  const openProductManualSearch = () => {
    const selectedIs = isNumber.trim()
    const productManualUrl = 'https://standards.bis.gov.in/website/product-manuals'
    if (!selectedIs) {
      window.open(productManualUrl, '_blank', 'noopener,noreferrer')
      toast.warning('Product Manuals opened. Select an IS Number first to search automatically.')
      return
    }
    if (!isQeExtensionPresent()) {
      window.open(productManualUrl, '_blank', 'noopener,noreferrer')
      toast.warning('Reload the QE Consultancy extension to auto-search the selected IS Number.')
      return
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setManualSearchBusy(true)
    let completed = false
    const finish = (message: string, isError: boolean) => {
      if (completed) return
      completed = true
      window.clearTimeout(timer)
      window.removeEventListener('message', onResult)
      setManualSearchBusy(false)
      if (isError) toast.error(message)
      else toast.success(message)
    }
    const onResult = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return
      const data = event.data
      if (data?.type !== 'QE_PRODUCT_MANUAL_SEARCH_RESULT' || data.requestId !== requestId) return
      finish(
        String(data.message || (data.ok ? 'Product Manual search started.' : 'Could not search Product Manuals.')),
        !data.ok,
      )
    }
    const timer = window.setTimeout(
      () => finish('The QE Consultancy extension did not respond. Reload it and try again.', true),
      60000,
    )
    window.addEventListener('message', onResult)
    window.postMessage(
      { type: 'QE_PRODUCT_MANUAL_SEARCH', requestId, isNumber: selectedIs },
      window.location.origin,
    )
  }

  const handleScopeUpload = async (file?: File) => {
    const id = (projectId ?? '').trim()
    if (!id || !file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Upload Scope must be a PDF file.')
      return
    }
    setScopeUploadBusy(true)
    try {
      const uploaded = await uploadBisProjectFile(id, file, 'manufacturing-scope', {
        displayName: 'Manufacturing Scope.pdf',
      })
      const oldFiles = scopeFiles.filter((existing) => existing.id !== uploaded.id)
      const removed = await Promise.allSettled(oldFiles.map(deleteBisProjectFile))
      setScopeFiles([uploaded])
      setScopeFilesProjectId(id)
      toast.success('Manufacturing scope PDF uploaded.')
      if (removed.some((result) => result.status === 'rejected')) {
        toast.warning('The new scope was uploaded, but an older copy could not be removed.')
      }
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setScopeUploadBusy(false)
      if (scopeUploadRef.current) scopeUploadRef.current.value = ''
    }
  }

  const openScopeFile = (url: string | undefined) => {
    if (!url) {
      toast.error(scopeFile?.error || 'Manufacturing scope PDF is unavailable.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={cn('min-w-0 max-w-full space-y-2', className)}>
      <div className="flex min-w-0 flex-col gap-2 min-[641px]:flex-row min-[641px]:items-center min-[641px]:justify-between">
        <Label htmlFor={inputId}>{label}</Label>
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-1.5 min-[641px]:justify-end">
          <input
            ref={scopeUploadRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={disabled || !projectId || scopeUploadBusy}
            onChange={(event) => void handleScopeUpload(event.target.files?.[0])}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(limsOutlineBtnClass, 'h-10 gap-1.5 px-2.5 text-xs min-[641px]:h-7')}
                title="Upload, view, or download the manufacturing scope PDF"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Scope PDF
                <ChevronDown className="h-3 w-3" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={disabled || !scopeProjectId || scopeUploadBusy}
                onSelect={() => scopeUploadRef.current?.click()}
                title={!scopeProjectId ? 'Save the Application / Licence before uploading a scope PDF' : undefined}
              >
                <Upload className="h-4 w-4" aria-hidden />
                {scopeUploadBusy ? 'Uploading…' : 'Upload Scope'}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={scopeFilesLoading || !scopeFile?.viewUrl}
                onSelect={() => openScopeFile(scopeFile?.viewUrl)}
                title={scopeFile?.file_name ? `View ${scopeFile.file_name}` : 'No scope PDF uploaded'}
              >
                <Eye className="h-4 w-4" aria-hidden />
                View Scope
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={scopeFilesLoading || !scopeFile?.downloadUrl}
                onSelect={() => openScopeFile(scopeFile?.downloadUrl)}
                title={scopeFile?.file_name ? `Download ${scopeFile.file_name}` : 'No scope PDF uploaded'}
              >
                <Download className="h-4 w-4" aria-hidden />
                Download Scope
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {showIsFileButtons ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(limsOutlineBtnClass, 'h-10 gap-1.5 px-2.5 text-xs min-[641px]:h-7')}
                disabled={disabled || filesLoading || !standardFile?.url}
                title={
                  standardFile?.file_name
                    ? `View ${standardFile.file_name}`
                  : 'Specification file not attached on this IS Code'
                }
                onClick={() => openFileInBrowser(standardFile, 'Specification')}
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                <Eye className="h-3.5 w-3.5" aria-hidden />
                View Specification
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(limsOutlineBtnClass, 'h-10 gap-1.5 px-2.5 text-xs min-[641px]:h-7')}
                disabled={disabled || manualSearchBusy}
                title="Open BIS Product Manuals and search the selected IS Number"
                onClick={openProductManualSearch}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                <Eye className="h-3.5 w-3.5" aria-hidden />
                View Product Manual
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(limsOutlineBtnClass, 'h-10 gap-1.5 px-2.5 text-xs min-[641px]:h-7')}
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
              No specification or product manual is attached to this IS Code.
            </span>
          ) : null}
        </div>
      ) : null}
      {scopeFilesLoading ? (
        <p className="text-[11px] text-stone-500">Loading uploaded scope PDF…</p>
      ) : scopeFile ? (
        <p className="truncate text-[11px] text-stone-600" title={scopeFile.file_name}>
          Uploaded Scope: {scopeFile.file_name}
        </p>
      ) : !projectId ? (
        <p className="text-[11px] text-stone-500">Save this Application / Licence to upload its scope PDF.</p>
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
          <div className="hidden overflow-x-auto rounded-none border border-stone-500 bg-stone-50 min-[641px]:block">
            <table
              className={cn(
                'w-full min-w-[28rem] border-collapse text-sm',
                notesScope.headers.length === 2 && 'bis-notes-scope-two-column-table',
              )}
            >
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
                          className={cn('border border-stone-400 p-0', colIndex === 0 && row.length > 1 && 'relative')}
                        >
                          <AutoResizeScopeCell
                            value={cell}
                            label={`${notesScope.headers[colIndex] || `Column ${colIndex + 1}`} row ${rowIndex + 1}`}
                            disabled={disabled}
                            fillCell={colIndex === 0 && row.length > 1}
                            onChange={(nextValue) =>
                              updateNotesTable((table) => {
                                const rows = table.rows.map((r) => [...r])
                                rows[rowIndex][colIndex] = nextValue
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
          <div className="min-w-0 space-y-3 min-[641px]:hidden">
            <div className="space-y-2 rounded-none border border-stone-400 bg-stone-50 p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Column names</p>
              {notesScope.headers.map((header, colIndex) => (
                <div key={`${inputId}-mobile-header-${colIndex}`} className="min-w-0 space-y-1">
                  <Label htmlFor={`${inputId}-mobile-header-${colIndex}`} className="text-xs text-stone-600">
                    Column {colIndex + 1}
                  </Label>
                  <Input
                    id={`${inputId}-mobile-header-${colIndex}`}
                    value={header}
                    disabled={disabled}
                    className="h-10 min-w-0 rounded-none bg-white"
                    placeholder={`Column ${colIndex + 1}`}
                    onChange={(event) =>
                      updateNotesTable((table) => {
                        const headers = [...table.headers]
                        headers[colIndex] = event.target.value
                        return { headers, rows: table.rows }
                      })
                    }
                  />
                </div>
              ))}
            </div>
            {notesScope.rows.map((row, rowIndex) => {
              const isLastRow = rowIndex === notesScope.rows.length - 1
              return (
                <section
                  key={`${inputId}-mobile-row-${rowIndex}`}
                  className="min-w-0 space-y-3 rounded-none border border-stone-400 bg-white p-3"
                  aria-label={`Scope row ${rowIndex + 1}`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-stone-200 pb-2">
                    <p className="text-sm font-semibold text-stone-700">Row {rowIndex + 1}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-none" disabled={disabled || rowIndex === 0} title="Move row up" aria-label={`Move row ${rowIndex + 1} up`} onClick={() => moveNotesTableRow(rowIndex, -1)}>
                        <ChevronUp className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-none" disabled={disabled || isLastRow} title="Move row down" aria-label={`Move row ${rowIndex + 1} down`} onClick={() => moveNotesTableRow(rowIndex, 1)}>
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      </Button>
                      {isLastRow ? (
                        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-none text-amber-800" disabled={disabled} title="Add row" aria-label="Add row" onClick={addNotesTableRow}>
                          <Plus className="h-4 w-4" aria-hidden />
                        </Button>
                      ) : null}
                      <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-none text-stone-600" disabled={disabled || notesScope.rows.length <= 1} title="Remove row" aria-label={`Remove row ${rowIndex + 1}`} onClick={() => removeNotesTableRow(rowIndex)}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  {row.map((cell, colIndex) => (
                    <div key={`${inputId}-mobile-cell-${rowIndex}-${colIndex}`} className="min-w-0 space-y-1">
                      <Label htmlFor={`${inputId}-mobile-cell-${rowIndex}-${colIndex}`} className="break-words text-xs text-stone-600">
                        {notesScope.headers[colIndex] || `Column ${colIndex + 1}`}
                      </Label>
                      <Input
                        id={`${inputId}-mobile-cell-${rowIndex}-${colIndex}`}
                        value={cell}
                        disabled={disabled}
                        className="h-10 min-w-0 rounded-none bg-stone-50"
                        onChange={(event) =>
                          updateNotesTable((table) => {
                            const rows = table.rows.map((currentRow) => [...currentRow])
                            rows[rowIndex][colIndex] = event.target.value
                            return { headers: table.headers, rows }
                          })
                        }
                      />
                    </div>
                  ))}
                </section>
              )
            })}
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
                <SelectTrigger
                  id={`${inputId}-column-count`}
                  className="h-9 rounded-none text-sm font-medium"
                >
                  <SelectValue placeholder="Select columns" />
                </SelectTrigger>
                <SelectContent>
                  {BIS_NOTES_COLUMN_COUNT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-sm">
                      {n === 1 ? '1 Column — Plain Text' : `${n} Columns — Table Layout`}
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
