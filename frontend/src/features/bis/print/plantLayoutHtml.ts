import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  dateOrNa,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type PlantLayoutData = PrintApplicantContext & {
  drawingDataUrl: string
  signatoryName: string
  signatoryDesignation: string
}

function buildBody(data: PlantLayoutData): string {
  const letterDate = dateOrNa(data.dateOfInspection.trim() || data.dateOfApplication)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const drawing = data.drawingDataUrl.trim()
    ? `<div class="pl-drawing-wrap"><img src="${esc(data.drawingDataUrl)}" alt="Plant layout" class="pl-drawing-image"/></div>`
    : `<div class="pl-drawing-placeholder">Plant layout drawing has not been added yet.<br/>Attach the factory layout plan and re-print when available.</div>`

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Plant Layout</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">Respected / Sir,</p>
  <p class="pd-body">
    We hereby submit the enclosed plant layout drawing of our manufacturing unit for your kind
    perusal and record in connection with our application for grant of BIS licence under the
    applicable Indian Standard. The drawing indicates the arrangement of production, storage,
    testing and allied areas within the factory premises to facilitate inspection and verification
    by the Bureau. The detailed layout plan is shown below for ready reference.
  </p>

  ${drawing}

  <p class="pd-body">
    We hereby declare that all information furnished above is true and correct to the best of our
    knowledge and belief.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .pl-drawing-placeholder {
    margin: 12px 0;
    min-height: 90mm;
    border: 1.5px dashed #a8a29e;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 16px;
    font-size: 12px;
    color: #57534e;
    background: #fafaf9;
  }
  .pl-drawing-wrap { margin: 12px 0; text-align: center; }
  .pl-drawing-image { max-width: 100%; max-height: 160mm; object-fit: contain; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildPlantLayoutHtml(data: PlantLayoutData): string {
  return buildPrintPage({
    title: `Plant Layout — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + consultancy context into Plant Layout fields. */
export function plantLayoutDataFromPrintData(printData: BisPrintData): PlantLayoutData {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    drawingDataUrl: '',
    signatoryName: printData.client.contactPerson,
    signatoryDesignation: '',
  }
}
