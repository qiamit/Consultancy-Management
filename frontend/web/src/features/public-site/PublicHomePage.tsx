import { Link } from 'react-router-dom'
import { BadgeCheck, ChevronRight, ClipboardCheck, Microscope } from 'lucide-react'
import { PublicScreen } from './PublicChrome'
import { HERO, STATS } from './publicContent'
import { rise, usePublicPageTitle } from './publicPageUtils'

const PILLS = [
  { to: '/bis-certification', label: 'BIS Product Certification · ISI Mark', icon: BadgeCheck },
  { to: '/iso-certification', label: 'ISO 9001 · 14001 · 45001 · 50001', icon: ClipboardCheck },
  { to: '/accreditation', label: 'NABL · QAI · IQAS Accreditation', icon: Microscope },
]

/** Home: one screen with the headline, the three lines of work and key figures. */
export default function PublicHomePage() {
  usePublicPageTitle('Quality Engineering · BIS & ISO Certification Consultants, Raipur')

  return (
    <PublicScreen tone="hero">
      <div className="qp-hero-block">
        <span className="qp-eyebrow qp-rise">{HERO.eyebrow}</span>
        <h1 className="qp-hero-title qp-rise" style={rise(1)}>
          {HERO.titleLead} <span className="qp-gradient-text">{HERO.titleAccent}</span>
        </h1>
        <p className="qp-hero-lead qp-rise" style={rise(2)}>
          {HERO.lead}
        </p>
        <div className="qp-hero-ctas qp-rise" style={rise(3)}>
          <Link to="/enquiry" className="qp-btn">
            Send an Enquiry
          </Link>
          <Link to="/bis-certification" className="qp-link">
            Explore Our Services <ChevronRight size={18} />
          </Link>
        </div>
        <div className="qp-pill-row qp-rise" style={rise(4)} aria-label="Our Work">
          {PILLS.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="qp-pill">
              <Icon size={16} aria-hidden /> {label}
            </Link>
          ))}
        </div>
        <div className="qp-stats qp-rise" style={rise(5)}>
          {STATS.map((s) => (
            <div key={s.label} className="qp-stat">
              <span className="qp-stat-value">{s.value}</span>
              <span className="qp-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </PublicScreen>
  )
}
