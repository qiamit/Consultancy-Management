import { formatCmA, formatCmL, formatDisplayDate, isLicenceKind, todayIsoDate } from '../projects/types'
import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import { PRINT_SCAN_FRIENDLY_OVERRIDE_CSS } from './printScanFriendlyCss'

export type PrintApplicantContext = {
  applicantName: string
  applicantAddress: string
  applicantEmail: string
  applicantPhone: string
  applicantGst: string
  contactPerson: string
  bisBranchName: string
  bisBranchState: string
  applicationNumber: string
  dateOfApplication: string
  dateOfInspection: string
  isNumber: string
  isTitle: string
  preparedBy: string
}

export function applicationNumberForProject(row: BisPrintData['row']): string {
  const licenseNumber = (row.license_number ?? '').trim()
  const validLicenseNumber = licenseNumber && !['N/A', '—'].includes(licenseNumber.toUpperCase())
  const licenseDigits = String(row.cm_l_digits ?? '').replace(/\D/g, '')
  const applicationDigits = String(row.application_number ?? '').replace(/\D/g, '')
  const isLicenceProject = isLicenceKind(row.project_kind)
  if (isLicenceProject) {
    if (validLicenseNumber) return licenseNumber
    if (licenseDigits) return formatCmL(licenseDigits)
  }
  if (applicationDigits) return formatCmA(applicationDigits)
  if (validLicenseNumber) return licenseNumber
  if (licenseDigits) return formatCmL(licenseDigits)
  return ''
}

export function applicantContextFromPrintData({ row, client, isCode, company }: BisPrintData): PrintApplicantContext {
  const address = [client.address, client.district, client.state, client.pinCode]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ')

  return {
    applicantName: client.companyName,
    applicantAddress: address,
    applicantEmail: client.email,
    applicantPhone: client.mobile,
    applicantGst: client.gstNumber,
    contactPerson: client.contactPerson,
    bisBranchName: (row.branch_name ?? '').trim(),
    bisBranchState: (row.branch_state ?? '').trim() || client.state,
    applicationNumber: applicationNumberForProject(row),
    // Only Application Details (`application_date`). Never start_date / created_at — those are project milestones, not Manak application date.
    dateOfApplication: (row.application_date ?? '').trim(),
    /** Application inspection date when set; otherwise empty (print helpers fall back to today). */
    dateOfInspection: (row.inspection_date ?? '').trim(),
    isNumber: isCode.label,
    isTitle: isCode.title,
    preparedBy: company.companyName,
  }
}

export function applicationNoDisplay(raw: string): string {
  const v = (raw ?? '').trim()
  if (!v || v.toUpperCase() === 'N/A' || v === '—') return 'CM/A - N/A'
  return v
}

export function addressWithIndia(address: string): string {
  const line = (address ?? '').trim()
  if (!line) return '______________________________, INDIA'
  return /\bindia\b/i.test(line) ? line : `${line}, INDIA`
}

export function bisBranchLine(branchName: string, state: string): string {
  const branch = branchName.trim() || '________________'
  const st = state.trim() || '________________'
  return `${esc(branch)}, ${esc(st)}, INDIA`
}

export function toBlockHtml(branchName: string, state: string, opts?: { omitDepartmentLine?: boolean }): string {
  const normalizedBranch = branchName
    .trim()
    .replace(/^Bureau of Indian Standards\s*[-–—:]\s*/i, '')
    .trim()
  const departmentLine = opts?.omitDepartmentLine ? '' : '<br/>Bureau of Indian Standards'
  return `To<br/>The Director &amp; Head${departmentLine}<br/>${bisBranchLine(normalizedBranch, state)}`
}

export function isStandardRefHtml(isNumber: string, isTitle: string): string {
  const num = (isNumber ?? '').trim()
  const title = (isTitle ?? '').trim()
  if (num && title) return `<strong>${esc(num)}</strong> — ${esc(title)}`
  if (num) return `<strong>${esc(num)}</strong>`
  if (title) return `<strong>${esc(title)}</strong>`
  return ''
}

/** Width of a `.pd-table` on an A4 portrait sheet, in CSS pixels (sheet width less its side padding). */
const TABLE_WIDTH_PX = 680
/** Cell padding and borders, with a little room so a one-line cell never wraps. */
const CELL_PADDING_PX = 20
/** A column whose text fits in this width on one line is set to that width (numbers, dates, batch numbers). */
const ONE_LINE_PX = 130
/** Used where the page cannot measure text (no canvas). */
const FALLBACK_CHAR_PX = 7

let measureContext: CanvasRenderingContext2D | null | undefined
/** Width of text in the table's printed font: 10pt Arial, bold for headers. */
function textWidth(text: string, bold = false): number {
  if (measureContext === undefined) {
    measureContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  if (!measureContext) return text.length * FALLBACK_CHAR_PX
  measureContext.font = `${bold ? '700 ' : ''}10pt Arial, Helvetica, "Liberation Sans", sans-serif`
  return measureContext.measureText(text).width
}

/** One line of the table text, and the cell's top + bottom padding and borders. */
const LINE_PX = 16
const CELL_PADDING_V_PX = 12
/** A vertical (turned) column: the side padding and borders around its line(s). */
const VERTICAL_PADDING_PX = 14
/** A layout must save at least this much height to be worth turning a column on its side. */
const VERTICAL_MIN_GAIN_PX = 8

const splitWords = (text: string) => text.split(/\s+/).filter(Boolean)

/** Lines a text takes when wrapped at its spaces into the given width. */
function wrappedLines(text: string, avail: number, bold = false): number {
  const list = splitWords(text)
  if (!list.length) return 1
  const space = textWidth(' ', bold)
  let lines = 1
  let used = 0
  for (const w of list) {
    const ww = textWidth(w, bold)
    if (used && used + space + ww > avail) {
      lines += 1
      used = ww
    } else used += (used ? space : 0) + ww
  }
  return lines
}

/** A header turned on its side may take two lines: split where the longer line is shortest. */
function verticalHeaderParts(header: string): string[] {
  const list = splitWords(header)
  if (list.length < 2) return [header.trim()]
  let best = [header.trim()]
  let bestLength = textWidth(header, true)
  for (let cut = 1; cut < list.length; cut += 1) {
    const parts = [list.slice(0, cut).join(' '), list.slice(cut).join(' ')]
    const length = Math.max(...parts.map((part) => textWidth(part, true)))
    if (length < bestLength) {
      best = parts
      bestLength = length
    }
  }
  return best
}

export type ContentFitLayout = {
  /** <colgroup> with percentage widths. */
  colgroup: string
  /** Columns shown on their side (vertical text), and the header lines to use for them. */
  vertical: boolean[]
  verticalHeader: string[][]
}

/**
 * Lays a table out by its content so rows stay as low as possible.
 * - Short columns (numbers, dates, batch numbers) get just what their text needs on one line.
 * - Long-text columns share the rest so they wrap to the same number of lines. No column is narrower than its
 *   longest word.
 * - When the long text would still make tall rows, short columns may be turned on their side (vertical text), which
 *   gives their width to the long columns. Every combination is tried and the one with the lowest table height wins.
 * headers and rows are plain text (not HTML).
 */
export function contentFitTable(headers: string[], rows: string[][]): ContentFitLayout {
  const columns = headers.map((header, c) => {
    const cells = rows.map((r) => String(r[c] ?? '').trim())
    const longestWord = Math.max(...splitWords(header).map((w) => textWidth(w, true)), ...cells.flatMap(splitWords).map((w) => textWidth(w)), 1)
    const oneLine = Math.max(longestWord, ...cells.map((t) => textWidth(t)))
    const amount = Math.max(textWidth(header, true), ...cells.map((t) => textWidth(t)))
    // A line wraps before a word that does not fit, so on average half a word per line is left empty.
    const allWords = cells.flatMap(splitWords)
    const halfWord = allWords.length ? allWords.reduce((sum, w) => sum + textWidth(`${w} `), 0) / allWords.length / 2 : 0
    const parts = verticalHeaderParts(header)
    return { header, cells, longestWord, oneLine, amount, halfWord, short: oneLine <= ONE_LINE_PX, parts }
  })
  const long = columns.map((col, i) => (col.short ? -1 : i)).filter((i) => i >= 0)
  const shortCols = columns.map((col, i) => (col.short ? i : -1)).filter((i) => i >= 0)

  /** Widths and table height when the columns in `vertical` are turned on their side. */
  const tryLayout = (vertical: boolean[]) => {
    const width = columns.map((col, i) =>
      vertical[i] ? col.parts.length * LINE_PX + VERTICAL_PADDING_PX : (col.short ? col.oneLine : col.longestWord) + CELL_PADDING_PX,
    )
    const fixed = columns.reduce((sum, col, i) => sum + (col.short ? width[i] : 0), 0)
    const widthFor = (i: number, lines: number) =>
      Math.max(columns[i].longestWord, columns[i].amount / lines + columns[i].halfWord) + CELL_PADDING_PX
    if (long.length) {
      let low = 1
      let high = 200
      for (let step = 0; step < 40; step += 1) {
        const lines = (low + high) / 2
        if (long.reduce((sum, i) => sum + widthFor(i, lines), 0) > TABLE_WIDTH_PX - fixed) low = lines
        else high = lines
      }
      for (const i of long) width[i] = widthFor(i, high)
    }
    const spare = TABLE_WIDTH_PX - width.reduce((a, b) => a + b, 0)
    if (spare > 0 && !long.length) width.forEach((_, i) => (width[i] += spare / width.length))
    // Fit to the page when the minimums are wider than it.
    const scale = Math.min(1, TABLE_WIDTH_PX / width.reduce((a, b) => a + b, 0))
    const final = width.map((w) => w * scale)
    const cellHeight = (text: string, i: number, bold: boolean, vText: string[]) =>
      vertical[i]
        ? Math.max(...vText.map((t) => textWidth(t, bold))) + CELL_PADDING_V_PX
        : wrappedLines(text, final[i] - CELL_PADDING_PX, bold) * LINE_PX + CELL_PADDING_V_PX
    const headerHeight = Math.max(...columns.map((col, i) => cellHeight(col.header, i, true, col.parts)))
    const rowsHeight = rows.reduce(
      (sum, _, r) => sum + Math.max(...columns.map((col, i) => cellHeight(col.cells[r], i, false, [col.cells[r]]))),
      0,
    )
    return { width: final, height: headerHeight + rowsHeight }
  }

  const none = columns.map(() => false)
  let best = { vertical: none, ...tryLayout(none) }
  // Only worth it when long text is there to gain the width; each extra turned column must save height.
  if (long.length && rows.length) {
    for (let mask = 1; mask < 2 ** shortCols.length; mask += 1) {
      const vertical = columns.map((_, i) => shortCols.some((c, k) => c === i && mask & (2 ** k)))
      const layout = tryLayout(vertical)
      const turned = vertical.filter(Boolean).length
      const bestTurned = best.vertical.filter(Boolean).length
      const gain = best.height - layout.height
      if (gain > VERTICAL_MIN_GAIN_PX * Math.max(1, turned - bestTurned) || (gain >= 0 && turned < bestTurned)) best = { vertical, ...layout }
    }
  }
  const total = best.width.reduce((a, b) => a + b, 0)
  return {
    colgroup: `<colgroup>${best.width.map((w) => `<col style="width:${((w / total) * 100).toFixed(1)}%"/>`).join('')}</colgroup>`,
    vertical: best.vertical,
    verticalHeader: columns.map((col) => col.parts),
  }
}

/** Styles for turned (vertical) cells of a contentFitTable layout: text reads bottom to top. */
export const CONTENT_FIT_TABLE_CSS = `
  .pd-table .pd-vcell { padding: 6px 2px; }
  .pd-table .pd-vtext { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; line-height: 16px; text-align: center; }
`

export function letterheadHtml(ctx: PrintApplicantContext): string {
  const parts: string[] = []
  if (ctx.applicantPhone.trim()) {
    parts.push(`<span class="pd-lh-phone">Tel: ${esc(ctx.applicantPhone)}</span>`)
  }
  if (ctx.applicantEmail.trim()) {
    parts.push(`<span class="pd-lh-email">Email: ${esc(ctx.applicantEmail)}</span>`)
  }
  if (ctx.applicantGst.trim()) {
    parts.push(`<span class="pd-lh-gst">GSTIN: ${esc(ctx.applicantGst)}</span>`)
  }
  const contact = parts.join('')

  return `
<div class="pd-letterhead">
  <div class="pd-firm">${esc(ctx.applicantName || 'Applicant Firm')}</div>
  ${ctx.applicantAddress ? `<div class="pd-firm-addr">${esc(ctx.applicantAddress)}</div>` : ''}
  ${contact ? `<div class="pd-firm-contact">${contact}</div>` : ''}
</div>`
}

export function signatoryHtml(opts: {
  firmName: string
  name: string
  designation: string
  dateLine?: string
  signatureImageUrl?: string
}): string {
  const img = (opts.signatureImageUrl ?? '').trim()
  const signSpace = img
    ? `<div class="pd-sign-space"><img class="pd-sign-img" src="${esc(img)}" alt="Authorized signature" /></div>`
    : `<div class="pd-sign-space"></div>`
  const name = (opts.name || '—').trim() || '—'
  const desig = (opts.designation || '').trim()
  // Designation sits on its own line right under the name, aligned with it.
  return `
<div class="pd-signatory">
  <div class="pd-for">For <strong>${esc(opts.firmName)}</strong></div>
  ${signSpace}
  <div class="pd-sign-line"></div>
  <div><strong>${esc(name)}</strong></div>
  ${desig ? `<div class="pd-sign-designation">${esc(desig)}</div>` : ''}
  ${opts.dateLine ? `<div>${opts.dateLine}</div>` : ''}
</div>`
}

/** Intentionally empty — "Prepared by …" must not appear on any BIS document. */
export function preparedByHtml(_preparedBy: string): string {
  return ''
}

function padPageNo(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Strip any leftover "Prepared by …" footers and inject "Page 01 of 02"
 * at the bottom of every `.pd-sheet` / `.al-sheet` / `.f1-sheet`.
 */
export function injectBisDocumentPageFooters(html: string): string {
  let out = html
    .replace(/<div class="(?:pd|al)-prepared\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<p class="f1-prepared\b[^"]*"[^>]*>[\s\S]*?<\/p>/gi, '')
    .replace(/<div class="(?:pd|al|f1)-page-num\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')

  const sheetOpenRe = /<div class="((?:pd|al|f1)-sheet)\b[^"]*"[^>]*>/gi
  const opens: number[] = []
  let m: RegExpExecArray | null
  while ((m = sheetOpenRe.exec(out)) !== null) {
    opens.push(m.index + m[0].length)
  }
  const total = opens.length
  if (total === 0) return out
  const continuationPageNumbering = /class="[^"]*\bc(?:305|306)-page-one\b/.test(out)

  const inserts: { at: number; footer: string }[] = []
  for (let i = 0; i < opens.length; i += 1) {
    if (continuationPageNumbering && i === 0) continue
    let depth = 1
    let pos = opens[i]
    while (pos < out.length && depth > 0) {
      const nextOpen = out.indexOf('<div', pos)
      const nextClose = out.indexOf('</div>', pos)
      if (nextClose === -1) break
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1
        pos = nextOpen + 4
      } else {
        depth -= 1
        if (depth === 0) {
          inserts.push({
            at: nextClose,
            footer: `<div class="pd-page-num">Page ${padPageNo(i + 1)} of ${padPageNo(total)}</div>`,
          })
          break
        }
        pos = nextClose + 6
      }
    }
  }

  for (let i = inserts.length - 1; i >= 0; i -= 1) {
    const { at, footer } = inserts[i]
    out = `${out.slice(0, at)}${footer}${out.slice(at)}`
  }
  return out
}

export function dateOrNa(raw: string): string {
  const v = (raw ?? '').trim()
  return v ? formatDisplayDate(v) : 'N/A'
}

/**
 * Date of Inspection for print:
 * - if application inspection date is set → always that date
 * - if not set → today's date
 */
export function inspectionDateOrToday(raw: string | null | undefined): string {
  const v = (raw ?? '').trim()
  return formatDisplayDate(v || todayIsoDate())
}

/** Applicant / application meta grid used at the top of CMPF Form-style documents. */
export function applicationMetaTableHtml(ctx: PrintApplicantContext): string {
  return `
<table class="pd-meta">
  <tr><td class="pd-lbl">Applicant Name</td><td colspan="3"><strong>${esc(ctx.applicantName || '—')}</strong></td></tr>
  <tr><td class="pd-lbl">Applicant Address</td><td colspan="3">${esc(addressWithIndia(ctx.applicantAddress))}</td></tr>
  <tr>
    <td class="pd-lbl">Application No.</td><td>${esc(applicationNoDisplay(ctx.applicationNumber))}</td>
    <td class="pd-lbl">Date of Application</td><td>${esc(dateOrNa(ctx.dateOfApplication))}</td>
  </tr>
  <tr>
    <td class="pd-lbl">IS Code</td><td>${esc(ctx.isNumber || '—')}</td>
    <td class="pd-lbl">Date of Inspection</td><td>${esc(inspectionDateOrToday(ctx.dateOfInspection))}</td>
  </tr>
</table>`
}

export function blankTableRows(
  count: number,
  columns: number,
  opts?: { leftColumn?: number; unnumbered?: boolean },
): string {
  const rows: string[] = []
  for (let i = 0; i < count; i += 1) {
    const cells = [`<td>${opts?.unnumbered ? '&nbsp;' : i + 1}</td>`]
    for (let c = 1; c < columns; c += 1) {
      cells.push(`<td${opts?.leftColumn === c ? ' class="pd-left"' : ''}>&nbsp;</td>`)
    }
    rows.push(`<tr>${cells.join('')}</tr>`)
  }
  return rows.join('')
}

export function cmpfDeclarationHtml(opts: {
  firmParagraphs: string[]
  bisParagraphs: string[]
  repName: string
  repDesignation: string
  officerName: string
  officerDesignation: string
  date: string
}): string {
  const paras = (list: string[], align = 'justify') =>
    list.map((p) => `<p style="text-align:${align}">${esc(p)}</p>`).join('')
  return `
<table class="cmpf-decl">
  <tr>
    <td>
      ${paras(opts.firmParagraphs)}
      <div class="cmpf-sig">
        <div>Sig. of Firm's Representative :-</div>
        <div class="cmpf-sig-gap"></div>
        <div>Name :- ${esc(opts.repName.trim() || '—')}</div>
        <div>Designation :- ${esc(opts.repDesignation.trim() || '—')}</div>
        <div>Date :- ${esc(opts.date)}</div>
      </div>
    </td>
    <td>
      ${paras(opts.bisParagraphs, 'right')}
      <div class="cmpf-sig" style="text-align:right">
        <div>Sig. of BIS Certification Officer :-</div>
        <div class="cmpf-sig-gap"></div>
        <div>Name :- ${esc(opts.officerName.trim() || '----')}</div>
        <div>Designation :- ${esc(opts.officerDesignation.trim() || '----')}</div>
        <div>Date :- ${esc(opts.date)}</div>
      </div>
    </td>
  </tr>
</table>`
}

/** Common styles for CMPF-style forms (form id, intro blocks, declaration boxes). */
export const CMPF_FORM_STYLES = `
  .cmpf-form-id { text-align: right; font-weight: 700; font-size: 12px; margin-bottom: 4px; color: #000; }
  .cmpf-to { font-size: 12.5px; line-height: 1.45; margin: 6px 0 4px; color: #000; }
  .cmpf-heading { margin: 10px 0 6px; font-size: 12.5px; font-weight: 700; color: #000; }
  .cmpf-terms p, .cmpf-decls p { margin: 5px 0; font-size: 12px; line-height: 1.45; text-align: justify; break-inside: avoid; page-break-inside: avoid; color: #000; }
  .cmpf-box { border: 1.25px solid #000; min-height: 14mm; padding: 6px 8px; font-size: 12px; margin-bottom: 8px; color: #000; }
  .cmpf-decl { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 6px; page-break-inside: avoid; break-inside: avoid; }
  .cmpf-decl td { border: 1.25px solid #000; vertical-align: top; padding: 6px 8px; width: 50%; font-size: 12px; line-height: 1.4; color: #000; }
  .cmpf-decl p { margin: 0 0 6px; }
  .cmpf-sig { margin-top: 10px; font-size: 12px; line-height: 1.5; color: #000; }
  .cmpf-sig-gap { height: 14mm; }
  .cmpf-footnote { font-size: 11px; font-weight: 700; line-height: 1.4; text-align: justify; margin: 6px 0 0; color: #000; }
  .cmpf-sign-right {
    margin-top: 8px;
    width: 100%;
    display: flex;
    justify-content: flex-end;
    text-align: right;
  }
  .cmpf-sign-right .pd-signatory { text-align: right; margin-left: auto; }
  .cmpf-sign-right .pd-sign-space { justify-content: flex-end; }
  .cmpf-sign-right .pd-sign-line { margin-left: auto; }
  .pd-for { margin: 0 0 1px; }
  .pd-sign-space { height: 12mm; display: flex; align-items: flex-end; justify-content: flex-start; }
  .pd-sign-img { max-height: 11mm; max-width: 48mm; object-fit: contain; }
  .cmpf-table td { height: 7mm; }
`

/**
 * Print + scan friendly typography:
 * - Clear sans body (survives photocopy / phone scan better than thin serif)
 * - Larger table/body sizes, pure black text, stronger borders
 */
export const PRINT_SCAN_FRIENDLY_CSS = `
  .pd-sheet, .al-sheet, .f1-sheet {
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif !important;
    color: #000 !important;
    background: #fff !important;
    font-size: 13.5px !important;
    line-height: 1.5 !important;
    text-rendering: geometricPrecision;
  }
  .pd-sheet img, .al-sheet img, .f1-sheet img {
    max-width: 100%;
    height: auto;
    object-fit: contain;
  }
  .pd-firm, .al-firm {
    font-family: "Times New Roman", Times, "Liberation Serif", serif !important;
    color: #000 !important;
    font-weight: 700 !important;
  }
  .pd-firm-addr, .al-firm-addr,
  .pd-firm-contact, .al-firm-contact {
    color: #111 !important;
    font-weight: 500 !important;
  }
  .pd-title, .al-title {
    font-size: 16px !important;
    font-weight: 700 !important;
    color: #000 !important;
  }
  .pd-body, .al-body, .pd-to-block, .al-to-block,
  .pd-date-block, .al-date-block, .pd-signatory, .al-signatory,
  .proc-points, .proc-points p, .proc-points strong,
  .ug-points, .ug-points p, .u2-conditions, .u2-conditions p {
    color: #000 !important;
    -webkit-text-fill-color: #000 !important;
  }
  /* Scan-legible body text: large enough and dark enough to read after print → seal / sign → scan. */
  .pd-body, .al-body, .pd-to-block, .al-to-block, .pd-date-block, .al-date-block {
    font-size: 13.5px !important;
    font-weight: 500 !important;
    line-height: 1.55 !important;
  }
  .proc-points p, .ug-points p, .u2-conditions p {
    font-size: 13.5px !important;
    font-weight: 500 !important;
    line-height: 1.6 !important;
  }
  .pd-meta td, .pd-table th, .pd-table td,
  .al-sheet table th, .al-sheet table td {
    font-size: 12.5px !important;
    color: #000 !important;
    border-color: #000 !important;
    border-width: 1.25px !important;
    padding: 4px 6px !important;
  }
  .pd-table th, .pd-meta td.pd-lbl {
    font-weight: 700 !important;
    background: #f0f0f0 !important;
  }
  .pd-note, .pd-seal-note, .al-seal-note, .al-sign-label {
    font-size: 11.5px !important;
    color: #222 !important;
  }
  .pd-page-num {
    font-size: 10.5px !important;
    color: #222 !important;
    border-top: 1.25px solid #666 !important;
    font-weight: 600 !important;
  }
  @media print {
    html, body {
      background: #fff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .pd-sheet, .al-sheet, .f1-sheet {
      background: #fff !important;
      color: #000 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .pd-sheet *, .al-sheet *, .f1-sheet * {
      color: #000 !important;
      -webkit-text-fill-color: #000 !important;
    }
    .pd-firm-addr, .al-firm-addr, .pd-firm-contact, .al-firm-contact,
    .pd-note, .pd-seal-note, .al-seal-note, .pd-page-num {
      color: #111 !important;
      -webkit-text-fill-color: #111 !important;
    }
    .pd-table th, .pd-meta td.pd-lbl {
      background: #f0f0f0 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .proc-points p, .ug-points p, .u2-conditions p, .pd-body, .al-body {
      font-weight: 500 !important;
    }
  }
`

/**
 * Every printed page sheet: 2 mm inner padding + double-line border on all 4 sides.
 * Applied to `.pd-sheet`, `.al-sheet`, and `.f1-sheet`.
 */
export const PRINT_PAGE_FRAME_CSS = `
  .pd-sheet, .al-sheet, .f1-sheet {
    position: relative;
    border: 2.5pt double #000;
    padding: 2mm !important;
    box-sizing: border-box;
  }
  .pd-prepared, .al-prepared, .f1-prepared { display: none !important; }
  /* Fixed page footer — always at physical bottom of each sheet. */
  .pd-page-num {
    position: absolute;
    left: 2mm;
    right: 2mm;
    bottom: 2mm;
    margin: 0;
    font-size: 10.5px;
    color: #222;
    text-align: right;
    border-top: 1.25px solid #666;
    padding-top: 4px;
    background: #fff;
    z-index: 2;
    font-weight: 600;
  }
  @media print {
    .pd-sheet, .al-sheet, .f1-sheet {
      max-width: none !important;
      border: 2.5pt double #000 !important;
      padding: 2mm !important;
      min-height: 100vh;
    }
  }
  ${PRINT_SCAN_FRIENDLY_CSS}
  .pd-sheet + .pd-sheet,
  .pd-sheet + .al-sheet,
  .al-sheet + .pd-sheet,
  .al-sheet + .al-sheet,
  .f1-sheet + .f1-sheet {
    /* Always 3 mm visual gap between consecutive pages (screen + continuous print). */
    margin-top: 3mm;
    page-break-before: always;
    break-before: page;
  }
  @media print {
    .pd-sheet + .pd-sheet,
    .pd-sheet + .al-sheet,
    .al-sheet + .pd-sheet,
    .al-sheet + .al-sheet,
    .f1-sheet + .f1-sheet {
      margin-top: 0;
    }
  }
`

/** Append a second print HTML document's body (+ styles) into the first. */
export function appendPrintHtmlDocument(baseHtml: string, extraHtml: string): string {
  const bodyMatch = extraHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  if (!bodyMatch) return baseHtml
  const styleBlocks = [...extraHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
  let out = baseHtml
  const printBreakStyle = '<style class="bis-document-page-break">@media print{.merged-print-next{break-before:page!important;page-break-before:always!important}}</style>'
  if (!/class=["'][^"']*bis-document-page-break/.test(out)) {
    if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `${printBreakStyle}</head>`)
    else out = `${printBreakStyle}${out}`
  }
  if (styleBlocks.length > 0) {
    const injected = styleBlocks.map((css) => `<style>${css}</style>`).join('')
    if (/<\/head>/i.test(out)) {
      out = out.replace(/<\/head>/i, `${injected}</head>`)
    } else {
      out = `${injected}${out}`
    }
  }
  const separatedBody = `<section class="merged-print-next" style="break-before:page!important;page-break-before:always!important">${bodyMatch[1]}</section>`
  if (/<\/body>/i.test(out)) {
    return out.replace(/<\/body>/i, `${separatedBody}</body>`)
  }
  return `${out}${separatedBody}`
}

export function buildPrintPage(opts: { title: string; styles: string; body: string; landscape?: boolean }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(opts.title)}</title>
  <style>
    @page { size: A4 ${opts.landscape ? 'landscape' : 'portrait'}; margin: 5mm 8mm 5mm 11mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .pd-sheet {
      font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
      color: #000;
      font-size: 13px;
      line-height: 1.45;
      max-width: ${opts.landscape ? '267mm' : '180mm'};
      margin: 0 auto;
      padding: 2mm;
    }
    ${PRINT_PAGE_FRAME_CSS}
    .pd-letterhead { text-align: center; border-bottom: 2px solid #b45309; padding-bottom: 8px; margin-bottom: 12px; }
    .pd-firm { font-family: "Times New Roman", Times, serif; font-size: 20px; font-weight: 700; letter-spacing: 0.03em; color: #000; text-transform: uppercase; }
    .pd-firm-addr { font-size: 12.5px; margin-top: 3px; color: #111; font-weight: 500; }
    .pd-firm-contact { font-size: 11.5px; margin-top: 3px; color: #111; font-weight: 500; }
    .pd-title { text-align: center; font-size: 16px; font-weight: 700; text-decoration: underline; margin: 0 0 12px; color: #000; }
    .pd-to-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
    .pd-to-block { line-height: 1.5; color: #000; }
    .pd-date-block { text-align: right; line-height: 1.6; white-space: nowrap; color: #000; }
    .pd-meta { width: 100%; border-collapse: collapse; margin: 0 0 10px; table-layout: fixed; }
    .pd-meta td { border: 1.25px solid #000; padding: 4px 6px; font-size: 12px; vertical-align: middle; color: #000; }
    .pd-meta td.pd-lbl { font-weight: 700; background: #f0f0f0; width: 18%; }
    .pd-body { margin: 0 0 10px; text-align: justify; color: #000; }
    .pd-table { width: 100%; border-collapse: collapse; table-layout: auto; margin: 6px 0 10px; }
    .pd-table th, .pd-table td { border: 1.25px solid #000; padding: 4px 6px; font-size: 12px; vertical-align: middle; text-align: center; color: #000; }
    .pd-table th { background: #f0f0f0; font-weight: 700; line-height: 1.25; }
    .pd-table td.pd-left { text-align: left; }
    .pd-table tr { page-break-inside: avoid; break-inside: avoid; }
    .pd-table thead { display: table-header-group; }
    .pd-note { font-size: 11.5px; margin: 4px 0 8px; color: #222; }
    .pd-signatory { margin-top: 4px; min-width: 70mm; display: inline-block; line-height: 1.35; text-align: right; }
    .pd-for { margin: 0 0 1px; }
    .pd-sign-row { text-align: right; }
    .pd-sign-space { height: 12mm; display: flex; align-items: flex-end; justify-content: flex-end; }
    .pd-sign-img {
      max-height: 11mm;
      max-width: 48mm;
      object-fit: contain;
      background: transparent;
      mix-blend-mode: multiply;
    }
    .pd-sign-line {
      display: block;
      border-top: 1px solid #111;
      width: 48mm;
      max-width: 100%;
      margin: 1px 0 2px auto;
      box-sizing: border-box;
    }
    .pd-seal-note { font-size: 11px; color: #222; margin: 2px 0 4px; }
    .pd-prepared { display: none !important; }
    .pd-page-num {
      position: absolute;
      left: 2mm;
      right: 2mm;
      bottom: 2mm;
      margin: 0;
      font-size: 10.5px;
      color: #222;
      text-align: right;
      border-top: 1.25px solid #666;
      padding-top: 4px;
      background: #fff;
      z-index: 2;
      font-weight: 600;
    }
    .pd-signatory { break-inside: avoid; page-break-inside: avoid; }
    .pd-body { break-inside: auto; page-break-inside: auto; }
    ${opts.styles}
    ${PRINT_SCAN_FRIENDLY_OVERRIDE_CSS}
  </style>
</head>
<body>
${opts.body}
</body>
</html>`
}
