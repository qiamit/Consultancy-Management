import * as XLSX from 'xlsx'
import { renderPdfViaPlaywright, triggerPdfDownload } from '@/lib/playwrightPdfClient'
import { blobToBase64, sendAppEmail } from '@/lib/sendAppEmail'
import { supabase } from '@/lib/supabaseClient'
import { resolveClientEmail } from '../shared/emailHtmlToClient'
import { calculateRenewalProductionRow, formatDisplayDate, renewalMarkingFeeSummary, renewalSlabForQuantity, type BisRenewalForm, type RenewalProductionRow } from './types'

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
  sheet.columns = [
    { key: 'start', width: 16 }, { key: 'end', width: 16 }, { key: 'total', width: 24 },
    { key: 'rejection', width: 18 }, { key: 'covered', width: 25 },
  ]
  const dark = '292524'
  const amber = 'B45309'
  const border = { style: 'thin' as const, color: { argb: 'FFD6D3D1' } }
  const allBorders = { top: border, left: border, bottom: border, right: border }
  const setMergedPair = (row: number, label: string, value: string) => {
    sheet.mergeCells(`A${row}:B${row}`)
    sheet.mergeCells(`C${row}:E${row}`)
    sheet.getCell(`A${row}`).value = label
    sheet.getCell(`C${row}`).value = value
  }

  sheet.mergeCells('A1:E1')
  sheet.getCell('A1').value = 'BIS LICENSE RENEWAL — CLIENT PRODUCTION STATEMENT'
  sheet.getRow(1).height = 32
  sheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${dark}` } }
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }

  sheet.mergeCells('A2:E2')
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
  sheet.mergeCells('C10:E10')
  sheet.getCell('A10').value = 'Basic Unit Rate Approx (₹ per unit)'
  sheet.getCell('C10').value = ''
  for (let row = 4; row <= 10; row += 1) {
    const label = sheet.getCell(`A${row}`)
    const value = sheet.getCell(`C${row}`)
    label.font = { name: 'Aptos', size: 10, bold: true, color: { argb: `FF${dark}` } }
    label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F4' } }
    label.alignment = { vertical: 'middle' }
    value.font = { name: 'Aptos', size: 10, color: { argb: `FF${dark}` } }
    value.alignment = { vertical: 'middle' }
    for (const cell of [label, sheet.getCell(`B${row}`), value, sheet.getCell(`D${row}`), sheet.getCell(`E${row}`)]) {
      cell.border = allBorders
    }
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

  sheet.mergeCells('A11:E11')
  sheet.getCell('A11').value = 'Enter Total Production and Rejection in the highlighted cells. Covered Production is calculated automatically; keep period dates and reference fields unchanged.'
  sheet.getCell('A11').font = { name: 'Aptos', size: 9, italic: true, color: { argb: 'FF57534E' } }
  sheet.getCell('A11').alignment = { vertical: 'middle', wrapText: true }
  sheet.getCell('A11').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAF9' } }
  sheet.getCell('A11').border = allBorders
  sheet.getRow(11).height = 30
  sheet.getRow(12).height = 8

  const headerRow = 13
  const headers = ['Period Start', 'Period End', `Total Production (${unit})`, `Rejection (${unit})`, `Covered Production (${unit})`]
  sheet.addRow(headers)
  const header = sheet.getRow(headerRow)
  header.height = 34
  header.eachCell((cell) => {
    cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${dark}` } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { top: { style: 'medium', color: { argb: `FF${amber}` } }, left: border, bottom: border, right: border }
  })

  form.productionRows.forEach((row, index) => {
    const excelRow = sheet.addRow([
      row.periodFrom ? new Date(`${row.periodFrom}T00:00:00`) : '',
      row.periodTo ? new Date(`${row.periodTo}T00:00:00`) : '',
      row.stockMarkingBreak ? 0 : '',
      row.stockMarkingBreak ? 0 : '',
      row.stockMarkingBreak ? 0 : { formula: `IF(C${headerRow + index + 1}="","",MAX(0,C${headerRow + index + 1}-IF(D${headerRow + index + 1}="",0,D${headerRow + index + 1})))`, result: '' },
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
    excelRow.getCell(3).numFmt = '#,##0.00;[Red]-#,##0.00;0'
    excelRow.getCell(4).numFmt = '#,##0.00;[Red]-#,##0.00;0'
    excelRow.getCell(5).numFmt = '#,##0.00;[Red]-#,##0.00;0'
    if (row.stockMarkingBreak) {
      for (const column of [3, 4, 5]) {
        excelRow.getCell(column).font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF78716C' } }
        excelRow.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E5E4' } }
      }
    } else {
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
      excelRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
      excelRow.getCell(5).font = { name: 'Aptos', size: 10, italic: true, color: { argb: 'FF44403C' } }
    }
  })
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + form.productionRows.length, column: 5 } }
  sheet.pageSetup.printArea = `A1:E${headerRow + form.productionRows.length}`
  sheet.pageSetup.printTitlesRow = '13:13'
  await sheet.protect('QE-Renewal-Client-Input', {
    selectLockedCells: false,
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
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[SHEET_NAME] ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('The selected workbook has no worksheet.')
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy' })
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
  const basicUnitRateRow = matrix.find((row) => ['basicunitrateperunit', 'basicunitrateapproxperunit'].includes(normalize(row[0])))
  if (!basicUnitRateRow) throw new Error('Basic Unit Rate field is missing. Please use the downloaded renewal workbook.')
  // Merged label/value cells may leave blank columns in the parsed row. Read the first populated cell after the label.
  const importedRate = amount(String(basicUnitRateRow.slice(1).find((value) => String(value ?? '').trim() !== '') ?? ''))
  if (importedRate === null) throw new Error('Enter the Basic Unit Rate in the client workbook before importing it.')

  const existingByDates = new Map(form.productionRows.map((row) => [`${row.periodFrom}|${row.periodTo}`, row]))
  const updated = new Map<string, RenewalProductionRow>()
  for (const source of matrix.slice(headerIndex + 1)) {
    const periodFrom = dateToIso(source[indexes.start])
    const periodTo = dateToIso(source[indexes.end])
    if (!periodFrom && !periodTo) continue
    const key = `${periodFrom}|${periodTo}`
    const original = existingByDates.get(key)
    if (!original) throw new Error(`The workbook period ${periodFrom || '—'} to ${periodTo || '—'} does not match this renewal. Download a fresh template for this period.`)
    if (updated.has(key)) throw new Error(`Duplicate period found in workbook: ${periodFrom} to ${periodTo}.`)
    const total = amount(String(source[indexes.total] ?? ''))
    const rejection = indexes.rejection >= 0 ? amount(String(source[indexes.rejection] ?? '')) : null
    const legacyCovered = indexes.rejection < 0 ? amount(String(source[indexes.covered] ?? '')) : null
    const isStockBreak = original.stockMarkingBreak || (indexes.type >= 0 && normalize(source[indexes.type]).includes('stockmarking'))
    if (!isStockBreak && indexes.rejection >= 0 && rejection !== null && total === null) {
      throw new Error(`Enter Total Production before Rejection for ${periodFrom} to ${periodTo}.`)
    }
    if (!isStockBreak && indexes.rejection >= 0 && total !== null && rejection !== null && rejection > total) {
      throw new Error(`Rejection cannot exceed Total Production for ${periodFrom} to ${periodTo}.`)
    }
    const covered = indexes.rejection >= 0 && total !== null
      ? Math.max(0, total - (rejection ?? 0))
      : legacyCovered
    updated.set(key, {
      ...original,
      productionUnit: isStockBreak ? '0' : total === null ? '' : String(total),
      coveredUnit: isStockBreak ? '0' : covered === null ? '' : String(covered),
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
    rows.reduce((sum, row) => sum + (Number.parseFloat(row[field]) || 0), 0)
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
  const feeEquation = rows.filter((row) => (Number.parseFloat(row.coveredUnit) || 0) > 0).map((row) => {
    const slab = renewalSlabForQuantity(row.coveredUnit, form.slabRates)
    return slab
      ? `${quantity.format(Number.parseFloat(row.coveredUnit) || 0)} × ${currency.format(Number.parseFloat(slab.rate) || 0)}`
      : 'No matching slab'
  }).join(' + ')
  const tableRows = rows.map((row) => {
    const values = [
      formatDisplayDate(row.periodFrom), formatDisplayDate(row.periodTo),
      `${row.productionUnit || '—'} ${unit}`, `₹ ${currency.format(Number.parseFloat(row.productionValue) || 0)}`,
      `${row.coveredUnit || '—'} ${unit}`, `₹ ${currency.format(Number.parseFloat(row.coveredValue) || 0)}`,
      row.coveredPercent ? `${row.coveredPercent}%` : '—', `₹ ${currency.format(Number.parseFloat(row.markingFee) || 0)}`,
    ]
    return `<tr>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`
  }).join('')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>BIS License Renewal Production Report</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:9pt Arial,sans-serif;color:#292524;margin:0}h1{font-size:17pt;margin:0}.header{border-bottom:3px solid #b45309;padding:0 0 9px;margin-bottom:12px}.subtitle{font-size:10pt;font-weight:bold;margin-top:4px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:5px 12px;margin-top:8px}.meta div{min-width:0}.label{display:block;color:#78716c;font-size:7.5pt;text-transform:uppercase;letter-spacing:.04em}.value{font-weight:bold;overflow-wrap:anywhere}.table-wrap{margin-top:8px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#292524;color:#fff7ed;font-size:7.5pt;text-align:center;padding:6px 4px;border:1px solid #57534e}td{padding:5px 4px;border:1px solid #a8a29e;text-align:right;overflow-wrap:anywhere}td:nth-child(1),td:nth-child(2){text-align:center}tbody tr:nth-child(even){background:#fafaf9}.total-row{background:#f5f5f4;font-weight:bold}.total-row td{border-top:2px solid #57534e}.calculation{margin-top:14px;break-inside:avoid-page;page-break-inside:avoid}.calculation h2{font-size:11pt;margin:0 0 7px;padding-bottom:5px;border-bottom:1px solid #a8a29e}.fee-line{margin:0 0 6px;border:1px solid #d6d3d1;border-left:3px solid #d97706;background:#fffbeb;padding:8px;font-size:8pt;line-height:1.4;overflow-wrap:anywhere}.fee-table{width:auto;min-width:55%;margin:8px 0 0 auto;table-layout:auto;font-size:9pt}.fee-table td{border:1px solid #d6d3d1;padding:5px 10px;text-align:right}.fee-table td:first-child{text-align:left}.fee-table .sub td{font-weight:bold;border-top:2px solid #a8a29e}.fee-table .grand td{font-weight:bold;font-size:11pt;background:#fef3c7;border-top:2px solid #57534e}.footer-total{text-align:right;font-size:11pt;font-weight:bold;margin-top:8px;padding-top:7px;border-top:2px solid #57534e}
  </style></head><body><header class="header"><h1>BIS License Renewal — Production Statement</h1><div class="subtitle">Client Production and Marking Fee Summary</div><div class="meta">
    <div><span class="label">Firm Name</span><span class="value">${escapeHtml(form.clientLabel || '—')}</span></div><div><span class="label">Address</span><span class="value">${escapeHtml(form.clientAddress || '—')}</span></div><div><span class="label">Email ID</span><span class="value">${escapeHtml(form.clientEmail || '—')}</span></div>
    <div><span class="label">CM/L Number</span><span class="value">${escapeHtml(form.cmLDigits ? `CM/L-${form.cmLDigits}` : '—')}</span></div><div><span class="label">License Validity</span><span class="value">${escapeHtml(form.currentValidity ? formatDisplayDate(form.currentValidity) : '—')}</span></div><div><span class="label">Production Period</span><span class="value">${escapeHtml(formatDisplayDate(form.renewalPeriodFrom))} to ${escapeHtml(formatDisplayDate(form.renewalPeriodTo))}</span></div>
  </div></header><div class="table-wrap"><table><thead><tr><th>Period Start</th><th>Period End</th><th>Total Production (${escapeHtml(unit)})</th><th>Value (₹)</th><th>Covered Production (${escapeHtml(unit)})</th><th>Value (₹)</th><th>Covered Qty (%)</th><th>Marking Fee (₹)</th></tr></thead><tbody>${tableRows}<tr class="total-row"><td colspan="2">Total</td><td>${quantity.format(totalProduction)} ${escapeHtml(unit)}</td><td>₹ ${currency.format(totalProductionValue)}</td><td>${quantity.format(totalCovered)} ${escapeHtml(unit)}</td><td>₹ ${currency.format(totalCoveredValue)}</td><td>${totalProduction > 0 ? `${coveredPercent.toFixed(2)}%` : '—'}</td><td>₹ ${currency.format(totalMarkingFee)}</td></tr></tbody></table></div>
  <section class="calculation"><h2>Marking Fee Calculation</h2><p class="fee-line">1. Calculated fee — Σ (period covered production × applicable IS Code slab rate): ${escapeHtml(feeEquation || 'No covered production entered')} = <strong>₹ ${currency.format(totalMarkingFee)}</strong></p><p class="fee-line">2. Minimum marking fee — ${escapeHtml(minimumLine)}</p><p class="fee-line">3. Marking fee payable = higher of the two: max(₹ ${currency.format(fee.calculated)}, ₹ ${currency.format(fee.minimumTotal)}) = <strong>₹ ${currency.format(fee.payable)}</strong>${fee.basis === 'minimum' ? ' (minimum marking fee applies)' : ''}</p><table class="fee-table"><tbody><tr><td>Marking Fee Payable${fee.basis === 'minimum' ? ' (minimum)' : ''}</td><td>₹ ${currency.format(fee.payable)}</td></tr><tr><td>Renewal Application Fee</td><td>₹ ${currency.format(fee.applicationFee)}</td></tr><tr><td>Annual Licence Fee${fee.years > 1 ? ` (₹ 1,000.00 × ${fee.years} years)` : ''}</td><td>₹ ${currency.format(fee.licenceFee)}</td></tr><tr class="sub"><td>Subtotal</td><td>₹ ${currency.format(fee.subtotal)}</td></tr><tr><td>GST @ ${fee.gstRate}% (₹ ${currency.format(fee.subtotal)} × ${fee.gstRate}%)</td><td>₹ ${currency.format(fee.gst)}</td></tr><tr class="grand"><td>Total Fee Payable (incl. GST)</td><td>₹ ${currency.format(fee.total)}</td></tr></tbody></table></section></body></html>`
  return renderPdfViaPlaywright({
    html,
    filename: renewalCalculationPdfFilename(form),
    format: 'a4',
    landscape: true,
    margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
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
