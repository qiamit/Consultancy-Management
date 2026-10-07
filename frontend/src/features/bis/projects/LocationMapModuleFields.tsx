import { useMemo, useState, type ClipboardEvent, type ReactNode } from 'react'
import { ExternalLink, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { limsFieldClass, limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  defaultBisToLocation,
  googleMapsDirectionsLink,
  googleMapsPinLink,
  isValidLatLng,
  parseLatLngPaste,
  type LocationMapModulePayload,
} from './locationMapModel'
import { LocationRouteMapPreview } from './LocationRouteMapPreview'

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <Label htmlFor={htmlFor} className="text-[11px] font-semibold text-stone-700">
        {label}
      </Label>
      {children}
    </div>
  )
}

function ReadonlyBox({ value }: { value: string }) {
  return (
    <div className="flex min-h-9 items-center rounded-none border border-stone-400 bg-stone-100 px-2.5 py-1.5 text-sm font-medium text-stone-800">
      {value.trim() || '—'}
    </div>
  )
}

/** If user pastes "lat, lng" or a Maps URL into one coord field, split into both. */
function applyCoordInput(raw: string): { lat?: string; lng?: string; plain?: string } {
  const parsed = parseLatLngPaste(raw)
  if (parsed) return { lat: parsed.lat, lng: parsed.lng }
  return { plain: raw }
}

export function LocationMapModuleFields({
  value,
  onChange,
  disabled = false,
  firmName,
  bisOfficeName,
}: {
  value: LocationMapModulePayload
  onChange: (next: LocationMapModulePayload) => void
  disabled?: boolean
  firmName: string
  /** Branch name from Application Details (used for To Location auto default). */
  bisOfficeName: string
}) {
  const firmReady = isValidLatLng(value.firmLatitude, value.firmLongitude)
  const bisReady = isValidLatLng(value.bisLatitude, value.bisLongitude)
  const routeReady = firmReady && bisReady
  const anyPoint = firmReady || bisReady
  const autoToLocation = defaultBisToLocation(bisOfficeName)
  const toLocationValue = value.toLocation.trim() || autoToLocation
  /** Map stays locked until clicked so Design Mode / form fields stay pickable. */
  const [mapInteractive, setMapInteractive] = useState(false)

  const openMapsUrl = useMemo(() => {
    if (routeReady) {
      return googleMapsDirectionsLink(
        value.firmLatitude,
        value.firmLongitude,
        value.bisLatitude,
        value.bisLongitude,
      )
    }
    if (firmReady) return googleMapsPinLink(value.firmLatitude, value.firmLongitude)
    if (bisReady) return googleMapsPinLink(value.bisLatitude, value.bisLongitude)
    return ''
  }, [
    routeReady,
    firmReady,
    bisReady,
    value.firmLatitude,
    value.firmLongitude,
    value.bisLatitude,
    value.bisLongitude,
  ])

  const setFirmCoord = (which: 'lat' | 'lng', raw: string) => {
    const parsed = applyCoordInput(raw)
    if (parsed.lat != null && parsed.lng != null) {
      onChange({ ...value, firmLatitude: parsed.lat, firmLongitude: parsed.lng })
      return
    }
    onChange({
      ...value,
      ...(which === 'lat'
        ? { firmLatitude: parsed.plain ?? '' }
        : { firmLongitude: parsed.plain ?? '' }),
    })
  }

  const setBisCoord = (which: 'lat' | 'lng', raw: string) => {
    const parsed = applyCoordInput(raw)
    if (parsed.lat != null && parsed.lng != null) {
      onChange({ ...value, bisLatitude: parsed.lat, bisLongitude: parsed.lng })
      return
    }
    onChange({
      ...value,
      ...(which === 'lat'
        ? { bisLatitude: parsed.plain ?? '' }
        : { bisLongitude: parsed.plain ?? '' }),
    })
  }

  /** Ctrl/Cmd+V of Google Maps "Copy coordinates" → fill both lat & lng. */
  const pastePair =
    (target: 'firm' | 'bis') => (e: ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData('text')
      const parsed = parseLatLngPaste(text)
      if (!parsed) return
      e.preventDefault()
      if (target === 'firm') {
        onChange({ ...value, firmLatitude: parsed.lat, firmLongitude: parsed.lng })
      } else {
        onChange({ ...value, bisLatitude: parsed.lat, bisLongitude: parsed.lng })
      }
    }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* From Location */}
        <div className="space-y-2.5 rounded-none border border-stone-400 bg-[#fffcf7] p-3">
          <Field label="From Location">
            <ReadonlyBox value={firmName} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitude" htmlFor="loc-firm-lat">
              <Input
                id="loc-firm-lat"
                className={cn(limsFieldClass, 'tabular-nums')}
                value={value.firmLatitude}
                disabled={disabled}
                placeholder="28.6139"
                title="Paste Google Maps coordinates (lat, lng) to fill both fields"
                onChange={(e) => setFirmCoord('lat', e.target.value)}
                onPaste={pastePair('firm')}
              />
            </Field>
            <Field label="Longitude" htmlFor="loc-firm-lng">
              <Input
                id="loc-firm-lng"
                className={cn(limsFieldClass, 'tabular-nums')}
                value={value.firmLongitude}
                disabled={disabled}
                placeholder="77.2090"
                title="Paste Google Maps coordinates (lat, lng) to fill both fields"
                onChange={(e) => setFirmCoord('lng', e.target.value)}
                onPaste={pastePair('firm')}
              />
            </Field>
          </div>
        </div>

        {/* To Location */}
        <div className="space-y-2.5 rounded-none border border-stone-400 bg-[#fffcf7] p-3">
          <Field label="To Location" htmlFor="loc-to-location">
            <Input
              id="loc-to-location"
              className={limsFieldClass}
              value={toLocationValue}
              disabled={disabled}
              placeholder={autoToLocation}
              onChange={(e) => onChange({ ...value, toLocation: e.target.value })}
              onFocus={() => {
                // Persist auto default into the field the first time user focuses to edit.
                if (!value.toLocation.trim()) {
                  onChange({ ...value, toLocation: autoToLocation })
                }
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitude" htmlFor="loc-bis-lat">
              <Input
                id="loc-bis-lat"
                className={cn(limsFieldClass, 'tabular-nums')}
                value={value.bisLatitude}
                disabled={disabled}
                placeholder="28.6139"
                title="Paste Google Maps coordinates (lat, lng) to fill both fields"
                onChange={(e) => setBisCoord('lat', e.target.value)}
                onPaste={pastePair('bis')}
              />
            </Field>
            <Field label="Longitude" htmlFor="loc-bis-lng">
              <Input
                id="loc-bis-lng"
                className={cn(limsFieldClass, 'tabular-nums')}
                value={value.bisLongitude}
                disabled={disabled}
                placeholder="77.2090"
                title="Paste Google Maps coordinates (lat, lng) to fill both fields"
                onChange={(e) => setBisCoord('lng', e.target.value)}
                onPaste={pastePair('bis')}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-none border-2 border-stone-500 bg-[#f7f3eb] p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
            <MapPin size={13} aria-hidden />
            {routeReady ? 'Road Map Route' : 'Map Preview'}
            {routeReady ? (
              <span className="font-semibold normal-case tracking-normal text-stone-500">
                (From → To)
              </span>
            ) : null}
          </p>
          {openMapsUrl ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'h-7 gap-1 text-xs')}
              onClick={() => window.open(openMapsUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink size={13} aria-hidden />
              Open in Google Maps
            </Button>
          ) : null}
        </div>
        {anyPoint ? (
          <div className="relative">
            <LocationRouteMapPreview
              firmLatitude={value.firmLatitude}
              firmLongitude={value.firmLongitude}
              bisLatitude={value.bisLatitude}
              bisLongitude={value.bisLongitude}
              firmLabel={firmName}
              bisLabel={toLocationValue}
              interactive={mapInteractive}
            />
            {!mapInteractive ? (
              <button
                type="button"
                className="absolute inset-0 z-[500] flex cursor-pointer items-center justify-center bg-stone-900/20 text-center"
                onClick={() => setMapInteractive(true)}
                aria-label="Enable map interaction"
              >
                <span className="rounded-none border border-amber-700 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 shadow-sm">
                  Click to pan / zoom map
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="absolute right-2 top-10 z-[500] rounded-none border border-stone-500 bg-white/95 px-2 py-1 text-[10px] font-semibold text-stone-700 hover:bg-stone-100"
                onClick={() => setMapInteractive(false)}
              >
                Lock map
              </button>
            )}
          </div>
        ) : (
          <div className="flex h-[160px] items-center justify-center border border-dashed border-stone-400 bg-white px-4 text-center text-xs text-stone-500">
            Enter Company and BIS Branch latitude / longitude — road route map will appear here.
          </div>
        )}
      </div>
    </div>
  )
}
