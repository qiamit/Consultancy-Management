/** Placeholder HTML for upload-only BIS annex modules (files preferred via hybrid merge). */

import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  inspectionDateOrToday,
  letterheadHtml,
  preparedByHtml,
  toBlockHtml,
} from './printDocumentShared'

function buildFileAnnexBody(opts: {
  title: string
  bodyLine: string
  printData: BisPrintData
}): string {
  const ctx = applicantContextFromPrintData(opts.printData)
  const letterDate = inspectionDateOrToday(ctx.dateOfInspection)
  return `
<div class="pd-sheet">
  ${letterheadHtml(ctx)}
  <h1 class="pd-title">${esc(opts.title)}</h1>
  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(ctx.bisBranchName, ctx.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(ctx.applicationNumber))}</div>
    </div>
  </div>
  <p class="pd-body">Respected / Sir,</p>
  <p class="pd-body">${esc(opts.bodyLine)}</p>
  <div class="pfc-drawing-placeholder" style="margin:12px 0;min-height:60mm;border:1.5px dashed #a8a29e;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;font-size:12px;color:#57534e;background:#fafaf9;">
    No file uploaded yet.<br/>Open Module Edit to upload, then View / Download.
  </div>
  ${preparedByHtml(ctx.preparedBy)}
</div>`
}

export function buildCalibrationCertificatesHtml(printData: BisPrintData): string {
  const ctx = applicantContextFromPrintData(printData)
  return buildPrintPage({
    title: `Calibration Certificates — ${ctx.applicantName || 'Applicant'}`,
    styles: '',
    body: buildFileAnnexBody({
      title: 'Calibration Certificates',
      bodyLine:
        'Please find enclosed the calibration certificates of the testing equipment installed at our manufacturing unit for your kind perusal and record.',
      printData,
    }),
  })
}

export function buildConsentLetterHtml(printData: BisPrintData): string {
  const ctx = applicantContextFromPrintData(printData)
  return buildPrintPage({
    title: `Consent Letter — ${ctx.applicantName || 'Applicant'}`,
    styles: '',
    body: buildFileAnnexBody({
      title: 'Consent Letter',
      bodyLine:
        'Please find enclosed the consent letter in connection with our BIS licence / certification application for your kind perusal and record.',
      printData,
    }),
  })
}
