import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ClientManageDialogContent } from '@/features/masters/clients/ClientManageDialogContent'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import {
  limsAddLinkClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { toProperTitleCase, type AccreditationBodyRow, type TestParameterForm } from './types'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import { normalizeIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'

const SCIENTIFIC_SYMBOLS = [
  '±', 'µ', 'Ω', 'Δ', '∑', '√', '≤', '≥', '≈', '≠', '≡', '∝', '∫', '∂', '∇',
  'α', 'β', 'γ', 'δ', 'θ', 'λ', 'π', 'σ', 'ρ', 'τ', 'φ', 'ω', 'η', 'ν', 'ψ', 'ζ', 'ξ', 'κ', 'ι',
  'Σ', 'Π', 'Λ', 'Φ', 'Ψ', 'Γ', 'Θ', 'Δ',
  '²', '³', '⁺', '⁻', '⁰', '¹', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉',
]
const OTHER_SYMBOLS = [
  '°', '×', '÷', '∞', '‰', '℃', '℉', '§', '™', '®', '©', 'Ø', '⊕', '⊗',
  '•', '·', '…', '–', '—', '′', '″', '†', '‡', '№', '¶', '✓', '✗', '✔', '✘',
  '«', '»', '‹', '›', '‘', '’', '"', '"', '„', '‚',
  '₹', '$', '€', '£', '¥', '¢', '¤',
  '→', '←', '↑', '↓', '⇒', '⇔', '↔', '↦', '∈', '∉', '⊂', '⊃', '⊆', '⊇',
]

function splitUncertaintyMu(raw: string): { value: string; unit: string } {
  const trimmed = raw.trim().replace(/^±\s*/, '')
  if (!trimmed) return { value: '', unit: '' }
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace > 0) {
    const maybeUnit = trimmed.slice(lastSpace + 1).trim()
    const maybeValue = trimmed.slice(0, lastSpace).replace(/[^0-9.]/g, '')
    if (maybeUnit && !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)?$/.test(maybeUnit)) {
      return { value: maybeValue, unit: maybeUnit }
    }
  }
  return { value: trimmed.replace(/[^0-9.]/g, ''), unit: '' }
}

function joinUncertaintyMu(value: string, unit: string): string {
  const n = value.replace(/[^0-9.]/g, '').trim()
  if (!n) return ''
  const u = unit.trim()
  return u ? `± ${n} ${u}` : `± ${n}`
}

export function TestParameterForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  isCodes = [],
  accreditationBodies = [],
  accreditationDialogOpen,
  setAccreditationDialogOpen,
  newAccreditationBody,
  setNewAccreditationBody,
  onAddAccreditationBody,
  onUpdateAccreditationBody,
  onDeleteAccreditationBody,
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
  accreditationBodies?: AccreditationBodyRow[]
  accreditationDialogOpen: boolean
  setAccreditationDialogOpen: (open: boolean) => void
  newAccreditationBody: string
  setNewAccreditationBody: (value: string) => void
  onAddAccreditationBody: () => void
  onUpdateAccreditationBody: (id: string) => void
  onDeleteAccreditationBody: (id: string) => void
  onOpenAddIsCodeForm: (typedCode: string) => void
  departments?: string[]
  designations?: string[]
  designationsByDepartment?: Record<string, string[]>
}) {
  const isCodeOptions = isCodes ?? []
  const accreditationBodyOptions = accreditationBodies ?? []
  const departmentOptions = departments ?? []
  const allDesignations = designations ?? []
  const deptDesignationMap = designationsByDepartment ?? {}
  const underAccreditationIds = form.underAccreditationIds ?? []

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
  const [symbolSearch, setSymbolSearch] = useState('')
  const [symbolRecents, setSymbolRecents] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem('testParameter.symbolRecents')
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })

  const { value: uncertaintyNumber, unit: uncertaintyUnit } = splitUncertaintyMu(form.uncertaintyMu)

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

  const filteredScientificSymbols = useMemo(() => {
    const q = symbolSearch.trim().toLowerCase()
    if (!q) return SCIENTIFIC_SYMBOLS
    return SCIENTIFIC_SYMBOLS.filter((sym) => sym.toLowerCase().includes(q))
  }, [symbolSearch])

  const filteredOtherSymbols = useMemo(() => {
    const q = symbolSearch.trim().toLowerCase()
    if (!q) return OTHER_SYMBOLS
    return OTHER_SYMBOLS.filter((sym) => sym.toLowerCase().includes(q))
  }, [symbolSearch])

  const handleInsertSymbol = (symbol: string) => {
    const target = specificRequirementRef.current
    if (!target) return
    const { selectionStart = target.value.length, selectionEnd = target.value.length } = target
    const nextValue =
      target.value.slice(0, selectionStart) +
      symbol +
      target.value.slice(selectionEnd)

    onChange({ ...form, specificRequirement: nextValue })

    requestAnimationFrame(() => {
      target.focus()
      const caret = selectionStart + symbol.length
      target.setSelectionRange(caret, caret)
    })

    setSymbolDialogOpen(false)
    setSymbolSearch('')
    setSymbolRecents((prev) => {
      const updated = [symbol, ...prev.filter((s) => s !== symbol)].slice(0, 10)
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('testParameter.symbolRecents', JSON.stringify(updated))
        } catch {
          // ignore
        }
      }
      return updated
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
                <Dialog open={symbolDialogOpen} onOpenChange={setSymbolDialogOpen}>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className={cn(limsAddLinkClass, 'flex shrink-0 items-center gap-1')}
                    >
                      <Sparkles size={12} />
                      Insert Symbol
                    </button>
                  </DialogTrigger>
                  <DialogContent
                    persistOnFocusLoss
                    layer="stacked"
                    aria-describedby={undefined}
                    className={cn(
                      limsDialogClass,
                      'flex max-h-[min(72vh,560px)] w-[calc(100%-1.5rem)] max-w-xl flex-col p-0 sm:w-full',
                    )}
                  >
                    <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
                      <div
                        className="pointer-events-none absolute inset-0 opacity-[0.18]"
                        style={limsDarkBarGlowStyle}
                      />
                      <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                      <DialogHeader className="relative pr-10 text-left">
                        <DialogTitle className="text-base font-semibold tracking-tight text-white">
                          Insert Symbol
                        </DialogTitle>
                      </DialogHeader>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-stone-100/90 to-stone-50">
                      <div className="shrink-0 space-y-2 border-b border-stone-200 px-4 py-3">
                        <Label
                          htmlFor="symbol-search"
                          className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                        >
                          Search
                        </Label>
                        <Input
                          id="symbol-search"
                          placeholder="Search symbols..."
                          value={symbolSearch}
                          onChange={(e) => setSymbolSearch(e.target.value)}
                          autoFocus
                          className={limsFieldClass}
                        />
                      </div>
                      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
                        {symbolRecents.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                              Recent
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {symbolRecents.map((sym, index) => (
                                <button
                                  key={`recent-${index}`}
                                  type="button"
                                  className="min-w-9 rounded-none border border-stone-500 bg-white px-2.5 py-1.5 text-base font-medium text-stone-900 shadow-sm hover:border-amber-600 hover:bg-amber-50"
                                  onClick={() => handleInsertSymbol(sym)}
                                >
                                  {sym}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                            Scientific
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {filteredScientificSymbols.map((sym, index) => (
                              <button
                                key={`scientific-${index}`}
                                type="button"
                                className="min-w-9 rounded-none border border-stone-500 bg-white px-2.5 py-1.5 text-base font-medium text-stone-900 shadow-sm hover:border-amber-600 hover:bg-amber-50"
                                onClick={() => handleInsertSymbol(sym)}
                              >
                                {sym}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                            Other
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {filteredOtherSymbols.map((sym, index) => (
                              <button
                                key={`other-${index}`}
                                type="button"
                                className="min-w-9 rounded-none border border-stone-500 bg-white px-2.5 py-1.5 text-base font-medium text-stone-900 shadow-sm hover:border-amber-600 hover:bg-amber-50"
                                onClick={() => handleInsertSymbol(sym)}
                              >
                                {sym}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <Textarea
                id="specific-requirement"
                ref={specificRequirementRef}
                rows={1}
                value={form.specificRequirement}
                onChange={(e) => onChange({ ...form, specificRequirement: e.target.value })}
                onBlur={() => {
                  const next = toProperTitleCase(form.specificRequirement)
                  if (next !== form.specificRequirement) {
                    onChange({ ...form, specificRequirement: next })
                  }
                }}
                className="!h-8 !min-h-8 resize-none rounded-none border border-stone-500 bg-stone-50 px-3 py-1 shadow-none focus-visible:border-amber-600 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label htmlFor="under-accreditation">Under Accreditation</Label>
            <Dialog open={accreditationDialogOpen} onOpenChange={setAccreditationDialogOpen}>
              <LimsFieldWithAdd
                addButton={
                  <DialogTrigger asChild>
                    <LimsFieldAddButton aria-label="Add accreditation body" />
                  </DialogTrigger>
                }
              >
                {accreditationBodyOptions.length > 0 ? (
                  <Select
                    value={underAccreditationIds[0] ?? ''}
                    onValueChange={(v) =>
                      onChange({
                        ...form,
                        underAccreditationIds: v ? [v] : [],
                      })
                    }
                  >
                    <SelectTrigger id="under-accreditation">
                      <SelectValue placeholder="Select accreditation" />
                    </SelectTrigger>
                    <SelectContent>
                      {accreditationBodyOptions.map((body) => (
                        <SelectItem key={body.id} value={body.id}>
                          {body.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input id="under-accreditation" value="" readOnly placeholder="Add bodies to use them here" />
                )}
              </LimsFieldWithAdd>
              <ClientManageDialogContent
                open={accreditationDialogOpen}
                title="Add Accreditation Body"
                addLabel="Body Name"
                inputId="new-accreditation"
                placeholder="e.g., NABL"
                value={newAccreditationBody}
                onValueChange={setNewAccreditationBody}
                onSave={onAddAccreditationBody}
                onUpdate={onUpdateAccreditationBody}
                saveDisabled={!newAccreditationBody.trim()}
                items={accreditationBodyOptions.map((b) => ({ id: b.id, label: b.name }))}
                canDelete={() => true}
                onDelete={onDeleteAccreditationBody}
              />
            </Dialog>
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex min-h-6 items-center">
              <Label htmlFor="uncertainty">Uncertainty (MU)</Label>
            </div>
            <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-2">
              <div className="relative min-w-0">
                <span className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-sm leading-none text-muted-foreground">
                  ±
                </span>
                <Input
                  id="uncertainty"
                  inputMode="decimal"
                  placeholder="5.60"
                  value={uncertaintyNumber}
                  onChange={(e) => {
                    const n = e.target.value.replace(/[^0-9.]/g, '')
                    onChange({
                      ...form,
                      uncertaintyMu: joinUncertaintyMu(n, uncertaintyUnit),
                    })
                  }}
                  onBlur={() => {
                    onChange({
                      ...form,
                      uncertaintyMu: joinUncertaintyMu(uncertaintyNumber, uncertaintyUnit),
                    })
                  }}
                  className="!pl-8"
                  aria-label="Uncertainty value"
                />
              </div>
              <MeasurementUnitSelect
                id="uncertainty-unit"
                value={uncertaintyUnit}
                onChange={(unit) =>
                  onChange({
                    ...form,
                    uncertaintyMu: joinUncertaintyMu(uncertaintyNumber, unit),
                  })
                }
                showLabel={false}
                showManageButton
                placeholder="Unit"
                className="min-w-0"
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
