import { useEffect, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AskAnswer, AskSource, AskTurn } from './isLibraryAsk'
import { openLibraryFile } from './isLibraryFiles'

type ChatItem = AskTurn & { sources?: AskSource[]; model?: string | null }

/** The pages the answer names ("p. 5", "page 5"), else the first few it was given. */
function citedSources(answer: string, sources: AskSource[]): AskSource[] {
  const unique = [...new Map(sources.map((s) => [`${s.relpath}#${s.page}`, s])).values()]
  const pages = new Set([...answer.matchAll(/\b(?:p\.?|pages?)\s*(\d{1,3})\b/gi)].map((m) => Number(m[1])))
  const named = unique.filter((s) => {
    if (!pages.has(s.page)) return false
    const stem = s.name.replace(/\.pdf$/i, '')
    // A page number alone may belong to another file: keep it when that file (or its IS number) is named, or when only
    // one file is given.
    const number = stem.match(/^(?:IS|ISO|IEC)\s?\d+/i)?.[0]
    return (
      answer.includes(stem) ||
      (number != null && answer.includes(number)) ||
      (new Set(unique.map((u) => u.relpath)).size === 1)
    )
  })
  return (named.length ? named : unique).slice(0, 8)
}

/** Chat over Standards Library text: the answer, then the pages it names as buttons that open the PDF at that page. */
export function StandardsAskPanel({
  intro,
  placeholder,
  flagLabel,
  note,
  ask: askFn,
}: {
  intro: string
  placeholder: string
  /** A tick box under the chat (e.g. "Also Read the Reference Standards"); its value goes to ask(). */
  flagLabel?: string
  note?: string
  ask: (question: string, history: AskTurn[], flag: boolean) => Promise<AskAnswer>
}) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [flag, setFlag] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Braces: newer browsers return a Promise from scrollIntoView, which React would take as a clean-up.
    end.current?.scrollIntoView({ block: 'end' })
  }, [items, busy])

  const ask = async () => {
    const q = question.trim()
    if (!q || busy) return
    const history = items.map(({ role, content }) => ({ role, content }))
    setItems((list) => [...list, { role: 'user', content: q }])
    setQuestion('')
    setBusy(true)
    try {
      const a = await askFn(q, history, flag)
      setItems((list) => [...list, { role: 'assistant', content: a.answer, sources: a.sources, model: a.model }])
    } catch (e) {
      setItems((list) => [...list, { role: 'assistant', content: e instanceof Error ? e.message : String(e) }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-[16rem] flex-1 space-y-3 overflow-y-auto">
        {!items.length ? (
          <p className="text-sm text-muted-foreground">{intro}</p>
        ) : null}
        {items.map((m, i) => (
          <div key={i} className={cn('border px-3 py-2 text-sm', m.role === 'user' ? 'ml-10 border-amber-300 bg-amber-50' : 'mr-4 border-stone-300 bg-white')}>
            <p className="whitespace-pre-wrap break-words">{m.content}</p>
            {m.sources?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {citedSources(m.content, m.sources).map((s) => (
                  <button
                    key={`${s.relpath}#${s.page}`}
                    type="button"
                    className="border border-stone-300 bg-stone-50 px-1.5 py-0.5 text-[11px] text-stone-700 hover:bg-amber-50"
                    title="Open This Page in a New Tab"
                    onClick={() =>
                      void openLibraryFile(s.relpath, false, s.page).catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
                    }
                  >
                    {s.name.replace(/\.pdf$/i, '')} p{s.page}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading the Standards…
          </p>
        ) : null}
        <div ref={end} />
      </div>
      <div className="space-y-1.5 border-t border-stone-200 pt-2">
        {note ? <p className="text-xs text-stone-700">{note}</p> : null}
        {flagLabel ? (
          <label className="flex items-center gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} />
            {flagLabel}
          </label>
        ) : null}
        <div className="flex gap-2">
          <textarea
            className="min-h-[2.5rem] flex-1 resize-y border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-amber-600"
            rows={2}
            placeholder={placeholder}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void ask()
              }
            }}
          />
          <Button type="button" className="h-auto rounded-none bg-amber-700 px-3 text-white hover:bg-amber-800" onClick={() => void ask()} disabled={busy || !question.trim()}>
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}
