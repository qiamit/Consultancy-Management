import { flattenBisNotesColumns, formatDisplayDate, formatCmL } from '../projects/types'
import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'

export type BisForm1Person = { name: string; designation: string }

export type BisForm1Data = {
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
  officeFax: string
  officeEmail: string
  factoryTel: string
  factoryFax: string
  factoryEmail: string
  correspondenceAddress: string
  scale: string
  sector: string
  topManagement: BisForm1Person[]
  technicalManagement: BisForm1Person[]
  contactPersonLine: string
  productName: string
  isNumber: string
  isPart: string
  isSection: string
  gradesText: string
  unitsOfProduction: string
  quantity: string
  valueRs: string
  bisLicensesHeld: string
  signatoryName: string
  signatoryDesignation: string
  dateOfApplication: string
  preparedBy: string
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

function personRows(people: BisForm1Person[]): string {
  const filled = people.filter((p) => p.name.trim() || p.designation.trim())
  if (filled.length === 0) {
    return '<tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr>'
  }
  return filled
    .map((p) => `<tr><td>${esc(p.name.trim())}</td><td>${esc(p.designation.trim())}</td></tr>`)
    .join('')
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
  fax: string
  email: string
}): string {
  return `
<table class="f1-box f1-addr">
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
      <div class="f1-contact-row"><div class="f1-mini">Fax</div><div class="f1-val">${esc(dash(opts.fax, '-'))}</div></div>
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

  return `
<div class="f1-sheet">
  <div class="f1-fit-body">
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
      city,
      district,
      state,
      country,
      pin: data.pinCode,
      tel: data.officeTel,
      fax: data.officeFax,
      email: data.officeEmail,
    })}

    ${addressBlock({
      kind: 'Factory',
      address: data.factoryAddress,
      city,
      district,
      state,
      country,
      pin: data.pinCode,
      tel: data.factoryTel,
      fax: data.factoryFax,
      email: data.factoryEmail,
    })}

    <table class="f1-box f1-meta-row">
      <tr>
        <td class="f1-meta-pair">Correspondence Address — <strong>${esc(correspondence)}</strong></td>
        <td class="f1-meta-pair">Scale — <strong>${esc(scale)}</strong></td>
        <td class="f1-meta-pair">Sector — <strong>${esc(sector)}</strong></td>
      </tr>
    </table>

    <table class="f1-box f1-mgmt">
      <tr>
        <td class="f1-mgmt-side" rowspan="3"><div class="f1-vlabel-vert">Management</div></td>
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
        <td colspan="2" class="f1-mgmt-body"><table class="f1-inner">${personRows(data.topManagement)}</table></td>
        <td colspan="2" class="f1-mgmt-body"><table class="f1-inner">${personRows(data.technicalManagement)}</table></td>
      </tr>
      <tr>
        <td class="f1-contact-label" colspan="2">Contact Person &amp; Tel/Mobile No.</td>
        <td class="f1-contact-value" colspan="3">${esc(dash(data.contactPersonLine, ''))}</td>
      </tr>
    </table>
    <p class="f1-note">*Furnishing of correct and valid email id is a mandatory requirement and absence of this information shall make the application liable for rejection.</p>

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
                <div><strong>Part:</strong> ${esc(dash(data.isPart, ''))}</div>
                <div><strong>Sec:</strong> ${esc(dash(data.isSection, ''))}</div>
              </td>
              <td class="f1-grades">
                <div class="f1-grades-head">Grade / Type / Class</div>
                <div class="f1-grades-body">${nl2br(dash(data.gradesText, ''))}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table class="f1-box f1-capacity">
      <tr>
        <td class="f1-cap-title">Present Installed Capacity<br/>(Production per annum)</td>
        <td class="f1-cap-cell"><div class="f1-mini">Units of Production</div><div class="f1-val">${esc(properCapitalize(dash(data.unitsOfProduction, '0.00')))}</div></td>
        <td class="f1-cap-cell"><div class="f1-mini">Quantity</div><div class="f1-val">${esc(dash(data.quantity, '0.00'))}</div></td>
        <td class="f1-cap-cell"><div class="f1-mini">Value (Rs.)</div><div class="f1-val">${esc(dash(data.valueRs, ''))}</div></td>
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
          <div class="f1-seal-box"></div>
        </td>
        <td class="f1-sign-fields">
          <div class="f1-sign-line">Signature ______________________________</div>
          <div class="f1-sign-line">Name <span class="f1-fill">${esc(dash(data.signatoryName, '__________'))}</span></div>
          <div class="f1-sign-line">Designation <span class="f1-fill">${esc(dash(data.signatoryDesignation, '__________'))}</span></div>
          <div class="f1-sign-line">Date of Application <span class="f1-fill">${esc(dash(appDate, '__________'))}</span></div>
        </td>
      </tr>
    </table>

    <p class="f1-important">Important — Application should be signed by CEO of the firm, or in his absence by authorized representative.</p>
  </div>
</div>`
}

const FORM1_STYLES = `
  @page { size: A4 portrait; margin: 8mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .f1-sheet {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    font-size: 11px;
    line-height: 1.35;
    max-width: 190mm;
    margin: 0 auto;
    padding: 2mm;
    border: 2.5pt double #111;
    box-sizing: border-box;
  }
  @media print {
    .f1-sheet {
      max-width: none;
      padding: 2mm;
      border: 2.5pt double #111;
    }
  }
  .f1-header { text-align: center; margin-bottom: 6px; border-bottom: 2px solid #b45309; padding-bottom: 5px; }
  .f1-form-title { font-size: 15px; font-weight: 700; }
  .f1-sub { font-size: 10px; margin-top: 2px; }
  .f1-org { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .f1-scheme { font-size: 11px; margin-top: 2px; }
  .f1-app-title-en { font-size: 12px; font-weight: 800; margin-top: 4px; letter-spacing: 0.02em; }
  .f1-box { width: 100%; border-collapse: collapse; margin-top: 4px; table-layout: fixed; }
  .f1-box td { border: 1px solid #111; vertical-align: middle; padding: 4px 6px; }
  .f1-label-cell { width: 32%; font-size: 10px; font-weight: 600; }
  .f1-value-cell { font-size: 12px; font-weight: 700; }
  .f1-mini { font-size: 9px; font-weight: 600; line-height: 1.25; color: #222; margin-bottom: 2px; }
  .f1-val { font-size: 11px; word-break: break-word; line-height: 1.3; }
  .f1-vlabel { font-weight: 700; font-size: 10px; line-height: 1.25; letter-spacing: 0.02em; }
  .f1-vlabel-sm { font-weight: 700; font-size: 8.5px; line-height: 1.25; padding: 2px 0; }
  .f1-kind { font-weight: 700; font-size: 11px; margin-top: 4px; }
  .f1-addr-kind { width: 10%; text-align: center; background: #fafaf9; padding: 6px 4px !important; }
  .f1-addr-main { width: 50%; vertical-align: top !important; }
  .f1-contact-col { width: 22%; padding: 0 !important; vertical-align: top !important; }
  .f1-contact-row { border-bottom: 1px solid #111; padding: 4px 6px; }
  .f1-contact-row:last-child { border-bottom: none; }
  .f1-geo { width: 11%; text-align: center; padding: 5px 4px !important; }
  .f1-geo .f1-mini, .f1-geo .f1-val { text-align: center; }
  .f1-pin { width: 10%; }
  .f1-meta-pair { width: 33.33%; text-align: center; font-size: 11px; font-weight: 600; padding: 6px 8px !important; }
  .f1-mgmt-side { width: 9%; text-align: center; background: #fafaf9; padding: 6px 2px !important; }
  .f1-vlabel-vert {
    display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg);
    letter-spacing: 0.18em; white-space: nowrap; font-size: 11px; font-weight: 700;
  }
  .f1-mgmt-head { text-align: center; font-weight: 700; font-size: 11px; background: #f5f5f4; padding: 5px 4px !important; }
  .f1-mgmt-sub { text-align: center; font-size: 10px; font-weight: 600; width: 22.75%; padding: 4px !important; }
  .f1-mgmt-body { padding: 0 !important; vertical-align: top !important; }
  .f1-inner { width: 100%; border-collapse: collapse; }
  .f1-inner td { border: none !important; border-bottom: 1px solid #ccc !important; padding: 3px 5px !important; font-size: 11px; width: 50%; }
  .f1-inner tr:last-child td { border-bottom: none !important; }
  .f1-contact-label { font-size: 10px; font-weight: 600; background: #fafaf9; }
  .f1-contact-value { font-size: 12px; font-weight: 700; }
  .f1-note { font-size: 9px; margin: 4px 0 5px; font-style: italic; line-height: 1.3; }
  .f1-mark-line { font-size: 11px; margin: 5px 0 4px; line-height: 1.4; }
  .f1-fill { font-weight: 700; text-decoration: underline; }
  .f1-side-label { width: 14%; text-align: center; background: #fafaf9; padding: 6px 4px !important; }
  .f1-product-val { font-size: 12px; font-weight: 700; }
  .f1-std-wrap { padding: 0 !important; }
  .f1-std { width: 100%; border-collapse: collapse; }
  .f1-std td { border: none !important; border-right: 1px solid #111 !important; vertical-align: top !important; }
  .f1-std td:last-child { border-right: none !important; }
  .f1-is-meta { width: 28%; font-size: 11px; line-height: 1.45; padding: 5px 6px !important; }
  .f1-grades { width: 72%; padding: 0 !important; }
  .f1-grades-head { text-align: center; font-weight: 700; font-size: 11px; border-bottom: 1px solid #111; padding: 4px; background: #f5f5f4; }
  .f1-grades-body { padding: 5px 6px; font-size: 10px; line-height: 1.35; white-space: pre-wrap; word-break: break-word; }
  .f1-cap-title { width: 34%; font-size: 10px; font-weight: 700; line-height: 1.3; }
  .f1-cap-cell { width: 22%; text-align: center; padding: 5px 4px !important; }
  .f1-cap-cell .f1-mini, .f1-cap-cell .f1-val { text-align: center; }
  .f1-licenses-body { margin-top: 3px; font-size: 11px; min-height: 16px; line-height: 1.35; }
  .f1-declaration p { margin: 0; font-size: 9.5px; text-align: justify; line-height: 1.4; }
  .f1-seal { width: 50%; text-align: center; }
  .f1-seal-box { width: 22mm; height: 22mm; border: 1px solid #111; margin: 6px auto 0; }
  .f1-sign-fields { width: 50%; font-size: 11px; }
  .f1-sign-line { margin: 6px 0; line-height: 1.35; }
  .f1-important { font-size: 9.5px; margin: 5px 0 0; font-weight: 600; line-height: 1.35; }
  .f1-prepared { font-size: 8.5px; margin: 6px 0 0; color: #57534e; text-align: right; }
  .f1-box, .f1-declaration, .f1-sign { break-inside: avoid; page-break-inside: avoid; }
`

/** Shrinks the form to fit a single A4 page when content overflows. */
const FIT_SCRIPT = `<script>(function(){
  function fit(){
    var body = document.querySelector(".f1-fit-body");
    if(!body) return;
    body.style.transform = "";
    body.style.width = "";
    var mm = 96 / 25.4;
    var avail = (297 - 16) * mm - 12;
    var needed = body.scrollHeight;
    if(needed > avail + 1){
      var scale = Math.max(0.5, avail / needed);
      body.style.transformOrigin = "top left";
      body.style.transform = "scale(" + scale + ")";
      body.style.width = (100 / scale) + "%";
    }
  }
  window.addEventListener("beforeprint", fit);
  window.addEventListener("load", fit);
})();</script>`

export function buildBisForm1Html(data: BisForm1Data): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>BIS Form 1 — ${esc(data.companyName || 'Application')}</title>
  <style>${FORM1_STYLES}</style>
</head>
<body>
${buildFormBody(data)}
${FIT_SCRIPT}
</body>
</html>`
}

/** Maps a BIS project row + client + IS code + consultancy context into Form-I fields. */
export function bisForm1DataFromPrintData(printData: BisPrintData): BisForm1Data {
  const { row, client, isCode, company } = printData
  const contactPerson = client.contactPerson
  const tel = client.mobile
  const cmL = row.cm_l_digits ? formatCmL(row.cm_l_digits) : ''
  const applicationNumber = (row.license_number ?? '').trim() || cmL
  const sig = printSignatoryDefaults(printData)

  return {
    applicationNumber,
    companyName: client.companyName,
    officeAddress: client.address,
    factoryAddress: client.address,
    city: client.district,
    district: client.district,
    state: client.state,
    country: client.country,
    pinCode: client.pinCode,
    officeTel: tel,
    officeFax: '',
    officeEmail: client.email,
    factoryTel: tel,
    factoryFax: '',
    factoryEmail: client.email,
    correspondenceAddress: 'Factory',
    scale: client.scale,
    sector: 'Private',
    topManagement: contactPerson ? [{ name: contactPerson, designation: '' }] : [],
    technicalManagement: [],
    contactPersonLine: [contactPerson, tel].filter(Boolean).join(' / '),
    productName: isCode.title,
    isNumber: isCode.label,
    isPart: '',
    isSection: '',
    gradesText: flattenBisNotesColumns(row.notes ?? ''),
    unitsOfProduction: '',
    quantity: '',
    valueRs: '',
    bisLicensesHeld: '',
    signatoryName: sig.signatoryName,
    signatoryDesignation: sig.signatoryDesignation,
    dateOfApplication: row.start_date ?? row.created_at ?? '',
    preparedBy: company.companyName,
  }
}
