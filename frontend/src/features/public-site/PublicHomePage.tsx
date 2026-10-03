import { useEffect, useState } from 'react'
import { Award, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  limsDarkBarAccentClass,
  limsDarkBarBtnClass,
  limsDarkBarClass,
  limsDarkBarGlowStyle,
  limsFieldClass,
  limsPageShellClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { PublicInfoCard, PublicSection, publicHeroPatternStyle } from './PublicChrome'
import {
  PUBLIC_ADDRESS,
  PUBLIC_BIS,
  PUBLIC_DOC_BIS,
  PUBLIC_DOC_NABL_CALIBRATION,
  PUBLIC_DOC_NABL_TESTING,
  PUBLIC_EMAIL,
  PUBLIC_LAB_NAME,
  PUBLIC_MAP_LAT,
  PUBLIC_MAP_LNG,
  PUBLIC_NABL_CALIBRATION,
  PUBLIC_NABL_TESTING,
  PUBLIC_PHONE_PRIMARY,
  PUBLIC_PHONE_SECONDARY,
  PUBLIC_TAGLINE_ACCENT,
  PUBLIC_TAGLINE_LEAD,
  PUBLIC_TAGLINE_SUB,
} from './publicNav'

const ACCREDITATION_PANELS: Array<{
  id: string
  label: string
  eyebrow: string
  detail: string
  code: string
  docTitle: string
  actionLabel: string
  href: string
  grow: string
  logoSrc: string
  logoAlt: string
}> = [
  {
    id: 'accreditation-bis',
    label: 'BIS Recognized Testing',
    eyebrow: 'BIS Scope',
    detail: 'Authorized Testing Centre',
    code: PUBLIC_BIS,
    docTitle: 'BIS Scope Letter',
    actionLabel: 'View Scope Letter',
    href: PUBLIC_DOC_BIS,
    grow: 'flex-[33_1_0%]',
    logoSrc: '/brand/bis-logo.svg',
    logoAlt: 'BIS logo',
  },
  {
    id: 'accreditation-testing',
    label: 'ISO 17025 Recognized Testing',
    eyebrow: 'NABL Testing',
    detail: 'ISO/IEC 17025:2017',
    code: PUBLIC_NABL_TESTING,
    actionLabel: 'View Scope Letter',
    docTitle: 'NABL Testing Certificate',
    href: PUBLIC_DOC_NABL_TESTING,
    grow: 'flex-[33_1_0%]',
    logoSrc: '/brand/nabl-logo.svg',
    logoAlt: 'NABL logo',
  },
  {
    id: 'accreditation-calibration',
    label: 'ISO 17025 Recognized Calibration',
    eyebrow: 'NABL Calibration',
    detail: 'ISO/IEC 17025:2017',
    code: PUBLIC_NABL_CALIBRATION,
    actionLabel: 'View Scope Letter',
    docTitle: 'NABL Calibration Certificate',
    href: PUBLIC_DOC_NABL_CALIBRATION,
    grow: 'flex-[34_1_0%]',
    logoSrc: '/brand/nabl-logo.svg',
    logoAlt: 'NABL logo',
  },
]

type ContactPanel = 'contact' | 'map' | 'enquiry'

const CONTACT_TABS: Array<{ id: ContactPanel; label: string }> = [
  { id: 'contact', label: 'Contact Us' },
  { id: 'map', label: 'Location Map' },
  { id: 'enquiry', label: 'Send Enquiry' },
]

const LOCATION_MAP_PIN = `${PUBLIC_MAP_LAT},${PUBLIC_MAP_LNG}`
const LOCATION_MAP_EMBED = `https://maps.google.com/maps?q=${LOCATION_MAP_PIN}&z=17&output=embed`
const LOCATION_MAP_LINK = `https://maps.google.com/maps?q=${LOCATION_MAP_PIN}`

function AccreditationCard({
  item,
}: {
  item: (typeof ACCREDITATION_PANELS)[number]
}) {
  return (
    <div className="accreditation-card relative flex h-full min-h-0 flex-col items-center justify-center gap-2.5 overflow-hidden border border-amber-500/45 bg-gradient-to-b from-stone-800/90 to-stone-950/80 px-4 py-4 text-center">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border border-amber-400/60 bg-white p-1">
        <img src={item.logoSrc} alt={item.logoAlt} className="h-full w-full object-contain" />
      </span>
      <div className="relative space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">{item.eyebrow}</p>
        <p className="text-sm font-bold leading-snug text-white sm:text-[15px]">{item.label}</p>
        <p className="text-[11px] text-stone-400">{item.detail}</p>
      </div>
      <p className="relative border border-amber-500/40 bg-stone-950/50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-amber-50">
        {item.code}
      </p>
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={item.actionLabel}
        className={cn(limsPrimaryBtnClass, 'relative inline-flex h-8 items-center gap-1.5 px-3')}
      >
        <FileText size={14} />
        {item.actionLabel}
      </a>
    </div>
  )
}

export default function PublicHomePage() {
  const [contactPanel, setContactPanel] = useState<ContactPanel>('contact')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const canSubmit = Boolean(email.trim() && message.trim())

  useEffect(() => {
    const id = window.location.hash.replace('#', '')
    if (!id) return
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const sendEnquiry = () => {
    const subject = encodeURIComponent('Enquiry — QIRLPL website')
    const body = encodeURIComponent(`Email: ${email.trim()}\n\n${message.trim()}`)
    window.location.href = `mailto:${PUBLIC_EMAIL}?subject=${subject}&body=${body}`
  }

  return (
    <div className="grid flex-1 lg:grid-cols-[25%_50%_25%]">
      <aside className={cn(limsDarkBarClass, 'flex h-full flex-col p-0')}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.22]" style={limsDarkBarGlowStyle} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.16]" style={publicHeroPatternStyle} />
        <div className={limsDarkBarAccentClass} />
        <div className="absolute right-0 top-0 hidden h-full w-[2px] bg-gradient-to-b from-amber-500 via-amber-300 to-transparent lg:block" />

        <div className="relative flex min-h-[240px] flex-1 flex-col items-center justify-center px-4 py-6 text-center sm:px-5 lg:px-6">
          <p className="mb-4 inline-flex items-center gap-2 border border-amber-500/40 bg-stone-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100">
            <Award size={14} className="shrink-0 text-amber-300" />
            NABL Accredited & BIS Recognized Laboratory
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl xl:text-4xl">
            {PUBLIC_TAGLINE_LEAD} <span className="text-amber-300">{PUBLIC_TAGLINE_ACCENT}</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-stone-300">{PUBLIC_TAGLINE_SUB}</p>
        </div>

        <div className="relative h-px shrink-0 bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div
          id="contact"
          className="relative z-[1] flex min-h-[240px] flex-1 scroll-mt-16 flex-col justify-start gap-3 overflow-y-auto px-4 py-6 sm:px-5 lg:px-6"
        >
          <div className="grid grid-cols-3 gap-1">
            {CONTACT_TABS.map((tab) => (
              <Button
                key={tab.id}
                type="button"
                className={cn(
                  contactPanel === tab.id
                    ? limsPrimaryBtnClass
                    : cn(limsDarkBarBtnClass, 'hover:bg-amber-500/20'),
                  'h-auto min-h-8 px-1 py-1.5 text-[10px] leading-tight whitespace-normal sm:text-xs',
                )}
                aria-pressed={contactPanel === tab.id}
                onClick={() => setContactPanel(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {contactPanel === 'contact' ? (
            <div className="space-y-2 text-sm text-stone-200">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/80">
                Laboratory & Office
              </p>
              <p className="text-xs leading-relaxed text-stone-300">{PUBLIC_ADDRESS}</p>
              <a className="block break-all hover:text-amber-200" href={`mailto:${PUBLIC_EMAIL}`}>
                {PUBLIC_EMAIL}
              </a>
              <a className="block hover:text-amber-200" href="tel:+919981633040">
                {PUBLIC_PHONE_PRIMARY}
              </a>
              <a className="block hover:text-amber-200" href="tel:+919914663040">
                {PUBLIC_PHONE_SECONDARY}
              </a>
            </div>
          ) : null}

          {contactPanel === 'map' ? (
            <div className="space-y-2">
              <div className="overflow-hidden border border-amber-500/35 bg-stone-900/50">
                <iframe
                  title="Laboratory location map"
                  src={LOCATION_MAP_EMBED}
                  className="h-64 w-full border-0 bg-stone-200"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
              <a
                href={LOCATION_MAP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-xs font-medium text-amber-200 hover:text-amber-100"
              >
                Open in Google Maps
              </a>
            </div>
          ) : null}

          {contactPanel === 'enquiry' ? (
            <div className="space-y-3 border border-amber-500/35 bg-stone-900/50 p-3">
              <div className="space-y-2">
                <Label htmlFor="enquiry-email" className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                  Email
                </Label>
                <Input
                  id="enquiry-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn(limsFieldClass, 'border-amber-500/40 bg-stone-900/80 text-white')}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="enquiry-message"
                  className="text-[11px] font-semibold uppercase tracking-wide text-amber-200"
                >
                  Message
                </Label>
                <textarea
                  id="enquiry-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className={cn(
                    limsFieldClass,
                    'h-auto min-h-[6rem] w-full border-amber-500/40 bg-stone-900/80 py-2 text-white',
                  )}
                />
              </div>
              <Button
                type="button"
                className={cn(limsPrimaryBtnClass, 'h-9 w-full')}
                disabled={!canSubmit}
                onClick={sendEnquiry}
              >
                Open Email to Send
              </Button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className={cn(limsPageShellClass, 'max-w-none min-w-0')}>
        <PublicSection id="about" title="About QIRLPL">
          <PublicInfoCard
            title="Our Laboratory"
            body={`${PUBLIC_LAB_NAME} (QIRLPL) is a NABL-accredited testing and calibration laboratory incorporated on 12th February 2024. We operate from Raipur, Chhattisgarh, serving manufacturing, construction, and quality-conscious industries with independent, traceable test and calibration results.`}
          />
          <PublicInfoCard
            title="Leadership"
            body="Our operations are led by Director Yogeshwar Krishna, with a commitment to ISO/IEC 17025:2017 across all activities. We maintain strict quality controls, trained personnel, and calibrated equipment to deliver results you can rely on for compliance and business decisions."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <PublicInfoCard
              title="Mission"
              body="To provide accurate, timely testing and calibration services with full traceability and impartiality, supporting industry quality and compliance."
            />
            <PublicInfoCard
              title="Vision"
              body="To be the preferred NABL-accredited laboratory in the region for testing and calibration, recognised for reliability and professional service."
            />
          </div>
          <PublicInfoCard title="Location" body={PUBLIC_ADDRESS} />
        </PublicSection>
      </div>

      <aside className={cn(limsDarkBarClass, 'flex h-full flex-col p-0')}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.22]" style={limsDarkBarGlowStyle} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.16]" style={publicHeroPatternStyle} />
        <div className={limsDarkBarAccentClass} />
        <div className="absolute left-0 top-0 hidden h-full w-[2px] bg-gradient-to-b from-amber-500 via-amber-300 to-transparent lg:block" />

        {ACCREDITATION_PANELS.map((item, index) => (
          <div
            key={item.id}
            id={item.id}
            className={cn(
              'relative z-[1] flex min-h-0 w-full flex-col p-3 sm:p-4',
              item.grow,
              index > 0 && 'border-t border-amber-500/35',
            )}
          >
            <AccreditationCard item={item} />
          </div>
        ))}
      </aside>
    </div>
  )
}
