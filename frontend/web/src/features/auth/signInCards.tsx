import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, ChevronRight, FileCheck2, FlaskConical, Quote, ReceiptText, Users, type LucideIcon } from 'lucide-react'
import { AirCard, ClockCard, MonthCard, ServerCard, WeatherCard } from './signInLive'

/*
 * Cards beside the sign-in box (owner, 25 Nov 2026), Quality Engineering's own design and code. Left: what we do,
 * standard of the day, unit converter, a quality thought. Right: live cards (signInLive.tsx). Everything is public or
 * worked out in the browser; nothing is read from the database before sign-in. Hidden on narrow screens.
 */

export function SignInLeft() {
  return (
    <aside className="qs-side qs-in" aria-label="About Quality Engineering">
      <div className="wide">
        <WhatWeDoCard />
      </div>
      <StandardCard />
      <ConverterCard />
      <div className="wide">
        <ThoughtCard />
      </div>
    </aside>
  )
}

export function SignInRight() {
  return (
    <aside className="qs-side qs-in" style={{ '--d': '120ms' } as React.CSSProperties} aria-label="Live Information">
      <div className="wide">
        <ClockCard />
      </div>
      <WeatherCard />
      <AirCard />
      <ServerCard />
      <MonthCard />
    </aside>
  )
}

/* ---------------------------------------------------------------- What we do */

const WORK = [
  { to: '/bis-certification', name: 'BIS Product Certification', tag: 'ISI Mark', detail: 'New Licence · Inclusion · Renewal · Surveillance' },
  { to: '/iso-certification', name: 'ISO Certification', tag: '4 Systems', detail: 'ISO 9001 · 14001 · 45001 · 50001' },
  { to: '/accreditation', name: 'Lab Accreditation', tag: '3 Schemes', detail: 'NABL ISO/IEC 17025 · QAI · IQAS' },
]

function WhatWeDoCard() {
  return (
    <div className="qs-w">
      <span className="qs-w-label">What We Do</span>
      <ul className="qs-rows">
        {WORK.map((w) => (
          <li key={w.to}>
            <Link to={w.to}>
              <strong>
                {w.name} <em>{w.tag}</em>
              </strong>
              <span className="qs-w-small">{w.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------------------------------------------------------- Standard of the day */

/** Standards our clients hold most (client folders, 25 Nov 2026), titles as in the IS Code Master. */
const DAILY_STANDARDS: Array<[code: string, title: string, family: string]> = [
  ['IS 2062', 'Hot Rolled Medium and High Tensile Structural Steel', 'Steel'],
  ['IS 15997', 'Low Nickel Austenitic Stainless Steel Sheet and Strip for Utensils and Kitchen Appliances', 'Stainless Steel'],
  ['IS 1786', 'High Strength Deformed Steel Bars and Wires for Concrete Reinforcement', 'Steel'],
  ['IS 14756', 'Stainless Steel Utensils', 'Kitchenware'],
  ['IS 14650', 'Unalloyed and Alloyed Steel Ingot and Semi-Finished Products for Re-Rolling', 'Billets'],
  ['IS 4923', 'Hollow Steel Sections for Structural Use', 'Tubes & Pipes'],
  ['IS 17569', 'Insulated Containers for Food Storage', 'Housewares'],
  ['IS 3601', 'Steel Tubes for Mechanical and General Engineering Purposes', 'Tubes & Pipes'],
  ['IS 10748', 'Hot Rolled Steel Strip for Welded Tubes and Pipes', 'Steel'],
  ['IS 1470', 'Silico Manganese', 'Ferro Alloys'],
  ['IS 2830', 'Carbon Steel Cast Billet Ingots, Billets, Blooms and Slabs for Re-Rolling', 'Billets'],
  ['IS 4984', 'Polyethylene Pipes for Water Supply', 'Plastics'],
  ['IS 1161', 'Steel Tubes for Structural Purposes', 'Tubes & Pipes'],
  ['IS 733', 'Wrought Aluminium and Aluminium Alloy Bars, Rods and Sections', 'Aluminium'],
  ['IS 18573', 'Cold Formed Welded Carbon Steel Square and Rectangular Hollow Sections', 'Tubes & Pipes'],
  ['IS 14887', 'HDPE / PP Woven Sacks for Packing 50 kg and 25 kg Foodgrains', 'Textiles'],
  ['IS 7887', 'Mild Steel Wire Rods for General Engineering Purposes', 'Steel'],
  ['IS 15658', 'Precast Concrete Blocks for Paving', 'Building'],
  ['IS 17633', 'Tables and Desks', 'Furniture'],
  ['IS 17782', 'Fortified Rice Kernels', 'Food'],
]

/** Days since 1 Jan 1970 in India time; the same standard shows all day. */
const indiaDayNumber = () => Math.floor((Date.now() + 19_800_000) / 86_400_000)

function StandardCard() {
  const [start] = useState(indiaDayNumber)
  const [step, setStep] = useState(0)
  const [code, title, family] = DAILY_STANDARDS[(start + step) % DAILY_STANDARDS.length]!
  return (
    <div className="qs-w navy">
      <span className="qs-w-label">{step === 0 ? 'Standard of the Day' : 'Our Clients Hold'}</span>
      <span className="qs-w-big">{code}</span>
      <span className="qs-std-title">{title}</span>
      <div className="qs-w-row" style={{ marginTop: 'auto' }}>
        <span className="qs-family">{family}</span>
        <button type="button" className="qs-next" onClick={() => setStep((s) => s + 1)} aria-label="Show Another Standard">
          Next <ChevronRight size={13} aria-hidden />
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Unit converter */

type Quantity = 'force' | 'stress' | 'temp'

/** Each quantity: the unit typed in, and the units shown with their factor (or formula) and decimals. */
const QUANTITIES: Record<Quantity, { name: string; from: string; to: Array<{ unit: string; of: (v: number) => number; dp: number }> }> = {
  force: {
    name: 'Force',
    from: 'kN',
    to: [
      { unit: 'kgf', of: (v) => (v * 1000) / 9.80665, dp: 1 },
      { unit: 'N', of: (v) => v * 1000, dp: 0 },
      { unit: 'tf', of: (v) => v / 9.80665, dp: 3 },
    ],
  },
  stress: {
    name: 'Stress',
    from: 'MPa',
    to: [
      { unit: 'kgf/mm²', of: (v) => v / 9.80665, dp: 2 },
      { unit: 'kgf/cm²', of: (v) => (v * 100) / 9.80665, dp: 1 },
      { unit: 'psi', of: (v) => v * 145.0377, dp: 0 },
    ],
  },
  temp: {
    name: 'Temp',
    from: '°C',
    to: [
      { unit: '°F', of: (v) => v * 1.8 + 32, dp: 1 },
      { unit: 'K', of: (v) => v + 273.15, dp: 2 },
    ],
  },
}

function ConverterCard() {
  const [quantity, setQuantity] = useState<Quantity>('force')
  const [typed, setTyped] = useState('100')
  const q = QUANTITIES[quantity]
  const value = Number(typed.replace(/,/g, ''))
  return (
    // data-keep-case: the app's automatic Title Case must leave units such as kN and kgf alone.
    <div className="qs-w" data-keep-case>
      <span className="qs-w-label">Unit Converter</span>
      <div className="qs-seg" role="group" aria-label="Quantity">
        {(Object.keys(QUANTITIES) as Quantity[]).map((k) => (
          <button key={k} type="button" aria-pressed={quantity === k} onClick={() => setQuantity(k)}>
            {QUANTITIES[k].name}
          </button>
        ))}
      </div>
      <label className="qs-conv">
        <input inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={`Value in ${q.from}`} />
        <span>{q.from}</span>
      </label>
      <ul className="qs-conv-out">
        {q.to.map((t) => (
          <li key={t.unit}>
            <b>{Number.isFinite(value) ? t.of(value).toLocaleString('en-IN', { maximumFractionDigits: t.dp }) : '—'}</b>{' '}
            <small>{t.unit}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------------------------------------------------------- Quality thought */

const THOUGHTS = [
  'A licence is earned once and kept every day.',
  'Right documents, right first time.',
  'Every renewal on time, every reply on record.',
  'The standard is a promise to the customer; we help you keep it.',
  'Quality is everyone’s responsibility.',
  'Plan, do, check, act, and keep improving.',
]

function ThoughtCard() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => (x + 1) % THOUGHTS.length), 7000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="qs-w warm">
      <div className="qs-w-row">
        <span className="qs-w-label">Thought for the Day</span>
        <Quote size={16} aria-hidden style={{ color: '#e08a00' }} />
      </div>
      <p key={n} className="qs-thought">
        {THOUGHTS[n]}
      </p>
      <span className="qs-thought-bar" aria-hidden>
        {THOUGHTS.map((t, i) => (
          <span key={t} className={i === n ? 'on' : ''} />
        ))}
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- What the app covers */

const CHAIN: Array<{ icon: LucideIcon; label: string; tone: number }> = [
  { icon: Users, label: 'Clients', tone: 0 },
  { icon: FileCheck2, label: 'Applications', tone: 1 },
  { icon: FlaskConical, label: 'Test Reports', tone: 2 },
  { icon: BadgeCheck, label: 'Licences', tone: 6 },
  { icon: ReceiptText, label: 'Billing', tone: 3 },
]

export function SignInChain() {
  return (
    <div className="qs-chain">
      <span>One App for Every Licence File</span>
      <ol>
        {CHAIN.map(({ icon: Icon, label, tone }) => (
          <li key={label}>
            <span className={`qs-ico tone-${tone}`} aria-hidden>
              <Icon strokeWidth={2} />
            </span>
            {label}
          </li>
        ))}
      </ol>
    </div>
  )
}
