import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Globe, Mail, MapPin, Phone } from 'lucide-react'
import {
  ABOUT,
  BIS_ROUTES,
  BIS_WORK,
  FAMILIES,
  ISO_PATH,
  ISO_SYSTEMS,
  LAB_SCHEMES,
  LICENCE_PATH,
  PATH_NOTES,
  SECTORS,
  WHY_US,
} from './siteContent'
import { SiteIcon, SitePage } from './siteParts'
import { delay, usePageTitle } from './siteUtils'
import { PUBLIC_ADDRESS, PUBLIC_EMAIL, PUBLIC_MAP_LAT, PUBLIC_MAP_LNG, PUBLIC_PHONE_PRIMARY, PUBLIC_WEBSITE } from './publicNav'

const familyCount = FAMILIES.reduce((sum, f) => sum + f.standards.length, 0)
const mapPoint = `${PUBLIC_MAP_LAT},${PUBLIC_MAP_LNG}`

/* ---------------------------------------------------------------- BIS Certification */

export function BisCertificationPage() {
  usePageTitle('BIS Certification (ISI Mark) · Quality Engineering')
  return (
    <SitePage
      tone="mist"
      kicker="BIS Product Certification · Scheme-I"
      title="From Application to ISI Mark."
      lede="Every step of a BIS licence, and everything after it, handled with you."
    >
      <div className="qs-grid n4">
        {BIS_WORK.map((w, i) => (
          <article key={w.title} className={`qs-card striped tone-${i % 7} qs-in`} style={delay(i + 1)}>
            <div className="qs-card-head">
              <SiteIcon name={w.icon} tone={i} />
              <h2>{w.title}</h2>
            </div>
            <p className="qs-note">{w.note}</p>
            <ul className="qs-ticks">
              {w.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="qs-strip qs-in" style={delay(9)}>
        <span className="qs-tag red">Two Routes</span>
        <p>{BIS_ROUTES}</p>
        <Link to="/how-it-works" className="qs-more">
          The Five Steps <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
    </SitePage>
  )
}

/* ---------------------------------------------------------------- Products */

export function ProductsPage() {
  usePageTitle('Products & Indian Standards · Quality Engineering')
  return (
    <SitePage
      kicker="Products We Cover"
      title="Your Product. Your Standard."
      lede="From steel and pipes to kitchenware, plastics, textiles and food: we know what each Indian Standard asks for."
    >
      <div className="qs-banner qs-in" style={delay(1)}>
        <SiteIcon name="licence" tone={0} large />
        <div className="qs-banner-num">
          <small>Indian Standards Handled</small>
          <b>330+</b>
        </div>
        <div className="qs-banner-text">
          <span>Steel, pipes, stainless steel, housewares, plastics, textiles, building products and food.</span>
          <span>For each standard: the documents, the in-house tests and the implementation formats.</span>
          <span>The {familyCount} standards below are the ones our clients hold most.</span>
        </div>
        <Link to="/enquiry" className="qs-more">
          Ask About Your Product <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      <div className="qs-grid n4">
        {FAMILIES.map((f, i) => (
          <article key={f.title} className="qs-card qs-in" style={delay(i + 2)}>
            <div className="qs-card-head">
              <SiteIcon name={f.icon} tone={i} />
              <h2>{f.title}</h2>
              <span className="qs-count qs-push">{f.standards.length}</span>
            </div>
            <div className="qs-tags">
              {f.standards.map((s) => (
                <span key={s} className="qs-tag">
                  {s}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </SitePage>
  )
}

/* ---------------------------------------------------------------- ISO Certification */

export function IsoCertificationPage() {
  usePageTitle('ISO Certification · Quality Engineering')
  return (
    <SitePage
      tone="mist"
      kicker="ISO Management Systems"
      title="Systems That Work Every Day."
      lede="Consultancy for ISO management system certification, from the first gap analysis to the certificate."
    >
      <div className="qs-grid n4">
        {ISO_SYSTEMS.map((s, i) => (
          <article key={s.code} className={`qs-card striped tone-${(i + 2) % 7} qs-in`} style={delay(i + 1)}>
            <div className="qs-card-head">
              <SiteIcon name={s.icon} tone={i + 2} />
              <span className="qs-tag qs-push">{s.code}</span>
            </div>
            <h2>{s.title}</h2>
            <p className="qs-note">{s.note}</p>
          </article>
        ))}
      </div>
      <ol className="qs-flow" style={{ marginTop: 'var(--qs-gap)' }}>
        {ISO_PATH.map((step, i) => (
          <li key={step.title} className="qs-in" style={delay(i + 5)}>
            <span className="qs-flow-num">{i + 1}</span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </SitePage>
  )
}

/* ---------------------------------------------------------------- Lab Accreditation */

export function AccreditationPage() {
  usePageTitle('Laboratory Accreditation · Quality Engineering')
  return (
    <SitePage
      tone="night"
      narrow
      kicker="Laboratory Accreditation"
      title="Ready for Assessment."
      lede="Consultancy for testing and calibration laboratories seeking NABL, QAI or IQAS accreditation."
    >
      <div className="qs-grid n3">
        {LAB_SCHEMES.map((s, i) => (
          <article key={s.code} className="qs-card on-night qs-scheme qs-in" style={delay(i + 1)}>
            <SiteIcon name={s.icon} tone={i + 1} large />
            <span className="qs-scheme-name">{s.name}</span>
            <span className="qs-scheme-code">{s.code}</span>
            <p className="qs-note">{s.note}</p>
            <ul className="qs-ticks">
              {s.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="qs-foot-note qs-in" style={delay(4)}>
        The accreditation body assesses the laboratory and decides. We prepare the laboratory, its people and its records
        for that assessment.
      </p>
    </SitePage>
  )
}

/* ---------------------------------------------------------------- How it Works */

export function HowItWorksPage() {
  usePageTitle('How it Works · Quality Engineering')
  return (
    <SitePage
      tone="mist"
      kicker="How It Works"
      title="Five Steps to Your Licence."
      lede="A clear path to a BIS licence, and support for as long as you hold it."
    >
      <ol className="qs-flow">
        {LICENCE_PATH.map((step, i) => (
          <li key={step.title} className="qs-in" style={delay(i + 1)}>
            <span className="qs-flow-num">{i + 1}</span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
      <div className="qs-grid n3" style={{ marginTop: 'var(--qs-gap)' }}>
        {PATH_NOTES.map((n, i) => {
          const body = (
            <>
              <SiteIcon name={n.icon} tone={i + 3} />
              <div>
                <h3>{n.title}</h3>
                <p className="qs-note">{n.text}</p>
              </div>
            </>
          )
          return n.to ? (
            <Link key={n.title} to={n.to} className="qs-card row qs-in" style={delay(i + 6)}>
              {body}
            </Link>
          ) : (
            <div key={n.title} className="qs-card row qs-in" style={delay(i + 6)}>
              {body}
            </div>
          )
        })}
      </div>
    </SitePage>
  )
}

/* ---------------------------------------------------------------- About */

export function AboutPage() {
  usePageTitle('About · Quality Engineering')
  return (
    <SitePage kicker="About Quality Engineering" title="Consultants Who Know the Shop Floor.">
      <div className="qs-split">
        <div className="qs-stack">
          {ABOUT.map((a, i) => (
            <article key={a.title} className="qs-card qs-in" style={delay(i + 1)}>
              <h2>{a.title}</h2>
              <p className="qs-note">{a.text}</p>
            </article>
          ))}
        </div>
        <div className="qs-stack">
          <div className="qs-grid n3 qs-in" style={delay(2)}>
            {WHY_US.map((w, i) => (
              <div key={w.title} className="qs-card">
                <SiteIcon name={w.icon} tone={i} />
                <h3>{w.title}</h3>
                <p className="qs-note">{w.text}</p>
              </div>
            ))}
          </div>
          <div className="qs-card on-night qs-in" style={delay(4)}>
            <span className="qs-scheme-name">Industries We Serve</span>
            <div className="qs-tags">
              {SECTORS.map((s) => (
                <span key={s} className="qs-tag night">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SitePage>
  )
}

/* ---------------------------------------------------------------- Contact */

export function ContactPage() {
  usePageTitle('Contact · Quality Engineering')
  const [who, setWho] = useState('')
  const [email, setEmail] = useState('')
  const [need, setNeed] = useState('')
  const ready = Boolean(email.trim() && need.trim())

  // The visitor's own email app sends the enquiry; nothing is stored on the website.
  const openMail = () => {
    const subject = encodeURIComponent('Enquiry from the Quality Engineering website')
    const from = [who.trim() && `Name and Company: ${who.trim()}`, `Email: ${email.trim()}`].filter(Boolean).join('\n')
    window.location.href = `mailto:${PUBLIC_EMAIL}?subject=${subject}&body=${encodeURIComponent(`${from}\n\n${need.trim()}`)}`
  }

  return (
    <SitePage
      tone="mist"
      kicker="Contact"
      title="Tell Us About Your Product."
      lede="Share the product and its Indian Standard. We reply with the documents, the steps and the time it takes."
    >
      <div className="qs-split even">
        <article className="qs-card qs-in" style={delay(1)}>
          <h2>Office</h2>
          <div>
            <p className="qs-contact-line">
              <MapPin size={17} aria-hidden /> {PUBLIC_ADDRESS}
            </p>
            <p className="qs-contact-line">
              <Mail size={17} aria-hidden /> <a href={`mailto:${PUBLIC_EMAIL}`}>{PUBLIC_EMAIL}</a>
            </p>
            <p className="qs-contact-line">
              <Phone size={17} aria-hidden /> <a href={`tel:${PUBLIC_PHONE_PRIMARY.replace(/[^+\d]/g, '')}`}>{PUBLIC_PHONE_PRIMARY}</a>
            </p>
            <p className="qs-contact-line">
              <Globe size={17} aria-hidden /> {PUBLIC_WEBSITE}
            </p>
          </div>
          <iframe
            title="Office Location Map"
            src={`https://maps.google.com/maps?q=${mapPoint}&z=16&output=embed`}
            className="qs-map"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <a href={`https://maps.google.com/maps?q=${mapPoint}`} target="_blank" rel="noopener noreferrer" className="qs-more">
            Get Directions <ChevronRight size={16} aria-hidden />
          </a>
        </article>

        <article className="qs-card qs-in" style={delay(2)}>
          <h2>Send an Enquiry</h2>
          <div className="qs-form">
            <div className="qs-field">
              <label htmlFor="enquiry-who">Name and Company</label>
              <input id="enquiry-who" className="qs-input" value={who} onChange={(e) => setWho(e.target.value)} autoComplete="organization" />
            </div>
            <div className="qs-field">
              <label htmlFor="enquiry-email">Email</label>
              <input
                id="enquiry-email"
                type="email"
                className="qs-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="qs-field">
              <label htmlFor="enquiry-need">What Do You Need?</label>
              <textarea
                id="enquiry-need"
                className="qs-input"
                rows={2}
                value={need}
                onChange={(e) => setNeed(e.target.value)}
                placeholder="Product, Indian Standard (e.g. IS 2062), New Licence, Renewal or ISO / NABL"
              />
            </div>
            <button type="button" className="qs-btn" disabled={!ready} onClick={openMail}>
              Send by Email
            </button>
            <p className="qs-hint">Opens your email app with the message ready to send to {PUBLIC_EMAIL}.</p>
          </div>
        </article>
      </div>
    </SitePage>
  )
}
