import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Award, CheckCircle2, FileText, Loader2, Pencil, Plus, Printer, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { formatDisplayDate } from '@/features/bis/projects/types'
import { limsDarkBarGlowStyle, limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { todayLocalIso } from '@/lib/localDate'
import { printHtmlInFrame } from '@/lib/printHtmlInFrame'
import { cn } from '@/lib/utils'
import {
  deletePortalEntry,
  fetchLinkOptions,
  fetchPortalEntries,
  fetchPortalLicence,
  fetchPortalSection,
  formatCmL,
  isLabel,
  savePortalEntry,
  serviceLabel,
  type PortalEntry,
  type PortalLinkOption,
  type PortalSection,
} from './portalApi'
import { usePortalData } from './portalDataContext'
import { cellText, linkLabel, REF_LABEL } from './recordDisplay'
import { buildRecordPrintHtml, type PrintHeader } from './recordPrint'
import { buildTestCertificateHtml, type CertificateGroup } from './testCertificatePrint'
import {
  computeEntry,
  defaultEntryValues,
  limitsText,
  passFailWords,
  toNumber,
  validateValue,
  withinLimits,
} from './recordLogic'

const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-amber-200 whitespace-nowrap'
const td = 'border border-stone-200 px-2 py-1.5 align-top text-sm text-stone-800'
const iconBtn = 'inline-flex h-7 w-7 items-center justify-center border border-stone-300 bg-white text-amber-800 hover:bg-amber-50 disabled:opacity-40'

function ResultBadge({ result }: { result: 'pass' | 'fail' | null }) {
  if (result === 'pass') return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} /> Pass</span>
  if (result === 'fail') return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"><XCircle size={14} /> Fail</span>
  return <span className="text-xs text-stone-400">—</span>
}

function EntryDialog({
  section,
  entry,
  links,
  onClose,
  onSaved,
}: {
  section: PortalSection
  entry: PortalEntry | 'new'
  links: Record<string, PortalLinkOption[]>
  onClose: () => void
  onSaved: () => void
}) {
  const existing = entry === 'new' ? null : entry
  const [entryDate, setEntryDate] = useState(existing?.entry_date ?? todayLocalIso())
  const [refNo, setRefNo] = useState(existing?.ref_no ?? '')
  const [input, setInput] = useState<Record<string, unknown>>(existing?.data ?? defaultEntryValues(section.columns))
  const [saving, setSaving] = useState(false)
  // Values of the entries picked in each link column, for formulas like SUM(rm_lots.quantity).
  const linked = useMemo(() => {
    const out: Record<string, Array<Record<string, unknown>>> = {}
    for (const c of section.columns) {
      if (c.col_type !== 'link') continue
      const picked = input[c.key]
      const ids = Array.isArray(picked) ? picked.map(String) : picked ? [String(picked)] : []
      const opts = links[c.config.section_id ?? ''] ?? []
      out[c.key] = opts.filter((o) => ids.includes(o.id)).map((o) => o.data ?? {})
    }
    return out
  }, [section.columns, input, links])
  const computed = useMemo(() => computeEntry(section.columns, input, linked), [section.columns, input, linked])
  // Each column's own rules (format, length, range, dates, picks); Required is checked on save.
  const ruleErrors = useMemo(() => {
    const out: Record<string, string> = {}
    for (const c of section.columns) {
      const msg = validateValue(c, computed.values[c.key])
      if (msg) out[c.key] = msg
    }
    return out
  }, [section.columns, computed.values])
  const set = (key: string, v: unknown) => setInput((prev) => ({ ...prev, [key]: v }))

  const save = async () => {
    const missing = section.columns.filter((c) => c.required && c.col_type !== 'formula' && (computed.values[c.key] == null || computed.values[c.key] === '' || (Array.isArray(computed.values[c.key]) && (computed.values[c.key] as unknown[]).length === 0)))
    if (missing.length) {
      toast.warning(`Fill ${missing.map((c) => c.label).join(', ')}`)
      return
    }
    const wrong = Object.values(ruleErrors)
    if (wrong.length) {
      toast.warning(wrong[0]!)
      return
    }
    setSaving(true)
    try {
      await savePortalEntry({
        sectionId: section.id,
        entryId: existing?.id ?? null,
        entryDate,
        refNo,
        values: computed.values,
        result: computed.result,
      })
      toast.success(existing ? 'Entry Updated' : 'Entry Saved')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className={cn(limsDialogClass, 'flex max-h-[92dvh] w-[min(46rem,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden bg-white p-0')}>
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">{existing ? 'Edit Entry' : 'New Entry'} — {section.name}</DialogTitle>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#fffcf7] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="entry-date">Date</Label>
              <Input id="entry-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="entry-ref">{REF_LABEL[section.kind] ?? 'Ref No'}</Label>
              <Input id="entry-ref" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
            </div>
            {section.columns.map((col) => {
              const v = computed.values[col.key]
              const id = `col-${col.key}`
              const limits = limitsText(col)
              const ok = col.col_type === 'spec' || col.col_type === 'formula' ? withinLimits(col, v) : null
              const label = (
                <Label htmlFor={id} className="flex flex-wrap items-baseline gap-x-1.5">
                  <span>{col.label}{col.required ? <span className="text-red-600"> *</span> : null}</span>
                  {col.unit && !limits ? <span className="text-[11px] font-normal text-stone-500">({col.unit})</span> : null}
                  {limits ? <span className="text-[11px] font-normal text-stone-500">Limit {limits}</span> : null}
                </Label>
              )
              let field
              if (col.col_type === 'formula') {
                field = (
                  <div className={cn('flex h-9 items-center border px-2 text-sm', ok === false ? 'border-red-400 bg-red-50 text-red-800' : ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-stone-300 bg-stone-100 text-stone-800')}>
                    {computed.formulaErrors[col.key] ? <span className="text-xs text-red-700">{computed.formulaErrors[col.key]}</span> : cellText(col, v, links) || '—'}
                  </div>
                )
              } else if (col.col_type === 'select' && col.config.multiple) {
                // Several choices: a tick per option (and a box for another value when allowed).
                const picked = Array.isArray(v) ? v.map(String) : v ? [String(v)] : []
                const options = col.config.options ?? []
                const others = picked.filter((p) => !options.includes(p))
                field = (
                  <div className="space-y-1.5 border border-stone-300 bg-white p-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {options.map((o) => (
                        <label key={o} className="inline-flex items-center gap-1.5 text-sm text-stone-800">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={picked.includes(o)}
                            onChange={(e) => set(col.key, e.target.checked ? [...picked, o] : picked.filter((p) => p !== o))}
                          />
                          {o}
                        </label>
                      ))}
                    </div>
                    {col.config.allow_other ? (
                      <Input
                        className="h-8"
                        placeholder="Other (Comma Separated)"
                        value={others.join(', ')}
                        onChange={(e) => set(col.key, [...picked.filter((p) => options.includes(p)), ...e.target.value.split(',').map((x) => x.trim()).filter(Boolean)])}
                      />
                    ) : null}
                  </div>
                )
              } else if (col.col_type === 'select' && col.config.allow_other) {
                // One choice from the list, or a value typed by the customer.
                field = (
                  <>
                    <Input id={id} list={`${id}-options`} value={String(v ?? '')} placeholder="Pick or Type" onChange={(e) => set(col.key, e.target.value)} />
                    <datalist id={`${id}-options`}>
                      {(col.config.options ?? []).map((o) => <option key={o} value={o} />)}
                    </datalist>
                  </>
                )
              } else if (col.col_type === 'select' || col.col_type === 'pass_fail') {
                const words = passFailWords(col.config)
                const options: Array<[string, string]> = col.col_type === 'pass_fail'
                  ? [['pass', words[0]], ['fail', words[1]]]
                  : (col.config.options ?? []).map((o) => [o, o])
                field = (
                  <select id={id} className="h-9 w-full border border-stone-400 bg-white px-2 text-sm" value={String(v ?? '')} onChange={(e) => set(col.key, e.target.value)}>
                    <option value="">—</option>
                    {options.map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                )
              } else if (col.col_type === 'link') {
                const all = links[col.config.section_id ?? ''] ?? []
                const selected = Array.isArray(v) ? v.map(String) : v ? [String(v)] : []
                // Only passed entries when asked, but keep ones already picked so they still show.
                const opts = col.config.only_passed ? all.filter((o) => o.result !== 'fail' || selected.includes(o.id)) : all
                field = col.config.single ? (
                  <select id={id} className="h-9 w-full border border-stone-400 bg-white px-2 text-sm" value={selected[0] ?? ''} onChange={(e) => set(col.key, e.target.value ? [e.target.value] : [])}>
                    <option value="">—</option>
                    {opts.map((o) => (
                      <option key={o.id} value={o.id}>{linkLabel(o, col)}{o.result === 'fail' ? ' (Fail)' : ''}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    id={id}
                    multiple
                    className="h-24 w-full border border-stone-400 bg-white px-1 text-sm"
                    value={selected}
                    onChange={(e) => set(col.key, Array.from(e.target.selectedOptions).map((o) => o.value))}
                  >
                    {opts.map((o) => (
                      <option key={o.id} value={o.id}>{linkLabel(o, col)}{o.result === 'fail' ? ' (Fail)' : ''}</option>
                    ))}
                  </select>
                )
              } else if (col.col_type === 'text') {
                const cfg = col.config
                const max = cfg.max_length != null ? Number(cfg.max_length) : cfg.alphanumeric && cfg.mask && !cfg.regex ? String(cfg.mask).length : undefined
                const hint = cfg.placeholder ? String(cfg.placeholder) : cfg.alphanumeric && cfg.mask ? String(cfg.mask) : undefined
                const fix = (t: string) =>
                  cfg.letter_case === 'upper' || (cfg.alphanumeric && cfg.letter_case == null) ? t.toUpperCase()
                    : cfg.letter_case === 'lower' ? t.toLowerCase()
                      : cfg.letter_case === 'title' ? t.replace(/(^|\s)([a-z])/g, (_m, sp: string, c: string) => sp + c.toUpperCase())
                        : t
                field = cfg.long ? (
                  <textarea id={id} rows={3} maxLength={max} placeholder={hint} className="w-full border border-stone-400 bg-white p-2 text-sm" value={String(v ?? '')} onChange={(e) => set(col.key, fix(e.target.value))} />
                ) : (
                  <Input id={id} maxLength={max} placeholder={hint} className={cn(ruleErrors[col.key] && 'border-red-400 bg-red-50', Boolean(cfg.alphanumeric) && 'font-mono tracking-wide')} value={String(v ?? '')} onChange={(e) => set(col.key, fix(e.target.value))} />
                )
              } else if (col.col_type === 'date') {
                const cfg = col.config
                const today = todayLocalIso()
                const time = Boolean(cfg.include_time)
                field = (
                  <Input
                    id={id}
                    type={time ? 'datetime-local' : 'date'}
                    min={cfg.no_past ? (time ? `${today}T00:00` : today) : undefined}
                    max={cfg.no_future ? (time ? `${today}T23:59` : today) : undefined}
                    value={String(v ?? '')}
                    onChange={(e) => set(col.key, e.target.value)}
                  />
                )
              } else {
                const numeric = col.col_type === 'number' || col.col_type === 'spec'
                field = (
                  <Input
                    id={id}
                    type="text"
                    inputMode={numeric ? 'decimal' : undefined}
                    className={cn(ok === false && 'border-red-400 bg-red-50', ok === true && 'border-emerald-300')}
                    value={String(v ?? '')}
                    onChange={(e) => {
                      const raw = numeric && col.config.no_negative ? e.target.value.replace(/-/g, '') : e.target.value
                      set(col.key, numeric ? (raw === '' ? '' : toNumber(raw) ?? raw) : raw)
                    }}
                  />
                )
              }
              return (
                <div key={col.id} className={cn('space-y-1', col.col_type === 'link' && 'sm:col-span-2')}>
                  {label}
                  {field}
                  {ruleErrors[col.key] ? <p className="text-[11px] font-medium text-red-700">{ruleErrors[col.key]}</p> : null}
                  {col.col_type === 'link' && !col.config.single ? <p className="text-[11px] text-stone-500">Hold Ctrl / Cmd to select more than one.</p> : null}
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3">
          <span className="text-sm">Result: <ResultBadge result={computed.result} /></span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-9')} onClick={onClose}>Cancel</Button>
            <Button type="button" className={cn(limsPrimaryBtnClass, 'h-9 min-w-[6rem]')} disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function PortalRecordsPage() {
  const { id = '', sectionId = '' } = useParams()
  return <SectionRecords key={sectionId} licenceId={id} sectionId={sectionId} />
}

function SectionRecords({ licenceId, sectionId }: { licenceId: string; sectionId: string }) {
  const { reload: reloadDashboard, dashboard } = usePortalData()
  const [confirm, confirmDialog] = useConfirmDialog()
  const [section, setSection] = useState<PortalSection | null>(null)
  const [entries, setEntries] = useState<PortalEntry[] | null>(null)
  const [links, setLinks] = useState<Record<string, PortalLinkOption[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [editing, setEditing] = useState<PortalEntry | 'new' | null>(null)

  const loadEntries = useCallback(
    () =>
      fetchPortalEntries(sectionId, from, to)
        .then(setEntries)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load entries')),
    [sectionId, from, to],
  )

  useEffect(() => {
    void fetchPortalSection(sectionId)
      .then(async (s) => {
        setSection(s)
        const targets = [...new Set(s.columns.filter((c) => c.col_type === 'link' && c.config.section_id).map((c) => c.config.section_id!))]
        const lists = await Promise.all(targets.map((t) => fetchLinkOptions(t).catch(() => [] as PortalLinkOption[])))
        setLinks(Object.fromEntries(targets.map((t, i) => [t, lists[i] ?? []])))
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load this section'))
  }, [sectionId])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  const canWrite = section?.service.state === 'trial' || section?.service.state === 'active'
  const back = (
    <Link to={`/portal/licences/${licenceId}`} className="inline-flex items-center gap-1 text-sm font-medium text-amber-800 hover:underline">
      <ArrowLeft size={15} aria-hidden /> Licence Details
    </Link>
  )

  if (error) return <div className="space-y-3">{back}<p className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p></div>
  if (!section) return <p className="flex items-center gap-2 text-sm text-stone-600"><Loader2 size={16} className="animate-spin" /> Loading…</p>

  const service = serviceLabel(section.service.state, section.service.valid_till)
  const remove = async (entry: PortalEntry) => {
    if (!(await confirm('Delete this entry?', { title: 'Delete Entry', confirmLabel: 'Delete', destructive: true }))) return
    try {
      await deletePortalEntry(entry.id)
      toast.success('Entry Deleted')
      void loadEntries()
      void reloadDashboard()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete')
    }
  }
  const fails = entries?.filter((e) => e.result === 'fail').length ?? 0
  const loadHeader = async (): Promise<PrintHeader> => {
    const lic = await fetchPortalLicence(licenceId)
    const f = lic.factory ?? {}
    return {
      company: lic.company_name ?? '',
      address: [f.address, f.city, f.district, f.state, f.pin_code].map((x) => String(x ?? '').trim()).filter(Boolean).join(', '),
      licence: lic.cm_l_digits ? formatCmL(lic.cm_l_digits) : lic.license_number ?? '',
      isLabel: lic.is_number ? isLabel(lic) : '',
      isTitle: lic.is_title ?? '',
    }
  }
  const printRegister = async (blank: boolean) => {
    try {
      const header = await loadHeader()
      const html = buildRecordPrintHtml({ section, header, entries: blank ? null : entries ?? [], links, period: { from, to } })
      if (!printHtmlInFrame(html)) toast.error('Could Not Open the Print Window.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Print')
    }
  }

  /**
   * Test Certificate of one batch (Batch / Lot sections; owner, 25 Nov 2026). The test entries are the ones the batch
   * picks in its Link columns; for a test section the batch does not link to, the entries that link back to the
   * batch, else (Final Testing only) the entries whose Sample / Batch No is the batch number.
   */
  const printCertificate = async (batch: PortalEntry) => {
    try {
      const header = await loadHeader()
      const licence = dashboard?.licences.find((l) => l.id === licenceId)
      const linkTargets = section.columns.filter((c) => c.col_type === 'link' && c.config.section_id).map((c) => c.config.section_id!)
      const candidates = [...new Set([...(licence?.sections ?? []).filter((x) => x.kind === 'final_test' || x.kind === 'in_process').map((x) => x.id), ...linkTargets])]
      const batchRef = (batch.ref_no ?? '').trim().toLowerCase()
      const idsIn = (v: unknown) => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)])
      const groups: CertificateGroup[] = []
      for (const id of candidates) {
        const testSection = await fetchPortalSection(id).catch(() => null)
        if (!testSection || (testSection.kind !== 'final_test' && testSection.kind !== 'in_process')) continue
        const picked = new Set(section.columns.filter((c) => c.col_type === 'link' && c.config.section_id === id).flatMap((c) => idsIn(batch.data[c.key])))
        const backLinks = testSection.columns.filter((c) => c.col_type === 'link' && c.config.section_id === section.id)
        const options = links[id] ?? (await fetchLinkOptions(id).catch(() => [] as PortalLinkOption[]))
        const mine = options.filter((o) =>
          picked.size
            ? picked.has(o.id)
            : backLinks.length
              ? backLinks.some((c) => idsIn(o.data?.[c.key]).includes(batch.id))
              : testSection.kind === 'final_test' && batchRef !== '' && (o.ref_no ?? '').trim().toLowerCase() === batchRef,
        )
        groups.push({ section: testSection, entries: [...mine].sort((a, b) => a.entry_date.localeCompare(b.entry_date)), links: {} })
      }
      // Final Testing first, then In-Process.
      groups.sort((a, b) => Number(a.section.kind !== 'final_test') - Number(b.section.kind !== 'final_test'))
      const html = buildTestCertificateHtml({
        header,
        batchSection: section,
        batch,
        batchLinks: links,
        testSectionIds: groups.map((g) => g.section.id),
        groups,
      })
      if (!printHtmlInFrame(html)) toast.error('Could Not Open the Print Window.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Print the Test Certificate')
    }
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      {back}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-semibold tracking-tight text-stone-900 sm:text-xl">{section.name}</h1>
        <span className={cn('border px-1.5 py-0.5 text-[11px] font-medium', service.className)}>{service.label}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-9 gap-1.5')} disabled={section.columns.length === 0 || !entries}
            title="Print the Entries Shown (or Save as PDF)" onClick={() => void printRegister(false)}>
            <Printer size={15} aria-hidden /> Print / PDF
          </Button>
          <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-9 gap-1.5')} disabled={section.columns.length === 0}
            title="Print an Empty Register to Fill by Hand" onClick={() => void printRegister(true)}>
            <FileText size={15} aria-hidden /> Blank Format
          </Button>
          <Input type="date" aria-label="From Date" className="h-9 w-[9.5rem]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" aria-label="To Date" className="h-9 w-[9.5rem]" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button type="button" className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5')} disabled={!canWrite || section.columns.length === 0} onClick={() => setEditing('new')}>
            <Plus size={15} /> New Entry
          </Button>
        </div>
      </div>
      {!canWrite ? (
        <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The records service of this licence is not active, so entries can only be viewed. Please contact Q Engineering.
        </p>
      ) : null}
      {section.columns.length === 0 ? (
        <p className="border border-stone-300 bg-white px-3 py-6 text-center text-sm text-stone-600">Q Engineering is preparing the format of this section.</p>
      ) : (
        <div className="border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2 text-xs text-stone-600">
            <span>{entries ? `${entries.length.toLocaleString('en-IN')} Entries` : 'Loading…'}</span>
            {fails ? <span className="font-semibold text-red-700">{fails} Failed</span> : null}
          </div>
          <div className="overflow-x-auto">
            {/* auto-cards: on phones each entry is a card — its date on top, every column under its name (index.css). */}
            <table className="auto-cards w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>{REF_LABEL[section.kind] ?? 'Ref No'}</th>
                  {section.columns.map((c) => (
                    <th key={c.id} className={th}>
                      {c.label}
                      {c.unit ? <span className="ml-1 font-normal normal-case text-stone-300">({c.unit})</span> : null}
                    </th>
                  ))}
                  <th className={th}>Result</th>
                  <th className={cn(th, 'w-[1%]')} />
                </tr>
              </thead>
              <tbody>
                {entries?.length === 0 ? (
                  <tr><td colSpan={section.columns.length + 4} className={cn(td, 'py-6 text-center text-stone-500')}>No entries yet.</td></tr>
                ) : (
                  entries?.map((e, i) => (
                    <tr key={e.id} className={i % 2 ? 'bg-[#faf7f1]' : 'bg-white'}>
                      <td className={cn(td, 'whitespace-nowrap')}>{formatDisplayDate(e.entry_date)}</td>
                      <td className={td}>{e.ref_no || '—'}</td>
                      {section.columns.map((c) => {
                        const v = e.data[c.key]
                        const ok = c.col_type === 'spec' || c.col_type === 'formula' ? withinLimits(c, v) : null
                        const fail = ok === false || (c.col_type === 'pass_fail' && String(v).toLowerCase() === 'fail')
                        return (
                          <td key={c.id} className={cn(td, fail && 'bg-red-50 font-semibold text-red-700')}>
                            {cellText(c, v, links) || <span className="text-stone-300">—</span>}
                          </td>
                        )
                      })}
                      <td className={td}><ResultBadge result={e.result} /></td>
                      <td className={cn(td, 'whitespace-nowrap')}>
                        <span className="flex gap-1">
                          {section.kind === 'batch' ? (
                            <button type="button" className={iconBtn} title="Test Certificate of This Batch (Print / PDF)" aria-label="Print Test Certificate" onClick={() => void printCertificate(e)}><Award size={13} /></button>
                          ) : null}
                          <button type="button" className={iconBtn} disabled={!canWrite} title="Edit" aria-label="Edit Entry" onClick={() => setEditing(e)}><Pencil size={13} /></button>
                          <button type="button" className={cn(iconBtn, 'text-red-700')} disabled={!canWrite} title="Delete" aria-label="Delete Entry" onClick={() => void remove(e)}><Trash2 size={13} /></button>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {editing ? (
        <EntryDialog
          section={section}
          entry={editing}
          links={links}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void loadEntries()
            void reloadDashboard()
          }}
        />
      ) : null}
    </div>
  )
}
