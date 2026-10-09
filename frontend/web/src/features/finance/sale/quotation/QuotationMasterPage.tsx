import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { limsDarkBarGlowStyle, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { activePickerClients, getPickerClients, type PickerClientRow } from '@/lib/clientsCache'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
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
import { allocateDocumentNumber } from '../shared/documentSeriesApi'
import { linesForDocumentKind } from '../shared/financeRules'
import { fetchDefaultQuotationTerm } from './quotationTermsApi'
import { fetchDefaultQuotationNote } from './quotationNotesApi'
import { downloadQuotationPdfWithTemplate, printQuotationsWithTemplate } from './outputQuotationDocument'
import { fetchDefaultSignatureForKind } from './quotationSignatureStorage'
import { convertQuotationIfNeeded } from '../shared/convertQuotationToSaleDocument'
import { emailSaleDocumentToClient } from '../shared/emailSaleDocument'
import { exportSaleDocumentsCsv } from '../shared/exportSaleDocumentsCsv'

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
  const { editId, setEdit } = useMasterUiSearchState()
  const hydratedEditRef = useRef<string | null>(null)
  const [rows, setRows] = useState<QuotationRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const showForm = editId != null
  const editingId = editId && editId !== 'new' ? editId : null
  const [showTemplates, setShowTemplates] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange((open) => {
    if (!open) {
      hydratedEditRef.current = null
      setEdit(null)
    }
  })
  const [form, setForm] = useState<QuotationFormType>(() => emptyQuotationForm())
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const [emailBusyId, setEmailBusyId] = useState<string | null>(null)

  const [pickerRows, setPickerRows] = useState<PickerClientRow[]>([])
  const clientOptions = useMemo(
    () =>
      activePickerClients(pickerRows, form.clientId).map((c) => ({
        id: String(c.id),
        label: String(c.company_name ?? '').trim() || 'Unnamed',
      })),
    [pickerRows, form.clientId],
  )
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
        const data = await getPickerClients()
        const list = Array.isArray(data) ? data : []
        setPickerRows(list)
        const options = activePickerClients(list).map((c) => ({
          id: String(c.id),
          label: String(c.company_name ?? '').trim() || 'Unnamed',
        }))
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
      await supabase.auth.getSession()
      if (cancelled) return
      await Promise.allSettled([loadRows(), loadProducts(), loadClients()])
    })()
    return () => {
      cancelled = true
    }
  }, [loadClients, loadProducts, loadRows])

  useEffect(() => {
    if (!showForm) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      await loadClients()
      if (cancelled) return
      await loadProducts()
    })()
    return () => {
      cancelled = true
    }
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
    const allocated = await allocateDocumentNumber('quotation')
    if (allocated) return allocated
    const prefix = await fetchQuotationPrefix()
    return nextQuotationNumber(
      rows.map((r) => r.quotation_number),
      prefix,
    )
  }

  const bootstrapNewForm = useCallback(async () => {
    const [next, defaultTerm, defaultNote, defaultSign] = await Promise.all([
      allocateNextQuotationNumber(),
      fetchDefaultQuotationTerm('quotation').catch((err) => {
        console.warn('Quotation terms could not be loaded.', err)
        return '100 % Advance'
      }),
      fetchDefaultQuotationNote('quotation').catch((err) => {
        console.warn('Quotation notes could not be loaded.', err)
        return ''
      }),
      fetchDefaultSignatureForKind('quotation').catch(() => ({
        signatureText: '',
        signatureImagePath: '',
      })),
    ])
    setForm({
      ...emptyQuotationForm(next),
      paymentTerms: defaultTerm,
      notes: defaultNote,
      signatureText: defaultSign.signatureText,
      signatureImagePath: defaultSign.signatureImagePath,
    })
    setSaveMessage(null)
  }, [rows])

  useEffect(() => {
    if (!editId) {
      hydratedEditRef.current = null
      return
    }
    if (hydratedEditRef.current === editId) return

    if (editId === 'new') {
      void (async () => {
        await bootstrapNewForm()
        hydratedEditRef.current = 'new'
      })()
      return
    }

    const fromPage = rows.find((r) => r.id === editId)
    if (fromPage) {
      setForm(rowToForm(fromPage, false))
      setSaveMessage(null)
      hydratedEditRef.current = editId
      return
    }

    if (!listLoading) setEdit(null)
  }, [editId, rows, listLoading, bootstrapNewForm, setEdit])

  const openNew = () => {
    void (async () => {
      await bootstrapNewForm()
      hydratedEditRef.current = 'new'
      setEdit('new')
    })()
  }

  const openEdit = (row: QuotationRow) => {
    setForm(rowToForm(row, false))
    setSaveMessage(null)
    hydratedEditRef.current = row.id
    setEdit(row.id)
  }

  const openCopy = (row: QuotationRow) => {
    void (async () => {
      const next = await allocateNextQuotationNumber()
      setForm(rowToForm(row, true, next))
      setSaveMessage(null)
      hydratedEditRef.current = 'new'
      setEdit('new')
    })()
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const linesToSave = linesForDocumentKind('quotation', form.lines)
      const totals = computeQuotationTotals({ ...form, lines: linesToSave, gstPercent: '0' })
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

      const linePayloads = linesToSave
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

      const savedRow: QuotationRow = {
        id: quotationId,
        quotation_number: form.quotationNumber.trim(),
        quotation_date: form.quotationDate,
        valid_until: form.validUntil || null,
        client_id: form.clientId || null,
        client_name: form.clientName.trim(),
        contact_person: form.contactPerson.trim() || null,
        contact_email: form.contactEmail.trim() || null,
        contact_mobile: form.contactMobile.trim() || null,
        client_address: form.clientAddress.trim() || null,
        client_gst_number: form.clientGstNumber.trim() || null,
        subject: form.subject.trim() || null,
        reference_no: form.referenceNo.trim() || null,
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
        line_items: linePayloads.map((l, index) => ({
          id: `tmp-${index}`,
          quotation_id: quotationId!,
          line_no: l.line_no,
          description: l.description,
          details: l.details,
          make: l.make,
          hsn_sac: l.hsn_sac,
          item_code: l.item_code,
          quantity: l.quantity,
          unit: l.unit,
          rate: l.rate,
          amount: l.amount,
          discount_percent: l.discount_percent,
          gst_percent: l.gst_percent,
          line_remarks: l.line_remarks,
          delivery_period: l.delivery_period,
        })),
      }

      const convertMsg = await convertQuotationIfNeeded(savedRow, form.status)
      setSaveMessage(convertMsg ?? `Saved ${form.quotationNumber}.`)
      hydratedEditRef.current = null
      setEdit(null)
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

  const handleExport = () => {
    const source =
      selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : pagedRows
    if (source.length === 0) {
      setSaveMessage('Nothing to export on this page.')
      return
    }
    const count = exportSaleDocumentsCsv(source, {
      filename: 'quotations.csv',
      numberLabel: 'quotation_number',
    })
    setSaveMessage(`Exported ${count} row(s).`)
  }

  const handleStatusChange = (row: QuotationRow, status: QuotationStatus) => {
    if (row.status === status) return
    void (async () => {
      setStatusUpdatingId(row.id)
      setSaveMessage(null)
      const previous = row.status
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)))
      try {
        const convertMsg = await convertQuotationIfNeeded(row, status)
        const { error } = await supabase.from('quotations').update({ status }).eq('id', row.id)
        if (error) throw error
        setSaveMessage(convertMsg ?? `Status updated to ${quotationStatusLabel(status)}.`)
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

  const handleEmailClient = (row: QuotationRow) => {
    void (async () => {
      setEmailBusyId(row.id)
      setSaveMessage(null)
      try {
        setSaveMessage(await emailSaleDocumentToClient(row, 'quotation'))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Failed to email client')
      } finally {
        setEmailBusyId(null)
      }
    })()
  }

  return (
    <div
      data-master-scroll="table"
      className={cn(
        limsPageShellClass,
        'flex h-full min-h-0 flex-col overflow-hidden !space-y-0 gap-2 sm:gap-3 md:gap-3',
      )}
    >
      <div className="shrink-0">
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
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
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
          onEmailClient={handleEmailClient}
          emailBusyId={emailBusyId}
          onStatusChange={handleStatusChange}
          onRetry={() => {
            void (async () => {
              await loadClients()
              await loadProducts()
              await loadRows()
            })()
          }}
        />
      </div>

      <div className="shrink-0">
        <QuotationFooterBar
          message={saveMessage}
          loading={listLoading || saveLoading}
          selectedCount={selectedIds.size}
          page={safePage}
          pageCount={pageCount}
          onTemplates={() => setShowTemplates(true)}
          onExport={handleExport}
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
      </div>

      <QuotationTemplatesDialog open={showTemplates} onOpenChange={setShowTemplates} />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          className={cn(
            '!flex z-50 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:rounded-none',
            'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0',
            'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
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

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5">
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
