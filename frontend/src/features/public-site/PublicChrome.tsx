import type { ReactNode } from 'react'
import {
  limsDarkBarAccentClass,
  limsDarkBarClass,
  limsDarkBarGlowStyle,
  limsPageShellClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export const publicHeroPatternStyle = {
  backgroundImage:
    'repeating-linear-gradient(60deg, rgb(var(--color-amber-400) / 0.16) 0 1px, transparent 1px 28px), repeating-linear-gradient(-60deg, rgb(var(--color-amber-400) / 0.08) 0 1px, transparent 1px 28px)',
} as const

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
    <div className={cn(limsPageShellClass, 'max-w-[1200px]')}>
      <div className={limsPanelClass}>
        <div className={cn(limsDarkBarClass, 'px-5 py-3.5 sm:px-6')}>
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className={limsDarkBarAccentClass} />
          <h1 className="relative text-lg font-semibold tracking-tight text-white sm:text-xl">{title}</h1>
          <p className="relative mt-1 max-w-3xl text-xs text-stone-300 sm:text-sm">{subtitle}</p>
        </div>
        <div className="space-y-4 bg-card p-5 sm:p-6">{children}</div>
      </div>
    </div>
  )
}

export function PublicSection({
  id,
  title,
  subtitle,
  children,
}: {
  id: string
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-16">
      <div className={limsPanelClass}>
        <div className={cn(limsDarkBarClass, 'px-5 py-3.5 sm:px-6')}>
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className={limsDarkBarAccentClass} />
          <h2 className="relative text-center text-lg font-semibold tracking-tight text-white sm:text-xl">{title}</h2>
          {subtitle ? (
            <p className="relative mt-1 max-w-3xl text-xs text-stone-300 sm:text-sm">{subtitle}</p>
          ) : null}
        </div>
        <div className="space-y-4 bg-card p-5 sm:p-6">{children}</div>
      </div>
    </section>
  )
}
export function PublicInfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-none border border-stone-500 bg-stone-50 p-4">
      <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">{body}</p>
    </div>
  )
}
