import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsDarkBarGlowStyle, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import type { DocumentTemplateKind } from '@/features/settings/lab-settings/documentTemplateTypes'
import { QuotationTemplatesDialog } from '../quotation/QuotationTemplatesDialog'
import { QuotationFooterBar } from '../quotation/QuotationFooterBar'
import { QuotationHeaderBar } from '../quotation/QuotationHeaderBar'
import { QuotationTable } from '../quotation/QuotationTable'
import {
  QuotationFormView,
  type QuotationClientContact,
  type QuotationProductDetails,
} from '../quotation/QuotationForm'
import {
  computeQuotationTotals,
  emptyQuotationForm,
  lineAmount,
  nextQuotationNumber,
  normalizePaymentMethod,
  parseMoney,
  rowToForm,
  type QuotationForm as QuotationFormType,
  type QuotationLineRow,
  type QuotationRow,
  type QuotationStatus,
} from '../quotation/types'
import { fetchDefaultQuotationTerm } from '../quotation/quotationTermsApi'
import { fetchDefaultQuotationNote } from '../quotation/quotationNotesApi'
import { fetchDefaultSignatureForKind } from '../quotation/quotationSignatureStorage'
import {
  downloadQuotationPdfWithTemplate,
  printQuotationsWithTemplate,
} from '../quotation/outputQuotationDocument'

export type SaleDocumentModuleConfig = {
  title: string
  documentKind: DocumentTemplateKind
  addLabel: string
  emptyHint: string
  numberColumnLabel: string
}

function storageKey(kind: DocumentTemplateKind): string {
  return `lims.saleDocuments.${kind}`
}

function defaultNumberPrefix(kind: DocumentTemplateKind): string {
  const year = new Date().getFullYear()
  switch (kind) {
    case 'proformaInvoice':
      return `PI-${year}-`
    case 'invoice':
      return `INV-${year}-`
    case 'creditNote':
      return `CN-${year}-`
    case 'paymentReceipt':
      return `PR-${year}-`
    default:
      return `DOC-${year}-`
  }
}

function defaultStatus(kind: DocumentTemplateKind): QuotationStatus {
  switch (kind) {
    case 'proformaInvoice':
      return 'Proforma'
    case 'invoice':
      return 'Invoice'
    default:
      return 'Draft'
  }
}

function isAbortOrLockError(err: unknown): boolean {
  const message =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: unknown }).message ?? '')
          : String(err ?? '')
  const name =
    err instanceof Error
      ? err.name
      : typeof err === 'object' && err !== null && 'name' in err
        ? String((err as { name?: unknown }).name ?? '')
        : ''
  const lower = `${name} ${message}`.toLowerCase()
  return (
    name === 'AbortError' ||
    lower.includes('aborterror') ||
    lower.includes('lock broken by another request') ||
    lower.includes("steal' option") ||
    lower.includes('request was aborted') ||
    lower.includes('signal is aborted')
  )
}

function loadStoredRows(kind: DocumentTemplateKind): QuotationRow[] {
  try {
    const raw = localStorage.getItem(storageKey(kind))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as QuotationRow[]) : []
  } catch {
    return []
  }
}

function persistRows(kind: DocumentTemplateKind, rows: QuotationRow[]) {
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(rows))
  } catch {
    /* ignore quota / private mode */
  }
}

function formToStoredRow(
  form: QuotationFormType,
  existingId: string | null,
  opts?: { paymentReceipt?: boolean },
): QuotationRow {
  const totals = computeQuotationTotals(form)
  const paymentAmount = Math.max(0, parseMoney(form.paymentAmount))
  const id = existingId ?? crypto.randomUUID()
  const lineItems: QuotationLineRow[] = opts?.paymentReceipt
    ? []
    : form.lines
        .filter((l) => l.description.trim().length > 0)
        .map((l, index) => ({
          id: crypto.randomUUID(),
          quotation_id: id,
          line_no: index + 1,
          description: l.description.trim(),
          details: l.details.trim() || null,
          make: l.make.trim() || null,
          hsn_sac: l.hsnSac.trim() || null,
          item_code: l.itemCode.trim() || null,
          quantity: parseMoney(l.quantity) || 1,
          unit: l.unit.trim() || 'Nos',
          rate: parseMoney(l.rate),
          amount: lineAmount(l),
          discount_percent: parseMoney(l.discountPercent),
          gst_percent: parseMoney(l.gstPercent),
          line_remarks: l.lineRemarks.trim() || null,
          delivery_period: l.deliveryPeriod.trim() || null,
        }))

  return {
    id,
    quotation_number: form.quotationNumber.trim(),
    quotation_date: form.quotationDate || new Date().toISOString().slice(0, 10),
    valid_until: opts?.paymentReceipt ? null : form.validUntil || null,
    client_id: form.clientId || null,
    client_name: form.clientName.trim(),
    contact_person: form.contactPerson.trim() || null,
    contact_email: form.contactEmail.trim() || null,
    contact_mobile: form.contactMobile.trim() || null,
    client_address: form.clientAddress.trim() || null,
    client_gst_number: form.clientGstNumber.trim() || null,
    subject: form.subject.trim() || null,
    reference_no: opts?.paymentReceipt
      ? normalizePaymentMethod(form.paymentMethod)
      : form.referenceNo.trim() || null,
    status: form.status,
    payment_terms: form.paymentTerms.trim() || null,
    notes: form.notes.trim() || null,
    remarks: form.remarks.trim() || null,
    signature_text: form.signatureText.trim() || null,
    signature_image_path: form.signatureImagePath.trim() || null,
    discount_percent: 0,
    discount_amount: opts?.paymentReceipt ? 0 : totals.discountAmount,
    transportation_charges: opts?.paymentReceipt ? 0 : totals.transportationCharges,
    packaging_charges: opts?.paymentReceipt ? 0 : totals.packagingCharges,
    gst_percent: opts?.paymentReceipt ? 0 : totals.effectiveGstPercent,
    gst_amount: opts?.paymentReceipt ? 0 : totals.gstAmount,
    subtotal: opts?.paymentReceipt ? paymentAmount : totals.subtotal,
    grand_total: opts?.paymentReceipt ? paymentAmount : totals.grandTotal,
    line_items: lineItems,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

/**
 * Quotation-matching chrome for other Sale modules (same theme, header, table, footer, form).
 * Records persist in localStorage until dedicated DB tables are added.
 */
export function SaleDocumentMasterPage({ config }: { config: SaleDocumentModuleConfig }) {
  const [rows, setRows] = useState<QuotationRow[]>(() => loadStoredRows(config.documentKind))
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<QuotationFormType>(() => emptyQuotationForm())
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)

  const [clientOptions, setClientOptions] = useState<FilterComboboxOption[]>([])
  const [clientContactById, setClientContactById] = useState<Record<string, QuotationClientContact>>(
    {},
  )
  const [productOptions, setProductOptions] = useState<FilterComboboxOption[]>([])
  const [productById, setProductById] = useState<Record<string, QuotationProductDetails>>({})

  const isPaymentReceipt = config.documentKind === 'paymentReceipt'

  const canSave =
    !saveLoading &&
    form.quotationNumber.trim().length > 0 &&
    (form.clientName.trim().length > 0 || form.clientId.trim().length > 0) &&
    (isPaymentReceipt
      ? parseMoney(String(form.paymentAmount ?? '')) > 0
      : form.lines.some((l) => l.description.trim().length > 0))

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = `${r.client_name} ${r.quotation_number} ${r.status}`.toLowerCase()
      return blob.includes(q)
    })
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize) || 1)
  const safePage = Math.min(Math.max(1, page), pageCount)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, pageSize, safePage])

  const emptyPrimary = search.trim()
    ? `No ${config.title.toLowerCase()} records match your search.`
    : config.emptyHint
  const emptySecondary = search.trim()
    ? undefined
    : `Use "${config.addLabel}" to create your first record.`

  const commitRows = useCallback(
    (next: QuotationRow[]) => {
      setRows(next)
      persistRows(config.documentKind, next)
    },
    [config.documentKind],
  )

  const loadClients = useCallback(async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select(
            'id, company_name, contact_person_name, email, country_code, mobile, gst_number, address, district, pin_code, state, country, opening_balance, balance_type',
          )
          .order('company_name', { ascending: true })
        if (error) throw error
        const list = Array.isArray(data) ? data : []
        const options = list.map((c) => ({
          id: String((c as { id: string }).id),
          label: String((c as { company_name?: string }).company_name ?? '').trim() || 'Unnamed',
        }))
        setClientOptions(options)
        const contacts: Record<string, QuotationClientContact> = {}
        for (const c of list) {
          const id = String((c as { id: string }).id)
          const row = c as {
            contact_person_name?: string | null
            email?: string | null
            country_code?: string | null
            mobile?: string | null
            gst_number?: string | null
            address?: string | null
            district?: string | null
            pin_code?: string | null
            state?: string | null
            country?: string | null
            opening_balance?: number | null
            balance_type?: string | null
          }
          const contactMobile = [row.country_code, row.mobile]
            .map((x) => String(x ?? '').trim())
            .filter(Boolean)
            .join(' ')
          const addressParts = [row.address, row.district, row.pin_code, row.state, row.country]
            .map((x) => String(x ?? '').trim())
            .filter(Boolean)
          contacts[id] = {
            contactPerson: String(row.contact_person_name ?? '').trim(),
            contactEmail: String(row.email ?? '').trim(),
            contactMobile,
            gstNumber: String(row.gst_number ?? '').trim(),
            address: addressParts.join(', '),
            openingBalance: Number(row.opening_balance ?? 0) || 0,
            balanceType: String(row.balance_type ?? 'Dr').trim() === 'Cr' ? 'Cr' : 'Dr',
          }
        }
        setClientContactById(contacts)
        return { options, contacts }
      } catch (err) {
        if (isAbortOrLockError(err) && attempt < 3) {
          await new Promise((r) => window.setTimeout(r, 200 * attempt))
          continue
        }
        return undefined
      }
    }
    return undefined
  }, [])

  const loadProducts = useCallback(async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data, error } = await supabase
          .from('products_services_master')
          .select(
            'id, item_code, item_name, item_description, make, hsn_code, unit_of_measurement, sale_price, gst_percent',
          )
          .order('item_name', { ascending: true })
        if (error) throw error
        const list = Array.isArray(data) ? data : []
        const options: FilterComboboxOption[] = []
        const byId: Record<string, QuotationProductDetails> = {}
        for (const row of list) {
          const r = row as {
            id: string
            item_code?: string | null
            item_name?: string | null
            item_description?: string | null
            make?: string | null
            hsn_code?: string | null
            unit_of_measurement?: string | null
            sale_price?: number | null
            gst_percent?: number | null
          }
          const id = String(r.id)
          const itemName = String(r.item_name ?? '')
            .trim()
            .replace(/\s+/g, ' ')
          const itemCode = String(r.item_code ?? '')
            .trim()
            .replace(/\s+/g, ' ')
          const itemDescription = String(r.item_description ?? '')
            .trim()
            .replace(/\s+/g, ' ')
          const label =
            [itemName || itemCode, itemDescription].filter(Boolean).join(' — ') || 'Unnamed item'
          options.push({ id, label })
          byId[id] = {
            itemName: itemName || itemCode,
            itemCode,
            itemDescription,
            make: String(r.make ?? '').trim(),
            hsnCode: String(r.hsn_code ?? '').trim(),
            unit: String(r.unit_of_measurement ?? '').trim(),
            salePrice: Number(r.sale_price ?? 0) || 0,
            gstPercent: Number(r.gst_percent ?? 0) || 0,
          }
        }
        setProductOptions(options)
        setProductById(byId)
        return options
      } catch (err) {
        if (isAbortOrLockError(err) && attempt < 3) {
          await new Promise((r) => window.setTimeout(r, 200 * attempt))
          continue
        }
        return undefined
      }
    }
    return undefined
  }, [])

  useEffect(() => {
    void loadClients()
    void loadProducts()
  }, [loadClients, loadProducts])

  useEffect(() => {
    setRows(loadStoredRows(config.documentKind))
    setSelectedIds(new Set())
    setPage(1)
    setSearch('')
  }, [config.documentKind])

  const allocateNextNumber = useCallback(() => {
    const prefix = defaultNumberPrefix(config.documentKind)
    return nextQuotationNumber(
      rows.map((r) => r.quotation_number),
      prefix,
    )
  }, [config.documentKind, rows])

  const openNew = () => {
    void (async () => {
      const [next, defaultTerm, defaultNote, defaultSign] = await Promise.all([
        Promise.resolve(allocateNextNumber()),
        fetchDefaultQuotationTerm(config.documentKind).catch(() =>
          config.documentKind === 'quotation' ? '100 % Advance' : '',
        ),
        fetchDefaultQuotationNote(config.documentKind).catch(() => ''),
        fetchDefaultSignatureForKind(config.documentKind).catch(() => ({
          signatureText: '',
          signatureImagePath: '',
        })),
      ])
      setEditingId(null)
      setForm({
        ...emptyQuotationForm(next),
        status: defaultStatus(config.documentKind),
        paymentTerms: defaultTerm,
        notes: defaultNote,
        signatureText: defaultSign.signatureText,
        signatureImagePath: defaultSign.signatureImagePath,
      })
      setSaveMessage(null)
      setShowForm(true)
    })()
  }

  const openEdit = (row: QuotationRow) => {
    setEditingId(row.id)
    setForm(rowToForm(row, false))
    setSaveMessage(null)
    setShowForm(true)
  }

  const openCopy = (row: QuotationRow) => {
    const next = allocateNextNumber()
    setEditingId(null)
    setForm(rowToForm(row, true, next))
    setSaveMessage(null)
    setShowForm(true)
  }

  const handleSave = () => {
    if (!form.quotationNumber.trim()) {
      setSaveMessage(`${config.title} number is required.`)
      return
    }
    if (!form.clientName.trim() && !form.clientId.trim()) {
      setSaveMessage('Select a client.')
      return
    }
    if (isPaymentReceipt && parseMoney(String(form.paymentAmount ?? '')) <= 0) {
      setSaveMessage('Enter a payment amount greater than 0.')
      return
    }
    if (!isPaymentReceipt && !form.lines.some((l) => l.description.trim().length > 0)) {
      setSaveMessage('Add at least one line item.')
      return
    }
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const stored = formToStoredRow(form, editingId, {
        paymentReceipt: isPaymentReceipt,
      })
      const next = editingId
        ? rows.map((r) => (r.id === editingId ? { ...stored, created_at: r.created_at } : r))
        : [stored, ...rows]
      commitRows(next)
      setMessage(`Saved ${stored.quotation_number}.`)
      setShowForm(false)
      setEditingId(null)
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaveLoading(false)
    }
  }

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
      if (!checked) pagedRows.forEach((r) => next.delete(r.id))
      else pagedRows.forEach((r) => next.add(r.id))
      return next
    })
  }

  const handleDeleteSelected = () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} ${config.title.toLowerCase()} record(s)?`)) return
    commitRows(rows.filter((r) => !selectedIds.has(r.id)))
    setSelectedIds(new Set())
    setMessage(`Deleted ${ids.length} record(s).`)
  }

  const handleStatusChange = (row: QuotationRow, status: QuotationStatus) => {
    setStatusUpdatingId(row.id)
    try {
      commitRows(rows.map((r) => (r.id === row.id ? { ...r, status } : r)))
      setMessage(`Status updated to ${status}.`)
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const handlePrintSelected = () => {
    const selected = rows.filter((r) => selectedIds.has(r.id))
    if (selected.length === 0) {
      setMessage('Select a record to print.')
      return
    }
    void printQuotationsWithTemplate(selected, config.documentKind).then(
      () => setMessage(null),
      (err) => setMessage(err instanceof Error ? err.message : 'Print failed.'),
    )
  }

  return (
    <div className={limsPageShellClass}>
      <QuotationHeaderBar
        title={config.title}
        addLabel={config.addLabel}
        searchAriaLabel={`Search ${config.title.toLowerCase()}`}
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={openNew}
      />

      <QuotationTable
        rows={pagedRows}
        loading={false}
        error={null}
        searchActive={Boolean(search.trim())}
        selectedIds={selectedIds}
        statusUpdatingId={statusUpdatingId}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={openEdit}
        onCopy={openCopy}
        onPrint={(row) => {
          void printQuotationsWithTemplate([row], config.documentKind).then(
            () => setMessage(null),
            (err) => setMessage(err instanceof Error ? err.message : 'Print failed.'),
          )
        }}
        onDownloadPdf={(row) => {
          void downloadQuotationPdfWithTemplate(
            row,
            `${row.quotation_number || config.title}.pdf`,
            config.documentKind,
          ).then(
            () => setMessage('Use Print → Save as PDF for a crisp document.'),
            (err) => setMessage(err instanceof Error ? err.message : 'PDF failed.'),
          )
        }}
        onStatusChange={handleStatusChange}
        emptyPrimary={emptyPrimary}
        emptySecondary={emptySecondary}
        hideValidUntil={isPaymentReceipt}
        paymentLedger={isPaymentReceipt}
        paymentOpeningByClientId={
          isPaymentReceipt
            ? Object.fromEntries(
                Object.entries(clientContactById).map(([id, c]) => [
                  id,
                  { amount: c.openingBalance, type: c.balanceType },
                ]),
              )
            : undefined
        }
      />

      <QuotationFooterBar
        message={message}
        loading={false}
        selectedCount={selectedIds.size}
        page={safePage}
        pageCount={pageCount}
        onTemplates={() => setShowTemplates(true)}
        onPrintSelected={handlePrintSelected}
        onDeleteSelected={handleDeleteSelected}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number.parseInt(jumpTo, 10)
          if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />

      <QuotationTemplatesDialog
        open={showTemplates}
        onOpenChange={setShowTemplates}
        documentKind={config.documentKind}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
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
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? `Edit ${config.title}` : config.addLabel}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
            {saveMessage && showForm ? (
              <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            ) : null}
            <QuotationFormView
              key={editingId ?? `new-${form.quotationNumber}`}
              form={form}
              onChange={setForm}
              clientOptions={clientOptions}
              clientContactById={clientContactById}
              productOptions={productOptions}
              productById={productById}
              onReloadClients={loadClients}
              onReloadProducts={() => loadProducts()}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={handleSave}
              documentLabel={config.title}
              formMode={isPaymentReceipt ? 'paymentReceipt' : 'standard'}
              documentKind={config.documentKind}
              excludeReceiptId={editingId}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
