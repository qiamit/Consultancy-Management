import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import { supabase } from '@/lib/supabaseClient'
import {
  formatIsCodeLabelFromParts,
  formatTestMethodWithYear,
} from '@/features/masters/is-codes/formatIsCodeLabel'
import { fetchDesignationAndDepartmentLabels } from '@/features/settings/lab-settings/labMasterOptions'
import { TestParameterForm } from './TestParameterForm'
import {
  emptyTestParameterForm,
  normalizeText,
  type TestParameterForm as TestParameterFormState,
} from './types'

export type AddedTestParameterInfo = {
  id: string
  label: string
  specificRequirement: string
  underAccreditation: string
  testMethod: string | null
  clauseNo: string | null
  unitValue: string | null
  uncertaintyMu: string | null
  isCodeId: string | null
  isCodeLabel: string | null
  department: string | null
}

export function AddTestParameterNestedDialog({
  open,
  onOpenChange,
  prefill,
  onSaved,
  layer = 'nested',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefill?: {
    isCodeId?: string | null
    isCodeLabel?: string | null
    department?: string | null
    designation?: string | null
  }
  onSaved?: (param: AddedTestParameterInfo) => void
  /** Use `stacked` when opening above an already-nested dialog (e.g. Manage Tests). */
  layer?: 'nested' | 'stacked' | 'top'
}) {
  const [form, setForm] = useState<TestParameterFormState>(() => emptyTestParameterForm())
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isCodes, setIsCodes] = useState<
    Array<{ id: string; displayCode: string; searchLabel: string; defaultTestMethod: string }>
  >([])
  const [departments, setDepartments] = useState<string[]>([])
  const [designations, setDesignations] = useState<string[]>([])
  const [designationsByDepartment, setDesignationsByDepartment] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (!open) return
    setSaveMessage(null)
    const base = emptyTestParameterForm()
    const isCodeId = prefill?.isCodeId?.trim() ?? ''
    const isCodeLabel = prefill?.isCodeLabel?.trim() ?? ''
    setForm({
      ...base,
      isCodeId,
      isCodeLabel,
      testMethod: isCodeLabel || base.testMethod,
      department: prefill?.department?.trim() || base.department,
      designation: prefill?.designation?.trim() || base.designation,
    })

    void (async () => {
      try {
        const [{ data: isData }, labels] = await Promise.all([
          supabase.from('is_codes').select('id, is_number, title, revision_year').order('created_at', { ascending: false }),
          fetchDesignationAndDepartmentLabels(),
        ])

        const isList = Array.isArray(isData)
          ? (isData as Array<{ id: string; is_number: string; title: string; revision_year: string | null }>)
          : []
        setIsCodes(
          isList
            .map((r) => {
              const displayCode = formatIsCodeLabelFromParts(r.is_number, r.revision_year)
              return {
                id: r.id,
                displayCode,
                searchLabel: r.title ? `${displayCode} — ${r.title}` : displayCode,
                defaultTestMethod: displayCode,
              }
            })
            .sort((a, b) => a.searchLabel.localeCompare(b.searchLabel)),
        )
        setDepartments(labels.departments)
        setDesignations(labels.designations)
        try {
          const raw = window.localStorage.getItem('userManagement.designationByDepartment')
          if (raw) {
            const parsed = JSON.parse(raw) as unknown
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              setDesignationsByDepartment(parsed as Record<string, string[]>)
            }
          }
        } catch {
          setDesignationsByDepartment({})
        }
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      }
    })()
  }, [open, prefill?.isCodeId, prefill?.isCodeLabel, prefill?.department, prefill?.designation])

  const canSave = !saveLoading && normalizeText(form.itemName).length > 0

  const handleSave = () => {
    void (async () => {
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        const isRow = isCodes.find((x) => x.id === form.isCodeId)
        const payload = {
          is_code_id: form.isCodeId || null,
          is_code_label: normalizeText(form.isCodeLabel) || (isRow?.displayCode ?? null),
          clause_no: normalizeText(form.clauseNo) || null,
          unit_value: normalizeText(form.unitValue) || null,
          test_method:
            formatTestMethodWithYear(
              normalizeText(form.testMethod) || isRow?.defaultTestMethod,
              isRow?.displayCode ?? form.isCodeLabel,
            ) || null,
          item_name: normalizeText(form.itemName),
          specific_requirement: normalizeText(form.specificRequirement) || null,
          under_accreditation_ids: [],
          uncertainty_mu: null,
          department: normalizeText(form.department) || null,
          designation: normalizeText(form.designation) || null,
        }
        const { data, error } = await supabase
          .from('test_parameters')
          .insert(payload)
          .select(
            'id, item_name, specific_requirement, department, designation, is_code_id, is_code_label, test_method, clause_no, unit_value',
          )
          .single()
        if (error) throw error

        const row = data as {
          id: string
          item_name: string | null
          specific_requirement: string | null
          department: string | null
          designation: string | null
          is_code_id: string | null
          is_code_label: string | null
          test_method: string | null
          clause_no: string | null
          unit_value: string | null
        }

        onSaved?.({
          id: row.id,
          label: row.item_name ?? row.id,
          specificRequirement: row.specific_requirement ?? '',
          underAccreditation: 'Not Accredited',
          testMethod: row.test_method ?? null,
          clauseNo: row.clause_no ?? null,
          unitValue: row.unit_value ?? null,
          uncertaintyMu: null,
          isCodeId: row.is_code_id ?? null,
          isCodeLabel: row.is_code_label || isRow?.displayCode || null,
          department: row.department ?? null,
        })
        onOpenChange(false)
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer={layer}
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'max-h-[92vh] w-[calc(100%-1.5rem)] max-w-[51.2rem] p-0 sm:w-full',
          'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-6">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Add New Test Parameter
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="flex max-h-[min(78vh,760px)] min-h-0 flex-col overflow-hidden bg-gradient-to-b from-stone-100/90 to-stone-50">
          {saveMessage ? (
            <p className="shrink-0 px-4 pt-3 text-sm text-red-700 sm:px-6">{saveMessage}</p>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <TestParameterForm
              form={form}
              onChange={setForm}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={handleSave}
              isCodes={isCodes}
              onOpenAddIsCodeForm={() => {
                setSaveMessage(
                  'Add IS Code from Test Parameter master if needed; this allotment already has an IS Code.',
                )
              }}
              departments={departments}
              designations={designations}
              designationsByDepartment={designationsByDepartment}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
