import { formatDisplayDate } from '@/features/bis/projects/types'
import type { PortalEntry, PortalLinkOption } from './portalApi'
import { cellText, linkLabel, REF_LABEL } from './recordDisplay'
import { limitsText, passFailWords, withinLimits, type RecordColumn } from './recordLogic'
import { printSettingsOf, type PrintHeader, type PrintSection } from './recordPrint'

/*
 * Batch Test Certificate (owner, 25 Nov 2026: "Batch Test Certificate"). One printed certificate per entry of a
 * Batch / Lot section: the batch's own details, the raw material lots it links to, and the results of the Final
 * Testing (and In-Process) entries that belong to it, with each test's limit and Pass / Fail, then the conclusion
 * against the licence's IS. Browser print, so "Save as PDF" works.
 *
 * Which test entries belong to the batch: the ones the batch entry picks in its Link columns (the usual setup), then
 * test entries that link back to the batch, then test entries whose Sample / Batch No is the batch's number.
 */

/** A test section and the entries of it that belong to the batch. */
export type CertificateGroup = {
  section: PrintSection & { id: string }
  entries: PortalLinkOption[]
  /** Option lists of the section's own Link columns, for their text. */
  links: Record<string, PortalLinkOption[]>
}

export const CERTIFICATE_SIGNATURES = ['Tested By', 'Checked By', 'Authorised Signatory']

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Pass / Fail of one value against its column, or '' when the column judges nothing. */
export function columnVerdict(col: RecordColumn, value: unknown): 'Pass' | 'Fail' | '' {
  if (value == null || value === '') return ''
  if (col.col_type === 'spec' || col.col_type === 'formula') {
    const ok = withinLimits(col, value)
    return ok == null ? '' : ok ? 'Pass' : 'Fail'
  }
  if (col.col_type === 'pass_fail') {
    const v = String(value).toLowerCase()
    return v === 'pass' ? 'Pass' : v === 'fail' ? 'Fail' : ''
  }
  if (col.col_type === 'select' && col.config.fail_options?.length) {
    const picked = (Array.isArray(value) ? value : [value]).map(String)
    return picked.some((p) => col.config.fail_options!.includes(p)) ? 'Fail' : 'Pass'
  }
  return ''
}

/** What the limit of a test reads as on the certificate. */
function requirementText(col: RecordColumn): string {
  if (col.col_type === 'spec' || col.col_type === 'formula') return limitsText({ ...col, unit: null })
  if (col.col_type === 'pass_fail') return passFailWords(col.config)[0]
  if (col.col_type === 'select' && col.config.fail_options?.length) {
    const good = (col.config.options ?? []).filter((o) => !col.config.fail_options!.includes(o))
    return good.join(' / ')
  }
  return ''
}

/** Overall verdict of the batch from its test entries. */
export function certificateVerdict(groups: CertificateGroup[]): 'conforms' | 'fails' | 'none' {
  const all = groups.flatMap((g) => g.entries)
  if (!all.length) return 'none'
  const anyFail = groups.some((g) =>
    g.entries.some((e) => e.result === 'fail' || g.section.columns.some((c) => columnVerdict(c, e.data?.[c.key]) === 'Fail')),
  )
  return anyFail ? 'fails' : 'conforms'
}

export function buildTestCertificateHtml(input: {
  header: PrintHeader
  /** The Batch / Lot section and the batch entry. */
  batchSection: PrintSection
  batch: PortalEntry
  /** Option lists of the batch section's Link columns (raw material lots, tests), keyed by target section id. */
  batchLinks: Record<string, PortalLinkOption[]>
  /** Ids of the sections whose entries are tests (shown in the results, not in the batch details). */
  testSectionIds: string[]
  groups: CertificateGroup[]
}): string {
  const { header, batchSection, batch, batchLinks, groups } = input
  const batchSettings = printSettingsOf(batchSection.print_settings)
  const batchNo = batch.ref_no?.trim() || formatDisplayDate(batch.entry_date)
  const today = new Date()
  const certNo = `TC/${batchNo.replace(/\s+/g, '')}/${today.getFullYear()}`

  // The batch's details: its own columns, except the links to test sections (those are the results below).
  const details: Array<[string, string]> = [
    [REF_LABEL.batch ?? 'Batch No', batchNo],
    ['Batch Date', formatDisplayDate(batch.entry_date)],
  ]
  for (const c of batchSection.columns) {
    if (batchSettings.hidden_columns.includes(c.key) || c.col_type === 'attachment') continue
    if (c.col_type === 'link' && input.testSectionIds.includes(c.config.section_id ?? '')) continue
    const text = cellText(c, batch.data[c.key], batchLinks)
    if (!text) continue
    details.push([`${c.label}${c.unit && c.col_type !== 'link' ? ` (${c.unit})` : ''}`, text])
  }

  let rowNo = 0
  const resultBlocks = groups
    .filter((g) => g.entries.length)
    .map((g) => {
      const settings = printSettingsOf(g.section.print_settings)
      const cols = g.section.columns.filter((c) => !settings.hidden_columns.includes(c.key) && c.col_type !== 'link' && c.col_type !== 'attachment')
      return g.entries
        .map((e) => {
          const refLabel = REF_LABEL[g.section.kind] ?? 'Ref No'
          const lines = cols
            .map((c) => {
              const v = e.data?.[c.key]
              const text = cellText(c, v, g.links)
              if (!text) return ''
              const verdict = columnVerdict(c, v)
              rowNo += 1
              return `<tr><td class="sno">${rowNo}</td><td>${esc(c.label)}</td><td class="c">${esc(c.unit ?? '')}</td><td class="c">${esc(requirementText(c))}</td><td class="c">${esc(text)}</td><td class="c${verdict === 'Fail' ? ' fail' : ''}">${verdict}</td></tr>`
            })
            .filter(Boolean)
            .join('')
          const result = e.result === 'pass' ? 'Pass' : e.result === 'fail' ? 'Fail' : ''
          const title = `${esc(g.section.name)} — ${esc(refLabel)}: ${esc(linkLabel(e))}${result ? ` · <span class="${e.result === 'fail' ? 'fail' : 'pass'}">${result}</span>` : ''}`
          return `<tr class="group"><td colspan="6">${title}</td></tr>${lines || '<tr><td colspan="6" class="empty">No test values recorded.</td></tr>'}`
        })
        .join('')
    })
    .join('')

  const verdict = certificateVerdict(groups)
  const isText = header.isLabel ? `${header.isLabel}${header.isTitle ? ` (${header.isTitle})` : ''}` : 'the applicable Indian Standard'
  const conclusion =
    verdict === 'conforms'
      ? `The above batch has been tested and <b>conforms</b> to the requirements of ${esc(isText)}.`
      : verdict === 'fails'
        ? `<span class="fail">The above batch <b>does not conform</b> to the requirements of ${esc(isText)}: see the tests marked Fail.</span>`
        : 'No test results are recorded for this batch yet.'

  const meta = [
    header.licence ? `<span><b>Licence No:</b> ${esc(header.licence)}</span>` : '',
    header.isLabel ? `<span><b>IS:</b> ${esc(header.isLabel)}${header.isTitle ? ` — ${esc(header.isTitle)}` : ''}</span>` : '',
  ]
    .filter(Boolean)
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Test Certificate ${esc(batchNo)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 11px; }
  .top { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
  .company { font-size: 18px; font-weight: 700; }
  .addr { color: #333; margin-top: 2px; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 4px; }
  h1 { font-size: 16px; text-align: center; margin: 8px 0 2px; text-transform: uppercase; letter-spacing: .08em; }
  .certno { display: flex; justify-content: space-between; margin: 6px 0 8px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #444; padding: 4px 5px; vertical-align: top; text-align: left; word-break: break-word; }
  th { background: #eee; font-weight: 700; }
  .details td.k { width: 32%; background: #f6f6f6; font-weight: 700; }
  h2 { font-size: 12px; margin: 12px 0 4px; text-transform: uppercase; letter-spacing: .04em; }
  .sno { width: 3em; text-align: center; }
  .c { text-align: center; }
  tr.group td { background: #f1ede4; font-weight: 700; }
  tr { page-break-inside: avoid; }
  .fail { color: #b91c1c; font-weight: 700; }
  .pass { color: #047857; font-weight: 700; }
  .empty { text-align: center; color: #555; }
  .conclusion { margin-top: 12px; padding: 8px 10px; border: 1px solid #444; }
  .signs { display: flex; justify-content: space-between; gap: 24px; margin-top: 44px; page-break-inside: avoid; }
  .sign { flex: 1; text-align: center; }
  .sign .line { border-top: 1px solid #111; margin: 0 8px 3px; height: 0; }
  .foot { margin-top: 12px; color: #666; font-size: 10px; display: flex; justify-content: space-between; }
  @media print { th, .details td.k, tr.group td { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="top">
    <div class="company">${esc(header.company || '—')}</div>
    ${header.address ? `<div class="addr">${esc(header.address)}</div>` : ''}
    <div class="meta">${meta}</div>
  </div>
  <h1>Test Certificate</h1>
  <div class="certno"><span>Certificate No: ${esc(certNo)}</span><span>Date: ${esc(formatDisplayDate(today.toISOString().slice(0, 10)))}</span></div>
  <table class="details"><tbody>${details.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
  <h2>Test Results</h2>
  <table>
    <thead><tr><th class="sno">S. No</th><th>Test</th><th class="c">Unit</th><th class="c">Requirement</th><th class="c">Result</th><th class="c">Remark</th></tr></thead>
    <tbody>${resultBlocks || '<tr><td colspan="6" class="empty">No test results are recorded for this batch yet.</td></tr>'}</tbody>
  </table>
  <div class="conclusion"><b>Conclusion:</b> ${conclusion}</div>
  <div class="signs">${CERTIFICATE_SIGNATURES.map((x) => `<div class="sign"><div class="line"></div>${esc(x)}</div>`).join('')}</div>
  <div class="foot"><span>${esc(batchSection.name)} · ${esc(batchNo)}</span><span>Printed on ${esc(today.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</span></div>
</body>
</html>`
}
