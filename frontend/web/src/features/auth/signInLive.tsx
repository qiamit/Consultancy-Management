import { useEffect, useState } from 'react'
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
  Sun,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import { PUBLIC_MAP_LAT, PUBLIC_MAP_LNG } from '@/features/public-site/publicNav'

/*
 * Live cards on the right of the sign-in page, Quality Engineering's own code. Time and the month come from the
 * visitor's computer (shown in India time). Weather and air quality for the office come from Open-Meteo, a free
 * public service that needs no key; only the office's coordinates are sent. The app server card times a request to
 * the API's /health. Each card shows a short fallback when its source cannot be reached.
 */

const INDIA = 'Asia/Kolkata'
const PLACE = `latitude=${PUBLIC_MAP_LAT.toFixed(3)}&longitude=${PUBLIC_MAP_LNG.toFixed(3)}`

/** The current time, refreshed every `ms` milliseconds. */
function useClock(ms: number) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

/** Fetches JSON now and every `ms` milliseconds; keeps the last good answer when a refresh fails. */
function usePolledJson<T>(url: string, read: (json: unknown) => T, ms: number) {
  const [state, setState] = useState<{ value: T | null; failed: boolean }>({ value: null, failed: false })
  useEffect(() => {
    let live = true
    const load = () =>
      fetch(url, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json) => live && setState({ value: read(json), failed: false }))
        .catch(() => live && setState((s) => ({ ...s, failed: true })))
    void load()
    const id = window.setInterval(load, ms)
    return () => {
      live = false
      window.clearInterval(id)
    }
    // `read` is a fixed module-level function for each card.
  }, [url, ms]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

/* ---------------------------------------------------------------- Clock */

function indiaTime(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: INDIA, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(d)
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { h: pick('hour'), m: pick('minute'), s: pick('second') }
}

export function ClockCard() {
  const now = useClock(1000)
  const { h, m, s } = indiaTime(now)
  const hand = (deg: number, length: number, width: number, colour: string) => (
    <line x1="0" y1="6" x2="0" y2={-length} stroke={colour} strokeWidth={width} strokeLinecap="round" transform={`rotate(${deg})`} />
  )
  return (
    <div className="qs-w">
      <div className="qs-clock">
        <svg viewBox="-50 -50 100 100" aria-hidden>
          <circle r="47" fill="#f3f6f9" stroke="#0c416a" strokeWidth="2.5" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6
            return <circle key={i} cx={Math.sin(a) * 38} cy={-Math.cos(a) * 38} r={i % 3 === 0 ? 3 : 1.6} fill="#0c416a" />
          })}
          {hand((h % 12) * 30 + m / 2, 21, 4, '#0c416a')}
          {hand(m * 6 + s / 10, 31, 2.6, '#1b8fd2')}
          {hand(s * 6, 35, 1.2, '#e0262d')}
          <circle r="3.2" fill="#e0262d" />
        </svg>
        <div>
          <span className="qs-w-label">{now.toLocaleDateString('en-IN', { weekday: 'long', timeZone: INDIA })}</span>
          <div className="qs-w-big">{now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: INDIA })}</div>
          <span className="qs-w-small">
            {now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: INDIA })} · India Time
          </span>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Weather */

type Weather = { temp: number; code: number; day: boolean; humidity: number; wind: number; high: number; low: number }

function readWeather(json: unknown): Weather {
  const j = json as {
    current: { temperature_2m: number; weather_code: number; is_day: number; relative_humidity_2m: number; wind_speed_10m: number }
    daily: { temperature_2m_max: number[]; temperature_2m_min: number[] }
  }
  return {
    temp: j.current.temperature_2m,
    code: j.current.weather_code,
    day: j.current.is_day === 1,
    humidity: j.current.relative_humidity_2m,
    wind: j.current.wind_speed_10m,
    high: j.daily.temperature_2m_max[0] ?? NaN,
    low: j.daily.temperature_2m_min[0] ?? NaN,
  }
}

/** WMO weather code (as Open-Meteo reports it) to words and an icon. */
function describeSky(code: number, day: boolean): [string, LucideIcon] {
  if (code === 0) return ['Clear Sky', day ? Sun : Moon]
  if (code <= 2) return ['Partly Cloudy', day ? CloudSun : CloudMoon]
  if (code === 3) return ['Overcast', Cloud]
  if (code <= 48) return ['Fog', CloudFog]
  if (code <= 57) return ['Drizzle', CloudDrizzle]
  if (code <= 67 || (code >= 80 && code <= 82)) return ['Rain', CloudRain]
  if (code <= 77 || code === 85 || code === 86) return ['Snow', CloudSnow]
  if (code >= 95) return ['Thunderstorm', CloudLightning]
  return ['Weather', Cloud]
}

const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?${PLACE}&current=temperature_2m,weather_code,is_day,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=Asia%2FKolkata`

export function WeatherCard() {
  const { value: w, failed } = usePolledJson(WEATHER_URL, readWeather, 15 * 60_000)
  const [words, Icon] = w ? describeSky(w.code, w.day) : ['', Cloud]
  return (
    <div className={`qs-w sky${w && !w.day ? ' dark' : ''}`}>
      <span className="qs-w-label">Raipur Weather</span>
      {w ? (
        <>
          <div className="qs-weather-now">
            <span className="qs-w-big">{Math.round(w.temp)}°C</span>
            <Icon strokeWidth={1.7} aria-hidden />
          </div>
          <span className="qs-w-small">
            {words} · {Math.round(w.high)}° / {Math.round(w.low)}°
          </span>
          <span className="qs-weather-facts">
            <span>
              <Droplets size={11} aria-hidden /> {w.humidity}%
            </span>
            <span>
              <Wind size={11} aria-hidden /> {Math.round(w.wind)} km/h
            </span>
          </span>
        </>
      ) : (
        <span className="qs-w-small">{failed ? 'Weather Not Available' : 'Loading…'}</span>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- Air quality */

const AIR_URL = `https://air-quality-api.open-meteo.com/v1/air-quality?${PLACE}&current=us_aqi,pm2_5,pm10&timezone=Asia%2FKolkata`

function readAir(json: unknown) {
  const c = (json as { current: { us_aqi: number; pm2_5: number; pm10: number } }).current
  return { aqi: c.us_aqi, pm25: c.pm2_5, pm10: c.pm10 }
}

/** US AQI categories. */
function airBand(aqi: number): [string, string] {
  if (aqi <= 50) return ['Good', '#18a05a']
  if (aqi <= 100) return ['Moderate', '#b08900']
  if (aqi <= 150) return ['Unhealthy for Sensitive Groups', '#d9661f']
  if (aqi <= 200) return ['Unhealthy', '#e0262d']
  if (aqi <= 300) return ['Very Unhealthy', '#7a3fc0']
  return ['Hazardous', '#6b1630']
}

export function AirCard() {
  const { value: a, failed } = usePolledJson(AIR_URL, readAir, 30 * 60_000)
  const [band, colour] = a ? airBand(a.aqi) : ['', '']
  return (
    <div className="qs-w">
      <span className="qs-w-label">Air Quality</span>
      {a ? (
        <>
          <span className="qs-w-big">{Math.round(a.aqi)}</span>
          <span className="qs-w-small" style={{ color: colour, fontWeight: 650 }}>
            {band}
          </span>
          <span className="qs-air-bar" aria-hidden>
            <i style={{ left: `${Math.min(100, (a.aqi / 300) * 100)}%` }} />
          </span>
          <span className="qs-w-small">
            PM2.5 {Math.round(a.pm25)} · PM10 {Math.round(a.pm10)}
          </span>
        </>
      ) : (
        <span className="qs-w-small">{failed ? 'Not Available' : 'Loading…'}</span>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- App server */

const HEALTH_URL = `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')}/health`

export function ServerCard() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [reply, setReply] = useState<{ ok: boolean; ms: number } | null>(null)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    let live = true
    const check = () => {
      const started = performance.now()
      fetch(HEALTH_URL, { mode: 'no-cors', cache: 'no-store' })
        .then(() => live && setReply({ ok: true, ms: Math.round(performance.now() - started) }))
        .catch(() => live && setReply({ ok: false, ms: 0 }))
    }
    check()
    const id = window.setInterval(check, 60_000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <div className="qs-w">
      <span className="qs-w-label">App Status</span>
      <div className="qs-status">
        <span>Server</span>
        <i className={`qs-dot${reply ? (reply.ok ? ' ok' : ' bad') : ''}`} />
      </div>
      <span className="qs-w-small">{reply ? (reply.ok ? `Online · ${reply.ms} ms` : 'Not Reachable') : 'Checking…'}</span>
      <div className="qs-status">
        <span>Your Internet</span>
        <i className={`qs-dot ${online ? 'ok' : 'bad'}`} />
      </div>
      <span className="qs-w-small">{online ? 'Connected' : 'Offline'}</span>
    </div>
  )
}

/* ---------------------------------------------------------------- This month */

export function MonthCard() {
  const now = useClock(60_000)
  const [y, mo, today] = new Intl.DateTimeFormat('en-CA', { timeZone: INDIA, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now)
    .split('-')
    .map(Number) as [number, number, number]
  const firstWeekday = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() // Sunday = 0
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const cells: number[] = [...Array<number>(firstWeekday).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)]
  return (
    <div className="qs-w">
      <span className="qs-w-label" style={{ color: '#e0262d' }}>
        {new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
      </span>
      <div className="qs-month">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <b key={i} className={i === 0 ? 'sun' : ''}>
            {d}
          </b>
        ))}
        {cells.map((d, i) => (
          <span key={i} className={[d === today ? 'today' : '', i % 7 === 0 && d !== today ? 'sun' : ''].join(' ').trim()}>
            {d || ''}
          </span>
        ))}
      </div>
    </div>
  )
}
