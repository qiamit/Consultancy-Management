import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Download, FileCheck2, FileText, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { limsDarkBarGlowStyle, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { PeriodDateInput, RenewalProductionTable } from './RenewalProductionTable'
import { RenewalCurrencyInput } from './RenewalCurrencyInput'
import { generateMonthlyRenewalRows, type BisRenewalForm } from './types'
import {
  downloadRenewalCalculationPdf,
  downloadRenewalClientWorkbook,
  importRenewalClientWorkbook,
} from './renewalClientWorkflow'
import { listBisProjectFiles, uploadBisProjectFile } from '../projects/bisProjectFilesApi'
import { toast } from 'sonner'

export function BisRenewalsForm({
  open,
  onOpenChange,
  editing,
  form,
  onChange,
  canSave,
  saving,
  errorMessage,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: boolean
  form: BisRenewalForm
  onChange: Dispatch<SetStateAction<BisRenewalForm>>
  canSave: boolean
  saving: boolean
  errorMessage: string | null
  onSave: () => void
}) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const certificateInputRef = useRef<HTMLInputElement>(null)
  const [workflowBusy, setWorkflowBusy] = useState<'import' | 'pdf' | 'certificate' | null>(null)
  const [certificateFile, setCertificateFile] = useState<{ name: string; url?: string } | null>(null)
  const hasPeriods = Boolean(form.renewalPeriodFrom && form.renewalPeriodTo && form.productionRows.length)
  const hasClientData = Boolean(form.basicUnitRate.trim())
    && form.productionRows.some((row) => row.productionUnit.trim() && row.coveredUnit.trim())

  useEffect(() => {
    if (!form.projectId) return
    let active = true
    void listBisProjectFiles(form.projectId, 'renewal-ca-certificate')
      .then((files) => {
        if (active) setCertificateFile(files[0] ? { name: files[0].file_name, url: files[0].viewUrl } : null)
      })
      .catch(() => {
        if (active) setCertificateFile(null)
      })
    return () => { active = false }
  }, [form.projectId])

  const downloadBlankWorkbook = () => {
    try {
      downloadRenewalClientWorkbook(form)
      toast.success('Blank client workbook downloaded. Send it to the client to complete.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the client workbook.')
    }
  }

  const importClientWorkbook = async (file: File) => {
    setWorkflowBusy('import')
    try {
      const imported = await importRenewalClientWorkbook(file, form)
      onChange((previous) => ({
        ...previous,
        basicUnitRate: imported.basicUnitRate,
        productionRows: imported.productionRows,
      }))
      toast.success('Client workbook imported. Production values and fees are now recalculated; save the renewal to keep the data.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import the client workbook.')
    } finally {
      setWorkflowBusy(null)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const downloadCalculationPdf = async () => {
    setWorkflowBusy('pdf')
    try {
      await downloadRenewalCalculationPdf(form)
      toast.success('Calculated production report downloaded as PDF.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the calculation PDF.')
    } finally {
      setWorkflowBusy(null)
    }
  }

  const uploadCertificate = async (file: File) => {
    setWorkflowBusy('certificate')
    try {
      const uploaded = await uploadBisProjectFile(form.projectId, file, 'renewal-ca-certificate', {
        displayName: `${form.clientLabel || 'Client'} - CM-L ${form.cmLDigits || 'license'} - Renewal ${form.renewalPeriodFrom || 'period'} - CA Certificate - ${file.name}`,
      })
      setCertificateFile({ name: uploaded.file_name, url: uploaded.viewUrl })
      toast.success('CA certificate uploaded and attached to the BIS license project.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload the CA certificate.')
    } finally {
      setWorkflowBusy(null)
      if (certificateInputRef.current) certificateInputRef.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          '!flex z-50 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:rounded-none',
          'left-0 top-0',
          'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
          'border-stone-600 ring-1 ring-amber-700/20',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-center">
            <DialogTitle className="text-center text-base font-semibold tracking-tight text-white sm:text-lg">
              Renewal Sheet for - {form.clientLabel || form.projectLabel || 'License'}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-[2mm] py-4 sm:px-[2mm] sm:py-5">
          {errorMessage ? (
            <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
          <div className="mb-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="renewal-period-from">Period From</Label>
              <PeriodDateInput
                id="renewal-period-from"
                label="Renewal period from"
                value={form.renewalPeriodFrom}
                onChange={(renewalPeriodFrom) => onChange((previous) => ({
                  ...previous,
                  renewalPeriodFrom,
                  productionRows: generateMonthlyRenewalRows(
                    renewalPeriodFrom,
                    previous.renewalPeriodTo,
                    previous.productionRows,
                  ),
                }))}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="renewal-period-to">Period To</Label>
              <PeriodDateInput
                id="renewal-period-to"
                label="Renewal period to"
                value={form.renewalPeriodTo}
                onChange={(renewalPeriodTo) => onChange((previous) => ({
                  ...previous,
                  renewalPeriodTo,
                  productionRows: generateMonthlyRenewalRows(
                    previous.renewalPeriodFrom,
                    renewalPeriodTo,
                    previous.productionRows,
                  ),
                }))}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="renewal-term-years">Renewal Year</Label>
              <Select
                value={form.renewalTermYears}
                onValueChange={(renewalTermYears) => onChange((previous) => ({ ...previous, renewalTermYears }))}
              >
                <SelectTrigger id="renewal-term-years" aria-label="Renewal year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((years) => (
                    <SelectItem key={years} value={String(years)}>{years} Year{years > 1 ? 's' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="renewal-basic-unit-rate">Basic Unit Rate</Label>
              <RenewalCurrencyInput
                id="renewal-basic-unit-rate"
                label="Basic Unit Rate"
                value={form.basicUnitRate}
                onChange={(basicUnitRate) => onChange((previous) => ({ ...previous, basicUnitRate }))}
              />
            </div>
          </div>
          <RenewalProductionTable
            rows={form.productionRows}
            unitOfIs={form.unitOfIs}
            renewalPeriodFrom={form.renewalPeriodFrom}
            basicUnitRate={form.basicUnitRate}
            slabRates={form.slabRates}
            onRowsChange={(productionRows) => onChange((previous) => ({ ...previous, productionRows }))}
          />
        </div>

        <section className="flex shrink-0 flex-wrap items-center gap-2 border-t border-stone-300 bg-stone-50 px-3 py-2" aria-label="Renewal client actions">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            aria-label="Import completed client renewal workbook"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void importClientWorkbook(file) }}
          />
          <input
            ref={certificateInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            aria-label="Upload CA-attested renewal certificate"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCertificate(file) }}
          />
          <Button type="button" variant="outline" className="h-8 rounded-none border-stone-400" disabled={!hasPeriods || saving} onClick={downloadBlankWorkbook}><Download className="mr-1 size-4" /> Blank Sheet</Button>
          <Button type="button" variant="outline" className="h-8 rounded-none border-stone-400" disabled={!hasPeriods || workflowBusy !== null || saving} onClick={() => importInputRef.current?.click()}><Upload className="mr-1 size-4" /> {workflowBusy === 'import' ? 'Importing…' : 'Import Data'}</Button>
          <Button type="button" variant="outline" className="h-8 rounded-none border-stone-400" disabled={!hasClientData || workflowBusy !== null || saving} onClick={() => void downloadCalculationPdf()}><FileText className="mr-1 size-4" /> {workflowBusy === 'pdf' ? 'Creating…' : 'Send Report'}</Button>
          <Button type="button" variant="outline" className="h-8 rounded-none border-stone-400" disabled={!hasClientData || workflowBusy !== null || saving} onClick={() => certificateInputRef.current?.click()}><FileCheck2 className="mr-1 size-4" /> {workflowBusy === 'certificate' ? 'Uploading…' : 'Attach CA Certificate'}</Button>
          {form.projectId && certificateFile?.url ? <a className="truncate text-xs text-stone-700 underline" href={certificateFile.url} target="_blank" rel="noreferrer">{certificateFile.name}</a> : null}
        </section>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t-2 border-stone-500 bg-stone-100 px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-none border-stone-500"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={onSave}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving…' : editing ? 'Update Renewal' : 'Save Renewal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
