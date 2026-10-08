import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  limsAddLinkClass,
  limsFieldClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { AddSymbolDialog } from './AddSymbolDialog'
import { insertAtCaret } from './scientificSymbols'
import { toProperTitleCase, type TestParameterForm } from './types'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import { normalizeIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'

export function TestParameterForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  isCodes = [],
  onOpenAddIsCodeForm,
  departments = [],
  designations = [],
  designationsByDepartment = {},
}: {
  form: TestParameterForm
  onChange: (next: TestParameterForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  isCodes?: Array<{ id: string; displayCode: string; searchLabel: string; defaultTestMethod: string }>
  onOpenAddIsCodeForm: (typedCode: string) => void
  departments?: string[]
  designations?: string[]
  designationsByDepartment?: Record<string, string[]>
}) {
  const isCodeOptions = isCodes ?? []
  const departmentOptions = departments ?? []
  const allDesignations = designations ?? []
  const deptDesignationMap = designationsByDepartment ?? {}

  const normLabel = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()

  const getDesignationOptionsForDepartment = (department: string) => {
    const dept = department.trim()
    if (!dept) return allDesignations
    const deptNorm = normLabel(dept)
    const fromMap = Object.entries(deptDesignationMap).find(([k]) => normLabel(k) === deptNorm)?.[1]
    if (fromMap?.length) return fromMap
    return allDesignations
  }

  const designationOptions = useMemo(
    () => getDesignationOptionsForDepartment(form.department),
    [form.department, allDesignations, deptDesignationMap],
  )

  const pickerId = useId()
  const [isCodeOpen, setIsCodeOpen] = useState(false)
  const [testMethodOpen, setTestMethodOpen] = useState(false)
  const [isCodeHighlight, setIsCodeHighlight] = useState(0)
  const [testMethodHighlight, setTestMethodHighlight] = useState(0)
  const specificRequirementRef = useRef<HTMLTextAreaElement | null>(null)
  const selectedIs = isCodeOptions.find((x) => x.id === form.isCodeId)
  const [symbolDialogOpen, setSymbolDialogOpen] = useState(false)
  const symbolCaretRef = useRef({ start: 0, end: 0 })

  const filteredIsCodesByCode = useMemo(() => {
    const query = form.isCodeLabel.trim().toLowerCase()
    if (!query) return isCodeOptions.slice(0, 10)
    return isCodeOptions.filter((code) => code.searchLabel.toLowerCase().includes(query)).slice(0, 10)
  }, [isCodeOptions, form.isCodeLabel])

  const filteredIsCodesByMethod = useMemo(() => {
    const query = form.testMethod.trim().toLowerCase()
    if (!query) return isCodeOptions.slice(0, 10)
    return isCodeOptions.filter((code) => code.defaultTestMethod.toLowerCase().includes(query) || code.searchLabel.toLowerCase().includes(query)).slice(0, 10)
  }, [isCodeOptions, form.testMethod])

  const showAddIsCodeAction = useMemo(() => {
    const typed = normalizeIsCodeLabel(form.isCodeLabel)
    if (!typed) return false
    return !isCodeOptions.some(
      (code) => normalizeIsCodeLabel(code.displayCode).toLowerCase() === typed.toLowerCase(),
    )
  }, [form.isCodeLabel, isCodeOptions])

  const totalIsCodeOptions = filteredIsCodesByCode.length + (showAddIsCodeAction ? 1 : 0)
  const showAddTestMethodAction = useMemo(() => {
    const typed = form.testMethod.trim()
    if (!typed) return false
    return !isCodeOptions.some((c) => c.defaultTestMethod.toLowerCase() === typed.toLowerCase())
  }, [form.testMethod, isCodeOptions])
  const totalTestMethodOptions = filteredIsCodesByMethod.length + (showAddTestMethodAction ? 1 : 0)

  useEffect(() => {
    setIsCodeHighlight((prev) => (totalIsCodeOptions === 0 ? 0 : Math.min(prev, totalIsCodeOptions - 1)))
  }, [totalIsCodeOptions])

  useEffect(() => {
    setTestMethodHighlight((prev) => (totalTestMethodOptions === 0 ? 0 : Math.min(prev, totalTestMethodOptions - 1)))
  }, [totalTestMethodOptions])

  const handleIsCodeTyping = (value: string) => {
    setIsCodeOpen(true)
    const typed = value
    onChange({
      ...form,
      isCodeId: '',
      isCodeLabel: typed,
    })
    setIsCodeHighlight(0)
  }

  const syncSelectionFromIsCode = (match: { id: string; displayCode: string; defaultTestMethod: string }) => {
    const shouldSyncTestMethod =
      !form.testMethod.trim().length ||
      form.testMethod === form.isCodeLabel ||
      (selectedIs && form.testMethod === selectedIs.defaultTestMethod)

    onChange({
      ...form,
      isCodeId: match.id,
      isCodeLabel: match.displayCode,
      testMethod: shouldSyncTestMethod ? match.defaultTestMethod : form.testMethod,
    })
    setIsCodeOpen(false)
  }

  const handleTestMethodTyping = (value: string) => {
    setTestMethodOpen(true)
    onChange({ ...form, testMethod: value })
    setTestMethodHighlight(0)
  }

  const handleTestMethodPick = (match: { defaultTestMethod: string }) => {
    onChange({ ...form, testMethod: match.defaultTestMethod })
    setTestMethodOpen(false)
  }

  const handleInsertSymbol = (symbol: string) => {
    const target = specificRequirementRef.current
    const value = form.specificRequirement
    const start = symbolCaretRef.current.start
    const end = symbolCaretRef.current.end
    const { next, caret } = insertAtCaret(value, symbol, start, end)
    onChange({ ...form, specificRequirement: next })
    symbolCaretRef.current = { start: caret, end: caret }
    requestAnimationFrame(() => {
      if (!target) return
      target.focus()
      target.setSelectionRange(caret, caret)
    })
  }

  const handleIsCodeKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' || event.key === 'Shift+Tab') {
      setIsCodeOpen(false)
      return
    }
    if (!isCodeOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setIsCodeOpen(true)
    }

    if (event.key === 'ArrowDown' && totalIsCodeOptions > 0) {
      event.preventDefault()
      setIsCodeHighlight((prev) => (prev + 1) % totalIsCodeOptions)
    }

    if (event.key === 'ArrowUp' && totalIsCodeOptions > 0) {
      event.preventDefault()
      setIsCodeHighlight((prev) => (prev - 1 + totalIsCodeOptions) % totalIsCodeOptions)
    }

    if (event.key === 'Enter' && totalIsCodeOptions > 0) {
      event.preventDefault()
      if (isCodeHighlight < filteredIsCodesByCode.length) {
        syncSelectionFromIsCode(filteredIsCodesByCode[isCodeHighlight])
      } else if (showAddIsCodeAction) {
        setIsCodeOpen(false)
        openCreateIsDialog()
      }
    }
  }

  const handleTestMethodKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' || event.key === 'Shift+Tab') {
      setTestMethodOpen(false)
      return
    }
    if (!testMethodOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setTestMethodOpen(true)
    }

    if (event.key === 'ArrowDown' && totalTestMethodOptions > 0) {
      event.preventDefault()
      setTestMethodHighlight((prev) => (prev + 1) % totalTestMethodOptions)
    }

    if (event.key === 'ArrowUp' && totalTestMethodOptions > 0) {
      event.preventDefault()
      setTestMethodHighlight((prev) => (prev - 1 + totalTestMethodOptions) % totalTestMethodOptions)
    }

    if (event.key === 'Enter' && totalTestMethodOptions > 0) {
      event.preventDefault()
      if (testMethodHighlight < filteredIsCodesByMethod.length) {
        handleTestMethodPick(filteredIsCodesByMethod[testMethodHighlight])
      } else if (showAddTestMethodAction) {
        onOpenAddIsCodeForm(form.testMethod.trim())
        setTestMethodOpen(false)
      }
    }
  }

  const openCreateIsDialog = () => {
    onOpenAddIsCodeForm(form.isCodeLabel.trim())
  }

  return (
    <div className={cn(limsRegistryFormClass, 'space-y-6')}>
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label htmlFor={`is-code-${pickerId}`}>IS Code</Label>
            <div className="relative">
              <Input
                id={`is-code-${pickerId}`}
                value={form.isCodeLabel}
                onChange={(e) => handleIsCodeTyping(e.target.value)}
                onFocus={() => setIsCodeOpen(true)}
                onBlur={() => setTimeout(() => setIsCodeOpen(false), 150)}
                onKeyDown={handleIsCodeKeyDown}
                placeholder="IS 1786: 2008"
                autoComplete="off"
                className={limsFieldClass}
              />
              {isCodeOpen && (filteredIsCodesByCode.length > 0 || showAddIsCodeAction) && (
                <div className="absolute z-20 mt-1 w-full rounded-none border border-stone-500 bg-white shadow-lg" tabIndex={-1}>
                  <ul className="max-h-56 overflow-auto text-sm">
                    {filteredIsCodesByCode.map((code, index) => (
                      <li key={code.id}>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left ${index === isCodeHighlight ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]'}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            syncSelectionFromIsCode(code)
                          }}
                          onMouseEnter={() => setIsCodeHighlight(index)}
                          onClick={() => syncSelectionFromIsCode(code)}
                        >
                          <span className="font-medium">{code.displayCode}</span>
                        </button>
                      </li>
                    ))}
                    {showAddIsCodeAction && (
                      <li>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left text-amber-800 ${
                            isCodeHighlight === filteredIsCodesByCode.length ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]'
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            openCreateIsDialog()
                            setIsCodeOpen(false)
                          }}
                          onMouseEnter={() => setIsCodeHighlight(filteredIsCodesByCode.length)}
                          onClick={() => {
                            openCreateIsDialog()
                            setIsCodeOpen(false)
                          }}
                        >
                          Add "{form.isCodeLabel.trim()}" to IS Code master
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label htmlFor="clause-no">Clause No</Label>
            <Input
              id="clause-no"
              value={form.clauseNo}
              onChange={(e) => onChange({ ...form, clauseNo: e.target.value })}
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <MeasurementUnitSelect
              id="unit-value"
              label="Unit of Measurement"
              value={form.unitValue}
              onChange={(unitValue) => onChange({ ...form, unitValue })}
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex min-h-6 items-center">
              <Label htmlFor={`test-method-${pickerId}`}>Test Method</Label>
            </div>
            <div className="relative">
              <Input
                id={`test-method-${pickerId}`}
                value={form.testMethod}
                onChange={(e) => handleTestMethodTyping(e.target.value)}
                onFocus={() => setTestMethodOpen(true)}
                onBlur={() => setTimeout(() => setTestMethodOpen(false), 150)}
                onKeyDown={handleTestMethodKeyDown}
                placeholder="IS 1786: 2008"
                autoComplete="off"
              />
              {testMethodOpen && (filteredIsCodesByMethod.length > 0 || showAddTestMethodAction) && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg" tabIndex={-1}>
                  <ul className="max-h-56 overflow-auto text-sm">
                    {filteredIsCodesByMethod.map((code, index) => (
                      <li key={`${code.id}-method`}>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left ${index === testMethodHighlight ? 'bg-muted font-semibold' : 'hover:bg-muted'}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleTestMethodPick(code)
                          }}
                          onMouseEnter={() => setTestMethodHighlight(index)}
                          onClick={() => handleTestMethodPick(code)}
                        >
                          <span className="font-medium">{code.defaultTestMethod}</span>
                        </button>
                      </li>
                    ))}
                    {showAddTestMethodAction && (
                      <li>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left text-primary ${
                            testMethodHighlight === filteredIsCodesByMethod.length ? 'bg-muted font-semibold' : 'hover:bg-muted'
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onOpenAddIsCodeForm(form.testMethod.trim())
                            setTestMethodOpen(false)
                          }}
                          onMouseEnter={() => setTestMethodHighlight(filteredIsCodesByMethod.length)}
                          onClick={() => {
                            onOpenAddIsCodeForm(form.testMethod.trim())
                            setTestMethodOpen(false)
                          }}
                        >
                          Add &quot;{form.testMethod.trim()}&quot; to IS Code master
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 grid grid-cols-1 items-end gap-4 md:grid-cols-2 md:gap-6">
            <div className="min-w-0 space-y-2">
              <div className="flex min-h-6 items-center">
                <Label htmlFor="item-name">Name of Test Parameter</Label>
              </div>
              <Input
                id="item-name"
                value={form.itemName}
                onChange={(e) => onChange({ ...form, itemName: e.target.value })}
                onBlur={() => {
                  const next = toProperTitleCase(form.itemName)
                  if (next !== form.itemName) onChange({ ...form, itemName: next })
                }}
              />
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex min-h-6 items-center justify-between gap-2">
                <Label htmlFor="specific-requirement">Specific Requirement</Label>
                <button
                  type="button"
                  className={cn(limsAddLinkClass, 'flex shrink-0 items-center gap-1')}
                  onClick={() => setSymbolDialogOpen(true)}
                >
                  <Sparkles size={12} />
                  Add Symbol
                </button>
              </div>
              <Textarea
                id="specific-requirement"
                ref={specificRequirementRef}
                rows={1}
                value={form.specificRequirement}
                onChange={(e) => onChange({ ...form, specificRequirement: e.target.value })}
                onSelect={(e) => {
                  const el = e.currentTarget
                  symbolCaretRef.current = {
                    start: el.selectionStart ?? el.value.length,
                    end: el.selectionEnd ?? el.value.length,
                  }
                }}
                onBlur={(e) => {
                  const el = e.currentTarget
                  symbolCaretRef.current = {
                    start: el.selectionStart ?? el.value.length,
                    end: el.selectionEnd ?? el.value.length,
                  }
                  const next = toProperTitleCase(form.specificRequirement)
                  if (next !== form.specificRequirement) {
                    onChange({ ...form, specificRequirement: next })
                  }
                }}
                className="!h-8 !min-h-8 resize-none rounded-none border border-stone-500 bg-stone-50 px-3 py-1 shadow-none focus-visible:border-amber-600 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:ring-offset-0"
              />
              <AddSymbolDialog
                open={symbolDialogOpen}
                onOpenChange={setSymbolDialogOpen}
                onInsert={handleInsertSymbol}
              />
            </div>
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label htmlFor="department">Department</Label>
            {departmentOptions.length > 0 ? (
              <Select
                value={form.department}
                onValueChange={(v) => {
                  const allowed = getDesignationOptionsForDepartment(v)
                  const keepDesignation =
                    form.designation &&
                    allowed.some((d) => normLabel(d) === normLabel(form.designation))
                  onChange({
                    ...form,
                    department: v,
                    designation: keepDesignation ? form.designation : '',
                  })
                }}
              >
                <SelectTrigger id="department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([form.department, ...departmentOptions].filter((d) => d && d.trim().length > 0))).map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="department"
                value={form.department}
                onChange={(e) => onChange({ ...form, department: e.target.value })}
              />
            )}
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex min-h-6 items-center">
              <Label htmlFor="designation">Designation</Label>
            </div>
            {designationOptions.length > 0 ? (
              <Select
                value={form.designation}
                onValueChange={(v) => onChange({ ...form, designation: v })}
                disabled={!form.department.trim()}
              >
                <SelectTrigger id="designation">
                  <SelectValue placeholder={form.department.trim() ? 'Select designation' : 'Select department first'} />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([form.designation, ...designationOptions].filter((d) => d && d.trim().length > 0))).map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="designation"
                value={form.designation}
                readOnly
                placeholder="Add designations in User Management"
              />
            )}
            {form.department.trim() && designationOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">No designations in User Management for this department.</p>
            )}
          </div>
        </div>

      <div className="flex items-center justify-end border-t border-stone-300 pt-4">
        <Button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>
    </div>
  )
}
