import type { ReactNode } from 'react'
import {
  BadgeCheck,
  Building2,
  Cylinder,
  Database,
  Eye,
  FilePen,
  Flame,
  FlaskConical,
  Gauge,
  HardHat,
  Layers,
  Leaf,
  ListChecks,
  Lock,
  MessageSquareReply,
  Microscope,
  RefreshCw,
  Scale,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/** Icons the website uses, by a short name the content file can refer to. */
const GLYPHS = {
  licence: BadgeCheck,
  stack: Layers,
  renew: RefreshCw,
  watch: Eye,
  reply: MessageSquareReply,
  changes: FilePen,
  notice: TriangleAlert,
  checklist: ListChecks,
  furnace: Flame,
  pipe: Cylinder,
  guard: ShieldCheck,
  bolt: Zap,
  water: Waves,
  building: Building2,
  lab: Microscope,
  flask: FlaskConical,
  scale: Scale,
  leaf: Leaf,
  safety: HardHat,
  gauge: Gauge,
  timer: Timer,
  lock: Lock,
  records: Database,
} satisfies Record<string, LucideIcon>

export type SiteIconName = keyof typeof GLYPHS

/** A rounded icon badge; the tone (0–6) picks one of the brand gradients. */
export function SiteIcon({ name, tone = 0, large }: { name: SiteIconName; tone?: number; large?: boolean }) {
  const Glyph = GLYPHS[name]
  return (
    <span className={`qs-ico tone-${tone % 7}${large ? ' lg' : ''}`} aria-hidden>
      <Glyph strokeWidth={2} />
    </span>
  )
}

/**
 * One website page: a heading block and the page's content. On a laptop or desktop it fills exactly the space
 * between the top bar and the footer, with the content centred; on a phone it scrolls.
 */
export function SitePage({
  tone,
  kicker,
  title,
  lede,
  narrow,
  children,
}: {
  tone?: 'mist' | 'night' | 'hero'
  kicker?: string
  title?: ReactNode
  lede?: ReactNode
  narrow?: boolean
  children: ReactNode
}) {
  return (
    <section className={`qs-page${tone ? ` ${tone}` : ''}`}>
      <div className={`qs-wrap${narrow ? ' narrow' : ''}`}>
        {title ? (
          <header className="qs-head qs-in">
            {kicker ? <span className="qs-kicker">{kicker}</span> : null}
            <h1 className="qs-title">{title}</h1>
            {lede ? <p className="qs-lede">{lede}</p> : null}
          </header>
        ) : null}
        {children}
      </div>
    </section>
  )
}
