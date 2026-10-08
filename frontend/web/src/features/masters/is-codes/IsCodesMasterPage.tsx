import { useEffect, useMemo, useRef, useState } from 'react'
import { limsDarkBarGlowStyle, limsDialogClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IsCodesHeaderBar } from './IsCodesHeaderBar'
import { IsCodesForm } from './IsCodesForm'
import { IsCodesTable, type IsCodeSortDir, type IsCodeSortKey } from './IsCodesTable'
import { IsCodesTableFooterBar } from './IsCodesFooterBar'
import { IsCodesFilesDialog, type IsCodeViewFile } from './IsCodesFilesDialog'
import { buildIsCodesListAssistantContext, formatIsCodeLabel } from './buildIsCodeAssistantContext'
import {
  emptyIsCodeForm,
  moneyOrZero,
  moneyToFormStr,
  normalizeText,
  reaffirmationToFormStr,
  toProperTitleCase,
  yearIntFromForm,
  type IsCodeFileRow,
  type IsCodeForm,
  type IsCodeRow,
  DEFAULT_IS_CODE_UNIT,
  DEFAULT_SLAB_1_QTY,
  DEFAULT_SLAB_2_QTY,
  DEFAULT_SLAB_3_QTY,
} from './types'

const BUCKET = 'is-code-files'
/** Must stay within storage.buckets.file_size_limit for is-code-files. */
const IS_CODE_MAX_FILE_BYTES = 50 * 1024 * 1024
const IS_CODE_ALLOWED_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'])

function isCodeFileContentType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    default:
      return 'application/pdf'
  }
}

function assertIsCodeUploadable(file: File): void {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!IS_CODE_ALLOWED_EXT.has(ext)) {
    throw new Error(
      `Unsupported file type ".${ext || '?'}". Allowed: PDF, PNG, JPG, DOC, DOCX.`,
    )
  }
  if (file.size > IS_CODE_MAX_FILE_BYTES) {
    throw new Error(
      `File "${file.name}" is too large (${Math.ceil(file.size / (1024 * 1024))} MB). Max 50 MB.`,
    )
  }
}

const formatSupabaseError = (err: unknown) => {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  const esc = (v: string) => {
    const s = String(v ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const lines = [headers.map(esc).join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h] ?? '')).join(','))
  }
  return lines.join('\n')
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const flushCell = () => {
    row.push(cell)
    cell = ''
  }
  const flushRow = () => {
    flushCell()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1]
        if (next === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }

    if (ch === ',') {
      flushCell()
      continue
    }

    if (ch === '\n') {
      flushRow()
      continue
    }

    if (ch === '\r') continue

    cell += ch
  }

  if (cell.length > 0 || row.length > 0) flushRow()

  return rows.map((r) => r.map((c) => c.trim()))
}

function rowToIsCodeForm(row: IsCodeRow): IsCodeForm {
  const title = (row.title || (row as { is_code_title?: string | null }).is_code_title || '').trim()
  const aspect = (row.aspect || (row as { aspect_of_is?: string | null }).aspect_of_is || 'Specification').trim()
  return {
    isNumber: row.is_number,
    revisionYear: row.revision_year == null ? '' : String(row.revision_year),
    reaffirmationYear: reaffirmationToFormStr(row.reaffirmation_year),
    amendmentNumber: row.amendment_number ?? '',
    title,
    aspect,
    testingCharges: moneyToFormStr(row.testing_charges),
    remarks: row.remarks ?? '',
    productManualNumber: row.product_manual_number ?? '',
    unitOfIs: row.unit_of_is?.trim() || DEFAULT_IS_CODE_UNIT,
    mmfLargeScale: moneyToFormStr(row.mmf_large_scale),
    mmfMediumScale: moneyToFormStr(row.mmf_medium_scale),
    mmfSmallScale: moneyToFormStr(row.mmf_small_scale),
    mmfMicroScale: moneyToFormStr(row.mmf_micro_scale),
    slab1Quantity: row.slab_1_quantity?.trim() || DEFAULT_SLAB_1_QTY,
    slab1Rate: moneyToFormStr(row.slab_1_rate),
    slab2Quantity: row.slab_2_quantity?.trim() || DEFAULT_SLAB_2_QTY,
    slab2Rate: moneyToFormStr(row.slab_2_rate),
    slab3Quantity: row.slab_3_quantity?.trim() || DEFAULT_SLAB_3_QTY,
    slab3Rate: moneyToFormStr(row.slab_3_rate),
    files: [],
  }
}

export default function IsCodesMasterPage() {
  const { editId, viewId, setEdit, setView } = useMasterUiSearchState()
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const importInputRef = useRef<HTMLInputElement | null>(null)
  const filesDialogFileInputBusy = useRef(false)
  const hydratedEditRef = useRef<string | null>(null)
  const hydratedViewRef = useRef<string | null>(null)

  const showForm = editId != null
  const editingId = editId && editId !== 'new' ? editId : null
  const handleFormOpenChange = useFormDialogOpenChange((open) => {
    if (!open) {
      hydratedEditRef.current = null
      setEdit(null)
    }
  })
  const [filesDialogTitle, setFilesDialogTitle] = useState('IS Code')
  const [filesDialogFiles, setFilesDialogFiles] = useState<IsCodeViewFile[]>([])
  const [filesDialogLoading, setFilesDialogLoading] = useState(false)
  const [filesDialogStatus, setFilesDialogStatus] = useState<string | null>(null)
  const [formSavedFiles, setFormSavedFiles] = useState<IsCodeViewFile[]>([])
  const [formFilesLoading, setFormFilesLoading] = useState(false)
  const [formFilesStatus, setFormFilesStatus] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [rows, setRows] = useState<IsCodeRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [idsWithFiles, setIdsWithFiles] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [sortKey, setSortKey] = useState<IsCodeSortKey>('isDetails')
  const [sortDir, setSortDir] = useState<IsCodeSortDir>('asc')

  const [form, setForm] = useState<IsCodeForm>(() => emptyIsCodeForm())

  const [aspects, setAspects] = useState<Array<{ id: string; label: string }>>([
    { id: 'default-spec', label: 'Specification' },
  ])
  const [aspectDialogOpen, setAspectDialogOpen] = useState(false)
  const [newAspect, setNewAspect] = useState('')

  const loadAspects = async () => {
    try {
      const { data, error } = await supabase
        .from('is_code_master_options')
        .select('id, label')
        .eq('category', 'aspect')
        .order('label', { ascending: true })
      if (error) throw error
      const db = (Array.isArray(data) ? data : []) as Array<{ id: string; label: string }>
      const merged = [{ id: 'default-spec', label: 'Specification' }, ...db]
      const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
      setAspects(Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label)))
    } catch {
      setAspects([{ id: 'default-spec', label: 'Specification' }])
    }
  }

  const loadFilePresence = async () => {
    try {
      const { data, error } = await supabase.from('is_code_files').select('is_code_id')
      if (error) throw error
      const next = new Set<string>()
      for (const row of Array.isArray(data) ? data : []) {
        const id = typeof row?.is_code_id === 'string' ? row.is_code_id : ''
        if (id) next.add(id)
      }
      setIdsWithFiles(next)
    } catch {
      // keep previous presence map on failure
    }
  }

  const setFilePresenceFor = (isCodeId: string, hasFiles: boolean) => {
    setIdsWithFiles((prev) => {
      const next = new Set(prev)
      if (hasFiles) next.add(isCodeId)
      else next.delete(isCodeId)
      return next
    })
  }

  const loadIsCodes = async () => {
    setListLoading(true)
    setListError(null)
    try {
      const { data, error } = await supabase.from('is_codes').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setRows((Array.isArray(data) ? (data as IsCodeRow[]) : []).map((r) => ({
        ...r,
        is_number: r.is_number ?? '',
        title: r.title ?? '',
        aspect: (r.aspect ?? 'Specification') as IsCodeRow['aspect'],
      })))
      await loadFilePresence()
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load IS codes')
    } finally {
      setListLoading(false)
    }
  }

  const loadFormSavedFiles = async (row: IsCodeRow) => {
    setFormFilesLoading(true)
    setFormFilesStatus(null)
    try {
      const files = await buildPopupFilesForIsCode(row)
      setFormSavedFiles(files)
      setFilePresenceFor(row.id, files.length > 0)
    } catch (err) {
      setFormSavedFiles([])
      setFormFilesStatus(formatSupabaseError(err))
    } finally {
      setFormFilesLoading(false)
    }
  }

  const loadFiles = async (isCodeId: string) => {
    const row = rows.find((r) => r.id === isCodeId)
    if (row) {
      await loadFormSavedFiles(row)
      return
    }
    try {
      const { error } = await supabase
        .from('is_code_files')
        .select('*')
        .eq('is_code_id', isCodeId)
        .order('created_at', { ascending: false })
      if (error) throw error
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadIsCodes()
    void loadAspects()
  }, [])

  useEffect(() => {
    if (!editId) {
      hydratedEditRef.current = null
      return
    }
    if (hydratedEditRef.current === editId) return

    if (editId === 'new') {
      setForm(emptyIsCodeForm())
      setFormSavedFiles([])
      setFormFilesStatus(null)
      hydratedEditRef.current = 'new'
      return
    }

    const fromPage = rows.find((r) => r.id === editId)
    if (fromPage) {
      setForm(rowToIsCodeForm(fromPage))
      void loadFormSavedFiles(fromPage)
      hydratedEditRef.current = editId
      return
    }

    if (!listLoading) setEdit(null)
  }, [editId, rows, listLoading, setEdit])

  useEffect(() => {
    if (!saveMessage) return
    if (/^no files to delete\.?$/i.test(saveMessage) || /^no saved files found\.?$/i.test(saveMessage)) {
      setSaveMessage(null)
    }
  }, [saveMessage])

  const deletePopupFile = async (file: { id: string; file_name: string; storage_path: string }) => {
    if (!file.storage_path) return
    const { error: stErr } = await supabase.storage.from(BUCKET).remove([file.storage_path])
    if (stErr) throw stErr
    if (file.id && !file.id.startsWith('storage:')) {
      const { error: dbErr } = await supabase.from('is_code_files').delete().eq('id', file.id)
      if (dbErr) throw dbErr
    } else {
      const { error: dbErr } = await supabase.from('is_code_files').delete().eq('storage_path', file.storage_path)
      if (dbErr) throw dbErr
    }
  }

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize, sortKey, sortDir])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = !q
      ? [...rows]
      : rows.filter((r) => {
          const blob = [
            r.is_number,
            r.revision_year == null ? '' : String(r.revision_year),
            r.reaffirmation_year == null ? '' : String(r.reaffirmation_year),
            r.amendment_number == null ? '' : String(r.amendment_number),
            r.title,
            r.aspect,
            r.product_manual_number ?? '',
            r.unit_of_is ?? '',
            String(r.testing_charges ?? ''),
            String(r.mmf_large_scale ?? ''),
            String(r.mmf_medium_scale ?? ''),
            String(r.mmf_small_scale ?? ''),
            String(r.mmf_micro_scale ?? ''),
            r.slab_1_quantity ?? '',
            String(r.slab_1_rate ?? ''),
            r.slab_2_quantity ?? '',
            String(r.slab_2_rate ?? ''),
            r.slab_3_quantity ?? '',
            String(r.slab_3_rate ?? ''),
            r.remarks ?? '',
          ]
            .join(' ')
            .toLowerCase()
          return blob.includes(q)
        })

    const dir = sortDir === 'asc' ? 1 : -1
    const cmpText = (a: string, b: string) =>
      a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }) * dir

    return list.sort((a, b) => {
      let primary = 0
      switch (sortKey) {
        case 'isDetails':
          primary = cmpText(formatIsCodeLabel(a), formatIsCodeLabel(b))
          break
        case 'title':
          primary = cmpText(
            `${a.title || ''} ${a.product_manual_number || ''}`,
            `${b.title || ''} ${b.product_manual_number || ''}`,
          )
          break
        case 'slabRate':
          primary =
            (Number(a.slab_1_rate ?? 0) - Number(b.slab_1_rate ?? 0)) * dir ||
            cmpText(a.slab_1_quantity || '', b.slab_1_quantity || '')
          break
        case 'markingFee':
          primary = (Number(a.mmf_large_scale ?? 0) - Number(b.mmf_large_scale ?? 0)) * dir
          break
        case 'aspectCharges': {
          const chargesCmp =
            (Number(a.testing_charges ?? 0) - Number(b.testing_charges ?? 0)) * dir
          primary = cmpText(a.aspect || '', b.aspect || '') || chargesCmp
          break
        }
        default:
          primary = cmpText(formatIsCodeLabel(a), formatIsCodeLabel(b))
      }
      if (primary !== 0) return primary
      return cmpText(formatIsCodeLabel(a), formatIsCodeLabel(b))
    })
  }, [rows, search, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  const assistantContext = useMemo(
    () => buildIsCodesListAssistantContext(filteredRows, search),
    [filteredRows, search],
  )

  const handleSort = (key: IsCodeSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of pagedRows) {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds])

  const canSave =
    !saveLoading &&
    normalizeText(form.isNumber).replace(/^IS\s*/i, '').length > 0 &&
    /^IS/i.test(normalizeText(form.isNumber)) &&
    normalizeText(form.title).length > 0

  const handleNew = () => {
    setSaveMessage(null)
    setForm(emptyIsCodeForm())
    setFormSavedFiles([])
    setFormFilesStatus(null)
    hydratedEditRef.current = 'new'
    setEdit('new')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleEdit = (row: IsCodeRow) => {
    setSaveMessage(null)
    setForm(rowToIsCodeForm(row))
    hydratedEditRef.current = row.id
    setEdit(row.id)
    void loadFormSavedFiles(row)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = (row: IsCodeRow) => {
    setSaveMessage(null)
    setForm({ ...rowToIsCodeForm(row), isNumber: `${row.is_number} - Copy` })
    setFormSavedFiles([])
    setFormFilesStatus(null)
    hydratedEditRef.current = 'new'
    setEdit('new')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePickFiles = (files: File[]) => {
    setForm((prev) => ({ ...prev, files }))
  }

  const handleFormAddSavedFiles = (picked: File[]) => {
    const isCodeId = editingId
    if (!isCodeId) {
      handlePickFiles([...form.files, ...picked])
      return
    }
    if (picked.length === 0 || filesDialogFileInputBusy.current) return
    filesDialogFileInputBusy.current = true
    void (async () => {
      setFormFilesStatus(`Uploading ${picked.length} file(s)…`)
      setSaveLoading(true)
      try {
        await uploadFiles(isCodeId, picked)
        const row = rows.find((r) => r.id === isCodeId)
        if (row) await loadFormSavedFiles(row)
        if (viewId === isCodeId) await refreshFilesDialog(isCodeId)
        setFormFilesStatus('File(s) uploaded.')
      } catch (err) {
        const msg = formatSupabaseError(err)
        setFormFilesStatus(msg)
        setSaveMessage(msg)
      } finally {
        setSaveLoading(false)
        filesDialogFileInputBusy.current = false
      }
    })()
  }

  const handleFormReplaceSavedFile = (existing: IsCodeViewFile, next: File) => {
    const isCodeId = editingId
    if (!isCodeId || filesDialogFileInputBusy.current) return
    filesDialogFileInputBusy.current = true
    void (async () => {
      setFormFilesStatus(`Replacing ${existing.file_name}…`)
      setSaveLoading(true)
      try {
        await uploadFiles(isCodeId, [next])
        try {
          await deletePopupFile(existing)
        } catch {
          // keep new file
        }
        const row = rows.find((r) => r.id === isCodeId)
        if (row) await loadFormSavedFiles(row)
        if (viewId === isCodeId) await refreshFilesDialog(isCodeId)
        setFormFilesStatus('File replaced.')
      } catch (err) {
        const msg = formatSupabaseError(err)
        setFormFilesStatus(msg)
        setSaveMessage(msg)
      } finally {
        setSaveLoading(false)
        filesDialogFileInputBusy.current = false
      }
    })()
  }

  const handleFormDeleteSavedFile = (file: IsCodeViewFile) => {
    const isCodeId = editingId
    if (!file.storage_path) return
    const ok = window.confirm(`Delete file ${file.file_name}?`)
    if (!ok) return
    void (async () => {
      setSaveLoading(true)
      setFormFilesStatus(null)
      try {
        await deletePopupFile(file)
        if (isCodeId) {
          const row = rows.find((r) => r.id === isCodeId)
          if (row) await loadFormSavedFiles(row)
          if (viewId === isCodeId) await refreshFilesDialog(isCodeId)
        }
        setFormFilesStatus('File deleted.')
      } catch (err) {
        const msg = formatSupabaseError(err)
        setFormFilesStatus(msg)
        setSaveMessage(msg)
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleDeleteFiles = () => {
    void (async () => {
      const hasPending = form.files.length > 0
      const isCodeId = editingId

      if (!hasPending && !isCodeId) return

      const ok = window.confirm(
        isCodeId
          ? 'Delete all files for this IS Code? Pending uploads will also be cleared.'
          : 'Clear selected files for upload?',
      )
      if (!ok) return

      setForm((prev) => ({ ...prev, files: [] }))

      if (!isCodeId) return

      try {
        const { data, error } = await supabase
          .from('is_code_files')
          .select('id, file_name, storage_path')
          .eq('is_code_id', isCodeId)
        if (error) throw error

        const fileRows = (Array.isArray(data) ? data : []) as Array<{
          id: string
          file_name: string
          storage_path: string
        }>
        for (const file of fileRows) {
          await deletePopupFile(file)
        }

        if (viewId === isCodeId) {
          setFilesDialogFiles([])
          setFilesDialogStatus('All files deleted.')
        }
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      }
    })()
  }

  const handleAddAspect = () => {
    const name = normalizeText(newAspect)
    if (!name) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('is_code_master_options')
          .insert({ category: 'aspect', label: name, value: name })
          .select('id')
          .single()
        if (error) throw error
        const id = (data as { id: string } | null)?.id ?? `tmp-${name}`
        setAspects((prev) => {
          const merged = [...prev, { id, label: name }]
          const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
        })
        setForm((prev) => ({ ...prev, aspect: name }))
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setNewAspect('')
        setAspectDialogOpen(false)
      }
    })()
  }

  const handleUpdateAspect = (id: string) => {
    const name = normalizeText(newAspect)
    if (!name || !id) return
    void (async () => {
      try {
        const oldLabel = aspects.find((x) => x.id === id)?.label ?? ''
        if (!id.startsWith('default-')) {
          const { error } = await supabase
            .from('is_code_master_options')
            .update({ label: name, value: name })
            .eq('id', id)
          if (error) throw error
        }

        setAspects((prev) =>
          [...prev.map((x) => (x.id === id ? { ...x, label: name } : x))].sort((a, b) =>
            a.label.localeCompare(b.label),
          ),
        )

        if (oldLabel && oldLabel !== name) {
          const { error: isCodeErr } = await supabase
            .from('is_codes')
            .update({ aspect: name })
            .eq('aspect', oldLabel)
          if (isCodeErr) throw isCodeErr
          setRows((prev) => prev.map((r) => (r.aspect === oldLabel ? { ...r, aspect: name } : r)))
          setForm((prev) => (prev.aspect === oldLabel ? { ...prev, aspect: name } : prev))
        } else {
          setForm((prev) => ({ ...prev, aspect: name }))
        }
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setNewAspect('')
        setAspectDialogOpen(false)
      }
    })()
  }

  const handleDeleteAspect = (id: string) => {
    void (async () => {
      try {
        if (!id || id.startsWith('default-')) return
        const { error } = await supabase.from('is_code_master_options').delete().eq('id', id)
        if (error) throw error
        setAspects((prev) => prev.filter((x) => x.id !== id))
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      }
    })()
  }

  const uploadFiles = async (isCodeId: string, files: File[]) => {
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr) throw sessionErr
    if (!sessionData.session?.access_token) {
      throw new Error('Your session expired. Please sign in again, then retry the file upload.')
    }

    for (const file of files) {
      assertIsCodeUploadable(file)
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${isCodeId}/${crypto.randomUUID()}_${safeName}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: false,
        contentType: isCodeFileContentType(file),
      })
      if (upErr) {
        const msg = upErr.message || 'Upload failed'
        if (/failed to fetch/i.test(msg)) {
          throw new Error(
            'File upload blocked by network/CORS. Refresh the page and try again. If it persists, the API gateway may still be redeploying.',
          )
        }
        throw upErr
      }

      const { error: metaErr } = await supabase.from('is_code_files').insert({
        is_code_id: isCodeId,
        file_name: file.name,
        storage_path: path,
      })
      if (metaErr) throw metaErr
    }
  }

  const getSignedUrl = async (
    storagePath: string,
    opts?: { download?: string | boolean },
  ): Promise<string | undefined> => {
    const buckets = [BUCKET, 'is_code_documents', 'documents'] as const
    for (const bucket of buckets) {
      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(
            storagePath,
            60 * 10,
            opts?.download != null ? { download: opts.download } : undefined,
          )
        if (!error && data?.signedUrl) return data.signedUrl
      } catch {
        // try next bucket
      }
      try {
        const { data: blob, error: dlErr } = await supabase.storage
          .from(bucket)
          .download(storagePath)
        if (!dlErr && blob) return URL.createObjectURL(blob)
      } catch {
        // try next bucket
      }
    }
    return undefined
  }

  type PopupFile = IsCodeViewFile

  const buildPopupFilesForIsCode = async (row: IsCodeRow): Promise<IsCodeViewFile[]> => {
    const { data, error } = await supabase
      .from('is_code_files')
      .select('*')
      .eq('is_code_id', row.id)
      .order('created_at', { ascending: false })
    if (error) throw error

    const dbList = (Array.isArray(data) ? (data as IsCodeFileRow[]) : [])
    if (dbList.length > 0) {
      const withUrls: PopupFile[] = []
      for (const f of dbList) {
        const [viewUrl, downloadUrl] = await Promise.all([
          getSignedUrl(f.storage_path),
          getSignedUrl(f.storage_path, { download: f.file_name || true }),
        ])
        withUrls.push({
          id: f.id,
          file_name: f.file_name,
          storage_path: f.storage_path,
          ...(viewUrl
            ? { viewUrl, url: viewUrl }
            : { error: 'Signed URL blocked by storage policy' }),
          ...(downloadUrl ? { downloadUrl } : {}),
        })
      }
      return withUrls
    }

    const { data: objects, error: listErr } = await supabase.storage.from(BUCKET).list(row.id, {
      limit: 100,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (listErr) throw listErr
    const objList = Array.isArray(objects) ? objects : []
    const fromStorage: PopupFile[] = []
    for (const obj of objList) {
      const name = (obj as { name?: string })?.name
      if (!name) continue
      const storagePath = `${row.id}/${name}`
      const [viewUrl, downloadUrl] = await Promise.all([
        getSignedUrl(storagePath),
        getSignedUrl(storagePath, { download: name }),
      ])
      fromStorage.push({
        id: `storage:${storagePath}`,
        file_name: name,
        storage_path: storagePath,
        ...(viewUrl
          ? { viewUrl, url: viewUrl }
          : { error: 'Signed URL blocked by storage policy' }),
        ...(downloadUrl ? { downloadUrl } : {}),
      })
    }
    return fromStorage
  }

  const formatIsCodeDisplay = (row: Pick<IsCodeRow, 'is_number' | 'revision_year'>) =>
    formatIsCodeLabel(row)

  const refreshFilesDialog = async (isCodeId: string) => {
    if (viewId !== isCodeId) return
    const row =
      rows.find((r) => r.id === isCodeId) ??
      ({
        id: isCodeId,
        is_number: filesDialogTitle,
        revision_year: null,
        title: '',
        aspect: 'Specification' as IsCodeRow['aspect'],
      } satisfies IsCodeRow)
    try {
      const files = await buildPopupFilesForIsCode(row)
      setFilesDialogFiles(files)
      setFilesDialogTitle(formatIsCodeDisplay(row))
      setFilePresenceFor(row.id, files.length > 0)
    } catch {
      // keep dialog list as-is on refresh failure
    }
  }

  const loadFilesDialogContent = async (row: IsCodeRow) => {
    setSaveMessage(null)
    setFilesDialogStatus(null)
    setFilesDialogTitle(formatIsCodeDisplay(row))
    setFilesDialogFiles([])
    setFilesDialogLoading(true)

    try {
      const files = await buildPopupFilesForIsCode(row)
      setFilesDialogFiles(files)
      setFilesDialogTitle(formatIsCodeDisplay(row))
      setFilePresenceFor(row.id, files.length > 0)
    } catch (err) {
      const msg = formatSupabaseError(err)
      setFilesDialogFiles([
        { id: 'err', file_name: 'Unable to load files', storage_path: '', error: msg },
      ])
      setFilesDialogStatus(msg)
      setSaveMessage(msg)
    } finally {
      setFilesDialogLoading(false)
    }
  }

  const openFilesDialog = async (row: IsCodeRow) => {
    hydratedViewRef.current = row.id
    setView(row.id)
    await loadFilesDialogContent(row)
  }

  useEffect(() => {
    if (!viewId) {
      hydratedViewRef.current = null
      setFilesDialogFiles([])
      setFilesDialogLoading(false)
      setFilesDialogStatus(null)
      return
    }
    if (hydratedViewRef.current === viewId) return

    const fromPage = rows.find((r) => r.id === viewId)
    if (fromPage) {
      hydratedViewRef.current = viewId
      void loadFilesDialogContent(fromPage)
      return
    }

    if (!listLoading) setView(null)
  }, [viewId, rows, listLoading, setView])

  const handleFilesDialogAdd = (picked: File[]) => {
    const isCodeId = viewId
    if (!isCodeId || picked.length === 0 || filesDialogFileInputBusy.current) return
    filesDialogFileInputBusy.current = true
    void (async () => {
      setFilesDialogStatus(`Uploading ${picked.length} file(s)…`)
      setSaveLoading(true)
      try {
        await uploadFiles(isCodeId, picked)
        await refreshFilesDialog(isCodeId)
        if (editingId === isCodeId) await loadFiles(isCodeId)
        setFilesDialogStatus('File(s) uploaded.')
      } catch (err) {
        const msg = formatSupabaseError(err)
        setFilesDialogStatus(msg)
        setSaveMessage(msg)
      } finally {
        setSaveLoading(false)
        filesDialogFileInputBusy.current = false
      }
    })()
  }

  const handleFilesDialogReplace = (existing: IsCodeViewFile, next: File) => {
    const isCodeId = viewId
    if (!isCodeId || filesDialogFileInputBusy.current) return
    filesDialogFileInputBusy.current = true
    void (async () => {
      setFilesDialogStatus(`Replacing ${existing.file_name}…`)
      setSaveLoading(true)
      try {
        await uploadFiles(isCodeId, [next])
        try {
          await deletePopupFile(existing)
        } catch {
          // Keep new file even if old delete fails.
        }
        await refreshFilesDialog(isCodeId)
        if (editingId === isCodeId) await loadFiles(isCodeId)
        setFilesDialogStatus('File replaced.')
      } catch (err) {
        const msg = formatSupabaseError(err)
        setFilesDialogStatus(msg)
        setSaveMessage(msg)
      } finally {
        setSaveLoading(false)
        filesDialogFileInputBusy.current = false
      }
    })()
  }

  const handleFilesDialogDelete = (file: IsCodeViewFile) => {
    const isCodeId = viewId
    if (!file.storage_path) return
    const ok = window.confirm(`Delete file ${file.file_name}?`)
    if (!ok) return
    void (async () => {
      setSaveLoading(true)
      setFilesDialogStatus(null)
      try {
        await deletePopupFile(file)
        if (isCodeId) {
          await refreshFilesDialog(isCodeId)
          if (editingId === isCodeId) await loadFiles(isCodeId)
        }
        setFilesDialogStatus('File deleted.')
      } catch (err) {
        const msg = formatSupabaseError(err)
        setFilesDialogStatus(msg)
        setSaveMessage(msg)
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleSave = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        // Merge defaults so HMR / older in-memory form shapes never send undefined keys.
        const f: IsCodeForm = { ...emptyIsCodeForm(), ...form }
        const revisionYear = yearIntFromForm(f.revisionYear)
        const isNumberRaw = normalizeText(f.isNumber)
        const isNumberRest = isNumberRaw.replace(/^IS\s*/i, '').trim()
        if (!isNumberRaw || !isNumberRest) throw new Error('IS Number is required.')
        if (!/^IS/i.test(isNumberRaw)) {
          throw new Error('IS Number must start with IS (e.g. IS 1234).')
        }
        const isNumber = `IS ${isNumberRest}`
        if (revisionYear == null) throw new Error('Revision Year is required (YYYY).')
        if (!normalizeText(f.title)) throw new Error('Title of the IS Code is required.')

        const title = toProperTitleCase(normalizeText(f.title))
        const aspect = normalizeText(f.aspect) || 'Specification'
        // QE DB: revision/reaffirmation are int; fee columns are NOT NULL numeric.
        // "RA-" alone → null; "RA-2026" → 2026. Never send the literal "RA-".
        const basePayload = {
          is_number: isNumber,
          revision_year: revisionYear,
          reaffirmation_year: yearIntFromForm(f.reaffirmationYear),
          amendment_number: normalizeText(f.amendmentNumber) || null,
          title,
          is_code_title: title,
          aspect,
          aspect_of_is: aspect,
          testing_charges: moneyOrZero(f.testingCharges),
          remarks: normalizeText(f.remarks) || null,
          product_manual_number: normalizeText(f.productManualNumber) || null,
          unit_of_is: normalizeText(f.unitOfIs) || DEFAULT_IS_CODE_UNIT,
          mmf_large_scale: moneyOrZero(f.mmfLargeScale),
          mmf_medium_scale: moneyOrZero(f.mmfMediumScale),
          mmf_small_scale: moneyOrZero(f.mmfSmallScale),
          mmf_micro_scale: moneyOrZero(f.mmfMicroScale),
          slab_1_quantity: normalizeText(f.slab1Quantity) || DEFAULT_SLAB_1_QTY,
          slab_1_rate: moneyOrZero(f.slab1Rate),
          slab_2_quantity: normalizeText(f.slab2Quantity) || DEFAULT_SLAB_2_QTY,
          slab_2_rate: moneyOrZero(f.slab2Rate),
          slab_3_quantity: normalizeText(f.slab3Quantity) || DEFAULT_SLAB_3_QTY,
          slab_3_rate: moneyOrZero(f.slab3Rate),
          updated_at: new Date().toISOString(),
        }

        // Prefer insert/update over upsert — avoids 42P10 when the unique index
        // on (is_number, revision_year) is missing or not visible to PostgREST.
        const { data, error } = editingId
          ? await supabase
              .from('is_codes')
              .update(basePayload)
              .eq('id', editingId)
              .select('id')
              .single()
          : await supabase.from('is_codes').insert(basePayload).select('id').single()
        if (error) {
          if (editingId && error.code === 'PGRST116') {
            throw new Error('You do not have edit access for this record (view-only).')
          }
          throw error
        }

        const id = (data as { id: string } | null)?.id ?? editingId
        if (!id) throw new Error('Unable to determine record id')

        if (f.files.length > 0) {
          try {
            await uploadFiles(id, f.files)
          } catch (err) {
            const msg = formatSupabaseError(err)
            const extra = msg.toLowerCase().includes('bucket') ? `\n\nCreate Supabase Storage bucket: ${BUCKET}` : ''
            setSaveMessage(`Saved record, but file upload failed: ${msg}${extra}`)
            hydratedEditRef.current = id
            setEdit(id)
            await loadIsCodes()
            await loadFiles(id)
            return
          }
        }

        setSaveMessage('Saved successfully.')
        setForm(emptyIsCodeForm())
        hydratedEditRef.current = null
        setEdit(null)
        await loadIsCodes()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) return
      const ok = window.confirm(`Delete ${selectedRows.length} selected IS code(s)?`)
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { data: deletedRows, error: dbErr } = await supabase
          .from('is_codes')
          .delete()
          .in('id', ids)
          .select('id')
        if (dbErr) throw dbErr
        const deletedIds = (Array.isArray(deletedRows) ? deletedRows : []).map((row) => String(row.id))
        if (deletedIds.length === 0) {
          setSaveMessage('Delete not allowed — only Laboratory Director/Admin can delete.')
          return
        }
        const { data: fileRows, error: fileErr } = await supabase
          .from('is_code_files')
          .select('storage_path')
          .in('is_code_id', deletedIds)
        if (fileErr) throw fileErr
        const paths = (Array.isArray(fileRows) ? fileRows : [])
          .map((x: { storage_path?: string | null }) => x.storage_path)
          .filter((path): path is string => typeof path === 'string' && path.length > 0)
        if (paths.length > 0) {
          const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths)
          if (rmErr) throw rmErr
        }
        const { error: dbFileErr } = await supabase.from('is_code_files').delete().in('is_code_id', deletedIds)
        if (dbFileErr) throw dbFileErr

        setSelectedIds(new Set())
        setSaveMessage(
          deletedIds.length < ids.length ? `Deleted ${deletedIds.length} of ${ids.length}.` : 'Deleted.',
        )
        await loadIsCodes()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleExport = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    const headers = [
      'id',
      'is_number',
      'revision_year',
      'reaffirmation_year',
      'amendment_number',
      'title',
      'aspect',
      'product_manual_number',
      'unit_of_is',
      'testing_charges',
      'mmf_large_scale',
      'mmf_medium_scale',
      'mmf_small_scale',
      'mmf_micro_scale',
      'slab_1_quantity',
      'slab_1_rate',
      'slab_2_quantity',
      'slab_2_rate',
      'slab_3_quantity',
      'slab_3_rate',
      'remarks',
      'created_at',
    ]
    const lines = exportRows.map((r) => ({
      id: r.id,
      is_number: r.is_number,
      revision_year: r.revision_year == null ? '' : String(r.revision_year),
      reaffirmation_year: r.reaffirmation_year == null ? '' : String(r.reaffirmation_year),
      amendment_number: r.amendment_number == null ? '' : String(r.amendment_number),
      title: r.title,
      aspect: r.aspect,
      product_manual_number: r.product_manual_number ?? '',
      unit_of_is: r.unit_of_is ?? '',
      testing_charges: String(r.testing_charges ?? ''),
      mmf_large_scale: String(r.mmf_large_scale ?? ''),
      mmf_medium_scale: String(r.mmf_medium_scale ?? ''),
      mmf_small_scale: String(r.mmf_small_scale ?? ''),
      mmf_micro_scale: String(r.mmf_micro_scale ?? ''),
      slab_1_quantity: r.slab_1_quantity ?? '',
      slab_1_rate: String(r.slab_1_rate ?? ''),
      slab_2_quantity: r.slab_2_quantity ?? '',
      slab_2_rate: String(r.slab_2_rate ?? ''),
      slab_3_quantity: r.slab_3_quantity ?? '',
      slab_3_rate: String(r.slab_3_rate ?? ''),
      remarks: r.remarks ?? '',
      created_at: r.created_at ?? '',
    }))
    const csv = toCsv(headers, lines)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'is_codes.csv'
    a.click()
    URL.revokeObjectURL(url)
    setSaveMessage('Exported.')
  }

  const handleImport = () => {
    setSaveMessage(null)
    importInputRef.current?.click()
  }

  const handleImportFile = (file: File) => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const text = await file.text()
        const records = parseCsv(text)
        if (records.length === 0) {
          setSaveMessage('No rows found in CSV.')
          return
        }
        const header = records[0].map((h) => h.trim())
        const rowsData = records.slice(1).filter((r) => r.some((c) => String(c ?? '').trim().length > 0))

        const payloads = rowsData.map((cells) => {
          const get = (key: string) => {
            const idx = header.indexOf(key)
            return idx >= 0 ? (cells[idx] ?? '') : ''
          }
          const title = toProperTitleCase(normalizeText(get('title') || get('is_code_title')))
          const aspect = (normalizeText(get('aspect') || get('aspect_of_is')) ||
            'Specification') as IsCodeRow['aspect']
          return {
            is_number: normalizeText(get('is_number')),
            revision_year: yearIntFromForm(get('revision_year')),
            reaffirmation_year: yearIntFromForm(get('reaffirmation_year')),
            amendment_number: normalizeText(get('amendment_number')) || null,
            title,
            is_code_title: title,
            aspect,
            aspect_of_is: aspect,
            product_manual_number: normalizeText(get('product_manual_number')) || null,
            unit_of_is: normalizeText(get('unit_of_is')) || DEFAULT_IS_CODE_UNIT,
            testing_charges: moneyOrZero(get('testing_charges')),
            mmf_large_scale: moneyOrZero(get('mmf_large_scale')),
            mmf_medium_scale: moneyOrZero(get('mmf_medium_scale')),
            mmf_small_scale: moneyOrZero(get('mmf_small_scale')),
            mmf_micro_scale: moneyOrZero(get('mmf_micro_scale')),
            slab_1_quantity: normalizeText(get('slab_1_quantity')) || DEFAULT_SLAB_1_QTY,
            slab_1_rate: moneyOrZero(get('slab_1_rate')),
            slab_2_quantity: normalizeText(get('slab_2_quantity')) || DEFAULT_SLAB_2_QTY,
            slab_2_rate: moneyOrZero(get('slab_2_rate')),
            slab_3_quantity: normalizeText(get('slab_3_quantity')) || DEFAULT_SLAB_3_QTY,
            slab_3_rate: moneyOrZero(get('slab_3_rate')),
            remarks: normalizeText(get('remarks')) || null,
          }
        })

        const cleanPayloads = payloads.filter(
          (p) =>
            p.is_number.trim().length > 0 &&
            p.title.trim().length > 0 &&
            p.revision_year != null,
        )
        if (cleanPayloads.length === 0) {
          setSaveMessage('No valid rows found (is_number / revision_year / title missing).')
          return
        }

        // Upsert by natural key when unique index exists; otherwise insert-or-update per row.
        const { error } = await supabase
          .from('is_codes')
          .upsert(cleanPayloads, { onConflict: 'is_number,revision_year' })
        if (error) {
          // 42P10 = missing unique constraint for ON CONFLICT — fall back to insert.
          if (String(error.code) === '42P10' || /ON CONFLICT/i.test(error.message ?? '')) {
            const { error: insertErr } = await supabase.from('is_codes').insert(cleanPayloads)
            if (insertErr) throw insertErr
          } else {
            throw error
          }
        }

        setSaveMessage(`Imported ${cleanPayloads.length} record(s).`)
        await loadIsCodes()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handlePrintSelected = () => {
    if (selectedRows.length === 0) {
      setSaveMessage('Select at least one IS code to print.')
      return
    }
    const exportRows = selectedRows
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>IS Codes</title></head><body><pre>${exportRows
      .map((r) => `${formatIsCodeLabel(r)} | ${r.title}`)
      .join('\n')}</pre></body></html>`

    setSaveMessage(`Print ready: ${exportRows.length} IS code(s).`)

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)

    const cleanup = () => {
      try {
        document.body.removeChild(iframe)
      } catch {
        // ignore
      }
    }

    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) {
      cleanup()
      return
    }

    doc.open()
    doc.write(html)
    doc.close()

    iframe.onload = () => {
      try {
        win.focus()
        win.print()
      } finally {
        window.setTimeout(cleanup, 500)
      }
    }
  }

  return (
    <div
      data-master-scroll="table"
      className={cn(
        limsPageShellClass,
        'flex h-full min-h-0 flex-col overflow-hidden !space-y-0 gap-2 sm:gap-3 md:gap-3',
      )}
    >
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImportFile(f)
          if (e.target) e.target.value = ''
        }}
      />
      <div className="shrink-0">
        <IsCodesHeaderBar
          search={search}
          onSearchChange={setSearch}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          onNew={handleNew}
          onOpenBIS={() => window.open('https://standards.bis.gov.in', '_blank', 'noreferrer')}
          assistantContext={assistantContext}
          onAssistantDataChanged={() => void loadIsCodes()}
        />
      </div>

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          className={cn(
            limsDialogClass,
            'flex !h-[min(94dvh,920px)] !max-h-[min(94dvh,920px)] !flex-col gap-0 overflow-hidden',
            'w-[min(68rem,calc(100vw-1.5rem))] max-w-6xl bg-stone-100 p-0',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit IS Code' : 'Add New IS Code'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-stone-100 p-2 sm:p-3">
            {saveMessage ? (
              <p className="mb-2 shrink-0 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            ) : null}
            <IsCodesForm
              form={form}
              onChange={setForm}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={handleSave}
              onPickFiles={handlePickFiles}
              aspectOptions={aspects}
              aspectDialogOpen={aspectDialogOpen}
              setAspectDialogOpen={setAspectDialogOpen}
              newAspect={newAspect}
              setNewAspect={setNewAspect}
              onAddAspect={handleAddAspect}
              onUpdateAspect={handleUpdateAspect}
              onDeleteAspect={handleDeleteAspect}
              savedFiles={formSavedFiles}
              filesLoading={formFilesLoading}
              filesStatus={formFilesStatus}
              filesResetKey={editingId ?? editId ?? 'new'}
              onAddSavedFiles={handleFormAddSavedFiles}
              onReplaceSavedFile={handleFormReplaceSavedFile}
              onDeleteSavedFile={handleFormDeleteSavedFile}
            />
          </div>
        </DialogContent>
      </Dialog>

      <IsCodesFilesDialog
        open={viewId != null}
        onOpenChange={(open) => {
          if (!open) {
            hydratedViewRef.current = null
            setView(null)
            setFilesDialogStatus(null)
            setFilesDialogLoading(false)
          }
        }}
        title={filesDialogTitle}
        files={filesDialogFiles}
        loading={filesDialogLoading}
        status={filesDialogStatus}
        busy={saveLoading}
        onAddFiles={handleFilesDialogAdd}
        onReplaceFile={handleFilesDialogReplace}
        onDeleteFile={handleFilesDialogDelete}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <IsCodesTable
          rows={pagedRows}
          loading={listLoading}
          error={listError}
          searchActive={search.trim().length > 0}
          selectedIds={selectedIds}
          onToggle={toggleRow}
          onToggleAll={toggleAllOnPage}
          onEdit={handleEdit}
          onViewFiles={(row) => {
            void openFilesDialog(row)
          }}
          onAssistantDataChanged={() => void loadIsCodes()}
          idsWithFiles={idsWithFiles}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      </div>

      <div className="shrink-0">
        <IsCodesTableFooterBar
          message={saveMessage}
          loading={saveLoading}
          selectedCount={selectedIds.size}
          page={page}
          pageCount={pageCount}
          onImport={handleImport}
          onExport={handleExport}
          onPrintSelected={handlePrintSelected}
          onDeleteSelected={handleDeleteSelected}
          onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
          jumpTo={jumpTo}
          onJumpToChange={setJumpTo}
          onJumpToGo={() => {
            const n = Number(jumpTo)
            if (!Number.isFinite(n) || n <= 0) return
            setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
          }}
        />
      </div>
    </div>
  )
}
