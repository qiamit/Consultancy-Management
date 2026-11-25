import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { HOME } from './siteContent'
import { SiteIcon, SitePage } from './siteParts'
import { delay, usePageTitle } from './siteUtils'

/** Website home: the headline, the three lines of work and the company's figures, on one screen. */
export default function HomePage() {
  usePageTitle('Quality Engineering · BIS & ISO Certification Consultants, Raipur')

  return (
    <SitePage tone="hero">
      <div className="qs-hero">
        <span className="qs-hero-badge qs-in">{HOME.badge}</span>
        <h1 className="qs-in" style={delay(1)}>
          {HOME.title[0]} <span className="qs-ink-grad">{HOME.title[1]}</span>
        </h1>
        <p className="qs-hero-lede qs-in" style={delay(2)}>
          {HOME.lede}
        </p>
        <div className="qs-hero-actions qs-in" style={delay(3)}>
          <Link to="/enquiry" className="qs-btn">
            Send an Enquiry
          </Link>
          <Link to="/how-it-works" className="qs-more">
            How We Work <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
        <nav className="qs-lines qs-in" style={delay(4)} aria-label="Our Work">
          {HOME.lines.map((line, i) => (
            <Link key={line.to} to={line.to} className="qs-line">
              <SiteIcon name={line.icon} tone={i} /> {line.label}
            </Link>
          ))}
        </nav>
        <div className="qs-figures qs-in" style={delay(5)}>
          {HOME.figures.map((f) => (
            <div key={f.label} className="qs-figure">
              <b>{f.value}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </SitePage>
  )
}
