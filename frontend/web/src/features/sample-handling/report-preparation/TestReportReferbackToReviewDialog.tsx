import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabaseClient'
import {
  fetchReportPrepSectionsForReferback,
  type ReportPrepSectionOption,
} from './fetchReportPrepSectionsForReferback'
import type { ReportPrepReferbackTarget } from './referbackFromReportPreparation'

type ReviewUser = { id: string; name: string; designation: string; departmentName: string }

const TARGET_OPTIONS: Array<{ value: ReportPrepReferbackTarget; label: string; hint: string }> = [
  {
    value: 'results_review',
    label: 'Results Under Review',
    hint: 'Clears approval and sends the section back for results review. Test results are kept.',
  },
  {
    value: 'under_testing',
    label: 'Sample Under Testing',
    hint: 'Send back for result correction. Test data is kept.',
  },
  {
    value: 'test_allocation',
    label: 'Test Allocation',
    hint: 'Re-open test allocation for this section. Parameters and results are kept.',
  },
  {
    value: 'allocation',
    label: 'Sample Allocation',
    hint: 'Remove test allocation for this section; section code stays for re-assignment.',
  },
  {
    value: 'receiving',
    label: 'Sample Receiving',
    hint: 'Remove section from allocation and unlock Sample Receiving when applicable.',
  },
]

const DEFAULT_TESTING_DESIGNATION = 'Testing Engineer'
const norm = (s: string) => (s ?? '').trim().toLowerCase()

function designationOptionsForDepartment(users: ReviewUser[], department: string): string[] {
  if (!department.trim()) return []
  const deptNorm = norm(department)
  try {
    const raw =
      typeof window !== 'undefined' ? window.localStorage.getItem('userManagement.designationByDepartment') : null
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string[]>
      if (parsed && typeof parsed === 'object') {
        const key = Object.keys(parsed).find((k) => norm(k) === deptNorm)
        if (key && Array.isArray(parsed[key])) {
          return [...parsed[key]].sort((a, b) => a.localeCompare(b))
        }
      }
    }
  } catch {
    /* ignore */
  }
  const set = new Set(
    users.filter((u) => norm(u.departmentName) === deptNorm).map((u) => u.designation).filter(Boolean),
  )
  return [...set].sort((a, b) => a.localeCompare(b))
}

function sectionLabel(s: ReportPrepSectionOption): string {
  const code = s.sectionCode?.trim() || '—'
  const dept = s.department?.trim()
  return dept ? `${code} — ${dept}` : code
}

export const REFERBACK_ALL_SECTIONS_VALUE = '__all_sections__'

export type TestReportReferbackSectionRef = {
  sampleAllocationId: string
  testAllocationId: string
}

export type TestReportReferbackSubmitPayload = {
  sections: TestReportReferbackSectionRef[]
  targetStage: ReportPrepReferbackTarget
  remark: string
  assignee?: { id: string; name: string }
}

export function TestReportReferbackToReviewDialog({
  open,
  onOpenChange,
  sampleId,
  srfNumber,
  onSubmit,
  submitLoading,
  submitError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string | null
  srfNumber: string | null
  onSubmit: (payload: TestReportReferbackSubmitPayload) => Promise<void>
  submitLoading: boolean
  submitError: string | null
}) {
  const [sectionOptions, setSectionOptions] = useState<ReportPrepSectionOption[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [users, setUsers] = useState<ReviewUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [sampleAllocationId, setSampleAllocationId] = useState('')
  const [targetStage, setTargetStage] = useState<ReportPrepReferbackTarget>('results_review')
  const [remark, setRemark] = useState('')
  const [designation, setDesignation] = useState(DEFAULT_TESTING_DESIGNATION)
  const [employeeId, setEmployeeId] = useState('')

  const srfLabel = srfNumber?.trim() || '—'

  const selectedSections = useMemo(() => {
    if (sampleAllocationId === REFERBACK_ALL_SECTIONS_VALUE) return sectionOptions
    const one = sectionOptions.find((s) => s.sampleAllocationId === sampleAllocationId)
    return one ? [one] : []
  }, [sectionOptions, sampleAllocationId])

  const selectedSection = selectedSections[0] ?? null

  const department = selectedSection?.department?.trim() ?? ''
  const needsTestingAssignee = targetStage === 'under_testing'
  const needsTestAllocation =
    targetStage === 'results_review' || targetStage === 'under_testing' || targetStage === 'test_allocation'

  useEffect(() => {
    if (!open || !sampleId) {
      setSectionOptions([])
      setSampleAllocationId('')
      setTargetStage('results_review')
      setRemark('')
      setDesignation(DEFAULT_TESTING_DESIGNATION)
      setEmployeeId('')
      return
    }

    let canceled = false
    setSectionsLoading(true)
    void fetchReportPrepSectionsForReferback(sampleId)
      .then((opts) => {
        if (canceled) return
        setSectionOptions(opts)
        const first = opts[0]
        setSampleAllocationId(first?.sampleAllocationId ?? '')
        setTargetStage('results_review')
        setRemark('')
        setDesignation(DEFAULT_TESTING_DESIGNATION)
        setEmployeeId('')
      })
      .catch(() => {
        if (!canceled) {
          setSectionOptions([])
          setSampleAllocationId('')
        }
      })
      .finally(() => {
        if (!canceled) setSectionsLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [open, sampleId])

  useEffect(() => {
    if (!open || !needsTestingAssignee) return
    let canceled = false
    setUsersLoading(true)
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, full_name, designation, department_name, status')
          .order('full_name', { ascending: true })
        if (error) throw error
        if (canceled) return
        const list = Array.isArray(data) ? data : []
        setUsers(
          list
            .filter((u) => String((u as { status?: string }).status ?? '').toLowerCase() !== 'inactive')
            .map((u) => ({
              id: String((u as { id: string }).id),
              name: String((u as { full_name?: string }).full_name ?? '').trim() || String((u as { id: string }).id),
              designation: String((u as { designation?: string }).designation ?? '').trim(),
              departmentName: String((u as { department_name?: string }).department_name ?? '').trim(),
            })),
        )
      } catch {
        if (!canceled) setUsers([])
      } finally {
        if (!canceled) setUsersLoading(false)
      }
    })()
    return () => {
      canceled = true
    }
  }, [open, needsTestingAssignee])

  useEffect(() => {
    if (!open || targetStage !== 'under_testing') return
    setDesignation(DEFAULT_TESTING_DESIGNATION)
    setEmployeeId('')
  }, [open, targetStage])

  const designationOptions = useMemo(() => {
    const fromUsers = designationOptionsForDepartment(users, department)
    const merged = new Set([DEFAULT_TESTING_DESIGNATION, ...fromUsers])
    if (designation.trim()) merged.add(designation.trim())
    return [...merged].sort((a, b) => a.localeCompare(b))
  }, [users, department, designation])

  const employeeOptions = useMemo(() => {
    if (!department || !designation) return []
    const dept = norm(department)
    const des = norm(designation)
    return users.filter((u) => norm(u.departmentName) === dept && norm(u.designation) === des)
  }, [users, department, designation])

  const targetHint = TARGET_OPTIONS.find((o) => o.value === targetStage)?.hint ?? ''
  const testAllocationMissing =
    needsTestAllocation &&
    selectedSections.some((s) => !s.testAllocationId?.trim())

  const submitReady =
    selectedSections.length > 0 &&
    remark.trim().length > 0 &&
    !testAllocationMissing &&
    (!needsTestingAssignee || Boolean(employeeId))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!submitReady || selectedSections.length === 0) return

    const person = needsTestingAssignee ? employeeOptions.find((u) => u.id === employeeId) : undefined
    if (needsTestingAssignee && !person) return

    await onSubmit({
      sections: selectedSections.map((s) => ({
        sampleAllocationId: s.sampleAllocationId,
        testAllocationId: s.testAllocationId?.trim() ?? '',
      })),
      targetStage,
      remark: remark.trim(),
      assignee: person ? { id: person.id, name: person.name } : undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Refer back section</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          SRF <span className="font-medium text-foreground">{srfLabel}</span> — choose section, destination stage,
          and reason. Only workflow fields needed for refer-back are updated; test results stay unless you send
          the section to Sample Allocation or Sample Receiving.
        </p>
        <form className="space-y-4 py-2" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-2">
            <Label htmlFor="prep-referback-section">Section code</Label>
            {sectionsLoading ? (
              <p className="text-sm text-muted-foreground">Loading section codes…</p>
            ) : sectionOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No section codes found on this SRF.</p>
            ) : (
              <Select value={sampleAllocationId || undefined} onValueChange={setSampleAllocationId}>
                <SelectTrigger id="prep-referback-section" aria-label="Section code">
                  <SelectValue placeholder="Select section code" />
                </SelectTrigger>
                <SelectContent>
                  {sectionOptions.length >= 2 ? (
                    <SelectItem value={REFERBACK_ALL_SECTIONS_VALUE}>
                      Both section codes ({sectionOptions.map((s) => s.sectionCode).join(', ')})
                    </SelectItem>
                  ) : null}
                  {sectionOptions.map((s) => (
                    <SelectItem key={s.sampleAllocationId} value={s.sampleAllocationId}>
                      {sectionLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="prep-referback-target">Refer back to</Label>
            <Select
              value={targetStage}
              onValueChange={(v) => setTargetStage(v as ReportPrepReferbackTarget)}
              disabled={!sampleAllocationId}
            >
              <SelectTrigger id="prep-referback-target" aria-label="Refer back to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {targetHint ? <p className="text-xs text-muted-foreground">{targetHint}</p> : null}
            {testAllocationMissing ? (
              <p className="text-xs text-destructive">
                This section has no test allocation. Choose Sample Allocation or Sample Receiving.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="prep-referback-remark">Remark</Label>
            <Textarea
              id="prep-referback-remark"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Why are you referring back this section?"
              rows={3}
              className="resize-y min-h-[80px]"
            />
          </div>

          {needsTestingAssignee && selectedSections.length > 0 ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assign testing engineer
              </p>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={department || 'dept'} disabled>
                  <SelectTrigger aria-label="Department">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {department ? (
                      <SelectItem value={department}>{department}</SelectItem>
                    ) : (
                      <SelectItem value="dept">—</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Designation</Label>
                <Select
                  value={designation}
                  onValueChange={(v) => {
                    setDesignation(v)
                    setEmployeeId('')
                  }}
                  disabled={!department}
                >
                  <SelectTrigger aria-label="Designation">
                    <SelectValue placeholder="Select designation" />
                  </SelectTrigger>
                  <SelectContent>
                    {designationOptions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Name of employee</Label>
                <Select
                  value={employeeId}
                  onValueChange={setEmployeeId}
                  disabled={!designation || usersLoading || employeeOptions.length === 0}
                >
                  <SelectTrigger aria-label="Select employee">
                    <SelectValue
                      placeholder={
                        usersLoading
                          ? 'Loading users…'
                          : employeeOptions.length === 0
                            ? 'No user for this department & designation'
                            : 'Select employee'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!submitReady || submitLoading || sectionOptions.length === 0}
            >
              {submitLoading ? 'Referring back…' : 'Refer back'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
