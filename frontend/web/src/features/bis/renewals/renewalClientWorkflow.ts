import * as XLSX from 'xlsx'
import { downloadPdfViaPlaywright } from '@/lib/playwrightPdfClient'
import { blobToBase64, sendAppEmail } from '@/lib/sendAppEmail'
import { resolveClientEmail } from '../shared/emailHtmlToClient'
import { calculateRenewalProductionRow, formatDisplayDate, renewalSlabForQuantity, type BisRenewalForm, type RenewalProductionRow } from './types'

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
    { key: 'start', width: 16 }, { key: 'end', width: 16 }, { key: 'type', width: 34 },
    { key: 'total', width: 24 }, { key: 'covered', width: 27 },
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
  sheet.getCell('A10').value = 'Basic Unit Rate (₹ per unit)'
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
  sheet.getCell('A11').value = 'Complete the highlighted cells only. Keep period dates and other reference fields unchanged, then return this workbook.'
  sheet.getCell('A11').font = { name: 'Aptos', size: 9, italic: true, color: { argb: 'FF57534E' } }
  sheet.getCell('A11').alignment = { vertical: 'middle', wrapText: true }
  sheet.getCell('A11').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAF9' } }
  sheet.getCell('A11').border = allBorders
  sheet.getRow(11).height = 30
  sheet.getRow(12).height = 8

  const headerRow = 13
  const headers = ['Period Start', 'Period End', 'Production Type / Status', `Total Production (${unit})`, `Covered Production (${unit})`]
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
      row.stockMarkingBreak ? 'Stock-marking break — no production' : 'Normal production period',
      row.stockMarkingBreak ? 0 : '',
      row.stockMarkingBreak ? 0 : '',
    ])
    excelRow.height = 25
    excelRow.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.font = { name: 'Aptos', size: 10, color: { argb: `FF${dark}` } }
      cell.alignment = { vertical: 'middle', horizontal: column <= 2 ? 'center' : column >= 4 ? 'right' : 'left', wrapText: column === 3 }
      cell.border = allBorders
      if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAF9' } }
    })
    excelRow.getCell(1).numFmt = 'dd/mm/yyyy'
    excelRow.getCell(2).numFmt = 'dd/mm/yyyy'
    excelRow.getCell(4).numFmt = '#,##0.00;[Red]-#,##0.00;0'
    excelRow.getCell(5).numFmt = '#,##0.00;[Red]-#,##0.00;0'
    if (row.stockMarkingBreak) {
      excelRow.getCell(3).font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FF9A3412' } }
      for (const column of [4, 5]) {
        excelRow.getCell(column).font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF78716C' } }
        excelRow.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E5E4' } }
      }
    } else {
      for (const column of [4, 5]) {
        const cell = excelRow.getCell(column)
        cell.protection = { locked: false }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D6' } }
        cell.dataValidation = {
          type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0],
          showErrorMessage: true, errorTitle: 'Invalid quantity', error: 'Enter zero or a positive quantity.',
        }
      }
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

export async function downloadRenewalClientWorkbook(form: BisRenewalForm): Promise<void> {
  const blob = await createRenewalClientWorkbook(form)
  downloadWorkbookBlob(blob, renewalWorkbookFilename(form))
}

export async function shareRenewalWorkbookOnWhatsApp(form: BisRenewalForm): Promise<'shared' | 'downloaded'> {
  const filename = renewalWorkbookFilename(form)
  const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const text = `Please find the blank BIS renewal production sheet for ${form.clientLabel || 'your company'} (${form.isCodeLabel || 'BIS license renewal'}). Please complete the highlighted fields and return the same workbook.`
  const placeholder = new File([], filename, { type })
  const canShareWorkbook = typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [placeholder] })

  if (!canShareWorkbook) {
    // Open WhatsApp synchronously from the menu click so popup blockers do not lose the user gesture.
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
    const blob = await createRenewalClientWorkbook(form)
    downloadWorkbookBlob(blob, filename)
    return 'downloaded'
  }

  const blob = await createRenewalClientWorkbook(form)
  const file = new File([blob], filename, { type })
  await navigator.share({ files: [file], title: 'BIS renewal production sheet', text })
  return 'shared'
}

export async function emailRenewalWorkbookToClient(form: BisRenewalForm): Promise<string> {
  const email = await resolveClientEmail(form.clientId)
  if (!email) throw new Error('Client email is missing. Update the email in Client Master before sending the workbook.')
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
    covered: headers.findIndex((value) => value.startsWith('coveredproduction')),
  }
  const basicUnitRateRow = matrix.find((row) => normalize(row[0]) === 'basicunitrateperunit')
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
    const covered = amount(String(source[indexes.covered] ?? ''))
    const isStockBreak = original.stockMarkingBreak || (indexes.type >= 0 && normalize(source[indexes.type]).includes('stockmarking'))
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

export async function downloadRenewalCalculationPdf(form: BisRenewalForm): Promise<void> {
  const rate = amount(form.basicUnitRate)
  const rows = form.productionRows.map((row) => calculateRenewalProductionRow(row, form.basicUnitRate, form.slabRates))
  const currency = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const unit = form.unitOfIs || 'unit'
  const body = rows.map((row, index) => {
    const matchedSlab = renewalSlabForQuantity(row.coveredUnit, form.slabRates)
    const period = `${formatDisplayDate(row.periodFrom)} – ${formatDisplayDate(row.periodTo)}`
    const fee = Number.parseFloat(row.markingFee) || 0
    return `<section class="period"><h2>Period ${index + 1}: ${escapeHtml(period)}</h2><div class="summary"><div><small>Total Production</small><strong>${escapeHtml(row.productionUnit || '—')} ${escapeHtml(unit)}</strong></div><div><small>Production Value</small><strong>₹ ${currency.format(Number.parseFloat(row.productionValue) || 0)}</strong></div><div><small>Covered Production</small><strong>${escapeHtml(row.coveredUnit || '—')} ${escapeHtml(unit)}</strong></div><div><small>Covered Production Value</small><strong>₹ ${currency.format(Number.parseFloat(row.coveredValue) || 0)}</strong></div><div><small>Applicable IS Code Slab</small><strong>${escapeHtml(matchedSlab?.quantity || 'No matching slab')}</strong></div><div><small>Basic Unit Rate</small><strong>${rate === null ? '—' : `₹ ${currency.format(rate)} per ${escapeHtml(unit)}`}</strong></div><div><small>Marking Fee Slab Rate</small><strong>${matchedSlab ? `₹ ${currency.format(Number.parseFloat(matchedSlab.rate) || 0)} per ${escapeHtml(unit)}` : '—'}</strong></div><div><small>Covered Quantity</small><strong>${escapeHtml(row.coveredPercent || '—')}%</strong></div><div><small>Marking Fee</small><strong>₹ ${currency.format(fee)}</strong></div></div><div class="steps"><b>Calculation steps</b><ol><li>Production value = total production × basic unit rate = ₹ ${currency.format(Number.parseFloat(row.productionValue) || 0)}.</li><li>Covered value = covered production × basic unit rate = ₹ ${currency.format(Number.parseFloat(row.coveredValue) || 0)}.</li><li>Match covered production to IS Code slab: ${escapeHtml(matchedSlab?.quantity || 'No matching slab')}.</li><li>Apply the slab rate ${matchedSlab ? `₹ ${currency.format(Number.parseFloat(matchedSlab.rate) || 0)} per ${escapeHtml(unit)}` : '—'} to get the period marking fee: ₹ ${currency.format(fee)}.</li></ol></div></section>`
  }).join('')
  const total = rows.reduce((sum, row) => sum + (Number.parseFloat(row.markingFee) || 0), 0)
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#292524}h1{font-size:18pt;margin:0}.head{border-bottom:3px solid #d97706;padding:0 0 10px;margin-bottom:14px}.meta{color:#57534e;margin-top:6px}.period{border:1px solid #a8a29e;margin:0 0 12px;padding:12px;page-break-inside:avoid}.period h2{font-size:12pt;margin:0 0 9px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.summary div{border:1px solid #d6d3d1;padding:7px}.summary small{display:block;color:#78716c;margin-bottom:4px}.summary strong{font-size:9pt}.steps{margin-top:10px;padding:9px;background:#fafaf9;border-left:3px solid #d97706}.steps ol{margin:6px 0 0;padding-left:20px}.steps li{margin:3px 0}.total{font-size:13pt;text-align:right;padding:10px;border-top:2px solid #57534e;font-weight:bold}</style></head><body><header class="head"><h1>BIS License Renewal — Production Calculation Report</h1><div class="meta">${escapeHtml(form.clientLabel)} · ${escapeHtml(form.isCodeLabel)} · CM/L ${escapeHtml(form.cmLDigits)}<br>Renewal period: ${escapeHtml(formatDisplayDate(form.renewalPeriodFrom))} to ${escapeHtml(formatDisplayDate(form.renewalPeriodTo))}</div></header>${body}<div class="total">Total Marking Fee: ₹ ${currency.format(total)}</div></body></html>`
  await downloadPdfViaPlaywright({ html, filename: `${safeBaseName(form.clientLabel)}_Renewal_Calculation.pdf` })
}
