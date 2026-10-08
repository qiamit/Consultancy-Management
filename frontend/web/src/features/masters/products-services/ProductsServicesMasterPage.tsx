import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrencySymbol } from '@/lib/appCurrency'
import { limsDarkBarGlowStyle, limsDialogClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useCanEditCurrentModule } from '@/features/settings/module-access/useCanEditCurrentModule'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProductsServicesHeaderBar } from './ProductsServicesHeaderBar'
import {
  ProductsServicesTable,
  type ProductServiceSortDir,
  type ProductServiceSortKey,
} from './ProductsServicesTable'
import { ProductsServicesFooterBar } from './ProductsServicesFooterBar'
import { ProductsServicesForm } from './ProductsServicesForm'
import {
  emptyProductServiceForm,
  formatMoney,
  formatMoneyInput,
  isValidNumberOrEmpty,
  nextItemCode,
  normalizeText,
  parseMoney,
  type ItemType,
  type ProductServiceForm,
  type ProductServiceRow,
} from './types'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  const esc = (v: string) => {
    const s = String(v ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(esc).join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h] ?? '')).join(','))
  }
  return lines.join('\n')
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const flushCell = () => {
    row.push(cell)
    cell = ''
  }
  const flushRow = () => {
    flushCell()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      flushCell()
      continue
    }
    if (ch === '\n') {
      flushRow()
      continue
    }
    if (ch === '\r') continue
    cell += ch
  }
  if (cell.length > 0 || row.length > 0) flushRow()
  return rows.map((r) => r.map((c) => c.trim()))
}

function buildPrintHtml(rows: ProductServiceRow[]) {
  const esc = (v: string) =>
    v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

  const cards = rows
    .map((r) => {
      const stockBlock =
        r.item_type === 'Product'
          ? `<div class="field"><div class="k">Opening Stock</div><div class="v">${esc(String(r.opening_stock))}</div></div>
             <div class="field"><div class="k">Low Stock Alert</div><div class="v">${esc(String(r.low_stock_alert))}</div></div>`
          : `<div class="field span2"><div class="k">Stock</div><div class="v">Not applicable (Service)</div></div>`

      return `
      <section class="card">
        <div class="card-header">
          <div>
            <div class="title">${esc(r.item_name)}</div>
            <div class="subtitle">${esc(r.item_code)} · HSN ${esc(r.hsn_code || '—')}</div>
          </div>
          <div class="badge">${esc(r.item_type)} · ${esc(r.item_category)}</div>
        </div>
        <div class="grid">
          <div class="field span2"><div class="k">Description</div><div class="v">${esc(r.item_description || '—')}</div></div>
          <div class="field"><div class="k">Sale Price</div><div class="v">${getCurrencySymbol()} ${esc(formatMoney(r.sale_price))}</div></div>
          <div class="field"><div class="k">Purchase Price</div><div class="v">${getCurrencySymbol()} ${esc(formatMoney(r.purchase_price))}</div></div>
          <div class="field"><div class="k">GST %</div><div class="v">${esc(formatMoney(r.gst_percent))}%</div></div>
          <div class="field"><div class="k">Discount</div><div class="v">${getCurrencySymbol()} ${esc(formatMoney(r.discount))}</div></div>
          <div class="field"><div class="k">UOM</div><div class="v">${esc(r.unit_of_measurement || '—')}</div></div>
          <div class="field"><div class="k">Make</div><div class="v">${esc(r.make || '—')}</div></div>
          ${stockBlock}
        </div>
      </section>`
    })
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Product & Services</title>
  <style>
    :root{--fg:#0b1220;--muted:#5b6473;--border:#e7eaf0}
    body{margin:24px;font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;color:var(--fg);background:linear-gradient(180deg,#fff,#fbfcff)}
    .wrap{display:flex;flex-direction:column;gap:16px}
    .card{border:1px solid var(--border);border-radius:14px;overflow:hidden;break-inside:avoid}
    .card-header{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;background:linear-gradient(90deg,#0f172a,#111827);color:#fff}
    .title{font-size:18px;font-weight:700}.subtitle{font-size:12px;opacity:.85;margin-top:2px}
    .badge{font-size:12px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);padding:6px 10px;border-radius:999px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px 16px}
    .field{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:#fff}
    .field .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
    .field .v{font-size:13px;margin-top:4px}.span2{grid-column:span 2}
  </style></head><body><div class="wrap">${cards}</div>
  <script>window.addEventListener('load',function(){setTimeout(function(){try{window.focus();window.print()}catch(e){}},250)})</script>
  </body></html>`
}

const VIEW_ONLY_MSG = 'View-only access — ask the Laboratory Director for Edit access.'

type MasterDeleteResult = {
  deleted?: string[] | null
  blocked?: { id?: string; refs?: Record<string, number> }[] | null
}

function formatPermanentDeleteMessage(
  data: MasterDeleteResult | null,
  nameOf: (id: string) => string,
): string {
  const deleted = Array.isArray(data?.deleted) ? data.deleted : []
  const blocked = Array.isArray(data?.blocked) ? data.blocked : []
  let msg = `Deleted ${deleted.length}.`
  if (blocked.length > 0) {
    const bits = blocked.slice(0, 5).map((b) => {
      const id = String(b.id ?? '')
      const refs = Object.entries(b.refs ?? {})
        .map(([table, n]) => `${String(table).replace(/^public\./, '')} ${n}`)
        .join(', ')
      return `${nameOf(id)} (${refs})`
    })
    msg += ` Not deleted (still used): ${bits.join('; ')} — use Archive instead.`
  }
  return msg
}

const CSV_HEADERS = [
  'item_type',
  'item_code',
  'item_category',
  'item_name',
  'item_description',
  'hsn_code',
  'sale_price',
  'purchase_price',
  'gst_percent',
  'discount',
  'unit_of_measurement',
  'make',
  'opening_stock',
  'low_stock_alert',
] as const

export default function ProductsServicesMasterPage() {
  const { editId, setEdit } = useMasterUiSearchState()
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const canEdit = useCanEditCurrentModule()
  const [showArchived, setShowArchived] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const hydratedEditRef = useRef<string | null>(null)

  const showForm = editId != null
  const editingId = editId && editId !== 'new' ? editId : null
  const handleFormOpenChange = useFormDialogOpenChange((open) => {
    if (!open) {
      hydratedEditRef.current = null
      setEdit(null)
    }
  })

  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<ProductServiceRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [sortKey, setSortKey] = useState<ProductServiceSortKey>('itemIdentity')
  const [sortDir, setSortDir] = useState<ProductServiceSortDir>('asc')
  const [form, setForm] = useState<ProductServiceForm>(() => emptyProductServiceForm())

  const canSave =
    !saveLoading &&
    normalizeText(form.itemCode).length > 0 &&
    normalizeText(form.itemCategory).length > 0 &&
    normalizeText(form.itemName).length > 0 &&
    isValidNumberOrEmpty(form.salePrice) &&
    isValidNumberOrEmpty(form.purchasePrice) &&
    isValidNumberOrEmpty(form.gstPercent) &&
    isValidNumberOrEmpty(form.discount) &&
    isValidNumberOrEmpty(form.openingStock) &&
    isValidNumberOrEmpty(form.lowStockAlert)

  const loadRows = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const { data, error } = await supabase
        .from('products_services_master')
        .select('*')
        .order('item_code', { ascending: true })
      if (error) throw error
      setRows((data ?? []) as ProductServiceRow[])
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const codesForType = (itemType: ItemType) =>
    rows.filter((r) => r.item_type === itemType).map((r) => r.item_code)

  const rowToForm = (row: ProductServiceRow, asCopy = false): ProductServiceForm => ({
    itemType: row.item_type,
    itemCode: asCopy
      ? nextItemCode(row.item_type, codesForType(row.item_type))
      : row.item_code,
    itemCategory: row.item_category,
    itemName: asCopy ? `${row.item_name} - Copy` : row.item_name,
    itemDescription: row.item_description ?? '',
    hsnCode: row.hsn_code ?? '',
    salePrice: formatMoneyInput(String(row.sale_price ?? 0)),
    purchasePrice: formatMoneyInput(String(row.purchase_price ?? 0)),
    gstPercent: formatMoneyInput(String(row.gst_percent ?? 0)),
    discount: formatMoneyInput(String(row.discount ?? 0)),
    unitOfMeasurement: row.unit_of_measurement ?? '',
    make: row.make ?? '',
    openingStock: String(row.opening_stock ?? 0),
    lowStockAlert: String(row.low_stock_alert ?? 0),
  })

  const buildNewForm = useCallback((): ProductServiceForm => {
    const itemType: ItemType = 'Service'
    return {
      ...emptyProductServiceForm(itemType),
      itemCode: nextItemCode(
        itemType,
        rows.filter((r) => r.item_type === itemType).map((r) => r.item_code),
      ),
    }
  }, [rows])

  useEffect(() => {
    if (!editId) {
      hydratedEditRef.current = null
      return
    }
    if (hydratedEditRef.current === editId) return

    if (editId === 'new') {
      setForm(buildNewForm())
      setSaveMessage(null)
      hydratedEditRef.current = 'new'
      return
    }

    const fromPage = rows.find((r) => r.id === editId)
    if (fromPage) {
      setForm(rowToForm(fromPage))
      setSaveMessage(null)
      hydratedEditRef.current = editId
      return
    }

    if (!listLoading) setEdit(null)
  }, [editId, rows, listLoading, buildNewForm, setEdit])

  const filteredRows = useMemo(() => {
    const base = showArchived ? rows : rows.filter((r) => !r.archived_at)
    const q = search.trim().toLowerCase()
    const list = !q
      ? [...base]
      : base.filter((r) =>
          [
            r.item_type,
            r.item_code,
            r.item_category,
            r.item_name,
            r.item_description,
            r.hsn_code,
            r.unit_of_measurement,
            r.make,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q),
        )

    const dir = sortDir === 'asc' ? 1 : -1
    const cmpText = (a: string, b: string) =>
      a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }) * dir

    return list.sort((a, b) => {
      let primary = 0
      switch (sortKey) {
        case 'itemIdentity':
          primary = cmpText(a.item_name || '', b.item_name || '') || cmpText(a.item_code || '', b.item_code || '')
          break
        case 'typeCategory':
          primary = cmpText(`${a.item_type} ${a.item_category}`, `${b.item_type} ${b.item_category}`)
          break
        case 'pricing':
          primary = (Number(a.sale_price) - Number(b.sale_price)) * dir
          break
        case 'stockUom':
          primary =
            cmpText(a.unit_of_measurement || '', b.unit_of_measurement || '') ||
            (Number(a.opening_stock) - Number(b.opening_stock)) * dir
          break
        default:
          primary = cmpText(a.item_name || '', b.item_name || '')
      }
      if (primary !== 0) return primary
      return cmpText(a.item_code || '', b.item_code || '')
    })
  }, [rows, search, sortKey, sortDir, showArchived])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, safePage, pageSize])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize, sortKey, sortDir])

  const handleSort = (key: ProductServiceSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const assistantContext = useMemo(() => {
    const lines = [
      'Module: Master Managements / Product & Services',
      `Total items: ${rows.length}`,
      search.trim() ? `Search: "${search.trim()}"` : 'No search filter',
      '',
      'Items (up to 30):',
    ]
    const slice = filteredRows.slice(0, 30)
    if (slice.length === 0) lines.push('(none)')
    else {
      for (const r of slice) {
        lines.push(
          `- id=${r.id} | ${r.item_code} | ${r.item_type}/${r.item_category} | ${r.item_name} | Sale ${getCurrencySymbol()}${r.sale_price}`,
        )
      }
    }
    return lines.join('\n')
  }, [rows.length, filteredRows, search])

  const openNew = () => {
    setForm(buildNewForm())
    setSaveMessage(null)
    hydratedEditRef.current = 'new'
    setEdit('new')
  }

  const handleItemTypeChange = (itemType: ItemType) => {
    setForm((prev) => ({
      ...prev,
      itemType,
      itemCode: editingId
        ? prev.itemCode
        : nextItemCode(itemType, codesForType(itemType)),
      openingStock: itemType === 'Service' ? '0' : prev.openingStock,
      lowStockAlert: itemType === 'Service' ? '0' : prev.lowStockAlert,
    }))
  }

  const openEdit = (row: ProductServiceRow) => {
    setForm(rowToForm(row))
    setSaveMessage(null)
    hydratedEditRef.current = row.id
    setEdit(row.id)
  }

  const openCopy = (row: ProductServiceRow) => {
    setForm(rowToForm(row, true))
    setSaveMessage(null)
    hydratedEditRef.current = 'new'
    setEdit('new')
  }

  const handleSave = async () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    if (!canSave) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const isProduct = form.itemType === 'Product'
      const payload = {
        item_type: form.itemType,
        item_code: normalizeText(form.itemCode).toUpperCase(),
        item_category: form.itemCategory,
        item_name: normalizeText(form.itemName),
        item_description: normalizeText(form.itemDescription) || null,
        hsn_code: normalizeText(form.hsnCode) || null,
        sale_price: parseMoney(form.salePrice),
        purchase_price: parseMoney(form.purchasePrice),
        gst_percent: parseMoney(form.gstPercent),
        discount: parseMoney(form.discount),
        unit_of_measurement: normalizeText(form.unitOfMeasurement) || null,
        make: normalizeText(form.make) || null,
        opening_stock: isProduct ? parseMoney(form.openingStock) : 0,
        low_stock_alert: isProduct ? parseMoney(form.lowStockAlert) : 0,
      }

      if (editingId) {
        const { data, error } = await supabase
          .from('products_services_master')
          .update(payload)
          .eq('id', editingId)
          .select('id')
        if (error) throw error
        if (!data || data.length === 0) {
          throw new Error('You do not have edit access for this record (view-only).')
        }
      } else {
        const { error } = await supabase.from('products_services_master').insert(payload)
        if (error) throw error
      }

      setSaveMessage(`Saved ${payload.item_code}.`)
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

  const handleArchiveSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) {
      setSaveMessage('Select at least one item to archive.')
      return
    }
    if (!window.confirm(`Archive ${ids.length} selected item(s)?`)) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const { data, error } = await supabase
        .from('products_services_master')
        .update({ archived_at: new Date().toISOString() })
        .in('id', ids)
        .is('archived_at', null)
        .select('id')
      if (error) throw error
      const n = Array.isArray(data) ? data.length : 0
      if (n === 0) {
        setSaveMessage('You do not have edit access (view-only).')
        return
      }
      setSelectedIds(new Set())
      setSaveMessage(`Archived ${n}.`)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleRestoreSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) {
      setSaveMessage('Select at least one item to restore.')
      return
    }
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const { data, error } = await supabase
        .from('products_services_master')
        .update({ archived_at: null })
        .in('id', ids)
        .not('archived_at', 'is', null)
        .select('id')
      if (error) throw error
      const n = Array.isArray(data) ? data.length : 0
      if (n === 0) {
        setSaveMessage('You do not have edit access (view-only).')
        return
      }
      setSelectedIds(new Set())
      setSaveMessage(`Restored ${n}.`)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (
      !window.confirm(
        `Permanently delete ${ids.length} record(s)? Records still used elsewhere will be skipped. This cannot be undone.`,
      )
    )
      return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const { data, error } = await supabase.rpc('delete_master_rows', {
        p_table: 'products_services_master',
        p_ids: ids,
      })
      if (error) throw error
      const res = (data ?? null) as MasterDeleteResult | null
      setSelectedIds(new Set())
      setSaveMessage(formatPermanentDeleteMessage(res, (id) => rows.find((r) => r.id === id)?.item_name || id))
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleExport = () => {
    const source =
      selectedIds.size > 0 ? filteredRows.filter((r) => selectedIds.has(r.id)) : filteredRows
    const csvRows = source.map((r) => ({
      item_type: r.item_type,
      item_code: r.item_code,
      item_category: r.item_category,
      item_name: r.item_name,
      item_description: r.item_description ?? '',
      hsn_code: r.hsn_code ?? '',
      sale_price: String(r.sale_price ?? 0),
      purchase_price: String(r.purchase_price ?? 0),
      gst_percent: String(r.gst_percent ?? 0),
      discount: String(r.discount ?? 0),
      unit_of_measurement: r.unit_of_measurement ?? '',
      make: r.make ?? '',
      opening_stock: String(r.opening_stock ?? 0),
      low_stock_alert: String(r.low_stock_alert ?? 0),
    }))
    const blob = new Blob([toCsv([...CSV_HEADERS], csvRows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'products_services.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImportFile = async (file: File) => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.length < 2) throw new Error('CSV has no data rows.')
      const header = parsed[0]!.map((h) => h.toLowerCase())
      const idx = (name: string) => header.indexOf(name)
      const payloads = parsed
        .slice(1)
        .map((cells) => {
          const get = (name: string) => {
            const i = idx(name)
            return i >= 0 ? (cells[i] ?? '').trim() : ''
          }
          const itemType = (get('item_type') === 'Service' ? 'Service' : 'Product') as ItemType
          return {
            item_type: itemType,
            item_code: get('item_code').toUpperCase(),
            item_category: get('item_category') || 'Testing',
            item_name: get('item_name'),
            item_description: get('item_description') || null,
            hsn_code: get('hsn_code') || null,
            sale_price: parseMoney(get('sale_price') || '0'),
            purchase_price: parseMoney(get('purchase_price') || '0'),
            gst_percent: parseMoney(get('gst_percent') || '0'),
            discount: parseMoney(get('discount') || '0'),
            unit_of_measurement: get('unit_of_measurement') || null,
            make: get('make') || null,
            opening_stock: itemType === 'Product' ? parseMoney(get('opening_stock') || '0') : 0,
            low_stock_alert: itemType === 'Product' ? parseMoney(get('low_stock_alert') || '0') : 0,
          }
        })
        .filter((p) => p.item_code && p.item_name)

      if (payloads.length === 0) throw new Error('No valid rows in CSV.')
      const { error } = await supabase
        .from('products_services_master')
        .upsert(payloads, { onConflict: 'item_code' })
      if (error) throw error
      setSaveMessage(`Imported ${payloads.length} item(s).`)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const handlePrintSelected = () => {
    const source = filteredRows.filter((r) => selectedIds.has(r.id))
    if (source.length === 0) {
      setSaveMessage('Select at least one item to print.')
      return
    }
    const w = window.open('', '_blank')
    if (!w) {
      setSaveMessage('Popup blocked. Allow popups to print.')
      return
    }
    w.document.open()
    w.document.write(buildPrintHtml(source))
    w.document.close()
    setSaveMessage(`Print ready: ${source.length} item(s).`)
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
        <ProductsServicesHeaderBar
          search={search}
          onSearchChange={setSearch}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          onNew={openNew}
          canEdit={canEdit}
          assistantContext={assistantContext}
          onAssistantDataChanged={() => void loadRows()}
        />
      </div>

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          portalClassName="lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            limsDialogClass,
            '!flex max-h-[92vh] w-[calc(100%-1.5rem)] max-w-3xl flex-col overflow-hidden sm:w-full',
            // Center in main content area (sidebar 268px stays clear)
            'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit Product / Service' : 'Add Product / Service'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-stone-100/80 to-white">
            {saveMessage && showForm ? (
              <p className="mx-4 mt-4 shrink-0 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive sm:mx-6">
                {saveMessage}
              </p>
            ) : null}
            <ProductsServicesForm
              form={form}
              onChange={setForm}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={() => void handleSave()}
              onItemTypeChange={handleItemTypeChange}
              codeLocked={!editingId}
            />
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ProductsServicesTable
          rows={pagedRows}
          loading={listLoading}
          error={listError}
          searchActive={search.trim().length > 0}
          selectedIds={selectedIds}
          onToggle={toggleRow}
          onToggleAll={toggleAllOnPage}
          onEdit={openEdit}
          onCopy={openCopy}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      </div>

      <div className="shrink-0">
        <ProductsServicesFooterBar
          message={saveMessage}
          loading={listLoading || saveLoading}
          selectedCount={selectedIds.size}
          page={safePage}
          pageCount={pageCount}
          onImport={() => {
            if (!canEdit) {
              setSaveMessage(VIEW_ONLY_MSG)
              return
            }
            importInputRef.current?.click()
          }}
          onExport={handleExport}
          onPrintSelected={handlePrintSelected}
          onDeleteSelected={() => void handleDeleteSelected()}
          canEdit={canEdit}
          showArchived={showArchived}
          onToggleShowArchived={() => setShowArchived((v) => !v)}
          onArchiveSelected={() => void handleArchiveSelected()}
          onRestoreSelected={() => void handleRestoreSelected()}
          onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
          jumpTo={jumpTo}
          onJumpToChange={setJumpTo}
          onJumpToGo={() => {
            const n = Number.parseInt(jumpTo, 10)
            if (!Number.isFinite(n)) return
            setPage(Math.min(pageCount, Math.max(1, n)))
          }}
        />
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void onImportFile(file)
        }}
      />
    </div>
  )
}
