import { useEffect, useState } from 'react'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { downloadPdfViaPlaywright } from '@/lib/playwrightPdfClient'
import { fetchBisProjectById } from './bisProjectsApi'
import { fetchBisModulePayload, resolveTechnicalStaffForTestedBy, saveBisModulePayload } from './bisModuleDataApi'
import { loadBisProjectPrintPageSettings } from './bisPrintPageSettingsApi'
import { FactoryTestReportModuleFields, type FactoryTestReportPreviewContext } from './FactoryTestReportModuleFields'
import {
  applySampleToFactoryTestReport,
  emptyFactoryTestReportEntry,
  emptyFactoryTestReportPayload,
  parseFactoryTestReportPayload,
  type FactoryTestReportModulePayload,
} from './factoryTestReportModel'
import { buildFactoryTestReportHtml, factoryTestReportDataFromPrintData } from '../print/factoryTestReportHtml'
import { applyBisDocumentPrintPageSettings } from '../print/bisDocumentPrintPageSettings'
import { loadBisPrintData, printSignatoryDefaults } from '../print/loadBisPrintData'
import { openPendingPrintWindow, openPrintHtml } from '../print/openPrintHtml'
import { createBisProjectFileUrls } from './bisProjectFilesApi'
import type { OslSampleRequirementRow } from './oslSampleRequirementsModel'

/**
 * Generate Test Report (Factory Test Report for one sample): fill parameters, Save, Print, Download PDF.
 * Opened from Step 6 → Factory Test Report for samples ticked "In Offer Letter".
 */
export function FactoryTestReportGenerateDialog({
  projectId,
  sample,
  samples,
  isCodeId = null,
  isCodeLabel = '',
  isCodeSearch = null,
  isCodeRevisionYear = null,
  disabled = false,
  onClose,
  onSaved,
}: {
  projectId: string | null
  /** The sample to generate for; the dialog is open while set. */
  sample: OslSampleRequirementRow | null
  samples: OslSampleRequirementRow[]
  isCodeId?: string | null
  isCodeLabel?: string
  isCodeSearch?: string | null
  isCodeRevisionYear?: string | number | null
  disabled?: boolean
  onClose: () => void
  /** After the report is saved (Save / Print / Download save first). */
  onSaved?: () => void
}) {
  const [testReportGenerateOpen, setTestReportGenerateOpen] = useState(false)
  const [testReportGenerateBusy, setTestReportGenerateBusy] = useState(false)
  const [testReportGenerateLoading, setTestReportGenerateLoading] = useState(false)
  const [testReportGeneratePayload, setTestReportGeneratePayload] =
    useState<FactoryTestReportModulePayload>(() => emptyFactoryTestReportPayload())
  const [testReportGenerateSampleId, setTestReportGenerateSampleId] = useState<string | null>(null)
  const [testReportPreviewContext, setTestReportPreviewContext] =
    useState<FactoryTestReportPreviewContext | null>(null)
  const [testReportQcSignatureUrl, setTestReportQcSignatureUrl] = useState('')

  const closeDialog = () => {
    setTestReportGenerateOpen(false)
    onClose()
  }

  const openGenerateTestReport = (row: OslSampleRequirementRow) => {
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS Project First, Then Generate a Test Report.')
      return
    }
    setTestReportGenerateSampleId(row.id)
    setTestReportPreviewContext(null)
    setTestReportQcSignatureUrl('')
    setTestReportGenerateOpen(true)
    setTestReportGenerateLoading(true)
    void (async () => {
      try {
        const [raw, project, techRaw] = await Promise.all([
          fetchBisModulePayload(pid, 'factory-test-report'),
          fetchBisProjectById(pid),
          fetchBisModulePayload(pid, 'technical-staff').catch(() => null),
        ])
        const parsed = parseFactoryTestReportPayload(raw)
        const hasSample = parsed.reports.some((r) => r.sampleRowId === row.id)
        let next: FactoryTestReportModulePayload = hasSample
          ? parsed
          : {
              ...parsed,
              reports: [
                ...parsed.reports,
                applySampleToFactoryTestReport(emptyFactoryTestReportEntry(), row),
              ],
            }
        next = {
          ...next,
          reports: next.reports.map((r) =>
            r.sampleRowId === row.id ? applySampleToFactoryTestReport(r, row) : r,
          ),
        }

        const techPerson = resolveTechnicalStaffForTestedBy(techRaw)
        let qcSignatureUrl = ''
        if (techPerson?.applySignatureToDocuments && techPerson.signatureStoragePath) {
          try {
            const urls = await createBisProjectFileUrls(
              techPerson.signatureStoragePath,
              techPerson.signatureFileName || 'signature',
            )
            qcSignatureUrl = urls.viewUrl?.trim() || ''
          } catch {
            qcSignatureUrl = ''
          }
        }

        if (project) {
          const printData = await loadBisPrintData(project)
          const ctx = factoryTestReportDataFromPrintData({
            ...printData,
            modulePayload: next as unknown as Record<string, unknown>,
          })
          const sig = printSignatoryDefaults(printData)

          next = {
            ...next,
            // Witnessed By — Application Details (BIS project) is source of truth.
            inspectionOfficerName:
              (project.inspection_officer_name ?? '').trim() ||
              next.inspectionOfficerName.trim() ||
              ctx.inspectionOfficerName,
            inspectionOfficerDesignation:
              (project.inspection_officer_designation ?? '').trim() ||
              next.inspectionOfficerDesignation.trim() ||
              ctx.inspectionOfficerDesignation,
            authorisedName: next.authorisedName.trim() || sig.signatoryName || ctx.authorisedName,
            authorisedDesignation:
              next.authorisedDesignation.trim() ||
              sig.signatoryDesignation ||
              ctx.authorisedDesignation,
            // Tested By — Technical Staff module is source of truth.
            testedByName:
              (techPerson?.personName ?? '').trim() ||
              next.testedByName.trim() ||
              ctx.testedByName,
            testedByDesignation:
              (techPerson?.designation ?? '').trim() ||
              (() => {
                const fallback =
                  (techPerson?.personName ? '' : next.testedByDesignation.trim()) ||
                  ctx.testedByDesignation
                return fallback === 'Technical Staff / Quality Control Incharge'
                  ? ''
                  : fallback
              })(),
          }

          setTestReportPreviewContext({
            applicantName: ctx.applicantName,
            applicantAddress: ctx.applicantAddress,
            applicationNumber: ctx.applicationNumber,
            dateOfApplication: ctx.dateOfApplication,
            dateOfInspection: ctx.dateOfInspection,
            licenceNumber: ctx.applicationNumber,
            isNumber: ctx.isNumber,
            productTitle: ctx.productTitle || ctx.isTitle,
            inspectionOfficerName:
              (project.inspection_officer_name ?? '').trim() ||
              next.inspectionOfficerName.trim(),
            inspectionOfficerDesignation:
              (project.inspection_officer_designation ?? '').trim() ||
              next.inspectionOfficerDesignation.trim(),
            testedByName: next.testedByName.trim(),
            testedByDesignation: next.testedByDesignation.trim(),
          })
        } else if (techPerson) {
          next = {
            ...next,
            testedByName: techPerson.personName || next.testedByName.trim(),
            testedByDesignation: techPerson.designation || next.testedByDesignation.trim(),
          }
        }

        setTestReportQcSignatureUrl(qcSignatureUrl)
        setTestReportGeneratePayload(next)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load Test Report module.')
        setTestReportGeneratePayload({
          ...emptyFactoryTestReportPayload(),
          reports: [applySampleToFactoryTestReport(emptyFactoryTestReportEntry(), row)],
        })
      } finally {
        setTestReportGenerateLoading(false)
      }
    })()
  }


  useEffect(() => {
    if (!sample) return
    const timer = window.setTimeout(() => openGenerateTestReport(sample), 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample?.id])

  const saveGenerateTestReport = async () => {
    const pid = (projectId ?? '').trim()
    if (!pid) throw new Error('Save the BIS project first, then save the Test Report.')
    await saveBisModulePayload(
      pid,
      'factory-test-report',
      testReportGeneratePayload as unknown as Record<string, unknown>,
    )
  }

  const handleGenerateTestReportSave = () => {
    setTestReportGenerateBusy(true)
    void saveGenerateTestReport()
      .then(() => { toast.success('Test Report Module Saved.'); onSaved?.() })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : 'Could not save Test Report.'),
      )
      .finally(() => setTestReportGenerateBusy(false))
  }

  const handleGenerateTestReportPrint = () => {
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS Project First, Then Print the Test Report.')
      return
    }
    setTestReportGenerateBusy(true)
    void (async () => {
      try {
        await saveGenerateTestReport()
        const project = await fetchBisProjectById(pid)
        if (!project) throw new Error('BIS project not found.')
        const printData = await loadBisPrintData(project)
        const data = {
          ...factoryTestReportDataFromPrintData({
            ...printData,
            modulePayload: testReportGeneratePayload as unknown as Record<string, unknown>,
          }),
          reports: testReportGeneratePayload.reports,
          inspectionOfficerName:
            (project.inspection_officer_name ?? '').trim() ||
            testReportGeneratePayload.inspectionOfficerName,
          inspectionOfficerDesignation:
            (project.inspection_officer_designation ?? '').trim() ||
            testReportGeneratePayload.inspectionOfficerDesignation,
          authorisedName: testReportGeneratePayload.authorisedName,
          authorisedDesignation: testReportGeneratePayload.authorisedDesignation,
          testedByName: testReportGeneratePayload.testedByName,
          testedByDesignation: testReportGeneratePayload.testedByDesignation,
          testedBySignatureImageUrl: testReportQcSignatureUrl,
        }
        const html = applyBisDocumentPrintPageSettings(
          buildFactoryTestReportHtml(data),
          await loadBisProjectPrintPageSettings(pid),
        )
        const pending = openPendingPrintWindow('Preparing Test Report…')
        const err = openPrintHtml(html, { target: pending })
        if (err) toast.error(err)
        else toast.success('Test Report Ready to Print.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not print Test Report.')
      } finally {
        setTestReportGenerateBusy(false)
      }
    })()
  }

  const handleGenerateTestReportDownload = () => {
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS Project First, Then Download the Test Report.')
      return
    }
    setTestReportGenerateBusy(true)
    void (async () => {
      try {
        await saveGenerateTestReport()
        const project = await fetchBisProjectById(pid)
        if (!project) throw new Error('BIS project not found.')
        const printData = await loadBisPrintData(project)
        const data = {
          ...factoryTestReportDataFromPrintData({
            ...printData,
            modulePayload: testReportGeneratePayload as unknown as Record<string, unknown>,
          }),
          reports: testReportGeneratePayload.reports,
          inspectionOfficerName:
            (project.inspection_officer_name ?? '').trim() ||
            testReportGeneratePayload.inspectionOfficerName,
          inspectionOfficerDesignation:
            (project.inspection_officer_designation ?? '').trim() ||
            testReportGeneratePayload.inspectionOfficerDesignation,
          authorisedName: testReportGeneratePayload.authorisedName,
          authorisedDesignation: testReportGeneratePayload.authorisedDesignation,
          testedByName: testReportGeneratePayload.testedByName,
          testedByDesignation: testReportGeneratePayload.testedByDesignation,
          testedBySignatureImageUrl: testReportQcSignatureUrl,
        }
        const isLabel =
          (isCodeSearch ?? '').trim() ||
          isCodeLabel.trim() ||
          (printData.isCode?.label ?? '').trim() ||
          ''
        const isDigits =
          isLabel.replace(/^is\s*/i, '').match(/\d{3,7}/)?.[0] ||
          isLabel.replace(/[^\d]/g, '') ||
          ''
        const focusId = (testReportGenerateSampleId ?? '').trim()
        const activeReport =
          (focusId
            ? testReportGeneratePayload.reports.find((r) => r.sampleRowId === focusId)
            : null) ??
          testReportGeneratePayload.reports[0] ??
          null
        const batchRaw = (activeReport?.batchNumber ?? '').trim()
        const batchSafe = batchRaw.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
        const filename = isDigits
          ? batchSafe
            ? `IS ${isDigits} Test Report - ${batchSafe}.pdf`
            : `IS ${isDigits} Test Report.pdf`
          : batchSafe
            ? `Test Report - ${batchSafe}.pdf`
            : 'Test Report.pdf'
        await downloadPdfViaPlaywright({
          html: applyBisDocumentPrintPageSettings(
            buildFactoryTestReportHtml(data),
            await loadBisProjectPrintPageSettings(pid),
          ),
          filename,
        })
        toast.success('Test Report PDF Downloaded.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not download Test Report.')
      } finally {
        setTestReportGenerateBusy(false)
      }
    })()
  }


  const rows = samples
  return (
    <>
      <Dialog
        open={testReportGenerateOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog()
            setTestReportGenerateBusy(false)
            setTestReportGenerateLoading(false)
            setTestReportGenerateSampleId(null)
            setTestReportPreviewContext(null)
            setTestReportQcSignatureUrl('')
          }
        }}
      >
        <DialogContent
          persistOnFocusLoss
          layer="top"
          aria-describedby={undefined}
          className={cn(
            'flex !flex-col gap-0 overflow-hidden p-0',
            '!flex h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 rounded-none border-0 bg-stone-100 shadow-none sm:rounded-none',
            'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0',
            'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
            'border-stone-600 ring-1 ring-amber-700/20',
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
                Generate Test Report
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {testReportGenerateLoading ? (
              <p className="py-8 text-center text-sm text-stone-500">Loading Test Report Module…</p>
            ) : (
              <FactoryTestReportModuleFields
                value={testReportGeneratePayload}
                onChange={setTestReportGeneratePayload}
                disabled={disabled || testReportGenerateBusy}
                sampleOptions={rows}
                isCodeId={isCodeId}
                isCodeLabel={
                  isCodeLabel.trim() ||
                  [isCodeSearch, isCodeRevisionYear].filter(Boolean).join(': ') ||
                  ''
                }
                focusSampleRowId={testReportGenerateSampleId}
                previewContext={testReportPreviewContext}
                testedBySignatureImageUrl={testReportQcSignatureUrl}
                projectId={projectId}
              />
            )}
          </div>

          <DialogFooter className="!flex-row shrink-0 items-center !justify-between gap-2 !space-x-0 border-t border-stone-300 bg-stone-50 px-4 py-2">
            <Button
              type="button"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'h-8')}
              disabled={testReportGenerateBusy}
              onClick={() => {
                closeDialog()
                setTestReportGenerateSampleId(null)
                setTestReportPreviewContext(null)
                setTestReportQcSignatureUrl('')
              }}
            >
              Close
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className={cn(limsOutlineBtnClass, 'h-8')}
                disabled={disabled || testReportGenerateBusy || testReportGenerateLoading}
                onClick={handleGenerateTestReportSave}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(limsOutlineBtnClass, 'h-8 gap-1.5')}
                disabled={disabled || testReportGenerateBusy || testReportGenerateLoading}
                onClick={handleGenerateTestReportPrint}
              >
                Print
              </Button>
              <Button
                type="button"
                className={cn(limsPrimaryBtnClass, 'h-8 gap-1.5')}
                disabled={disabled || testReportGenerateBusy || testReportGenerateLoading}
                onClick={handleGenerateTestReportDownload}
              >
                <FileDown className="h-4 w-4" aria-hidden />
                {testReportGenerateBusy ? 'Preparing…' : 'Download PDF'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
