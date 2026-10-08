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
  buildLocationRouteMapSvg,
  defaultBisToLocation,
  fetchDrivingRoute,
  googleMapsDirectionsLink,
  googleMapsPinLink,
  isValidLatLng,
  parseLocationMapPayload,
} from '../projects/locationMapModel'

export type LocationMapData = PrintApplicantContext & {
  firmLatitude: string
  firmLongitude: string
  bisLatitude: string
  bisLongitude: string
  toLocation: string
  mapsUrl: string
  /** Inline SVG markup for From → To route (print-safe, no external map host). */
  routeMapSvg: string
  signatoryName: string
  signatoryDesignation: string
  signatureImageUrl?: string
}

function valueOrBlank(raw: string): string {
  const v = raw.trim()
  return v ? esc(v) : '________________'
}

function buildBody(data: LocationMapData): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const firmOk = isValidLatLng(data.firmLatitude, data.firmLongitude)
  const bisOk = isValidLatLng(data.bisLatitude, data.bisLongitude)
  const toLocation =
    data.toLocation.trim() ||
    defaultBisToLocation(
      [data.bisBranchName, data.bisBranchState].map((x) => x.trim()).filter(Boolean).join(', '),
    )

  const mapImage = data.routeMapSvg.trim()
    ? `<div class="loc-map-wrap">${data.routeMapSvg}</div>`
    : `<div class="loc-map-placeholder">
         Location map coordinates / route sketch not yet attached.<br/>
         From: ${valueOrBlank(data.firmLatitude)}, ${valueOrBlank(data.firmLongitude)}
         ${bisOk ? `<br/>To: ${esc(data.bisLatitude)}, ${esc(data.bisLongitude)}` : ''}
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
    <strong>${esc(data.applicantAddress || '________________')}</strong>
    ${
      toLocation
        ? `, with route reference to
    (<strong>${esc(toLocation)}</strong>).`
        : '.'
    }
  </p>

  <table class="pd-meta">
    <tr><td class="pd-lbl">From Location</td><td colspan="3"><strong>${esc(data.applicantName || '—')}</strong></td></tr>
    <tr><td class="pd-lbl">Factory Address</td><td colspan="3">${esc(data.applicantAddress || '—')}</td></tr>
    <tr>
      <td class="pd-lbl">To Location</td>
      <td colspan="3">${esc(toLocation || '—')}</td>
    </tr>
    <tr>
      <td class="pd-lbl">From Latitude</td><td>${firmOk ? esc(data.firmLatitude) : '________________'}</td>
      <td class="pd-lbl">From Longitude</td><td>${firmOk ? esc(data.firmLongitude) : '________________'}</td>
    </tr>
    <tr>
      <td class="pd-lbl">To Latitude</td><td>${bisOk ? esc(data.bisLatitude) : '________________'}</td>
      <td class="pd-lbl">To Longitude</td><td>${bisOk ? esc(data.bisLongitude) : '________________'}</td>
    </tr>
  </table>

  ${mapImage}

  <p class="pd-body">
    We hereby declare that the above particulars are true and correct to the best of our knowledge and belief.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({
    firmName: data.applicantName,
    name: sigName,
    designation: data.signatoryDesignation,
    signatureImageUrl: data.signatureImageUrl,
  })}</div>
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
  .loc-map-wrap { margin: 10px 0 4px; text-align: center; border: 1px solid #a8a29e; background: #fff; }
  .loc-map-wrap svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
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

/** Sync base fields; call enrichLocationMapRoute for road geometry SVG. */
export function locationMapDataFromPrintData(printData: BisPrintData): LocationMapData {
  const ctx = applicantContextFromPrintData(printData)
  const parsed = parseLocationMapPayload(
    printData.modulePayload && typeof printData.modulePayload === 'object'
      ? (printData.modulePayload as Record<string, unknown>)
      : null,
  )
  const sig = printSignatoryDefaults(printData)
  const firmOk = isValidLatLng(parsed.firmLatitude, parsed.firmLongitude)
  const bisOk = isValidLatLng(parsed.bisLatitude, parsed.bisLongitude)
  const branchLabel = [ctx.bisBranchName, ctx.bisBranchState]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(', ')
  const toLocation = parsed.toLocation.trim() || defaultBisToLocation(branchLabel)

  let mapsUrl = ''
  if (firmOk && bisOk) {
    mapsUrl = googleMapsDirectionsLink(
      parsed.firmLatitude,
      parsed.firmLongitude,
      parsed.bisLatitude,
      parsed.bisLongitude,
    )
  } else if (firmOk) {
    mapsUrl = googleMapsPinLink(parsed.firmLatitude, parsed.firmLongitude)
  } else if (bisOk) {
    mapsUrl = googleMapsPinLink(parsed.bisLatitude, parsed.bisLongitude)
  }

  // Placeholder SVG without route (enrichment replaces with road path when possible).
  const routeMapSvg = buildLocationRouteMapSvg({
    firmLat: parsed.firmLatitude,
    firmLng: parsed.firmLongitude,
    bisLat: parsed.bisLatitude,
    bisLng: parsed.bisLongitude,
    firmLabel: ctx.applicantName || 'From (A)',
    bisLabel: toLocation,
  })

  return {
    ...ctx,
    firmLatitude: parsed.firmLatitude,
    firmLongitude: parsed.firmLongitude,
    bisLatitude: parsed.bisLatitude,
    bisLongitude: parsed.bisLongitude,
    toLocation,
    mapsUrl,
    routeMapSvg,
    signatoryName: sig.signatoryName,
    signatoryDesignation: sig.signatoryDesignation,
    signatureImageUrl: sig.signatureImageUrl,
  }
}

/** Fetch OSRM driving geometry and rebuild print SVG with From → To road route. */
export async function enrichLocationMapRoute(data: LocationMapData): Promise<LocationMapData> {
  const firmOk = isValidLatLng(data.firmLatitude, data.firmLongitude)
  const bisOk = isValidLatLng(data.bisLatitude, data.bisLongitude)
  if (!firmOk || !bisOk) return data

  const route = await fetchDrivingRoute(
    data.firmLatitude,
    data.firmLongitude,
    data.bisLatitude,
    data.bisLongitude,
  )
  if (!route) return data

  return {
    ...data,
    routeMapSvg: buildLocationRouteMapSvg({
      firmLat: data.firmLatitude,
      firmLng: data.firmLongitude,
      bisLat: data.bisLatitude,
      bisLng: data.bisLongitude,
      firmLabel: data.applicantName || 'From (A)',
      bisLabel: data.toLocation || 'To (B)',
      routeCoords: route.coords,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      isRoadRoute: route.isRoadRoute,
    }),
  }
}
