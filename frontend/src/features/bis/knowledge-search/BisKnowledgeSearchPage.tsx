import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BookSearch, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  limsDarkBarAccentClass,
  limsDarkBarGlowStyle,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import {
  fetchKnowledgeHealth,
  fetchKnowledgeStandards,
  searchKnowledge,
  type AnswerabilityState,
  type KnowledgeSearchHit,
  type KnowledgeStandardId,
  type KnowledgeStandardOption,
} from './bisKnowledgeSearchApi'
import { normalizeKnowledgeDisplayText } from './normalizeKnowledgeDisplayText'
import {
  KNOWLEDGE_UI_LANGS,
  answerabilityUiCopy,
  getKnowledgeUiStrings,
  loadKnowledgeUiLang,
  saveKnowledgeUiLang,
  type KnowledgeUiLang,
} from './knowledgeSearchUiI18n'

type UiStatus = 'idle' | 'loading' | 'ok' | 'empty' | 'service_down' | 'error'

function stateBannerClass(state: AnswerabilityState | null): string {
  if (state === 'supported') return 'border-emerald-700/40 bg-emerald-50 text-emerald-950'
  if (state === 'uncertain') return 'border-amber-700/50 bg-amber-50 text-amber-950'
  if (state === 'not_found') return 'border-stone-500 bg-stone-100 text-stone-800'
  return 'border-stone-300 bg-stone-50 text-stone-600'
}

export default function BisKnowledgeSearchPage() {
  const [uiLang, setUiLang] = useState<KnowledgeUiLang>('en')
  const [standard, setStandard] = useState<KnowledgeStandardId>('all')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<UiStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [hits, setHits] = useState<KnowledgeSearchHit[]>([])
  const [answerability, setAnswerability] = useState<AnswerabilityState | null>(null)
  const [evidenceReasons, setEvidenceReasons] = useState<string[]>([])
  const [serviceOk, setServiceOk] = useState<boolean | null>(null)
  const [corpusBannerEn, setCorpusBannerEn] = useState<string | null>(null)
  const [corpusBannerHi, setCorpusBannerHi] = useState<string | null>(null)
  const [standardOptions, setStandardOptions] = useState<KnowledgeStandardOption[]>([
    { id: 'all', label: 'All standards (current corpus)' },
  ])

  const t = getKnowledgeUiStrings(uiLang)
  const corpusBanner =
    serviceOk === false
      ? t.serviceUnavailableBanner
      : (uiLang === 'hi' ? corpusBannerHi : corpusBannerEn) || t.disclaimer

  useEffect(() => {
    setUiLang(loadKnowledgeUiLang())
  }, [])

  function onUiLangChange(next: KnowledgeUiLang) {
    setUiLang(next)
    saveKnowledgeUiLang(next)
  }

  const applyCorpusBanners = useCallback(
    (data: {
      collection?: string
      usable_chunk_total?: number
      corpus_mode?: string
      banner_en?: string
      banner_hi?: string
    }) => {
      const collection = data.collection?.trim() || ''
      const chunks = data.usable_chunk_total
      if (data.banner_en) setCorpusBannerEn(data.banner_en)
      else if (collection && typeof chunks === 'number') {
        setCorpusBannerEn(
          `Pilot corpus: ${collection} — ${chunks} usable chunks. Not the full BIS library.`,
        )
      }
      if (data.banner_hi) setCorpusBannerHi(data.banner_hi)
      else if (collection && typeof chunks === 'number') {
        setCorpusBannerHi(
          `पायलट कॉर्पस: ${collection} — ${chunks} usable अंश। पूर्ण BIS library नहीं।`,
        )
      }
    },
    [],
  )

  const checkHealth = useCallback(async () => {
    try {
      const health = await fetchKnowledgeHealth()
      setServiceOk(true)
      applyCorpusBanners(health)
      try {
        const std = await fetchKnowledgeStandards()
        applyCorpusBanners(std)
        const opts = (std.standards || []).filter((s) => s.id && s.label)
        if (opts.length > 0) {
          setStandardOptions(
            opts.map((s) =>
              s.id === 'all' ? { id: 'all', label: t.standardAll } : s,
            ),
          )
        }
      } catch {
        /* health ok but standards failed — keep all-only */
      }
    } catch {
      setServiceOk(false)
      setCorpusBannerEn(null)
      setCorpusBannerHi(null)
    }
  }, [applyCorpusBanners, t.standardAll])

  useEffect(() => {
    void checkHealth()
  }, [checkHealth])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) {
      setStatus('error')
      setMessage(t.emptyQuery)
      setHits([])
      setAnswerability(null)
      setEvidenceReasons([])
      return
    }

    setStatus('loading')
    setMessage(t.loading)
    setHits([])
    setAnswerability(null)
    setEvidenceReasons([])

    try {
      const data = await searchKnowledge({ query: q, standard, limit: 5 })
      setServiceOk(true)
      if (!data.ok) {
        setStatus('error')
        setMessage(data.message_hi && uiLang === 'hi' ? data.message_hi : t.searchFailed)
        setHits([])
        setAnswerability((data.answerability_state as AnswerabilityState) || 'not_found')
        return
      }

      const state = (data.answerability_state || 'not_found') as AnswerabilityState
      setAnswerability(state)
      setEvidenceReasons(data.evidence_reasons || [])
      const copy = answerabilityUiCopy(uiLang, state)
      setMessage(copy.body)

      applyCorpusBanners(data)

      const results = (data.results || []).filter((r) => r.review_status === 'usable')

      if (state === 'not_found') {
        setHits([])
        setStatus('empty')
        return
      }

      if (results.length === 0) {
        setStatus('empty')
        setHits([])
        return
      }

      setHits(results)
      setStatus('ok')
    } catch {
      setServiceOk(false)
      setStatus('service_down')
      setMessage(t.serviceDown)
      setHits([])
      setAnswerability(null)
    }
  }

  const standards: { id: KnowledgeStandardId; label: string }[] = standardOptions.map((s) =>
    s.id === 'all' ? { id: 'all', label: t.standardAll } : s,
  )

  return (
    <div className={cn(limsPageShellClass, 'min-h-0')}>
      <div className={limsPanelClass}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-5 sm:py-4">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className={limsDarkBarAccentClass} />
          <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40">
                  <BookSearch size={18} aria-hidden />
                </span>
                <h1 className="text-lg font-bold tracking-tight sm:text-xl">{t.pageTitle}</h1>
              </div>
              <p className="mt-1 max-w-3xl text-xs text-amber-100/90 sm:text-sm">
                {corpusBanner}
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div
                className="inline-flex rounded-md border border-stone-500/60 bg-stone-900/40 p-0.5"
                role="group"
                aria-label={t.languageLabel}
              >
                {KNOWLEDGE_UI_LANGS.map((opt) => {
                  const selected = uiLang === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onUiLangChange(opt.id)}
                      className={cn(
                        'min-w-[4.5rem] px-2.5 py-1 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-amber-400',
                        selected
                          ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-500/50'
                          : 'text-stone-300 hover:bg-stone-800/80 hover:text-white',
                      )}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <p className="max-w-[16rem] text-[10px] text-stone-400 sm:text-right">{t.languageHint}</p>
              <div className="text-[11px] text-stone-300">
                {serviceOk === true && <span>{t.serviceOn}</span>}
                {serviceOk === false && <span className="text-amber-200">{t.serviceOff}</span>}
                {serviceOk === null && <span>{t.serviceChecking}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 bg-gradient-to-b from-stone-100/90 to-stone-50 p-4 sm:p-5">
          <form className="space-y-3 border-2 border-stone-400 bg-white p-3 sm:p-4" onSubmit={onSubmit}>
            <div className="grid gap-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="knowledge-standard" className="text-xs font-semibold uppercase tracking-wide text-stone-700">
                  {t.standardLabel}
                </Label>
                <Select
                  value={standard}
                  onValueChange={(v) => setStandard(v as KnowledgeStandardId)}
                >
                  <SelectTrigger id="knowledge-standard" className={cn(limsFieldClass, 'w-full')}>
                    <SelectValue placeholder={t.standardLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {standards.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-stone-500">{t.standardHint}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="knowledge-query" className="text-xs font-semibold uppercase tracking-wide text-stone-700">
                  {t.queryLabel}
                </Label>
                <Input
                  id="knowledge-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.queryPlaceholder}
                  className={cn(limsFieldClass, 'h-8')}
                  autoComplete="off"
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" className={limsPrimaryBtnClass} disabled={status === 'loading'}>
                  {status === 'loading' ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                      {t.searchingButton}
                    </>
                  ) : (
                    <>
                      <Search className="mr-1.5 h-4 w-4" aria-hidden />
                      {t.searchButton}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={limsOutlineBtnClass}
                  onClick={() => void checkHealth()}
                >
                  {t.healthButton}
                </Button>
              </div>
            </div>
          </form>

          {status !== 'idle' && message && (
            <div
              className={cn(
                'border px-3 py-2 text-sm',
                status === 'service_down' || status === 'error'
                  ? 'border-amber-700/50 bg-amber-50 text-amber-950'
                  : status === 'loading'
                    ? 'border-stone-400 bg-white text-stone-600'
                    : stateBannerClass(answerability),
              )}
              role="status"
            >
              {answerability && status !== 'loading' && status !== 'service_down' && (
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide">
                  {answerabilityUiCopy(uiLang, answerability).title}
                  {' — '}
                  {answerabilityUiCopy(uiLang, answerability).body}
                </div>
              )}
              {!(answerability && status !== 'loading' && status !== 'service_down') && <p>{message}</p>}
              {evidenceReasons.length > 0 && answerability !== 'not_found' && answerability && (
                <p className="mt-1 text-[11px] text-stone-600">
                  {evidenceReasons.slice(0, 4).join(', ')}
                </p>
              )}
            </div>
          )}

          {status === 'ok' && hits.length > 0 && (
            <section className="space-y-3" aria-label={t.evidenceHeading}>
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-stone-800">
                {t.evidenceHeading} ({hits.length})
              </h2>
              <p className="text-xs text-stone-600">{t.evidenceNote}</p>
              <ul className="space-y-3">
                {hits.map((hit) => {
                  const displayText = normalizeKnowledgeDisplayText(hit.text)
                  return (
                  <li
                    key={hit.chunk_id}
                    className="min-w-0 w-full border-2 border-stone-400 bg-white p-3 text-sm text-stone-900 shadow-sm"
                  >
                    <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600">
                      <span>
                        <strong className="text-stone-800">{t.labelIs}:</strong> {hit.is_number || '—'}
                      </span>
                      <span>
                        <strong className="text-stone-800">{t.labelClause}:</strong>{' '}
                        {hit.clause_number || '—'}
                      </span>
                      <span>
                        <strong className="text-stone-800">{t.labelPdfPages}:</strong>{' '}
                        {(hit.pdf_pages || []).join(', ') || '—'}
                      </span>
                      <span>
                        <strong className="text-stone-800">{t.labelReview}:</strong> {hit.review_status}
                      </span>
                      {hit.rank != null && (
                        <span>
                          <strong className="text-stone-800">{t.labelRank}:</strong> {hit.rank}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 w-full max-w-none break-words leading-relaxed text-stone-900 whitespace-pre-wrap">
                      {displayText}
                    </div>
                    <div className="mt-2 min-w-0 space-y-0.5 break-all border-t border-stone-200 pt-2 font-mono text-[11px] text-stone-500">
                      <div>{t.labelChunk}: {hit.chunk_id}</div>
                      <div>{t.labelSource}: {hit.source_relative_path}</div>
                    </div>
                  </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
