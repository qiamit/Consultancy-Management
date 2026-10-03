import { useEffect, useMemo, useRef, useState } from 'react'
import { limsDarkBarGlowStyle, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProductServicesForm } from './ProductServicesForm'
import { ProductServicesHeaderBar } from './ProductServicesHeaderBar'
import { ProductServicesTable } from './ProductServicesTable'
import { ProductServicesTableFooterBar } from './ProductServicesFooterBar'
import {
  emptyNablScopeForm,
  isValidIntegerOrEmpty,
  isValidNumberOrEmpty,
  normalizeNablScopeStatus,
  normalizeText,
  parseOptionalNumber,
  type NablScopeForm,
  type NablScopeRow,
} from './types'
import { buildNablScopeAssistantContext } from './buildNablScopeAssistantContext'
import { buildNablScopePrintHtml } from './buildNablScopePrintHtml'

const formatSupabaseError = (err: unknown) => {
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

function parseCsv(text: string) {
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
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1]
        if (next === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
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

  return rows
}

function nextSNo(list: NablScopeRow[]) {
  const max = list.map((r) => r.s_no).reduce((a, b) => Math.max(a, b), 0)
  return max + 1
}

export default function ProductServicesMasterPage() {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<NablScopeRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [form, setForm] = useState<NablScopeForm>(() => emptyNablScopeForm())

  const copy = {
    pageTitle: 'NABL Scope',
    addButtonLabel: 'Add Scope Entry',
    dialogAddTitle: 'Add Scope Entry',
    dialogEditTitle: 'Edit Scope Entry',
    dialogDescription: 'NABL accreditation scope entry (ISO/IEC 17025:2017 annexure).',
    qiPage: 'nabl-scope',
  } as const

  const canSave =
    !saveLoading &&
    form.sNo.trim().length > 0 &&
    form.disciplineGroup.trim().length > 0 &&
    form.materialsProducts.trim().length > 0 &&
    form.componentParameter.trim().length > 0 &&
    form.testMethodSpecification.trim().length > 0 &&
    isValidIntegerOrEmpty(form.sNo) &&
    isValidNumberOrEmpty(form.rangeMinimum) &&
    isValidNumberOrEmpty(form.rangeMaximum) &&
    (() => {
      const min = parseOptionalNumber(form.rangeMinimum)
      const max = parseOptionalNumber(form.rangeMaximum)
      return min == null || max == null || min <= max
    })()

  const loadItems = async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data, error } = await supabase.from('nabl_scope').select('*').order('s_no', { ascending: true })
      if (error) throw error
      setRows(Array.isArray(data) ? (data as NablScopeRow[]) : [])
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load NABL scope')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [])

  const handleNew = () => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({ ...emptyNablScopeForm(), sNo: String(nextSNo(rows)) })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const rowToForm = (row: NablScopeRow): NablScopeForm => ({
    sNo: String(row.s_no),
    disciplineGroup: row.discipline_group,
    materialsProducts: row.materials_products,
    componentParameter: row.component_parameter,
    testMethodSpecification: row.test_method_specification,
    permanentTesting: row.permanent_testing || 'Permanent Testing',
    scopeStatus: normalizeNablScopeStatus(row.scope_status),
    typeOfTest: row.type_of_test?.trim() ?? '',
    rangeMinimum: row.range_minimum != null ? String(row.range_minimum) : '',
    rangeMaximum: row.range_maximum != null ? String(row.range_maximum) : '',
    unit: row.unit?.trim() ?? '',
    uncertainty: row.uncertainty?.trim() ?? '',
  })

  const handleEdit = (row: NablScopeRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm(rowToForm(row))
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = (row: NablScopeRow) => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({ ...rowToForm(row), sNo: String(nextSNo(rows)) })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const typeOfTest = normalizeText(form.typeOfTest)
        const payload = {
          s_no: Number(form.sNo),
          discipline_group: normalizeText(form.disciplineGroup),
          materials_products: normalizeText(form.materialsProducts),
          component_parameter: normalizeText(form.componentParameter),
          test_method_specification: normalizeText(form.testMethodSpecification),
          permanent_testing: normalizeText(form.permanentTesting) || 'Permanent Testing',
          scope_status: normalizeNablScopeStatus(form.scopeStatus),
          type_of_test: typeOfTest || null,
          range_minimum: parseOptionalNumber(form.rangeMinimum),
          range_maximum: parseOptionalNumber(form.rangeMaximum),
          unit: normalizeText(form.unit) || null,
          uncertainty: normalizeText(form.uncertainty) || null,
        }

        if (!Number.isInteger(payload.s_no) || payload.s_no <= 0) {
          setSaveMessage('S.No must be a positive whole number.')
          return
        }

        if (
          payload.range_minimum != null &&
          payload.range_maximum != null &&
          payload.range_minimum > payload.range_maximum
        ) {
          setSaveMessage('Range minimum cannot be greater than range maximum.')
          return
        }

        if (typeOfTest && typeOfTest !== 'Quantitative' && typeOfTest !== 'Qualitative') {
          setSaveMessage('Type of test must be Quantitative or Qualitative.')
          return
        }

        if (editingId) {
          const { error } = await supabase.from('nabl_scope').update(payload).eq('id', editingId)
          if (error) throw error
        } else {
          const { error } = await supabase.from('nabl_scope').insert(payload)
          if (error) throw error
        }

        setSaveMessage('Saved successfully.')
        setShowForm(false)
        setEditingId(null)
        await loadItems()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = [
        String(r.s_no),
        r.discipline_group,
        r.materials_products,
        r.component_parameter,
        r.test_method_specification,
        r.permanent_testing,
        r.scope_status ?? '',
        r.type_of_test ?? '',
        r.range_minimum != null ? String(r.range_minimum) : '',
        r.range_maximum != null ? String(r.range_maximum) : '',
        r.unit ?? '',
        r.uncertainty ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [rows, search])

  const assistantContext = useMemo(
    () => buildNablScopeAssistantContext(filteredRows, search),
    [filteredRows, search],
  )

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

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
      for (const r of pagedRows) {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds])

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) return
      const ok = window.confirm(`Delete ${selectedRows.length} selected scope entry(ies)?`)
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { error } = await supabase.from('nabl_scope').delete().in('id', ids)
        if (error) throw error
        setSaveMessage('Deleted successfully.')
        setSelectedIds(new Set())
        await loadItems()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const buildPrintHtml = (list: NablScopeRow[]) =>
    buildNablScopePrintHtml({
      rows: [...list].sort((a, b) => a.s_no - b.s_no),
      filterNote:
        selectedRows.length > 0
          ? `${selectedRows.length} selected row(s)`
          : search.trim()
            ? `Search: "${search.trim()}"`
            : undefined,
    })

  const handlePrintSelected = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    if (exportRows.length === 0) return
    const html = buildPrintHtml(exportRows)

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)

    const cleanup = () => {
      try {
        document.body.removeChild(iframe)
      } catch {
        // ignore
      }
    }

    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) {
      cleanup()
      setSaveMessage('Unable to open print preview.')
      return
    }

    doc.open()
    doc.write(html)
    doc.close()

    iframe.onload = () => {
      try {
        win.focus()
        win.print()
      } finally {
        window.setTimeout(cleanup, 500)
      }
    }
  }

  const handleExport = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows

    const headers = [
      'id',
      's_no',
      'discipline_group',
      'materials_products',
      'component_parameter',
      'test_method_specification',
      'permanent_testing',
      'scope_status',
      'type_of_test',
      'range_minimum',
      'range_maximum',
      'unit',
      'uncertainty',
      'created_at',
    ]

    const lines = exportRows.map((r) => ({
      id: r.id,
      s_no: String(r.s_no),
      discipline_group: r.discipline_group,
      materials_products: r.materials_products,
      component_parameter: r.component_parameter,
      test_method_specification: r.test_method_specification,
      permanent_testing: r.permanent_testing,
      scope_status: r.scope_status ?? '',
      type_of_test: r.type_of_test ?? '',
      range_minimum: r.range_minimum != null ? String(r.range_minimum) : '',
      range_maximum: r.range_maximum != null ? String(r.range_maximum) : '',
      unit: r.unit ?? '',
      uncertainty: r.uncertainty ?? '',
      created_at: r.created_at ?? '',
    }))

    const csv = toCsv(headers, lines)

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'nabl_scope.csv'
    a.click()
    URL.revokeObjectURL(url)
    setSaveMessage('Exported.')
  }

  const handleImport = () => {
    setSaveMessage(null)
    importInputRef.current?.click()
  }

  const handleImportFile = (file: File) => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const text = await file.text()
        const records = parseCsv(text)
        if (records.length === 0) {
          setSaveMessage('No rows found in CSV.')
          return
        }

        const header = records[0].map((h) => h.trim())
        const rowsData = records.slice(1).filter((r) => r.some((c) => String(c ?? '').trim().length > 0))

        const idx = (name: string) => header.findIndex((h) => h === name)

        const payloads = rowsData.map((r) => {
          const get = (name: string) => {
            const i = idx(name)
            return i >= 0 ? (r[i] ?? '') : ''
          }

          return {
            s_no: Number(get('s_no')) || nextSNo(rows),
            discipline_group: get('discipline_group') || '',
            materials_products: get('materials_products') || '',
            component_parameter: get('component_parameter') || '',
            test_method_specification: get('test_method_specification') || '',
            permanent_testing: get('permanent_testing') || 'Permanent Testing',
            scope_status: normalizeNablScopeStatus(get('scope_status')),
            type_of_test: get('type_of_test') || null,
            range_minimum: parseOptionalNumber(get('range_minimum')),
            range_maximum: parseOptionalNumber(get('range_maximum')),
            unit: get('unit') || null,
            uncertainty: get('uncertainty') || null,
          }
        })

        const cleaned = payloads.filter(
          (p) =>
            Number.isInteger(p.s_no) &&
            p.s_no > 0 &&
            normalizeText(p.discipline_group).length > 0 &&
            normalizeText(p.materials_products).length > 0 &&
            normalizeText(p.component_parameter).length > 0 &&
            normalizeText(p.test_method_specification).length > 0,
        )
        if (cleaned.length === 0) {
          setSaveMessage('No valid rows found in CSV.')
          return
        }

        const { error } = await supabase.from('nabl_scope').insert(cleaned)
        if (error) throw error

        setSaveMessage('Imported successfully.')
        await loadItems()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  return (
    <div className={limsPageShellClass}>
      <ProductServicesHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={handleNew}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => void loadItems()}
        pageTitle={copy.pageTitle}
        addButtonLabel={copy.addButtonLabel}
        qiPage={copy.qiPage}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            'max-h-[92vh] w-[calc(100vw-1rem)] max-w-4xl gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-white p-0 shadow-2xl ring-2 ring-amber-700/40 sm:w-full sm:rounded-none',
            '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
            'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 lg:w-[min(56rem,calc(100vw-268px-2rem))] lg:max-w-[min(56rem,calc(100vw-268px-2rem))] md:!-translate-x-1/2 md:!-translate-y-1/2',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? copy.dialogEditTitle : copy.dialogAddTitle}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="max-h-[min(72vh,720px)] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
            {saveMessage ? (
              <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            ) : null}
            <ProductServicesForm
              form={form}
              onChange={setForm}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={handleSave}
            />
          </div>
        </DialogContent>
      </Dialog>

      <ProductServicesTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={handleEdit}
        onCopy={handleCopy}
      />

      <ProductServicesTableFooterBar
        message={saveMessage}
        loading={saveLoading}
        selectedCount={selectedIds.size}
        onImport={handleImport}
        onExport={handleExport}
        onPrintSelected={handlePrintSelected}
        onDeleteSelected={handleDeleteSelected}
        page={page}
        pageCount={pageCount}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (!Number.isFinite(n) || n <= 0) return
          setPage(Math.min(pageCount, Math.max(1, n)))
        }}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImportFile(f)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}
