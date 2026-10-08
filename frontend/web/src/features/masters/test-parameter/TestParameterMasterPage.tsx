import { useEffect, useMemo, useRef, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useCanEditCurrentModule } from '@/features/settings/module-access/useCanEditCurrentModule'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TestParameterHeaderBar } from './TestParameterHeaderBar'
import { buildTestParametersListAssistantContext } from './buildTestParameterAssistantContext'
import {
  TestParameterTable,
  type TestParameterSortDir,
  type TestParameterSortKey,
} from './TestParameterTable'
import { AuditHistoryDialog } from '@/components/lims/AuditHistoryDialog'
import { TestParameterTableFooterBar } from './TestParameterFooterBar'
import { IsCodesForm } from '@/features/masters/is-codes/IsCodesForm'
import { fetchDesignationAndDepartmentLabels } from '@/features/settings/lab-settings/labMasterOptions'
import { emptyIsCodeForm, normalizeText as normalizeIsText, type IsCodeForm, type IsAspect } from '@/features/masters/is-codes/types'
import {
  formatIsCodeLabelFromParts,
  formatTestMethodWithYear,
  normalizeIsCodeLabel,
} from '@/features/masters/is-codes/formatIsCodeLabel'
import { AddSymbolDialog } from './AddSymbolDialog'
import {
  TEST_PARAMETER_SYNC_CHANNEL,
  type TestParameterSyncAddedMessage,
} from './openAddTestParameterWindow'
import {
  insertAtCaret,
  type SymbolCaretTarget,
} from './scientificSymbols'
import {
  emptyTestParameterForm,
  normalizeText,
  toProperTitleCase,
  type TestParameterForm as TestParameterFormType,
  type TestParameterRow,
} from './types'

const formatSupabaseError = (err: unknown) => {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

const VIEW_ONLY_MSG = 'View-only access — ask the Laboratory Director for Edit access.'

type MasterDeleteResult = {
  deleted?: string[] | null
  blocked?: { id?: string; refs?: Record<string, number> }[] | null
}

function formatPermanentDeleteMessage(
  data: MasterDeleteResult | null,
  nameOf: (id: string) => string,
): string {
  const deleted = Array.isArray(data?.deleted) ? data.deleted : []
  const blocked = Array.isArray(data?.blocked) ? data.blocked : []
  let msg = `Deleted ${deleted.length}.`
  if (blocked.length > 0) {
    const bits = blocked.slice(0, 5).map((b) => {
      const id = String(b.id ?? '')
      const refs = Object.entries(b.refs ?? {})
        .map(([table, n]) => `${String(table).replace(/^public\./, '')} ${n}`)
        .join(', ')
      return `${nameOf(id)} (${refs})`
    })
    msg += ` Not deleted (still used): ${bits.join('; ')} — use Archive instead.`
  }
  return msg
}

const readListFromStorage = (key: string): string[] => {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === 'string') as string[]) : []
  } catch {
    return []
  }
}

const readDesignationByDepartmentFromStorage = (): Record<string, string[]> => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem('userManagement.designationByDepartment')
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, string[]>
    return {}
  } catch {
    return {}
  }
}

const normLabel = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()

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

export default function TestParameterMasterPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { editId, setEdit } = useMasterUiSearchState()
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const canEdit = useCanEditCurrentModule()
  const [showArchived, setShowArchived] = useState(false)

  const editingId = editId && editId !== 'new' ? editId : null
  const hydratedEditRef = useRef<string | null>(null)
  const [editForm, setEditForm] = useState<TestParameterFormType>(() => emptyTestParameterForm())

  const importInputRef = useRef<HTMLInputElement | null>(null)

  const [search, setSearch] = useState('')
  /** When set (deep-link from FTR etc.), list only rows for this IS id. Cleared when user edits search. */
  const [lockedIsCodeId, setLockedIsCodeId] = useState<string | null>(null)

  const [rows, setRows] = useState<TestParameterRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [jumpTo, setJumpTo] = useState('')
  const [sortKey, setSortKey] = useState<TestParameterSortKey>('isCode')
  const [sortDir, setSortDir] = useState<TestParameterSortDir>('asc')

  const [inlineForm, setInlineForm] = useState<TestParameterFormType>(() => emptyTestParameterForm())
  const [inlineAddLoading, setInlineAddLoading] = useState(false)
  const [symbolDialogOpen, setSymbolDialogOpen] = useState(false)
  const symbolTargetRef = useRef<SymbolCaretTarget>({
    field: 'itemName',
    scope: 'inline',
    start: 0,
    end: 0,
  })

  const [isCodes, setIsCodes] = useState<Array<{ id: string; displayCode: string; searchLabel: string; defaultTestMethod: string }>>([])

  const [isCodeDialogOpen, setIsCodeDialogOpen] = useState(false)
  const [isCodeForm, setIsCodeForm] = useState<IsCodeForm>(() => emptyIsCodeForm())
  const [isCodeSaveLoading, setIsCodeSaveLoading] = useState(false)
  const [isCodeAspects, setIsCodeAspects] = useState<Array<{ id: string; label: string }>>([
    { id: 'default-spec', label: 'Specification' },
  ])
  const [isCodeAspectDialogOpen, setIsCodeAspectDialogOpen] = useState(false)
  const [isCodeNewAspect, setIsCodeNewAspect] = useState('')

  const [departments, setDepartments] = useState<string[]>(() => readListFromStorage('userManagement.departments'))
  const [designations, setDesignations] = useState<string[]>(() => readListFromStorage('userManagement.designations'))
  const [designationsByDepartment, setDesignationsByDepartment] = useState<Record<string, string[]>>(
    readDesignationByDepartmentFromStorage,
  )

  useEffect(() => {
    const wantsAdd = searchParams.get('openAdd') === '1'
    const wantsFilter = searchParams.get('filterIs') === '1'
    if (!wantsAdd && !wantsFilter) return

    const isCodeId = (searchParams.get('isCodeId') ?? '').trim()
    const isCodeLabelParam = searchParams.get('isCodeLabel') ?? ''
    const departmentParam = searchParams.get('department') ?? ''
    const designationParam = searchParams.get('designation') ?? ''
    const syncToken = (searchParams.get('syncToken') ?? '').trim()
    const isCodeRow = isCodes.find((c) => c.id === isCodeId)
    const label = (isCodeLabelParam || isCodeRow?.displayCode || '').trim()

    if (wantsFilter) {
      if (isCodeId) setLockedIsCodeId(isCodeId)
      if (label) setSearch(label)
      setPage(1)
    }

    if (wantsAdd) {
      const base = emptyTestParameterForm()
      setSaveMessage(null)
      setInlineForm({
        ...base,
        isCodeId,
        isCodeLabel: label || base.isCodeLabel,
        testMethod: isCodeRow?.defaultTestMethod ?? (label || base.testMethod),
        department: departmentParam || base.department,
        designation: designationParam || base.designation,
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    if (syncToken) {
      try {
        sessionStorage.setItem('qe-test-parameter-sync-token', syncToken)
      } catch {
        /* ignore */
      }
    }

    const next = new URLSearchParams(searchParams)
    next.delete('openAdd')
    next.delete('filterIs')
    next.delete('isCodeId')
    next.delete('isCodeLabel')
    next.delete('department')
    next.delete('designation')
    next.delete('syncToken')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, isCodes])

  const loadRows = async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data, error } = await supabase
        .from('test_parameters')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      const list = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []

      setRows(
        list.map((r) => ({
          id: String(r.id ?? ''),
          is_code_id: (r.is_code_id ? String(r.is_code_id) : null) as string | null,
          is_code_label: (r.is_code_label ? String(r.is_code_label) : null) as string | null,
          clause_no: (r.clause_no ? String(r.clause_no) : null) as string | null,
          unit_value: (r.unit_value ? String(r.unit_value) : null) as string | null,
          test_method: (r.test_method ? String(r.test_method) : null) as string | null,
          item_name: String(r.item_name ?? ''),
          specific_requirement: (r.specific_requirement ? String(r.specific_requirement) : null) as string | null,
          under_accreditation_ids: Array.isArray(r.under_accreditation_ids)
            ? (r.under_accreditation_ids as string[])
            : [],
          uncertainty_mu: (r.uncertainty_mu ? String(r.uncertainty_mu) : null) as string | null,
          uncertainty_calculation_data: r.uncertainty_calculation_data ?? null,
          uncertainty_mu_history: r.uncertainty_mu_history ?? null,
          department: (r.department ? String(r.department) : null) as string | null,
          designation: (r.designation ? String(r.designation) : null) as string | null,
          acceptance_criteria: (r.acceptance_criteria ? String(r.acceptance_criteria) : null) as string | null,
          created_at: (r.created_at ? String(r.created_at) : undefined) as string | undefined,
          archived_at: (r.archived_at ? String(r.archived_at) : null) as string | null,
        }))
          .filter((x) => x.id),
      )
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load test parameters')
    } finally {
      setListLoading(false)
    }
  }

  const loadMasters = async () => {
    const errors: string[] = []

    try {
      const { data: isData, error: isErr } = await supabase
        .from('is_codes')
        .select('id, is_number, title, revision_year')
        .order('created_at', { ascending: false })

      if (isErr) throw isErr

      const isList = Array.isArray(isData)
        ? (isData as Array<{ id: string; is_number: string; title: string; revision_year: string | null }>)
        : []

      setIsCodes(
        isList
          .map((r) => {
            const displayCode = formatIsCodeLabelFromParts(r.is_number, r.revision_year)
            const searchLabel = r.title ? `${displayCode} — ${r.title}` : displayCode
            return {
              id: r.id,
              displayCode,
              searchLabel,
              defaultTestMethod: displayCode,
            }
          })
          .sort((a, b) => a.searchLabel.localeCompare(b.searchLabel)),
      )
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Unable to load IS codes')
    }

    if (errors.length > 0) {
      setSaveMessage((prev) => prev ?? errors[0] ?? 'Unable to load masters')
    }
  }

  const loadIsCodeAspects = async () => {
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
      setIsCodeAspects(Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label)))
    } catch {
      setIsCodeAspects([{ id: 'default-spec', label: 'Specification' }])
    }
  }

  const loadUserManagementOptions = async () => {
    try {
      const { designations: labDesignations, departments: labDepartments } =
        await fetchDesignationAndDepartmentLabels()

      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('designation, department_name, status')
        .order('full_name', { ascending: true })

      const profiles = Array.isArray(profileData) ? profileData : []
      const designationByDepartment: Record<string, string[]> = {}
      const designationsFromProfiles = new Set<string>()
      const departmentsFromProfiles = new Set<string>()

      for (const row of profiles) {
        if (normLabel((row as { status?: string }).status) === 'inactive') continue
        const dept = String((row as { department_name?: string }).department_name ?? '').trim()
        const des = String((row as { designation?: string }).designation ?? '').trim()
        if (dept) departmentsFromProfiles.add(dept)
        if (des) designationsFromProfiles.add(des)
        if (dept && des) {
          if (!designationByDepartment[dept]) designationByDepartment[dept] = []
          if (!designationByDepartment[dept].includes(des)) designationByDepartment[dept].push(des)
        }
      }

      for (const k of Object.keys(designationByDepartment)) {
        designationByDepartment[k].sort((a, b) => a.localeCompare(b))
      }

      const mergedDesignations = Array.from(
        new Set([...labDesignations, ...designationsFromProfiles, ...readListFromStorage('userManagement.designations')]),
      )
        .map((d) => d.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))

      const mergedDepartments = Array.from(
        new Set([...labDepartments, ...departmentsFromProfiles, ...readListFromStorage('userManagement.departments')]),
      )
        .map((d) => d.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))

      setDesignations(mergedDesignations)
      setDepartments(mergedDepartments)
      setDesignationsByDepartment(designationByDepartment)

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('userManagement.designations', JSON.stringify(mergedDesignations))
        window.localStorage.setItem('userManagement.departments', JSON.stringify(mergedDepartments))
        window.localStorage.setItem('userManagement.designationByDepartment', JSON.stringify(designationByDepartment))
      }
    } catch {
      // keep storage-backed defaults
    }
  }

  useEffect(() => {
    void loadRows()
    void loadMasters()
    void loadUserManagementOptions()
    void loadIsCodeAspects()
  }, [])

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize])

  const resolveTestMethodDisplay = (
    testMethod: string | null | undefined,
    isCodeId: string | null | undefined,
    isCodeLabel: string | null | undefined,
  ) => {
    const fromLinked = isCodeId
      ? isCodes.find((c) => c.id === isCodeId)?.displayCode
      : undefined
    let out = formatTestMethodWithYear(testMethod, fromLinked ?? isCodeLabel)
    if (out && !/:\s*\d{4}\b/.test(out)) {
      const base = normalizeIsCodeLabel(testMethod).split(':')[0].trim().toLowerCase()
      const byNumber = isCodes.find(
        (c) => c.displayCode.split(':')[0].trim().toLowerCase() === base,
      )
      out = formatTestMethodWithYear(testMethod, byNumber?.displayCode) || out
    }
    return out
  }

  /** List/form display: Test Method always includes revision year when known. */
  const displayRows = useMemo(() => {
    const byId = new Map(isCodes.map((c) => [c.id, c.displayCode]))
    const byBase = new Map(
      isCodes.map((c) => [c.displayCode.split(':')[0].trim().toLowerCase(), c.displayCode] as const),
    )
    return rows.map((r) => {
      const fromLinked = r.is_code_id ? byId.get(r.is_code_id) : undefined
      let method = formatTestMethodWithYear(r.test_method, fromLinked ?? r.is_code_label)
      if (method && !/:\s*\d{4}\b/.test(method)) {
        const base = normalizeIsCodeLabel(r.test_method).split(':')[0].trim().toLowerCase()
        method = formatTestMethodWithYear(r.test_method, byBase.get(base)) || method
      }
      return { ...r, test_method: method || r.test_method }
    })
  }, [rows, isCodes])

  const filteredRows = useMemo(() => {
    const source = showArchived ? displayRows : displayRows.filter((r) => !r.archived_at)
    const lockedId = (lockedIsCodeId ?? '').trim()
    if (lockedId) {
      return source.filter((r) => (r.is_code_id ?? '').trim() === lockedId)
    }

    const q = search.trim().toLowerCase()
    if (!q) return source

    return source.filter((r) => {
      const blob = [
        r.is_code_label ?? '',
        r.test_method ?? '',
        r.clause_no ?? '',
        r.unit_value ?? '',
        r.item_name ?? '',
        r.specific_requirement ?? '',
        r.department ?? '',
        r.designation ?? '',
      ]
        .join(' ')
        .toLowerCase()

      return blob.includes(q)
    })
  }, [displayRows, search, lockedIsCodeId, showArchived])

  const sortedRows = useMemo(() => {
    const sortValue = (r: TestParameterRow): string => {
      switch (sortKey) {
        case 'isCode':
          return (r.is_code_label ?? '').trim().toLowerCase()
        case 'itemName':
          return (r.item_name ?? '').trim().toLowerCase()
        case 'testMethod':
          return (r.test_method ?? '').trim().toLowerCase()
        case 'clause':
          return (r.clause_no ?? '').trim().toLowerCase()
        case 'unit':
          return (r.unit_value ?? '').trim().toLowerCase()
        case 'requirement':
          return (r.specific_requirement ?? '').trim().toLowerCase()
        default:
          return ''
      }
    }

    const dir = sortDir === 'asc' ? 1 : -1
    return [...filteredRows].sort((a, b) => {
      const av = sortValue(a)
      const bv = sortValue(b)
      const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true })
      if (cmp !== 0) return cmp * dir
      const nameCmp = (a.item_name ?? '').localeCompare(b.item_name ?? '', undefined, {
        sensitivity: 'base',
      })
      return nameCmp * dir
    })
  }, [filteredRows, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, page, pageSize])

  const parameterNameOptions = useMemo(() => {
    const seen = new Set<string>()
    const names: string[] = []
    for (const r of rows) {
      const name = (r.item_name ?? '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      names.push(name)
    }
    return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [rows])

  const handleSort = (key: TestParameterSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  const assistantContext = useMemo(
    () => buildTestParametersListAssistantContext(filteredRows, search),
    [filteredRows, search],
  )

  const isCodeOptions = useMemo(
    () => isCodes.map((c) => ({ id: c.id, label: c.searchLabel, displayCode: c.displayCode })),
    [isCodes],
  )

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

  const hydrateEditForm = (row: TestParameterRow) => {
    const testMethod =
      resolveTestMethodDisplay(row.test_method, row.is_code_id, row.is_code_label) ||
      row.test_method ||
      ''
    setEditForm({
      isCodeId: row.is_code_id ?? '',
      isCodeLabel: row.is_code_label ?? '',
      clauseNo: row.clause_no ?? '',
      unitValue: row.unit_value ?? '',
      testMethod,
      itemName: row.item_name ?? '',
      specificRequirement: row.specific_requirement ?? '',
      department: row.department ?? '',
      designation: row.designation ?? '',
    })
  }

  useEffect(() => {
    if (!editId || editId === 'new') {
      if (editId === 'new') setEdit(null)
      hydratedEditRef.current = null
      return
    }
    if (hydratedEditRef.current === editId) return

    const fromPage = rows.find((r) => r.id === editId)
    if (fromPage) {
      setSaveMessage(null)
      hydrateEditForm(fromPage)
      hydratedEditRef.current = editId
      return
    }

    if (!listLoading) setEdit(null)
  }, [editId, rows, listLoading, isCodes, setEdit])

  const handleEdit = (row: TestParameterRow) => {
    setSaveMessage(null)
    hydrateEditForm(row)
    hydratedEditRef.current = row.id
    setEdit(row.id)
  }

  const handleInlineEditCancel = () => {
    hydratedEditRef.current = null
    setEdit(null)
    setEditForm(emptyTestParameterForm())
  }

  const handleInlineEditSave = () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    void (async () => {
      if (!editingId || saveLoading || normalizeText(editForm.itemName).length === 0) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const payload = buildInsertPayload(editForm)
        const { data, error } = await supabase
          .from('test_parameters')
          .update(payload)
          .eq('id', editingId)
          .select('id')
        if (error) throw error
        if (!data || data.length === 0) {
          throw new Error('You do not have edit access for this record (view-only).')
        }
        setSaveMessage('Saved successfully.')
        hydratedEditRef.current = null
        setEdit(null)
        setEditForm(emptyTestParameterForm())
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const buildInsertPayload = (source: TestParameterFormType) => {
    const isRow = isCodes.find((x) => x.id === source.isCodeId)
    return {
      is_code_id: source.isCodeId || null,
      is_code_label: normalizeText(source.isCodeLabel) || (isRow?.displayCode ?? null),
      clause_no: normalizeText(source.clauseNo) || null,
      unit_value: normalizeText(source.unitValue) || null,
      test_method:
        formatTestMethodWithYear(
          normalizeText(source.testMethod) || isRow?.defaultTestMethod,
          isRow?.displayCode ?? source.isCodeLabel,
        ) || null,
      item_name: toProperTitleCase(normalizeText(source.itemName)),
      specific_requirement: toProperTitleCase(normalizeText(source.specificRequirement)) || null,
      under_accreditation_ids: [] as string[],
      uncertainty_mu: null,
      department: normalizeText(source.department) || null,
      designation: normalizeText(source.designation) || null,
    }
  }

  const handleInlineAdd = () => {
    void (async () => {
      if (inlineAddLoading || normalizeText(inlineForm.itemName).length === 0) return
      setSaveMessage(null)
      setInlineAddLoading(true)
      try {
        const payload = buildInsertPayload(inlineForm)
        const { data, error } = await supabase
          .from('test_parameters')
          .insert(payload)
          .select(
            'id, item_name, clause_no, unit_value, specific_requirement, test_method, is_code_label, is_code_id',
          )
          .single()
        if (error) throw error
        setSaveMessage('Saved successfully.')

        try {
          const syncToken = sessionStorage.getItem('qe-test-parameter-sync-token') ?? ''
          if (syncToken && data) {
            const msg: TestParameterSyncAddedMessage = {
              type: 'test-parameter-added',
              syncToken,
              param: {
                id: String(data.id ?? ''),
                item_name: String(data.item_name ?? ''),
                clause_no: data.clause_no != null ? String(data.clause_no) : null,
                unit_value: data.unit_value != null ? String(data.unit_value) : null,
                specific_requirement:
                  data.specific_requirement != null ? String(data.specific_requirement) : null,
                test_method: data.test_method != null ? String(data.test_method) : null,
                is_code_label: data.is_code_label != null ? String(data.is_code_label) : null,
                is_code_id: data.is_code_id != null ? String(data.is_code_id) : null,
              },
            }
            const channel = new BroadcastChannel(TEST_PARAMETER_SYNC_CHANNEL)
            channel.postMessage(msg)
            channel.close()
          }
        } catch {
          /* sync is best-effort */
        }

        // Keep last selected IS Code + Test Method until user changes them manually.
        setInlineForm((prev) => {
          const matched =
            isCodes.find((c) => c.id === prev.isCodeId) ||
            isCodes.find(
              (c) =>
                c.displayCode.trim().toLowerCase() === prev.isCodeLabel.trim().toLowerCase(),
            )
          const stickyIsCodeId = prev.isCodeId || matched?.id || ''
          const stickyIsCodeLabel = prev.isCodeLabel.trim() || matched?.displayCode || ''
          const stickyTestMethod =
            prev.testMethod.trim() ||
            matched?.defaultTestMethod ||
            stickyIsCodeLabel
          return {
            ...emptyTestParameterForm(),
            isCodeId: stickyIsCodeId,
            isCodeLabel: stickyIsCodeLabel,
            testMethod: stickyTestMethod,
            // Keep last Clause / Requirements until user changes them manually.
            clauseNo: prev.clauseNo,
            specificRequirement: prev.specificRequirement,
            unitValue: prev.unitValue,
          }
        })
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setInlineAddLoading(false)
      }
    })()
  }

  const handleTrackSymbolTarget = (target: SymbolCaretTarget) => {
    symbolTargetRef.current = target
  }

  const handleInsertSymbol = (symbol: string) => {
    const target = symbolTargetRef.current
    const useEdit = target.scope === 'edit' && Boolean(editingId)
    const scope = useEdit ? 'edit' : 'inline'
    const form = useEdit ? editForm : inlineForm
    const setForm = useEdit ? setEditForm : setInlineForm
    const field = target.field
    const current = form[field] ?? ''
    const { next, caret } = insertAtCaret(current, symbol, target.start, target.end)
    setForm((prev) => ({ ...prev, [field]: next }))
    symbolTargetRef.current = { field, scope, start: caret, end: caret }
    requestAnimationFrame(() => {
      const nodes = document.querySelectorAll<HTMLInputElement>(
        `[data-symbol-field="${field}"][data-symbol-scope="${scope}"]`,
      )
      for (const el of nodes) {
        if (el.offsetParent === null && el.getClientRects().length === 0) continue
        el.focus({ preventScroll: true })
        el.setSelectionRange(caret, caret)
        break
      }
    })
  }

  const openAddIsCodeForm = (typed: string) => {
    const raw = (typed ?? '').trim()
    if (raw.includes(':')) {
      const [numberPart, rest] = raw.split(':')
      setIsCodeForm({
        ...emptyIsCodeForm(),
        isNumber: numberPart.trim(),
        revisionYear: (rest ?? '').trim().replace(/[^0-9]/g, '').slice(0, 4),
      })
    } else {
      setIsCodeForm({
        ...emptyIsCodeForm(),
        isNumber: raw,
      })
    }
    setIsCodeDialogOpen(true)
  }

  const handlePickIsFiles = (files: File[]) => {
    setIsCodeForm((prev) => ({ ...prev, files }))
  }

  const handleAddIsAspect = () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    const name = normalizeIsText(isCodeNewAspect)
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
        setIsCodeAspects((prev) => {
          const merged = [...prev, { id, label: name }]
          const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
        })
        setIsCodeForm((prev) => ({ ...prev, aspect: name as IsAspect }))
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setIsCodeNewAspect('')
        setIsCodeAspectDialogOpen(false)
      }
    })()
  }

  const handleDeleteIsAspect = (id: string) => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    void (async () => {
      try {
        if (!id || id.startsWith('default-')) return
        const { error } = await supabase.from('is_code_master_options').delete().eq('id', id)
        if (error) throw error
        setIsCodeAspects((prev) => prev.filter((x) => x.id !== id))
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      }
    })()
  }

  const canSaveIsCode =
    !isCodeSaveLoading && normalizeIsText(isCodeForm.isNumber).length > 0 && normalizeIsText(isCodeForm.title).length > 0

  const handleSaveIsCode = () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    void (async () => {
      setSaveMessage(null)
      setIsCodeSaveLoading(true)
      try {
        const payload = {
          is_number: normalizeIsText(isCodeForm.isNumber),
          revision_year: normalizeIsText(isCodeForm.revisionYear) || null,
          reaffirmation_year: normalizeIsText(isCodeForm.reaffirmationYear) || null,
          amendment_number: normalizeIsText(isCodeForm.amendmentNumber) || null,
          title: normalizeIsText(isCodeForm.title),
          aspect: isCodeForm.aspect,
          testing_charges: isCodeForm.testingCharges ? Number(isCodeForm.testingCharges) : null,
          remarks: normalizeIsText(isCodeForm.remarks) || null,
        }

        const { data, error } = await supabase
          .from('is_codes')
          .upsert(payload, { onConflict: 'is_number,revision_year' })
          .select('id, is_number, revision_year, title')
          .single()
        if (error) throw error

        const row = data as { id: string; is_number: string; revision_year: string | null; title: string }
        const displayCode = formatIsCodeLabelFromParts(row.is_number, row.revision_year)

        setIsCodeDialogOpen(false)
        setIsCodeForm(emptyIsCodeForm())

        await loadMasters()

        if (editingId) {
          setEditForm((prev) => ({
            ...prev,
            isCodeId: row.id,
            isCodeLabel: displayCode,
            testMethod: displayCode,
          }))
        } else {
          setInlineForm((prev) => ({
            ...prev,
            isCodeId: row.id,
            isCodeLabel: displayCode,
            testMethod: displayCode,
          }))
        }
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setIsCodeSaveLoading(false)
      }
    })()
  }

  const handleClearIsCode = () => {
    setSaveMessage(null)
    setIsCodeForm(emptyIsCodeForm())
  }

  const handleArchiveSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) {
        setSaveMessage('Select at least one parameter to archive.')
        return
      }
      const ok = window.confirm(`Archive ${selectedRows.length} selected record(s)?`)
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { data, error } = await supabase
          .from('test_parameters')
          .update({ archived_at: new Date().toISOString() })
          .in('id', ids)
          .is('archived_at', null)
          .select('id')
        if (error) throw error
        const n = Array.isArray(data) ? data.length : 0
        if (n === 0) {
          setSaveMessage('You do not have edit access (view-only).')
          return
        }
        setSaveMessage(`Archived ${n}.`)
        setSelectedIds(new Set())
        await loadRows()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to archive')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleRestoreSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) {
        setSaveMessage('Select at least one parameter to restore.')
        return
      }
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { data, error } = await supabase
          .from('test_parameters')
          .update({ archived_at: null })
          .in('id', ids)
          .not('archived_at', 'is', null)
          .select('id')
        if (error) throw error
        const n = Array.isArray(data) ? data.length : 0
        if (n === 0) {
          setSaveMessage('You do not have edit access (view-only).')
          return
        }
        setSaveMessage(`Restored ${n}.`)
        setSelectedIds(new Set())
        await loadRows()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to restore')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) return
      const ok = window.confirm(
        `Permanently delete ${selectedRows.length} record(s)? Records still used elsewhere will be skipped. This cannot be undone.`,
      )
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { data, error } = await supabase.rpc('delete_master_rows', {
          p_table: 'test_parameters',
          p_ids: ids,
        })
        if (error) throw error
        const res = (data ?? null) as MasterDeleteResult | null
        setSaveMessage(
          formatPermanentDeleteMessage(res, (id) => rows.find((r) => r.id === id)?.item_name || id),
        )
        setSelectedIds(new Set())
        await loadRows()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleDeleteRow = (row: TestParameterRow) => {
    void (async () => {
      const label = row.item_name?.trim() || 'this record'
      const ok = window.confirm(
        `Permanently delete 1 record(s)? Records still used elsewhere will be skipped. This cannot be undone.`,
      )
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const { data, error } = await supabase.rpc('delete_master_rows', {
          p_table: 'test_parameters',
          p_ids: [row.id],
        })
        if (error) throw error
        const res = (data ?? null) as MasterDeleteResult | null
        setSaveMessage(formatPermanentDeleteMessage(res, () => label))
        setSelectedIds((prev) => {
          if (!prev.has(row.id)) return prev
          const next = new Set(prev)
          next.delete(row.id)
          return next
        })
        if (editingId === row.id) {
          handleInlineEditCancel()
        }
        await loadRows()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleExport = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : sortedRows

    const headers = [
      'id',
      'is_code_label',
      'clause_no',
      'unit_value',
      'test_method',
      'item_name',
      'specific_requirement',
      'department',
      'designation',
      'created_at',
    ]

    const lines = exportRows.map((r) => ({
      id: r.id,
      is_code_label: r.is_code_label ?? '',
      clause_no: r.clause_no ?? '',
      unit_value: r.unit_value ?? '',
      test_method: r.test_method ?? '',
      item_name: r.item_name ?? '',
      specific_requirement: r.specific_requirement ?? '',
      department: r.department ?? '',
      designation: r.designation ?? '',
      created_at: r.created_at ?? '',
    }))

    const csv = toCsv(headers, lines)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'test_parameters.csv'
    a.click()
    URL.revokeObjectURL(url)
    setSaveMessage('Exported.')
  }

  const handlePrintSelected = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : sortedRows
    if (exportRows.length === 0) return

    const esc = (s: string | null | undefined) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Test Parameters</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;padding:16px}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #ccc;padding:6px;vertical-align:top}th{background:#f5f5f5;font-weight:600}</style>
      </head><body><h2>Test Parameters</h2>
      <table><thead><tr>
        <th>IS Code</th><th>Test Parameter</th><th>Test Method</th><th>Clause</th><th>Unit</th><th>Specific Requirements</th><th>Department</th><th>Designation</th>
      </tr></thead><tbody>
      ${exportRows
        .map(
          (r) =>
            `<tr><td>${esc(r.is_code_label)}</td><td>${esc(r.item_name)}</td><td>${esc(r.test_method)}</td><td>${esc(r.clause_no)}</td><td>${esc(r.unit_value)}</td><td>${esc(r.specific_requirement)}</td><td>${esc(r.department)}</td><td>${esc(r.designation)}</td></tr>`,
        )
        .join('')}
      </tbody></table></body></html>`

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
      setSaveMessage('Unable to open print preview.')
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

  const handleImport = () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    setSaveMessage(null)
    importInputRef.current?.click()
  }

  const handleImportFile = (file: File) => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
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

        const get = (cells: string[], key: string) => {
          const idx = header.indexOf(key)
          return idx >= 0 ? (cells[idx] ?? '') : ''
        }

        const isCodeByLabel = new Map(
          isCodes.map((c) => [normalizeIsCodeLabel(c.displayCode).toLowerCase(), c]),
        )

        const payloads = rowsData.map((cells) => {
          const isCodeLabel = normalizeIsCodeLabel(normalizeText(get(cells, 'is_code_label')))
          const matched = isCodeLabel ? isCodeByLabel.get(isCodeLabel.toLowerCase()) : undefined
          const accrRaw = normalizeText(get(cells, 'under_accreditation_ids'))
          return {
            // id + created_at intentionally omitted — DB defaults generate them
            is_code_id: matched?.id ?? null,
            is_code_label: isCodeLabel || matched?.displayCode || null,
            clause_no: normalizeText(get(cells, 'clause_no')) || null,
            unit_value: normalizeText(get(cells, 'unit_value')) || null,
            test_method: normalizeText(get(cells, 'test_method')) || matched?.defaultTestMethod || null,
            item_name: toProperTitleCase(normalizeText(get(cells, 'item_name'))),
            specific_requirement:
              toProperTitleCase(normalizeText(get(cells, 'specific_requirement'))) || null,
            under_accreditation_ids: accrRaw
              ? accrRaw.split(/[|,]/).map((s) => s.trim()).filter(Boolean)
              : [],
            uncertainty_mu: normalizeText(get(cells, 'uncertainty_mu')) || null,
            department: normalizeText(get(cells, 'department')) || null,
            designation: normalizeText(get(cells, 'designation')) || null,
          }
        })

        const clean = payloads.filter((p) => p.item_name.trim().length > 0)
        if (clean.length === 0) {
          setSaveMessage('No valid rows found (item_name missing).')
          return
        }

        // Skip rows already present for the same IS code + test name (avoid duplicates on re-import).
        const labels = Array.from(
          new Set(clean.map((p) => p.is_code_label).filter((x): x is string => Boolean(x))),
        )
        const existingKeys = new Set<string>()
        if (labels.length > 0) {
          const { data: existing, error: existingError } = await supabase
            .from('test_parameters')
            .select('is_code_label, item_name')
            .in('is_code_label', labels)
          if (existingError) throw existingError
          for (const row of Array.isArray(existing) ? existing : []) {
            const r = row as { is_code_label?: string | null; item_name?: string | null }
            const key = `${normalizeIsCodeLabel(r.is_code_label).toLowerCase()}::${normalizeText(r.item_name).toLowerCase()}`
            existingKeys.add(key)
          }
        }

        const toInsert = clean.filter((p) => {
          const key = `${normalizeIsCodeLabel(p.is_code_label).toLowerCase()}::${p.item_name.trim().toLowerCase()}`
          return !existingKeys.has(key)
        })
        const skipped = clean.length - toInsert.length

        if (toInsert.length === 0) {
          setSaveMessage(
            skipped > 0
              ? `Nothing new to import — ${skipped} row(s) already exist.`
              : 'No valid rows to import.',
          )
          return
        }

        const chunkSize = 80
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const chunk = toInsert.slice(i, i + chunkSize)
          const { error } = await supabase.from('test_parameters').insert(chunk)
          if (error) throw error
        }

        setSaveMessage(
          skipped > 0
            ? `Imported ${toInsert.length} record(s); skipped ${skipped} duplicate(s).`
            : `Imported ${toInsert.length} record(s).`,
        )
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  return (
    <div
      data-master-scroll="table"
      className={cn(
        limsPageShellClass,
        'flex h-full min-h-0 flex-col overflow-hidden !space-y-0 gap-2 sm:gap-3 md:gap-3',
      )}
    >
      <div className="shrink-0">
        <TestParameterHeaderBar
          search={search}
          onSearchChange={(value) => {
            setLockedIsCodeId(null)
            setSearch(value)
          }}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          assistantContext={assistantContext}
          onAssistantDataChanged={() => void loadRows()}
          isCodeOptions={isCodeOptions}
          onAddSymbol={() => setSymbolDialogOpen(true)}
          canEdit={canEdit}
        />
      </div>

      <AddSymbolDialog
        open={symbolDialogOpen}
        onOpenChange={setSymbolDialogOpen}
        onInsert={handleInsertSymbol}
      />

      <Dialog open={isCodeDialogOpen} onOpenChange={setIsCodeDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add New IS Code</DialogTitle>
          </DialogHeader>
          {saveMessage && <div className="text-sm text-destructive">{saveMessage}</div>}
          <IsCodesForm
            form={isCodeForm}
            onChange={setIsCodeForm}
            canSave={canSaveIsCode}
            saveLoading={isCodeSaveLoading}
            onSave={handleSaveIsCode}
            onClear={handleClearIsCode}
            onPickFiles={handlePickIsFiles}
            aspectOptions={isCodeAspects}
            aspectDialogOpen={isCodeAspectDialogOpen}
            setAspectDialogOpen={setIsCodeAspectDialogOpen}
            newAspect={isCodeNewAspect}
            setNewAspect={setIsCodeNewAspect}
            onAddAspect={handleAddIsAspect}
            onDeleteAspect={handleDeleteIsAspect}
            onOpenFiles={() => {
              setSaveMessage('Please save the IS Code in IS Code Master to manage files.')
            }}
          />
        </DialogContent>
      </Dialog>

      <div className="min-h-0 flex-1 overflow-hidden">
        <TestParameterTable
          rows={pagedRows}
          loading={listLoading}
          error={listError}
          searchActive={search.trim().length > 0}
          selectedIds={selectedIds}
          onToggle={toggleRow}
          onToggleAll={toggleAllOnPage}
          onEdit={handleEdit}
          onDelete={handleDeleteRow}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          inlineForm={inlineForm}
          onInlineFormChange={setInlineForm}
          onInlineAdd={handleInlineAdd}
          inlineAddBusy={inlineAddLoading}
          isCodes={isCodes}
          parameterNameOptions={parameterNameOptions}
          editingRowId={editingId}
          editForm={editForm}
          onEditFormChange={setEditForm}
          onEditSave={handleInlineEditSave}
          onEditCancel={handleInlineEditCancel}
          editBusy={saveLoading}
          onTrackSymbolTarget={handleTrackSymbolTarget}
        />
      </div>

      <div className="shrink-0">
        <TestParameterTableFooterBar
          message={saveMessage}
          loading={saveLoading}
          selectedCount={selectedIds.size}
          onImport={handleImport}
          onExport={handleExport}
          onPrintSelected={handlePrintSelected}
          onDeleteSelected={handleDeleteSelected}
          onHistory={() => setHistoryOpen(true)}
          canEdit={canEdit}
          showArchived={showArchived}
          onToggleShowArchived={() => setShowArchived((v) => !v)}
          onArchiveSelected={handleArchiveSelected}
          onRestoreSelected={handleRestoreSelected}
          page={page}
          pageCount={pageCount}
          onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
          jumpTo={jumpTo}
          onJumpToChange={setJumpTo}
          onJumpToGo={() => {
            const n = Number(jumpTo)
            if (!Number.isFinite(n) || n <= 0) return
            setPage(Math.min(pageCount, Math.max(1, n)))
          }}
        />
      </div>
      <AuditHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        table="test_parameters"
        rowId={selectedIds.size === 1 ? [...selectedIds][0] : null}
        recordLabel={
          rows.find((row) => selectedIds.size === 1 && selectedIds.has(row.id))?.item_name ??
          'test parameter'
        }
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImportFile(f)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}
