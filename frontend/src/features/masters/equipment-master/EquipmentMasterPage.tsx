import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { limsDarkBarGlowStyle, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EquipmentHeaderBar } from './EquipmentHeaderBar'
import { EquipmentTable } from './EquipmentTable'
import { EquipmentFooterBar } from './EquipmentFooterBar'
import { EquipmentMasterForm } from './EquipmentMasterForm'
import { AddClientDialog } from './AddClientDialog'
import {
  emptyEquipmentForm,
  type EquipmentForm,
  type EquipmentRow,
  type Frequency,
  calculateNextDueDate,
  type EquipmentStatus,
  sanitizeDateStr,
  splitValueAndUnit,
  joinValueAndUnit,
} from './types'
import { parseMaintenanceChecklistFromDb } from './maintenanceChecklist'
import { parseMaintenanceHistoryFromDb } from './maintenanceHistory'
import { parseIntermediateCheckHistoryFromDb } from './intermediateCheckHistory'
import { fetchDesignationAndDepartmentLabels } from '@/features/settings/lab-settings/labMasterOptions'
import { EQUIPMENT_KIND_TESTING } from '@/lib/equipmentKind'

const BUCKET = 'equipment-files'

const formatSupabaseError = (err: unknown) => {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

export default function EquipmentMasterPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeFormSection, setActiveFormSection] = useState<'calibration' | 'intermediate' | 'maintenance' | null>(null)
  const [hideScheduleSections, setHideScheduleSections] = useState(false)
  
  const [showAddClientModal, setShowAddClientModal] = useState(false)
  const [targetClientField, setTargetClientField] = useState<'purchasedFrom' | 'externalCalibrationAgency' | null>(null)

  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange((open) => {
    setShowForm(open)
    if (!open) {
      setActiveFormSection(null)
      setHideScheduleSections(false)
    }
  })
  const [search, setSearch] = useState('')
  
  const [rows, setRows] = useState<EquipmentRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  // Dynamic lists
  const [clients, setClients] = useState<Array<{ id: string; company_name: string }>>([])
  const [employees, setEmployees] = useState<
    Array<{
      id: string
      full_name: string
      department_name: string | null
      designation: string | null
    }>
  >([])
  const [locations, setLocations] = useState<string[]>([])
  const [iqcMasters, setIqcMasters] = useState<any[]>([])

  // Master lists for mapping IDs to names in table
  const clientMap = useMemo(() => {
    const map: Record<string, string> = {}
    clients.forEach((c) => {
      map[c.id] = c.company_name
    })
    return map
  }, [clients])

  const employeeMap = useMemo(() => {
    const map: Record<string, string> = {}
    employees.forEach((emp) => {
      map[emp.id] = emp.full_name
    })
    return map
  }, [employees])

  const [form, setForm] = useState<EquipmentForm>(() => emptyEquipmentForm())

  const canSave =
    !saveLoading &&
    form.equipmentName.trim().length > 0 &&
    form.assetCode.trim().length > 0

  // Load dropdown lists
  const loadDropdowns = async () => {
    try {
      const [clientsRes, employeesRes, deptLabels] = await Promise.all([
        supabase.from('clients').select('id, company_name').order('company_name'),
        supabase
          .from('user_profiles')
          .select('id, full_name, department_name, designation')
          .order('full_name'),
        fetchDesignationAndDepartmentLabels().catch(() => ({
          designations: [] as string[],
          departments: [] as string[],
          divisions: [] as string[],
        })),
      ])

      if (clientsRes.error) throw clientsRes.error
      if (employeesRes.error) throw employeesRes.error

      setClients(clientsRes.data ?? [])
      setEmployees(employeesRes.data ?? [])
      setLocations((prev) => {
        const fromMaster = deptLabels.departments.map((d) => d.trim()).filter(Boolean)
        return Array.from(new Set([...fromMaster, ...prev])).sort((a, b) => a.localeCompare(b))
      })
    } catch (err) {
      console.error('Failed to load dropdown directories:', err)
    }
  }

  // Load equipment items
  const loadEquipment = async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data, error } = await supabase
        .from('equipment_master')
        .select('*')
        .eq('equipment_kind', EQUIPMENT_KIND_TESTING)
        .order('created_at', { ascending: false })

      if (error) throw error
      setRows((data as EquipmentRow[]) ?? [])

      // Dynamically extract locations
      if (data) {
        const uniqueDbLocations = Array.from(
          new Set(
            (data as EquipmentRow[])
              .map((r) => r.current_location)
              .filter((loc): loc is string => !!loc && loc.trim().length > 0)
          )
        )
        setLocations((prev) => {
          const merged = Array.from(new Set([...prev, ...uniqueDbLocations]))
          return merged.sort((a, b) => a.localeCompare(b))
        })
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load equipment')
    } finally {
      setListLoading(false)
    }
  }

  const loadIqcMasters = async () => {
    try {
      const { data, error } = await supabase
        .from('iqc_masters')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setIqcMasters(data ?? [])
    } catch (err) {
      console.warn('Failed to load IQC masters:', err)
    }
  }

  // Load both on mount
  useEffect(() => {
    void loadDropdowns()
    void loadEquipment()
    void loadIqcMasters()
  }, [])

  // Auto-numbering logic
  const generateNextAssetCode = async (): Promise<string> => {
    let prefix = 'EQ-'
    try {
      const { data } = await supabase
        .from('lab_prefixes')
        .select('prefix')
        .eq('name', 'Equipment ID')
        .maybeSingle()
      if (data?.prefix) {
        prefix = String(data.prefix).trim()
      }
    } catch (err) {
      console.warn('Could not load prefix, defaulting to EQ-', err)
    }

    // Parse existing asset codes to find max serial number for that prefix
    let maxSerial = 0
    rows.forEach((r) => {
      const code = r.asset_code || ''
      if (code.startsWith(prefix)) {
        const trailing = code.slice(prefix.length).replace(/\D/g, '')
        const num = parseInt(trailing, 10)
        if (!Number.isNaN(num) && num > maxSerial) {
          maxSerial = num
        }
      }
    })

    const nextSerial = maxSerial + 1
    return `${prefix}${String(nextSerial).padStart(4, '0')}`
  }

  // Handle viewing files by generating signed URLs
  const handleViewFile = async (storagePath: string, _fileName: string) => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10)
      if (error) throw error
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank')
      } else {
        alert('Could not generate download link.')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to load file')
    }
  }

  // Upload files helper
  const uploadAttachment = async (equipmentId: string, type: 'certificate' | 'manual', file: File): Promise<string> => {
    // Ensure bucket exists first
    try {
      await supabase.storage.createBucket(BUCKET, { public: false })
    } catch {
      // ignore bucket exists error
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${equipmentId}/${type}_${crypto.randomUUID()}_${safeName}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
    if (error) throw error
    return path
  }

  const handleSave = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const code = form.assetCode.trim().toUpperCase()
        if (!code) {
          setSaveMessage('Equipment ID / Asset Code is required.')
          setSaveLoading(false)
          return
        }

        const duplicate = rows.some(
          (r) =>
            r.asset_code.trim().toUpperCase() === code &&
            (!editingId || r.id !== editingId),
        )
        if (duplicate) {
          setSaveMessage(`Asset Code "${code}" already exists. Please use a unique code.`)
          setSaveLoading(false)
          return
        }

        const eqId = editingId || crypto.randomUUID()

        // Upload files if selected
        let certPath = form.uploadCertificatePath
        let manualPath = form.uploadManualSopPath

        if (form.certificateFile) {
          certPath = await uploadAttachment(eqId, 'certificate', form.certificateFile)
        }
        if (form.manualSopFile) {
          manualPath = await uploadAttachment(eqId, 'manual', form.manualSopFile)
        }

        const payload = {
          id: eqId,
          asset_code: code,
          equipment_name: form.equipmentName.trim(),
          manufacturer: form.manufacturer.trim() || null,
          model_number: form.modelNumber.trim() || null,
          serial_number: form.serialNumber.trim() || null,
          date_of_purchase: sanitizeDateStr(form.dateOfPurchase) || null,
          purchased_from: form.purchasedFrom || null,
          date_placed_in_service: sanitizeDateStr(form.datePlacedInService) || null,
          current_location: form.currentLocation || null,
          equipment_status: form.equipmentStatus,
          range_capacity: joinValueAndUnit(form.rangeCapacity, form.rangeCapacityUnit) || null,
          resolution_least_count:
            joinValueAndUnit(form.resolutionLeastCount, form.resolutionLeastCountUnit) || null,
          accuracy_acceptance_criteria:
            joinValueAndUnit(
              form.accuracyAcceptanceCriteria,
              form.accuracyAcceptanceCriteriaUnit,
            ) || null,
          calibration_frequency: form.calibrationFrequency || null,
          last_calibration_date: sanitizeDateStr(form.lastCalibrationDate) || null,
          next_calibration_due: sanitizeDateStr(form.nextCalibrationDue) || null,
          calibration_certificate_number: form.calibrationCertificateNumber.trim() || null,
          calibration_certificate_uncertainty: form.calibrationCertificateUncertainty.trim() || null,
          calibration_uncertainty_unit: form.calibrationUncertaintyUnit.trim() || null,
          calibration_coverage_factor: form.calibrationCoverageFactor.trim() || null,
          external_calibration_agency: form.externalCalibrationAgency || null,
          intermediate_check_frequency: form.intermediateCheckFrequency || null,
          last_intermediate_check_date: sanitizeDateStr(form.lastIntermediateCheckDate) || null,
          next_intermediate_check_date: sanitizeDateStr(form.nextIntermediateCheckDate) || null,
          intermediate_check_result: form.intermediateCheckResult.trim() || null,
          intermediate_check_history:
            form.intermediateCheckHistory.length > 0 ? form.intermediateCheckHistory : null,
          maintenance_schedule_frequency: form.maintenanceScheduleFrequency || null,
          last_maintenance_date: sanitizeDateStr(form.lastMaintenanceDate) || null,
          next_maintenance_date: sanitizeDateStr(form.nextMaintenanceDate) || null,
          maintenance_done_by: form.maintenanceDoneBy || null,
          maintenance_checklist:
            form.maintenanceChecklist.length > 0 ? form.maintenanceChecklist : null,
          maintenance_history:
            form.maintenanceHistory.length > 0 ? form.maintenanceHistory : null,
          history_of_damage: form.historyOfDamage.trim() || null,
          upload_certificate_path: certPath || null,
          upload_manual_sop_path: manualPath || null,
          custodian_employee_id: form.custodianEmployeeId || null,
          equipment_kind: EQUIPMENT_KIND_TESTING,
        }

        const { error } = await supabase.from('equipment_master').upsert(payload)
        if (error) throw error

        setSaveMessage('Saved successfully.')
        setForm(emptyEquipmentForm())
        setEditingId(null)
        setShowForm(false)
        await loadEquipment()
      } catch (err) {
        const msg = formatSupabaseError(err)
        if (/duplicate|unique|asset_code/i.test(msg)) {
          setSaveMessage('Asset Code must be unique. This code is already in use.')
        } else {
          setSaveMessage(msg)
        }
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleNew = () => {
    setSaveMessage(null)
    setForm(emptyEquipmentForm())
    setEditingId(null)
    setActiveFormSection(null)
    setHideScheduleSections(false)
    setShowForm(true)
  }

  const handleEdit = (
    row: EquipmentRow,
    section?: 'calibration' | 'intermediate' | 'maintenance' | 'details',
  ) => {
    setSaveMessage(null)
    setEditingId(row.id)
    const isDetailsOnly = section === 'details'
    setHideScheduleSections(isDetailsOnly)
    setActiveFormSection(
      section && section !== 'details' ? section : null,
    )
    const range = splitValueAndUnit(row.range_capacity)
    const resolution = splitValueAndUnit(row.resolution_least_count)
    const accuracy = splitValueAndUnit(row.accuracy_acceptance_criteria)
    setForm({
      assetCode: row.asset_code ?? '',
      equipmentName: row.equipment_name ?? '',
      manufacturer: row.manufacturer ?? '',
      modelNumber: row.model_number ?? '',
      serialNumber: row.serial_number ?? '',
      dateOfPurchase: row.date_of_purchase ?? '',
      purchasedFrom: row.purchased_from ?? '',
      datePlacedInService: row.date_placed_in_service ?? '',
      currentLocation: row.current_location ?? '',
      equipmentStatus: (row.equipment_status ?? 'Active') as EquipmentForm['equipmentStatus'],
      rangeCapacity: range.value,
      rangeCapacityUnit: range.unit,
      resolutionLeastCount: resolution.value,
      resolutionLeastCountUnit: resolution.unit,
      accuracyAcceptanceCriteria: accuracy.value,
      accuracyAcceptanceCriteriaUnit: accuracy.unit,
      calibrationFrequency: ((row.calibration_frequency ||
        (section === 'calibration' ? 'Yearly' : '')) ?? '') as Frequency,
      lastCalibrationDate: row.last_calibration_date ?? '',
      nextCalibrationDue: row.next_calibration_due ?? '',
      calibrationCertificateNumber: row.calibration_certificate_number ?? '',
      calibrationCertificateUncertainty: row.calibration_certificate_uncertainty ?? '',
      calibrationUncertaintyUnit: row.calibration_uncertainty_unit ?? '',
      calibrationCoverageFactor:
        row.calibration_coverage_factor ||
        (section === 'calibration' ? '2' : ''),
      externalCalibrationAgency: row.external_calibration_agency ?? '',
      intermediateCheckFrequency: (row.intermediate_check_frequency ?? '') as Frequency,
      lastIntermediateCheckDate: row.last_intermediate_check_date ?? '',
      nextIntermediateCheckDate: row.next_intermediate_check_date ?? '',
      intermediateCheckResult: row.intermediate_check_result ?? '',
      intermediateCheckHistory: parseIntermediateCheckHistoryFromDb(row.intermediate_check_history),
      maintenanceScheduleFrequency: (row.maintenance_schedule_frequency ?? '') as Frequency,
      lastMaintenanceDate: row.last_maintenance_date ?? '',
      nextMaintenanceDate: row.next_maintenance_date ?? '',
      maintenanceDoneBy: row.maintenance_done_by ?? '',
      maintenanceChecklist: parseMaintenanceChecklistFromDb(row.maintenance_checklist),
      maintenanceHistory: parseMaintenanceHistoryFromDb(row.maintenance_history),
      historyOfDamage: row.history_of_damage ?? '',
      uploadCertificatePath: row.upload_certificate_path ?? '',
      uploadManualSopPath: row.upload_manual_sop_path ?? '',
      custodianEmployeeId: row.custodian_employee_id ?? '',
      certificateFile: null,
      manualSopFile: null,
    })
    setShowForm(true)
  }

  useEffect(() => {
    const viewId = searchParams.get('view')?.trim()
    if (!viewId || listLoading || rows.length === 0) return
    const row = rows.find((r) => r.id === viewId)
    if (!row) return
    handleEdit(row, 'details')
    const next = new URLSearchParams(searchParams)
    next.delete('view')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once when list ready
  }, [searchParams, listLoading, rows])

  const handleCopy = (row: EquipmentRow) => {
    setSaveMessage(null)
    setEditingId(null) // copy resets id
    setActiveFormSection(null)
    setHideScheduleSections(false)
    const range = splitValueAndUnit(row.range_capacity)
    const resolution = splitValueAndUnit(row.resolution_least_count)
    const accuracy = splitValueAndUnit(row.accuracy_acceptance_criteria)
    setForm({
      assetCode: '', // required unique code — user must enter
      equipmentName: `${row.equipment_name} - Copy`,
      manufacturer: row.manufacturer ?? '',
      modelNumber: row.model_number ?? '',
      serialNumber: row.serial_number ?? '',
      dateOfPurchase: row.date_of_purchase ?? '',
      purchasedFrom: row.purchased_from ?? '',
      datePlacedInService: row.date_placed_in_service ?? '',
      currentLocation: row.current_location ?? '',
      equipmentStatus: (row.equipment_status ?? 'Active') as EquipmentForm['equipmentStatus'],
      rangeCapacity: range.value,
      rangeCapacityUnit: range.unit,
      resolutionLeastCount: resolution.value,
      resolutionLeastCountUnit: resolution.unit,
      accuracyAcceptanceCriteria: accuracy.value,
      accuracyAcceptanceCriteriaUnit: accuracy.unit,
      calibrationFrequency: (row.calibration_frequency ?? '') as Frequency,
      lastCalibrationDate: row.last_calibration_date ?? '',
      nextCalibrationDue: row.next_calibration_due ?? '',
      calibrationCertificateNumber: row.calibration_certificate_number ?? '',
      calibrationCertificateUncertainty: row.calibration_certificate_uncertainty ?? '',
      calibrationUncertaintyUnit: row.calibration_uncertainty_unit ?? '',
      calibrationCoverageFactor: row.calibration_coverage_factor ?? '',
      externalCalibrationAgency: row.external_calibration_agency ?? '',
      intermediateCheckFrequency: (row.intermediate_check_frequency ?? '') as Frequency,
      lastIntermediateCheckDate: row.last_intermediate_check_date ?? '',
      nextIntermediateCheckDate: row.next_intermediate_check_date ?? '',
      intermediateCheckResult: row.intermediate_check_result ?? '',
      intermediateCheckHistory: parseIntermediateCheckHistoryFromDb(row.intermediate_check_history),
      maintenanceScheduleFrequency: (row.maintenance_schedule_frequency ?? '') as Frequency,
      lastMaintenanceDate: row.last_maintenance_date ?? '',
      nextMaintenanceDate: row.next_maintenance_date ?? '',
      maintenanceDoneBy: row.maintenance_done_by ?? '',
      maintenanceChecklist: parseMaintenanceChecklistFromDb(row.maintenance_checklist),
      maintenanceHistory: parseMaintenanceHistoryFromDb(row.maintenance_history),
      historyOfDamage: row.history_of_damage ?? '',
      uploadCertificatePath: row.upload_certificate_path ?? '',
      uploadManualSopPath: row.upload_manual_sop_path ?? '',
      custodianEmployeeId: row.custodian_employee_id ?? '',
      certificateFile: null,
      manualSopFile: null,
    })
    setShowForm(true)
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const clientName = clientMap[r.purchased_from || ''] || ''
      const custodianName = employeeMap[r.custodian_employee_id || ''] || ''
      const blob = [
        r.equipment_name,
        r.asset_code,
        r.manufacturer ?? '',
        r.model_number ?? '',
        r.serial_number ?? '',
        r.current_location ?? '',
        r.equipment_status ?? '',
        r.range_capacity ?? '',
        r.resolution_least_count ?? '',
        r.accuracy_acceptance_criteria ?? '',
        clientName,
        custodianName,
      ].join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [rows, search, clientMap, employeeMap])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  // Context summary for QiAssistant
  const assistantContext = useMemo(() => {
    const active = rows.filter((r) => r.equipment_status === 'Active').length
    const repair = rows.filter((r) => r.equipment_status === 'In Repair').length
    return `Active Equipment: ${active}, In Repair: ${repair}, Total Registered: ${rows.length}. Search queries match name, code, make, or location.`
  }, [rows])

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

  const handlePrintSelected = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    if (exportRows.length === 0) return
    const html = buildEquipmentPrintHtml(exportRows, clientMap, employeeMap)

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

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) return
      const ok = window.confirm(`Delete ${selectedRows.length} selected equipment(s)?`)
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)

        // Delete associated files from storage first
        const filePaths: string[] = []
        selectedRows.forEach((r) => {
          if (r.upload_certificate_path) filePaths.push(r.upload_certificate_path)
          if (r.upload_manual_sop_path) filePaths.push(r.upload_manual_sop_path)
        })

        if (filePaths.length > 0) {
          try {
            await supabase.storage.from(BUCKET).remove(filePaths)
          } catch (stErr) {
            console.warn('Failed to delete storage files:', stErr)
          }
        }

        const { error } = await supabase.from('equipment_master').delete().in('id', ids)
        if (error) throw error

        setSaveMessage('Deleted successfully.')
        setSelectedIds(new Set())
        await loadEquipment()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete equipment')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleExport = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    const headers = [
      'asset_code',
      'equipment_name',
      'manufacturer',
      'model_number',
      'serial_number',
      'date_of_purchase',
      'purchased_from',
      'date_placed_in_service',
      'current_location',
      'equipment_status',
      'range_capacity',
      'resolution_least_count',
      'accuracy_acceptance_criteria',
      'calibration_frequency',
      'last_calibration_date',
      'next_calibration_due',
      'calibration_certificate_number',
      'calibration_certificate_uncertainty',
      'calibration_uncertainty_unit',
      'calibration_coverage_factor',
      'calibration_coverage_factor',
      'external_calibration_agency',
      'intermediate_check_frequency',
      'last_intermediate_check_date',
      'next_intermediate_check_date',
      'intermediate_check_result',
      'maintenance_schedule_frequency',
      'last_maintenance_date',
      'next_maintenance_date',
      'maintenance_done_by',
      'custodian_employee_id',
      'history_of_damage',
    ]

    const csvRows = exportRows.map((r) => {
      const supplier = clientMap[r.purchased_from || ''] || ''
      const agency = clientMap[r.external_calibration_agency || ''] || ''
      const maintUser = employeeMap[r.maintenance_done_by || ''] || ''
      const custodian = employeeMap[r.custodian_employee_id || ''] || ''

      return {
        asset_code: r.asset_code,
        equipment_name: r.equipment_name,
        manufacturer: r.manufacturer ?? '',
        model_number: r.model_number ?? '',
        serial_number: r.serial_number ?? '',
        date_of_purchase: r.date_of_purchase ?? '',
        purchased_from: supplier,
        date_placed_in_service: r.date_placed_in_service ?? '',
        current_location: r.current_location ?? '',
        equipment_status: r.equipment_status ?? '',
        range_capacity: r.range_capacity ?? '',
        resolution_least_count: r.resolution_least_count ?? '',
        accuracy_acceptance_criteria: r.accuracy_acceptance_criteria ?? '',
        calibration_frequency: r.calibration_frequency ?? '',
        last_calibration_date: r.last_calibration_date ?? '',
        next_calibration_due: r.next_calibration_due ?? '',
        calibration_certificate_number: r.calibration_certificate_number ?? '',
        calibration_certificate_uncertainty: r.calibration_certificate_uncertainty ?? '',
        calibration_uncertainty_unit: r.calibration_uncertainty_unit ?? '',
        calibration_coverage_factor: r.calibration_coverage_factor ?? '',
        external_calibration_agency: agency,
        intermediate_check_frequency: r.intermediate_check_frequency ?? '',
        last_intermediate_check_date: r.last_intermediate_check_date ?? '',
        next_intermediate_check_date: r.next_intermediate_check_date ?? '',
        intermediate_check_result: r.intermediate_check_result ?? '',
        maintenance_schedule_frequency: r.maintenance_schedule_frequency ?? '',
        last_maintenance_date: r.last_maintenance_date ?? '',
        next_maintenance_date: r.next_maintenance_date ?? '',
        maintenance_done_by: maintUser,
        custodian_employee_id: custodian,
        history_of_damage: r.history_of_damage ?? '',
      }
    })

    const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`
    const out: string[] = []
    out.push(headers.map(escape).join(','))

    for (const r of csvRows) {
      out.push(headers.map((h) => escape(String((r as any)[h] ?? ''))).join(','))
    }

    const blob = new Blob([out.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'equipment_master.csv'
    a.click()
    URL.revokeObjectURL(url)
    setSaveMessage('Exported successfully.')
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
        const rowsParsed = parseCsv(text)
        if (rowsParsed.length === 0) {
          setSaveMessage('No rows found in CSV.')
          return
        }

        const header = rowsParsed[0].map((h) => h.trim().toLowerCase())
        const rowsData = rowsParsed.slice(1).filter((r) => r.some((c) => String(c ?? '').trim().length > 0))

        // Find IDs of Clients & User Profiles for mapping names back to IDs during import
        const findClientUuid = (name: string): string | null => {
          const matched = clients.find((c) => c.company_name.trim().toLowerCase() === name.trim().toLowerCase())
          return matched ? matched.id : null
        }

        const findEmployeeUuid = (name: string): string | null => {
          const matched = employees.find((emp) => emp.full_name.trim().toLowerCase() === name.trim().toLowerCase())
          return matched ? matched.id : null
        }

        const payloads = []
        for (const cells of rowsData) {
          const get = (key: string) => {
            const idx = header.indexOf(key)
            return idx >= 0 ? (cells[idx] ?? '') : ''
          }

          const eqName = get('equipment_name').trim()
          if (!eqName) continue

          const supplierName = get('purchased_from')
          const agencyName = get('external_calibration_agency')
          const maintEmpName = get('maintenance_done_by')
          const custodianEmpName = get('custodian_employee_id')

          // Auto-calculate code if not provided
          let assetCode = get('asset_code').trim()
          if (!assetCode) {
            assetCode = await generateNextAssetCode()
          }

          const lastCal = get('last_calibration_date')
          const calFreq = get('calibration_frequency') as Frequency
          const nextCal = get('next_calibration_due') || calculateNextDueDate(lastCal, calFreq)

          const lastCheck = get('last_intermediate_check_date')
          const checkFreq = get('intermediate_check_frequency') as Frequency
          const nextCheck = get('next_intermediate_check_date') || calculateNextDueDate(lastCheck, checkFreq)

          const lastMaint = get('last_maintenance_date')
          const maintFreq = get('maintenance_schedule_frequency') as Frequency
          const nextMaint = get('next_maintenance_date') || calculateNextDueDate(lastMaint, maintFreq)

          payloads.push({
            asset_code: assetCode,
            equipment_name: eqName,
            manufacturer: get('manufacturer') || null,
            model_number: get('model_number') || null,
            serial_number: get('serial_number') || null,
            date_of_purchase: get('date_of_purchase') || null,
            purchased_from: supplierName ? findClientUuid(supplierName) : null,
            date_placed_in_service: get('date_placed_in_service') || null,
            current_location: get('current_location') || null,
            equipment_status: (get('equipment_status') || 'Active') as EquipmentStatus,
            range_capacity: get('range_capacity') || null,
            resolution_least_count: get('resolution_least_count') || null,
            accuracy_acceptance_criteria: get('accuracy_acceptance_criteria') || null,
            calibration_frequency: calFreq || null,
            last_calibration_date: lastCal || null,
            next_calibration_due: nextCal || null,
            calibration_certificate_number: get('calibration_certificate_number') || null,
            calibration_certificate_uncertainty: get('calibration_certificate_uncertainty') || null,
            calibration_uncertainty_unit: get('calibration_uncertainty_unit') || null,
            calibration_coverage_factor: get('calibration_coverage_factor') || null,
            external_calibration_agency: agencyName ? findClientUuid(agencyName) : null,
            intermediate_check_frequency: checkFreq || null,
            last_intermediate_check_date: lastCheck || null,
            next_intermediate_check_date: nextCheck || null,
            intermediate_check_result: get('intermediate_check_result') || null,
            maintenance_schedule_frequency: maintFreq || null,
            last_maintenance_date: lastMaint || null,
            next_maintenance_date: nextMaint || null,
            maintenance_done_by: maintEmpName ? findEmployeeUuid(maintEmpName) : null,
            custodian_employee_id: custodianEmpName ? findEmployeeUuid(custodianEmpName) : null,
            history_of_damage: get('history_of_damage') || null,
            equipment_kind: EQUIPMENT_KIND_TESTING,
          })
        }

        if (payloads.length === 0) {
          setSaveMessage('No valid rows found in CSV.')
          return
        }

        const { error } = await supabase.from('equipment_master').upsert(payloads, { onConflict: 'asset_code' })
        if (error) throw error

        setSaveMessage(`Imported ${payloads.length} equipment item(s) successfully.`)
        await loadEquipment()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  return (
    <div className={limsPageShellClass}>
      <EquipmentHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={handleNew}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => void loadEquipment()}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          portalClassName="!items-stretch !justify-start md:pl-0"
          className={cn(
            'gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-white p-0 shadow-2xl ring-2 ring-amber-700/40 sm:rounded-none',
            '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
            '!flex h-[100dvh] max-h-[100dvh] w-full !max-w-none !translate-x-0 !translate-y-0 flex-col',
            'left-0 top-0',
            'lg:!left-[268px] lg:!right-0 lg:!w-[calc(100vw-268px)] lg:!max-w-[calc(100vw-268px)]',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <DialogTitle className="min-w-0 shrink text-base font-semibold tracking-tight text-white sm:text-lg">
                  {activeFormSection
                    ? `Edit ${activeFormSection.charAt(0).toUpperCase() + activeFormSection.slice(1)} Details`
                    : hideScheduleSections
                      ? 'Equipment Details'
                      : editingId
                        ? 'Edit Equipment Details'
                        : 'Add New Equipment'}
                </DialogTitle>
                {form.equipmentName.trim() ? (
                  <p
                    className="max-w-[50%] truncate text-right text-sm font-medium text-amber-200/95 sm:text-base"
                    title={form.equipmentName}
                  >
                    {form.equipmentName}
                  </p>
                ) : null}
              </div>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
            {saveMessage ? (
              <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            ) : null}
            <EquipmentMasterForm
              form={form}
              onChange={setForm}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={handleSave}
              clients={clients}
              employees={employees}
              locations={locations}
              onViewFile={handleViewFile}
              activeSection={activeFormSection}
              hideScheduleSections={hideScheduleSections}
              readOnly={hideScheduleSections}
              onClose={() => handleFormOpenChange(false)}
              onAddNewClientClick={(field) => {
                setTargetClientField(field)
                setShowAddClientModal(true)
              }}
              equipments={rows}
              iqcMasters={iqcMasters}
            />
          </div>
        </DialogContent>
      </Dialog>

      <AddClientDialog
        open={showAddClientModal}
        onOpenChange={setShowAddClientModal}
        onClientSaved={async (newClientId) => {
          await loadDropdowns()
          if (targetClientField) {
            setForm((prev) => ({
              ...prev,
              [targetClientField]: newClientId,
            }))
          }
          setTargetClientField(null)
        }}
      />

      <EquipmentTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={handleEdit}
        onCopy={handleCopy}
        employeeMap={employeeMap}
      />

      <EquipmentFooterBar
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

function parseCsv(text: string): string[][] {
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

    if (ch === '\r') {
      continue
    }

    cell += ch
  }

  if (cell.length > 0 || row.length > 0) {
    flushRow()
  }

  return rows.map((r) => r.map((c) => c.trim()))
}

function buildEquipmentPrintHtml(
  rows: EquipmentRow[],
  clientMap: Record<string, string>,
  employeeMap: Record<string, string>
) {
  const esc = (v: string) =>
    v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

  const cards = rows
    .map((r) => {
      const supplierName = clientMap[r.purchased_from || ''] || '-'
      const agencyName = clientMap[r.external_calibration_agency || ''] || '-'
      const custodianName = employeeMap[r.custodian_employee_id || ''] || '-'
      const maintName = employeeMap[r.maintenance_done_by || ''] || '-'

      return `
        <section class="card">
          <div class="card-header">
            <div>
              <div class="title">${esc(r.equipment_name)}</div>
              <div class="subtitle">Asset Code: ${esc(r.asset_code)} | Status: ${esc(r.equipment_status ?? 'Active')}</div>
            </div>
            <div class="badge">${esc(r.current_location || 'No Location')}</div>
          </div>
          <div class="grid">
            <div class="field"><div class="k">Make / Model / Serial</div><div class="v">${esc(r.manufacturer || '-')} / ${esc(r.model_number || '-')} / ${esc(r.serial_number || '-')}</div></div>
            <div class="field"><div class="k">Custodian / In-charge</div><div class="v">${esc(custodianName)}</div></div>
            <div class="field"><div class="k">Purchased From / Date</div><div class="v">${esc(supplierName)} / ${esc(r.date_of_purchase || '-')}</div></div>
            <div class="field"><div class="k">Date Placed in Service</div><div class="v">${esc(r.date_placed_in_service || '-')}</div></div>
            
            <div class="field"><div class="k">Range / Capacity</div><div class="v">${esc(r.range_capacity || '-')}</div></div>
            <div class="field"><div class="k">Resolution / Least Count</div><div class="v">${esc(r.resolution_least_count || '-')}</div></div>
            
            <div class="field span2"><div class="k">Accuracy / Acceptance Criteria</div><div class="v">${esc(r.accuracy_acceptance_criteria || '-')}</div></div>

            <div class="field border-cal"><div class="k">Last Calibration Date</div><div class="v">${esc(r.last_calibration_date || '-')}</div></div>
            <div class="field border-cal"><div class="k">Next Calibration Due</div><div class="v font-bold">${esc(r.next_calibration_due || '-')}</div></div>
            
            <div class="field"><div class="k">Calibration Certificate</div><div class="v">${esc(r.calibration_certificate_number || '-')}</div></div>
            <div class="field"><div class="k">Calibration Uncertainty</div><div class="v">${esc(r.calibration_certificate_uncertainty || '-')}${r.calibration_uncertainty_unit ? ` ${esc(r.calibration_uncertainty_unit)}` : ''}</div></div>
            <div class="field"><div class="k">External Calibration Agency</div><div class="v">${esc(agencyName)}</div></div>
            
            <div class="field"><div class="k">Intermediate Check (Freq / Last / Next)</div><div class="v">${esc(r.intermediate_check_frequency || '-')}: ${esc(r.last_intermediate_check_date || '-')} / ${esc(r.next_intermediate_check_date || '-')}</div></div>
            <div class="field"><div class="k">Maintenance (Freq / Last / Next / Done By)</div><div class="v">${esc(r.maintenance_schedule_frequency || '-')}: ${esc(r.last_maintenance_date || '-')} / ${esc(r.next_maintenance_date || '-')} by ${esc(maintName)}</div></div>

            <div class="field span2"><div class="k">History of Damage/Malfunction</div><div class="v">${esc(r.history_of_damage || '-')}</div></div>
          </div>
        </section>
      `
    })
    .join('')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Equipment Print Preview</title>
      <style>
        :root{--fg:#0b1220;--muted:#5b6473;--border:#e7eaf0;--bg:#ffffff;--chip:#f5f7fb;--header:#0f172a;--accent:#2563eb}
        *{box-sizing:border-box}
        body{margin:24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; color:var(--fg); background:linear-gradient(180deg,#ffffff 0%, #fbfcff 100%)}
        .wrap{display:flex;flex-direction:column;gap:16px}
        .card{border:1px solid var(--border);border-radius:14px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;box-shadow:0 1px 0 rgba(15,23,42,.04)}
        .card-header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:14px 16px;margin-bottom:0;background:linear-gradient(90deg,#0f172a 0%, #111827 60%, #0b1220 100%);color:#fff}
        .title{font-size:18px;font-weight:700;line-height:1.2}
        .subtitle{font-size:12px;opacity:.85;margin-top:2px}
        .badge{font-size:12px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);padding:6px 10px;border-radius:999px;white-space:nowrap}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px 16px}
        .field{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:#fff}
        .field .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
        .field .v{font-size:13px;margin-top:4px}
        .border-cal{border-color:#bbf7d0; background:#f0fdf4}
        .span2{grid-column:span 2}
        @media print{body{margin:0;background:#fff} .card{border-radius:0; box-shadow:none; border-left:none;border-right:none} .card-header{border-bottom:1px solid var(--border)}}
      </style>
    </head>
    <body>
      <div class="wrap">${cards}</div>
      <script>
        window.addEventListener('load', function () {
          setTimeout(function () {
            try { window.focus(); window.print(); } catch (e) {}
          }, 250);
        });
      </script>
    </body>
  </html>`
}
