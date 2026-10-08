/** Location Map — firm / nearest BIS coordinates for Google Maps + print. */

export type LocationMapModulePayload = {
  firmLatitude: string
  firmLongitude: string
  bisLatitude: string
  bisLongitude: string
  /** Editable "To Location" label (defaults to Bureau of Indian Standards - Branch). */
  toLocation: string
}

export function emptyLocationMapPayload(): LocationMapModulePayload {
  return {
    firmLatitude: '',
    firmLongitude: '',
    bisLatitude: '',
    bisLongitude: '',
    toLocation: '',
  }
}

/** Auto label: "Bureau of Indian Standards - {branch}" (branch optional). */
export function defaultBisToLocation(branchName: string): string {
  const branch = branchName.trim()
  return branch
    ? `Bureau of Indian Standards - ${branch}`
    : 'Bureau of Indian Standards'
}

function str(raw: unknown): string {
  return String(raw ?? '').trim()
}

export function parseLocationMapPayload(
  payload: Record<string, unknown> | null,
): LocationMapModulePayload {
  // Legacy single-point fields → firm
  const firmLat = str(
    payload?.firmLatitude ?? payload?.firm_latitude ?? payload?.latitude,
  )
  const firmLng = str(
    payload?.firmLongitude ?? payload?.firm_longitude ?? payload?.longitude,
  )
  return {
    firmLatitude: firmLat,
    firmLongitude: firmLng,
    bisLatitude: str(payload?.bisLatitude ?? payload?.bis_latitude),
    bisLongitude: str(payload?.bisLongitude ?? payload?.bis_longitude),
    toLocation: str(
      payload?.toLocation ?? payload?.to_location ?? payload?.bisLocationName,
    ),
  }
}

export type LatLng = { lat: string; lng: string }

/** Parse Google Maps paste: "lat, lng", URL @lat,lng, q=, !3d/!4d, etc. */
export function parseLatLngPaste(raw: string): LatLng | null {
  const text = String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2212/g, '-')
    .trim()
  if (!text) return null

  const at = text.match(/@(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  if (at?.[1] && at[2]) return normalizePair(at[1], at[2])

  const bang = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (bang?.[1] && bang[2]) return normalizePair(bang[1], bang[2])

  const q = text.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i)
  if (q?.[1] && q[2]) return normalizePair(q[1], q[2])

  const ll = text.match(/[?&]ll=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i)
  if (ll?.[1] && ll[2]) return normalizePair(ll[1], ll[2])

  // Google Maps "Copy coordinates" → "27.130200, 78.140300" (also ; / tab / newline)
  const plain = text.match(
    /^(-?\d+(?:\.\d+)?)\s*[,;\t/\n]+\s*(-?\d+(?:\.\d+)?)\s*$/,
  )
  if (plain?.[1] && plain[2]) return normalizePair(plain[1], plain[2])

  // Loose: first two decimal numbers anywhere (e.g. "Lat 27.13 Lon 78.14")
  const loose = text.match(/(-?\d+(?:\.\d+)?)\s*[,;\t/\s]+\s*(-?\d+(?:\.\d+)?)/)
  if (loose?.[1] && loose[2]) return normalizePair(loose[1], loose[2])

  return null
}

function normalizePair(latRaw: string, lngRaw: string): LatLng | null {
  const lat = latRaw.trim()
  const lng = lngRaw.trim()
  if (!isValidLatLng(lat, lng)) return null
  return { lat, lng }
}

export function isValidLatLng(lat: string, lng: string): boolean {
  const a = Number(lat)
  const b = Number(lng)
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    a >= -90 &&
    a <= 90 &&
    b >= -180 &&
    b <= 180
  )
}

export function coordsPair(lat: string, lng: string): string {
  return `${lat.trim()},${lng.trim()}`
}

/** Google Maps pin embed (no API key). */
export function googleMapsPinEmbedUrl(lat: string, lng: string): string {
  const q = encodeURIComponent(coordsPair(lat, lng))
  return `https://maps.google.com/maps?q=${q}&z=16&output=embed`
}

/** Google Maps directions embed firm → BIS (no API key). */
export function googleMapsDirectionsEmbedUrl(
  firmLat: string,
  firmLng: string,
  bisLat: string,
  bisLng: string,
): string {
  const saddr = encodeURIComponent(coordsPair(firmLat, firmLng))
  const daddr = encodeURIComponent(coordsPair(bisLat, bisLng))
  return `https://maps.google.com/maps?saddr=${saddr}&daddr=${daddr}&output=embed`
}

export function googleMapsDirectionsLink(
  firmLat: string,
  firmLng: string,
  bisLat: string,
  bisLng: string,
): string {
  const origin = encodeURIComponent(coordsPair(firmLat, firmLng))
  const destination = encodeURIComponent(coordsPair(bisLat, bisLng))
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`
}

export function googleMapsPinLink(lat: string, lng: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(coordsPair(lat, lng))}`
}

export type DrivingRouteResult = {
  /** [lat, lng] points along the driving route (or straight fallback). */
  coords: Array<[number, number]>
  distanceKm: number
  durationMin: number
  /** True when OSRM returned a road geometry (not straight-line fallback). */
  isRoadRoute: boolean
}

/** Fetch driving route firm → BIS (OSRM). Falls back to straight line. */
export async function fetchDrivingRoute(
  firmLat: string,
  firmLng: string,
  bisLat: string,
  bisLng: string,
  signal?: AbortSignal,
): Promise<DrivingRouteResult | null> {
  if (!isValidLatLng(firmLat, firmLng) || !isValidLatLng(bisLat, bisLng)) return null
  const fLat = Number(firmLat)
  const fLng = Number(firmLng)
  const bLat = Number(bisLat)
  const bLng = Number(bisLng)
  const path = `${fLng},${fLat};${bLng},${bLat}`
  const endpoints = [
    `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${path}?overview=full&geometries=geojson`,
  ]

  for (const url of endpoints) {
    try {
      const res = await fetch(url, signal ? { signal } : undefined)
      if (!res.ok) continue
      const data = (await res.json()) as {
        routes?: Array<{
          distance: number
          duration: number
          geometry?: { coordinates?: [number, number][] }
        }>
      }
      const route = data.routes?.[0]
      const lngLat = route?.geometry?.coordinates
      if (!route || !lngLat?.length) continue
      return {
        coords: lngLat.map(([lng, lat]) => [lat, lng] as [number, number]),
        distanceKm: route.distance / 1000,
        durationMin: Math.round(route.duration / 60),
        isRoadRoute: true,
      }
    } catch {
      if (signal?.aborted) return null
    }
  }

  // Straight-line fallback so print still shows From → To
  const distKm = haversineKm(fLat, fLng, bLat, bLng)
  return {
    coords: [
      [fLat, fLng],
      [bLat, bLng],
    ],
    distanceKm: distKm,
    durationMin: Math.max(1, Math.round((distKm / 40) * 60)),
    isRoadRoute: false,
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function downsampleCoords(
  coords: Array<[number, number]>,
  maxPoints: number,
): Array<[number, number]> {
  if (coords.length <= maxPoints) return coords
  const out: Array<[number, number]> = []
  const step = (coords.length - 1) / (maxPoints - 1)
  for (let i = 0; i < maxPoints; i++) {
    out.push(coords[Math.round(i * step)]!)
  }
  return out
}

/** Web Mercator world-pixel position at a given zoom (tile size 256). */
function mercatorPx(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom
  const x = ((lng + 180) / 360) * scale
  const sinLat = Math.sin((lat * Math.PI) / 180)
  const y =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  return { x, y }
}

function chooseZoom(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
  mapW: number,
  mapH: number,
): number {
  for (let z = 17; z >= 5; z--) {
    const a = mercatorPx(maxLat, minLng, z)
    const b = mercatorPx(minLat, maxLng, z)
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    if (w <= mapW * 0.92 && h <= mapH * 0.92) return z
  }
  return 5
}

/**
 * Print/preview route map: Google street tiles + From(A)→To(B) path.
 * Markers stay inset inside the map frame (geo + pixel padding).
 */
export function buildLocationRouteMapSvg(opts: {
  firmLat: string
  firmLng: string
  bisLat?: string
  bisLng?: string
  firmLabel?: string
  bisLabel?: string
  routeCoords?: Array<[number, number]> | null
  distanceKm?: number | null
  durationMin?: number | null
  isRoadRoute?: boolean
  width?: number
  height?: number
}): string {
  const firmOk = isValidLatLng(opts.firmLat, opts.firmLng)
  const bisOk =
    opts.bisLat && opts.bisLng ? isValidLatLng(opts.bisLat, opts.bisLng) : false
  if (!firmOk && !bisOk) return ''

  const w = opts.width ?? 900
  const h = opts.height ?? 540
  const headerH = 26
  const footerH = 22
  const framePad = 8
  const mapX = framePad
  const mapY = headerH
  const mapW = w - framePad * 2
  const mapH = h - headerH - footerH

  const fLat = Number(opts.firmLat)
  const fLng = Number(opts.firmLng)
  const bLat = Number(opts.bisLat)
  const bLng = Number(opts.bisLng)

  let route = opts.routeCoords?.length
    ? downsampleCoords(opts.routeCoords, 200)
    : null
  if (!route) {
    const pts: Array<[number, number]> = []
    if (firmOk) pts.push([fLat, fLng])
    if (bisOk) pts.push([bLat, bLng])
    route = pts
  }

  const lats = route.map((p) => p[0])
  const lngs = route.map((p) => p[1])
  if (firmOk) {
    lats.push(fLat)
    lngs.push(fLng)
  }
  if (bisOk) {
    lats.push(bLat)
    lngs.push(bLng)
  }

  let minLat = Math.min(...lats)
  let maxLat = Math.max(...lats)
  let minLng = Math.min(...lngs)
  let maxLng = Math.max(...lngs)

  // Geographic padding so A/B never sit on the frame edge.
  const latPad = Math.max((maxLat - minLat) * 0.32, 0.015)
  const lngPad = Math.max((maxLng - minLng) * 0.32, 0.015)
  minLat -= latPad
  maxLat += latPad
  minLng -= lngPad
  maxLng += lngPad

  const zoom = chooseZoom(minLat, maxLat, minLng, maxLng, mapW, mapH)
  const nw = mercatorPx(maxLat, minLng, zoom)
  const se = mercatorPx(minLat, maxLng, zoom)
  const worldW = Math.max(1, se.x - nw.x)
  const worldH = Math.max(1, se.y - nw.y)
  const scale = Math.min(mapW / worldW, mapH / worldH)
  const contentW = worldW * scale
  const contentH = worldH * scale
  const ox = mapX + (mapW - contentW) / 2
  const oy = mapY + (mapH - contentH) / 2
  const toXy = (lat: number, lng: number): [number, number] => {
    const p = mercatorPx(lat, lng, zoom)
    return [ox + (p.x - nw.x) * scale, oy + (p.y - nw.y) * scale]
  }

  return finishRouteMapSvg({
    w,
    h,
    mapX,
    mapY,
    mapW,
    mapH,
    zoom,
    nw,
    scale,
    ox,
    oy,
    toXy,
    route,
    firmOk,
    bisOk,
    fLat,
    fLng,
    bLat,
    bLng,
    firmLabel: (opts.firmLabel ?? 'From (A)').trim() || 'From (A)',
    bisLabel: (opts.bisLabel ?? 'To (B)').trim() || 'To (B)',
    distanceKm: opts.distanceKm,
    durationMin: opts.durationMin,
    isRoadRoute: opts.isRoadRoute,
    firmOkBoth: firmOk && bisOk,
  })
}

function finishRouteMapSvg(args: {
  w: number
  h: number
  mapX: number
  mapY: number
  mapW: number
  mapH: number
  zoom: number
  nw: { x: number; y: number }
  scale: number
  ox: number
  oy: number
  toXy: (lat: number, lng: number) => [number, number]
  route: Array<[number, number]>
  firmOk: boolean
  bisOk: boolean
  fLat: number
  fLng: number
  bLat: number
  bLng: number
  firmLabel: string
  bisLabel: string
  distanceKm?: number | null
  durationMin?: number | null
  isRoadRoute?: boolean
  firmOkBoth: boolean
}): string {
  const {
    w,
    h,
    mapX,
    mapY,
    mapW,
    mapH,
    zoom,
    nw,
    scale,
    ox,
    oy,
    toXy,
    route,
    firmOk,
    bisOk,
    fLat,
    fLng,
    bLat,
    bLng,
    firmLabel,
    bisLabel,
    distanceKm,
    durationMin,
    isRoadRoute,
    firmOkBoth,
  } = args

  const pathD = route
    .map((p, i) => {
      const [x, y] = toXy(p[0], p[1])
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const firmPt = firmOk ? toXy(fLat, fLng) : null
  const bisPt = bisOk ? toXy(bLat, bLng) : null

  // Tile mosaic covering the map viewport in world pixels.
  const tileSize = 256
  const worldLeft = nw.x
  const worldTop = nw.y
  const viewLeft = worldLeft - (ox - mapX) / scale
  const viewTop = worldTop - (oy - mapY) / scale
  const viewRight = viewLeft + mapW / scale
  const viewBottom = viewTop + mapH / scale
  const tMinX = Math.floor(viewLeft / tileSize)
  const tMaxX = Math.floor((viewRight - 0.001) / tileSize)
  const tMinY = Math.floor(viewTop / tileSize)
  const tMaxY = Math.floor((viewBottom - 0.001) / tileSize)
  const maxIndex = 2 ** zoom

  const tiles: string[] = []
  for (let ty = tMinY; ty <= tMaxY; ty++) {
    for (let tx = tMinX; tx <= tMaxX; tx++) {
      if (tx < 0 || ty < 0 || tx >= maxIndex || ty >= maxIndex) continue
      const sub = (tx + ty) % 4
      // Google Maps roadmap tiles (street background for print).
      const href = `https://mt${sub}.google.com/vt/lyrs=m&hl=en&x=${tx}&y=${ty}&z=${zoom}`
      const imgX = ox + (tx * tileSize - worldLeft) * scale
      const imgY = oy + (ty * tileSize - worldTop) * scale
      const imgW = tileSize * scale
      const imgH = tileSize * scale
      tiles.push(
        `<image href="${href}" xlink:href="${href}" x="${imgX.toFixed(1)}" y="${imgY.toFixed(1)}" width="${imgW.toFixed(1)}" height="${imgH.toFixed(1)}" preserveAspectRatio="none" />`,
      )
    }
  }

  const metaParts: string[] = []
  if (distanceKm != null && Number.isFinite(distanceKm)) {
    metaParts.push(`${distanceKm.toFixed(1)} km`)
  }
  if (durationMin != null && Number.isFinite(durationMin)) {
    metaParts.push(`~${durationMin} min`)
  }
  if (isRoadRoute === false && firmOkBoth) {
    metaParts.push('straight-line fallback')
  }
  const meta = metaParts.join(' · ')

  const escXml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const pin = (xy: [number, number], letter: string, fill: string) => `
    <g>
      <circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="9" fill="${fill}" stroke="#fff" stroke-width="2.5"/>
      <text x="${xy[0].toFixed(1)}" y="${(xy[1] + 3.8).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="system-ui,sans-serif">${letter}</text>
    </g>`

  const clipId = `locmap-clip-${zoom}-${Math.round(nw.x)}-${Math.round(nw.y)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Location route map on Google Maps">
  <defs>
    <clipPath id="${clipId}"><rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}"/></clipPath>
  </defs>
  <rect width="100%" height="100%" fill="#f7f3eb"/>
  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="none" stroke="#78716c" stroke-width="1.5"/>
  <text x="${mapX}" y="17" font-size="12" font-weight="700" fill="#44403c" font-family="system-ui,sans-serif">Route Map — From (A) → To (B)${meta ? ` · ${escXml(meta)}` : ''}</text>
  <rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" fill="#e7e5e4" stroke="#a8a29e"/>
  <g clip-path="url(#${clipId})">
    ${tiles.join('\n    ')}
    ${
      firmOkBoth
        ? `<path d="${pathD}" fill="none" stroke="#b45309" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
    <path d="${pathD}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`
        : ''
    }
    ${firmPt ? pin(firmPt, 'A', '#b45309') : ''}
    ${bisPt ? pin(bisPt, 'B', '#1c1917') : ''}
  </g>
  <rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" fill="none" stroke="#78716c" stroke-width="1"/>
  <text x="${mapX}" y="${h - 7}" font-size="10" fill="#57534e" font-family="system-ui,sans-serif">A: ${escXml(firmLabel)}${firmOk ? ` (${fLat.toFixed(5)}, ${fLng.toFixed(5)})` : ''}${bisOk ? `   ·   B: ${escXml(bisLabel)} (${bLat.toFixed(5)}, ${bLng.toFixed(5)})` : ''}</text>
</svg>`
}

/** @deprecated External host is unreliable; prefer buildLocationRouteMapSvg. */
export function osmStaticMapUrl(opts: {
  firmLat: string
  firmLng: string
  bisLat?: string
  bisLng?: string
}): string {
  // Kept for callers; returns empty so print falls through to SVG route map.
  void opts
  return ''
}
