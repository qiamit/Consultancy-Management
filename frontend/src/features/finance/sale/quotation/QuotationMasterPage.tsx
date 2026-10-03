import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsDarkBarGlowStyle, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import { QuotationHeaderBar } from './QuotationHeaderBar'
import { QuotationTable } from './QuotationTable'
import { QuotationFooterBar } from './QuotationFooterBar'
import { QuotationTemplatesDialog } from './QuotationTemplatesDialog'
import {
  QuotationFormView,
  type QuotationClientContact,
  type QuotationProductDetails,
} from './QuotationForm'
import {
  computeQuotationTotals,
  emptyQuotationForm,
  lineAmount,
  nextQuotationNumber,
  parseMoney,
  rowToForm,
  type QuotationForm as QuotationFormType,
  type QuotationLineRow,
  type QuotationRow,
  quotationStatusLabel,
  type QuotationStatus,
} from './types'
import { fetchQuotationPrefix } from './quotationNumberPrefix'
import { fetchDefaultQuotationTerm } from './quotationTermsApi'
import { fetchDefaultQuotationNote } from './quotationNotesApi'
import { downloadQuotationPdfWithTemplate, printQuotationsWithTemplate } from './outputQuotationDocument'
import { fetchDefaultSignatureForKind } from './quotationSignatureStorage'

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

function formatSupabaseError(err: unknown) {
  if (!err) return 'Unknown error'

  if (isAbortOrLockError(err)) {
    return 'Could not load quotations (request interrupted). Please retry.'
  }

  const message =
    typeof err === 'string'
      ? err
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : err instanceof Error
          ? err.message
          : ''

  const lower = message.toLowerCase()
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('internet disconnected') ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  ) {
    return 'Network connection failed. Check your internet and try again.'
  }

  if (!err || typeof err !== 'object') return message || 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    // Avoid dumping huge stack traces into the table banner
    .filter((p) => !p.includes('http://localhost') && !p.includes('https://localhost'))
    .filter((p) => !isAbortOrLockError(p))
  return parts.length ? parts.join(' | ') : message || 'Unknown error'
}

function safePdfFilename(quotationNumber: string): string {
  const base = quotationNumber.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'quotation'
  return `${base}.pdf`
}

export default function QuotationMasterPage() {
  const [rows, setRows] = useState<QuotationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
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

  const canSave =
    !saveLoading &&
    form.quotationNumber.trim().length > 0 &&
    form.clientName.trim().length > 0 &&
    form.lines.some((l) => l.description.trim().length > 0)

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
          options.push({
            id,
            label,
          })
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

  const loadRows = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      let lastError: unknown = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // Sequential queries avoid auth-lock races from parallel session access.
          const { data: headers, error: hErr } = await supabase
            .from('quotations')
            .select('*')
            .order('quotation_date', { ascending: false })
          if (hErr) throw hErr

          const { data: lines, error: lErr } = await supabase
            .from('quotation_line_items')
            .select('*')
            .order('line_no', { ascending: true })
          if (lErr) throw lErr

          const lineRows = (Array.isArray(lines) ? lines : []) as QuotationLineRow[]
          const byQuotation = new Map<string, QuotationLineRow[]>()
          for (const line of lineRows) {
            const list = byQuotation.get(line.quotation_id) ?? []
            list.push(line)
            byQuotation.set(line.quotation_id, list)
          }

          const list = (Array.isArray(headers) ? headers : []).map((h) => {
            const row = h as QuotationRow
            return {
              ...row,
              status: (row.status ?? 'Draft') as QuotationStatus,
              line_items: byQuotation.get(row.id) ?? [],
            }
          })
          setRows(list)
          lastError = null
          break
        } catch (err) {
          lastError = err
          if (isAbortOrLockError(err) && attempt < 3) {
            await new Promise((r) => window.setTimeout(r, 250 * attempt))
            continue
          }
          throw err
        }
      }
      if (lastError) throw lastError
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Bootstrap sequentially so auth session lock is not contended.
      await loadClients()
      if (cancelled) return
      await loadProducts()
      if (cancelled) return
      await loadRows()
    })()
    return () => {
      cancelled = true
    }
  }, [loadClients, loadProducts, loadRows])

  useEffect(() => {
    if (!showForm) return
    void (async () => {
      await loadClients()
      await loadProducts()
    })()
  }, [showForm, loadClients, loadProducts])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [
        r.quotation_number,
        r.client_name,
        r.status,
        r.subject ?? '',
        r.reference_no ?? '',
        r.contact_person ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, safePage, pageSize])

  const allocateNextQuotationNumber = async () => {
    const prefix = await fetchQuotationPrefix()
    return nextQuotationNumber(
      rows.map((r) => r.quotation_number),
      prefix,
    )
  }

  const openNew = () => {
    void (async () => {
      const [next, defaultTerm, defaultNote, defaultSign] = await Promise.all([
        allocateNextQuotationNumber(),
        fetchDefaultQuotationTerm('quotation').catch(() => '100 % Advance'),
        fetchDefaultQuotationNote('quotation').catch(() => ''),
        fetchDefaultSignatureForKind('quotation').catch(() => ({
          signatureText: '',
          signatureImagePath: '',
        })),
      ])
      setEditingId(null)
      setForm({
        ...emptyQuotationForm(next),
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
    void (async () => {
      const next = await allocateNextQuotationNumber()
      setEditingId(null)
      setForm(rowToForm(row, true, next))
      setSaveMessage(null)
      setShowForm(true)
    })()
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const totals = computeQuotationTotals(form)
      const payload = {
        quotation_number: form.quotationNumber.trim(),
        quotation_date: form.quotationDate || null,
        valid_until: form.validUntil || null,
        client_id: form.clientId || null,
        client_name: form.clientName.trim(),
        contact_person: form.contactPerson.trim() || null,
        contact_email: form.contactEmail.trim() || null,
        contact_mobile: form.contactMobile.trim() || null,
        client_address: form.clientAddress.trim() || null,
        client_gst_number: form.clientGstNumber.trim() || null,
        subject: null,
        reference_no: null,
        status: form.status,
        payment_terms: form.paymentTerms.trim() || null,
        notes: form.notes.trim() || null,
        remarks: form.remarks.trim() || null,
        signature_text: form.signatureText.trim() || null,
        signature_image_path: form.signatureImagePath.trim() || null,
        discount_percent: 0,
        discount_amount: totals.discountAmount,
        transportation_charges: totals.transportationCharges,
        packaging_charges: totals.packagingCharges,
        gst_percent: totals.effectiveGstPercent,
        gst_amount: totals.gstAmount,
        subtotal: totals.subtotal,
        grand_total: totals.grandTotal,
      }

      let quotationId = editingId
      if (editingId) {
        const { error } = await supabase.from('quotations').update(payload).eq('id', editingId)
        if (error) throw error
        const { error: delErr } = await supabase
          .from('quotation_line_items')
          .delete()
          .eq('quotation_id', editingId)
        if (delErr) throw delErr
      } else {
        const { data, error } = await supabase
          .from('quotations')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        quotationId = (data as { id: string } | null)?.id ?? null
      }

      if (!quotationId) throw new Error('Quotation id missing after save')

      const linePayloads = form.lines
        .filter((l) => l.description.trim().length > 0)
        .map((l, index) => ({
          quotation_id: quotationId,
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

      if (linePayloads.length > 0) {
        const { error: lineErr } = await supabase.from('quotation_line_items').insert(linePayloads)
        if (lineErr) throw lineErr
      }

      setSaveMessage(`Saved ${form.quotationNumber}.`)
      setShowForm(false)
      setEditingId(null)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
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

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} quotation(s)?`)) return
    setSaveMessage(null)
    try {
      const { error } = await supabase.from('quotations').delete().in('id', ids)
      if (error) throw error
      setSelectedIds(new Set())
      setSaveMessage(`Deleted ${ids.length} quotation(s).`)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    }
  }

  const handlePrint = () => {
    const source = selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : filteredRows
    void (async () => {
      try {
        await printQuotationsWithTemplate(source)
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Failed to print quotation')
      }
    })()
  }

  const handleStatusChange = (row: QuotationRow, status: QuotationStatus) => {
    if (row.status === status) return
    void (async () => {
      setStatusUpdatingId(row.id)
      setSaveMessage(null)
      const previous = row.status
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)))
      try {
        const { error } = await supabase.from('quotations').update({ status }).eq('id', row.id)
        if (error) throw error
        setSaveMessage(`Status updated to ${quotationStatusLabel(status)}.`)
      } catch (err) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: previous } : r)))
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setStatusUpdatingId(null)
      }
    })()
  }

  const handlePrintRow = (row: QuotationRow) => {
    void (async () => {
      try {
        await printQuotationsWithTemplate([row])
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Failed to print quotation')
      }
    })()
  }

  const handleDownloadPdfRow = (row: QuotationRow) => {
    void (async () => {
      try {
        setSaveMessage(
          'Print dialog open hoga — Destination me "Save as PDF" choose karein for sharp PDF.',
        )
        await downloadQuotationPdfWithTemplate(row, safePdfFilename(row.quotation_number))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Failed to download PDF')
      }
    })()
  }

  return (
    <div className={limsPageShellClass}>
      <QuotationHeaderBar
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
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        statusUpdatingId={statusUpdatingId}
        onEdit={openEdit}
        onCopy={openCopy}
        onPrint={handlePrintRow}
        onDownloadPdf={handleDownloadPdfRow}
        onStatusChange={handleStatusChange}
        onRetry={() => {
          void (async () => {
            await loadClients()
            await loadProducts()
            await loadRows()
          })()
        }}
      />
      <QuotationFooterBar
        message={saveMessage}
        loading={listLoading || saveLoading}
        selectedCount={selectedIds.size}
        page={safePage}
        pageCount={pageCount}
        onTemplates={() => setShowTemplates(true)}
        onPrintSelected={handlePrint}
        onDeleteSelected={() => void handleDeleteSelected()}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number.parseInt(jumpTo, 10)
          if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />

      <QuotationTemplatesDialog open={showTemplates} onOpenChange={setShowTemplates} />

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
                {editingId ? 'Edit Quotation' : 'Add New Quotation'}
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
              onSave={() => void handleSave()}
              documentKind="quotation"
              documentLabel="Quotation"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
