import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Eye, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export type IsCodeViewFile = {
  id: string
  file_name: string
  storage_path: string
  viewUrl?: string
  downloadUrl?: string
  url?: string
  error?: string
}

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const actionBtnClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none p-0 text-amber-900 hover:bg-amber-100 hover:text-amber-950'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,application/pdf,image/*'

type DraftRow = { id: string; name: string }

type TableEntry =
  | { key: string; kind: 'file'; file: IsCodeViewFile }
  | { key: string; kind: 'draft'; draft: DraftRow }

function newDraft(): DraftRow {
  return { id: crypto.randomUUID(), name: '' }
}

export function IsCodeFilesTable({
  files,
  loading = false,
  busy = false,
  status = null,
  onAddFiles,
  onReplaceFile,
  onDeleteFile,
  className,
  scrollClassName = 'max-h-[min(40vh,360px)]',
  /** Reset draft rows when this key changes (e.g. dialog open / editing id). */
  resetKey,
}: {
  files: IsCodeViewFile[]
  loading?: boolean
  busy?: boolean
  status?: string | null
  onAddFiles: (files: File[]) => void
  onReplaceFile?: (existing: IsCodeViewFile, next: File) => void
  onDeleteFile: (file: IsCodeViewFile) => void
  className?: string
  scrollClassName?: string
  resetKey?: string | number | boolean | null
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadTargetRef = useRef<{ type: 'draft' | 'file'; id: string } | null>(null)
  const [drafts, setDrafts] = useState<DraftRow[]>([newDraft()])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setDrafts(files.length === 0 ? [newDraft()] : [])
    setSelectedIds(new Set())
  }, [resetKey, files.length])

  const entries = useMemo<TableEntry[]>(() => {
    const fileEntries: TableEntry[] = files.map((file) => ({
      key: file.id,
      kind: 'file',
      file,
    }))
    const draftEntries: TableEntry[] = drafts.map((draft) => ({
      key: draft.id,
      kind: 'draft',
      draft,
    }))
    if (fileEntries.length === 0 && draftEntries.length === 0) {
      return [{ key: 'empty', kind: 'draft', draft: newDraft() }]
    }
    return [...fileEntries, ...draftEntries]
  }, [files, drafts])

  const allChecked = entries.length > 0 && entries.every((e) => selectedIds.has(e.key))
  const someChecked = entries.some((e) => selectedIds.has(e.key))

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(entries.map((e) => e.key)) : new Set())
  }

  const openFilePicker = (target: { type: 'draft' | 'file'; id: string }) => {
    uploadTargetRef.current = target
    fileInputRef.current?.click()
  }

  const handleFilesPicked = (picked: File[]) => {
    const target = uploadTargetRef.current
    uploadTargetRef.current = null
    const file = picked[0]
    if (!file) return

    if (target?.type === 'file') {
      const existing = files.find((f) => f.id === target.id)
      if (existing && onReplaceFile) {
        onReplaceFile(existing, file)
        return
      }
      onAddFiles([file])
      return
    }

    onAddFiles([file])
    if (target?.type === 'draft') {
      setDrafts((prev) => prev.filter((d) => d.id !== target.id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(target.id)
        return next
      })
    }
  }

  const addNewRow = () => {
    setDrafts((prev) => [...prev, newDraft()])
  }

  const deleteRow = (entry: TableEntry) => {
    if (busy) return
    if (entry.kind === 'draft') {
      setDrafts((prev) => {
        const next = prev.filter((d) => d.id !== entry.draft.id)
        if (next.length > 0) return next
        return files.length === 0 ? [newDraft()] : []
      })
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(entry.draft.id)
        return next
      })
      return
    }
    onDeleteFile(entry.file)
  }

  const renderDocumentActions = (entry: TableEntry) => {
    if (entry.kind === 'draft') {
      return (
        <div className="inline-flex flex-wrap items-center justify-center gap-0.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled={busy}
            onClick={() => openFilePicker({ type: 'draft', id: entry.draft.id })}
            title="Upload"
            aria-label="Upload document"
          >
            <Upload size={15} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled
            title="View (upload a file first)"
            aria-label="View document"
          >
            <Eye size={15} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled
            title="Download (upload a file first)"
            aria-label="Download document"
          >
            <Download size={15} aria-hidden />
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
            disabled={busy}
            onClick={() => deleteRow(entry)}
            title="Delete row"
            aria-label="Delete row"
          >
            <Trash2 size={15} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled={busy}
            onClick={addNewRow}
            title="Add new row"
            aria-label="Add new row"
          >
            <Plus size={15} aria-hidden />
          </Button>
        </div>
      )
    }

    const file = entry.file
    const viewHref = file.viewUrl || file.url
    return (
      <div className="inline-flex flex-wrap items-center justify-center gap-0.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(limsOutlineBtnClass, actionBtnClass)}
          disabled={busy}
          onClick={() => openFilePicker({ type: 'file', id: file.id })}
          title="Upload / Replace"
          aria-label={`Upload or replace ${file.file_name}`}
        >
          <Upload size={15} aria-hidden />
        </Button>
        {viewHref ? (
          <a
            href={viewHref}
            target="_blank"
            rel="noreferrer"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            title={`View ${file.file_name}`}
            aria-label={`View ${file.file_name}`}
          >
            <Eye size={15} aria-hidden />
          </a>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled
            title={file.error || 'View unavailable'}
            aria-label="View unavailable"
          >
            <Eye size={15} aria-hidden />
          </Button>
        )}
        {file.downloadUrl || viewHref ? (
          <a
            href={file.downloadUrl || viewHref}
            download={file.file_name}
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            title={`Download ${file.file_name}`}
            aria-label={`Download ${file.file_name}`}
          >
            <Download size={15} aria-hidden />
          </a>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled
            title="Download unavailable"
            aria-label="Download unavailable"
          >
            <Download size={15} aria-hidden />
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            limsOutlineBtnClass,
            actionBtnClass,
            'text-red-700 hover:bg-red-50 hover:text-red-800',
          )}
          disabled={busy}
          onClick={() => deleteRow(entry)}
          title={`Delete ${file.file_name}`}
          aria-label={`Delete ${file.file_name}`}
        >
          <Trash2 size={15} aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(limsOutlineBtnClass, actionBtnClass)}
          disabled={busy}
          onClick={addNewRow}
          title="Add new row"
          aria-label="Add new row"
        >
          <Plus size={15} aria-hidden />
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const list = e.target.files
          if (!list?.length) return
          handleFilesPicked(Array.from(list).slice(0, 1))
          e.target.value = ''
        }}
      />

      {status ? <p className="text-xs text-stone-600">{status}</p> : null}

      {loading ? (
        <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-[#f7f3eb]">
          <div
            className={cn(
              'overflow-y-auto overflow-x-auto overscroll-contain [-webkit-overflow-scrolling:touch]',
              scrollClassName,
            )}
          >
            <Table className="w-full min-w-[520px] table-fixed border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(thBase, 'w-[8%]')}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label="Select all rows"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = !allChecked && someChecked
                      }}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </TableHead>
                  <TableHead className={cn(thBase, 'w-[48%] text-left')}>Document Name</TableHead>
                  <TableHead className={cn(thBase, 'w-[44%]')}>Document</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, index) => {
                  const selected = selectedIds.has(entry.key)
                  return (
                    <TableRow
                      key={entry.key}
                      data-state={selected ? 'selected' : undefined}
                      className={cn(
                        'border-b border-[#e7e0d4]',
                        selected
                          ? rowSelectedClass
                          : index % 2 === 0
                            ? rowEvenClass
                            : rowOddClass,
                      )}
                    >
                      <TableCell className="px-2 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          checked={selected}
                          onChange={() => toggleId(entry.key)}
                          aria-label={
                            entry.kind === 'file'
                              ? `Select ${entry.file.file_name}`
                              : 'Select draft row'
                          }
                        />
                      </TableCell>
                      <TableCell className="px-3 py-2 text-left align-middle">
                        {entry.kind === 'file' ? (
                          <p
                            className="truncate text-sm text-stone-900"
                            title={entry.file.file_name}
                          >
                            {entry.file.file_name}
                          </p>
                        ) : (
                          <Input
                            value={entry.draft.name}
                            onChange={(e) => {
                              const name = e.target.value
                              setDrafts((prev) =>
                                prev.map((d) =>
                                  d.id === entry.draft.id ? { ...d, name } : d,
                                ),
                              )
                            }}
                            placeholder="Document name"
                            disabled={busy}
                            className="h-8 rounded-none border-stone-400 bg-white text-sm"
                          />
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle">
                        {renderDocumentActions(entry)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
