import {
  INCLUSION_ADDITION_KEY,
  inclusionQrCodes,
  inclusionRequired,
  licenceScopeText,
  parseInclusionVarieties,
  type InclusionVariety,
} from '../projects/inclusionModel'
import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  buildPrintPage,
  isStandardRefHtml,
  letterheadHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

/* Change in Scope (Inclusion): request letter with the licensee's undertaking. It opens Manak's single
   "Any Other Document" upload; the uploaded supporting files are merged after it. */

type Rec = Record<string, unknown>

export type InclusionSample = { qrCode: string; batchNumber: string; description: string }

export type InclusionRequestLetterData = PrintApplicantContext & {
  licenceNo: string
  existingScope: string
  varieties: InclusionVariety[]
  samples: InclusionSample[]
  machineryRequired: boolean
  equipmentRequired: boolean
  /** Names of the uploaded inclusion documents (Step 5), listed under Enclosures. */
  otherDocuments: string[]
  letterDate: string
  /** Wording edited in the letter's Edit popup; empty parts use the standard wording. */
  text: InclusionLetterText
  signatoryName: string
  signatoryDesignation: string
  signatureImageUrl?: string
}

export type InclusionLetterText = {
  subject: string
  intro: string
  points: string[]
  /** Edited undertaking lines: a line with text null keeps the standard point at templateIndex. Null = standard points. */
  lines?: Array<{ text: string | null; templateIndex?: number }> | null
  closing: string
  /** Extra lines under Enclosures (after the ones the app adds). */
  enclosures: string[]
}

/** Standard wording, as plain text (the Edit popup starts from it; the letter bolds parts of it). */
export function defaultInclusionLetterText(ctx: {
  licenceNo: string
  isRef: string
  firm: string
  address: string
  machineryRequired: boolean
  equipmentRequired: boolean
}): InclusionLetterText {
  return {
    subject: `Request for inclusion of variety(s) in the scope of Licence No. ${ctx.licenceNo || '—'}${ctx.isRef ? ` for ${ctx.isRef}` : ''}.`,
    intro: `We, M/s. ${ctx.firm}${ctx.address ? `, ${ctx.address},` : ','} holder of the above BIS licence, request you to kindly include the following variety(s) in the scope of our licence.`,
    points: [
      'The variety(s) proposed for inclusion are manufactured at the same factory premises, with the same manufacturing process and quality control system as the varieties already covered under the licence.',
      `Additional manufacturing machinery / facility is ${ctx.machineryRequired ? 'required' : 'not required'} for the new variety(s)${ctx.machineryRequired ? '; the list of additional machinery is enclosed' : ''}.`,
      `Additional testing equipment / facility is ${ctx.equipmentRequired ? 'required' : 'not required'} for the new variety(s)${ctx.equipmentRequired ? '; the list of additional testing equipment is enclosed' : ''}.`,
      `The variety(s) conform to all the requirements of ${ctx.isRef || 'the Indian Standard'}, and the relevant test report(s) are submitted with this request.`,
      'We shall apply the Standard Mark on the included variety(s) only after the inclusion is granted by BIS, and shall follow the Scheme of Inspection and Testing for them.',
      'We shall pay the applicable fees and abide by the BIS (Conformity Assessment) Regulations and the conditions of the licence.',
    ],
    closing: 'The information given above is true and correct to the best of our knowledge and belief.',
    enclosures: [],
  }
}

const textBlock = (v: string) => esc(v).replace(/\n/g, '<br/>')

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())
const rowsOf = (p: unknown): Rec[] =>
  p && typeof p === 'object' && Array.isArray((p as Rec).rows) ? ((p as Rec).rows as Rec[]).filter((r) => r && typeof r === 'object') : []

function today(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** QR code numbers only, one per line ("Without Test Report" rows have none). */
function qrCell(variety: InclusionVariety): string {
  if (variety.inclusionType === 'Without Test Report') return '—'
  const codes = inclusionQrCodes(variety.qrCode)
  return codes.length ? codes.map((code) => esc(code)).join('<br/>') : '—'
}

const isNotApplicable = (v: string) => /^(not\s*applicable|n\/?a|-+)$/i.test(v.trim())

function buildBody(data: InclusionRequestLetterData): string {
  const custom = data.text
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const licence = esc(data.licenceNo || '—')
  const rows = data.varieties.length
    ? data.varieties
        .map(
          (v, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="inc-left">${esc(v.variety).replace(/\n/g, '<br/>')}</td>
        <td>${esc(v.inclusionType)}</td>
        <td>${qrCell(v)}</td>
      </tr>`,
        )
        .join('')
    : '<tr><td colspan="4">—</td></tr>'
  const delays = data.varieties.filter((v) => v.delayReason && !isNotApplicable(v.delayReason))
  const withReports = data.varieties.some((v) => v.inclusionType === 'With Test Report' && inclusionQrCodes(v.qrCode).length)
  const enclosures = [
    withReports ? 'Test report(s) of the sample(s) listed above (through the QR codes on Manak Online)' : '',
    data.machineryRequired ? 'List of additional manufacturing machinery' : '',
    data.equipmentRequired ? 'List of additional testing equipment' : '',
    ...data.otherDocuments,
    ...custom.enclosures,
  ].filter(Boolean)
  const defaultPoints = [
    'The variety(s) proposed for inclusion are manufactured at the same factory premises, with the same manufacturing process and quality control system as the varieties already covered under the licence.',
    `Additional manufacturing machinery / facility is <strong>${data.machineryRequired ? 'required' : 'not required'}</strong> for the new variety(s)${data.machineryRequired ? '; the list of additional machinery is enclosed' : ''}.`,
    `Additional testing equipment / facility is <strong>${data.equipmentRequired ? 'required' : 'not required'}</strong> for the new variety(s)${data.equipmentRequired ? '; the list of additional testing equipment is enclosed' : ''}.`,
    `The variety(s) conform to all the requirements of ${isStdRef || 'the Indian Standard'}, and the relevant test report(s) are submitted with this request.`,
    'We shall apply the Standard Mark on the included variety(s) only after the inclusion is granted by BIS, and shall follow the Scheme of Inspection and Testing for them.',
    'We shall pay the applicable fees and abide by the BIS (Conformity Assessment) Regulations and the conditions of the licence.',
  ]
  const points = custom.lines
    ? custom.lines
        .map((line) => (line.text === null ? (line.templateIndex != null ? defaultPoints[line.templateIndex] ?? '' : '') : textBlock(line.text)))
        .filter(Boolean)
    : custom.points.length
      ? custom.points.map(textBlock)
      : defaultPoints

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Request for Change in Scope (Inclusion) &amp; Undertaking</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date:</strong> ${esc(data.letterDate)}</div>
      <div><strong>Licence No.:</strong> ${licence}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> ${custom.subject ? textBlock(custom.subject) : `Request for inclusion of variety(s) in the scope of Licence No. <strong>${licence}</strong>${isStdRef ? ` for ${isStdRef}` : ''}.`}
  </p>

  <p class="pd-body">
    ${custom.intro ? textBlock(custom.intro) : `We, <strong>M/s. ${esc(data.applicantName)}</strong>${data.applicantAddress ? `, ${esc(data.applicantAddress)},` : ','}
    holder of the above BIS licence, request you to kindly include the following variety(s) in the scope of our licence.`}
  </p>

  <table class="pd-table inc-table">
    <colgroup><col style="width:28%"/><col style="width:72%"/></colgroup>
    <tbody>
      <tr><th class="inc-left">Existing Scope of Licence</th><td class="inc-left">${esc(data.existingScope || '—').replace(/\n/g, '<br/>')}</td></tr>
    </tbody>
  </table>

  <table class="pd-table inc-table">
    <colgroup><col style="width:8%"/><col style="width:54%"/><col style="width:17%"/><col style="width:21%"/></colgroup>
    <thead>
      <tr><th>Sr. No.</th><th>Variety Proposed for Inclusion</th><th>Inclusion Type</th><th>Sample QR Code</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${
    delays.length
      ? `<p class="pd-body"><strong>Reason for delay in test report:</strong> ${delays.map((v) => esc(v.delayReason)).join('; ')}</p>`
      : ''
  }

  <p class="pd-body"><strong>We hereby undertake that:</strong></p>
  <div class="inc-points">
    ${points.map((text, i) => `<p class="pd-body"><strong>${i + 1}.</strong> ${text}</p>`).join('')}
  </div>

  <p class="pd-body">${custom.closing ? textBlock(custom.closing) : 'The information given above is true and correct to the best of our knowledge and belief.'}</p>

  ${
    enclosures.length
      ? `<div class="inc-enclosures"><p class="pd-body"><strong>Enclosures:</strong></p>${enclosures
          .map((e, i) => `<p class="pd-body">${i + 1}. ${esc(e)}</p>`)
          .join('')}</div>`
      : ''
  }

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: data.signatoryName, designation: data.signatoryDesignation, signatureImageUrl: data.signatureImageUrl })}</div>
</div>`
}

const STYLES = `
  .pd-sheet table.inc-table { margin: 4px 0 10px; }
  .pd-sheet table.inc-table td.inc-left, .pd-sheet table.inc-table th.inc-left { text-align: left; }
  .pd-sheet table.inc-table tbody th { background: #f1f1f1; font-weight: 700; vertical-align: middle; }
  .inc-points .pd-body { margin: 0 0 6px; padding-left: 18px; text-indent: -18px; }
  .inc-enclosures .pd-body { margin: 0 0 3px; }
  .inc-enclosures { margin: 4px 0 6px; }
  .cmpf-sign-right { margin-top: 12px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: right; margin-left: auto; display: inline-block; }
`

export function buildInclusionRequestLetterHtml(data: InclusionRequestLetterData): string {
  return buildPrintPage({
    title: `Inclusion Request — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/**
 * modulePayload = inclusion-details, with `__samples` (OSL sample rows), `__components` (inclusion-components)
 * and `__additions` ({ machinery, equipment } counts of CMPF rows marked for this inclusion) added by the loader.
 */
export function inclusionRequestLetterDataFromPrintData(d: BisPrintData): InclusionRequestLetterData {
  const p = (d.modulePayload ?? {}) as Rec
  const sig = printSignatoryDefaults(d)
  const additions = (p.__additions ?? {}) as Rec
  const components = (p.__components ?? null) as Rec | null
  const digits = String(d.row.cm_l_digits ?? '').replace(/\D/g, '')
  return {
    ...applicantContextFromPrintData(d),
    licenceNo: digits ? `CM/L-${digits}` : str(d.row.license_number),
    existingScope: licenceScopeText(d.row.notes) || str(d.row.title) || d.isCode.title,
    varieties: parseInclusionVarieties(p),
    samples: rowsOf(p.__samples).map((r) => ({
      qrCode: str(r.qrCode).replace(/\D/g, ''),
      batchNumber: str(r.batchNumber),
      description: str(r.gradeTypeVariety),
    })),
    machineryRequired: inclusionRequired(components, 'machinery', Number(additions.machinery) || 0),
    equipmentRequired: inclusionRequired(components, 'equipment', Number(additions.equipment) || 0),
    letterDate: str(p.letterDate) || today(),
    text: {
      subject: str(p.letterSubject),
      intro: str(p.letterIntro),
      points: Array.isArray(p.letterPoints) ? (p.letterPoints as unknown[]).map((v) => str(v)).filter(Boolean) : [],
      lines: Array.isArray(p.letterLines)
        ? (p.letterLines as Rec[]).filter((l) => l && typeof l === 'object').map((l) => ({
            text: l.text === null ? null : str(l.text),
            templateIndex: Number.isInteger(l.templateIndex) ? Number(l.templateIndex) : undefined,
          }))
        : null,
      closing: str(p.letterClosing),
      enclosures: Array.isArray(p.letterEnclosures) ? (p.letterEnclosures as unknown[]).map((v) => str(v)).filter(Boolean) : [],
    },
    otherDocuments: Array.isArray(p.__otherDocuments) ? (p.__otherDocuments as unknown[]).map((v) => str(v)).filter(Boolean) : [],
    signatoryName: sig.signatoryName,
    signatoryDesignation: sig.signatoryDesignation,
    signatureImageUrl: sig.signatureImageUrl,
  }
}

/** CMPF rows marked as added for the inclusion (the "modified" list Manak asks for). */
export function inclusionAdditionRows(payload: Rec | null | undefined): Rec[] {
  return rowsOf(payload).filter((r) => str(r[INCLUSION_ADDITION_KEY]) === 'Yes')
}
