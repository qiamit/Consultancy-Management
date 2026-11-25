import { useEffect, useMemo, useState } from 'react'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Moon,
  Server,
  Sun,
  Sunrise,
  Sunset,
  Wifi,
  WifiOff,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import { PUBLIC_MAP_LAT, PUBLIC_MAP_LNG } from '@/features/public-site/publicNav'

/*
 * Live widgets on the login page, the same as the Qirlpl login page (owner, 25 Nov 2026). Clock and calendar come
 * from the computer; weather and air quality for the office's location come from Open-Meteo (free, no key, no
 * visitor data sent beyond the request itself); app server status is a timed request to the API's /health.
 * Every widget shows a quiet fallback when its source cannot be reached.
 */

const TZ = 'Asia/Kolkata'
const LAT = PUBLIC_MAP_LAT.toFixed(4)
const LNG = PUBLIC_MAP_LNG.toFixed(4)

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}

/** India time parts for a Date (the visitor's computer may be in another time zone). */
function indiaParts(d: Date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0)
  return { h: get('hour') % 24, m: get('minute'), s: get('second') }
}

/* ------------------------------------------------------------------ Clock */

export function ClockWidget() {
  const now = useNow(1000)
  const { h, m, s } = indiaParts(now)
  const hourAngle = ((h % 12) + m / 60) * 30
  const minuteAngle = (m + s / 60) * 6
  const secondAngle = s * 6
  const day = now.toLocaleDateString('en-IN', { weekday: 'long', timeZone: TZ })
  const date = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: TZ })
  const time = now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })

  return (
    <div className="qp-widget clock">
      <svg viewBox="-50 -50 100 100" className="qp-clock-face" aria-hidden>
        <circle r="48" fill="#fff" />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="0"
            y1="-41"
            x2="0"
            y2={i % 3 === 0 ? '-34' : '-37'}
            stroke="#1d1d1f"
            strokeWidth={i % 3 === 0 ? 2.4 : 1.2}
            strokeLinecap="round"
            transform={`rotate(${i * 30})`}
          />
        ))}
        <line x1="0" y1="4" x2="0" y2="-22" stroke="#1d1d1f" strokeWidth="3.4" strokeLinecap="round" transform={`rotate(${hourAngle})`} />
        <line x1="0" y1="5" x2="0" y2="-32" stroke="#1d1d1f" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${minuteAngle})`} />
        <line x1="0" y1="8" x2="0" y2="-36" stroke="#ff9500" strokeWidth="1.2" strokeLinecap="round" transform={`rotate(${secondAngle})`} />
        <circle r="2.6" fill="#ff9500" />
      </svg>
      <div className="qp-widget-text">
        <span className="qp-widget-label">{day}</span>
        <span className="qp-widget-big">{time}</span>
        <span className="qp-widget-small">{date} · Raipur</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Weather */

type Weather = {
  temp: number
  humidity: number
  wind: number
  code: number
  isDay: boolean
  max: number
  min: number
  sunrise: string
  sunset: string
}

function weatherLook(code: number, isDay: boolean): { label: string; icon: LucideIcon } {
  if (code === 0) return { label: 'Clear', icon: isDay ? Sun : Moon }
  if (code <= 2) return { label: 'Partly Cloudy', icon: isDay ? CloudSun : CloudMoon }
  if (code === 3) return { label: 'Cloudy', icon: Cloud }
  if (code === 45 || code === 48) return { label: 'Fog', icon: CloudFog }
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: CloudDrizzle }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain', icon: CloudRain }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', icon: CloudSnow }
  if (code >= 95) return { label: 'Thunderstorm', icon: CloudLightning }
  return { label: 'Weather', icon: Cloud }
}

const timeOf = (iso: string) =>
  iso ? new Date(`${iso}:00+05:30`).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: TZ }) : ''

function useLive<T>(url: string, parse: (json: unknown) => T, everyMs: number) {
  const [state, setState] = useState<{ data: T | null; failed: boolean }>({ data: null, failed: false })
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = parse(await res.json())
        if (alive) setState({ data, failed: false })
      } catch {
        if (alive) setState((prev) => ({ data: prev.data, failed: true }))
      }
    }
    void load()
    const id = window.setInterval(load, everyMs)
    return () => {
      alive = false
      window.clearInterval(id)
    }
    // parse is a module-level function; url is fixed per widget
  }, [url, everyMs]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

const WEATHER_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}` +
  '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
  '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=1&timezone=Asia%2FKolkata'

function parseWeather(json: unknown): Weather {
  const j = json as {
    current: { temperature_2m: number; relative_humidity_2m: number; weather_code: number; wind_speed_10m: number; is_day: number }
    daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise: string[]; sunset: string[] }
  }
  return {
    temp: j.current.temperature_2m,
    humidity: j.current.relative_humidity_2m,
    wind: j.current.wind_speed_10m,
    code: j.current.weather_code,
    isDay: j.current.is_day === 1,
    max: j.daily.temperature_2m_max[0],
    min: j.daily.temperature_2m_min[0],
    sunrise: j.daily.sunrise[0],
    sunset: j.daily.sunset[0],
  }
}

export function WeatherWidget() {
  const { data: w, failed } = useLive(WEATHER_URL, parseWeather, 15 * 60 * 1000)
  const look = w ? weatherLook(w.code, w.isDay) : null
  const Icon = look?.icon ?? Cloud
  return (
    <div className={`qp-widget weather ${w && !w.isDay ? 'night' : ''}`}>
      <span className="qp-widget-label light">Raipur</span>
      {w ? (
        <>
          <div className="qp-weather-now">
            <span className="qp-widget-big light">{Math.round(w.temp)}°</span>
            <Icon className="qp-weather-icon" strokeWidth={1.6} aria-hidden />
          </div>
          <span className="qp-widget-small light">
            {look?.label} · H {Math.round(w.max)}° L {Math.round(w.min)}°
          </span>
          <span className="qp-weather-facts">
            <span>
              <Droplets size={12} aria-hidden /> {w.humidity}%
            </span>
            <span>
              <Wind size={12} aria-hidden /> {Math.round(w.wind)} km/h
            </span>
            <span>
              {w.isDay ? <Sunset size={12} aria-hidden /> : <Sunrise size={12} aria-hidden />}{' '}
              {w.isDay ? timeOf(w.sunset) : timeOf(w.sunrise)}
            </span>
          </span>
        </>
      ) : (
        <span className="qp-widget-small light">{failed ? 'Weather Unavailable' : 'Loading…'}</span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Air quality */

const AIR_URL =
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LNG}` +
  '&current=us_aqi,pm2_5,pm10&timezone=Asia%2FKolkata'

function parseAir(json: unknown) {
  const j = json as { current: { us_aqi: number; pm2_5: number; pm10: number } }
  return { aqi: j.current.us_aqi, pm25: j.current.pm2_5, pm10: j.current.pm10 }
}

function aqiBand(aqi: number) {
  if (aqi <= 50) return { label: 'Good', color: '#34c759' }
  if (aqi <= 100) return { label: 'Moderate', color: '#ffcc00' }
  if (aqi <= 150) return { label: 'Unhealthy for Some', color: '#ff9500' }
  if (aqi <= 200) return { label: 'Unhealthy', color: '#ff3b30' }
  if (aqi <= 300) return { label: 'Very Unhealthy', color: '#af52de' }
  return { label: 'Hazardous', color: '#8e1b3a' }
}

export function AirQualityWidget() {
  const { data: a, failed } = useLive(AIR_URL, parseAir, 30 * 60 * 1000)
  const band = a ? aqiBand(a.aqi) : null
  const pct = a ? Math.min(100, (a.aqi / 300) * 100) : 0
  return (
    <div className="qp-widget">
      <span className="qp-widget-label">Air Quality</span>
      {a && band ? (
        <>
          <span className="qp-widget-big">{Math.round(a.aqi)}</span>
          <span className="qp-widget-small" style={{ color: band.color, fontWeight: 600 }}>
            {band.label}
          </span>
          <span className="qp-aqi-bar" aria-hidden>
            <span style={{ left: `${pct}%` }} />
          </span>
          <span className="qp-widget-small">
            PM2.5 {Math.round(a.pm25)} · PM10 {Math.round(a.pm10)} µg/m³
          </span>
        </>
      ) : (
        <span className="qp-widget-small">{failed ? 'Air Quality Unavailable' : 'Loading…'}</span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ App server status */

const HEALTH_URL = `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')}/health`

export function AppStatusWidget() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [ping, setPing] = useState<{ ok: boolean; ms: number } | null>(null)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const check = async () => {
      const t0 = performance.now()
      try {
        await fetch(HEALTH_URL, { mode: 'no-cors', cache: 'no-store' })
        if (alive) setPing({ ok: true, ms: Math.round(performance.now() - t0) })
      } catch {
        if (alive) setPing({ ok: false, ms: 0 })
      }
    }
    void check()
    const id = window.setInterval(check, 60 * 1000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  const serverOk = ping?.ok ?? null
  return (
    <div className="qp-widget">
      <span className="qp-widget-label">System Status</span>
      <div className="qp-status-row">
        <Server size={16} aria-hidden />
        <span className="grow">App Server</span>
        <span className={`qp-dot ${serverOk === null ? 'wait' : serverOk ? 'ok' : 'bad'}`} />
      </div>
      <span className="qp-widget-small">
        {serverOk === null ? 'Checking…' : serverOk ? `Online · ${ping?.ms} ms` : 'Not Reachable'}
      </span>
      <div className="qp-status-row">
        {online ? <Wifi size={16} aria-hidden /> : <WifiOff size={16} aria-hidden />}
        <span className="grow">Your Internet</span>
        <span className={`qp-dot ${online ? 'ok' : 'bad'}`} />
      </div>
      <span className="qp-widget-small">{online ? 'Connected' : 'Offline'}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ Calendar */

export function CalendarWidget() {
  const now = useNow(60 * 1000)
  const parts = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    const [y, mo, d] = f.format(now).split('-').map(Number)
    return { y, mo, d }
  }, [now])
  const first = new Date(Date.UTC(parts.y, parts.mo - 1, 1))
  const daysInMonth = new Date(Date.UTC(parts.y, parts.mo, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7 // Monday first
  const cells = [...Array.from({ length: lead }, () => 0), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const month = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div className="qp-widget calendar">
      <span className="qp-widget-label" style={{ color: '#ff3b30' }}>
        {month}
      </span>
      <div className="qp-cal">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={`h${i}`} className={`qp-cal-head ${i === 6 ? 'sun' : ''}`}>
            {d}
          </span>
        ))}
        {cells.map((d, i) => (
          <span key={i} className={`qp-cal-day ${d === parts.d ? 'today' : ''} ${i % 7 === 6 ? 'sun' : ''}`}>
            {d || ''}
          </span>
        ))}
      </div>
    </div>
  )
}
