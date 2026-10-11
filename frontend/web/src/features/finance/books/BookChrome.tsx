import type { ReactNode } from 'react'
import { limsPageShellClass, limsPanelClass } from '@/lib/limsThemeUi'

export function BookChrome({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className={`${limsPageShellClass} space-y-3 p-3 sm:p-4`}>
      <div className={limsPanelClass}>
        <h1 className="text-lg font-semibold text-stone-900">{title}</h1>
        {hint ? <p className="mt-1 text-sm text-stone-600">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}
