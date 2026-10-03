import { useEffect, useMemo, useRef, useState } from 'react'
import { limsDarkBarGlowStyle, limsDialogClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IsCodesHeaderBar } from './IsCodesHeaderBar'
import { IsCodesForm } from './IsCodesForm'
import { IsCodesTable } from './IsCodesTable'
import { IsCodesTableFooterBar } from './IsCodesFooterBar'
import { IsCodesFilesDialog, type IsCodeViewFile } from './IsCodesFilesDialog'
import { buildIsCodesListAssistantContext, formatIsCodeLabel } from './buildIsCodeAssistantContext'
import { emptyIsCodeForm, normalizeText, toProperTitleCase, type IsCodeFileRow, type IsCodeForm, type IsCodeRow } from './types'

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

export default function IsCodesMasterPage() {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const importInputRef = useRef<HTMLInputElement | null>(null)
  const filesDialogFileInputBusy = useRef(false)

  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [showFilesDialog, setShowFilesDialog] = useState(false)
  const [filesDialogTitle, setFilesDialogTitle] = useState('IS Code')
  const [filesDialogIsCodeId, setFilesDialogIsCodeId] = useState<string | null>(null)
  const [filesDialogFiles, setFilesDialogFiles] = useState<IsCodeViewFile[]>([])
  const [filesDialogLoading, setFilesDialogLoading] = useState(false)
  const [filesDialogStatus, setFilesDialogStatus] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [rows, setRows] = useState<IsCodeRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

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
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load IS codes')
    } finally {
      setListLoading(false)
    }
  }

  const loadFiles = async (isCodeId: string) => {
    try {
      const { error } = await supabase.from('is_code_files').select('*').eq('is_code_id', isCodeId).order('created_at', { ascending: false })
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
  }, [search, pageSize])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = [
        r.is_number,
        r.revision_year ?? '',
        r.reaffirmation_year ?? '',
        r.amendment_number ?? '',
        r.title,
        r.aspect,
        String(r.testing_charges ?? ''),
        r.remarks ?? '',
      ].join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  const assistantContext = useMemo(
    () => buildIsCodesListAssistantContext(filteredRows, search),
    [filteredRows, search],
  )

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = pagedRows.length > 0 && pagedRows.every((r) => next.has(r.id))
      if (allSelected) pagedRows.forEach((r) => next.delete(r.id))
      else pagedRows.forEach((r) => next.add(r.id))
      return next
    })
  }

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds])

  const canSave = !saveLoading && normalizeText(form.isNumber).length > 0 && normalizeText(form.title).length > 0

  const handleNew = () => {
    setSaveMessage(null)
    setForm(emptyIsCodeForm())
    setEditingId(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleEdit = (row: IsCodeRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm({
      isNumber: row.is_number,
      revisionYear: row.revision_year ?? '',
      reaffirmationYear: row.reaffirmation_year ?? 'RA',
      amendmentNumber: row.amendment_number ?? '',
      title: row.title,
      aspect: row.aspect,
      testingCharges: String(row.testing_charges ?? ''),
      remarks: row.remarks ?? '',
      files: [],
    })
    setShowForm(true)
    void loadFiles(row.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = (row: IsCodeRow) => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({
      isNumber: `${row.is_number} - Copy`,
      revisionYear: row.revision_year ?? '',
      reaffirmationYear: row.reaffirmation_year ?? 'RA',
      amendmentNumber: row.amendment_number ?? '',
      title: row.title,
      aspect: row.aspect,
      testingCharges: String(row.testing_charges ?? ''),
      remarks: row.remarks ?? '',
      files: [],
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePickFiles = (files: File[]) => {
    setForm((prev) => ({ ...prev, files }))
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

        if (showFilesDialog && filesDialogIsCodeId === isCodeId) {
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
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(
          storagePath,
          60 * 10,
          opts?.download != null ? { download: opts.download } : undefined,
        )
      if (error) throw error
      return data.signedUrl
    } catch {
      return undefined
    }
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
    if (!showFilesDialog || filesDialogIsCodeId !== isCodeId) return
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
    } catch {
      // keep dialog list as-is on refresh failure
    }
  }

  const openFilesDialog = async (row: IsCodeRow) => {
    setSaveMessage(null)
    setFilesDialogStatus(null)
    setFilesDialogIsCodeId(row.id)
    setFilesDialogTitle(formatIsCodeDisplay(row))
    setFilesDialogFiles([])
    setFilesDialogLoading(true)
    setShowFilesDialog(true)

    try {
      const files = await buildPopupFilesForIsCode(row)
      setFilesDialogFiles(files)
      setFilesDialogTitle(formatIsCodeDisplay(row))
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

  const handleFilesDialogAdd = (picked: File[]) => {
    const isCodeId = filesDialogIsCodeId
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

  const handleFilesDialogDelete = (file: IsCodeViewFile) => {
    const isCodeId = filesDialogIsCodeId
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
        const basePayload = {
          is_number: normalizeText(form.isNumber),
          revision_year: normalizeText(form.revisionYear) || null,
          reaffirmation_year: normalizeText(form.reaffirmationYear) || null,
          amendment_number: normalizeText(form.amendmentNumber) || null,
          title: toProperTitleCase(normalizeText(form.title)),
          aspect: form.aspect,
          testing_charges: form.testingCharges ? Number(form.testingCharges) : null,
          remarks: normalizeText(form.remarks) || null,
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
        if (error) throw error

        const id = (data as { id: string } | null)?.id ?? editingId
        if (!id) throw new Error('Unable to determine record id')

        if (form.files.length > 0) {
          try {
            await uploadFiles(id, form.files)
          } catch (err) {
            const msg = formatSupabaseError(err)
            const extra = msg.toLowerCase().includes('bucket') ? `\n\nCreate Supabase Storage bucket: ${BUCKET}` : ''
            setSaveMessage(`Saved record, but file upload failed: ${msg}${extra}`)
            setEditingId(id)
            setShowForm(true)
            await loadIsCodes()
            await loadFiles(id)
            return
          }
        }

        setSaveMessage('Saved successfully.')
        setForm(emptyIsCodeForm())
        setEditingId(null)
        setShowForm(false)
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
        const { data: fileRows, error: fileErr } = await supabase
          .from('is_code_files')
          .select('storage_path')
          .in('is_code_id', ids)
        if (fileErr) throw fileErr
        const paths = (Array.isArray(fileRows) ? fileRows : []).map((x: any) => x.storage_path).filter(Boolean)
        if (paths.length > 0) {
          const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths)
          if (rmErr) throw rmErr
        }
        const { error: dbFileErr } = await supabase.from('is_code_files').delete().in('is_code_id', ids)
        if (dbFileErr) throw dbFileErr
        const { error: dbErr } = await supabase.from('is_codes').delete().in('id', ids)
        if (dbErr) throw dbErr

        setSelectedIds(new Set())
        setSaveMessage('Deleted.')
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
      'testing_charges',
      'remarks',
      'created_at',
    ]
    const lines = exportRows.map((r) => ({
      id: r.id,
      is_number: r.is_number,
      revision_year: r.revision_year ?? '',
      reaffirmation_year: r.reaffirmation_year ?? '',
      amendment_number: r.amendment_number ?? '',
      title: r.title,
      aspect: r.aspect,
      testing_charges: String(r.testing_charges ?? ''),
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
          return {
            is_number: normalizeText(get('is_number')),
            revision_year: normalizeText(get('revision_year')) || null,
            reaffirmation_year: normalizeText(get('reaffirmation_year')) || null,
            amendment_number: normalizeText(get('amendment_number')) || null,
            title: toProperTitleCase(normalizeText(get('title'))),
            aspect: (normalizeText(get('aspect')) || 'Specification') as IsCodeRow['aspect'],
            testing_charges: get('testing_charges') ? Number(get('testing_charges')) : null,
            remarks: normalizeText(get('remarks')) || null,
          }
        })

        const cleanPayloads = payloads.filter((p) => p.is_number.trim().length > 0 && p.title.trim().length > 0)
        if (cleanPayloads.length === 0) {
          setSaveMessage('No valid rows found (is_number/title missing).')
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
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    if (exportRows.length === 0) return
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>IS Codes</title></head><body><pre>${exportRows
      .map((r) => `${r.is_number} | ${r.title}`)
      .join('\n')}</pre></body></html>`

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
    <div className={limsPageShellClass}>
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

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            limsDialogClass,
            'max-h-[92vh] w-[calc(100%-1.5rem)] max-w-3xl sm:w-full',
            // Center in main content area (sidebar 268px stays clear)
            'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          )}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit IS Code' : 'Add New IS Code'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="max-h-[min(72vh,720px)] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
            {saveMessage ? (
              <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
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
              onOpenFiles={() => {
                const id = editingId
                if (!id) {
                  setSaveMessage('Please save the IS Code first, then upload and view files.')
                  return
                }
                const row = rows.find((r) => r.id === id)
                if (!row) return
                void openFilesDialog(row)
              }}
              onDeleteFiles={handleDeleteFiles}
            />
          </div>
        </DialogContent>
      </Dialog>

      <IsCodesFilesDialog
        open={showFilesDialog}
        onOpenChange={(open) => {
          setShowFilesDialog(open)
          if (!open) {
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
        onDeleteFile={handleFilesDialogDelete}
      />

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
      />

      <IsCodesTableFooterBar
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
          setJumpTo('')
        }}
      />
    </div>
  )
}
