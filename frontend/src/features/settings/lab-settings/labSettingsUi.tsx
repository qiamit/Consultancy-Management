import { cn } from '@/lib/utils'
import {
  limsAddLinkClass,
  limsDarkBarGlowStyle,
  limsFieldClass,
  limsPanelClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import type { ReactNode } from 'react'

/** Matches Client Master field controls */
export const labFieldControlClass = limsFieldClass

/** Icon-only “+” trigger — matches Client Master add buttons */
export const labAddLinkClass = limsAddLinkClass

/** Themes nested Label / Input / SelectTrigger / Textarea like Client Master */
export const labRegistryFormClass = limsRegistryFormClass

type LabSettingsPanelProps = {
  eyebrow?: string
  title?: string
  children: ReactNode
  className?: string
}

export function LabSettingsPanel({ eyebrow, title, children, className }: LabSettingsPanelProps) {
  const showHeader = Boolean(title || eyebrow)

  return (
    <div className={cn(limsPanelClass, className)}>
      {showHeader ? (
        <div className="relative border-b border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-4 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative">
            {eyebrow ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/90">{eyebrow}</p>
            ) : null}
            {title ? (
              <h2 className={cn('text-lg font-semibold tracking-tight text-white', eyebrow && 'mt-1')}>
                {title}
              </h2>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={cn('space-y-5 bg-[#f7f3eb]/90 px-5 py-5', labRegistryFormClass)}>{children}</div>
    </div>
  )
}

type LabFormSectionProps = {
  step: string
  title: string
  children: ReactNode
  className?: string
}

export function LabFormSection({ step, title, children, className }: LabFormSectionProps) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-none border-2 border-stone-400 bg-white/90 shadow-sm ring-1 ring-amber-700/10',
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200/90">{step}</span>
        <h3 className="text-sm font-semibold tracking-tight text-white">{title}</h3>
      </div>
      <div className="space-y-5 px-4 py-5">{children}</div>
    </section>
  )
}
