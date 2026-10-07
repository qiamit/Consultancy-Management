import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'
import { fetchDrivingRoute, isValidLatLng } from './locationMapModel'

type RouteMeta = {
  distanceKm: number
  durationMin: number
}

function pinIcon(label: string, tone: 'amber' | 'stone') {
  const bg = tone === 'amber' ? '#b45309' : '#44403c'
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    html: `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">
      <span style="background:${bg};color:#fff;font:700 10px/1 ui-sans-serif,system-ui;padding:3px 5px;border-radius:2px">${label}</span>
      <span style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${bg}"></span>
    </div>`,
  })
}

/**
 * Road-map preview: OSM tiles + OSRM driving route (Google iframe embed is blocked).
 * Keep the map non-interactive until the parent unlocks it (Design Mode / form focus).
 */
export function LocationRouteMapPreview({
  firmLatitude,
  firmLongitude,
  bisLatitude,
  bisLongitude,
  firmLabel,
  bisLabel,
  interactive,
  className,
}: {
  firmLatitude: string
  firmLongitude: string
  bisLatitude: string
  bisLongitude: string
  firmLabel: string
  bisLabel: string
  interactive: boolean
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [routeMeta, setRouteMeta] = useState<RouteMeta | null>(null)
  const [routeStatus, setRouteStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const firmOk = isValidLatLng(firmLatitude, firmLongitude)
  const bisOk = isValidLatLng(bisLatitude, bisLongitude)
  const firmLat = Number(firmLatitude)
  const firmLng = Number(firmLongitude)
  const bisLat = Number(bisLatitude)
  const bisLng = Number(bisLongitude)

  // Create map once
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    }).setView([20.5937, 78.9629], 5)
    L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google',
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    // Leaflet needs a size pass after dialog layout.
    requestAnimationFrame(() => map.invalidateSize())
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  // Toggle interaction without remounting
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const on = interactive
    map.dragging[on ? 'enable' : 'disable']()
    map.scrollWheelZoom[on ? 'enable' : 'disable']()
    map.doubleClickZoom[on ? 'enable' : 'disable']()
    map.boxZoom[on ? 'enable' : 'disable']()
    map.keyboard[on ? 'enable' : 'disable']()
  }, [interactive])

  // Draw markers + driving route when coords change (debounced)
  useEffect(() => {
    const map = mapRef.current
    const layers = layerRef.current
    if (!map || !layers) return

    let cancelled = false
    const ac = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        layers.clearLayers()
        setRouteMeta(null)

        if (!firmOk && !bisOk) {
          setRouteStatus('idle')
          map.setView([20.5937, 78.9629], 5)
          return
        }

        const points: L.LatLngExpression[] = []
        if (firmOk) {
          L.marker([firmLat, firmLng], { icon: pinIcon('A', 'amber'), title: firmLabel || 'Company' })
            .bindTooltip(firmLabel.trim() || 'Company (From)', { permanent: false })
            .addTo(layers)
          points.push([firmLat, firmLng])
        }
        if (bisOk) {
          L.marker([bisLat, bisLng], { icon: pinIcon('B', 'stone'), title: bisLabel || 'BIS Branch' })
            .bindTooltip(bisLabel.trim() || 'BIS Branch (To)', { permanent: false })
            .addTo(layers)
          points.push([bisLat, bisLng])
        }

        if (firmOk && bisOk) {
          setRouteStatus('loading')
          try {
            const route = await fetchDrivingRoute(
              firmLatitude,
              firmLongitude,
              bisLatitude,
              bisLongitude,
              ac.signal,
            )
            if (cancelled) return
            if (route) {
              L.polyline(route.coords, {
                color: route.isRoadRoute ? '#b45309' : '#a8a29e',
                weight: route.isRoadRoute ? 5 : 3,
                opacity: 0.9,
                dashArray: route.isRoadRoute ? undefined : '6 6',
              }).addTo(layers)
              points.push(...route.coords)
              setRouteMeta({
                distanceKm: route.distanceKm,
                durationMin: route.durationMin,
              })
              setRouteStatus(route.isRoadRoute ? 'ready' : 'error')
            } else {
              setRouteStatus('error')
            }
          } catch {
            if (!cancelled) setRouteStatus('error')
          }
        } else {
          setRouteStatus('idle')
        }

        if (points.length > 0) {
          map.fitBounds(L.latLngBounds(points).pad(0.18), { maxZoom: 14, animate: false })
        }
        map.invalidateSize()
      })()
    }, 350)

    return () => {
      cancelled = true
      ac.abort()
      window.clearTimeout(timer)
    }
  }, [
    firmOk,
    bisOk,
    firmLat,
    firmLng,
    bisLat,
    bisLng,
    firmLatitude,
    firmLongitude,
    bisLatitude,
    bisLongitude,
    firmLabel,
    bisLabel,
  ])

  // Dialog resize / unlock — keep tiles sized correctly
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const t = window.setTimeout(() => map.invalidateSize(), 80)
    return () => window.clearTimeout(t)
  }, [interactive, firmOk, bisOk])

  return (
    <div className={cn('relative w-full', className)}>
      {(firmOk || bisOk) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[11px] text-stone-700">
          {firmOk ? (
            <span>
              <span className="font-bold text-amber-800">From (A)</span>{' '}
              <span className="font-medium">{firmLabel.trim() || 'Company'}</span>
              <span className="tabular-nums text-stone-500">
                {' '}
                · {firmLatitude.trim()}, {firmLongitude.trim()}
              </span>
            </span>
          ) : null}
          {firmOk && bisOk ? <span className="text-stone-400">→</span> : null}
          {bisOk ? (
            <span>
              <span className="font-bold text-stone-800">To (B)</span>{' '}
              <span className="font-medium">{bisLabel.trim() || 'BIS Branch'}</span>
              <span className="tabular-nums text-stone-500">
                {' '}
                · {bisLatitude.trim()}, {bisLongitude.trim()}
              </span>
            </span>
          ) : null}
          {routeStatus === 'loading' ? (
            <span className="text-stone-500">Loading road route…</span>
          ) : null}
          {routeMeta ? (
            <span className="font-semibold text-amber-900">
              {routeMeta.distanceKm.toFixed(1)} km · ~{routeMeta.durationMin} min drive
            </span>
          ) : null}
          {routeStatus === 'error' ? (
            <span className="text-stone-500">Route line fallback (routing unavailable)</span>
          ) : null}
        </div>
      )}
      <div
        ref={containerRef}
        className="h-[min(52vh,420px)] w-full border border-stone-400 bg-white [&_.leaflet-control-attribution]:text-[9px]"
      />
    </div>
  )
}
