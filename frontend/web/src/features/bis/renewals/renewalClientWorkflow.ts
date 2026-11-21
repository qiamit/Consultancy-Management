import * as XLSX from 'xlsx'
import { renderPdfViaPlaywright, triggerPdfDownload } from '@/lib/playwrightPdfClient'
import { blobToBase64, sendAppEmail } from '@/lib/sendAppEmail'
import { supabase } from '@/lib/supabaseClient'
import { resolveClientEmail } from '../shared/emailHtmlToClient'
import { calculateRenewalProductionRow, formatDisplayDate, renewalMarkingFeeSummary, renewalSlabBands, renewalSlabForQuantity, type BisRenewalForm, type RenewalProductionRow } from './types'

const SHEET_NAME = 'Production Data'
const normalize = (value: unknown) => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')

function safeBaseName(value: string): string {
  return value.trim().replace(/[^a-z0-9-]+/gi, '_').replace(/^_+|_+$/g, '') || 'BIS_Renewal'
}

function amount(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.replace(/[₹,\s]/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid non-negative number: ${value}`)
  return parsed
}

function dateToIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  const text = String(value ?? '').trim()
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return ''
}

/**
 * A date cell of the client workbook as ISO. Excel keeps a date as a day number whatever format it shows: a sheet
 * opened and saved again in another app (or another locale) shows "9/3/25" for 3 Sep 2025, which the shown text
 * could not be read from (owner, 21 Nov 2026). The day number decides; the shown text only when the cell holds text.
 */
function cellDateToIso(raw: unknown, shown: unknown): string {
  if (typeof raw === 'number' && raw > 20_000 && raw < 80_000) {
    const d = XLSX.SSF.parse_date_code(raw)
    if (d?.y && d.m && d.d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return dateToIso(raw instanceof Date ? raw : shown)
}

/** A number cell as entered (full precision), or the shown text when the cell holds text. */
function cellAmount(raw: unknown, shown: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw < 0) throw new Error(`Invalid non-negative number: ${raw}`)
    return raw
  }
  return amount(String(shown ?? ''))
}

/** A number entered in the Renewal Sheet, or null when the field is blank. */
function entered(value: string): number | null {
  if (!String(value ?? '').trim()) return null
  const n = Number.parseFloat(String(value).replace(/[₹,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

function renewalWorkbookFilename(form: BisRenewalForm): string {
  return `${safeBaseName(form.clientLabel || form.projectLabel)}_Renewal_Production.xlsx`
}

function renewalCalculationPdfFilename(form: BisRenewalForm): string {
  return `${safeBaseName(form.clientLabel || form.projectLabel)}_Renewal_Production_Report.pdf`
}

function downloadWorkbookBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function createRenewalClientWorkbook(form: BisRenewalForm): Promise<Blob> {
  if (!form.productionRows.length || !form.renewalPeriodFrom || !form.renewalPeriodTo) {
    throw new Error('Set the renewal period first so the monthly rows can be prepared.')
  }
  const unit = form.unitOfIs || 'Unit'
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Consultancy Management'
  workbook.title = 'BIS License Renewal Client Production Statement'
  workbook.subject = 'Client production data entry and return'
  workbook.calcProperties = { fullCalcOnLoad: true }

  const sheet = workbook.addWorksheet(SHEET_NAME, {
    properties: { defaultRowHeight: 22 },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    },
    views: [{ state: 'frozen', ySplit: 13 }],
  })
  // Owner, 21 Nov 2026: each period's production value, slab rate and marking fee, and the fee payable, worked out in
  // the sheet as the client types (the same rules as the Renewal Sheet); only the highlighted input cells open.
  sheet.columns = [
    { key: 'start', width: 13 }, { key: 'end', width: 13 }, { key: 'total', width: 17 }, { key: 'rejection', width: 14 },
    { key: 'covered', width: 17 }, { key: 'pvalue', width: 18 }, { key: 'cvalue', width: 18 }, { key: 'cpercent', width: 11 },
    { key: 'slab', width: 15 }, { key: 'fee', width: 17 },
  ]
  const LAST = 'J'
  const dark = '292524'
  const amber = 'B45309'
  const border = { style: 'thin' as const, color: { argb: 'FFD6D3D1' } }
  const allBorders = { top: border, left: border, bottom: border, right: border }
  const rupees = '₹ #,##0.00;[Red]-₹ #,##0.00;"–"'
  const qty = '#,##0.000;[Red]-#,##0.000;0'
  const setMergedPair = (row: number, label: string, value: string) => {
    sheet.mergeCells(`A${row}:B${row}`)
    sheet.mergeCells(`C${row}:${LAST}${row}`)
    sheet.getCell(`A${row}`).value = label
    sheet.getCell(`C${row}`).value = value
  }

  sheet.mergeCells(`A1:${LAST}1`)
  sheet.getCell('A1').value = 'BIS LICENSE RENEWAL — CLIENT PRODUCTION STATEMENT'
  sheet.getRow(1).height = 32
  sheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${dark}` } }
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }

  sheet.mergeCells(`A2:${LAST}2`)
  sheet.getCell('A2').value = `${form.clientLabel || 'Client'}  •  ${form.isCodeLabel || 'IS Code'}  •  CM/L ${form.cmLDigits || '—'}`
  sheet.getCell('A2').font = { name: 'Aptos', size: 11, bold: true, color: { argb: `FF${dark}` } }
  sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' }
  sheet.getRow(2).height = 25
  sheet.getRow(3).height = 8
  setMergedPair(4, 'Client', form.clientLabel || '')
  setMergedPair(5, 'Project', form.projectLabel || '')
  setMergedPair(6, 'IS Code', form.isCodeLabel || '')
  setMergedPair(7, 'CM/L Number', form.cmLDigits || '')
  setMergedPair(8, 'Renewal Period', `${formatDisplayDate(form.renewalPeriodFrom)} to ${formatDisplayDate(form.renewalPeriodTo)}`)
  setMergedPair(9, 'Renewal Term', `${form.renewalTermYears || '5'} year(s)`)
  sheet.mergeCells('A10:B10')
  sheet.mergeCells(`C10:${LAST}10`)
  sheet.getCell('A10').value = 'Basic Unit Rate Approx (₹ per unit)'
  // Blank for the manufacturer unless already entered: production value rate, not the IS Code marking-fee slab rate.
  const knownRate = entered(form.basicUnitRate)
  sheet.getCell('C10').value = knownRate ?? ''
  for (let row = 4; row <= 10; row += 1) {
    const label = sheet.getCell(`A${row}`)
    const value = sheet.getCell(`C${row}`)
    label.font = { name: 'Aptos', size: 10, bold: true, color: { argb: `FF${dark}` } }
    label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F4' } }
    label.alignment = { vertical: 'middle' }
    value.font = { name: 'Aptos', size: 10, color: { argb: `FF${dark}` } }
    value.alignment = { vertical: 'middle', horizontal: 'left' }
    for (let column = 1; column <= 10; column += 1) sheet.getCell(row, column).border = allBorders
  }
  sheet.getRow(10).height = 27
  sheet.getCell('C10').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D6' } }
  sheet.getCell('C10').font = { name: 'Aptos', size: 11, bold: true, color: { argb: 'FF92400E' } }
  sheet.getCell('C10').protection = { locked: false }
  sheet.getCell('C10').numFmt = '₹ #,##0.00'
  sheet.getCell('C10').dataValidation = {
    type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0],
    showErrorMessage: true, errorTitle: 'Invalid rate', error: 'Enter zero or a positive rate.',
  }

  sheet.mergeCells(`A11:${LAST}11`)
  sheet.getCell('A11').value =
    'Enter only the highlighted cells: Basic Unit Rate Approx (your selling / production rate per unit — not the BIS marking fee rate), ' +
    'Total Production and Rejection for each period. Covered Production, values, the IS Code slab rate, the marking fee of each period ' +
    'and the fee payable below are calculated automatically. Keep period dates unchanged and send this same file back for import.'
  sheet.getCell('A11').font = { name: 'Aptos', size: 9, italic: true, color: { argb: 'FF57534E' } }
  sheet.getCell('A11').alignment = { vertical: 'middle', wrapText: true }
  sheet.getCell('A11').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAF9' } }
  sheet.getCell('A11').border = allBorders
  sheet.getRow(11).height = 40
  sheet.getRow(12).height = 8

  const headerRow = 13
  const headers = [
    'Period Start', 'Period End', `Total Production (${unit})`, `Rejection (${unit})`, `Covered Production (${unit})`,
    'Production Value (₹)', 'Covered Value (₹)', 'Covered (%)', `Slab Rate (₹ per ${unit})`, 'Marking Fee (₹)',
  ]
  sheet.addRow(headers)
  const header = sheet.getRow(headerRow)
  header.height = 36
  header.eachCell((cell) => {
    cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${dark}` } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { top: { style: 'medium', color: { argb: `FF${amber}` } }, left: border, bottom: border, right: border }
  })

  // The IS Code slab rate of a period, chosen by its covered quantity exactly as the Renewal Sheet does.
  const slab = renewalSlabBands(form.slabRates)
  const slabFormula = (q: string) => {
    if (!slab) return '""'
    let formula = slab.fallback === null ? '""' : String(slab.fallback)
    for (const band of [...slab.bands].reverse()) {
      const parts = [band.min !== null ? `${q}>=${band.min}` : '', band.max !== null ? `${q}<=${band.max}` : ''].filter(Boolean)
      const test = parts.length === 2 ? `AND(${parts.join(',')})` : parts[0] ?? 'TRUE'
      formula = `IF(${test},${band.rate},${formula})`
    }
    return formula
  }
  const rate = '$C$10'

  // Values already entered in the Renewal Sheet go into the workbook (rejection = total − covered).
  form.productionRows.forEach((row, index) => {
    const r = headerRow + index + 1
    const total = entered(row.productionUnit)
    const covered = entered(row.coveredUnit)
    const excelRow = sheet.addRow([
      // UTC midnight: Excel stores dates without a time zone, so a local (IST) midnight would show the day before.
      row.periodFrom ? new Date(`${row.periodFrom}T00:00:00Z`) : '',
      row.periodTo ? new Date(`${row.periodTo}T00:00:00Z`) : '',
      total ?? '',
      total !== null && covered !== null ? Math.max(0, total - covered) : '',
      { formula: `IF(C${r}="","",MAX(0,C${r}-IF(D${r}="",0,D${r})))`, result: '' },
      { formula: `IF(OR(C${r}="",${rate}=""),"",ROUND(C${r}*${rate},2))`, result: '' },
      { formula: `IF(OR(E${r}="",${rate}=""),"",ROUND(E${r}*${rate},2))`, result: '' },
      { formula: `IF(OR(E${r}="",N(C${r})<=0),"",ROUND(E${r}/C${r}*100,2))`, result: '' },
      { formula: `IF(E${r}="","",${slabFormula(`E${r}`)})`, result: '' },
      { formula: `IF(OR(E${r}="",I${r}=""),"",ROUND(E${r}*I${r},2))`, result: '' },
    ])
    excelRow.height = 25
    excelRow.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.font = { name: 'Aptos', size: 10, color: { argb: `FF${dark}` } }
      cell.alignment = { vertical: 'middle', horizontal: column <= 2 ? 'center' : 'right', wrapText: false }
      cell.border = allBorders
      if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAF9' } }
    })
    excelRow.getCell(1).numFmt = 'dd/mm/yyyy'
    excelRow.getCell(2).numFmt = 'dd/mm/yyyy'
    for (const column of [3, 4, 5]) excelRow.getCell(column).numFmt = qty
    for (const column of [6, 7, 10]) excelRow.getCell(column).numFmt = rupees
    excelRow.getCell(8).numFmt = '0.00"%";;"–"'
    excelRow.getCell(9).numFmt = rupees
    // Stock-marking break rows take quantities like any other period (owner, 14 Nov 2026).
    for (const column of [3, 4]) {
      const cell = excelRow.getCell(column)
      cell.protection = { locked: false }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D6' } }
      cell.dataValidation = {
        type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0],
        showErrorMessage: true, errorTitle: 'Invalid quantity', error: 'Enter zero or a positive quantity.',
      }
    }
    excelRow.getCell(4).dataValidation = {
      type: 'decimal', operator: 'lessThanOrEqual', formulae: [`C${excelRow.number}`], allowBlank: true,
      showErrorMessage: true, errorTitle: 'Rejection exceeds production', error: 'Rejection must be equal to or less than Total Production.',
    }
    for (const column of [5, 6, 7, 8, 9, 10]) {
      excelRow.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: column === 10 ? 'FFECFDF5' : 'FFEFF6FF' } }
      excelRow.getCell(column).font = { name: 'Aptos', size: 10, italic: column !== 10, bold: column === 10, color: { argb: 'FF44403C' } }
    }
  })
  // Total row under the periods (Import skips it).
  const firstDataRow = headerRow + 1
  const lastDataRow = headerRow + form.productionRows.length
  const totalRow = sheet.getRow(lastDataRow + 1)
  sheet.mergeCells(`A${totalRow.number}:B${totalRow.number}`)
  totalRow.getCell(1).value = 'Total'
  for (const column of [3, 4, 5, 6, 7, 10]) {
    const letter = String.fromCharCode(64 + column)
    totalRow.getCell(column).value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`, result: 0 }
    totalRow.getCell(column).numFmt = column <= 5 ? qty : rupees
  }
  totalRow.getCell(8).value = { formula: `IF(N(C${totalRow.number})<=0,"",ROUND(E${totalRow.number}/C${totalRow.number}*100,2))`, result: '' }
  totalRow.getCell(8).numFmt = '0.00"%";;"–"'
  totalRow.height = 27
  for (let column = 1; column <= 10; column += 1) {
    const cell = totalRow.getCell(column)
    cell.font = { name: 'Aptos', size: 11, bold: true, color: { argb: `FF${dark}` } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    cell.alignment = { vertical: 'middle', horizontal: column <= 2 ? 'center' : 'right' }
    cell.border = { top: { style: 'medium', color: { argb: `FF${amber}` } }, left: border, bottom: { style: 'medium', color: { argb: `FF${amber}` } }, right: border }
  }

  // Fee payable, as the Renewal Sheet works it out: the higher of the calculated and the minimum marking fee, plus
  // the application, licence and late fees and GST.
  const fee = renewalMarkingFeeSummary([], form)
  const money2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  let summaryRow = totalRow.number + 2
  sheet.mergeCells(`A${summaryRow}:${LAST}${summaryRow}`)
  sheet.getCell(`A${summaryRow}`).value = 'MARKING FEE CALCULATION'
  sheet.getCell(`A${summaryRow}`).font = { name: 'Aptos', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell(`A${summaryRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${dark}` } }
  sheet.getCell(`A${summaryRow}`).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  sheet.getRow(summaryRow).height = 24
  const at: Record<string, string> = {}
  const line = (keyName: string, label: string, value: number | { formula: string }, opts: { bold?: boolean; grand?: boolean } = {}) => {
    summaryRow += 1
    sheet.mergeCells(`A${summaryRow}:G${summaryRow}`)
    sheet.mergeCells(`H${summaryRow}:${LAST}${summaryRow}`)
    const labelCell = sheet.getCell(`A${summaryRow}`)
    const valueCell = sheet.getCell(`H${summaryRow}`)
    labelCell.value = label
    valueCell.value = typeof value === 'number' ? value : { formula: value.formula, result: 0 }
    valueCell.numFmt = '₹ #,##0.00'
    const fill = opts.grand ? 'FFFEF3C7' : opts.bold ? 'FFF5F5F4' : 'FFFFFFFF'
    for (let column = 1; column <= 10; column += 1) {
      const cell = sheet.getCell(summaryRow, column)
      cell.border = allBorders
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    }
    labelCell.font = { name: 'Aptos', size: opts.grand ? 11 : 10, bold: opts.bold || opts.grand, color: { argb: `FF${dark}` } }
    labelCell.alignment = { vertical: 'middle', wrapText: true, indent: 1 }
    valueCell.font = { name: 'Aptos', size: opts.grand ? 12 : 10, bold: opts.bold || opts.grand, color: { argb: opts.grand ? 'FF92400E' : `FF${dark}` } }
    valueCell.alignment = { vertical: 'middle', horizontal: 'right' }
    sheet.getRow(summaryRow).height = opts.grand ? 26 : 22
    at[keyName] = `H${summaryRow}`
  }
  line('calculated', '1. Calculated Marking Fee — Σ (each period\'s covered production × IS Code slab rate)', { formula: `J${totalRow.number}` })
  const minimumLabel = !fee.scale
    ? '2. Minimum Marking Fee — firm scale not set in Client Master, minimum not applied'
    : fee.minimumPerYear === null
      ? `2. Minimum Marking Fee — no ${fee.scale} scale minimum in IS Code Master, not applied`
      : `2. Minimum Marking Fee — ${fee.scale} scale: ₹ ${money2.format(fee.minimumPerYear)} per year${fee.years > 1 ? ` × ${fee.years} years` : ''}`
  line('minimum', minimumLabel, fee.minimumTotal)
  line('payable', '3. Marking Fee Payable — the higher of 1 and 2', { formula: `MAX(${at.calculated},${at.minimum})` }, { bold: true })
  line('application', 'Renewal Application Fee', fee.applicationFee)
  line('licence', `Annual Licence Fee${fee.years > 1 ? ` (₹ ${money2.format(fee.licenceFee / fee.years)} × ${fee.years} years)` : ''}`, fee.licenceFee)
  if (fee.lateFee) line('late', 'Late Fee (Deferred Renewal)', fee.lateFee)
  const parts = ['payable', 'application', 'licence', ...(fee.lateFee ? ['late'] : [])].map((k) => at[k])
  line('subtotal', 'Subtotal', { formula: `SUM(${parts.join(',')})` }, { bold: true })
  line('gst', `GST @ ${fee.gstRate}%`, { formula: `ROUND(${at.subtotal}*${fee.gstRate},0)/100` })
  line('total', 'Total Fee Payable (incl. GST)', { formula: `${at.subtotal}+${at.gst}` }, { grand: true })

  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastDataRow, column: 10 } }
  sheet.pageSetup.printArea = `A1:${LAST}${summaryRow}`
  sheet.pageSetup.printTitlesRow = '13:13'
  await sheet.protect('QE-Renewal-Client-Input', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: true,
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export async function createRenewalClientWorkbookFile(form: BisRenewalForm): Promise<File> {
  const blob = await createRenewalClientWorkbook(form)
  return new File([blob], renewalWorkbookFilename(form), { type: blob.type })
}

export async function downloadRenewalClientWorkbook(form: BisRenewalForm): Promise<void> {
  const blob = await createRenewalClientWorkbook(form)
  downloadWorkbookBlob(blob, renewalWorkbookFilename(form))
}

export async function resolveClientWhatsAppNumber(clientId: string): Promise<string> {
  const { data, error } = await supabase.from('clients').select('mobile,country_code').eq('id', clientId).maybeSingle()
  if (error) throw new Error('Could not read the client mobile number from Client Master.')
  const mobile = String((data as { mobile?: string | null } | null)?.mobile ?? '').trim()
  if (!mobile) throw new Error('Client mobile number is missing. Update it in Client Master or enter another number.')
  return normalizeWhatsAppNumber(`${String((data as { country_code?: string | null } | null)?.country_code ?? '+91')} ${mobile}`)
}

export function normalizeWhatsAppNumber(value: string): string {
  const digits = value.replace(/\D/g, '')
  const normalized = digits.length === 10 ? `91${digits}` : digits
  if (normalized.length < 10 || normalized.length > 15) {
    throw new Error('Enter a valid WhatsApp number with country code, for example +91 9876543210.')
  }
  return normalized
}

export async function emailRenewalWorkbookToClient(form: BisRenewalForm, recipient?: string): Promise<string> {
  const email = recipient?.trim() || await resolveClientEmail(form.clientId)
  if (!email) throw new Error('Client email is missing. Update the email in Client Master before sending the workbook.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid client email address.')
  const blob = await createRenewalClientWorkbook(form)
  const attachment = await blobToBase64(blob)
  const clientName = form.clientLabel || 'Client'
  const subject = `BIS renewal production sheet — ${form.cmLDigits || form.isCodeLabel}`
  await sendAppEmail({
    to: email,
    subject,
    html: `<p>Dear ${escapeHtml(clientName)},</p><p>Please find attached the blank BIS renewal production sheet. Complete the highlighted fields, keep the period and reference fields unchanged, and return the same workbook.</p><p>Regards,<br/>Quality Engineering</p>`,
    text: `Dear ${clientName},\n\nPlease find attached the blank BIS renewal production sheet. Complete the highlighted fields, keep the period and reference fields unchanged, and return the same workbook.\n\nRegards,\nQuality Engineering`,
    attachments: [{ filename: renewalWorkbookFilename(form), content: attachment, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
  })
  return email
}

export async function emailRenewalCalculationPdfToClient(form: BisRenewalForm, recipient?: string): Promise<string> {
  const email = recipient?.trim() || await resolveClientEmail(form.clientId)
  if (!email) throw new Error('Client email is missing. Update the email in Client Master before sending the report.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid client email address.')
  const blob = await createRenewalCalculationPdf(form)
  const attachment = await blobToBase64(blob)
  const clientName = form.clientLabel || 'Client'
  const subject = `BIS renewal production report — ${form.cmLDigits || form.isCodeLabel}`
  await sendAppEmail({
    to: email,
    subject,
    html: `<p>Dear ${escapeHtml(clientName)},</p><p>Please find attached the calculated BIS license renewal production report for ${escapeHtml(form.renewalPeriodFrom ? formatDisplayDate(form.renewalPeriodFrom) : 'the selected')} to ${escapeHtml(form.renewalPeriodTo ? formatDisplayDate(form.renewalPeriodTo) : 'selected period')}.</p><p>Please review the period-wise production and overall calculation summary, and arrange CA attestation if the report is verified.</p><p>Regards,<br/>Quality Engineering</p>`,
    text: `Dear ${clientName},\n\nPlease find attached the calculated BIS license renewal production report. Please review the period-wise production and overall calculation summary, and arrange CA attestation if the report is verified.\n\nRegards,\nQuality Engineering`,
    attachments: [{ filename: renewalCalculationPdfFilename(form), content: attachment, contentType: 'application/pdf' }],
  })
  return email
}

export async function importRenewalClientWorkbook(
  file: File,
  form: BisRenewalForm,
): Promise<{ basicUnitRate: string; productionRows: RenewalProductionRow[] }> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet = workbook.Sheets[SHEET_NAME] ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('The selected workbook has no worksheet.')
  // Shown text (labels, headings) and the values themselves (date day numbers, full-precision quantities), row by row.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy', blankrows: true })
  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true, blankrows: true })
  const headerIndex = matrix.findIndex((row) => {
    const values = row.map(normalize)
    return values.includes('periodstart') && values.includes('periodend')
      && values.some((value) => value.startsWith('totalproduction'))
      && values.some((value) => value.startsWith('coveredproduction'))
  })
  if (headerIndex < 0) throw new Error('This does not look like the BIS renewal production template. Please use the downloaded workbook.')

  const headers = matrix[headerIndex].map(normalize)
  const indexes = {
    start: headers.indexOf('periodstart'),
    end: headers.indexOf('periodend'),
    type: headers.indexOf('periodtype'),
    total: headers.findIndex((value) => value.startsWith('totalproduction')),
    rejection: headers.findIndex((value) => value.startsWith('rejection')),
    covered: headers.findIndex((value) => value.startsWith('coveredproduction')),
  }
  const basicUnitRateIndex = matrix.findIndex((row) => ['basicunitrateperunit', 'basicunitrateapproxperunit'].includes(normalize(row[0])))
  if (basicUnitRateIndex < 0) throw new Error('Basic Unit Rate field is missing. Please use the downloaded renewal workbook.')
  // Merged label/value cells may leave blank columns in the parsed row. Read the first populated cell after the label.
  const rateColumn = matrix[basicUnitRateIndex].findIndex((value, i) => i > 0 && String(value ?? '').trim() !== '')
  const importedRate = rateColumn < 0 ? null : cellAmount(rawMatrix[basicUnitRateIndex]?.[rateColumn], matrix[basicUnitRateIndex][rateColumn])
  if (importedRate === null) throw new Error('Enter the Basic Unit Rate in the client workbook before importing it.')

  const existingByDates = new Map(form.productionRows.map((row) => [`${row.periodFrom}|${row.periodTo}`, row]))
  const dataRows = matrix
    .map((source, i) => ({ source, raw: rawMatrix[i] ?? [] }))
    .slice(headerIndex + 1)
    // The Total row under the periods is only for display.
    .filter(({ source }) => normalize(source[indexes.start]) !== 'total')
    .map(({ source, raw }) => ({
      source,
      raw,
      periodFrom: cellDateToIso(raw[indexes.start], source[indexes.start]),
      periodTo: cellDateToIso(raw[indexes.end], source[indexes.end]),
    }))
    .filter((row) => row.periodFrom || row.periodTo)
  // Sheets downloaded before the UTC date fix show every date one day early (21/07 as 20/07). When every
  // row matches this renewal only after moving it one day on, read them that way.
  const nextDay = (iso: string) => (iso ? new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : '')
  const shifted = dataRows.length > 0
    && dataRows.some((row) => !existingByDates.has(`${row.periodFrom}|${row.periodTo}`))
    && dataRows.every((row) => existingByDates.has(`${nextDay(row.periodFrom)}|${nextDay(row.periodTo)}`))
  const updated = new Map<string, RenewalProductionRow>()
  for (const row of dataRows) {
    const { source, raw } = row
    const periodFrom = shifted ? nextDay(row.periodFrom) : row.periodFrom
    const periodTo = shifted ? nextDay(row.periodTo) : row.periodTo
    const key = `${periodFrom}|${periodTo}`
    const original = existingByDates.get(key)
    if (!original) {
      throw new Error(`The workbook period ${formatDisplayDate(periodFrom) || '—'} to ${formatDisplayDate(periodTo) || '—'} does not match the periods in this Renewal Sheet. If you split periods or changed the dates after downloading, download a fresh Blank Sheet and enter the data again.`)
    }
    if (updated.has(key)) throw new Error(`Duplicate period found in workbook: ${periodFrom} to ${periodTo}.`)
    const total = cellAmount(raw[indexes.total], source[indexes.total])
    const rejection = indexes.rejection >= 0 ? cellAmount(raw[indexes.rejection], source[indexes.rejection]) : null
    const legacyCovered = indexes.rejection < 0 ? cellAmount(raw[indexes.covered], source[indexes.covered]) : null
    if (indexes.rejection >= 0 && rejection !== null && total === null) {
      throw new Error(`Enter Total Production before Rejection for ${periodFrom} to ${periodTo}.`)
    }
    if (indexes.rejection >= 0 && total !== null && rejection !== null && rejection > total) {
      throw new Error(`Rejection cannot exceed Total Production for ${periodFrom} to ${periodTo}.`)
    }
    const covered = indexes.rejection >= 0 && total !== null
      ? Math.max(0, total - (rejection ?? 0))
      : legacyCovered
    updated.set(key, {
      ...original,
      productionUnit: total === null ? '' : String(total),
      coveredUnit: covered === null ? '' : String(covered),
    })
  }
  if (!updated.size) throw new Error('No production rows were found beneath the template headings.')
  return {
    basicUnitRate: String(importedRate),
    productionRows: form.productionRows.map((row) => updated.get(`${row.periodFrom}|${row.periodTo}`) ?? row),
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}

export async function createRenewalCalculationPdf(form: BisRenewalForm): Promise<Blob> {
  const rows = form.productionRows.map((row) => calculateRenewalProductionRow(row, form.basicUnitRate, form.slabRates))
  const currency = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const quantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
  const unit = form.unitOfIs || 'unit'
  const total = (field: 'productionUnit' | 'productionValue' | 'coveredUnit' | 'coveredValue' | 'markingFee') =>
    // entered() strips Indian grouping: parseFloat('1,25,000') is 1.
    rows.reduce((sum, row) => sum + (entered(row[field]) ?? 0), 0)
  const totalProduction = total('productionUnit')
  const totalProductionValue = total('productionValue')
  const totalCovered = total('coveredUnit')
  const totalCoveredValue = total('coveredValue')
  const totalMarkingFee = total('markingFee')
  const fee = renewalMarkingFeeSummary(rows, form)
  const minimumLine = !fee.scale
    ? 'Firm scale not set in Client Master — minimum not applied'
    : fee.minimumPerYear === null
      ? `No ${fee.scale} scale minimum in IS Code Master — minimum not applied`
      : `${fee.scale} scale (IS Code Master): ₹ ${currency.format(fee.minimumPerYear)} per year${fee.years > 1 ? ` × ${fee.years} years` : ''} = ₹ ${currency.format(fee.minimumTotal)}`
  const coveredPercent = totalProduction > 0 ? (totalCovered / totalProduction) * 100 : 0
  const feeEquation = rows.filter((row) => (entered(row.coveredUnit) ?? 0) > 0).map((row) => {
    const slab = renewalSlabForQuantity(row.coveredUnit, form.slabRates)
    return slab
      ? `${quantity.format(entered(row.coveredUnit) ?? 0)} × ${currency.format(entered(slab.rate) ?? 0)}`
      : 'No matching slab'
  }).join(' + ')
  const tableRows = rows.map((row) => {
    const values = [
      formatDisplayDate(row.periodFrom), formatDisplayDate(row.periodTo),
      `${row.productionUnit || '—'} ${unit}`, `₹ ${currency.format(entered(row.productionValue) ?? 0)}`,
      `${row.coveredUnit || '—'} ${unit}`, `₹ ${currency.format(entered(row.coveredValue) ?? 0)}`,
      row.coveredPercent ? `${row.coveredPercent}%` : '—', `₹ ${currency.format(entered(row.markingFee) ?? 0)}`,
    ]
    return `<tr>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`
  }).join('')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>BIS License Renewal Production Report</title><style>
    @page{size:A4 portrait;margin:10mm 10mm 14mm;@bottom-right{content:"Page " counter(page) " of " counter(pages);font:8pt Arial,"Liberation Sans",sans-serif;color:#44403c}}*{box-sizing:border-box}html,body{margin:0}body{font:10pt Arial,"Liberation Sans",sans-serif;color:#1c1917}h1{font-size:15pt;margin:0}.header{border-bottom:2px solid #b45309;padding:0 0 6px;margin-bottom:8px}.subtitle{font-size:10pt;font-weight:bold;margin-top:2px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 12px;margin-top:6px}.meta div{min-width:0}.label{display:block;color:#57534e;font-size:8pt;text-transform:uppercase;letter-spacing:.04em}.value{font-weight:bold;font-size:9.5pt;overflow-wrap:anywhere}.table-wrap{margin-top:6px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#f0f0f0;color:#000;font-size:9pt;font-weight:bold;line-height:1.25;text-align:center;padding:4px 3px;border:1px solid #57534e;-webkit-print-color-adjust:exact;print-color-adjust:exact}td{padding:3px 4px;border:1px solid #a8a29e;text-align:right;white-space:nowrap;line-height:1.3}td:nth-child(1),td:nth-child(2){text-align:center}tbody tr:nth-child(even){background:#fafaf9}.total-row{background:#f5f5f4;font-weight:bold}.total-row td{border-top:2px solid #57534e}.calculation{margin-top:10px;break-inside:avoid-page;page-break-inside:avoid}.calculation h2{font-size:11pt;margin:0 0 5px;padding-bottom:3px;border-bottom:1px solid #a8a29e}.calc-grid{display:grid;grid-template-columns:1fr 46%;gap:8px;align-items:start}.fee-line{margin:0 0 4px;border:1px solid #d6d3d1;border-left:3px solid #d97706;background:#fffbeb;padding:4px 6px;font-size:9pt;line-height:1.35;overflow-wrap:anywhere}.fee-table{width:100%;margin:0;table-layout:auto;font-size:9pt}.fee-table td{border:1px solid #d6d3d1;padding:3px 6px;text-align:right;white-space:normal}.fee-table td:first-child{text-align:left}.fee-table td:last-child{white-space:nowrap}.fee-table .sub td{font-weight:bold;border-top:2px solid #a8a29e}.fee-table .grand td{font-weight:bold;font-size:10pt;background:#fef3c7;border-top:2px solid #57534e}
  </style></head><body><header class="header"><h1>BIS License Renewal — Production Statement</h1><div class="subtitle">Client Production and Marking Fee Summary</div><div class="meta">
    <div><span class="label">Firm Name</span><span class="value">${escapeHtml(form.clientLabel || '—')}</span></div><div><span class="label">Address</span><span class="value">${escapeHtml(form.clientAddress || '—')}</span></div><div><span class="label">Email ID</span><span class="value">${escapeHtml(form.clientEmail || '—')}</span></div>
    <div><span class="label">CM/L Number</span><span class="value">${escapeHtml(form.cmLDigits ? `CM/L-${form.cmLDigits}` : '—')}</span></div><div><span class="label">License Validity</span><span class="value">${escapeHtml(form.currentValidity ? formatDisplayDate(form.currentValidity) : '—')}</span></div><div><span class="label">Production Period</span><span class="value">${escapeHtml(formatDisplayDate(form.renewalPeriodFrom))} to ${escapeHtml(formatDisplayDate(form.renewalPeriodTo))}</span></div>
  </div></header><div class="table-wrap"><table><colgroup><col style="width:10%"><col style="width:10%"><col style="width:11%"><col style="width:17%"><col style="width:11%"><col style="width:17%"><col style="width:10%"><col style="width:14%"></colgroup><thead><tr><th>Period Start</th><th>Period End</th><th>Total Production (${escapeHtml(unit)})</th><th>Value (₹)</th><th>Covered Production (${escapeHtml(unit)})</th><th>Value (₹)</th><th>Covered Qty (%)</th><th>Marking Fee (₹)</th></tr></thead><tbody>${tableRows}<tr class="total-row"><td colspan="2">Total</td><td>${quantity.format(totalProduction)} ${escapeHtml(unit)}</td><td>₹ ${currency.format(totalProductionValue)}</td><td>${quantity.format(totalCovered)} ${escapeHtml(unit)}</td><td>₹ ${currency.format(totalCoveredValue)}</td><td>${totalProduction > 0 ? `${coveredPercent.toFixed(2)}%` : '—'}</td><td>₹ ${currency.format(totalMarkingFee)}</td></tr></tbody></table></div>
  <section class="calculation"><h2>Marking Fee Calculation</h2><div class="calc-grid"><div><p class="fee-line">1. Calculated fee — Σ (period covered production × applicable IS Code slab rate): ${escapeHtml(feeEquation || 'No covered production entered')} = <strong>₹ ${currency.format(totalMarkingFee)}</strong></p><p class="fee-line">2. Minimum marking fee — ${escapeHtml(minimumLine)}</p><p class="fee-line">3. Marking fee payable = higher of the two: max(₹ ${currency.format(fee.calculated)}, ₹ ${currency.format(fee.minimumTotal)}) = <strong>₹ ${currency.format(fee.payable)}</strong>${fee.basis === 'minimum' ? ' (minimum marking fee applies)' : ''}</p></div><table class="fee-table"><tbody><tr><td>Marking Fee Payable${fee.basis === 'minimum' ? ' (minimum)' : ''}</td><td>₹ ${currency.format(fee.payable)}</td></tr><tr><td>Renewal Application Fee</td><td>₹ ${currency.format(fee.applicationFee)}</td></tr><tr><td>Annual Licence Fee${fee.years > 1 ? ` (₹ 1,000.00 × ${fee.years} years)` : ''}</td><td>₹ ${currency.format(fee.licenceFee)}</td></tr>${fee.lateFee ? `<tr><td>Late Fee (Deferred Renewal)</td><td>₹ ${currency.format(fee.lateFee)}</td></tr>` : ''}<tr class="sub"><td>Subtotal</td><td>₹ ${currency.format(fee.subtotal)}</td></tr><tr><td>GST @ ${fee.gstRate}% (₹ ${currency.format(fee.subtotal)} × ${fee.gstRate}%)</td><td>₹ ${currency.format(fee.gst)}</td></tr><tr class="grand"><td>Total Fee Payable (incl. GST)</td><td>₹ ${currency.format(fee.total)}</td></tr></tbody></table></div></section></body></html>`
  return renderPdfViaPlaywright({
    html,
    filename: renewalCalculationPdfFilename(form),
    format: 'a4',
    landscape: false,
    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
  })
}

export async function downloadRenewalCalculationPdf(form: BisRenewalForm): Promise<void> {
  const blob = await createRenewalCalculationPdf(form)
  triggerPdfDownload(blob, renewalCalculationPdfFilename(form))
}

export async function createRenewalCalculationPdfFile(form: BisRenewalForm): Promise<File> {
  const blob = await createRenewalCalculationPdf(form)
  return new File([blob], renewalCalculationPdfFilename(form), { type: 'application/pdf' })
}
