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
import {
  buildProcessDescriptionSheetHtml,
  PROCESS_DESCRIPTION_PRINT_STYLES,
} from './processDescriptionHtml'
import {
  buildProcessFlowPrintMarkup,
  parseProcessFlowPayload,
  type ProcessFlowArrowStyle,
  type ProcessFlowBoxStyle,
  type ProcessFlowNode,
} from '../projects/processFlowModel'

export type ProcessFlowChartData = PrintApplicantContext & {
  /** Legacy uploaded drawing (optional). */
  drawingDataUrl: string
  /** Hierarchy nodes for generated chart. */
  nodes: ProcessFlowNode[]
  arrowStyle: ProcessFlowArrowStyle
  boxStyle: ProcessFlowBoxStyle
  /** Process Description annex points (page 2). */
  descriptionPoints: string[]
  signatoryName: string
  signatoryDesignation: string
}

function buildChartSheet(data: ProcessFlowChartData): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const chart = buildProcessFlowPrintMarkup(data.nodes, data.arrowStyle, data.boxStyle)
  const drawing = chart
    ? `<div class="pfc-drawing-wrap">${chart}</div>`
    : data.drawingDataUrl.trim()
      ? `<div class="pfc-drawing-wrap"><img src="${esc(data.drawingDataUrl)}" alt="Process flow chart" class="pfc-drawing-image"/></div>`
      : `<div class="pfc-drawing-placeholder">Process flow chart has not been added yet.<br/>Open Process Flow Chart &amp; Description, build the hierarchy, save, then print.</div>`

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
  .pfc-drawing-wrap {
    margin: 12px 0;
    text-align: center;
    overflow: hidden;
    border: 1px solid #a8a29e;
    background: #fffdf8;
    padding: 10px 8px;
  }
  .pfc-drawing-image { max-width: 100%; max-height: 160mm; object-fit: contain; }
  .pfc-fit {
    display: block;
    margin: 0 auto;
    overflow: hidden;
    max-width: 100%;
  }
  .pfc-scale {
    display: block;
  }
  .pfc-svg {
    display: block;
    margin: 0 auto;
    width: auto;
    max-width: 100%;
    height: auto;
    max-height: 125mm;
    background: #fffdf8;
  }
  .pfc-canvas {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    min-width: min-content;
    margin: 0 auto;
    font-family: Arial, Helvetica, sans-serif;
  }
  .pfc-root-row {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: flex-start;
    justify-content: center;
    gap: 28px;
  }
  .pfc-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: max-content;
  }
  .pfc-box {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 0 8px;
    border: 2px solid #92400e;
    background: #fffbeb;
    color: #78350f;
    font-weight: 700;
    text-align: center;
    line-height: 1.2;
    word-break: break-word;
  }
  .pfc-branch-single {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .pfc-branch-multi {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: max-content;
    max-width: 100%;
  }
  .pfc-stem {
    flex-shrink: 0;
  }
  .pfc-fork-row {
    position: relative;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: flex-start;
    justify-content: center;
  }
  .pfc-hline {
    position: absolute;
    top: 0;
    z-index: 0;
    pointer-events: none;
  }
  .pfc-branch-col {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 10px;
  }
  .pfc-down, .pfc-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    flex-shrink: 0;
  }
  .pfc-vline {
    flex: 1 1 auto;
    min-height: 4px;
  }
  .pfc-ah { display: block; flex-shrink: 0; }
  .pfc-ah-triangle {
    width: 0;
    height: 0;
    border-left-style: solid;
    border-right-style: solid;
    border-left-color: transparent;
    border-right-color: transparent;
    border-bottom: none;
  }
  .pfc-ah-diamond {
    transform: rotate(45deg);
  }
  .pfc-ah-circle {
    border-radius: 50%;
  }
  .pfc-ah-chevron {
    box-sizing: border-box;
    border-left: 2px solid;
    border-bottom: 2px solid;
    transform: rotate(-45deg);
    margin-bottom: 2px;
  }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
  ${PROCESS_DESCRIPTION_PRINT_STYLES}
  @media print {
    .pfc-drawing-wrap, .pfc-svg, .pfc-fit {
      overflow: visible !important;
      background: #fff !important;
      border-color: #000 !important;
    }
    .pfc-box {
      background: #fff !important;
      border-color: #000 !important;
      color: #000 !important;
      -webkit-text-fill-color: #000 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .pfc-ah-triangle {
      border-top-color: #000 !important;
    }
    .pfc-vline, .pfc-hline, .pfc-stem {
      background: #000 !important;
      border-color: #000 !important;
    }
  }
`

export function buildProcessFlowChartHtml(data: ProcessFlowChartData): string {
  const descriptionSheet = buildProcessDescriptionSheetHtml({
    ...data,
    descriptionPoints: data.descriptionPoints,
  })
  return buildPrintPage({
    title: `Process Flow Chart & Description — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: `${buildChartSheet(data)}${descriptionSheet}`,
  })
}

/** Maps a BIS project row + client + consultancy context into Process Flow Chart fields. */
export function processFlowChartDataFromPrintData(printData: BisPrintData): ProcessFlowChartData {
  const ctx = applicantContextFromPrintData(printData)
  const parsed = parseProcessFlowPayload(
    printData.modulePayload && typeof printData.modulePayload === 'object'
      ? (printData.modulePayload as Record<string, unknown>)
      : null,
  )
  const sig = printSignatoryDefaults(printData)
  return {
    ...ctx,
    drawingDataUrl: '',
    nodes: parsed.nodes,
    arrowStyle: parsed.arrowStyle,
    boxStyle: parsed.boxStyle,
    descriptionPoints: parsed.descriptionPoints,
    signatoryName: sig.signatoryName,
    signatoryDesignation: sig.signatoryDesignation,
  }
}
