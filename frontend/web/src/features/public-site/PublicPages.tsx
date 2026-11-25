import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Mail, MapPin, Phone } from 'lucide-react'
import { PublicIcon, PublicScreen } from './PublicChrome'
import {
  ABOUT_CARDS,
  ACCREDITATIONS,
  BIS_SERVICES,
  INDUSTRIES,
  ISO_STEPS,
  ISO_SYSTEMS,
  PROCESS_STEPS,
  PRODUCT_GROUPS,
  QUALITY_POINTS,
} from './publicContent'
import {
  PUBLIC_ADDRESS,
  PUBLIC_EMAIL,
  PUBLIC_MAP_LAT,
  PUBLIC_MAP_LNG,
  PUBLIC_PHONE_PRIMARY,
  PUBLIC_WEBSITE,
} from './publicNav'
import { rise, usePublicPageTitle } from './publicPageUtils'

const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, '')}`
const MAP_PIN = `${PUBLIC_MAP_LAT},${PUBLIC_MAP_LNG}`
const MAP_EMBED = `https://maps.google.com/maps?q=${MAP_PIN}&z=16&output=embed`
const MAP_LINK = `https://maps.google.com/maps?q=${MAP_PIN}`
const PRODUCT_STANDARDS = PRODUCT_GROUPS.reduce((n, g) => n + g.standards.length, 0)

/* ------------------------------------------------------------------ BIS Certification */

export function BisCertificationPage() {
  usePublicPageTitle('BIS Certification (ISI Mark) · Quality Engineering')
  return (
    <PublicScreen
      tone="alt"
      wide
      eyebrow="BIS Product Certification · Scheme-I · ISI Mark"
      title="From Application to ISI Mark."
      subtitle="Every step of a BIS licence, and everything after it, handled with you."
    >
      <div className="qp-tiles cols-4">
        {BIS_SERVICES.map((s, i) => (
          <article key={s.title} className="qp-tile qp-rise" style={rise(i + 1)}>
            <div className="qp-tile-top" style={{ justifyContent: 'flex-start' }}>
              <PublicIcon name={s.icon} index={i} size="sm" />
              <h2 className="qp-tile-title" style={{ margin: 0 }}>
                {s.title}
              </h2>
            </div>
            <p className="qp-tile-body">{s.body}</p>
            <ul className="qp-list">
              {s.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="qp-strip qp-rise" style={rise(9)}>
        <span className="qp-tag nabl">Two Routes</span>
        <p className="qp-tile-body" style={{ margin: 0, flex: '1 1 320px' }}>
          Normal procedure: BIS inspects the factory and tests samples first. Simplified procedure: the licence comes
          first on independent test reports, then BIS verifies. The product&apos;s standard decides which applies.
        </p>
        <Link to="/how-it-works" className="qp-link">
          How It Works <ChevronRight size={16} />
        </Link>
      </div>
    </PublicScreen>
  )
}

/* ------------------------------------------------------------------ Products */

export function ProductsPage() {
  usePublicPageTitle('Products & Indian Standards · Quality Engineering')
  return (
    <PublicScreen
      wide
      eyebrow="Products We Cover · Indian Standards"
      title="Your Product. Your Standard."
      subtitle="From steel and pipes to kitchenware, plastics, textiles and food: we know what each Indian Standard asks for."
    >
      <div className="qp-band qp-rise" style={rise(1)}>
        {/* No ISI mark or NABL logo here: their use is for licensees and accredited labs, not for a consultant. */}
        <PublicIcon name="badge" index={1} />
        <div className="qp-band-main">
          <span className="qp-band-label">Indian Standards Handled</span>
          <span className="qp-band-code">330+</span>
        </div>
        <div className="qp-band-facts">
          <span>Steel, pipes, stainless steel, housewares, plastics, textiles, building products and food.</span>
          <span>For each standard: the documents, the in-house tests and the implementation formats.</span>
          <span>The {PRODUCT_STANDARDS} standards below are the ones our clients ask for most.</span>
        </div>
        <Link to="/enquiry" className="qp-link qp-band-link">
          Ask About Your Product <ChevronRight size={16} />
        </Link>
      </div>
      <div className="qp-tiles cols-4">
        {PRODUCT_GROUPS.map((g, i) => (
          <article key={g.title} className="qp-tile compact qp-rise" style={rise(i + 2)}>
            <div className="qp-tile-top">
              <PublicIcon name={g.icon} index={i} size="sm" />
              <span className="qp-tile-count">{g.standards.length}</span>
            </div>
            <h2 className="qp-tile-title">{g.title}</h2>
            <div className="qp-chips">
              {g.standards.map((s) => (
                <span key={s} className="qp-chip">
                  {s}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </PublicScreen>
  )
}

/* ------------------------------------------------------------------ ISO Certification */

export function IsoCertificationPage() {
  usePublicPageTitle('ISO Certification · Quality Engineering')
  return (
    <PublicScreen
      tone="alt"
      wide
      eyebrow="ISO Certification · Management Systems"
      title="Systems That Work Every Day."
      subtitle="Consultancy for ISO management system certification, from the first gap analysis to the certificate."
    >
      <div className="qp-tiles cols-4">
        {ISO_SYSTEMS.map((s, i) => (
          <article key={s.code} className="qp-tile compact qp-rise" style={rise(i + 1)}>
            <div className="qp-tile-top">
              <PublicIcon name={s.icon} index={i + 2} size="sm" />
              <span className="qp-tag nabl">{s.code}</span>
            </div>
            <h2 className="qp-tile-title">{s.title}</h2>
            <p className="qp-tile-body">{s.body}</p>
          </article>
        ))}
      </div>
      <ol className="qp-steps" style={{ marginTop: 'var(--qp-gap)' }}>
        {ISO_STEPS.map((s, i) => (
          <li key={s.title} className="qp-step qp-rise" style={rise(i + 5)}>
            <span className="qp-step-num">{i + 1}</span>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
    </PublicScreen>
  )
}

/* ------------------------------------------------------------------ Lab Accreditation */

export function AccreditationPage() {
  usePublicPageTitle('Laboratory Accreditation · Quality Engineering')
  return (
    <PublicScreen
      tone="dark"
      eyebrow="Laboratory Accreditation"
      title="Ready for Assessment."
      subtitle="Consultancy for testing and calibration laboratories seeking NABL, QAI or IQAS accreditation."
    >
      <div className="qp-tiles cols-3">
        {ACCREDITATIONS.map((a, i) => (
          <article key={a.code} className="qp-acc-card qp-rise" style={rise(i + 1)}>
            <PublicIcon name={a.icon} index={i + 1} />
            <span className="qp-eyebrow" style={{ margin: 0 }}>
              {a.title}
            </span>
            <span className="qp-acc-code">{a.code}</span>
            <p className="qp-acc-note">{a.body}</p>
            <ul className="qp-list on-dark">
              {a.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="qp-acc-note dim qp-rise" style={{ ...rise(4), textAlign: 'center', marginTop: 'var(--qp-gap)' }}>
        The accreditation body assesses the laboratory and decides. We prepare the laboratory, its people and its
        records for that assessment.
      </p>
    </PublicScreen>
  )
}

/* ------------------------------------------------------------------ How it works */

export function HowItWorksPage() {
  usePublicPageTitle('How it Works · Quality Engineering')
  return (
    <PublicScreen
      tone="alt"
      wide
      eyebrow="How It Works"
      title="From Enquiry to Licence."
      subtitle="A clear, step-by-step path to a BIS licence, and support for as long as you hold it."
    >
      <ol className="qp-steps">
        {PROCESS_STEPS.map((s, i) => (
          <li key={s.title} className="qp-step qp-rise" style={rise(i + 1)}>
            <span className="qp-step-num">{i + 1}</span>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="qp-tiles cols-3" style={{ marginTop: 'var(--qp-gap)' }}>
        <div className="qp-tile row qp-rise" style={rise(6)}>
          <PublicIcon name="clipboard" index={3} size="sm" />
          <div>
            <h3 className="qp-tile-title">Before You Apply</h3>
            <p className="qp-tile-body">
              Our checklist lists every document: firm and factory papers, staff, machinery and test equipment.
            </p>
          </div>
        </div>
        <div className="qp-tile row qp-rise" style={rise(7)}>
          <PublicIcon name="flask" index={4} size="sm" />
          <div>
            <h3 className="qp-tile-title">Testing Your Samples</h3>
            <p className="qp-tile-body">
              We arrange testing at a BIS-recognised laboratory and check every report against the standard.
            </p>
          </div>
        </div>
        <Link to="/enquiry" className="qp-tile row link qp-rise" style={rise(8)}>
          <PublicIcon name="timer" index={5} size="sm" />
          <div>
            <h3 className="qp-tile-title">After the Licence</h3>
            <p className="qp-tile-body">Renewals, surveillance, inclusions and changes, on time. Talk to us ›</p>
          </div>
        </Link>
      </div>
    </PublicScreen>
  )
}

/* ------------------------------------------------------------------ About */

export function AboutPage() {
  usePublicPageTitle('About · Quality Engineering')
  return (
    <PublicScreen wide eyebrow="About Quality Engineering" title="Certification, Close to Industry.">
      <div className="qp-about">
        <div className="qp-about-col">
          {ABOUT_CARDS.map((c, i) => (
            <article key={c.title} className="qp-tile qp-rise" style={rise(i + 1)}>
              <h2 className="qp-tile-title">{c.title}</h2>
              <p className="qp-tile-body">{c.body}</p>
            </article>
          ))}
        </div>
        <div className="qp-about-col">
          <div className="qp-tiles cols-3 qp-rise" style={rise(2)}>
            {QUALITY_POINTS.map((q, i) => (
              <div key={q.title} className="qp-tile compact">
                <PublicIcon name={q.icon} index={i + 1} size="sm" />
                <h3 className="qp-tile-title">{q.title}</h3>
                <p className="qp-tile-body">{q.body}</p>
              </div>
            ))}
          </div>
          <div className="qp-tile dark qp-rise" style={rise(4)}>
            <span className="qp-band-label">Industries We Serve</span>
            <div className="qp-chips" style={{ paddingTop: 0 }}>
              {INDUSTRIES.map((ind) => (
                <span key={ind} className="qp-chip on-dark">
                  {ind}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PublicScreen>
  )
}

/* ------------------------------------------------------------------ Contact */

export function ContactPage() {
  usePublicPageTitle('Contact · Quality Engineering')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const canSubmit = Boolean(email.trim() && message.trim())

  const sendEnquiry = () => {
    const subject = encodeURIComponent('Enquiry from the Quality Engineering website')
    const body = encodeURIComponent(`${name.trim() ? `Name: ${name.trim()}\n` : ''}Email: ${email.trim()}\n\n${message.trim()}`)
    window.location.href = `mailto:${PUBLIC_EMAIL}?subject=${subject}&body=${body}`
  }

  return (
    <PublicScreen
      tone="alt"
      wide
      eyebrow="Contact"
      title="Let's Talk About Your Licence."
      subtitle="Tell us your product and its Indian Standard. We reply with the documents, the steps and the time it takes."
    >
      <div className="qp-contact">
        <article className="qp-tile qp-rise" style={rise(1)}>
          <h2 className="qp-tile-title">Office</h2>
          <div>
            <p className="qp-contact-row">
              <MapPin size={18} /> {PUBLIC_ADDRESS}
            </p>
            <a className="qp-contact-row" href={`mailto:${PUBLIC_EMAIL}`}>
              <Mail size={18} /> <span className="break-all">{PUBLIC_EMAIL}</span>
            </a>
            <div className="qp-contact-row">
              <Phone size={18} />
              <span className="flex flex-wrap gap-x-5 gap-y-1">
                <a href={telHref(PUBLIC_PHONE_PRIMARY)}>{PUBLIC_PHONE_PRIMARY}</a>
                <span>{PUBLIC_WEBSITE}</span>
              </span>
            </div>
          </div>
          <iframe
            title="Office Location Map"
            src={MAP_EMBED}
            className="qp-map"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
          <a href={MAP_LINK} target="_blank" rel="noopener noreferrer" className="qp-link">
            Get Directions <ChevronRight size={16} />
          </a>
        </article>

        <article className="qp-tile qp-rise" style={rise(2)}>
          <h2 className="qp-tile-title">Send an Enquiry</h2>
          <div className="qp-form">
            <div className="qp-field">
              <label htmlFor="enquiry-name">Name and Company</label>
              <input
                id="enquiry-name"
                className="qp-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="organization"
              />
            </div>
            <div className="qp-field">
              <label htmlFor="enquiry-email">Email</label>
              <input
                id="enquiry-email"
                type="email"
                className="qp-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="qp-field">
              <label htmlFor="enquiry-message">What Do You Need?</label>
              <textarea
                id="enquiry-message"
                className="qp-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Product, Indian Standard (e.g. IS 2062), New Licence, Renewal or ISO / NABL"
                rows={3}
              />
            </div>
            <button type="button" className="qp-btn" disabled={!canSubmit} onClick={sendEnquiry}>
              Send by Email
            </button>
            <p className="qp-small">Opens your email app with the message ready to send to {PUBLIC_EMAIL}.</p>
          </div>
        </article>
      </div>
    </PublicScreen>
  )
}
