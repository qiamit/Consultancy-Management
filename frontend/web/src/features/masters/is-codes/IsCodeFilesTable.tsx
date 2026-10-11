import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Plus, Trash2, Upload } from 'lucide-react'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import { ClientManageDialogContent } from '@/features/masters/clients/ClientManageDialogContent'
import { supabase } from '@/lib/supabaseClient'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  inferIsCodeFileDocumentKind,
  resolveIsCodeFileDocumentKind,
  setIsCodeFileDocumentKind,
} from './types'

const DOCUMENT_KIND_CATEGORY = 'document_kind'
const DEFAULT_DOCUMENT_KIND = 'Specification'

function documentKindOrDefault(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim()
  return text || DEFAULT_DOCUMENT_KIND
}

export type IsCodeViewFile = {
  id: string
  file_name: string
  storage_path: string
  document_kind?: string | null
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

function useWideFileTable() {
  const query = '(min-width: 1024px)'
  const [wide, setWide] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setWide(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return wide
}

type DraftRow = { id: string; name: string; kind: string }

type TableEntry =
  | { key: string; kind: 'file'; file: IsCodeViewFile }
  | { key: string; kind: 'draft'; draft: DraftRow }

function newDraft(): DraftRow {
  return { id: crypto.randomUUID(), name: '', kind: DEFAULT_DOCUMENT_KIND }
}

export function IsCodeFilesTable({
  files,
  loading = false,
  busy = false,
  status = null,
  onAddFiles,
  onReplaceFile,
  onDeleteFile,
  onDocumentKindChange,
  className,
  scrollClassName = 'max-h-[min(40vh,360px)]',
  /** Reset draft rows when this key changes (e.g. dialog open / editing id). */
  resetKey,
}: {
  files: IsCodeViewFile[]
  loading?: boolean
  busy?: boolean
  status?: string | null
  onAddFiles: (files: File[], documentKind?: string) => void
  onReplaceFile?: (existing: IsCodeViewFile, next: File) => void
  onDeleteFile: (file: IsCodeViewFile) => void
  onDocumentKindChange?: (file: IsCodeViewFile, kind: string) => void
  className?: string
  scrollClassName?: string
  resetKey?: string | number | boolean | null
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadTargetRef = useRef<{ type: 'draft' | 'file'; id: string } | null>(null)
  const [drafts, setDrafts] = useState<DraftRow[]>([newDraft()])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [kindOptions, setKindOptions] = useState<Array<{ id: string; label: string }>>([])
  const [openKindKey, setOpenKindKey] = useState<string | null>(null)
  const [kindDialogOpen, setKindDialogOpen] = useState(false)
  const [kindDialogRowKey, setKindDialogRowKey] = useState<string | null>(null)
  const [newKind, setNewKind] = useState('')
  const [kindEdits, setKindEdits] = useState<Record<string, string>>({})
  const wideTable = useWideFileTable()

  useEffect(() => {
    setDrafts(files.length === 0 ? [newDraft()] : [])
    setSelectedIds(new Set())
    setKindEdits({})
  }, [resetKey, files.length])

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('is_code_master_options')
      .select('id, label')
      .eq('category', DOCUMENT_KIND_CATEGORY)
      .order('label', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data)) return
        const rows = (data as Array<{ id: string; label: string }>)
          .filter((row) => row.label.trim().length > 0)
          .sort((a, b) => a.label.localeCompare(b.label))
        setKindOptions(rows)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const applyKind = (key: string, label: string) => {
    const draft = drafts.find((row) => row.id === key)
    if (draft) {
      setDrafts((prev) => prev.map((row) => (row.id === key ? { ...row, kind: label } : row)))
      setKindEdits((prev) => {
        const copy = { ...prev }
        delete copy[key]
        return copy
      })
      return
    }
    const file = files.find((row) => row.id === key)
    if (!file) return
    onDocumentKindChange?.(file, label)
    setKindEdits((prev) => {
      const copy = { ...prev }
      delete copy[key]
      return copy
    })
  }

  const kindValue = (entry: TableEntry) => {
    if (kindEdits[entry.key] != null) return documentKindOrDefault(kindEdits[entry.key])
    if (entry.kind === 'file') {
      return resolveIsCodeFileDocumentKind(entry.file.document_kind, entry.file.file_name)
    }
    return documentKindOrDefault(entry.draft.kind)
  }

  const rememberKind = async (label: string, id?: string, close = true) => {
    const name = label.trim()
    if (!name) return
    const previous = id ? kindOptions.find((item) => item.id === id)?.label ?? '' : ''
    if (id) {
      const { error } = await supabase
        .from('is_code_master_options')
        .update({ label: name, value: name })
        .eq('id', id)
      if (error) return
      setKindOptions((prev) =>
        prev
          .map((item) => (item.id === id ? { ...item, label: name } : item))
          .sort((a, b) => a.label.localeCompare(b.label)),
      )
      if (previous && previous !== name) {
        setDrafts((prev) => prev.map((row) => (row.kind === previous ? { ...row, kind: name } : row)))
        for (const file of files) {
          if (file.document_kind === previous) onDocumentKindChange?.(file, name)
        }
        const renamed = await supabase
          .from('is_code_files')
          .update({ document_kind: name })
          .eq('document_kind', previous)
        if (renamed.error && renamed.error.code !== 'PGRST204' && renamed.error.code !== '42703') return
      }
    } else {
      const existing = kindOptions.find((item) => item.label.toLowerCase() === name.toLowerCase())
      if (!existing) {
        const { data, error } = await supabase
          .from('is_code_master_options')
          .insert({ category: DOCUMENT_KIND_CATEGORY, label: name, value: name })
          .select('id')
          .single()
        if (error) return
        const nextId = (data as { id: string } | null)?.id ?? `tmp-${name}`
        setKindOptions((prev) =>
          [...prev, { id: nextId, label: name }].sort((a, b) => a.label.localeCompare(b.label)),
        )
      }
    }
    if (kindDialogRowKey) applyKind(kindDialogRowKey, name)
    setNewKind('')
    if (close) setKindDialogOpen(false)
  }

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
      const kept =
        existing?.document_kind?.trim() || inferIsCodeFileDocumentKind(file.name)
      setIsCodeFileDocumentKind(file, kept)
      if (existing && onReplaceFile) {
        onReplaceFile(existing, file)
        return
      }
      onAddFiles([file], kept)
      return
    }

    let draftKind = documentKindOrDefault(
      target?.type === 'draft' ? drafts.find((d) => d.id === target.id)?.kind : '',
    )
    if (draftKind === DEFAULT_DOCUMENT_KIND) {
      draftKind = inferIsCodeFileDocumentKind(file.name)
    }
    setIsCodeFileDocumentKind(file, draftKind)
    onAddFiles([file], draftKind)
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

  const deleteFileButton = (entry: TableEntry, label: string) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn(
        limsOutlineBtnClass,
        actionBtnClass,
        'text-red-700 hover:bg-red-50 hover:text-red-800',
      )}
      disabled={busy || entry.kind === 'draft'}
      onClick={() => {
        if (entry.kind === 'file') onDeleteFile(entry.file)
      }}
      title={entry.kind === 'file' ? label : 'Delete (upload a file first)'}
      aria-label={entry.kind === 'file' ? label : 'Delete document'}
    >
      <Trash2 size={15} aria-hidden />
    </Button>
  )

  const renderDocumentActions = (entry: TableEntry) => {
    if (entry.kind === 'draft') {
      return (
        <div className="inline-flex items-center justify-center gap-0.5">
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
          {deleteFileButton(entry, 'Delete document')}
        </div>
      )
    }

    const file = entry.file
    const viewHref = file.viewUrl || file.url
    return (
      <div className="inline-flex items-center justify-center gap-0.5">
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
        {deleteFileButton(entry, `Delete ${file.file_name}`)}
      </div>
    )
  }

  const renderKindField = (entry: TableEntry, idSuffix: string) => (
    <LimsFieldWithAdd
      addButton={
        <DialogTrigger asChild>
          <LimsFieldAddButton
            aria-label="Add document type"
            title="Add document type"
            disabled={busy}
            onClick={() => {
              setKindDialogRowKey(entry.key)
              setNewKind(kindValue(entry))
            }}
          />
        </DialogTrigger>
      }
    >
      <FilterCombobox
        value={kindValue(entry)}
        disabled={busy}
        onValueChange={(next) => {
          const value = documentKindOrDefault(next)
          setKindEdits((prev) => ({ ...prev, [entry.key]: value }))
          if (entry.kind === 'draft') {
            setDrafts((prev) =>
              prev.map((row) => (row.id === entry.draft.id ? { ...row, kind: value } : row)),
            )
          }
        }}
        options={kindOptions
          .filter((item) => {
            const query = kindValue(entry).trim().toLowerCase()
            return !query || item.label.toLowerCase().includes(query)
          })
          .map((item) => ({ id: item.id, label: item.label }))}
        onSelectOption={(option) => applyKind(entry.key, option.label)}
        open={openKindKey === entry.key}
        onOpenChange={(open) => {
          setOpenKindKey(open ? entry.key : null)
          if (open || entry.kind !== 'file') return
          const next = (kindEdits[entry.key] ?? entry.file.document_kind ?? '').trim()
          if (next === (entry.file.document_kind ?? '')) return
          onDocumentKindChange?.(entry.file, next)
          setKindEdits((prev) => {
            const copy = { ...prev }
            delete copy[entry.key]
            return copy
          })
        }}
        placeholder="Type or Select"
        showSerialNumbers={false}
        listId={`is-file-kind-${entry.key}-${idSuffix}`}
        inputId={`is-file-kind-${entry.key}-${idSuffix}`}
        inputClassName="h-8 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
      />
    </LimsFieldWithAdd>
  )

  const renderNameField = (entry: TableEntry) =>
    entry.kind === 'file' ? (
      <p className="truncate text-sm text-stone-900" title={entry.file.file_name}>
        {entry.file.file_name}
      </p>
    ) : (
      <Input
        value={entry.draft.name}
        onChange={(e) => {
          const name = e.target.value
          setDrafts((prev) =>
            prev.map((d) => (d.id === entry.draft.id ? { ...d, name } : d)),
          )
        }}
        placeholder="Document Name"
        disabled={busy}
        className="h-8 rounded-none border-stone-400 bg-white text-sm"
      />
    )

  const renderRowActions = (entry: TableEntry) => (
    <div className="inline-flex items-center justify-center gap-0.5">
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
    </div>
  )

  return (
    <Dialog open={kindDialogOpen} onOpenChange={setKindDialogOpen}>
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
              'overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]',
              scrollClassName,
            )}
          >
            {wideTable ? null : (
            <div className="space-y-2 p-2">
              <label className="inline-flex items-center gap-2 px-1 text-[12px] font-semibold normal-case tracking-normal text-stone-600">
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
                Select all
              </label>
              {entries.map((entry, index) => {
                const selected = selectedIds.has(entry.key)
                return (
                  <article
                    key={entry.key}
                    className={cn(
                      'overflow-hidden border-2 border-stone-500 shadow-sm',
                      selected
                        ? 'bg-[#fde68a]/70'
                        : index % 2 === 0
                          ? 'bg-[#fffcf7]'
                          : 'bg-white',
                    )}
                  >
                    <div className="min-w-0 space-y-2 p-2.5">
                        <div className="flex items-center gap-2">
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
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600">
                            {entry.kind === 'file' ? entry.file.file_name : 'New file'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Type</p>
                          {renderKindField(entry, 'card')}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                            Document Name
                          </p>
                          {renderNameField(entry)}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e7e0d4] pt-2">
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                              Document
                            </p>
                            {renderDocumentActions(entry)}
                          </div>
                          <div className="space-y-1">
                            <p className="text-right text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                              Action
                            </p>
                            {renderRowActions(entry)}
                          </div>
                        </div>
                    </div>
                  </article>
                )
              })}
            </div>
            )}
            {wideTable ? (
            <Table className="w-full table-fixed border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(thBase, 'w-[6%]')}>
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
                  <TableHead className={cn(thBase, 'w-[24%] text-left')}>Type</TableHead>
                  <TableHead className={cn(thBase, 'w-[34%] text-left')}>Document Name</TableHead>
                  <TableHead className={cn(thBase, 'w-[20%]')}>Document</TableHead>
                  <TableHead className={cn(thBase, 'w-[16%]')}>Action</TableHead>
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
                      <TableCell className="px-1 py-1 text-left align-middle">
                        {renderKindField(entry, 'table')}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-left align-middle">
                        {renderNameField(entry)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle">
                        {renderDocumentActions(entry)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle">
                        {renderRowActions(entry)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            ) : null}
          </div>
        </div>
      )}
    </div>
    <ClientManageDialogContent
      open={kindDialogOpen}
      title="Manage Document Types"
      addLabel="Add Document Type"
      inputId="new-is-file-kind"
      placeholder="e.g., Specification"
      value={newKind}
      onValueChange={setNewKind}
      inlineAdd
      onInlineAdd={() => void rememberKind(newKind, undefined, false)}
      onSave={() => void rememberKind(newKind)}
      onUpdate={(id) => void rememberKind(newKind, id)}
      saveDisabled={!newKind.trim()}
      items={kindOptions}
      canDelete={() => true}
      onDelete={(id) => {
        if (id.startsWith('tmp-')) {
          setKindOptions((prev) => prev.filter((item) => item.id !== id))
          return
        }
        void supabase
          .from('is_code_master_options')
          .delete()
          .eq('id', id)
          .then(({ error }) => {
            if (error) return
            setKindOptions((prev) => prev.filter((item) => item.id !== id))
          })
      }}
    />
    </Dialog>
  )
}
