import { useMemo, useState, type ReactNode } from 'react'
import { FileText, LayoutTemplate, PenLine, Plus, Printer, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { LimsDatePicker } from '@/components/lims/LimsDatePicker'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { BisDocumentPrintSettingsPanel } from '../print/bisDocumentPrintPageSettings'
import { BisDocumentPrintSettingsDialog } from './BisDocumentPrintSettingsDialog'
import { FtrIsTestParameterDialog, type FtrMasterParam } from './FtrIsTestParameterDialog'
import {
  applySampleToFactoryTestReport,
  emptyFactoryTestReportEntry,
  emptyFactoryTestReportParamRow,
  type FactoryTestReportEntry,
  type FactoryTestReportModulePayload,
  type FactoryTestReportParamRow,
} from './factoryTestReportModel'
import { type OslSampleRequirementRow } from './oslSampleRequirementsModel'
import { formatDisplayDate } from './types'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

export type FactoryTestReportPreviewContext = {
  applicantName: string
  applicantAddress: string
  applicationNumber: string
  dateOfApplication: string
  dateOfInspection: string
  licenceNumber: string
  isNumber: string
  productTitle: string
  inspectionOfficerName: string
  inspectionOfficerDesignation: string
  testedByName: string
  testedByDesignation: string
}

type MasterParam = FtrMasterParam

function paramFromMaster(p: MasterParam, isLabel: string): FactoryTestReportParamRow {
  return emptyFactoryTestReportParamRow({
    testParameterId: p.id,
    testName: (p.item_name ?? '').trim(),
    clauseNo: (p.clause_no ?? '').trim(),
    isReference: (p.is_code_label ?? '').trim() || isLabel,
    unit: (p.unit_value ?? '').trim(),
    specifiedRequirement: (p.specific_requirement ?? '').trim(),
  })
}

function MetaCell({
  label,
  children,
  className,
  colSpan,
  nowrapLabel = false,
  valueCenter = false,
}: {
  label: string
  children: ReactNode
  className?: string
  colSpan?: number
  nowrapLabel?: boolean
  valueCenter?: boolean
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn('border border-stone-800 px-2 py-1.5 align-middle text-[12px]', className)}
    >
      <span
        className={cn(
          'font-bold text-stone-900',
          nowrapLabel && 'whitespace-nowrap',
        )}
      >
        {label}
      </span>
      <span className="mx-1 font-bold text-stone-900">:-</span>
      <span
        className={cn(
          'font-semibold text-stone-900',
          valueCenter && 'inline-block min-w-[4rem] text-center',
          nowrapLabel && 'whitespace-nowrap',
        )}
      >
        {children}
      </span>
    </td>
  )
}

function displayOrDash(raw: string): string {
  const v = raw.trim()
  return v || '—'
}

export function FactoryTestReportModuleFields({
  value,
  onChange,
  disabled = false,
  sampleOptions,
  isCodeId = null,
  isCodeLabel = '',
  focusSampleRowId = null,
  previewContext = null,
  testedBySignatureImageUrl = '',
  projectId = null,
}: {
  value: FactoryTestReportModulePayload
  onChange: (next: FactoryTestReportModulePayload) => void
  disabled?: boolean
  /** Sample test requests from Sample Requirements module. */
  sampleOptions: OslSampleRequirementRow[]
  isCodeId?: string | null
  isCodeLabel?: string
  /** Prefer this sample's report when multiple exist. */
  focusSampleRowId?: string | null
  /** Applicant / licence header fields for A4 preview. */
  previewContext?: FactoryTestReportPreviewContext | null
  /** Technical Staff signature when Apply-on-Test-Report is checked. */
  testedBySignatureImageUrl?: string
  /** BIS project id — shared Page / Print / Header / Footer settings. */
  projectId?: string | null
}) {
  const reports = value.reports
  const [paramPickerOpen, setParamPickerOpen] = useState(false)
  const [signatureApplyOpen, setSignatureApplyOpen] = useState(false)
  const [editingSpecParamId, setEditingSpecParamId] = useState<string | null>(null)
  const [printSettingsPanel, setPrintSettingsPanel] = useState<
    Extract<
      BisDocumentPrintSettingsPanel,
      'page' | 'print' | 'letterhead-header' | 'letterhead-footer'
    > | null
  >(null)

  const usableSamples = useMemo(
    () =>
      sampleOptions.filter(
        (s) =>
          s.batchNumber.trim() ||
          s.dateOfManufacturing.trim() ||
          s.gradeTypeVariety.trim() ||
          s.sampleDescription.trim() ||
          s.qrCode.trim() ||
          s.sampleCode.trim(),
      ),
    [sampleOptions],
  )

  const activeIndex = useMemo(() => {
    const focus = (focusSampleRowId ?? '').trim()
    if (focus) {
      const i = reports.findIndex((r) => r.sampleRowId === focus)
      if (i >= 0) return i
    }
    if (reports.length > 0) return 0
    return -1
  }, [focusSampleRowId, reports])

  const activeReport: FactoryTestReportEntry =
    activeIndex >= 0
      ? reports[activeIndex]!
      : emptyFactoryTestReportEntry({
          dateOfTestingStart: '',
          dateOfTestingFinish: '',
        })

  const ensureActiveReport = (): { nextReports: FactoryTestReportEntry[]; index: number } => {
    if (activeIndex >= 0) return { nextReports: [...reports], index: activeIndex }
    const focus = (focusSampleRowId ?? '').trim()
    const sample =
      (focus ? usableSamples.find((s) => s.id === focus) : null) ?? usableSamples[0] ?? null
    const entry = sample
      ? applySampleToFactoryTestReport(emptyFactoryTestReportEntry(), sample)
      : emptyFactoryTestReportEntry()
    return { nextReports: [...reports, entry], index: reports.length }
  }

  const patchActiveReport = (patch: Partial<FactoryTestReportEntry>) => {
    const { nextReports, index } = ensureActiveReport()
    const current = nextReports[index]!
    nextReports[index] = { ...current, ...patch }
    onChange({ ...value, reports: nextReports })
  }

  const selectedParamIds = useMemo(
    () => new Set(activeReport.parameters.map((p) => p.testParameterId).filter(Boolean)),
    [activeReport.parameters],
  )

  const toggleParam = (param: MasterParam, checked: boolean) => {
    if (checked) {
      if (selectedParamIds.has(param.id)) return
      patchActiveReport({
        parameters: [...activeReport.parameters, paramFromMaster(param, isCodeLabel)],
      })
      return
    }
    patchActiveReport({
      parameters: activeReport.parameters.filter((p) => p.testParameterId !== param.id),
    })
  }

  const patchParam = (
    paramId: string,
    key: 'observedValue' | 'remark' | 'specifiedRequirement' | 'unit',
    next: string,
  ) => {
    patchActiveReport({
      parameters: activeReport.parameters.map((p) =>
        p.testParameterId === paramId ? { ...p, [key]: next } : p,
      ),
    })
  }

  const onSampleChange = (sampleId: string) => {
    const sample = usableSamples.find((s) => s.id === sampleId)
    if (!sample) return
    const { nextReports, index } = ensureActiveReport()
    nextReports[index] = applySampleToFactoryTestReport(nextReports[index]!, sample)
    onChange({ ...value, reports: nextReports })
  }

  const openParamPicker = () => {
    if (!activeReport.sampleRowId.trim() && usableSamples.length > 0) {
      const focus = (focusSampleRowId ?? '').trim()
      const sample =
        (focus ? usableSamples.find((s) => s.id === focus) : null) ?? usableSamples[0]!
      onSampleChange(sample.id)
    }
    setParamPickerOpen(true)
  }

  const ctx = previewContext
  const applicantName = ctx?.applicantName.trim() || '—'
  const applicantAddress = ctx?.applicantAddress.trim() || '—'
  const applicationNo = ctx?.applicationNumber.trim() || '—'
  const dateOfApplication = ctx?.dateOfApplication.trim()
    ? formatDisplayDate(ctx.dateOfApplication)
    : '—'
  const dateOfInspection = ctx?.dateOfInspection.trim()
    ? formatDisplayDate(ctx.dateOfInspection)
    : '—'
  const productTitle = ctx?.productTitle.trim() || '—'
  const isNumber = ctx?.isNumber.trim() || isCodeLabel.trim() || '—'
  const testedByName =
    (ctx?.testedByName ?? '').trim() || value.testedByName.trim()
  const testedByDesigRaw =
    (ctx?.testedByDesignation ?? '').trim() || value.testedByDesignation.trim()
  // Drop legacy placeholder designation (not a real Technical Staff value).
  const testedByDesignation =
    testedByDesigRaw === 'Technical Staff / Quality Control Incharge'
      ? ''
      : testedByDesigRaw
  const applyWitnessedBy = value.applyWitnessedBy !== false
  const applyAuthorizedSignatory = value.applyAuthorizedSignatory !== false
  const applyTestedBy = value.applyTestedBy !== false
  const signatureColCount =
    (applyWitnessedBy ? 1 : 0) + (applyAuthorizedSignatory ? 1 : 0) + (applyTestedBy ? 1 : 0)
  const signatureGridClass =
    signatureColCount >= 3
      ? 'sm:grid-cols-3'
      : signatureColCount === 2
        ? 'sm:grid-cols-2'
        : 'sm:grid-cols-1'

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-stone-200/80">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 [-webkit-overflow-scrolling:touch]">
        {usableSamples.length === 0 ? (
          <p className="mb-3 rounded-none border border-amber-400/60 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            No sample test requests found. Open{' '}
            <strong>Sample Requirements, Test Request, &amp; Test Reports</strong>, add samples, save, then
            return here.
          </p>
        ) : null}

        <div
          className={cn(
            'mx-auto box-border w-[210mm] max-w-full border-2 border-stone-900 bg-white p-1.5 shadow-lg',
            'min-h-[297mm]',
          )}
        >
          <div className="relative flex min-h-[calc(297mm-0.75rem)] w-full flex-col gap-3 border border-stone-900 p-[8mm] pb-[12mm] font-[Times_New_Roman,Times,serif] text-stone-900">
            <header className="text-center">
              <h2 className="text-lg font-extrabold tracking-tight underline decoration-2 underline-offset-4">
                Factory Test Report
              </h2>
            </header>

            <div className="overflow-hidden rounded-sm border border-stone-800">
              <table className="w-full table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-1/6" />
                  <col className="w-1/6" />
                  <col className="w-1/6" />
                  <col className="w-1/6" />
                  <col className="w-1/6" />
                  <col className="w-1/6" />
                </colgroup>
                <tbody>
                  <tr>
                    <MetaCell label="Application No." colSpan={2} nowrapLabel>
                      {displayOrDash(applicationNo)}
                    </MetaCell>
                    <MetaCell label="Date of Application" colSpan={2} nowrapLabel className="text-center">
                      {dateOfApplication}
                    </MetaCell>
                    <MetaCell label="Date of Inspection" colSpan={2} nowrapLabel className="text-right">
                      {dateOfInspection}
                    </MetaCell>
                  </tr>
                  <tr>
                    <MetaCell label="Applicant Details" colSpan={6}>
                      <span className="whitespace-pre-wrap">
                        {[applicantName !== '—' ? applicantName : '', applicantAddress !== '—' ? applicantAddress : '']
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </span>
                    </MetaCell>
                  </tr>
                  <tr>
                    <MetaCell label="Product Details" colSpan={6}>
                      {(() => {
                        const title = productTitle !== '—' ? productTitle.trim() : ''
                        const code = isNumber !== '—' ? isNumber.trim() : ''
                        if (title && code) return `${title} as per ${code}`
                        return title || (code ? `as per ${code}` : '—')
                      })()}
                    </MetaCell>
                  </tr>
                  <tr>
                    <MetaCell label="Grade/Type/Variety/Class" colSpan={6}>
                      <span className="whitespace-pre-wrap">
                        {displayOrDash(activeReport.gradeTypeVariety)}
                      </span>
                    </MetaCell>
                  </tr>
                  <tr>
                    <MetaCell label="Declared Values, if any" colSpan={6}>
                      <span className="whitespace-pre-wrap">
                        {displayOrDash(activeReport.declaredValue)}
                      </span>
                    </MetaCell>
                  </tr>
                  <tr>
                    <MetaCell label="Batch / Heat Number" colSpan={3} nowrapLabel>
                      {displayOrDash(activeReport.batchNumber)}
                    </MetaCell>
                    <MetaCell
                      label="Date of Manufacturing"
                      colSpan={3}
                      nowrapLabel
                      className="text-right"
                    >
                      {activeReport.dateOfManufacturing.trim()
                        ? formatDisplayDate(activeReport.dateOfManufacturing)
                        : '—'}
                    </MetaCell>
                  </tr>
                  <tr>
                    <td
                      colSpan={3}
                      className="border border-stone-800 px-2 py-1.5 align-middle text-[12px]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">Date of Testing Start</span>
                        <span className="font-bold">:-</span>
                        <LimsDatePicker
                          className="w-[9.5rem]"
                          value={activeReport.dateOfTestingStart}
                          disabled={disabled}
                          onChange={(next) =>
                            patchActiveReport({ dateOfTestingStart: next })
                          }
                          aria-label="Date of testing start"
                        />
                      </div>
                    </td>
                    <td
                      colSpan={3}
                      className="border border-stone-800 px-2 py-1.5 align-middle text-right text-[12px]"
                    >
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="font-bold">Date of Testing Completion</span>
                        <span className="font-bold">:-</span>
                        <LimsDatePicker
                          className="w-[9.5rem]"
                          value={activeReport.dateOfTestingFinish}
                          disabled={disabled}
                          onChange={(next) =>
                            patchActiveReport({ dateOfTestingFinish: next })
                          }
                          aria-label="Date of testing completion"
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="min-w-0 space-y-1.5">
              <div className="overflow-hidden rounded-sm border border-stone-800">
                <table className="w-full table-fixed border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="bg-stone-100">
                      <th className="w-[25%] border border-stone-800 px-2 py-1.5 text-center font-extrabold">
                        Test Name
                      </th>
                      <th className="w-[10%] border border-stone-800 px-2 py-1.5 text-center font-extrabold">
                        Unit
                      </th>
                      <th className="w-[35%] border border-stone-800 px-2 py-1.5 text-center font-extrabold">
                        Specified Requirements
                      </th>
                      <th className="w-[20%] border border-stone-800 px-2 py-1.5 text-center font-extrabold">
                        Observed Value
                      </th>
                      <th className="w-[10%] border border-stone-800 px-2 py-1.5 text-center font-extrabold">
                        Remark
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeReport.parameters.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="border border-stone-800 px-3 py-6 text-center text-stone-500"
                        >
                          No test parameters yet. Use <strong>Add Test Parameter</strong> in the
                          sidebar.
                        </td>
                      </tr>
                    ) : (
                      activeReport.parameters.map((p) => (
                        <tr key={p.testParameterId || p.testName}>
                          <td className="border border-stone-800 px-2 py-1.5 align-top">
                            <div className="font-bold">{p.testName || '—'}</div>
                            {p.clauseNo || p.isReference ? (
                              <div className="text-[9px] text-stone-600">
                                {[p.clauseNo ? `Cl. ${p.clauseNo}` : '', p.isReference]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            ) : null}
                          </td>
                          <td className="border border-stone-800 px-2 py-1.5 text-center align-middle">
                            {p.unit || '—'}
                          </td>
                          <td
                            className={cn(
                              'border border-stone-800 text-center align-middle',
                              editingSpecParamId === p.testParameterId
                                ? 'p-1'
                                : 'px-2 py-1.5 whitespace-pre-wrap',
                              !disabled && editingSpecParamId !== p.testParameterId
                                ? 'cursor-text'
                                : null,
                            )}
                            title={
                              disabled || editingSpecParamId === p.testParameterId
                                ? undefined
                                : 'Double-click to edit'
                            }
                            onDoubleClick={() => {
                              if (disabled || !p.testParameterId) return
                              setEditingSpecParamId(p.testParameterId)
                            }}
                          >
                            {editingSpecParamId === p.testParameterId ? (
                              <Input
                                autoFocus
                                className={cn(
                                  limsFieldClass,
                                  'h-7 border-0 bg-transparent text-center text-[11px] shadow-none focus-visible:ring-1',
                                )}
                                value={p.specifiedRequirement}
                                disabled={disabled}
                                placeholder="Requirements"
                                onChange={(e) =>
                                  patchParam(
                                    p.testParameterId,
                                    'specifiedRequirement',
                                    e.target.value,
                                  )
                                }
                                onBlur={() => setEditingSpecParamId(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === 'Escape') {
                                    e.preventDefault()
                                    setEditingSpecParamId(null)
                                  }
                                }}
                              />
                            ) : (
                              p.specifiedRequirement || '—'
                            )}
                          </td>
                          <td className="border border-stone-800 p-1 text-center align-middle">
                            <Input
                              className={cn(
                                limsFieldClass,
                                'h-7 border-0 bg-transparent text-center text-[11px] shadow-none focus-visible:ring-1',
                              )}
                              value={p.observedValue}
                              disabled={disabled}
                              placeholder="Observed"
                              onChange={(e) =>
                                patchParam(p.testParameterId, 'observedValue', e.target.value)
                              }
                            />
                          </td>
                          <td className="border border-stone-800 p-1 text-center align-middle">
                            <Input
                              className={cn(
                                limsFieldClass,
                                'h-7 border-0 bg-transparent text-center text-[11px] shadow-none focus-visible:ring-1',
                              )}
                              value={p.remark || 'Pass'}
                              disabled={disabled}
                              placeholder="Pass"
                              onChange={(e) =>
                                patchParam(p.testParameterId, 'remark', e.target.value)
                              }
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-center text-[11px] font-bold">*** End of Report ***</p>

              {signatureColCount > 0 ? (
              <div
                className={cn(
                  'mt-2.5 grid grid-cols-1 gap-2 sm:gap-2',
                  signatureGridClass,
                )}
              >
                {applyWitnessedBy ? (
                <div className="flex min-h-[4.75rem] flex-col items-start text-left text-[11px] font-bold leading-snug">
                  <p className="underline decoration-1 underline-offset-2">Witnessed By</p>
                  <div className="min-h-[1.35rem] w-full flex-1" aria-hidden />
                  <p>
                    {(
                      previewContext?.inspectionOfficerName.trim() ||
                      value.inspectionOfficerName.trim()
                    ) || '—'}
                  </p>
                  {(
                    previewContext?.inspectionOfficerDesignation.trim() ||
                    value.inspectionOfficerDesignation.trim()
                  ) ? (
                    <p>
                      {previewContext?.inspectionOfficerDesignation.trim() ||
                        value.inspectionOfficerDesignation.trim()}
                    </p>
                  ) : null}
                  <p>Bureau of Indian Standards</p>
                </div>
                ) : null}

                {applyAuthorizedSignatory ? (
                <div className="flex min-h-[4.75rem] flex-col items-center text-center text-[11px] font-bold leading-snug">
                  <div className="min-h-[1.35rem] w-full flex-1" aria-hidden />
                  <p>{value.authorisedName.trim() || '—'}</p>
                  {value.authorisedDesignation.trim() ? (
                    <p>{value.authorisedDesignation.trim()}</p>
                  ) : null}
                  <p>Authorized Signatory</p>
                  <p>{applicantName !== '—' ? applicantName : '—'}</p>
                </div>
                ) : null}

                {applyTestedBy ? (
                <div className="flex min-h-[4.75rem] flex-col items-end text-right text-[11px] font-bold leading-snug">
                  <p className="underline decoration-1 underline-offset-2">Tested By</p>
                  <div className="flex min-h-[1.35rem] w-full flex-1 items-end justify-end">
                    {testedBySignatureImageUrl.trim() ? (
                      <img
                        src={testedBySignatureImageUrl.trim()}
                        alt="Tested By signature"
                        className="max-h-9 max-w-[6rem] object-contain"
                      />
                    ) : null}
                  </div>
                  <p>{testedByName || '—'}</p>
                  {testedByDesignation && testedByDesignation !== testedByName ? (
                    <p>{testedByDesignation}</p>
                  ) : null}
                  <p>{applicantName !== '—' ? applicantName : '—'}</p>
                </div>
                ) : null}
              </div>
              ) : null}
            </div>

            <p className="pointer-events-none absolute bottom-[3mm] right-[3mm] m-0 text-[10.5px] font-semibold tabular-nums text-stone-800">
              Page {String(Math.max(1, activeIndex + 1)).padStart(2, '0')} of{' '}
              {String(Math.max(1, reports.length)).padStart(2, '0')}
            </p>
          </div>
        </div>
      </div>

      <aside className="flex w-[9.5rem] shrink-0 flex-col gap-2 border-l border-stone-400 bg-stone-50 px-2.5 py-4 sm:w-[11rem] sm:px-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
          Report options
        </p>
        <Button
          type="button"
          variant="outline"
          className={cn(
            limsOutlineBtnClass,
            'h-auto min-h-9 w-full justify-center gap-1.5 px-2 py-2 text-xs font-semibold',
          )}
          disabled={disabled}
          onClick={openParamPicker}
        >
          <Plus size={14} aria-hidden />
          Add Test Parameter
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            limsOutlineBtnClass,
            'h-auto min-h-9 w-full justify-center gap-1.5 px-2 py-2 text-xs font-semibold',
          )}
          disabled={disabled}
          onClick={() => setSignatureApplyOpen(true)}
        >
          <PenLine size={14} aria-hidden />
          Signature Apply
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            limsOutlineBtnClass,
            'h-auto min-h-9 w-full justify-center gap-1.5 px-2 py-2 text-xs font-semibold',
          )}
          disabled={disabled}
          onClick={() => setPrintSettingsPanel('page')}
        >
          <FileText size={14} aria-hidden />
          Page Setting
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            limsOutlineBtnClass,
            'h-auto min-h-9 w-full justify-center gap-1.5 px-2 py-2 text-xs font-semibold',
          )}
          disabled={disabled}
          onClick={() => setPrintSettingsPanel('print')}
        >
          <Printer size={14} aria-hidden />
          Print Setting
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            limsOutlineBtnClass,
            'h-auto min-h-9 w-full justify-center gap-1.5 px-2 py-2 text-xs font-semibold',
          )}
          disabled={disabled}
          onClick={() => setPrintSettingsPanel('letterhead-header')}
        >
          <LayoutTemplate size={14} aria-hidden />
          Header Setting
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            limsOutlineBtnClass,
            'h-auto min-h-9 w-full justify-center gap-1.5 px-2 py-2 text-xs font-semibold',
          )}
          disabled={disabled}
          onClick={() => setPrintSettingsPanel('letterhead-footer')}
        >
          <Settings2 size={14} aria-hidden />
          Footer Setting
        </Button>
      </aside>

      <BisDocumentPrintSettingsDialog
        open={printSettingsPanel != null}
        onOpenChange={(next) => {
          if (!next) setPrintSettingsPanel(null)
        }}
        projectId={projectId}
        panel={printSettingsPanel ?? 'page'}
        disabled={disabled}
      />

      <Dialog open={signatureApplyOpen} onOpenChange={setSignatureApplyOpen}>
        <DialogContent
          persistOnFocusLoss
          layer="overlay"
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'w-[min(24rem,calc(100vw-1.5rem))] max-w-sm')}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Signature Apply
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-2 px-4 py-4">
            {(
              [
                {
                  key: 'applyWitnessedBy' as const,
                  label: 'Witnessed By',
                  checked: applyWitnessedBy,
                },
                {
                  key: 'applyAuthorizedSignatory' as const,
                  label: 'Authorized Signatory',
                  checked: applyAuthorizedSignatory,
                },
                {
                  key: 'applyTestedBy' as const,
                  label: 'Tested By',
                  checked: applyTestedBy,
                },
              ] as const
            ).map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-center justify-between gap-2.5 rounded-none border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 hover:bg-amber-50"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={item.checked}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [item.key]: e.target.checked,
                    })
                  }
                />
              </label>
            ))}
          </div>
          <DialogFooter className="border-t border-stone-300 bg-stone-50 px-4 py-3">
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'h-8')}
              onClick={() => setSignatureApplyOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FtrIsTestParameterDialog
        open={paramPickerOpen}
        onOpenChange={setParamPickerOpen}
        isCodeId={isCodeId}
        isCodeLabel={isCodeLabel.trim() || (isNumber !== '—' ? isNumber : '')}
        selectedParamIds={selectedParamIds}
        onToggleParam={toggleParam}
        onParamCreated={() => {
          /* list refresh handled inside dialog; selection via onToggleParam */
        }}
        disabled={disabled}
      />
    </div>
  )
}
