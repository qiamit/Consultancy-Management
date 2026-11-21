import { formatDisplayDate } from '@/features/bis/projects/types'
import type { PortalEntry, PortalLinkOption } from './portalApi'
import { cellText, REF_LABEL } from './recordDisplay'
import { limitsText, withinLimits, type RecordColumn } from './recordLogic'

/*
 * Printed register of one record section (owner, 21 Nov 2026): no fixed format per product. The columns come from the
 * section's own setup, the look from its print settings (Records Setup → Print Settings), and the header from the
 * licence. Prints the customer's entries, or a blank register to fill by hand. Browser print, so "Save as PDF" works.
 */

export type PrintOrientation = 'auto' | 'portrait' | 'landscape'

export type PrintSettings = {
  /** Heading of the register; the section name when empty. */
  title?: string
  orientation?: PrintOrientation
  /** Column keys left out of the print. */
  hidden_columns?: string[]
  /** Rows of a blank register (1–60). */
  blank_rows?: number
  /** Signature boxes at the foot, left to right. */
  signatures?: string[]
  /** The Result (Pass / Fail) column. */
  show_result?: boolean
  /** The limits under each column heading. */
  show_limits?: boolean
  /** A line under the title (e.g. "Frequency: Every Heat"). */
  note?: string
}

export const DEFAULT_SIGNATURES = ['Prepared By', 'Checked By', 'Approved By']
export const DEFAULT_BLANK_ROWS = 20

export function printSettingsOf(raw: unknown): Required<PrintSettings> {
  const s = (raw && typeof raw === 'object' ? raw : {}) as PrintSettings
  const rows = Math.round(Number(s.blank_rows))
  return {
    title: String(s.title ?? '').trim(),
    orientation: s.orientation === 'portrait' || s.orientation === 'landscape' ? s.orientation : 'auto',
    hidden_columns: Array.isArray(s.hidden_columns) ? s.hidden_columns.map(String) : [],
    blank_rows: Number.isFinite(rows) && rows >= 1 ? Math.min(rows, 60) : DEFAULT_BLANK_ROWS,
    signatures: Array.isArray(s.signatures)
      ? s.signatures.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
      : DEFAULT_SIGNATURES,
    show_result: s.show_result !== false,
    show_limits: s.show_limits !== false,
    note: String(s.note ?? '').trim(),
  }
}

export type PrintHeader = {
  company: string
  address?: string
  licence?: string
  isLabel?: string
  isTitle?: string
}

export type PrintSection = { name: string; kind: string; columns: RecordColumn[]; print_settings?: unknown }

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Landscape when the printed columns would not fit an A4 portrait page. */
export function printLandscape(section: PrintSection): boolean {
  const s = printSettingsOf(section.print_settings)
  if (s.orientation !== 'auto') return s.orientation === 'landscape'
  const shown = section.columns.filter((c) => !s.hidden_columns.includes(c.key)).length
  return shown + 3 + (s.show_result ? 1 : 0) > 9
}

export function buildRecordPrintHtml(input: {
  section: PrintSection
  header: PrintHeader
  /** null prints a blank register. */
  entries: PortalEntry[] | null
  links?: Record<string, PortalLinkOption[]>
  period?: { from?: string; to?: string }
}): string {
  const { section, header, entries } = input
  const s = printSettingsOf(section.print_settings)
  const cols = section.columns.filter((c) => !s.hidden_columns.includes(c.key))
  // A section that has its own "Result" column does not get a second one.
  const showResult = s.show_result && !cols.some((c) => c.label.trim().toLowerCase() === 'result')
  const landscape = printLandscape(section)
  const total = cols.length + 3 + (showResult ? 1 : 0)
  const fontPx = total > 14 ? 8 : total > 10 ? 9 : 10
  const title = s.title || section.name
  const refLabel = REF_LABEL[section.kind] ?? 'Ref No'

  const head = [
    '<th class="sno">S. No</th>',
    '<th class="date">Date</th>',
    `<th>${esc(refLabel)}</th>`,
    ...cols.map((c) => {
      const limits = s.show_limits ? limitsText(c) : ''
      const unit = c.unit && !limits ? ` (${c.unit})` : ''
      return `<th>${esc(c.label)}${esc(unit)}${limits ? `<div class="lim">Limit: ${esc(limits)}</div>` : ''}</th>`
    }),
    ...(showResult ? ['<th class="res">Result</th>'] : []),
  ].join('')

  const sorted = entries ? [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at)) : null
  const body = sorted
    ? sorted.length
      ? sorted
          .map((e, i) => {
            const cells = cols.map((c) => {
              const v = e.data[c.key]
              const ok = c.col_type === 'spec' || c.col_type === 'formula' ? withinLimits(c, v) : null
              const fail = ok === false || (c.col_type === 'pass_fail' && String(v).toLowerCase() === 'fail')
              return `<td${fail ? ' class="fail"' : ''}>${esc(cellText(c, v, input.links ?? {}))}</td>`
            })
            const result = e.result === 'pass' ? 'Pass' : e.result === 'fail' ? 'Fail' : ''
            return `<tr><td class="sno">${i + 1}</td><td class="date">${esc(formatDisplayDate(e.entry_date))}</td><td>${esc(e.ref_no ?? '')}</td>${cells.join('')}${
              showResult ? `<td class="res${e.result === 'fail' ? ' fail' : ''}">${result}</td>` : ''
            }</tr>`
          })
          .join('')
      : `<tr><td colspan="${total}" class="empty">No entries in this period.</td></tr>`
    : Array.from({ length: s.blank_rows }, (_, i) => `<tr class="blank"><td class="sno">${i + 1}</td>${'<td></td>'.repeat(total - 1)}</tr>`).join('')

  const from = input.period?.from ? formatDisplayDate(input.period.from) : ''
  const to = input.period?.to ? formatDisplayDate(input.period.to) : ''
  const period = entries
    ? from || to
      ? `Period: ${from || 'Start'} to ${to || 'Today'}`
      : 'Period: All Entries'
    : 'Period: ____________ to ____________'

  const meta = [
    header.licence ? `<span><b>Licence No:</b> ${esc(header.licence)}</span>` : '',
    header.isLabel ? `<span><b>IS:</b> ${esc(header.isLabel)}${header.isTitle ? ` — ${esc(header.isTitle)}` : ''}</span>` : '',
    `<span><b>Section:</b> ${esc(section.name)}</span>`,
  ]
    .filter(Boolean)
    .join('')

  const signs = s.signatures.length
    ? `<div class="signs">${s.signatures.map((x) => `<div class="sign"><div class="line"></div>${esc(x)}</div>`).join('')}</div>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: ${fontPx}px; }
  .top { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 6px; }
  .company { font-size: ${fontPx + 6}px; font-weight: 700; }
  .addr { color: #333; margin-top: 2px; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 4px; }
  h1 { font-size: ${fontPx + 4}px; text-align: center; margin: 6px 0 2px; text-transform: uppercase; letter-spacing: .04em; }
  .sub { text-align: center; color: #333; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; table-layout: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #444; padding: 3px 4px; vertical-align: top; text-align: left; word-break: break-word; }
  th { background: #eee; font-weight: 700; }
  .lim { font-weight: 400; color: #444; font-size: ${fontPx - 1}px; margin-top: 1px; }
  .sno { width: 3.2em; text-align: center; }
  .date { white-space: nowrap; }
  .res { text-align: center; }
  .fail { font-weight: 700; color: #b91c1c; }
  tr.blank td { height: ${landscape ? 7 : 8}mm; }
  .empty { text-align: center; color: #555; padding: 10px; }
  .signs { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; page-break-inside: avoid; }
  .sign { flex: 1; text-align: center; }
  .sign .line { border-top: 1px solid #111; margin: 0 8px 3px; height: 0; }
  .foot { margin-top: 10px; color: #666; font-size: ${fontPx - 1}px; display: flex; justify-content: space-between; }
  @media print { th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="top">
    <div class="company">${esc(header.company || '—')}</div>
    ${header.address ? `<div class="addr">${esc(header.address)}</div>` : ''}
    <div class="meta">${meta}</div>
  </div>
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(period)}${s.note ? ` &nbsp;·&nbsp; ${esc(s.note)}` : ''}</div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${signs}
  <div class="foot"><span>${entries ? `${sorted?.length ?? 0} Entries` : 'Blank Register'}</span><span>Printed on ${esc(new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</span></div>
</body>
</html>`
}
