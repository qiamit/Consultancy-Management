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

export type ProcessFlowChartData = PrintApplicantContext & {
  drawingDataUrl: string
  signatoryName: string
  signatoryDesignation: string
}

function buildBody(data: ProcessFlowChartData): string {
  const letterDate = dateOrNa(data.dateOfInspection.trim() || data.dateOfApplication)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const drawing = data.drawingDataUrl.trim()
    ? `<div class="pfc-drawing-wrap"><img src="${esc(data.drawingDataUrl)}" alt="Process flow chart" class="pfc-drawing-image"/></div>`
    : `<div class="pfc-drawing-placeholder">Process flow chart has not been added yet.<br/>Attach / draw the chart and re-print when available.</div>`

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Process Flow Chart</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">Respected / Sir,</p>
  <p class="pd-body">
    We hereby submit the process flow chart of our manufacturing process for your kind
    reference in connection with our BIS licence / certification application. This chart
    outlines the sequence of operations from receipt of raw material to final inspection,
    packing and dispatch, including in-process checks where applicable. The process flow
    diagram is shown below for your review and records.
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
  .pfc-drawing-placeholder {
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
  .pfc-drawing-wrap { margin: 12px 0; text-align: center; }
  .pfc-drawing-image { max-width: 100%; max-height: 160mm; object-fit: contain; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildProcessFlowChartHtml(data: ProcessFlowChartData): string {
  return buildPrintPage({
    title: `Process Flow Chart — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + consultancy context into Process Flow Chart fields. */
export function processFlowChartDataFromPrintData(printData: BisPrintData): ProcessFlowChartData {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    drawingDataUrl: '',
    signatoryName: printData.client.contactPerson,
    signatoryDesignation: '',
  }
}
