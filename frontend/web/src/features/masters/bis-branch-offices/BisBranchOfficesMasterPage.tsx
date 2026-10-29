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
import { printHtmlInFrame } from '@/lib/printHtmlInFrame'
import { escapeHtml } from '@/lib/sendAppEmail'
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
import { cn } from '@/lib/utils'
import { BisBranchOfficesForm } from './BisBranchOfficesForm'
import {
  deleteBisBranchOffices,
  emptyBisBranchOfficeForm,
  listBisBranchOffices,
  saveBisBranchOffice,
  setBisBranchOfficesArchived,
  type BisBranchOfficeForm,
  type BisBranchOfficeRow,
} from './bisBranchOfficesApi'

const GRID_TABLE =
  'min-w-0 w-full table-fixed border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_td]:break-words'
const thBase = 'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'

function formatAddress(row: BisBranchOfficeRow): string {
  return [row.address, row.city, row.state, row.pinCode].filter(Boolean).join(', ') || '—'
}

function rowToForm(row: BisBranchOfficeRow): BisBranchOfficeForm {
  return {
    code: row.code,
    name: row.name,
    officeType: row.officeType,
    region: row.region ?? '',
    address: row.address ?? '',
    pinCode: row.pinCode ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    country: row.country || 'India',
    countryCode: row.countryCode || '+91',
    contactName: row.contactName ?? '',
    email: row.email ?? '',
    mobile: row.mobile ?? '',
    remark: row.remark ?? '',
    gstNumber: row.gstNumber ?? '',
    longitude: row.longitude ?? '',
    latitude: row.latitude ?? '',
  }
}

function matchesSearch(row: BisBranchOfficeRow, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return [row.code, row.name, row.officeType, row.region, row.address, row.city, row.state, row.pinCode, row.country, row.contactName, row.email, row.mobile, row.gstNumber, row.longitude, row.latitude, row.remark]
    .some((value) => String(value ?? '').toLowerCase().includes(needle))
}

export default function BisBranchOfficesMasterPage() {
  const canEdit = useCanEditCurrentModule()
  const [confirm, confirmDialog] = useConfirmDialog()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<BisBranchOfficeRow[]>([])
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
  const [form, setForm] = useState<BisBranchOfficeForm>(emptyBisBranchOfficeForm())
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const handleFormOpenChange = useFormDialogOpenChange(setFormOpen)

  const refresh = (includeArchived = showArchived) => {
    setLoading(true)
    void listBisBranchOffices(includeArchived)
      .then((next) => {
        setRows(next)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unable to load BIS branch offices'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    void listBisBranchOffices(showArchived)
      .then((next) => {
        if (cancelled) return
        setRows(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Unable to load BIS branch offices')
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
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const rangeFrom = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeTo = Math.min(safePage * pageSize, filtered.length)

  const openNew = () => {
    setEditingId(null)
    setForm(emptyBisBranchOfficeForm())
    setSaveMessage(null)
    setFormOpen(true)
  }

  const openEdit = (row: BisBranchOfficeRow, asCopy = false) => {
    setEditingId(asCopy ? null : row.id)
    setForm({
      ...rowToForm(row),
      code: asCopy ? '' : row.code,
      name: asCopy ? `${row.name} copy` : row.name,
    })
    setSaveMessage(null)
    setFormOpen(true)
  }

  const onSave = () => {
    if (!form.code.trim() || !form.name.trim()) {
      setSaveMessage('Branch code and name are required.')
      return
    }
    setSaveLoading(true)
    void saveBisBranchOffice(form, editingId)
      .then(() => {
        setFormOpen(false)
        setMessage('BIS branch office saved.')
        refresh()
      })
      .catch((err: unknown) => setSaveMessage(err instanceof Error ? err.message : 'Save failed'))
      .finally(() => setSaveLoading(false))
  }

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportRows = (source: BisBranchOfficeRow[]) => {
    const header = ['code', 'name', 'office_type', 'region', 'address', 'pin_code', 'city', 'state', 'country', 'contact_name', 'email', 'mobile', 'gst_number', 'longitude', 'latitude', 'remark']
    const lines = source.map((row) =>
      [row.code, row.name, row.officeType, row.region, row.address, row.pinCode, row.city, row.state, row.country, row.contactName, row.email, row.mobile, row.gstNumber, row.longitude, row.latitude, row.remark]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bis-branch-offices.csv'
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Exported.')
  }

  const archiveSelected = (archived: boolean) => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    void setBisBranchOfficesArchived(ids, archived)
      .then(() => {
        setSelectedIds(new Set())
        setMessage(archived ? 'Archived.' : 'Restored.')
        refresh()
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Update failed'))
  }

  return (
    <div data-master-scroll="table" className={cn(clientPageShellClass, 'bis-branch-offices-page-container flex h-full min-h-0 flex-col overflow-hidden !space-y-0 gap-2 sm:gap-3 md:gap-3')}>
      {confirmDialog}
      <div className="shrink-0">
        <div className={clientPanelClass}>
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-2 text-white sm:px-4 sm:py-2.5 md:px-5">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)' }} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <div className="relative flex min-w-0 flex-wrap items-center gap-1.5 md:gap-2.5">
              <h1 className="shrink-0 truncate text-sm font-semibold tracking-tight text-white sm:text-base md:text-lg" title="BIS Branch Offices">
                <span className="md:hidden">BIS Offices</span>
                <span className="hidden md:inline">BIS Branch Offices</span>
              </h1>
              <div className="relative min-w-0 flex-1 basis-0 max-sm:basis-full">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400 sm:left-3" aria-hidden />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  placeholder="Search Office | Code | City | State | Email"
                  className={cn(clientDarkBarSearchClass, 'h-10 min-h-10 w-full min-w-0 pl-7 text-xs sm:pl-9 sm:text-sm')}
                  aria-label="Search BIS Branch Offices"
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
              <QiAssistant page="bis-branch-offices" pageTitle="BIS Branch Offices" contextSummary={`${filtered.length} BIS branch offices`} welcomeMessage="" suggestedQuestions={[]} triggerVariant="icon" triggerClassName={cn(clientAiTriggerClass, 'h-8 w-8 shrink-0')} />
              {canEdit ? (
                <Button type="button" className={cn('bis-branch-add-button h-8 shrink-0 gap-1 px-2 sm:px-3', clientPrimaryBtnClass)} size="sm" onClick={openNew} aria-label="Add New BIS Branch Office">
                  <Plus size={14} />
                  <span className="bis-branch-add-label hidden lg:inline">Add New Office</span>
                  <span className="bis-branch-add-label hidden sm:inline lg:hidden">Add</span>
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
                {editingId ? 'Edit BIS Branch Office' : 'Add New BIS Branch Office'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5">
            <BisBranchOfficesForm form={form} onChange={setForm} canEdit={canEdit} saveLoading={saveLoading} saveMessage={saveMessage} onSave={onSave} />
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className={cn(clientPanelClass, 'flex h-full min-h-0 flex-col bg-[#f7f3eb]')}>
          {error ? <p className="px-3 pt-3 text-sm text-red-600">{error}</p> : null}
          {loading ? <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p> : paged.length === 0 ? (
            <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center">
              <p className="text-sm text-[#57534e]">{search.trim() ? 'No offices match your search.' : 'No BIS branch offices added yet.'}</p>
            </div>
          ) : (
            <div className="bis-branch-list-viewport min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <div className="bis-branch-card-view space-y-2.5 p-2 sm:p-3">
                {paged.map((row, index) => (
                  <article key={row.id} className={cn('overflow-hidden border-2 border-stone-500 shadow-sm', selectedIds.has(row.id) ? 'bg-[#fde68a]/70' : index % 2 === 0 ? 'bg-[#fffcf7]' : 'bg-white')}>
                    <div className="min-w-0 p-2.5">
                      <div className="flex items-start gap-2">
                        <input type="checkbox" className={cn(checkboxClass, 'mt-1')} aria-label={`Select ${row.name}`} checked={selectedIds.has(row.id)} onChange={() => toggle(row.id)} />
                        <div className="min-w-0 flex-1">
                          <p className="flex min-w-0 items-center gap-1 break-words text-[13px] font-bold text-[#1c1917]"><Building2 className="h-3.5 w-3.5 shrink-0 text-amber-700" />{row.name}{row.archivedAt ? <span className="bg-stone-200 px-1 text-[9px] uppercase text-stone-600">Archived</span> : null}</p>
                          <p className="font-mono text-[11px] text-[#b45309]">{row.gstNumber ? `${row.code} - ${row.gstNumber}` : row.code}</p>
                          <p className="text-[11px] text-[#57534e]">{row.officeType}</p>
                        </div>
                        <div className="flex shrink-0">
                          <Button type="button" size="sm" variant="ghost" className="h-10 w-10 min-h-10" aria-label={`Edit ${row.name}`} onClick={() => openEdit(row)}><Pencil size={16} /></Button>
                          <Button type="button" size="sm" variant="ghost" className="h-10 w-10 min-h-10" aria-label={`Copy ${row.name}`} onClick={() => openEdit(row, true)}><Copy size={16} /></Button>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1 border-t border-[#e7e0d4] pt-2 text-[11px] text-[#57534e]">
                        <p>{row.contactName || '—'}</p>
                        <p className="flex gap-2"><Mail className="mt-0.5 h-3 w-3 shrink-0 text-amber-700" />{row.email || '—'}</p>
                        <p className="flex gap-2"><Phone className="mt-0.5 h-3 w-3 shrink-0 text-amber-700" />{row.mobile || '—'}</p>
                        <p className="flex gap-2"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-amber-700" />{formatAddress(row)}</p>
                        {row.latitude && row.longitude ? (
                          <div className="font-mono text-[10px] leading-tight text-[#78716c]">
                            <p>{row.latitude}</p>
                            <p>{row.longitude}</p>
                          </div>
                        ) : (
                          <p className="font-mono text-[10px] text-[#78716c]">—</p>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="bis-branch-table-view min-w-0">
                <Table className={GRID_TABLE}>
                  <colgroup>
                    <col className="w-[4%]" />
                    <col className="w-[26%]" />
                    <col className="w-[9%]" />
                    <col className="w-[15%]" />
                    <col className="w-[30%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                  </colgroup>
                  <TableHeader>
                    <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                      <TableHead className={cn('w-[4%]', thBase)}>
                        <input type="checkbox" className={checkboxClass} aria-label="Select All" checked={paged.length > 0 && paged.every((row) => selectedIds.has(row.id))} onChange={(e) => setSelectedIds((prev) => { const next = new Set(prev); for (const row of paged) { if (e.target.checked) next.add(row.id); else next.delete(row.id) } return next })} />
                      </TableHead>
                      <TableHead className={cn('w-[26%]', thBase)}>Office</TableHead>
                      <TableHead className={cn('w-[9%]', thBase)}>Type</TableHead>
                      <TableHead className={cn('w-[15%]', thBase)}>Contact</TableHead>
                      <TableHead className={cn('w-[30%]', thBase)}>Address</TableHead>
                      <TableHead className={cn('w-[8%]', thBase)}>Coordinates</TableHead>
                      <TableHead className={cn('w-[8%]', thBase)}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((row, index) => (
                      <TableRow key={row.id} className={selectedIds.has(row.id) ? 'bg-[#fde68a]/80' : index % 2 === 0 ? rowEvenClass : rowOddClass}>
                        <TableCell className="text-center">
                          <input type="checkbox" className={checkboxClass} aria-label={`Select ${row.name}`} checked={selectedIds.has(row.id)} onChange={() => toggle(row.id)} />
                        </TableCell>
                        <TableCell>
                          <p className="text-[13px] font-bold text-[#1c1917]">{row.name}{row.archivedAt ? <span className="ml-1 bg-stone-200 px-1 text-[9px] uppercase text-stone-600">Archived</span> : null}</p>
                          <p className="font-mono text-[11px] text-[#b45309]">{row.gstNumber ? `${row.code} - ${row.gstNumber}` : row.code}</p>
                        </TableCell>
                        <TableCell className="text-center text-xs">{row.officeType}</TableCell>
                        <TableCell className="text-center text-xs">
                          <p>{row.contactName || '—'}</p>
                          <p className="text-[#92400e]">{row.email || ''}</p>
                          <p className="font-mono">{row.mobile || ''}</p>
                        </TableCell>
                        <TableCell className="text-center text-xs text-[#57534e]">
                          <p>{formatAddress(row)}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          {row.latitude && row.longitude ? (
                            <div className="font-mono text-[10px] leading-tight text-[#78716c]">
                              <p>{row.latitude}</p>
                              <p>{row.longitude}</p>
                            </div>
                          ) : (
                            <p className="font-mono text-[10px] text-[#78716c]">—</p>
                          )}
                        </TableCell>
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
            const lines = text.split(/\r?\n/).filter((line) => line.trim())
            const header = (lines.shift() ?? '').split(',').map((cell) => cell.trim().replace(/^"|"$/g, '').toLowerCase())
            const index = (name: string) => header.indexOf(name)
            let saved = 0
            for (const line of lines) {
              const cells = line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
              const name = cells[index('name')] ?? ''
              const code = cells[index('code')] ?? ''
              if (!name || !code) continue
              await saveBisBranchOffice({
                ...emptyBisBranchOfficeForm(),
                code,
                name,
                officeType: cells[index('office_type')] || 'Branch Office',
                region: cells[index('region')] ?? '',
                address: cells[index('address')] ?? '',
                pinCode: cells[index('pin_code')] ?? '',
                city: cells[index('city')] ?? '',
                state: cells[index('state')] ?? '',
                country: cells[index('country')] || 'India',
                contactName: cells[index('contact_name')] ?? '',
                email: cells[index('email')] ?? '',
                mobile: cells[index('mobile')] ?? '',
                remark: cells[index('remark')] ?? '',
                gstNumber: cells[index('gst_number')] ?? '',
                longitude: cells[index('longitude')] ?? '',
                latitude: cells[index('latitude')] ?? '',
              }, null)
              saved += 1
            }
            setMessage(`Import saved (${saved}).`)
            refresh()
          }).catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Import failed'))
        }} />
        <ClientsTableFooterBar
          message={message}
          responsiveWrap
          responsiveClassName="bis-branch-responsive-footer"
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
          onExport={() => exportRows(rows.filter((row) => selectedIds.has(row.id)).length > 0 ? rows.filter((row) => selectedIds.has(row.id)) : filtered)}
          printTitle="Print selected BIS branch offices"
          onPrintSelected={() => {
            const selected = rows.filter((row) => selectedIds.has(row.id))
            if (selected.length === 0) {
              setMessage('Select an office to print.')
              return
            }
            const lines = selected.map((row) => escapeHtml(`${row.code} · ${row.name} · ${row.officeType}`))
            if (!printHtmlInFrame(`<!doctype html><html><head><meta charset="utf-8"/><title>BIS Branch Offices</title></head><body><pre>${lines.join('\n')}</pre></body></html>`)) {
              setMessage('Print Could Not Start. Try Again.')
            }
          }}
          onDeleteSelected={async () => {
            if (!(await confirm(`Delete ${selectedIds.size} BIS Branch Office Record(s)?`, { title: 'Delete BIS Branch Offices', confirmLabel: 'Delete', destructive: true }))) return
            void deleteBisBranchOffices([...selectedIds])
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
        table="bis_offices"
        rowId={historyId}
        recordLabel={rows.find((row) => row.id === historyId)?.name ?? 'BIS Branch Office'}
      />
    </div>
  )
}
