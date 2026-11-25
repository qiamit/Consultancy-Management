import { useEffect, useState } from 'react'
import { BadgeCheck, ChevronRight, Quote, Repeat } from 'lucide-react'
import { Link } from 'react-router-dom'

/*
 * Left-side tiles of the login page, the same as the Qirlpl login page (owner, 25 Nov 2026), with Quality
 * Engineering's own work. All information is public or computed in the browser; nothing is read from the database
 * before sign-in.
 */

const DAY = 24 * 60 * 60 * 1000

function useTick(everyMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}

/* ------------------------------------------------------------------ What we do */

const SERVICES = [
  { name: 'BIS Product Certification', detail: 'ISI Mark', note: 'New Licence · Inclusion · Renewal · Surveillance', to: '/bis-certification' },
  { name: 'ISO Certification', detail: '4 Systems', note: 'ISO 9001 · 14001 · 45001 · 50001', to: '/iso-certification' },
  { name: 'Lab Accreditation', detail: '3 Schemes', note: 'NABL ISO/IEC 17025 · QAI · IQAS', to: '/accreditation' },
]

export function ServicesTile() {
  return (
    <div className="qp-widget">
      <div className="qp-tile-head">
        <span className="qp-widget-label">What We Do</span>
        <span className="qp-live-pill">
          <BadgeCheck size={13} aria-hidden /> Raipur
        </span>
      </div>
      <ul className="qp-acc-rows">
        {SERVICES.map((s) => (
          <li key={s.name}>
            <Link to={s.to} className="qp-acc-row-top">
              <strong>{s.name}</strong>
              <span>{s.detail}</span>
            </Link>
            <span className="qp-widget-small">{s.note}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ Standard of the day */

/** Standards our clients hold most (client folders, 25 Nov 2026), with the titles from the IS Code Master. */
const STANDARDS: Array<{ code: string; title: string; family: string }> = [
  { code: 'IS 2062', title: 'Hot Rolled Medium and High Tensile Structural Steel', family: 'Steel' },
  { code: 'IS 1786', title: 'High Strength Deformed Steel Bars and Wires for Concrete Reinforcement', family: 'Steel' },
  { code: 'IS 15997', title: 'Low Nickel Austenitic Stainless Steel Sheet and Strip for Utensils and Kitchen Appliances', family: 'Stainless Steel' },
  { code: 'IS 14650', title: 'Unalloyed and Alloyed Steel Ingot and Semi-Finished Products for Re-Rolling', family: 'Billets' },
  { code: 'IS 14756', title: 'Stainless Steel Utensils', family: 'Kitchenware' },
  { code: 'IS 4923', title: 'Hollow Steel Sections for Structural Use', family: 'Tubes & Pipes' },
  { code: 'IS 3601', title: 'Steel Tubes for Mechanical and General Engineering Purposes', family: 'Tubes & Pipes' },
  { code: 'IS 10748', title: 'Hot Rolled Steel Strip for Welded Tubes and Pipes', family: 'Steel' },
  { code: 'IS 2830', title: 'Carbon Steel Cast Billet Ingots, Billets, Blooms and Slabs for Re-Rolling', family: 'Billets' },
  { code: 'IS 1161', title: 'Steel Tubes for Structural Purposes', family: 'Tubes & Pipes' },
  { code: 'IS 18573', title: 'Cold Formed Welded Carbon Steel Square and Rectangular Hollow Sections', family: 'Tubes & Pipes' },
  { code: 'IS 1239-1', title: 'Steel Tubes, Tubulars and Other Wrought Steel Fittings: Steel Tubes', family: 'Tubes & Pipes' },
  { code: 'IS 280', title: 'Mild Steel Wire for General Engineering Purposes', family: 'Wire' },
  { code: 'IS 733', title: 'Wrought Aluminium and Aluminium Alloy Bars, Rods and Sections', family: 'Aluminium' },
  { code: 'IS 17569', title: 'Insulated Containers for Food Storage', family: 'Housewares' },
  { code: 'IS 1470', title: 'Silico Manganese', family: 'Ferro Alloys' },
  { code: 'IS 4984', title: 'Polyethylene Pipes for Water Supply', family: 'Plastics' },
  { code: 'IS 7887', title: 'Mild Steel Wire Rods for General Engineering Purposes', family: 'Steel' },
  { code: 'IS 15658', title: 'Precast Concrete Blocks for Paving', family: 'Building' },
  { code: 'IS 17633', title: 'Tables and Desks', family: 'Furniture' },
]

export function StandardTile() {
  // Day number in India time, fixed when the page opens.
  const [dayIndex] = useState(() => Math.floor((Date.now() + 5.5 * 60 * 60 * 1000) / DAY))
  const [offset, setOffset] = useState(0)
  const s = STANDARDS[(dayIndex + offset) % STANDARDS.length]!
  return (
    <div className="qp-widget standard">
      <span className="qp-widget-label light">{offset === 0 ? 'Standard of the Day' : 'Our Clients Hold'}</span>
      <span className="qp-widget-big light">{s.code}</span>
      <span className="qp-standard-title">{s.title}</span>
      <div className="qp-standard-foot">
        <span className="qp-standard-tag">{s.family}</span>
        <button type="button" className="qp-standard-next" onClick={() => setOffset((o) => o + 1)} aria-label="Next Standard">
          Next <ChevronRight size={14} aria-hidden />
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Quick convert */

type Kind = 'force' | 'stress' | 'temp'

const KINDS: Record<Kind, { label: string; unit: string; out: (v: number) => Array<[string, number, number]> }> = {
  force: {
    label: 'Force',
    unit: 'kN',
    out: (v) => [
      ['kgf', v * 101.9716, 1],
      ['lbf', v * 224.8089, 1],
      ['N', v * 1000, 0],
    ],
  },
  stress: {
    label: 'Stress',
    unit: 'MPa',
    out: (v) => [
      ['kgf/mm²', v * 0.1019716, 3],
      ['kgf/cm²', v * 10.19716, 2],
      ['psi', v * 145.0377, 0],
    ],
  },
  temp: {
    label: 'Temp',
    unit: '°C',
    out: (v) => [
      ['°F', (v * 9) / 5 + 32, 1],
      ['K', v + 273.15, 2],
    ],
  },
}

const fmt = (n: number, d: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: d }) : '—'

export function ConverterTile() {
  const [kind, setKind] = useState<Kind>('force')
  const [value, setValue] = useState('100')
  const k = KINDS[kind]
  const v = Number(value.replace(/,/g, ''))
  // data-keep-case: the app's automatic Title Case must not turn units such as kN into "Kn".
  return (
    <div className="qp-widget" data-keep-case>
      <span className="qp-widget-label">
        <Repeat size={12} aria-hidden style={{ display: 'inline', marginRight: 4 }} />
        Quick Convert
      </span>
      <div className="qp-mini-seg" role="group" aria-label="Quantity">
        {(Object.keys(KINDS) as Kind[]).map((key) => (
          <button key={key} type="button" aria-pressed={kind === key} onClick={() => setKind(key)}>
            {KINDS[key].label}
          </button>
        ))}
      </div>
      <label className="qp-conv-input">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Value in ${k.unit}`}
        />
        <span>{k.unit}</span>
      </label>
      <ul className="qp-conv-out">
        {k.out(Number.isFinite(v) ? v : NaN).map(([unit, n, d]) => (
          <li key={unit}>
            <span>{fmt(n, d)}</span> <small>{unit}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ Quality thought */

const THOUGHTS = [
  'A licence is earned once and kept every day.',
  'Right documents, right first time.',
  'Every renewal on time, every reply on record.',
  'The standard is a promise to the customer; we help you keep it.',
  'Quality is everyone’s responsibility.',
  'Plan, do, check, act, and keep improving.',
]

export function ThoughtTile() {
  const now = useTick(8000)
  const i = Math.floor(now / 8000) % THOUGHTS.length
  return (
    <div className="qp-widget thought">
      <Quote size={18} aria-hidden className="qp-thought-mark" />
      <p key={i} className="qp-thought-text">
        {THOUGHTS[i]}
      </p>
      <span className="qp-thought-dots" aria-hidden>
        {THOUGHTS.map((_, j) => (
          <span key={j} className={j === i ? 'on' : ''} />
        ))}
      </span>
    </div>
  )
}
