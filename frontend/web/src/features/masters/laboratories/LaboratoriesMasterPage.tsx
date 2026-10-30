import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Copy, Mail, MapPin, Pencil, Phone, Plus, Search } from 'lucide-react'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import { AuditHistoryDialog } from '@/components/lims/AuditHistoryDialog'
import { Button } from '@/components/ui/button'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCanEditCurrentModule } from '@/features/settings/module-access/useCanEditCurrentModule'
import { ClientsTableFooterBar } from '@/features/masters/clients/ClientsFooterBar'
import {
  clientAiTriggerClass,
  clientDarkBarFieldClass,
  clientDarkBarSearchClass,
  clientPageShellClass,
  clientPanelClass,
  clientPrimaryBtnClass,
} from '@/features/masters/clients/clientsFormUi'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { printHtmlInFrame } from '@/lib/printHtmlInFrame'
import { escapeHtml } from '@/lib/sendAppEmail'
import { cn } from '@/lib/utils'
import { LaboratoriesForm } from './LaboratoriesForm'
import {
  deleteLaboratories,
  emptyLaboratoryForm,
  listLaboratories,
  saveLaboratory,
  setLaboratoriesArchived,
  type LaboratoryForm,
  type LaboratoryRow,
} from './laboratoriesApi'
import { parseCsv } from '@/lib/csv'

const GRID_TABLE =
  'w-full min-w-0 table-fixed border-collapse font-jakarta [&_th]:break-words [&_td]:break-words [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1]'
const thBase = 'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'

function formatAddress(row: LaboratoryRow): string {
  return [row.address, row.district, row.state, row.pin_code].filter(Boolean).join(', ') || '—'
}

function splitLaboratoryName(row: LaboratoryRow): { baseName: string; city: string | null } {
  const comma = row.name.lastIndexOf(',')
  if (comma < 0) return { baseName: row.name.trim(), city: null }

  const baseName = row.name.slice(0, comma).trim()
  const city = row.name.slice(comma + 1).trim()
  if (!baseName || !city) return { baseName: row.name.trim(), city: null }

  const locationParts = [row.address, row.district, row.state]
    .flatMap((value) => String(value ?? '').split(/[;,]/))
    .map((part) => part.trim().toLocaleLowerCase())
  return locationParts.includes(city.toLocaleLowerCase())
    ? { baseName, city }
    : { baseName: row.name.trim(), city: null }
}

function laboratoryNameLabels(rows: LaboratoryRow[]): Map<string, string> {
  const partsById = new Map(rows.map((row) => [row.id, splitLaboratoryName(row)]))
  const countsByName = new Map<string, number>()
  for (const { baseName } of partsById.values()) {
    const key = baseName.toLocaleLowerCase().replace(/\s+/g, ' ')
    countsByName.set(key, (countsByName.get(key) ?? 0) + 1)
  }

  return new Map(rows.map((row) => {
    const { baseName, city } = partsById.get(row.id) ?? { baseName: row.name, city: null }
    const key = baseName.toLocaleLowerCase().replace(/\s+/g, ' ')
    const isDuplicate = (countsByName.get(key) ?? 0) > 1
    const cityLabel = city || row.district?.trim()
    const displayName = isDuplicate && cityLabel ? `${baseName} - ${cityLabel}` : baseName
    return [row.id, displayName]
  }))
}

function rowToForm(row: LaboratoryRow): LaboratoryForm {
  return {
    name: row.name,
    labType: row.lab_type,
    oslCode: row.osl_code ?? '',
    address: row.address ?? '',
    pinCode: row.pin_code ?? '',
    district: row.district ?? '',
    state: row.state ?? '',
    country: row.country || 'India',
    countryCode: row.country_code || '+91',
    contactName: row.contact_name ?? '',
    email: row.email ?? '',
    mobile: row.mobile ?? '',
    gstNumber: row.gst_number ?? '',
    openingBalance: row.opening_balance ?? '',
    balanceType: row.balance_type === 'Cr' ? 'Cr' : 'Dr',
    paymentTerm: row.payment_term || '100 % Advance',
    remark: row.remark ?? '',
  }
}

function matchesSearch(row: LaboratoryRow, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return [row.name, row.lab_type, row.osl_code, row.gst_number, row.address, row.district, row.state, row.pin_code, row.country, row.contact_name, row.email, row.mobile, row.payment_term, row.remark]
    .some((value) => String(value ?? '').toLowerCase().includes(needle))
}

export default function LaboratoriesMasterPage() {
  const canEdit = useCanEditCurrentModule()
  const [confirm, confirmDialog] = useConfirmDialog()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<LaboratoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<LaboratoryForm>(emptyLaboratoryForm())
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const handleFormOpenChange = useFormDialogOpenChange(setFormOpen)

  const refresh = (includeArchived = showArchived) => {
    setLoading(true)
    void listLaboratories(includeArchived)
      .then((next) => {
        setRows(next)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unable to load laboratories'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    void listLaboratories(showArchived)
      .then((next) => {
        if (cancelled) return
        setRows(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Unable to load laboratories')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showArchived])

  const filtered = useMemo(
    () => rows.filter((row) => matchesSearch(row, search)).sort((a, b) => a.name.localeCompare(b.name)),
    [rows, search],
  )
  const nameLabels = useMemo(() => laboratoryNameLabels(rows), [rows])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const rangeFrom = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeTo = Math.min(safePage * pageSize, filtered.length)

  const openNew = () => {
    setEditingId(null)
    setForm(emptyLaboratoryForm())
    setSaveMessage(null)
    setFormOpen(true)
  }

  const openEdit = (row: LaboratoryRow, asCopy = false) => {
    setEditingId(asCopy ? null : row.id)
    setForm({ ...rowToForm(row), name: asCopy ? `${row.name} copy` : row.name })
    setSaveMessage(null)
    setFormOpen(true)
  }

  const onSave = () => {
    if (!form.name.trim()) {
      setSaveMessage('Name is required.')
      return
    }
    setSaveLoading(true)
    void saveLaboratory(form, editingId)
      .then(() => {
        setFormOpen(false)
        setMessage('Laboratory saved.')
        refresh()
      })
      .catch((err: unknown) => setSaveMessage(err instanceof Error ? err.message : 'Save failed'))
      .finally(() => setSaveLoading(false))
  }

  const selectedRows = rows.filter((row) => selectedIds.has(row.id))

  const exportRows = (source: LaboratoryRow[]) => {
    const header = ['name', 'lab_type', 'osl_code', 'gst_number', 'address', 'pin_code', 'district', 'state', 'country', 'contact_name', 'email', 'mobile', 'opening_balance', 'balance_type', 'payment_term', 'remark']
    const lines = source.map((row) =>
      [row.name, row.lab_type, row.osl_code, row.gst_number, row.address, row.pin_code, row.district, row.state, row.country, row.contact_name, row.email, row.mobile, row.opening_balance, row.balance_type, row.payment_term, row.remark]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'laboratories.csv'
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Exported.')
  }

  const archiveSelected = (archived: boolean) => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    void setLaboratoriesArchived(ids, archived)
      .then(() => {
        setSelectedIds(new Set())
        setMessage(archived ? 'Archived.' : 'Restored.')
        refresh()
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Update failed'))
  }

  return (
    <div
      data-master-scroll="table"
      className={cn(clientPageShellClass, 'laboratories-page-container flex h-full min-h-0 flex-col overflow-hidden !space-y-0 gap-2 sm:gap-3 md:gap-3')}
    >
      {confirmDialog}
      <div className="shrink-0">
        <div className={clientPanelClass}>
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-2 text-white sm:px-4 sm:py-2.5 md:px-5">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)' }} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <div className="relative flex min-w-0 max-w-full flex-wrap items-center gap-1 sm:gap-1.5 md:gap-2.5">
              <h1 className="shrink-0 truncate text-sm font-semibold tracking-tight text-white sm:text-base md:text-lg" title="Laboratory Master">
                <span className="md:hidden">Labs</span>
                <span className="hidden md:inline">Laboratory Master</span>
              </h1>
              <div className="relative min-w-0 flex-1 basis-0 max-sm:basis-full">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400 sm:left-3" aria-hidden />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  placeholder="Search Laboratory | OSL | Address | Email | Mobile | Type"
                  className={cn(clientDarkBarSearchClass, 'h-10 min-h-10 w-full min-w-0 pl-7 text-xs sm:pl-9 sm:text-sm')}
                  aria-label="Search Laboratories"
                />
              </div>
              <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1) }}>
                <SelectTrigger className={cn(clientDarkBarFieldClass, 'h-10 min-h-10 w-[3.5rem] shrink-0 px-1 text-[11px] sm:w-[4.25rem] sm:text-xs')} aria-label="Rows per Page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <QiAssistant page="laboratories" pageTitle="Laboratory Master" contextSummary={`${filtered.length} laboratories`} welcomeMessage="" suggestedQuestions={[]} triggerVariant="icon" triggerClassName={cn(clientAiTriggerClass, 'h-8 w-8 shrink-0')} />
              {canEdit ? (
                <Button type="button" className={cn('laboratories-add-button h-8 shrink-0 gap-1 px-2 sm:px-3', clientPrimaryBtnClass)} size="sm" onClick={openNew} aria-label="Add New Laboratory">
                  <Plus size={14} />
                  <span className="laboratories-add-label">Add New Laboratory</span>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          className={cn(
            '!flex z-50 h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:rounded-none',
            'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0 bottom-0',
            'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
            'border-stone-600 ring-1 ring-amber-700/20',
            '[&>button]:!rounded-none [&>button]:opacity-100',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)' }} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit Laboratory' : 'Add New Laboratory'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5">
            <LaboratoriesForm
              form={form}
              onChange={setForm}
              canEdit={canEdit}
              saveLoading={saveLoading}
              saveMessage={saveMessage}
              onSave={onSave}
            />
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className={cn(clientPanelClass, 'flex h-full min-h-0 flex-col bg-[#f7f3eb]')}>
          {error ? <p className="px-3 pt-3 text-sm text-red-600">{error}</p> : null}
          {loading ? <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p> : paged.length === 0 ? (
            <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center">
              <p className="text-sm text-[#57534e]">{search.trim() ? 'No laboratories match your search.' : 'No laboratories added yet.'}</p>
              {!search.trim() ? <p className="mt-1 text-xs text-[#78716c]">Use &quot;Add New Laboratory&quot; to create your first record.</p> : null}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <div className="laboratories-card-view space-y-2.5 p-2 sm:p-3">
                {paged.map((row, index) => (
                  <article key={row.id} className={cn('overflow-hidden border-2 border-stone-500 shadow-sm', selectedIds.has(row.id) ? 'bg-[#fde68a]/70' : index % 2 === 0 ? 'bg-[#fffcf7]' : 'bg-white')}>
                    <div className="flex items-stretch">
                      <div className="min-w-0 flex-1 p-2.5">
                        <div className="flex items-start gap-2">
                          <input type="checkbox" className={cn(checkboxClass, 'mt-1')} aria-label={`Select ${row.name}`} checked={selectedIds.has(row.id)} onChange={() => setSelectedIds((prev) => { const next = new Set(prev); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })} />
                          <div className="min-w-0 flex-1">
                            <p className="flex min-w-0 items-center gap-1 text-[13px] font-bold text-[#1c1917]"><Building2 className="h-3.5 w-3.5 shrink-0 text-amber-700" /><span className="min-w-0 break-words">{nameLabels.get(row.id) ?? row.name}</span></p>
                            <p className="break-all font-mono text-[11px] text-[#b45309]">{row.osl_code || '—'}</p>
                            <p className="mt-1 text-[11px] text-[#57534e]">{row.lab_type}</p>
                          </div>
                          <Button type="button" size="sm" variant="ghost" className="h-10 w-10 min-h-10" aria-label={`Edit ${row.name}`} onClick={() => openEdit(row)}><Pencil size={16} /></Button>
                        </div>
                        <div className="mt-2 space-y-1 border-t border-[#e7e0d4] pt-2 text-[11px] text-[#57534e]">
                          <p className="flex min-w-0 gap-2 break-all"><Mail className="h-3 w-3 shrink-0 text-amber-700" />{row.email || 'No email'}</p>
                          <p className="flex min-w-0 gap-2 break-all"><Phone className="h-3 w-3 shrink-0 text-amber-700" />{row.mobile || '—'}</p>
                          <p className="flex min-w-0 gap-2 break-words"><MapPin className="h-3 w-3 shrink-0 text-amber-700" />{formatAddress(row)}</p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="laboratories-table-view min-w-0">
                <Table className={GRID_TABLE}>
                  <TableHeader>
                    <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                      <TableHead className={cn('w-11', thBase)}>
                        <input type="checkbox" className={checkboxClass} aria-label="Select All" checked={paged.length > 0 && paged.every((row) => selectedIds.has(row.id))} onChange={(e) => setSelectedIds((prev) => { const next = new Set(prev); for (const row of paged) { if (e.target.checked) next.add(row.id); else next.delete(row.id) } return next })} />
                      </TableHead>
                      <TableHead className={cn('text-left', thBase)}>Laboratory</TableHead>
                      <TableHead className={thBase}>Type</TableHead>
                      <TableHead className={thBase}>Contact</TableHead>
                      <TableHead className={thBase}>Address</TableHead>
                      <TableHead className={cn('w-24', thBase)}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((row, index) => (
                      <TableRow key={row.id} className={selectedIds.has(row.id) ? 'bg-[#fde68a]/80' : index % 2 === 0 ? rowEvenClass : rowOddClass}>
                        <TableCell className="text-center">
                          <input type="checkbox" className={checkboxClass} aria-label={`Select ${row.name}`} checked={selectedIds.has(row.id)} onChange={() => setSelectedIds((prev) => { const next = new Set(prev); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })} />
                        </TableCell>
                        <TableCell>
                          <p className="text-[13px] font-bold text-[#1c1917]">{nameLabels.get(row.id) ?? row.name}{row.archived_at ? <span className="ml-1 bg-stone-200 px-1 text-[9px] uppercase text-stone-600">Archived</span> : null}</p>
                          <p className="font-mono text-[11px] text-[#b45309]">{row.osl_code || '—'}</p>
                        </TableCell>
                        <TableCell className="text-center text-xs">{row.lab_type}</TableCell>
                        <TableCell className="text-center text-xs">
                          <p>{row.contact_name || '—'}</p>
                          <p className="text-[#92400e]">{row.email || ''}</p>
                          <p className="font-mono">{row.mobile || ''}</p>
                        </TableCell>
                        <TableCell className="text-center text-xs text-[#57534e]">{formatAddress(row)}</TableCell>
                        <TableCell>
                          <div className="flex justify-center">
                            <Button type="button" size="sm" variant="ghost" className="h-10 w-10 min-h-10 text-[#92400e]" aria-label={`Edit ${row.name}`} onClick={() => openEdit(row)}><Pencil size={16} /></Button>
                            <Button type="button" size="sm" variant="ghost" className="h-10 w-10 min-h-10 text-[#92400e]" aria-label={`Copy ${row.name}`} onClick={() => openEdit(row, true)}><Copy size={16} /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          void file.text().then(async (text) => {
            // Quote-aware: exported addresses contain commas.
            const lines = parseCsv(text)
            const header = (lines.shift() ?? []).map((cell) => cell.toLowerCase())
            const index = (name: string) => header.indexOf(name)
            // Re-importing an export updates the matching lab (by name) instead of duplicating it.
            const existingByName = new Map(rows.map((row) => [row.name.trim().toLowerCase(), row]))
            let saved = 0
            try {
              for (const cells of lines) {
                const name = cells[index('name')] ?? ''
                if (!name) continue
                // Columns the CSV does not carry keep their saved values.
                const existing = existingByName.get(name.trim().toLowerCase())
                await saveLaboratory({
                  ...(existing ? rowToForm(existing) : emptyLaboratoryForm()),
                  name,
                  labType: cells[index('lab_type')] || 'OSL',
                  oslCode: cells[index('osl_code')] ?? '',
                  address: cells[index('address')] ?? '',
                  pinCode: cells[index('pin_code')] ?? '',
                  district: cells[index('district')] ?? '',
                  state: cells[index('state')] ?? '',
                  country: cells[index('country')] || 'India',
                  gstNumber: cells[index('gst_number')] ?? '',
                  openingBalance: cells[index('opening_balance')] ?? '',
                  balanceType: cells[index('balance_type')] === 'Cr' ? 'Cr' : 'Dr',
                  paymentTerm: cells[index('payment_term')] || '100 % Advance',
                  remark: cells[index('remark')] ?? '',
                  contactName: cells[index('contact_name')] ?? '',
                  email: cells[index('email')] ?? '',
                  mobile: cells[index('mobile')] ?? '',
                }, existing?.id ?? null)
                saved += 1
              }
            } finally {
              refresh()
            }
            setMessage(`Import saved (${saved}).`)
          }).catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Import failed'))
        }} />
        <ClientsTableFooterBar
          message={message}
          responsiveWrap
          loading={saveLoading || loading}
          selectedCount={selectedIds.size}
          totalCount={filtered.length}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          page={safePage}
          pageCount={pageCount}
          canEdit={canEdit}
          showArchived={showArchived}
          onToggleShowArchived={() => setShowArchived((value) => !value)}
          onArchiveSelected={() => archiveSelected(true)}
          onRestoreSelected={() => archiveSelected(false)}
          onImport={() => fileRef.current?.click()}
          onExport={() => exportRows(selectedRows.length > 0 ? selectedRows : filtered)}
          printTitle="Print selected laboratories"
          onPrintSelected={() => {
            if (selectedRows.length === 0) {
              setMessage('Select a laboratory to print.')
              return
            }
            const lines = selectedRows.map((row) => escapeHtml(`${row.name} · ${row.lab_type} · ${row.osl_code ?? ''}`))
            if (!printHtmlInFrame(`<!doctype html><html><head><meta charset="utf-8"/><title>Laboratories</title></head><body><pre>${lines.join('\n')}</pre></body></html>`)) {
              setMessage('Print Could Not Start. Try Again.')
            }
          }}
          onDeleteSelected={async () => {
            if (!(await confirm(`Delete ${selectedIds.size} Laboratory Record(s)?`, { title: 'Delete Laboratories', confirmLabel: 'Delete', destructive: true }))) return
            void deleteLaboratories([...selectedIds])
              .then(() => { setSelectedIds(new Set()); setMessage('Deleted.'); refresh() })
              .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Delete failed'))
          }}
          onHistory={() => setHistoryId([...selectedIds][0] ?? null)}
          onPrevPage={() => setPage((value) => Math.max(1, value - 1))}
          onNextPage={() => setPage((value) => Math.min(pageCount, value + 1))}
          jumpTo={jumpTo}
          onJumpToChange={setJumpTo}
          onJumpToGo={() => {
            const next = Number(jumpTo)
            if (Number.isFinite(next) && next >= 1) setPage(Math.min(pageCount, next))
          }}
        />
      </div>
      <AuditHistoryDialog
        open={historyId != null}
        onOpenChange={(open) => { if (!open) setHistoryId(null) }}
        table="laboratories"
        rowId={historyId}
        recordLabel={rows.find((row) => row.id === historyId)?.name ?? 'Laboratory'}
      />
    </div>
  )
}
