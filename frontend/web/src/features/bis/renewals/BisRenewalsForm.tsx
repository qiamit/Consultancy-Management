import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { ChevronRight, Download, FileCheck2, FileText, Mail, MessageCircle, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { limsDarkBarGlowStyle, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { PeriodDateInput, RenewalProductionTable } from './RenewalProductionTable'
import { RenewalCurrencyInput } from './RenewalCurrencyInput'
import { formatDisplayDate, generateMonthlyRenewalRows, type BisRenewalForm } from './types'
import {
  createRenewalCalculationPdfFile,
  createRenewalClientWorkbookFile,
  downloadRenewalCalculationPdf,
  downloadRenewalClientWorkbook,
  emailRenewalCalculationPdfToClient,
  emailRenewalWorkbookToClient,
  importRenewalClientWorkbook,
  resolveClientWhatsAppNumber,
  normalizeWhatsAppNumber,
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
  const [workflowBusy, setWorkflowBusy] = useState<'workbook' | 'whatsapp' | 'email' | 'import' | 'pdf' | 'certificate' | null>(null)
  const [recipientDialog, setRecipientDialog] = useState<'email' | 'whatsapp' | null>(null)
  const [recipientPurpose, setRecipientPurpose] = useState<'workbook' | 'report'>('workbook')
  const [recipientValue, setRecipientValue] = useState('')
  const [pendingWhatsAppShare, setPendingWhatsAppShare] = useState<{ file: File; phone: string; message: string } | null>(null)
  const [certificateFile, setCertificateFile] = useState<{ name: string; url?: string } | null>(null)
  const hasPeriods = Boolean(form.renewalPeriodFrom && form.renewalPeriodTo && form.productionRows.length)
  const hasClientData = Boolean(form.basicUnitRate.trim())
    && form.productionRows.some((row) => row.productionUnit.trim() && row.coveredUnit.trim())
  const canSharePendingFile = (() => {
    if (!pendingWhatsAppShare || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
    try {
      return navigator.canShare({ files: [pendingWhatsAppShare.file] })
    } catch {
      return false
    }
  })()
  const menuContentClass = 'w-72 rounded-md border border-stone-300 bg-white p-1.5 text-stone-800 shadow-xl'
  const menuItemClass = 'min-h-10 cursor-pointer rounded-sm px-2.5 py-2 text-sm focus:bg-amber-50 focus:text-stone-900 data-[highlighted]:bg-amber-50 data-[highlighted]:text-stone-900'
  const menuSubTriggerClass = 'min-h-10 cursor-pointer rounded-sm px-2.5 py-2 text-sm focus:bg-amber-50 focus:text-stone-900 data-[state=open]:bg-amber-50'
  const menuSubContentClass = 'w-64 rounded-md border border-stone-300 bg-white p-1.5 text-stone-800 shadow-xl'

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

  const downloadBlankWorkbook = async () => {
    setWorkflowBusy('workbook')
    try {
      await downloadRenewalClientWorkbook(form)
      toast.success('Blank client workbook downloaded. Send it to the client to complete.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the client workbook.')
    } finally {
      setWorkflowBusy(null)
    }
  }

  const shareBlankWorkbookOnWhatsApp = async (recipient?: string): Promise<boolean> => {
    setWorkflowBusy('whatsapp')
    try {
      const phone = normalizeWhatsAppNumber(recipient?.trim() || await resolveClientWhatsAppNumber(form.clientId))
      const file = await createRenewalClientWorkbookFile(form)
      setPendingWhatsAppShare({
        file,
        phone,
        message: `Please find the blank BIS renewal production sheet for ${form.clientLabel || 'your company'} (${form.isCodeLabel || 'BIS license renewal'}). Please complete the highlighted fields and return the same workbook.`,
      })
      toast.success('Workbook is ready. Choose Share File to attach it through your device share sheet.')
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare the WhatsApp share.')
      return false
    } finally {
      setWorkflowBusy(null)
    }
  }

  const emailBlankWorkbook = async (recipient?: string): Promise<boolean> => {
    setWorkflowBusy('email')
    try {
      const email = await emailRenewalWorkbookToClient(form, recipient)
      toast.success(`Blank renewal workbook emailed to ${email}.`)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not email the client workbook.')
      return false
    } finally {
      setWorkflowBusy(null)
    }
  }

  const shareCalculationReportOnWhatsApp = async (recipient?: string): Promise<boolean> => {
    setWorkflowBusy('whatsapp')
    try {
      const phone = normalizeWhatsAppNumber(recipient?.trim() || await resolveClientWhatsAppNumber(form.clientId))
      const file = await createRenewalCalculationPdfFile(form)
      setPendingWhatsAppShare({
        file,
        phone,
        message: `Please find the calculated BIS renewal production report for ${form.clientLabel || 'your company'} (${form.isCodeLabel || 'BIS license renewal'}). Please review and arrange CA attestation.`,
      })
      toast.success('PDF report is ready. Choose Share File to attach it through your device share sheet.')
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare the WhatsApp report.')
      return false
    } finally {
      setWorkflowBusy(null)
    }
  }

  const emailCalculationReport = async (recipient?: string): Promise<boolean> => {
    setWorkflowBusy('email')
    try {
      const email = await emailRenewalCalculationPdfToClient(form, recipient)
      toast.success(`Calculated renewal report emailed to ${email}.`)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not email the renewal report.')
      return false
    } finally {
      setWorkflowBusy(null)
    }
  }

  const openRecipientDialog = (purpose: 'workbook' | 'report', channel: 'email' | 'whatsapp') => {
    setRecipientPurpose(purpose)
    setRecipientValue('')
    setRecipientDialog(channel)
  }

  const sharePreparedFile = async () => {
    if (!pendingWhatsAppShare) return
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function'
      || !navigator.canShare({ files: [pendingWhatsAppShare.file] })) {
      toast.error('This browser cannot share files directly. Use Download & Open WhatsApp, then attach the downloaded file.')
      return
    }
    try {
      await navigator.share({ files: [pendingWhatsAppShare.file], text: pendingWhatsAppShare.message })
      setPendingWhatsAppShare(null)
      toast.success('The file was shared from your device share sheet.')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error(error instanceof Error ? error.message : 'Could not share the file.')
      }
    }
  }

  const downloadAndOpenWhatsApp = () => {
    if (!pendingWhatsAppShare) return
    const { file, phone, message } = pendingWhatsAppShare
    const fileUrl = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = fileUrl
    anchor.download = file.name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000)
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
    setPendingWhatsAppShare(null)
  }

  const submitRecipient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const recipient = recipientValue.trim()
    if (!recipientDialog || !recipient) return
    const kind = recipientDialog
    const complete = recipientPurpose === 'report'
      ? kind === 'email'
        ? await emailCalculationReport(recipient)
        : await shareCalculationReportOnWhatsApp(recipient)
      : kind === 'email'
        ? await emailBlankWorkbook(recipient)
        : await shareBlankWorkbookOnWhatsApp(recipient)
    if (complete) setRecipientDialog(null)
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
    <>
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
              Renewal Sheet for {form.clientLabel || 'Firm Name'} of License No. {form.cmLDigits ? `CM/L-${form.cmLDigits}` : '—'} ({form.currentValidity ? `Valid till ${formatDisplayDate(form.currentValidity)}` : 'Validity not set'})
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
                    previous.currentValidity,
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
                    previous.currentValidity,
                  ),
                }))}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="renewal-term-years">Production For Year</Label>
              <Select
                value={form.renewalTermYears}
                onValueChange={(renewalTermYears) => onChange((previous) => ({ ...previous, renewalTermYears }))}
              >
                <SelectTrigger id="renewal-term-years" aria-label="Production for year">
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
              <Label htmlFor="renewal-basic-unit-rate">Basic Unit Rate Approx</Label>
              <RenewalCurrencyInput
                id="renewal-basic-unit-rate"
                label="Basic Unit Rate Approx"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-8 rounded-none border-stone-400" disabled={!hasPeriods || workflowBusy !== null || saving}>
                <Download className="mr-1 size-4" /> {workflowBusy === 'workbook' ? 'Preparing…' : workflowBusy === 'whatsapp' ? 'Opening WhatsApp…' : workflowBusy === 'email' ? 'Sending email…' : 'Blank Sheet'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={menuContentClass}>
              <DropdownMenuLabel className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Blank Renewal Sheet</DropdownMenuLabel>
              <DropdownMenuItem className={menuItemClass} onSelect={() => void downloadBlankWorkbook()}><Download className="size-4 shrink-0 text-stone-500" /> <span>Download Workbook</span></DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 bg-stone-200" />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className={menuSubTriggerClass}><MessageCircle className="size-4 shrink-0 text-emerald-700" /> <span>WhatsApp</span> <ChevronRight className="ml-auto size-4 text-stone-400" /></DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={menuSubContentClass}>
                  <DropdownMenuItem className={menuItemClass} onSelect={() => void shareBlankWorkbookOnWhatsApp()}>Use Client WhatsApp</DropdownMenuItem>
                  <DropdownMenuItem className={menuItemClass} onSelect={() => openRecipientDialog('workbook', 'whatsapp')}>Enter WhatsApp Number…</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className={menuSubTriggerClass}><Mail className="size-4 shrink-0 text-stone-500" /> <span>Email Client</span> <ChevronRight className="ml-auto size-4 text-stone-400" /></DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={menuSubContentClass}>
                  <DropdownMenuItem className={menuItemClass} onSelect={() => void emailBlankWorkbook()}>Use Client Email</DropdownMenuItem>
                  <DropdownMenuItem className={menuItemClass} onSelect={() => openRecipientDialog('workbook', 'email')}>Enter Email Address…</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="outline" className="h-8 rounded-none border-stone-400" disabled={!hasPeriods || workflowBusy !== null || saving} onClick={() => importInputRef.current?.click()}><Upload className="mr-1 size-4" /> {workflowBusy === 'import' ? 'Importing…' : 'Import Data'}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-8 rounded-none border-stone-400" disabled={!hasClientData || workflowBusy !== null || saving}>
                <FileText className="mr-1 size-4" /> {workflowBusy === 'pdf' ? 'Creating…' : workflowBusy === 'whatsapp' ? 'Opening WhatsApp…' : workflowBusy === 'email' ? 'Sending email…' : 'Send Report'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={menuContentClass}>
              <DropdownMenuLabel className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Calculated Renewal Report</DropdownMenuLabel>
              <DropdownMenuItem className={menuItemClass} onSelect={() => void downloadCalculationPdf()}><Download className="size-4 shrink-0 text-stone-500" /> <span>Download PDF Report</span></DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 bg-stone-200" />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className={menuSubTriggerClass}><MessageCircle className="size-4 shrink-0 text-emerald-700" /> <span>WhatsApp</span> <ChevronRight className="ml-auto size-4 text-stone-400" /></DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={menuSubContentClass}>
                  <DropdownMenuItem className={menuItemClass} onSelect={() => void shareCalculationReportOnWhatsApp()}>Use Client WhatsApp</DropdownMenuItem>
                  <DropdownMenuItem className={menuItemClass} onSelect={() => openRecipientDialog('report', 'whatsapp')}>Enter WhatsApp Number…</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className={menuSubTriggerClass}><Mail className="size-4 shrink-0 text-stone-500" /> <span>Email Client</span> <ChevronRight className="ml-auto size-4 text-stone-400" /></DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={menuSubContentClass}>
                  <DropdownMenuItem className={menuItemClass} onSelect={() => void emailCalculationReport()}>Use Client Email</DropdownMenuItem>
                  <DropdownMenuItem className={menuItemClass} onSelect={() => openRecipientDialog('report', 'email')}>Enter Email Address…</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
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
      <Dialog open={recipientDialog !== null} onOpenChange={(nextOpen) => { if (!nextOpen && workflowBusy === null) setRecipientDialog(null) }}>
        <DialogContent className="max-w-md rounded-none border-stone-500">
          <DialogHeader>
            <DialogTitle>{recipientDialog === 'email' ? 'Email Client' : 'WhatsApp'}{recipientPurpose === 'report' ? ' — Send Report' : ''}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void submitRecipient(event)}>
            <div className="space-y-2">
              <Label htmlFor="renewal-recipient">
                {recipientDialog === 'email' ? 'Email address' : 'WhatsApp number'}
              </Label>
              <Input
                id="renewal-recipient"
                type={recipientDialog === 'email' ? 'email' : 'tel'}
                autoComplete={recipientDialog === 'email' ? 'email' : 'tel'}
                placeholder={recipientDialog === 'email' ? 'client@example.com' : '+91 9876543210'}
                value={recipientValue}
                onChange={(event) => setRecipientValue(event.target.value)}
                required
                autoFocus
              />
              {recipientDialog === 'whatsapp' ? (
                <p className="text-xs text-stone-500">After preparing the file, you can share it through your device share sheet or download it and attach it to the selected WhatsApp chat.</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-none" onClick={() => setRecipientDialog(null)} disabled={workflowBusy !== null}>Cancel</Button>
              <Button type="submit" className={limsPrimaryBtnClass} disabled={workflowBusy !== null}>
                {workflowBusy === 'email' ? 'Sending…' : workflowBusy === 'whatsapp' ? 'Preparing…' : recipientDialog === 'email' ? 'Send Email' : 'Open WhatsApp'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={pendingWhatsAppShare !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setPendingWhatsAppShare(null) }}>
        <DialogContent className="max-w-md rounded-none border-stone-500">
          <DialogHeader>
            <DialogTitle>Share File with WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-stone-700">
            <p><strong>{pendingWhatsAppShare?.file.name}</strong> is ready. WhatsApp chat links cannot attach a file automatically.</p>
            {canSharePendingFile ? (
              <p className="rounded border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900">This browser supports file sharing. Choose Share File, then select WhatsApp and the recipient in the device share sheet.</p>
            ) : (
              <p className="rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">This browser does not support direct file sharing. Download the file, open the selected WhatsApp chat, then attach the file there.</p>
            )}
            <p className="text-xs text-stone-500">The download option opens the saved or entered number’s chat; you must attach the downloaded file in WhatsApp.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-none" onClick={() => setPendingWhatsAppShare(null)}>Cancel</Button>
            <Button type="button" variant="outline" className="rounded-none" onClick={downloadAndOpenWhatsApp} disabled={!pendingWhatsAppShare}>Download &amp; Open Chat</Button>
            {canSharePendingFile ? <Button type="button" className={limsPrimaryBtnClass} onClick={() => void sharePreparedFile()} disabled={!pendingWhatsAppShare}>Share File…</Button> : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
