/**
 * BIS licence renewal reminders: an email to the client at 85 / 50 / 10 days before validity
 * (stages in bis_renewal_reminder_settings), with the blank monthly production sheet attached.
 *
 * Once a day after send_hour_ist (IST) the scheduler claims the day in the settings row, so only one
 * replica runs it. Each stage is claimed by inserting its bis_renewal_reminders row first (unique per
 * licence, validity date and stage), so a stage is never mailed twice. Failed sends retry on the
 * next runs, up to MAX_ATTEMPTS.
 */
import ExcelJS from 'exceljs'

const SOURCE_PATH = '/bis/license-renewals'
const MAX_ATTEMPTS = 3
const SENDING_STALE_MS = 30 * 60 * 1000
const CHECK_EVERY_MS = 10 * 60 * 1000
const SEND_GAP_MS = 700 // Resend allows a few requests per second
// A manual "send now" to the client within this many days stands in for the next automatic stage.
const MANUAL_COVERS_DAYS = 7
// A renewal filed in the app (any status past Initiated) stops the reminders for that validity.
const FILED_STATUSES = ['Application Filed', 'Fee Paid', 'Test Report Submitted', 'Inspection Scheduled', 'Inspection Done', 'Renewal Granted']
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Today's date and hour in India (UTC+5:30). */
export function istNow(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60 * 1000)
  return { date: ist.toISOString().slice(0, 10), hour: ist.getUTCHours() }
}

const parseIso = (value) => {
  const text = String(value ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}
const iso = (date) => date.toISOString().slice(0, 10)
const addDays = (value, days) => {
  const date = parseIso(value)
  date.setUTCDate(date.getUTCDate() + days)
  return iso(date)
}
const addMonths = (value, months) => {
  const date = parseIso(value)
  const day = date.getUTCDate()
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const last = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate()
  shifted.setUTCDate(Math.min(day, last))
  return iso(shifted)
}
export const daysBetween = (from, to) => Math.round((parseIso(to) - parseIso(from)) / 86_400_000)
const displayDate = (value) => {
  const date = parseIso(value)
  return date ? `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` : '—'
}
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** The stage due today: the smallest stage the days left have reached (none once expired or too early). */
export function dueStage(daysLeft, stages) {
  if (!Number.isFinite(daysLeft) || daysLeft < 0) return 0
  const reached = stages.filter((s) => daysLeft <= s)
  return reached.length ? Math.min(...reached) : 0
}

/**
 * Production statement period BIS asks for at renewal: the last 3 months of the previous operative
 * year plus the first 9 months of the current one, i.e. the 12 months ending 3 months before validity.
 */
export function productionPeriod(validityDate) {
  const to = addMonths(validityDate, -3)
  return { from: addDays(addMonths(validityDate, -15), 1), to }
}

/**
 * One row per calendar month (part months at the ends), as Manak's Production Return lists them:
 * the month holding the licence anniversary (validity day) is split there, e.g. 01–20 Oct / 21–31 Oct.
 */
export function monthlyRows(from, to, validityDate = '') {
  const rows = []
  let cursor = parseIso(from)
  const end = parseIso(to)
  const anniversary = parseIso(validityDate)
  while (cursor && end && cursor <= end && rows.length < 150) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0))
    let rowEnd = monthEnd < end ? monthEnd : end
    if (anniversary && cursor.getUTCMonth() === anniversary.getUTCMonth()) {
      const split = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), anniversary.getUTCDate()))
      if (split >= cursor && split < rowEnd) rowEnd = split
    }
    rows.push({ from: iso(cursor), to: iso(rowEnd) })
    cursor = new Date(rowEnd.getTime() + 86_400_000)
  }
  return rows
}

const textOf = (value) => String(value ?? '').trim()

function isCodeLabel(code) {
  if (!code) return ''
  const prefix = textOf(code.standard_prefix) || 'IS'
  let head = `${prefix} ${textOf(code.is_number).replace(/^IS\s*/i, '')}`.trim()
  const part = textOf(code.part_no)
  const section = textOf(code.section_no)
  if (part) head += ` (Part ${part}${section ? `/Sec ${section}` : ''})`
  const year = textOf(code.revision_year)
  return year ? `${head}: ${year}` : head
}

/** Blank client production sheet — the same layout the app's renewal form downloads. */
export async function buildProductionWorkbook({ firm, isLabel, cml, unit, period, validity = '', termYears = '' }) {
  const rows = monthlyRows(period.from, period.to, validity)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Consultancy Management'
  workbook.title = 'BIS License Renewal Client Production Statement'
  workbook.calcProperties = { fullCalcOnLoad: true }
  const sheet = workbook.addWorksheet('Production Data', {
    properties: { defaultRowHeight: 22 },
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 13 }],
  })
  sheet.columns = [{ width: 16 }, { width: 16 }, { width: 24 }, { width: 18 }, { width: 25 }]
  const dark = 'FF292524'
  const border = { style: 'thin', color: { argb: 'FFD6D3D1' } }
  const allBorders = { top: border, left: border, bottom: border, right: border }

  sheet.mergeCells('A1:E1')
  sheet.getCell('A1').value = 'BIS LICENSE RENEWAL — CLIENT PRODUCTION STATEMENT'
  sheet.getRow(1).height = 32
  sheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dark } }
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
  sheet.mergeCells('A2:E2')
  sheet.getCell('A2').value = `${firm || 'Client'}  •  ${isLabel || 'IS Code'}  •  CM/L ${cml || '—'}`
  sheet.getCell('A2').font = { name: 'Aptos', size: 11, bold: true, color: { argb: dark } }
  sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' }
  sheet.getRow(2).height = 25
  sheet.getRow(3).height = 8
  const pairs = [
    ['Client', firm],
    ['Project', `${firm} — ${isLabel}`],
    ['IS Code', isLabel],
    ['CM/L Number', cml],
    ['Production Period', `${displayDate(period.from)} to ${displayDate(period.to)}`],
    ['Renewal Term', termYears ? `${termYears} year(s)` : ''],
    ['Basic Unit Rate Approx (₹ per unit)', ''],
  ]
  pairs.forEach(([label, value], index) => {
    const row = 4 + index
    sheet.mergeCells(`A${row}:B${row}`)
    sheet.mergeCells(`C${row}:E${row}`)
    sheet.getCell(`A${row}`).value = label
    sheet.getCell(`C${row}`).value = value || ''
    sheet.getCell(`A${row}`).font = { name: 'Aptos', size: 10, bold: true, color: { argb: dark } }
    sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F4' } }
    sheet.getCell(`C${row}`).font = { name: 'Aptos', size: 10, color: { argb: dark } }
    for (const col of ['A', 'B', 'C', 'D', 'E']) sheet.getCell(`${col}${row}`).border = allBorders
  })
  const rate = sheet.getCell('C10')
  rate.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D6' } }
  rate.protection = { locked: false }
  rate.numFmt = '₹ #,##0.00'
  sheet.mergeCells('A11:E11')
  sheet.getCell('A11').value =
    'Enter Total Production and Rejection in the highlighted cells. Covered Production is calculated automatically; keep period dates and reference fields unchanged.'
  sheet.getCell('A11').font = { name: 'Aptos', size: 9, italic: true, color: { argb: 'FF57534E' } }
  sheet.getCell('A11').alignment = { vertical: 'middle', wrapText: true }
  sheet.getRow(11).height = 30
  sheet.getRow(12).height = 8

  const headerRow = 13
  const unitLabel = unit || 'Unit'
  sheet.getRow(headerRow).values = ['Period Start', 'Period End', `Total Production (${unitLabel})`, `Rejection (${unitLabel})`, `Covered Production (${unitLabel})`]
  sheet.getRow(headerRow).height = 34
  sheet.getRow(headerRow).eachCell((cell) => {
    cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dark } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { top: { style: 'medium', color: { argb: 'FFB45309' } }, left: border, bottom: border, right: border }
  })
  rows.forEach((period, index) => {
    const n = headerRow + index + 1
    const row = sheet.getRow(n)
    row.values = [
      new Date(`${period.from}T00:00:00Z`),
      new Date(`${period.to}T00:00:00Z`),
      null,
      null,
      { formula: `IF(C${n}="","",MAX(0,C${n}-IF(D${n}="",0,D${n})))`, result: '' },
    ]
    row.height = 25
    for (let col = 1; col <= 5; col += 1) {
      const cell = row.getCell(col)
      cell.font = { name: 'Aptos', size: 10, color: { argb: dark } }
      cell.alignment = { vertical: 'middle', horizontal: col <= 2 ? 'center' : 'right' }
      cell.border = allBorders
      cell.numFmt = col <= 2 ? 'dd/mm/yyyy' : '#,##0.00;[Red]-#,##0.00;0'
    }
    for (const col of [3, 4]) {
      const cell = row.getCell(col)
      cell.protection = { locked: false }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D6' } }
      cell.dataValidation = {
        type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0],
        showErrorMessage: true, errorTitle: 'Invalid quantity', error: 'Enter zero or a positive quantity.',
      }
    }
    row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
  })
  sheet.pageSetup.printArea = `A1:E${headerRow + rows.length}`
  sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`
  await sheet.protect('QE-Renewal-Client-Input', { selectLockedCells: false, selectUnlockedCells: true, autoFilter: true })
  addConsigneeSheet(workbook, { firm, cml, period })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

/** Columns of BIS's Consignee Master File (Manak → Production Return → Consignee Details upload). */
export const CONSIGNEE_COLUMNS = [
  ['Brand Name', 16], ["Consignee's Name", 28], ['Address', 36], ['Country', 12], ['State', 16], ['District', 16],
  ['City', 16], ['Pincode', 10], ['Telephone', 14], ['Mobile', 14], ['Email Id', 26], ['Quantity', 12], ['Year', 8], ['Month', 8],
]

function addConsigneeSheet(workbook, { firm, cml, period }) {
  const sheet = workbook.addWorksheet('Consignee Details', { views: [{ state: 'frozen', ySplit: 3 }] })
  sheet.columns = CONSIGNEE_COLUMNS.map(([, width]) => ({ width }))
  const last = String.fromCharCode(64 + CONSIGNEE_COLUMNS.length)
  sheet.mergeCells(`A1:${last}1`)
  sheet.getCell('A1').value = `CONSIGNEE DETAILS — ${firm || 'Client'} • CM/L ${cml || '—'}`
  sheet.getCell('A1').font = { name: 'Aptos Display', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF292524' } }
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
  sheet.getRow(1).height = 28
  sheet.mergeCells(`A2:${last}2`)
  sheet.getCell('A2').value =
    `One row per buyer (consignee) per month, ${displayDate(period.from)} to ${displayDate(period.to)}. Quantity in the licence unit; Year as 2026, Month as 1–12.`
  sheet.getCell('A2').font = { name: 'Aptos', size: 9, italic: true, color: { argb: 'FF57534E' } }
  sheet.getCell('A2').alignment = { vertical: 'middle', wrapText: true }
  sheet.getRow(2).height = 28
  const border = { style: 'thin', color: { argb: 'FFD6D3D1' } }
  const header = sheet.getRow(3)
  header.values = CONSIGNEE_COLUMNS.map(([label]) => label)
  header.height = 30
  header.eachCell((cell) => {
    cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF44403C' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { top: border, left: border, bottom: border, right: border }
  })
  for (let r = 4; r < 4 + 100; r += 1) {
    const row = sheet.getRow(r)
    for (let c = 1; c <= CONSIGNEE_COLUMNS.length; c += 1) {
      row.getCell(c).border = { top: border, left: border, bottom: border, right: border }
    }
    row.getCell(12).numFmt = '#,##0.00'
    row.getCell(13).dataValidation = { type: 'whole', operator: 'between', formulae: [2000, 2100], allowBlank: true, showErrorMessage: true, error: 'Enter the year, e.g. 2026.' }
    row.getCell(14).dataValidation = { type: 'whole', operator: 'between', formulae: [1, 12], allowBlank: true, showErrorMessage: true, error: 'Enter the month as 1–12.' }
  }
}

export function reminderEmail({ firm, contact, cml, isLabel, product, validity, daysLeft, period, stage }) {
  const urgent = stage > 0 && stage <= 10
  const when = daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
  const subject = `${urgent ? 'Urgent: ' : ''}BIS Licence Renewal Reminder — CM/L-${cml} (${isLabel}) valid till ${displayDate(validity)}`
  const lead = urgent
    ? `Your BIS licence expires ${when}. Please send the production details right away so that the renewal can be filed on Manak Online before the validity date.`
    : `Your BIS licence is due for renewal: its validity ends ${when}. The renewal application can now be filed on Manak Online.`
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1c1917;max-width:640px">
<p>Dear ${escapeHtml(contact || 'Sir/Madam')},</p>
<p>${escapeHtml(lead)}</p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:12px 0;font-size:14px">
<tr><td style="border:1px solid #d6d3d1;background:#f5f5f4;font-weight:bold">Firm</td><td style="border:1px solid #d6d3d1">${escapeHtml(firm)}</td></tr>
<tr><td style="border:1px solid #d6d3d1;background:#f5f5f4;font-weight:bold">Licence No.</td><td style="border:1px solid #d6d3d1">CM/L-${escapeHtml(cml)}</td></tr>
<tr><td style="border:1px solid #d6d3d1;background:#f5f5f4;font-weight:bold">Indian Standard</td><td style="border:1px solid #d6d3d1">${escapeHtml(isLabel)}${product ? ` — ${escapeHtml(product)}` : ''}</td></tr>
<tr><td style="border:1px solid #d6d3d1;background:#f5f5f4;font-weight:bold">Valid till</td><td style="border:1px solid #d6d3d1"><b>${escapeHtml(displayDate(validity))}</b> (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)</td></tr>
</table>
<p>Please fill the attached Excel and reply to this email with it:</p>
<ul>
<li><b>Production Data</b> sheet: month-wise <b>total production</b> and <b>rejection</b> for <b>${escapeHtml(displayDate(period.from))} to ${escapeHtml(displayDate(period.to))}</b>.</li>
<li><b>Consignee Details</b> sheet: the buyers the ISI-marked goods were supplied to in the same period (name, address, quantity, month).</li>
</ul>
<p>Regards,<br/>Q Engineering<br/>info@qengineering.in</p>
<p style="font-size:12px;color:#78716c">This is an automatic reminder for your BIS licence renewal. If the renewal is already filed, please ignore this email.</p>
</div>`
  const text = `${lead}\n\nFirm: ${firm}\nLicence No.: CM/L-${cml}\nIndian Standard: ${isLabel}\nValid till: ${displayDate(validity)} (${daysLeft} days left)\n\nPlease fill the attached Excel and reply with it: the Production Data sheet (month-wise total production and rejection for ${displayDate(period.from)} to ${displayDate(period.to)}) and the Consignee Details sheet (buyers supplied in the same period).\n\nRegards,\nQ Engineering`
  return { subject, html, text }
}

export function createRenewalReminders({ rest, sendResendEmail, logEmail }) {
  async function loadSettings() {
    const rows = await rest('/bis_renewal_reminder_settings?id=eq.1&select=*')
    const row = Array.isArray(rows) ? rows[0] : null
    const stages = (Array.isArray(row?.stages) ? row.stages : [85, 50, 10])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
      .sort((a, b) => b - a)
    return {
      enabled: Boolean(row?.enabled),
      stages: stages.length ? stages : [85, 50, 10],
      sendHourIst: Number.isInteger(row?.send_hour_ist) ? row.send_hour_ist : 9,
      lastRunOn: row?.last_run_on ?? null,
    }
  }

  const PROJECT_SELECT =
    'id,cm_l_digits,license_validity_date,renewal_reminders_paused,' +
    'client:clients(company_name,contact_person_name,email),' +
    'is_code:is_codes(is_number,title,revision_year,part_no,section_no,standard_prefix,unit_of_is)'

  async function loadProject(projectId) {
    const rows = await rest(`/bis_projects?id=eq.${encodeURIComponent(projectId)}&select=${PROJECT_SELECT}`)
    return Array.isArray(rows) ? rows[0] ?? null : null
  }

  async function loadDueProjects(today, maxStage) {
    const until = addDays(today, maxStage)
    const query = [
      `select=${PROJECT_SELECT}`,
      'is_qe_managed=eq.true',
      `license_validity_date=gte.${today}`,
      `license_validity_date=lte.${until}`,
      // Same licences as the "BIS License Renewals" list: no applications or inclusion rows.
      'or=(project_kind.is.null,project_kind.not.in.("Application","application","Inclusion","inclusion"))',
      'and=(or(status.is.null,status.not.in.("cancelled","stop_marking")))',
      'order=license_validity_date.asc',
      'limit=1000',
    ].join('&')
    const rows = await rest(`/bis_projects?${query}`)
    return Array.isArray(rows) ? rows : []
  }

  async function loadReminders(projectIds) {
    if (!projectIds.length) return []
    const rows = await rest(
      `/bis_renewal_reminders?project_id=in.(${projectIds.join(',')})&select=id,project_id,validity_date,stage,status,attempts,recipient,created_at,updated_at&order=created_at.desc`,
    )
    return Array.isArray(rows) ? rows : []
  }

  async function loadFiledRenewals(projectIds) {
    if (!projectIds.length) return new Set()
    const statuses = FILED_STATUSES.map((s) => `"${s}"`).join(',')
    const rows = await rest(
      `/bis_renewal_applications?project_id=in.(${projectIds.join(',')})&renewal_status=in.(${statuses})&select=project_id,updated_at`,
    )
    const cutoff = Date.now() - 200 * 86_400_000
    return new Set((Array.isArray(rows) ? rows : []).filter((r) => Date.parse(r.updated_at) >= cutoff).map((r) => r.project_id))
  }

  function describe(project, today) {
    const validity = textOf(project.license_validity_date).slice(0, 10)
    const code = project.is_code ?? null
    return {
      projectId: project.id,
      firm: textOf(project.client?.company_name),
      contact: textOf(project.client?.contact_person_name),
      email: textOf(project.client?.email).split(/[,;\s]+/).filter(Boolean)[0] ?? '',
      cml: textOf(project.cm_l_digits).replace(/\D/g, ''),
      isLabel: isCodeLabel(code),
      product: textOf(code?.title),
      unit: textOf(code?.unit_of_is),
      validity,
      daysLeft: validity ? daysBetween(today, validity) : NaN,
      paused: Boolean(project.renewal_reminders_paused),
    }
  }

  const VALID_EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i

  /** What today's run would do for each licence in the window (also the app's preview list). */
  async function plan(today) {
    const settings = await loadSettings()
    const projects = await loadDueProjects(today, settings.stages[0])
    const ids = projects.map((p) => p.id)
    const [reminders, filed] = await Promise.all([loadReminders(ids), loadFiledRenewals(ids)])
    const items = projects.map((project) => {
      const info = describe(project, today)
      const stage = dueStage(info.daysLeft, settings.stages)
      const mine = reminders.filter((r) => r.project_id === project.id)
      const forValidity = mine.filter((r) => String(r.validity_date).slice(0, 10) === info.validity)
      const sentStages = forValidity.filter((r) => r.stage > 0 && r.status === 'sent').map((r) => r.stage)
      const existing = forValidity.find((r) => r.stage === stage)
      const recentManual = mine.find(
        (r) =>
          r.stage === 0 &&
          r.status === 'sent' &&
          textOf(r.recipient).toLowerCase() === info.email.toLowerCase() &&
          Date.now() - Date.parse(r.created_at) < MANUAL_COVERS_DAYS * 86_400_000,
      )
      let action = 'send'
      let reason = ''
      if (!stage) [action, reason] = ['wait', 'Not at a reminder stage yet']
      else if (existing?.status === 'sent') [action, reason] = ['done', `${stage}-day reminder already sent`]
      else if (existing?.status === 'skipped') [action, reason] = ['done', 'Skipped earlier']
      else if (existing && existing.attempts >= MAX_ATTEMPTS && existing.status === 'failed') [action, reason] = ['skip', 'Failed 3 times']
      else if (existing?.status === 'sending' && Date.now() - Date.parse(existing.updated_at) < SENDING_STALE_MS) [action, reason] = ['skip', 'Sending now']
      else if (info.paused) [action, reason] = ['skip', 'Reminders paused for this licence']
      else if (filed.has(project.id)) [action, reason] = ['skip', 'Renewal already filed in the app']
      else if (recentManual) [action, reason] = ['skip', 'Reminder sent manually in the last 7 days']
      else if (!VALID_EMAIL.test(info.email)) [action, reason] = ['skip', 'Client email missing or invalid']
      return { ...info, stage, action, reason, sentStages, existingId: existing?.id ?? null, attempts: existing?.attempts ?? 0 }
    })
    return { settings, today, items }
  }

  async function deliver(info, { stage, to, userId }) {
    const period = productionPeriod(info.validity)
    const message = reminderEmail({ ...info, period, stage })
    const workbook = await buildProductionWorkbook({ ...info, period })
    const attachment = {
      filename: `${(info.firm || 'BIS').replace(/[^a-z0-9-]+/gi, '_').replace(/^_+|_+$/g, '')}_Renewal_Production.xlsx`,
      content: workbook.toString('base64'),
      content_type: XLSX_MIME,
    }
    const logBase = {
      userId: userId || null,
      sourcePath: SOURCE_PATH,
      to: [to],
      subject: message.subject,
      attachmentCount: 1,
      attachmentBytes: workbook.length,
    }
    try {
      const sent = await sendResendEmail({ to: [to], subject: message.subject, html: message.html, text: message.text, attachments: [attachment] })
      await logEmail({ ...logBase, status: 'sent', resendId: sent?.id ?? null })
      return { ok: true, subject: message.subject, resendId: sent?.id ?? null }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Send failed'
      await logEmail({ ...logBase, status: 'failed', error })
      return { ok: false, subject: message.subject, error }
    }
  }

  /** Claim the stage row (insert, or re-open a failed / stale one). False when another run has it. */
  async function claim(item) {
    if (item.existingId) {
      const rows = await rest(
        `/bis_renewal_reminders?id=eq.${item.existingId}&attempts=eq.${item.attempts}&status=in.(failed,sending)`,
        { method: 'PATCH', body: JSON.stringify({ status: 'sending', attempts: item.attempts + 1, updated_at: new Date().toISOString() }) },
      )
      return Array.isArray(rows) && rows[0] ? rows[0].id : null
    }
    try {
      const rows = await rest('/bis_renewal_reminders', {
        method: 'POST',
        body: JSON.stringify({
          project_id: item.projectId,
          validity_date: item.validity,
          stage: item.stage,
          status: 'sending',
          recipient: item.email,
        }),
      })
      return Array.isArray(rows) && rows[0] ? rows[0].id : null
    } catch {
      return null // unique index: another run already took this stage
    }
  }

  async function finish(id, result) {
    await rest(`/bis_renewal_reminders?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: result.ok ? 'sent' : 'failed',
        subject: result.subject ?? null,
        resend_id: result.resendId ?? null,
        error: result.ok ? null : String(result.error ?? '').slice(0, 1000),
        updated_at: new Date().toISOString(),
      }),
    })
  }

  async function runDaily(today) {
    const { items } = await plan(today)
    let sent = 0
    let failed = 0
    for (const item of items.filter((i) => i.action === 'send')) {
      const id = await claim(item)
      if (!id) continue
      const result = await deliver(item, { stage: item.stage, to: item.email })
      await finish(id, result)
      if (result.ok) sent += 1
      else failed += 1
      await sleep(SEND_GAP_MS)
    }
    console.log(`[renewal-reminders] ${today}: ${sent} sent, ${failed} failed`)
    return { sent, failed }
  }

  /** Daily run after the IST send hour; the settings row is the once-a-day lock across replicas. */
  async function tick() {
    try {
      const settings = await loadSettings()
      if (!settings.enabled) return
      const now = istNow()
      if (now.hour < settings.sendHourIst || settings.lastRunOn === now.date) return
      const claimed = await rest(
        `/bis_renewal_reminder_settings?id=eq.1&enabled=eq.true&or=(last_run_on.is.null,last_run_on.neq.${now.date})`,
        { method: 'PATCH', body: JSON.stringify({ last_run_on: now.date }) },
      )
      if (!Array.isArray(claimed) || !claimed[0]) return
      await runDaily(now.date)
    } catch (err) {
      console.error('[renewal-reminders] run failed', err)
    }
  }

  function startScheduler() {
    if (process.env.RENEWAL_REMINDERS_DISABLED === 'true') return
    setTimeout(tick, 60_000).unref?.()
    setInterval(tick, CHECK_EVERY_MS).unref?.()
  }

  /** Manual "send now" from the app: the current reminder text (stage 0), to the client or a given address. */
  async function sendNow(projectId, { to, userId }) {
    const project = await loadProject(projectId)
    if (!project) {
      const err = new Error('Licence not found')
      err.statusCode = 404
      throw err
    }
    const today = istNow().date
    const info = describe(project, today)
    if (!info.validity) {
      const err = new Error('This licence has no validity date.')
      err.statusCode = 400
      throw err
    }
    const recipient = textOf(to) || info.email
    if (!VALID_EMAIL.test(recipient)) {
      const err = new Error('Client email is missing or invalid. Update it in Client Master or enter an address.')
      err.statusCode = 400
      throw err
    }
    const settings = await loadSettings()
    const result = await deliver(info, { stage: dueStage(info.daysLeft, settings.stages), to: recipient, userId })
    await rest('/bis_renewal_reminders', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        project_id: info.projectId,
        validity_date: info.validity,
        stage: 0,
        status: result.ok ? 'sent' : 'failed',
        recipient,
        subject: result.subject ?? null,
        resend_id: result.resendId ?? null,
        error: result.ok ? null : String(result.error ?? '').slice(0, 1000),
        sent_by: userId || null,
      }),
    })
    if (!result.ok) {
      const err = new Error(result.error || 'Send failed')
      err.statusCode = 502
      throw err
    }
    return { recipient, subject: result.subject }
  }

  return { plan, sendNow, startScheduler, tick, istNow }
}
