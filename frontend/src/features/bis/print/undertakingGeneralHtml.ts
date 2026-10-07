import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  inspectionDateOrToday,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type UndertakingGeneralData = PrintApplicantContext & {
  markingClause: string
  packagingClause: string
  weeklyOff: string
  signatoryName: string
  signatoryDesignation: string
}

export function undertakingGeneralPoints(data: UndertakingGeneralData): string[] {
  const isCode = data.isNumber.trim() || '________________'
  const markingRef = data.markingClause.trim() || 'Clause 13'
  const packagingRef = data.packagingClause.trim() || 'Clause 14'
  const weeklyOff = data.weeklyOff.trim() || 'Sunday'

  return [
    'We have adequate electric power supply and water to run the factory, and we have a generator set. The manufacturing machinery and testing equipment available in the factory are owned by us.',
    'We have our own arrangement for water supply and a pollution control system.',
    'We will inform the BIS office whenever we shift any testing arrangement or manufacturing machinery, or add any new machine in the factory.',
    'We shall inform BIS of any change or leave of the quality control person and will not mark material with the ISI mark during his or her leave period.',
    'In case a stop-marking order is imposed on us at any time after grant of licence, we shall stop marking immediately and shall restart marking only after obtaining permission.',
    'We shall inform BIS regarding consignee details to whom product bearing the ISI mark is supplied.',
    'We shall extend all possible co-operation to the BIS inspecting officer in checking the production line and records, testing in the factory premises and drawing of samples for independent testing.',
    `Our weekly off day is ${weeklyOff}, and our firm will remain closed on that day. This is for your kind information.`,
    'The above information is true to the best of my knowledge and belief. I shall be responsible for any misleading information in the application. I understand and agree that in case of any wrong information in the application, the application shall be liable for rejection. I also agree that if the licence is granted based on information which is later found to be incorrect, the licence shall be liable for cancellation.',
    `We will follow the marking clause as per ${markingRef} of ${isCode}.`,
    `We will follow the packaging clause as per ${packagingRef} of ${isCode}.`,
    'We will dispose of non-conforming product in a manner that it cannot be used for any other purpose, and the record of the same will be retained.',
    'We shall always purchase ISI-marked material (if available) with test certificate, and the record of the same will be retained.',
  ]
}

function buildBody(data: UndertakingGeneralData): string {
  const appNo = applicationNoDisplay(data.applicationNumber)
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const points = undertakingGeneralPoints(data)

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Undertaking for General &amp; ISS</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(appNo)}</div>
    </div>
  </div>

  <p class="ug-intro"><strong>We, M/s. ${esc(data.applicantName)}, hereby undertake that:</strong></p>
  <div class="ug-points">
    ${points.map((text, i) => `<p><strong>${i + 1}.</strong> ${esc(text)}</p>`).join('')}
  </div>

  <div class="ug-sign">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .ug-intro { margin: 0 0 8px; }
  .ug-points p { margin: 5px 0; font-size: 11.5px; line-height: 1.5; text-align: justify; break-inside: avoid; page-break-inside: avoid; }
  .ug-sign { margin-top: 14px; text-align: right; }
  .ug-sign .pd-signatory { text-align: left; }
`

export function buildUndertakingGeneralHtml(data: UndertakingGeneralData): string {
  return buildPrintPage({
    title: `Undertaking for General & ISS — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into Undertaking fields. */
export function undertakingGeneralDataFromPrintData(printData: BisPrintData): UndertakingGeneralData {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    markingClause: '',
    packagingClause: '',
    weeklyOff: 'Sunday',
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
}
