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

export type LocationMapData = PrintApplicantContext & {
  latitude: string
  longitude: string
  mapsUrl: string
  signatoryName: string
  signatoryDesignation: string
}

function buildBody(data: LocationMapData): string {
  const letterDate = dateOrNa(data.dateOfInspection.trim() || data.dateOfApplication)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const lat = data.latitude.trim() || '________________'
  const lng = data.longitude.trim() || '________________'
  const mapsLink = data.mapsUrl.trim()
  const mapBox = mapsLink
    ? `<p class="pd-body"><strong>Google Maps:</strong> <a href="${esc(mapsLink)}">${esc(mapsLink)}</a></p>
       <div class="loc-map-placeholder">Open the maps link above for the factory location route / pin.</div>`
    : `<div class="loc-map-placeholder">
         Location map coordinates / route sketch not yet attached.<br/>
         Latitude: ${esc(lat)} &nbsp;·&nbsp; Longitude: ${esc(lng)}
       </div>`

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Location Map of the Factory</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">Respected / Sir,</p>
  <p class="pd-body">
    We hereby submit the location map / route sketch of our manufacturing unit for your kind
    reference in connection with our BIS licence application. The factory is situated at
    <strong>${esc(data.applicantAddress || '________________')}</strong>.
  </p>

  <table class="pd-meta">
    <tr><td class="pd-lbl">Applicant</td><td colspan="3"><strong>${esc(data.applicantName || '—')}</strong></td></tr>
    <tr><td class="pd-lbl">Factory Address</td><td colspan="3">${esc(data.applicantAddress || '—')}</td></tr>
    <tr>
      <td class="pd-lbl">Latitude</td><td>${esc(lat)}</td>
      <td class="pd-lbl">Longitude</td><td>${esc(lng)}</td>
    </tr>
    <tr>
      <td class="pd-lbl">IS Code</td><td>${esc(data.isNumber || '—')}</td>
      <td class="pd-lbl">Application No.</td><td>${esc(applicationNoDisplay(data.applicationNumber))}</td>
    </tr>
  </table>

  ${mapBox}

  <p class="pd-body">
    We hereby declare that the above particulars are true and correct to the best of our knowledge and belief.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .loc-map-placeholder {
    margin: 12px 0;
    min-height: 70mm;
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
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildLocationMapHtml(data: LocationMapData): string {
  return buildPrintPage({
    title: `Location Map — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + consultancy context into Location Map fields. */
export function locationMapDataFromPrintData(printData: BisPrintData): LocationMapData {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    latitude: '',
    longitude: '',
    mapsUrl: '',
    signatoryName: printData.client.contactPerson,
    signatoryDesignation: '',
  }
}
