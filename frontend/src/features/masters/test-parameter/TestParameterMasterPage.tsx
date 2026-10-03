import { useEffect, useMemo, useRef, useState } from 'react'
import { limsDarkBarGlowStyle, limsDialogClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TestParameterHeaderBar } from './TestParameterHeaderBar'
import { buildTestParametersListAssistantContext } from './buildTestParameterAssistantContext'
import { TestParameterForm } from './TestParameterForm'
import {
  TestParameterTable,
  type TestParameterSortDir,
  type TestParameterSortKey,
} from './TestParameterTable'
import { TestParameterTableFooterBar } from './TestParameterFooterBar'
import { TestParameterUncertaintyDialog } from './TestParameterUncertaintyDialog'
import type { UncertaintyCalculationData } from './testParameterUncertainty'
import { parseUncertaintyCalculationData } from './testParameterUncertainty'
import {
  newUncertaintyHistoryId,
  parseUncertaintyMuHistory,
  todayIsoDate,
  type UncertaintyHistoryRecord,
} from './uncertaintyHistory'
import { useAuth } from '@/hooks/useAuth'
import { IsCodesForm } from '@/features/masters/is-codes/IsCodesForm'
import { fetchDesignationAndDepartmentLabels } from '@/features/settings/lab-settings/labMasterOptions'
import { emptyIsCodeForm, normalizeText as normalizeIsText, type IsCodeForm, type IsAspect } from '@/features/masters/is-codes/types'
import { formatIsCodeLabelFromParts, normalizeIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import {
  emptyTestParameterForm,
  normalizeText,
  toProperTitleCase,
  type AccreditationBodyRow,
  type TestParameterForm as TestParameterFormType,
  type TestParameterRow,
} from './types'

const formatSupabaseError = (err: unknown) => {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
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
  const { profileName } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)

  const importInputRef = useRef<HTMLInputElement | null>(null)

  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [search, setSearch] = useState('')

  const [rows, setRows] = useState<TestParameterRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [sortKey, setSortKey] = useState<TestParameterSortKey>('isCode')
  const [sortDir, setSortDir] = useState<TestParameterSortDir>('asc')

  const [form, setForm] = useState<TestParameterFormType>(() => emptyTestParameterForm())

  const [isCodes, setIsCodes] = useState<Array<{ id: string; displayCode: string; searchLabel: string; defaultTestMethod: string }>>([])

  const [accreditationBodies, setAccreditationBodies] = useState<AccreditationBodyRow[]>([])
  const [accreditationDialogOpen, setAccreditationDialogOpen] = useState(false)
  const [newAccreditationBody, setNewAccreditationBody] = useState('')

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

  const [uncertaintyRow, setUncertaintyRow] = useState<TestParameterRow | null>(null)
  const [uncertaintyOpen, setUncertaintyOpen] = useState(false)
  const [uncertaintySaving, setUncertaintySaving] = useState(false)

  useEffect(() => {
    if (searchParams.get('openAdd') !== '1') return

    const isCodeId = searchParams.get('isCodeId') ?? ''
    const isCodeLabelParam = searchParams.get('isCodeLabel') ?? ''
    const departmentParam = searchParams.get('department') ?? ''
    const designationParam = searchParams.get('designation') ?? ''
    const isCodeRow = isCodes.find((c) => c.id === isCodeId)
    const base = emptyTestParameterForm()

    setSaveMessage(null)
    setEditingId(null)
    setForm({
      ...base,
      isCodeId,
      isCodeLabel: isCodeLabelParam || isCodeRow?.displayCode || '',
      testMethod: isCodeRow?.defaultTestMethod ?? base.testMethod,
      department: departmentParam || base.department,
      designation: designationParam || base.designation,
    })
    setShowForm(true)

    const next = new URLSearchParams(searchParams)
    next.delete('openAdd')
    next.delete('isCodeId')
    next.delete('isCodeLabel')
    next.delete('department')
    next.delete('designation')
    setSearchParams(next, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [searchParams, setSearchParams, isCodes])

  const canSave =
    !saveLoading &&
    normalizeText(form.itemName).length > 0

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

    try {
      const { data: abData, error: abErr } = await supabase
        .from('accreditation_bodies')
        .select('id, name, created_at')
        .order('name', { ascending: true })

      if (abErr) throw abErr
      setAccreditationBodies(Array.isArray(abData) ? (abData as AccreditationBodyRow[]) : [])
    } catch (err) {
      setAccreditationBodies([])
      errors.push(err instanceof Error ? err.message : 'Unable to load accreditation bodies')
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
    if (!showForm) return
    void loadUserManagementOptions()
  }, [showForm])

  useEffect(() => {
    if (form.underAccreditationIds?.length) return
    if (!accreditationBodies.length) return
    const defaultNabl = accreditationBodies.find((body) => body.name.trim().toLowerCase() === 'nabl')
    if (defaultNabl) {
      setForm((prev) => ({
        ...prev,
        underAccreditationIds: [defaultNabl.id],
      }))
    }
  }, [accreditationBodies, form.underAccreditationIds?.length])

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows

    return rows.filter((r) => {
      const blob = [
        r.is_code_label ?? '',
        r.test_method ?? '',
        r.clause_no ?? '',
        r.unit_value ?? '',
        r.item_name ?? '',
        r.specific_requirement ?? '',
        r.uncertainty_mu ?? '',
        r.department ?? '',
        r.designation ?? '',
      ]
        .join(' ')
        .toLowerCase()

      return blob.includes(q)
    })
  }, [rows, search])

  const sortedRows = useMemo(() => {
    const sortValue = (r: TestParameterRow): string => {
      switch (sortKey) {
        case 'isCode':
          return (r.is_code_label ?? '').trim().toLowerCase()
        case 'itemName':
          return (r.item_name ?? '').trim().toLowerCase()
        case 'testMethod':
          return [r.test_method, r.clause_no, r.unit_value].filter(Boolean).join(' ').trim().toLowerCase()
        case 'requirement':
          return (r.specific_requirement ?? '').trim().toLowerCase()
        case 'uncertainty':
          return (r.uncertainty_mu ?? '').trim().toLowerCase()
        case 'accreditation': {
          if (!r.under_accreditation_ids?.length) return ''
          return r.under_accreditation_ids
            .map((id) => accreditationBodies.find((b) => b.id === id)?.name ?? '')
            .filter(Boolean)
            .join(', ')
            .toLowerCase()
        }
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
  }, [filteredRows, sortKey, sortDir, accreditationBodies])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, page, pageSize])

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

  const handleNew = () => {
    setSaveMessage(null)
    setForm(emptyTestParameterForm())
    setEditingId(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleEdit = (row: TestParameterRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm({
      isCodeId: row.is_code_id ?? '',
      isCodeLabel: row.is_code_label ?? '',
      clauseNo: row.clause_no ?? '',
      unitValue: row.unit_value ?? '',
      testMethod: row.test_method ?? '',
      itemName: row.item_name ?? '',
      specificRequirement: row.specific_requirement ?? '',
      underAccreditationIds: row.under_accreditation_ids ?? [],
      uncertaintyMu: row.uncertainty_mu ?? '',
      department: row.department ?? '',
      designation: row.designation ?? '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = (row: TestParameterRow) => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({
      isCodeId: row.is_code_id ?? '',
      isCodeLabel: row.is_code_label ?? '',
      clauseNo: row.clause_no ?? '',
      unitValue: row.unit_value ?? '',
      testMethod: row.test_method ?? '',
      itemName: `${row.item_name ?? ''} - Copy`,
      specificRequirement: row.specific_requirement ?? '',
      underAccreditationIds: row.under_accreditation_ids ?? [],
      uncertaintyMu: row.uncertainty_mu ?? '',
      department: row.department ?? '',
      designation: row.designation ?? '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const isRow = isCodes.find((x) => x.id === form.isCodeId)

        const payload = {
          ...(editingId ? { id: editingId } : {}),
          is_code_id: form.isCodeId || null,
          is_code_label: normalizeText(form.isCodeLabel) || (isRow?.displayCode ?? null),
          clause_no: normalizeText(form.clauseNo) || null,
          unit_value: normalizeText(form.unitValue) || null,
          test_method: normalizeText(form.testMethod) || (isRow?.defaultTestMethod ?? null),
          item_name: toProperTitleCase(normalizeText(form.itemName)),
          specific_requirement: toProperTitleCase(normalizeText(form.specificRequirement)) || null,
          under_accreditation_ids: form.underAccreditationIds ?? [],
          uncertainty_mu: normalizeText(form.uncertaintyMu) || null,
          department: normalizeText(form.department) || null,
          designation: normalizeText(form.designation) || null,
        }

        if (editingId) {
          const { id: _id, ...updatePayload } = payload as { id: string; [k: string]: unknown }
          const { error } = await supabase.from('test_parameters').update(updatePayload).eq('id', editingId)
          if (error) throw error
        } else {
          const { id: _id, ...insertPayload } = payload as { id?: string; [k: string]: unknown }
          const { error } = await supabase.from('test_parameters').insert(insertPayload)
          if (error) throw error
        }

        setSaveMessage('Saved successfully.')
        setForm(emptyTestParameterForm())
        setEditingId(null)
        setShowForm(false)
        // Keep list page/search/scroll; only refresh rows after closing the form.
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
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

        setForm((prev) => ({
          ...prev,
          isCodeId: row.id,
          isCodeLabel: displayCode,
          testMethod: displayCode,
        }))
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

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) return
      const ok = window.confirm(`Delete ${selectedRows.length} selected record(s)?`)
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { error } = await supabase.from('test_parameters').delete().in('id', ids)
        if (error) throw error
        setSaveMessage('Deleted successfully.')
        setSelectedIds(new Set())
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
      'under_accreditation_ids',
      'uncertainty_mu',
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
      under_accreditation_ids: (r.under_accreditation_ids ?? []).join('|'),
      uncertainty_mu: r.uncertainty_mu ?? '',
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
    const fmtAccreditation = (r: TestParameterRow) => {
      if (!r.under_accreditation_ids?.length) return '—'
      return (
        r.under_accreditation_ids
          .map((id) => accreditationBodies.find((b) => b.id === id)?.name)
          .filter(Boolean)
          .join(', ') || '—'
      )
    }

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Test Parameters</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;padding:16px}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #ccc;padding:6px;vertical-align:top}th{background:#f5f5f5;font-weight:600}</style>
      </head><body><h2>Test Parameters</h2>
      <table><thead><tr>
        <th>IS Code</th><th>Name of the Test Parameter</th><th>Test Method</th><th>Specific Requirements</th><th>Uncertainty &amp; Acceptance Criteria</th><th>Under Accreditation</th>
      </tr><tr>
        <th>IS Code</th><th>Test Parameter</th><th>Test Method · Clause No · Unit</th><th>Specific Requirements</th><th>Uncertainty · Acceptance Criteria</th><th>Accreditation Bodies</th>
      </tr></thead><tbody>
      ${exportRows
        .map(
          (r) =>
            `<tr><td>${esc(r.is_code_label)}</td><td>${esc(r.item_name)}</td><td>${esc(r.test_method)}<br/><small>Clause: ${esc(r.clause_no)}</small><br/><small>Unit: ${esc(r.unit_value)}</small></td><td>${esc(r.specific_requirement)}</td><td>Uncertainty: ${esc(r.uncertainty_mu)}<br/><small>Acceptance Criteria: ${esc(r.acceptance_criteria ?? '-')}</small></td><td>${esc(fmtAccreditation(r))}</td></tr>`,
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

  const handleAddAccreditationBody = () => {
    const name = normalizeText(newAccreditationBody)
    if (!name) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('accreditation_bodies')
          .insert({ name })
          .select('id, name, created_at')
          .single()

        if (error) throw error

        const row = data as AccreditationBodyRow

        setAccreditationBodies((prev) => {
          const merged = [...prev, row]
          const uniq = new Map(merged.map((x) => [x.name.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.name.localeCompare(b.name))
        })

        setForm((prev) => ({
          ...prev,
          underAccreditationIds: Array.from(new Set([...(prev.underAccreditationIds ?? []), row.id])),
        }))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to add accreditation body')
      } finally {
        setNewAccreditationBody('')
        setAccreditationDialogOpen(false)
      }
    })()
  }

  const handleUpdateAccreditationBody = (id: string) => {
    const name = normalizeText(newAccreditationBody)
    if (!name) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('accreditation_bodies')
          .update({ name })
          .eq('id', id)
          .select('id, name, created_at')
          .single()

        if (error) throw error

        const row = data as AccreditationBodyRow
        setAccreditationBodies((prev) =>
          prev
            .map((b) => (b.id === id ? row : b))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to update accreditation body')
      } finally {
        setNewAccreditationBody('')
        setAccreditationDialogOpen(false)
      }
    })()
  }

  const handleDeleteAccreditationBody = (id: string) => {
    void (async () => {
      try {
        const { error } = await supabase.from('accreditation_bodies').delete().eq('id', id)
        if (error) throw error

        setAccreditationBodies((prev) => prev.filter((b) => b.id !== id))
        setForm((prev) => ({
          ...prev,
          underAccreditationIds: (prev.underAccreditationIds ?? []).filter((x) => x !== id),
        }))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete accreditation body')
      }
    })()
  }

  const handleOpenUncertainty = (row: TestParameterRow) => {
    const existingHistory = parseUncertaintyMuHistory(row.uncertainty_mu_history)
    const currentMu = row.uncertainty_mu?.trim() ?? ''
    if (existingHistory.length === 0 && currentMu) {
      const seeded: UncertaintyHistoryRecord[] = [
        {
          id: newUncertaintyHistoryId(),
          recordedAt: todayIsoDate(),
          uncertaintyMu: currentMu,
          calculationData:
            parseUncertaintyCalculationData(row.uncertainty_calculation_data, row.unit_value?.trim() ?? '') ??
            null,
          savedByName: '',
        },
      ]
      const seededRow = { ...row, uncertainty_mu_history: seeded }
      setUncertaintyRow(seededRow)
      setUncertaintyOpen(true)
      void (async () => {
        const { error } = await supabase
          .from('test_parameters')
          .update({ uncertainty_mu_history: seeded })
          .eq('id', row.id)
        if (!error) await loadRows()
      })()
      return
    }
    setUncertaintyRow(row)
    setUncertaintyOpen(true)
  }

  const handleSaveUncertainty = async (
    uncertaintyMu: string,
    calculationData: UncertaintyCalculationData,
  ) => {
    if (!uncertaintyRow) return
    setUncertaintySaving(true)
    setSaveMessage(null)
    try {
      const muText = normalizeText(uncertaintyMu) || null
      const previousHistory = parseUncertaintyMuHistory(uncertaintyRow.uncertainty_mu_history)
      const historyEntry: UncertaintyHistoryRecord = {
        id: newUncertaintyHistoryId(),
        recordedAt: todayIsoDate(),
        uncertaintyMu: muText ?? '',
        calculationData,
        savedByName: profileName.trim(),
      }
      const nextHistory = muText
        ? [historyEntry, ...previousHistory]
        : previousHistory

      const { error } = await supabase
        .from('test_parameters')
        .update({
          uncertainty_mu: muText,
          uncertainty_calculation_data: calculationData,
          uncertainty_mu_history: nextHistory,
        })
        .eq('id', uncertaintyRow.id)
      if (error) throw error
      setSaveMessage('Uncertainty (MU) saved.')
      setUncertaintyOpen(false)
      setUncertaintyRow(null)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setUncertaintySaving(false)
    }
  }

  const handleUncertaintyHistoryChange = async (next: UncertaintyHistoryRecord[]) => {
    if (!uncertaintyRow) return
    const { error } = await supabase
      .from('test_parameters')
      .update({ uncertainty_mu_history: next })
      .eq('id', uncertaintyRow.id)
    if (error) throw error
    setUncertaintyRow({ ...uncertaintyRow, uncertainty_mu_history: next })
    await loadRows()
  }

  return (
    <div className={limsPageShellClass}>
      <TestParameterHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={handleNew}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => void loadRows()}
        isCodeOptions={isCodeOptions}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            limsDialogClass,
            'max-h-[92vh] w-[calc(100%-1.5rem)] max-w-5xl p-0 sm:w-full',
            // Center in main content area (sidebar 268px stays clear)
            'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          )}
        >
          <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-6">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit Test Parameter' : 'Add New Test Parameter'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex max-h-[min(78vh,760px)] min-h-0 flex-col overflow-hidden bg-gradient-to-b from-stone-100/90 to-stone-50">
            {saveMessage && (
              <p
                className={cn(
                  'shrink-0 px-4 pt-3 text-sm sm:px-6',
                  saveMessage.toLowerCase().includes('success') || saveMessage.toLowerCase().includes('saved')
                    ? 'text-emerald-700'
                    : 'text-red-700',
                )}
              >
                {saveMessage}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <TestParameterForm
                form={form}
                onChange={setForm}
                canSave={canSave}
                saveLoading={saveLoading}
                onSave={handleSave}
                isCodes={isCodes}
                accreditationBodies={accreditationBodies}
                accreditationDialogOpen={accreditationDialogOpen}
                setAccreditationDialogOpen={setAccreditationDialogOpen}
                newAccreditationBody={newAccreditationBody}
                setNewAccreditationBody={setNewAccreditationBody}
                onAddAccreditationBody={handleAddAccreditationBody}
                onUpdateAccreditationBody={handleUpdateAccreditationBody}
                onDeleteAccreditationBody={handleDeleteAccreditationBody}
                onOpenAddIsCodeForm={openAddIsCodeForm}
                departments={departments}
                designations={designations}
                designationsByDepartment={designationsByDepartment}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      <TestParameterTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={handleEdit}
        onOpenUncertainty={handleOpenUncertainty}
        accreditationBodies={accreditationBodies}
        onAssistantDataChanged={() => void loadRows()}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />

      <TestParameterUncertaintyDialog
        row={uncertaintyRow}
        open={uncertaintyOpen}
        saving={uncertaintySaving}
        onOpenChange={(open) => {
          setUncertaintyOpen(open)
          if (!open) setUncertaintyRow(null)
        }}
        onSave={handleSaveUncertainty}
        onHistoryChange={handleUncertaintyHistoryChange}
        onAppliedToOthers={async () => {
          await loadRows()
        }}
      />

      <TestParameterTableFooterBar
        message={saveMessage}
        loading={saveLoading}
        selectedCount={selectedIds.size}
        onImport={handleImport}
        onExport={handleExport}
        onPrintSelected={handlePrintSelected}
        onDeleteSelected={handleDeleteSelected}
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
