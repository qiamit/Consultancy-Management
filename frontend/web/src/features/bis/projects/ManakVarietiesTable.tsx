import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { BookOpen, Check, Columns3, Download, Eye, ExternalLink, FileText, FileType, Globe, Import, LogIn, Paperclip, Plus, Trash2, Upload, X, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { limsDarkBarGlowStyle, limsManageDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass, limsRegistryFormClass } from '@/lib/limsThemeUi'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { loadIsCodeFileLinks, type IsCodeFileLink } from '@/features/masters/is-codes/loadIsCodeFileLinks'
import { cn } from '@/lib/utils'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { usePdfViewer } from '@/components/ui/usePdfViewer'
import {
  deleteBisProjectFile,
  formatBisProjectFilesError,
  listBisProjectFiles,
  updateBisProjectFileName,
  uploadBisProjectFile,
  type BisProjectViewFile,
} from './bisProjectFilesApi'
import { supabase } from '@/lib/supabaseClient'
import { isQeExtensionPresent } from './manakExtensionBridge'
import { saveBisProjectNotes } from './bisProjectsApi'
import { fetchBisModulePayload } from './bisModuleDataApi'
import { BisModuleImportDialog } from './BisModuleImportDialog'
import {
  BIS_NOTES_COLUMN_COUNT_OPTIONS,
  parseBisNotesScope,
  sanitizeBisLicenseScopeNotes,
  serializeBisNotesScope,
  setBisNotesScopeColumnCount,
  type BisProjectRow,
} from './types'

const iconBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border bg-white transition-colors hover:bg-amber-50 disabled:opacity-40'

const isManualName = (name: string) => /product[_\s-]*manual|\bmanual\b|\bpm\b|^pm[_\s-]/i.test(name)

function pickIsFile(files: IsCodeFileLink[], kind: 'manual' | 'standard'): IsCodeFileLink | null {
  const usable = files.filter((f) => Boolean(f.url?.trim()))
  const pool = usable.length > 0 ? usable : files
  if (pool.length === 0) return null
  return kind === 'manual'
    ? pool.find((f) => isManualName(f.file_name)) ?? null
    : pool.find((f) => !isManualName(f.file_name)) ?? null
}

/** Opens BIS Product Manuals online; the QE extension searches the IS number when installed. */
function openProductManualOnline(isNumber: string, setBusy: (busy: boolean) => void) {
  const url = 'https://standards.bis.gov.in/website/product-manuals'
  const selected = isNumber.trim()
  if (!selected) {
    window.open(url, '_blank', 'noopener,noreferrer')
    toast.warning('Product Manuals opened. This application has no IS number to search.')
    return
  }
  if (!isQeExtensionPresent()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    toast.warning('Reload the QE Consultancy Extension to Auto-Search the IS Number.')
    return
  }
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  setBusy(true)
  let done = false
  const finish = (message: string, isError: boolean) => {
    if (done) return
    done = true
    window.clearTimeout(timer)
    window.removeEventListener('message', onResult)
    setBusy(false)
    if (isError) toast.error(message)
    else toast.success(message)
  }
  const onResult = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return
    const data = event.data
    if (data?.type !== 'QE_PRODUCT_MANUAL_SEARCH_RESULT' || data.requestId !== requestId) return
    finish(String(data.message || (data.ok ? 'Product Manual search started.' : 'Could not search Product Manuals.')), !data.ok)
  }
  const timer = window.setTimeout(() => finish('The QE Consultancy extension did not respond. Reload it and try again.', true), 60000)
  window.addEventListener('message', onResult)
  window.postMessage({ type: 'QE_PRODUCT_MANUAL_SEARCH', requestId, isNumber: selected }, window.location.origin)
}

/** Product manual number with a view button when a manual PDF is attached to the IS Code master (opens in a new tab, no download). */
export function ProductManualValue({
  isCodeId,
  value,
  buttonOnly = false,
}: {
  isCodeId: string | null
  value?: string | null
  /** Show only the view button (the number is shown elsewhere). */
  buttonOnly?: boolean
}) {
  const [manual, setManual] = useState<IsCodeFileLink | null>(null)
  const [viewFile, viewer] = usePdfViewer()
  useEffect(() => {
    const id = (isCodeId ?? '').trim()
    if (!id) {
      setManual(null)
      return
    }
    let cancelled = false
    void loadIsCodeFileLinks(id).then((files) => {
      if (cancelled) return
      // Prefer a manual whose file can be opened; otherwise still show the attached record.
      setManual(files.find((f) => isManualName(f.file_name) && f.url?.trim()) ?? files.find((f) => isManualName(f.file_name)) ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [isCodeId])
  const missing = Boolean(manual) && !manual?.url?.trim()
  return (
    <span className="inline-flex items-center gap-2">
      {viewer}
      {buttonOnly ? null : <span>{value || <span className="text-stone-400">—</span>}</span>}
      {manual ? (
        <button
          type="button"
          className={cn(iconBtn, 'h-7 w-7 border-stone-400 text-amber-800', missing && 'opacity-50')}
          title={missing ? `${manual.file_name} is attached in IS Code master but the file is missing in storage` : `View product manual: ${manual.file_name}`}
          aria-label="View Product Manual PDF"
          onClick={() =>
            viewFile(
              manual.url,
              manual.file_name,
              `${manual.file_name} is attached to this IS Code but the file is missing in storage. Re-upload it in IS Code master.`,
            )
          }
        >
          <Eye size={14} aria-hidden />
        </button>
      ) : null}
    </span>
  )
}

/** Single-purpose text box whose height follows its content (wraps long scope text instead of scrolling sideways). */
function AutoGrowInput({
  value,
  onChange,
  onKeyDown,
  className,
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  className?: string
  'aria-label'?: string
  placeholder?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // An empty box stays one line high (a wrapping placeholder must not make it taller).
    el.style.height = value ? 'auto' : '2rem'
    if (value) el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      className={cn(
        'block min-h-8 w-full resize-none overflow-hidden rounded-none border border-stone-500 bg-stone-50 px-2 py-1.5 text-sm leading-5 text-stone-800 shadow-none placeholder:text-stone-400 focus-visible:border-amber-600 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={onKeyDown}
      {...rest}
    />
  )
}

const FILE_TYPES = ['Copy of Scope', 'Drawing', 'Other'] as const
type RowKey = 'draft' | number
const KEY_TAG = /^\[(draft|r(\d+))\] /
/**
 * Every scope file belongs to one scope row. Its name starts with [draft] (the new row, not added yet) or [r<index>];
 * older files without a tag belong to the first row.
 */
const rowKeyOf = (file: BisProjectViewFile): RowKey => {
  const match = file.file_name.match(KEY_TAG)
  if (!match) return 0
  return match[1] === 'draft' ? 'draft' : Number(match[2])
}
const stripKey = (name: string) => name.replace(KEY_TAG, '')
const tagFor = (key: RowKey) => (key === 'draft' ? '[draft] ' : `[r${key}] `)
const typeOf = (file: BisProjectViewFile) => FILE_TYPES.find((t) => stripKey(file.file_name).startsWith(`${t} - `)) ?? 'Copy of Scope'

/**
 * Varieties with an Action column: view the specification, view the product manual file,
 * open the standard / product manual online, and attach scope files (copy of scope, drawings, other).
 */
export function ManakVarietiesTable({
  projectId,
  isCodeId,
  isNumber,
  varieties,
  panel,
  scopeNotes = '',
  onScopeSaved,
  scopeDocument,
  saveNotes,
  filesDocKind = 'manufacturing-scope',
  scopeDocumentLabel = 'Undertaking for Manufacturing Scope',
  projectRow,
}: {
  projectId: string | null
  /** The application itself; enables "Import from Another Application" (other applications / licences of the client). */
  projectRow?: BisProjectRow | null
  isCodeId: string | null
  isNumber: string
  varieties: string[]
  /** Wraps the table in its panel; the specification / manual / online buttons go in the panel header. */
  panel: (headerExtra: ReactNode, body: ReactNode) => ReactNode
  /** Notes / License Scope of the project; the Column button switches it between plain text and a 2-6 column table. */
  scopeNotes?: string
  onScopeSaved?: () => void
  /** Undertaking for Manufacturing Scope: preview / PDF / Word of the scope declaration, generated from the same scope table. */
  scopeDocument?: { preview: () => void; pdf: () => void; word: () => void; print?: () => void }
  /** Where the scope is saved (default: the project's Notes / License Scope). Inclusion keeps its New Scope apart. */
  saveNotes?: (notes: string) => Promise<void>
  /** Stored-file category of the row attachments (default: the application's manufacturing scope files). */
  filesDocKind?: string
  /** Name of the document behind the preview / PDF / Word / print buttons. */
  scopeDocumentLabel?: string
}) {
  const persistNotes = (notes: string) => (saveNotes ? saveNotes(notes) : saveBisProjectNotes(projectId!, notes))
  const [viewFile, viewer] = usePdfViewer()
  const [confirmAction, confirmDialog] = useConfirmDialog()
  const [columnOpen, setColumnOpen] = useState(false)
  const [columnDraft, setColumnDraft] = useState('2')
  const [importOpen, setImportOpen] = useState(false)
  // Until the scope has been edited here, the varieties from Sample Requirements are shown as its rows.
  const [notesOverride, setNotesOverride] = useState<string | null>(null)
  const baseNotes = scopeNotes.trim() ? scopeNotes : varieties.join('\n')
  const effectiveNotes = notesOverride ?? baseNotes
  // An empty scope starts as a 2-column table (same default as the Licence form's License Scope).
  const parsedScope = parseBisNotesScope(effectiveNotes.trim() ? effectiveNotes : setBisNotesScopeColumnCount('', 2))
  const scope = !effectiveNotes.trim() && parsedScope.mode === 'table' ? { ...parsedScope, rows: [] } : parsedScope
  const headers = scope.mode === 'table' ? scope.headers : ['Variety applied for']
  const scopeRows: string[][] = scope.mode === 'table' ? scope.rows : scope.text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => [line])
  const currentColumns = headers.length
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<string[]>([])
  const [newDraft, setNewDraft] = useState<string[]>([])
  const emptyDraft = () => headers.map(() => '')
  // Column widths follow the length of their content (header, rows and the row being typed), within sensible limits.
  const columnWeights = headers.map((header, i) => {
    const longest = Math.max(header.length, newDraft[i]?.length ?? 0, editingIndex != null ? editDraft[i]?.length ?? 0 : 0, ...scopeRows.map((row) => row[i]?.length ?? 0))
    return Math.min(90, Math.max(14, longest))
  })
  const weightTotal = columnWeights.reduce((sum, weight) => sum + weight, 0) || 1
  // Manually dragged column widths (percent of the table) win over the content-based ones; remembered per project in this browser.
  const widthKey = `scope-col-widths:${projectId ?? ''}:${headers.length}`
  const [manualShares, setManualShares] = useState<number[] | null>(() => {
    try {
      const raw = window.localStorage.getItem(widthKey)
      const parsed = raw ? (JSON.parse(raw) as unknown) : null
      return Array.isArray(parsed) && parsed.length === headers.length && parsed.every((n) => typeof n === 'number') ? (parsed as number[]) : null
    } catch {
      return null
    }
  })
  const shares =
    manualShares && manualShares.length === headers.length ? manualShares : columnWeights.map((weight) => (84 * weight) / weightTotal)
  const persistShares = (next: number[] | null) => {
    setManualShares(next)
    try {
      if (next) window.localStorage.setItem(widthKey, JSON.stringify(next))
      else window.localStorage.removeItem(widthKey)
    } catch {
      /* private mode: widths simply are not remembered */
    }
  }
  const startColumnResize = (index: number, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const table = event.currentTarget.closest('table')
    if (!table) return
    const tableWidth = table.getBoundingClientRect().width || 1
    const startX = event.clientX
    const base = [...shares]
    const pair = (base[index] ?? 0) + (base[index + 1] ?? 0)
    let latest: number[] = base
    const move = (e: PointerEvent) => {
      const left = Math.min(pair - 6, Math.max(6, (base[index] ?? 0) + ((e.clientX - startX) / tableWidth) * 100))
      latest = base.map((share, i) => (i === index ? left : i === index + 1 ? pair - left : share))
      setManualShares(latest)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      persistShares(latest)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }
  const saveScope = async (notes: string) => {
    if (!projectId) return
    const clean = sanitizeBisLicenseScopeNotes(notes)
    setNotesOverride(clean)
    try {
      await persistNotes(clean)
      onScopeSaved?.()
    } catch (error) {
      setNotesOverride(null)
      toast.error(error instanceof Error ? error.message : 'Could not save the License Scope.')
    }
  }
  const commitRows = (rows: string[][]) =>
    saveScope(
      scope.mode === 'table'
        ? serializeBisNotesScope({ mode: 'table', headers: scope.headers, rows: rows.length ? rows : [headers.map(() => '')] })
        : rows.map((row) => row[0] ?? '').filter(Boolean).join('\n'),
    )
  // Unlike saveScope, a failure is thrown so the import dialog stays open and shows it.
  const saveImported = async (notes: string) => {
    const clean = sanitizeBisLicenseScopeNotes(notes)
    setNotesOverride(clean)
    try {
      await persistNotes(clean)
    } catch (error) {
      setNotesOverride(null)
      throw error
    }
    onScopeSaved?.()
  }
  /** Scope rows of another application / licence: its License Scope, else the varieties of its Sample Requirements. */
  const importScope = async (sourceProjectId: string) => {
    const { data, error } = await supabase.from('bis_projects').select('notes').eq('id', sourceProjectId).maybeSingle()
    if (error) throw error
    const source = parseBisNotesScope(String((data as { notes?: string | null } | null)?.notes ?? ''))
    let sourceRows = (source.mode === 'table' ? source.rows : source.text.split('\n').map((line) => [line]))
      .map((row) => row.map((cell) => (cell ?? '').trim()))
      .filter((row) => row.some(Boolean))
    if (sourceRows.length === 0) {
      const sample = await fetchBisModulePayload(sourceProjectId, 'osl-sample-requirements').catch(() => null)
      const rows = Array.isArray(sample?.rows) ? (sample.rows as Array<Record<string, unknown>>) : []
      sourceRows = rows.map((r) => [String(r.gradeTypeVariety ?? '').trim()]).filter((row) => row[0])
    }
    if (sourceRows.length === 0) throw new Error('The selected application has no Scope / Varieties.')
    // An empty scope takes the source as it is (its columns too); otherwise the rows are fitted to these columns.
    if (scopeRows.length === 0 && source.mode === 'table' && source.rows.length) {
      await saveImported(serializeBisNotesScope({ mode: 'table', headers: source.headers, rows: sourceRows }))
      toast.success(`Imported ${sourceRows.length} scope row${sourceRows.length === 1 ? '' : 's'}`)
      return
    }
    const width = headers.length
    const fitted = sourceRows.map((row) =>
      row.length <= width
        ? [...row, ...Array.from({ length: width - row.length }, () => '')]
        : [...row.slice(0, width - 1), row.slice(width - 1).filter(Boolean).join(' - ')],
    )
    const keyOf = (row: string[]) => row.map((cell) => cell.trim().toLowerCase()).join('\u0001')
    const known = new Set(scopeRows.map(keyOf))
    const fresh = fitted.filter((row) => {
      const key = keyOf(row)
      if (known.has(key)) return false
      known.add(key)
      return true
    })
    if (fresh.length === 0) {
      toast.message('Nothing New to Import', { description: 'All these scope rows are already here.' })
      return
    }
    const rows = [...scopeRows, ...fresh]
    await saveImported(
      scope.mode === 'table'
        ? serializeBisNotesScope({ mode: 'table', headers: scope.headers, rows })
        : rows.map((row) => row[0] ?? '').filter(Boolean).join('\n'),
    )
    toast.success(`Imported ${fresh.length} scope row${fresh.length === 1 ? '' : 's'}`)
  }
  const retag = async (file: BisProjectViewFile, key: RowKey): Promise<BisProjectViewFile> => {
    const name = `${tagFor(key)}${stripKey(file.file_name)}`
    await updateBisProjectFileName(file.id, name)
    return { ...file, file_name: name }
  }
  const addRow = async () => {
    const values = headers.map((_, i) => (newDraft[i] ?? '').trim())
    if (!values.some(Boolean)) {
      toast.warning('Enter the Scope Text First.')
      return
    }
    const newIndex = scopeRows.length
    const pending = scopeFiles.filter((f) => rowKeyOf(f) === 'draft')
    void commitRows([...scopeRows, values])
    setNewDraft(emptyDraft())
    if (pending.length) {
      // Files attached to the new row move to the row that has just been added.
      try {
        const moved = await Promise.all(pending.map((f) => retag(f, newIndex)))
        setScopeFiles((prev) => prev.map((f) => moved.find((m) => m.id === f.id) ?? f))
      } catch (error) {
        toast.error(formatBisProjectFilesError(error))
      }
    }
  }
  const clearNewRow = async () => {
    setNewDraft(emptyDraft())
    const pending = scopeFiles.filter((f) => rowKeyOf(f) === 'draft')
    if (!pending.length) return
    await Promise.allSettled(pending.map(deleteBisProjectFile))
    setScopeFiles((prev) => prev.filter((f) => rowKeyOf(f) !== 'draft'))
  }
  const saveEdit = () => {
    if (editingIndex == null) return
    const values = headers.map((_, i) => (editDraft[i] ?? '').trim())
    void commitRows(scopeRows.map((row, i) => (i === editingIndex ? values : row)))
    setEditingIndex(null)
  }
  const deleteRow = async (index: number) => {
    const own = scopeFiles.filter((f) => rowKeyOf(f) === index)
    const message = own.length ? `Delete this scope row and its ${own.length} attached file${own.length === 1 ? '' : 's'}?` : 'Delete this scope row?'
    if (!(await confirmAction(message, { title: 'Delete row' }))) return
    void commitRows(scopeRows.filter((_, i) => i !== index))
    setEditingIndex(null)
    try {
      await Promise.allSettled(own.map(deleteBisProjectFile))
      // Rows below move up by one, and so do their files.
      const later = scopeFiles.filter((f) => typeof rowKeyOf(f) === 'number' && (rowKeyOf(f) as number) > index)
      const shifted = await Promise.all(later.map((f) => retag(f, (rowKeyOf(f) as number) - 1)))
      setScopeFiles((prev) =>
        prev.filter((f) => !own.some((o) => o.id === f.id)).map((f) => shifted.find((m) => m.id === f.id) ?? f),
      )
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    }
  }
  const applyColumns = async () => {
    if (!projectId) return
    try {
      const converted = setBisNotesScopeColumnCount(sanitizeBisLicenseScopeNotes(effectiveNotes), Number(columnDraft))
      setNotesOverride(converted)
      setEditingIndex(null)
      setNewDraft([])
      await persistNotes(converted)
      setColumnOpen(false)
      toast.success(`License scope set to ${columnDraft} column${columnDraft === '1' ? '' : 's'}`)
      onScopeSaved?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the License Scope columns.')
    }
  }
  const [isFiles, setIsFiles] = useState<IsCodeFileLink[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [scopeFiles, setScopeFiles] = useState<BisProjectViewFile[]>([])
  // Which row's attachments the Scope files dialog shows (null = closed).
  const [filesTarget, setFilesTarget] = useState<RowKey | null>(null)
  const [fileType, setFileType] = useState<(typeof FILE_TYPES)[number]>('Copy of Scope')
  const [busy, setBusy] = useState(false)
  const [searchBusy, setSearchBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const sharesTotal = shares.reduce((sum, share) => sum + share, 0) || 1

  useEffect(() => {
    const id = (isCodeId ?? '').trim()
    if (!id) {
      setIsFiles([])
      return
    }
    let cancelled = false
    setFilesLoading(true)
    void loadIsCodeFileLinks(id).then((files) => {
      if (!cancelled) {
        setIsFiles(files)
        setFilesLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [isCodeId])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void listBisProjectFiles(projectId, filesDocKind)
      .then((files) => {
        if (!cancelled) setScopeFiles(files)
      })
      .catch(() => {
        if (!cancelled) setScopeFiles([])
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const standardFile = pickIsFile(isFiles, 'standard')
  const manualFile = pickIsFile(isFiles, 'manual')

  const upload = async (file?: File) => {
    if (!projectId || !file) return
    const okType = file.type === 'application/pdf' || /^image\//.test(file.type) || /\.(pdf|png|jpe?g|webp)$/i.test(file.name)
    if (!okType) {
      toast.error('Upload a PDF or Image File.')
      return
    }
    setBusy(true)
    try {
      if (filesTarget == null) return
      const displayName = `${tagFor(filesTarget)}${fileType} - ${file.name}`
      const uploaded = await uploadBisProjectFile(projectId, file, filesDocKind, { displayName })
      // A new "Copy of Scope" replaces the previous one of the same row; drawings and other files are kept.
      const replaced =
        fileType === 'Copy of Scope'
          ? scopeFiles.filter((f) => rowKeyOf(f) === filesTarget && typeOf(f) === 'Copy of Scope' && f.id !== uploaded.id)
          : []
      await Promise.allSettled(replaced.map(deleteBisProjectFile))
      setScopeFiles([...scopeFiles.filter((f) => !replaced.some((r) => r.id === f.id)), uploaded])
      toast.success(`${fileType} uploaded`)
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setBusy(false)
    }
  }

  const removeFile = async (file: BisProjectViewFile) => {
    setBusy(true)
    try {
      await deleteBisProjectFile(file)
      setScopeFiles((prev) => prev.filter((f) => f.id !== file.id))
      toast.success('File Deleted')
    } catch (error) {
      toast.error(formatBisProjectFilesError(error))
    } finally {
      setBusy(false)
    }
  }

  const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
  const td = 'border border-[#e7e0d4] px-2 py-1.5 align-top text-sm text-stone-700'

  const docButtons = (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <button
        type="button"
        className={cn(iconBtn, 'border-stone-400 text-amber-800')}
        disabled={filesLoading || !standardFile?.url}
        title={standardFile?.file_name ? `View specification: ${standardFile.file_name}` : 'No specification attached to this IS Code'}
        aria-label="View Specification"
        onClick={() => viewFile(standardFile?.url, standardFile?.file_name || 'Specification', 'Specification file not found for this IS Code.')}
      >
        <BookOpen size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={cn(iconBtn, 'border-stone-400 text-amber-800')}
        disabled={filesLoading || !manualFile?.url}
        title={manualFile?.file_name ? `View product manual: ${manualFile.file_name}` : 'No product manual attached to this IS Code'}
        aria-label="View Product Manual"
        onClick={() => viewFile(manualFile?.url, manualFile?.file_name || 'Product manual', 'Product manual file not found for this IS Code.')}
      >
        <FileText size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={cn(iconBtn, 'border-stone-400 text-amber-800')}
        disabled={searchBusy}
        title="Open the standard / product manual online (BIS) and search this IS number"
        aria-label="Open Standard Online"
        onClick={() => openProductManualOnline(isNumber, setSearchBusy)}
      >
        <ExternalLink size={15} aria-hidden />
      </button>
      <a
        className={cn(iconBtn, 'border-stone-400 text-amber-800')}
        href="https://standards.bis.gov.in/website"
        target="_blank"
        rel="noopener noreferrer"
        title="BIS Standards Website (standards.bis.gov.in)"
        aria-label="BIS Standards Website"
      >
        <Globe size={15} aria-hidden />
      </a>
      <a
        className={cn(iconBtn, 'border-stone-400 text-amber-800')}
        href="https://standardsbis.bsbedge.com/BIS_Login"
        target="_blank"
        rel="noopener noreferrer"
        title="BIS Portal Login (standardsbis.bsbedge.com)"
        aria-label="BIS Portal Login"
      >
        <LogIn size={15} aria-hidden />
      </a>
      {projectRow?.id ? (
        <button
          type="button"
          className={cn(iconBtn, 'border-stone-400 text-amber-800')}
          title="Import from Another Application / Licence"
          aria-label="Import from Another Application"
          onClick={() => setImportOpen(true)}
        >
          <Import size={15} aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        className={cn(iconBtn, 'border-stone-400 text-amber-800')}
        disabled={!projectId}
        title="Set License Scope columns (1 = plain text, 2+ = table)"
        aria-label="License Scope Columns"
        onClick={() => {
          setColumnDraft(String(currentColumns))
          setColumnOpen(true)
        }}
      >
        <Columns3 size={15} aria-hidden />
      </button>
      {scopeDocument ? (
        <>
          <span className="mx-1 h-6 w-px bg-stone-500" aria-hidden />
          <button type="button" className={cn(iconBtn, 'border-stone-400 text-amber-800')} title={`${scopeDocumentLabel} — preview`} aria-label="Preview Undertaking for Scope" onClick={scopeDocument.preview}>
            <Eye size={15} aria-hidden />
          </button>
          <button type="button" className={cn(iconBtn, 'border-stone-400 text-amber-800')} title={`${scopeDocumentLabel} — PDF`} aria-label="Undertaking for Scope PDF" onClick={scopeDocument.pdf}>
            <Download size={15} aria-hidden />
          </button>
          <button type="button" className={cn(iconBtn, 'border-stone-400 text-amber-800')} title={`${scopeDocumentLabel} — Word`} aria-label="Undertaking for Scope Word" onClick={scopeDocument.word}>
            <FileType size={15} aria-hidden />
          </button>
          {scopeDocument.print ? (
            <button type="button" className={cn(iconBtn, 'border-stone-400 text-amber-800')} title={`${scopeDocumentLabel} — Print`} aria-label="Print Undertaking for Scope" onClick={scopeDocument.print}>
              <Printer size={15} aria-hidden />
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  )

  const filesOf = (key: RowKey) => scopeFiles.filter((f) => rowKeyOf(f) === key)
  const attachButton = (key: RowKey) => {
    const count = filesOf(key).length
    return (
      <button
        type="button"
        className={cn(iconBtn, count > 0 ? 'border-emerald-600 text-emerald-800' : 'border-stone-400 text-amber-800')}
        disabled={!projectId}
        title={count > 0 ? `Files of this row (${count}): view, upload or delete` : 'Attach a copy of scope, drawing or other file to this row'}
        aria-label={key === 'draft' ? 'Scope files of the new row' : `Scope files of row ${key + 1}`}
        onClick={() => setFilesTarget(key)}
      >
        <Paperclip size={15} aria-hidden />
      </button>
    )
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,.pdf"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void upload(file)
        }}
      />
      {panel(
        docButtons,
        <div className="overflow-x-auto">
          <table className="row-cards w-full table-fixed border-collapse text-sm">
            <colgroup>
              {/* # and Action are sized for their content (three 2rem buttons); the data columns share the rest,
                  so the buttons never wrap or push the table wider than the panel on a small screen. */}
              <col style={{ width: '2rem' }} />
              {headers.map((_, i) => (
                <col key={i} style={{ width: `calc((100% - 9.75rem) * ${(shares[i] ?? 0) / sharesTotal})` }} />
              ))}
              <col style={{ width: '7.75rem' }} />
            </colgroup>
            <thead>
              <tr>
                <th className={cn(th, 'w-8 px-1 text-center')}>#</th>
                {headers.map((header, i) => (
                  <th key={i} className={cn(th, 'relative')}>
                    {header}
                    {i < headers.length - 1 ? (
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${header} column (double-click to reset)`}
                        title="Drag to Resize the Column · Double-Click to Reset"
                        className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-amber-400/60"
                        onPointerDown={(e) => startColumnResize(i, e)}
                        onDoubleClick={() => persistShares(null)}
                      />
                    ) : null}
                  </th>
                ))}
                <th className={cn(th, 'w-[1%] whitespace-nowrap text-center')}>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-[#fffcf7]">
                <td className={cn(td, 'px-1 text-center text-stone-400')}>+</td>
                {headers.map((header, i) => (
                  <td key={i} data-label={headers.length > 1 ? header : undefined} className={cn(td, 'p-1')}>
                    <AutoGrowInput
                      aria-label={`New scope ${header}`}
                      value={newDraft[i] ?? ''}
                      disabled={!projectId}
                      placeholder={i === 0 ? 'Enter Scope / Varieties' : header}
                      onChange={(next) => setNewDraft((prev) => headers.map((_, k) => (k === i ? next : prev[k] ?? '')))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void addRow()
                        }
                      }}
                    />
                  </td>
                ))}
                <td className={cn(td, 'rc-actions whitespace-nowrap text-center')}>
                  <div className="flex flex-nowrap items-center justify-center gap-1">
                    <button type="button" className={cn(iconBtn, 'border-stone-400 text-amber-800')} disabled={!projectId} title="Add Row" aria-label="Add Scope Row" onClick={() => void addRow()}>
                      <Plus size={15} aria-hidden />
                    </button>
                    {attachButton('draft')}
                    <button type="button" className={cn(iconBtn, 'border-red-300 text-red-700')} title="Clear the New Row (and Its Attachments)" aria-label="Clear New Scope Row" onClick={() => void clearNewRow()}>
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
              {scopeRows.length === 0 ? (
                <tr>
                  <td colSpan={headers.length + 2} className={cn(td, 'py-3 text-center text-stone-500')}>
                    No scope rows yet — add the first one above.
                  </td>
                </tr>
              ) : (
                scopeRows.map((row, index) => {
                  const editing = editingIndex === index
                  return (
                    <tr
                      key={index}
                      className={index % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}
                      title={editing || !projectId ? undefined : 'Double-Click to Edit'}
                      onDoubleClick={() => {
                        if (editing || !projectId) return
                        setEditingIndex(index)
                        setEditDraft(headers.map((_, i) => row[i] ?? ''))
                      }}
                    >
                      <td className={cn(td, 'px-1 text-center')}>{index + 1}</td>
                      {headers.map((_, i) => (
                        <td key={i} data-label={headers.length > 1 ? headers[i] : undefined} className={cn(td, editing && 'p-1')}>
                          {editing ? (
                            <AutoGrowInput
                              aria-label={`Scope row ${index + 1} ${headers[i] ?? ''}`}
                              className="bg-white"
                              value={editDraft[i] ?? ''}
                              onChange={(next) => setEditDraft((prev) => headers.map((__, k) => (k === i ? next : prev[k] ?? '')))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  saveEdit()
                                }
                                if (e.key === 'Escape') setEditingIndex(null)
                              }}
                            />
                          ) : (
                            row[i] ?? ''
                          )}
                        </td>
                      ))}
                      <td className={cn(td, 'rc-actions whitespace-nowrap text-center')}>
                        <div className="flex flex-nowrap items-center justify-center gap-1">
                          {editing ? (
                            <button type="button" className={cn(iconBtn, 'border-emerald-600 text-emerald-800')} title="Save Row" aria-label={`Save scope row ${index + 1}`} onClick={saveEdit}>
                              <Check size={15} aria-hidden />
                            </button>
                          ) : null}
                          <button type="button" className={cn(iconBtn, 'border-red-300 text-red-700')} disabled={!projectId} title="Delete Row" aria-label={`Delete scope row ${index + 1}`} onClick={() => void deleteRow(index)}>
                            {editing ? <X size={14} aria-hidden /> : <Trash2 size={14} aria-hidden />}
                          </button>
                          {attachButton(index)}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>,
      )}
      {viewer}
      {confirmDialog}
      <BisModuleImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        targetRow={projectRow ?? null}
        kind={null}
        title="Scope / Varieties"
        onPickSource={importScope}
      />
      <Dialog open={columnOpen} onOpenChange={setColumnOpen}>
        <DialogContent persistOnFocusLoss layer="stacked" aria-describedby={undefined} className={cn(limsManageDialogClass, 'max-w-sm bg-white')}>
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">Add Columns</DialogTitle>
            </DialogHeader>
          </div>
          <div className={cn(limsRegistryFormClass, 'space-y-3 px-4 py-4')}>
            <div className="space-y-2">
              <Label htmlFor="varieties-column-count">Number of Columns</Label>
              <Select value={columnDraft} onValueChange={setColumnDraft}>
                <SelectTrigger id="varieties-column-count" className="h-9 rounded-none text-sm font-medium">
                  <SelectValue placeholder="Select Columns" />
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
              <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={() => setColumnOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className={limsPrimaryBtnClass} onClick={() => void applyColumns()}>
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={filesTarget != null} onOpenChange={(open) => !open && setFilesTarget(null)}>
        <DialogContent persistOnFocusLoss layer="stacked" aria-describedby={undefined} className={cn(limsManageDialogClass, 'max-w-lg bg-white')}>
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                {filesTarget === 'draft' || filesTarget == null ? 'Scope files — new row' : `Scope files — row ${filesTarget + 1}`}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className={cn(limsRegistryFormClass, 'space-y-3 px-4 py-4')}>
            <ul className="max-h-56 divide-y divide-[#e7e0d4] overflow-y-auto border border-[#e7e0d4] bg-[#fffcf7]">
              {filesTarget == null || filesOf(filesTarget).length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-stone-500">No Files Attached to This Row Yet.</li>
              ) : (
                filesOf(filesTarget).map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate" title={f.file_name}>
                      <span className="mr-2 inline-block rounded-none bg-stone-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                        {typeOf(f)}
                      </span>
                      {stripKey(f.file_name).replace(`${typeOf(f)} - `, '')}
                    </span>
                    <span className="inline-flex shrink-0 gap-1">
                      <button type="button" className={cn(iconBtn, 'h-7 w-7 border-stone-400 text-amber-800')} title="View" aria-label="View File" onClick={() => viewFile(f.viewUrl, f.file_name, f.error || 'File is unavailable.')}>
                        <Eye size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={cn(iconBtn, 'h-7 w-7 border-red-300 text-red-700')}
                        title="Delete"
                        aria-label="Delete File"
                        disabled={busy}
                        onClick={async () => {
                          if (await confirmAction(`Delete ${f.file_name}?`, { title: 'Delete file' })) void removeFile(f)
                        }}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </span>
                  </li>
                ))
              )}
            </ul>
            <div className="flex items-center gap-2">
              <Select value={fileType} onValueChange={(v) => setFileType(v as (typeof FILE_TYPES)[number])}>
                <SelectTrigger className="h-9 flex-1 rounded-none text-sm font-medium" aria-label="Type of File">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-sm">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" className={cn(limsPrimaryBtnClass, 'h-9')} disabled={busy} onClick={() => fileRef.current?.click()}>
                <Upload size={14} className="mr-1.5" aria-hidden /> {busy ? 'Uploading…' : 'Upload File'}
              </Button>
            </div>
            <div className="flex justify-end pt-1">
              <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={() => setFilesTarget(null)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
