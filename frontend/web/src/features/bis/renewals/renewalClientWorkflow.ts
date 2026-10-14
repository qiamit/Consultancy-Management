import * as XLSX from 'xlsx'
import { downloadPdfViaPlaywright } from '@/lib/playwrightPdfClient'
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

export function downloadRenewalClientWorkbook(form: BisRenewalForm): void {
  if (!form.productionRows.length || !form.renewalPeriodFrom || !form.renewalPeriodTo) {
    throw new Error('Set the renewal period first so the monthly rows can be prepared.')
  }
  const unit = form.unitOfIs || 'Unit'
  const rows: unknown[][] = [
    ['BIS LICENSE RENEWAL — CLIENT PRODUCTION STATEMENT'],
    ['Client', form.clientLabel || ''], ['Project', form.projectLabel || ''],
    ['IS Code', form.isCodeLabel || ''], ['CM/L Number', form.cmLDigits || ''],
    ['Renewal Period', `${formatDisplayDate(form.renewalPeriodFrom)} to ${formatDisplayDate(form.renewalPeriodTo)}`],
    ['Renewal Term', `${form.renewalTermYears || '5'} year(s)`],
    ['Basic Unit Rate (₹ per unit)', ''],
    ['Enter the basic unit rate and production quantities in the blank cells below. Keep the period dates unchanged, then return this workbook.'],
    [],
    ['Period Start', 'Period End', 'Period Type', `Total Production (${unit})`, `Covered Production (${unit})`],
    ...form.productionRows.map((row) => [
      row.periodFrom ? new Date(`${row.periodFrom}T00:00:00`) : '',
      row.periodTo ? new Date(`${row.periodTo}T00:00:00`) : '',
      row.stockMarkingBreak ? 'STOCK MARKING — NO PRODUCTION' : 'Production period',
      row.stockMarkingBreak ? 0 : '',
      row.stockMarkingBreak ? 0 : '',
    ]),
  ]
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, { s: { r: 8, c: 0 }, e: { r: 8, c: 4 } }]
  sheet['!cols'] = [{ wch: 19 }, { wch: 19 }, { wch: 34 }, { wch: 27 }, { wch: 29 }]
  sheet['!rows'] = [{ hpt: 28 }, ...Array.from({ length: 7 }, () => ({ hpt: 21 })), { hpt: 34 }, { hpt: 8 }, { hpt: 25 }]
  sheet['!autofilter'] = { ref: `A11:E${11 + form.productionRows.length}` }
  for (let rowIndex = 11; rowIndex < 11 + form.productionRows.length; rowIndex += 1) {
    for (const column of ['A', 'B']) {
      const cell = sheet[`${column}${rowIndex + 1}`]
      if (cell) cell.z = 'dd/mm/yyyy'
    }
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME)
  workbook.Props = {
    Title: 'BIS License Renewal Client Production Statement',
    Subject: 'Client production data entry and return',
    Author: 'Consultancy Management',
  }
  XLSX.writeFile(workbook, `${safeBaseName(form.clientLabel || form.projectLabel)}_Renewal_Production.xlsx`)
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
  const importedRate = amount(String(basicUnitRateRow[1] ?? ''))
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
