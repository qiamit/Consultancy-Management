import { formatDisplayDate, formatCmL, parseBisNotesScope } from '../projects/types'
import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import { getCurrencySymbol } from '@/lib/appCurrency'

export type BisForm1Person = { name: string; designation: string }

export type BisForm1Geo = { city: string; district: string; state: string; country: string; pin: string }

export type BisForm1Data = {
  /** Office and factory place details; the flat city/district/state/pin below are the older single set. */
  office?: BisForm1Geo
  factory?: BisForm1Geo
  applicationNumber: string
  companyName: string
  officeAddress: string
  factoryAddress: string
  city: string
  district: string
  state: string
  country: string
  pinCode: string
  officeTel: string
  officeEmail: string
  factoryTel: string
  factoryEmail: string
  correspondenceAddress: string
  scale: string
  sector: string
  topManagement: BisForm1Person[]
  technicalManagement: BisForm1Person[]
  contactPersonLine: string
  productName: string
  isNumber: string
  revisionYear: string
  isPart: string
  isSection: string
  gradesText: string
  productionUnit: string
  installedCapacity: string
  actualCapacity: string
  productionRate: string
  productionValue: string
  bisLicensesHeld: string
  signatoryName: string
  signatoryDesignation: string
  dateOfApplication: string
  preparedBy: string
  sealSignImageUrl: string
}

function managementPeople(payload: Record<string, unknown> | null | undefined): BisForm1Person[] {
  const rows = payload?.rows
  if (!Array.isArray(rows)) return []
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => ({
      name: String(row.personName ?? row.name ?? '').trim(),
      designation: String(row.designation ?? '').trim(),
    }))
    .filter((person) => person.name || person.designation)
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, '<br/>')
}

function dash(s: string, fallback = '—'): string {
  const v = (s ?? '').trim()
  return v || fallback
}

function cell(s: string): string {
  return esc(dash(s, ''))
}

function scopeMarkup(notes: string): string {
  const scope = parseBisNotesScope(notes)
  if (scope.mode === 'plain') {
    return esc(scope.text.trim()).replace(/\n/g, '<br/>')
  }
  const headers = scope.headers.map((header) => `<th>${esc(header.trim())}</th>`).join('')
  const rows = scope.rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => `<tr>${row.map((value) => `<td>${esc(value.trim())}</td>`).join('')}</tr>`)
    .join('')
  return rows ? `<table class="f1-scope-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>` : ''
}

/** Convert mostly-ALL-CAPS text to Title Case; leave mixed/sentence case as-is. */
export function properCapitalize(raw: string): string {
  const s = String(raw ?? '').trim()
  if (!s) return s
  const letters = s.replace(/[^A-Za-z]/g, '')
  if (!letters) return s
  const upperCount = (letters.match(/[A-Z]/g) ?? []).length
  if (upperCount / letters.length < 0.7) return s

  const acronyms = new Set([
    'bis', 'is', 'ceo', 'cfo', 'gmd', 'qc', 'rs', 'hdpe', 'osl', 'mmf', 'cm', 'ltd', 'pvt', 'llc', 'inc', 'co',
  ])

  return s.toLowerCase().replace(/(^|[^A-Za-z0-9])([A-Za-z0-9]+)/g, (_m, pre: string, word: string) => {
    if (acronyms.has(word)) return `${pre}${word.toUpperCase()}`
    return `${pre}${word.charAt(0).toUpperCase()}${word.slice(1)}`
  })
}

type ManagementColumnWidths = { name: number; designation: number }

function managementColumnWidths(people: BisForm1Person[]): ManagementColumnWidths {
  const longestName = Math.max(0, ...people.map((person) => person.name.trim().length))
  const longestDesignation = Math.max(0, ...people.map((person) => person.designation.trim().length))
  const total = longestName + longestDesignation
  const name = total ? Math.min(68, Math.max(32, (longestName / total) * 100)) : 50
  return { name, designation: 100 - name }
}

function personTable(people: BisForm1Person[], widths: ManagementColumnWidths): string {
  const filled = people.filter((p) => p.name.trim() || p.designation.trim())
  const colgroup = `<colgroup><col style="width:${widths.name}%"/><col style="width:${widths.designation}%"/></colgroup>`
  if (filled.length === 0) {
    return `<table class="f1-inner">${colgroup}<tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table>`
  }
  return `<table class="f1-inner">${colgroup}<tbody>${filled
    .map((p) => `<tr><td>${esc(p.name.trim())}</td><td>${esc(p.designation.trim())}</td></tr>`)
    .join('')}</tbody></table>`
}

function addressBlock(opts: {
  kind: string
  address: string
  city: string
  district: string
  state: string
  country: string
  pin: string
  tel: string
  email: string
}): string {
  return `
<table class="f1-box f1-addr">
  <colgroup>
    <col class="f1-address-kind-col"/>
    <col span="5" class="f1-geo-col"/>
    <col class="f1-contact-col-width"/>
  </colgroup>
  <tr>
    <td class="f1-addr-kind" rowspan="2">
      <div class="f1-vlabel">Address</div>
      <div class="f1-kind">${esc(opts.kind)}</div>
    </td>
    <td class="f1-addr-main" colspan="5">
      <div class="f1-mini">Address</div>
      <div class="f1-val">${nl2br(dash(opts.address, ''))}</div>
    </td>
    <td class="f1-contact-col" rowspan="2">
      <div class="f1-contact-row"><div class="f1-mini">Tel.</div><div class="f1-val">${esc(dash(opts.tel, '-'))}</div></div>
      <div class="f1-contact-row"><div class="f1-mini">Email*</div><div class="f1-val">${esc(dash(opts.email, ''))}</div></div>
    </td>
  </tr>
  <tr>
    <td class="f1-geo"><div class="f1-mini">City</div><div class="f1-val">${cell(opts.city)}</div></td>
    <td class="f1-geo"><div class="f1-mini">District</div><div class="f1-val">${cell(opts.district)}</div></td>
    <td class="f1-geo"><div class="f1-mini">State</div><div class="f1-val">${cell(opts.state)}</div></td>
    <td class="f1-geo"><div class="f1-mini">Country</div><div class="f1-val">${cell(opts.country)}</div></td>
    <td class="f1-geo f1-pin"><div class="f1-mini">Pin</div><div class="f1-val">${cell(opts.pin)}</div></td>
  </tr>
</table>`
}

function buildFormBody(data: BisForm1Data): string {
  const appNo = dash(data.applicationNumber, '')
  const firm = properCapitalize(dash(data.companyName, ''))
  const product = properCapitalize(dash(data.productName, ''))
  const appDate = data.dateOfApplication ? formatDisplayDate(data.dateOfApplication) : ''
  const city = properCapitalize(data.city)
  const district = properCapitalize(data.district)
  const state = properCapitalize(data.state)
  const country = properCapitalize(data.country || 'India')
  const correspondence = properCapitalize(dash(data.correspondenceAddress, 'Factory'))
  const scale = properCapitalize(dash(data.scale, ''))
  const sector = properCapitalize(dash(data.sector, ''))
  const geo = (g: BisForm1Geo | undefined) => (g
    ? { city: properCapitalize(g.city), district: properCapitalize(g.district), state: properCapitalize(g.state), country: properCapitalize(g.country || 'India'), pin: g.pin }
    : { city, district, state, country, pin: data.pinCode })
  const topManagementWidths = managementColumnWidths(data.topManagement)
  const technicalManagementWidths = managementColumnWidths(data.technicalManagement)
  const topNameColumn = 42.5 * topManagementWidths.name / 100
  const topDesignationColumn = 42.5 - topNameColumn
  const technicalNameColumn = 42.5 * technicalManagementWidths.name / 100
  const technicalDesignationColumn = 42.5 - technicalNameColumn

  return `
<div class="f1-continuous">
    <div class="f1-header">
      <div class="f1-form-title">Form 1</div>
      <div class="f1-sub">[See Regulation 3]</div>
      <div class="f1-org">Bureau of Indian Standards</div>
      <div class="f1-scheme">Product Certification Scheme</div>
      <div class="f1-app-title-en">Application for Licence to Use the Standard Mark</div>
    </div>

    <table class="f1-box f1-row">
      <tr><td class="f1-label-cell">Application Number</td><td class="f1-value-cell">${esc(appNo)}</td></tr>
      <tr><td class="f1-label-cell">Full Name of Applicant Firm</td><td class="f1-value-cell">${esc(firm)}</td></tr>
    </table>

    ${addressBlock({
      kind: 'Office',
      address: data.officeAddress,
      ...geo(data.office),
      tel: data.officeTel,
      email: data.officeEmail,
    })}

    ${addressBlock({
      kind: 'Factory',
      address: data.factoryAddress,
      ...geo(data.factory),
      tel: data.factoryTel,
      email: data.factoryEmail,
    })}

    <table class="f1-box f1-mgmt">
      <colgroup>
        <col style="width:15%"/>
        <col style="width:${topNameColumn}%"/>
        <col style="width:${topDesignationColumn}%"/>
        <col style="width:${technicalNameColumn}%"/>
        <col style="width:${technicalDesignationColumn}%"/>
      </colgroup>
      <tr>
        <td class="f1-mgmt-side" rowspan="3">Management</td>
        <td class="f1-mgmt-head" colspan="2">Top Management</td>
        <td class="f1-mgmt-head" colspan="2">Technical Management</td>
      </tr>
      <tr>
        <td class="f1-mgmt-sub">Name</td>
        <td class="f1-mgmt-sub">Designation</td>
        <td class="f1-mgmt-sub">Name</td>
        <td class="f1-mgmt-sub">Designation</td>
      </tr>
      <tr>
        <td colspan="2" class="f1-mgmt-body">${personTable(data.topManagement, topManagementWidths)}</td>
        <td colspan="2" class="f1-mgmt-body">${personTable(data.technicalManagement, technicalManagementWidths)}</td>
      </tr>
      <tr>
        <td class="f1-contact-label" colspan="2">Contact Person &amp; Tel/Mobile No.</td>
        <td class="f1-contact-value" colspan="3">${esc(dash(data.contactPersonLine, ''))}</td>
      </tr>
    </table>
    <table class="f1-box f1-meta-row">
      <tr>
        <td class="f1-meta-pair">Correspondence Address<br/><strong>${esc(correspondence)}</strong></td>
        <td class="f1-meta-pair">Scale<br/><strong>${esc(scale)}</strong></td>
        <td class="f1-meta-pair">Sector<br/><strong>${esc(sector)}</strong></td>
      </tr>
    </table>

    <div class="f1-mark-line">
      This application is being made to use the Bureau of Indian Standards (BIS) Standard Mark on <span class="f1-fill">${esc(product)}</span>
    </div>

    <table class="f1-box f1-product">
      <tr>
        <td class="f1-side-label"><div class="f1-vlabel">Product</div></td>
        <td class="f1-product-val">${esc(product)}</td>
      </tr>
      <tr>
        <td class="f1-side-label"><div class="f1-vlabel-sm">Indian Standard with Applicable Amendments</div></td>
        <td class="f1-std-wrap">
          <table class="f1-std">
            <tr>
              <td class="f1-is-meta">
                <div><strong>IS:</strong> ${esc(dash(data.isNumber, ''))}</div>
                <div><strong>Year:</strong> ${esc(dash(data.revisionYear, ''))}</div>
                <div><strong>Part:</strong> ${esc(dash(data.isPart, ''))}</div>
                <div><strong>Sec:</strong> ${esc(dash(data.isSection, ''))}</div>
              </td>
              <td class="f1-grades">
                <div class="f1-grades-head">License Scope</div>
                <div class="f1-grades-body${parseBisNotesScope(data.gradesText).mode === 'plain' ? '' : ' f1-grades-body--table'}">${scopeMarkup(data.gradesText)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table class="f1-box f1-capacity">
      <tr>
        <td class="f1-cap-cell"><div class="f1-mini">Production Unit</div><div class="f1-val">${esc(dash(data.productionUnit, ''))}</div></td>
        <td class="f1-cap-cell"><div class="f1-mini">Installed Capacity</div><div class="f1-val">${esc(dash(data.installedCapacity, ''))}</div></td>
        <td class="f1-cap-cell"><div class="f1-mini">Actual Capacity</div><div class="f1-val">${esc(dash(data.actualCapacity, ''))}</div></td>
        <td class="f1-cap-cell"><div class="f1-mini">Rate / Unit</div><div class="f1-val">${esc(data.productionRate ? `${getCurrencySymbol()} ${data.productionRate}` : '—')}</div></td>
        <td class="f1-cap-cell"><div class="f1-mini">Production Value</div><div class="f1-val">${esc(data.productionValue ? `${getCurrencySymbol()} ${data.productionValue}` : '—')}</div></td>
      </tr>
    </table>
    <table class="f1-box f1-licenses">
      <tr>
        <td>
          <div class="f1-mini"><strong>Bureau of Indian Standards (BIS) Licenses Held</strong></div>
          <div class="f1-licenses-body">${nl2br(dash(data.bisLicensesHeld, ''))}</div>
        </td>
      </tr>
    </table>

    <table class="f1-box f1-declaration">
      <tr>
        <td>
          <p><strong>Declaration:</strong> The above information is true to the best of my knowledge and belief. I shall be responsible for any misleading information in the application. I understand and agree that in case of any wrong information in the application, the application shall be liable for rejection. I also agree that, if the license is granted on the basis of information which is later found to be incorrect, the license shall be liable for cancellation.</p>
        </td>
      </tr>
    </table>

    <table class="f1-box f1-sign">
      <tr>
        <td class="f1-seal">
          <div class="f1-mini">Seal of the Firm:</div>
          <div class="f1-seal-box">${data.sealSignImageUrl ? `<img src="${esc(data.sealSignImageUrl)}" alt="Selected management signatory signature"/>` : ''}</div>
        </td>
        <td class="f1-sign-fields">
          <div class="f1-sign-line">Signature ______________________________</div>
          <div class="f1-sign-line">Name <span class="f1-fill">${esc(dash(data.signatoryName, '__________'))}</span></div>
          <div class="f1-sign-line">Designation <span class="f1-fill">${esc(dash(data.signatoryDesignation, '__________'))}</span></div>
          <div class="f1-sign-line">Date of Application <span class="f1-fill">${esc(dash(appDate, '__________'))}</span></div>
        </td>
      </tr>
    </table>

    <p class="f1-important">Important - Application should be signed by the CEO of the firm, or in his absence by an authorized representative.</p>
</div>`
}

const FORM1_STYLES = `
  @page { size: A4 portrait; margin: 8mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .f1-continuous {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    font-size: 12px;
    line-height: 1.35;
    max-width: 190mm;
    margin: 0 auto;
    padding: 2mm;
    border: 2.5pt double #111;
    box-sizing: border-box;
  }
  .f1-header { text-align: center; margin-bottom: 6px; border-bottom: 2px solid #b45309; padding-bottom: 5px; }
  .f1-form-title { font-size: 15px; font-weight: 700; }
  .f1-sub { font-size: 12px; margin-top: 2px; }
  .f1-org { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .f1-scheme { font-size: 12px; margin-top: 2px; }
  .f1-app-title-en { font-size: 12px; font-weight: 800; margin-top: 4px; letter-spacing: 0.02em; }
  .f1-box { width: 100%; border-collapse: collapse; margin-top: 4px; table-layout: fixed; }
  .f1-box td { border: 1px solid #111; vertical-align: middle; padding: 3px 5px; line-height: 1.35; }
  .f1-label-cell { width: 32%; font-size: 12px; font-weight: 600; }
  .f1-value-cell { font-size: 12px; font-weight: 700; }
  .f1-mini { font-size: 12px; font-weight: 600; line-height: 1.3; color: #222; margin-bottom: 1px; }
  .f1-val { font-size: 12px; overflow-wrap: anywhere; line-height: 1.35; }
  .f1-vlabel { font-weight: 700; font-size: 12px; line-height: 1.25; letter-spacing: 0.02em; }
  .f1-vlabel-sm { font-weight: 700; font-size: 12px; line-height: 1.3; padding: 2px 0; }
  .f1-kind { font-weight: 700; font-size: 12px; margin-top: 4px; }
  .f1-address-kind-col { width: 11%; }
  .f1-geo-col { width: 12.2%; }
  .f1-contact-col-width { width: 28%; }
  .f1-addr-kind { text-align: center; background: #fafaf9; padding: 3px 4px !important; }
  .f1-addr-main { vertical-align: top !important; min-height: 38px; }
  .f1-contact-col { padding: 0 !important; vertical-align: top !important; }
  .f1-contact-row { border-bottom: 1px solid #111; padding: 2px 5px; min-height: 25px; }
  .f1-contact-row:last-child { border-bottom: none; }
  .f1-geo { text-align: center; padding: 3px !important; height: 34px; }
  .f1-geo .f1-mini, .f1-geo .f1-val { text-align: center; }
  .f1-pin { width: 12.2%; }
  .f1-meta-pair { width: 33.33%; text-align: center; font-size: 12px; font-weight: 600; padding: 4px 6px !important; }
  .f1-mgmt { table-layout: fixed; }
  .f1-mgmt-side { width: 15%; text-align: center; white-space: nowrap; background: #fafaf9; padding: 4px !important; font-weight: 700; }
  .f1-mgmt-head { text-align: center; font-weight: 700; font-size: 12px; background: #f5f5f4; padding: 4px !important; }
  .f1-mgmt-sub { text-align: center; font-size: 12px; font-weight: 600; padding: 3px !important; }
  .f1-mgmt-body { padding: 0 !important; vertical-align: top !important; }
  .f1-inner { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .f1-inner td { border: none !important; border-bottom: 1px solid #ccc !important; padding: 3px 4px !important; font-size: 12px; overflow-wrap: anywhere; }
  .f1-inner tr:last-child td { border-bottom: none !important; }
  .f1-contact-label { font-size: 10px; font-weight: 600; background: #fafaf9; }
  .f1-contact-value { font-size: 12px; font-weight: 700; }
  .f1-mark-line { font-size: 12px; margin: 4px 0; line-height: 1.45; }
  .f1-fill { font-weight: 700; text-decoration: underline; }
  .f1-side-label { width: 18%; text-align: center; background: #fafaf9; padding: 6px 4px !important; }
  .f1-product-val { font-size: 12px; font-weight: 700; }
  .f1-std-wrap { padding: 0 !important; }
  .f1-std { width: 100%; border-collapse: collapse; }
  .f1-std td { border: none !important; border-right: 1px solid #111 !important; vertical-align: top !important; }
  .f1-std td:last-child { border-right: none !important; }
  .f1-is-meta { width: 25%; font-size: 12px; line-height: 1.45; padding: 4px 5px !important; }
  .f1-grades { width: 75%; padding: 0 !important; }
  .f1-grades-head { text-align: center; font-weight: 700; font-size: 12px; border-bottom: 1px solid #111; padding: 4px; background: #f5f5f4; }
  .f1-grades-body { padding: 4px 5px; font-size: 12px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
  /* Scope table sits flush inside the License Scope cell: Component column wide enough for its words, values centred. */
  .f1-grades-body--table { padding: 0; white-space: normal; }
  .f1-scope-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .f1-scope-table th, .f1-scope-table td { border: 1px solid #333; padding: 4px 6px; text-align: center; vertical-align: middle; font-size: 12px; line-height: 1.4; overflow-wrap: break-word; word-break: normal; hyphens: none; }
  .f1-scope-table th { font-weight: 700; background: #f5f5f4; }
  .f1-scope-table th:first-child, .f1-scope-table td:first-child { width: 26%; font-weight: 600; }
  .f1-scope-table thead th { border-top: 0; }
  .f1-scope-table tr > :first-child { border-left: 0; }
  .f1-scope-table tr > :last-child { border-right: 0; }
  .f1-scope-table tbody tr:last-child td { border-bottom: 0; }
  .f1-cap-cell { width: 20%; text-align: center; padding: 3px 4px !important; }
  .f1-cap-cell .f1-mini, .f1-cap-cell .f1-val { text-align: center; }
  .f1-licenses-body { margin-top: 3px; font-size: 12px; min-height: 16px; line-height: 1.35; }
  .f1-declaration p { margin: 0; font-size: 12px; text-align: justify; line-height: 1.45; }
  .f1-seal { width: 50%; text-align: center; }
  .f1-seal-box { width: 22mm; height: 22mm; border: 1px solid #111; margin: 6px auto 0; }
  .f1-seal-box img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .f1-sign-fields { width: 50%; font-size: 12px; }
  .f1-sign-line { margin: 4px 0; line-height: 1.4; }
  .f1-important { font-size: 12px; margin: 4px 0 0; font-weight: 600; line-height: 1.4; }
  .f1-prepared { font-size: 8.5px; margin: 6px 0 0; color: #57534e; text-align: right; }
  .f1-box, .f1-declaration, .f1-sign { break-inside: avoid; page-break-inside: avoid; }
`

export function buildBisForm1Html(data: BisForm1Data): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>BIS Form 1 — ${esc(data.companyName || 'Application')}</title>
  <style>${FORM1_STYLES}</style>
</head>
<body class="f1-print-document">
${buildFormBody(data)}
</body>
</html>`
}

/** Indian digit grouping with paise, e.g. 12,34,567.50. */
const INR_AMOUNT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Maps a BIS project row + client + IS code + consultancy context into Form-I fields. */
export function bisForm1DataFromPrintData(printData: BisPrintData): BisForm1Data {
  const { row, client, isCode, company } = printData
  const contactPerson = client.contactPerson
  const tel = client.mobile
  const cmL = row.cm_l_digits ? formatCmL(row.cm_l_digits) : ''
  const applicationNumber = (row.application_number ?? '').trim() || (row.license_number ?? '').trim() || cmL
  const productionRate = row.production_rate ?? ''
  const actualCapacity = row.actual_capacity ?? ''
  const productionValue = row.production_value ?? (
    actualCapacity && productionRate
      ? INR_AMOUNT.format(Number(actualCapacity) * Number(productionRate))
      : ''
  )
  const sig = printSignatoryDefaults(printData)
  const moduleTopManagement = managementPeople(printData.topManagement)
  const moduleTechnicalManagement = managementPeople(printData.technicalManagement)

  return {
    applicationNumber,
    companyName: client.companyName,
    officeAddress: client.officeAddress || client.address,
    factoryAddress: client.factoryAddress || client.address,
    office: { city: client.city || client.district, district: client.district, state: client.state, country: client.country, pin: client.pinCode },
    factory: {
      city: client.factoryCity || client.city || client.factoryDistrict || client.district,
      district: client.factoryDistrict || client.district,
      state: client.factoryState || client.state,
      country: client.factoryCountry || client.country,
      pin: client.factoryPin || client.pinCode,
    },
    city: client.factoryDistrict || client.district,
    district: client.factoryDistrict || client.district,
    state: client.factoryState || client.state,
    country: client.country,
    pinCode: client.factoryPin || client.pinCode,
    officeTel: tel,
    officeEmail: client.email,
    factoryTel: tel,
    factoryEmail: client.email,
    correspondenceAddress: 'Factory',
    scale: client.scale,
    sector: client.sector || 'Private',
    topManagement: moduleTopManagement.length > 0
      ? moduleTopManagement
      : client.topManagement.length > 0
        ? client.topManagement
      : contactPerson
        ? [{ name: contactPerson, designation: '' }]
        : [],
    technicalManagement: moduleTechnicalManagement,
    contactPersonLine: [contactPerson, tel].filter(Boolean).join(' / '),
    productName: isCode.title,
    isNumber: isCode.isNumber.replace(/^\s*IS\s*:?\s*/i, ''),
    revisionYear: isCode.revisionYear,
    isPart: isCode.partNo,
    isSection: isCode.sectionNo,
    gradesText: row.notes ?? '',
    productionUnit: row.production_unit ?? isCode.unitOfIs,
    installedCapacity: row.installed_capacity ?? '',
    actualCapacity,
    productionRate,
    productionValue,
    bisLicensesHeld: '',
    signatoryName: sig.signatoryName,
    signatoryDesignation: sig.signatoryDesignation,
    dateOfApplication: (row.application_date ?? '').trim(),
    preparedBy: company.companyName,
    sealSignImageUrl: printData.documentSignatory?.signatureImageUrl?.trim() ?? '',
  }
}
