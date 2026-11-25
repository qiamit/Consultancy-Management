import type { ReactNode } from 'react'
import {
  Atom,
  BadgeCheck,
  Building2,
  ClipboardCheck,
  Cog,
  Eye,
  FileCheck2,
  Flame,
  FlaskConical,
  Gauge,
  Layers,
  Lock,
  Microscope,
  Ruler,
  Scale,
  ShieldCheck,
  Thermometer,
  Timer,
  Truck,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IconName } from './publicContent'

const ICONS: Record<IconName, LucideIcon> = {
  atom: Atom,
  badge: BadgeCheck,
  building: Building2,
  clipboard: ClipboardCheck,
  cog: Cog,
  eye: Eye,
  file: FileCheck2,
  flame: Flame,
  flask: FlaskConical,
  gauge: Gauge,
  layers: Layers,
  lock: Lock,
  microscope: Microscope,
  ruler: Ruler,
  scale: Scale,
  shield: ShieldCheck,
  thermometer: Thermometer,
  timer: Timer,
  truck: Truck,
  waves: Waves,
  zap: Zap,
}

const ICON_TONES = ['blue', 'indigo', 'teal', 'orange', 'green', 'pink', 'gray'] as const

/** Rounded square icon with an Apple-style gradient. */
export function PublicIcon({ name, index = 0, size = 'md' }: { name: IconName; index?: number; size?: 'sm' | 'md' }) {
  const Glyph = ICONS[name]
  return (
    <span className={cn('qp-icon', size === 'sm' && 'sm', ICON_TONES[index % ICON_TONES.length])} aria-hidden>
      <Glyph strokeWidth={1.9} />
    </span>
  )
}

/**
 * One page of the public website. On a laptop or desktop screen the page is exactly one screen high
 * (top bar and footer included) and its content is centred in it; on a phone it simply scrolls.
 */
export function PublicScreen({
  tone,
  eyebrow,
  title,
  subtitle,
  children,
  wide,
}: {
  tone?: 'alt' | 'dark' | 'hero'
  eyebrow?: string
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  return (
    <section className={cn('qp-screen', tone)}>
      <div className={wide ? 'qp-wrap-wide' : 'qp-wrap'}>
        {title ? (
          <header className="qp-screen-head qp-rise">
            {eyebrow ? <span className="qp-eyebrow">{eyebrow}</span> : null}
            <h1 className="qp-screen-title">{title}</h1>
            {subtitle ? <p className="qp-screen-sub">{subtitle}</p> : null}
          </header>
        ) : null}
        {children}
      </div>
    </section>
  )
}

/** A page of its own that is allowed to scroll (complaints process, scope letters). */
export function PublicPageFrame({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="qp-page">
      <div className="qp-wrap">
        <div className="qp-head" style={{ marginBottom: 40 }}>
          <h1 className="qp-h2">{title}</h1>
          <p className="qp-lead" style={{ marginTop: 14 }}>
            {subtitle}
          </p>
        </div>
        <div className="qp-panel">{children}</div>
      </div>
    </div>
  )
}
