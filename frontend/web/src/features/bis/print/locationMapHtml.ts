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
  formatCoordinate,
} from '../projects/locationMapModel'

export type LocationMapData = PrintApplicantContext & {
  firmLatitude: string
  firmLongitude: string
  bisLatitude: string
  bisLongitude: string
  toLocation: string
  toLocationAddress: string
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
  const recipientBranchName = data.bisBranchName.replace(
    /^Bureau of Indian Standards\s*[-–—:]\s*/i,
    '',
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
    <div class="pd-to-block">${toBlockHtml(recipientBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">Respected Sir,</p>
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

  <table class="pd-meta pd-location-pair">
    <thead><tr><th>Location From</th><th>Location To</th></tr></thead>
    <tbody><tr>
      <td><strong>${esc(data.applicantName || '—')}</strong><br/>${esc(data.applicantAddress || 'Address unavailable')}<br/><span class="pd-coordinates">Latitude: ${firmOk ? esc(formatCoordinate(data.firmLatitude)) : '—'} &nbsp;·&nbsp; Longitude: ${firmOk ? esc(formatCoordinate(data.firmLongitude)) : '—'}</span></td>
      <td><strong>${esc(toLocation || '—')}</strong><br/>${esc(data.toLocationAddress || 'Address unavailable')}<br/><span class="pd-coordinates">Latitude: ${bisOk ? esc(formatCoordinate(data.bisLatitude)) : '—'} &nbsp;·&nbsp; Longitude: ${bisOk ? esc(formatCoordinate(data.bisLongitude)) : '—'}</span></td>
    </tr></tbody>
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
  .pd-location-pair { table-layout: fixed; }
  .pd-location-pair th { width: 50%; border: 1.25px solid #000; padding: 5px 7px; text-align: left; background: #fff; color: #000; }
  .pd-location-pair td { width: 50%; border: 1.25px solid #000; padding: 7px; vertical-align: top; line-height: 1.5; overflow-wrap: anywhere; color: #000; }
  .pd-coordinates { display: inline-block; margin-top: 4px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; color: #000; }
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
    background: #fff;
  }
  .loc-map-wrap { margin: 10px 0 4px; text-align: center; border: 1.25px solid #000; background: #fff; }
  .loc-map-wrap svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: right; margin-left: auto; }
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
  const firmLatitude = printData.client.latitude || parsed.firmLatitude
  const firmLongitude = printData.client.longitude || parsed.firmLongitude
  const bisLatitude = String(printData.modulePayload?.bisLatitude ?? '').trim() || parsed.bisLatitude
  const bisLongitude = String(printData.modulePayload?.bisLongitude ?? '').trim() || parsed.bisLongitude
  const firmOk = isValidLatLng(firmLatitude, firmLongitude)
  const bisOk = isValidLatLng(bisLatitude, bisLongitude)
  const branchLabel = [ctx.bisBranchName, ctx.bisBranchState]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(', ')
  const toLocation =
    parsed.toLocation.trim() ||
    printData.row.branch_name?.trim() ||
    defaultBisToLocation(branchLabel)

  let mapsUrl = ''
  if (firmOk && bisOk) {
    mapsUrl = googleMapsDirectionsLink(
      firmLatitude,
      firmLongitude,
      bisLatitude,
      bisLongitude,
    )
  } else if (firmOk) {
    mapsUrl = googleMapsPinLink(firmLatitude, firmLongitude)
  } else if (bisOk) {
    mapsUrl = googleMapsPinLink(bisLatitude, bisLongitude)
  }

  // Placeholder SVG without route (enrichment replaces with road path when possible).
  const routeMapSvg = buildLocationRouteMapSvg({
    firmLat: firmLatitude,
    firmLng: firmLongitude,
    bisLat: bisLatitude,
    bisLng: bisLongitude,
    firmLabel: ctx.applicantName || 'From (A)',
    bisLabel: toLocation,
  })

  return {
    ...ctx,
    firmLatitude,
    firmLongitude,
    bisLatitude,
    bisLongitude,
    toLocation,
    toLocationAddress: String(printData.modulePayload?.toLocationAddress ?? '').trim(),
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
