import { useMemo, useState } from 'react'
import { BookOpen, ChevronDown, CircleHelp, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  limsDarkBarAccentClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsPageShellClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { HELP_FAQ_ITEMS, HELP_GUIDE_SECTIONS } from './helpContent'

export default function HelpPage() {
  const [query, setQuery] = useState('')
  const [openFaqId, setOpenFaqId] = useState<string | null>(HELP_FAQ_ITEMS[0]?.id ?? null)

  const q = query.trim().toLowerCase()

  const guideSections = useMemo(() => {
    if (!q) return HELP_GUIDE_SECTIONS
    return HELP_GUIDE_SECTIONS.filter(
      (section) =>
        section.title.toLowerCase().includes(q) ||
        section.summary.toLowerCase().includes(q) ||
        section.tips.some((tip) => tip.toLowerCase().includes(q)),
    )
  }, [q])

  const faqItems = useMemo(() => {
    if (!q) return HELP_FAQ_ITEMS
    return HELP_FAQ_ITEMS.filter(
      (item) =>
        item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q),
    )
  }, [q])

  return (
    <div className={cn(limsPageShellClass, 'min-h-0')}>
      <div className={limsPanelClass}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-5 sm:py-4">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className={limsDarkBarAccentClass} />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40">
                  <CircleHelp size={18} aria-hidden />
                </span>
                <h1 className="text-lg font-bold tracking-tight sm:text-xl">Help</h1>
              </div>
            </div>
            <div className="relative w-full sm:w-[18rem]">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Guide | FAQ"
                aria-label="Search help content"
                className={cn(limsDarkBarSearchClass, 'h-8 pl-8 text-xs')}
              />
            </div>
          </div>
        </div>

        <div className="space-y-5 bg-gradient-to-b from-stone-100/90 to-stone-50 p-4 sm:p-5">
          <section className="space-y-3" aria-labelledby="help-guide-heading">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-amber-800" aria-hidden />
              <h2 id="help-guide-heading" className="text-sm font-bold uppercase tracking-[0.14em] text-stone-800">
                Module guide
              </h2>
            </div>
            {guideSections.length === 0 ? (
              <p className="border border-stone-400 bg-white px-3 py-4 text-sm text-stone-600">
                No guide topics match your search.
              </p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {guideSections.map((section) => (
                  <article
                    key={section.id}
                    className="border-2 border-stone-500 bg-card p-3 shadow-sm ring-1 ring-amber-700/15"
                  >
                    <h3 className="text-sm font-bold text-stone-900">{section.title}</h3>
                    <p className="mt-1 text-sm text-stone-600">{section.summary}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] text-stone-700">
                      {section.tips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="help-faq-heading">
            <h2 id="help-faq-heading" className="text-sm font-bold uppercase tracking-[0.14em] text-stone-800">
              Frequently asked questions
            </h2>
            {faqItems.length === 0 ? (
              <p className="border border-stone-400 bg-white px-3 py-4 text-sm text-stone-600">
                No FAQ items match your search.
              </p>
            ) : (
              <div className="overflow-hidden border-2 border-stone-500 bg-white shadow-sm">
                {faqItems.map((item) => {
                  const open = openFaqId === item.id
                  return (
                    <div key={item.id} className="border-b border-stone-300 last:border-b-0">
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 px-3 py-3 text-left hover:bg-amber-50/70"
                        aria-expanded={open}
                        onClick={() => setOpenFaqId(open ? null : item.id)}
                      >
                        <ChevronDown
                          size={16}
                          className={cn(
                            'mt-0.5 shrink-0 text-amber-800 transition-transform',
                            open && 'rotate-180',
                          )}
                          aria-hidden
                        />
                        <span className="text-sm font-semibold text-stone-900">{item.question}</span>
                      </button>
                      {open ? (
                        <p className="border-t border-stone-200 bg-stone-50 px-3 py-3 pl-9 text-sm text-stone-700">
                          {item.answer}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
