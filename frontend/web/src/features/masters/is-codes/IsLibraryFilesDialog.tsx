import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Download, ExternalLink, FolderOpen, Loader2, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { askStandards, type AskSource, type AskTurn } from './isLibraryAsk'
import { EMPTY_LIBRARY_FILES, loadIsLibraryFiles, openLibraryFile, type IsLibraryFiles, type LibraryFile } from './isLibraryFiles'

function FileRow({ file, label }: { file: LibraryFile; label?: string }) {
  const run = (download: boolean) =>
    openLibraryFile(file.relpath, download).catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
  return (
    <div className="flex items-center gap-2 border-b border-stone-200 px-3 py-2 last:border-b-0">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-stone-900 hover:text-amber-800 hover:underline"
        onClick={() => void run(false)}
        title="Open in a New Tab"
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden />
        <span className="break-all">{label ? `${label} — ` : ''}{file.name}</span>
      </button>
      {file.pages ? <span className="shrink-0 text-xs text-muted-foreground">{file.pages} Pages</span> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 shrink-0 gap-1 rounded-none px-2 text-[11px]"
        onClick={() => void run(true)}
        aria-label={`Download ${file.name}`}
        title="Download"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Download
      </Button>
    </div>
  )
}

function Group({
  title,
  count,
  collapsible = false,
  children,
}: {
  title: string
  count: number
  collapsible?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(!collapsible)
  const head = 'px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-stone-700'
  return (
    <section className="border border-stone-300 bg-white">
      {collapsible ? (
        <button
          type="button"
          className={cn('flex w-full items-center gap-1.5 bg-stone-100 text-left hover:bg-stone-200', head, open && 'border-b border-stone-300')}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          {title} <span className="font-normal text-stone-500">({count})</span>
        </button>
      ) : (
        <h3 className={cn('border-b border-stone-300 bg-stone-100', head)}>
          {title} <span className="font-normal text-stone-500">({count})</span>
        </h3>
      )}
      {open ? children : null}
    </section>
  )
}

const Empty = ({ text }: { text: string }) => <p className="px-3 py-2 text-xs text-muted-foreground">{text}</p>

type ChatItem = AskTurn & { sources?: AskSource[]; model?: string | null }

/** The pages the answer names ("p. 5", "page 5"), else the first few it was given. */
function citedSources(answer: string, sources: AskSource[]): AskSource[] {
  const unique = [...new Map(sources.map((s) => [`${s.relpath}#${s.page}`, s])).values()]
  const pages = new Set([...answer.matchAll(/\b(?:p\.?|pages?)\s*(\d{1,3})\b/gi)].map((m) => Number(m[1])))
  const named = unique.filter((s) => {
    if (!pages.has(s.page)) return false
    const stem = s.name.replace(/\.pdf$/i, '')
    // A page number alone may belong to another file: keep it when that file is named, or when only one file is given.
    return answer.includes(stem) || new Set(unique.map((u) => u.relpath)).size === 1 || !/Product Manual/i.test(stem)
  })
  return (named.length ? named : unique).slice(0, 8)
}

function AskPanel({ isLabel, files }: { isLabel: string; files: IsLibraryFiles }) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [useReferences, setUseReferences] = useState(false)
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
      const a = await askStandards({ isLabel, files, question: q, history, useReferences })
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
          <p className="text-sm text-muted-foreground">
            Ask Anything About {isLabel || 'This Standard'}: Requirements, Tests, Tables, Marking, Sampling … The Answer Comes Only From
            Its Files in the Standards Library, With Clause and Page.
          </p>
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
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading the Standard…
          </p>
        ) : null}
        <div ref={end} />
      </div>
      <div className="space-y-1.5 border-t border-stone-200 pt-2">
        <label className="flex items-center gap-2 text-xs text-stone-700">
          <input type="checkbox" checked={useReferences} onChange={(e) => setUseReferences(e.target.checked)} />
          Also Read the Reference Standards
        </label>
        <div className="flex gap-2">
          <textarea
            className="min-h-[2.5rem] flex-1 resize-y border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-amber-600"
            rows={2}
            placeholder="Ask About This Standard…"
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

/** IS Files: the Standards Library files of one IS Code — open in a tab or download. */
export function IsLibraryFilesDialog({
  open,
  onOpenChange,
  isCodeId,
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId: string | null
  title: string
}) {
  const [files, setFiles] = useState<{ id: string; data: IsLibraryFiles } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'files' | 'ask'>('files')

  useEffect(() => {
    if (!open) setMode('files')
  }, [open])

  useEffect(() => {
    if (!open || !isCodeId) return
    let cancelled = false
    setError(null)
    loadIsLibraryFiles(isCodeId)
      .then((data) => {
        if (!cancelled) setFiles({ id: isCodeId, data })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [open, isCodeId])

  const loading = open && !!isCodeId && files?.id !== isCodeId && !error
  const f = files?.id === isCodeId ? files.data : EMPTY_LIBRARY_FILES
  const nothing = !loading && !error && !f.standards.length && !f.manuals.length && !f.amendments.length && !f.older.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        className={cn(
          limsDialogClass,
          'flex !flex-col gap-0 overflow-hidden p-0',
          'max-h-[min(92dvh,860px)] w-[min(52rem,calc(100vw-1.5rem))] max-w-4xl bg-white',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative flex !flex-row items-center gap-3 space-y-0 pr-10 text-left">
            <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-white">
              IS Files{title ? <span className="font-normal text-stone-300"> · {title}</span> : null}
            </DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 rounded-none border-amber-500/50 bg-stone-800/80 px-3 text-xs text-amber-100 hover:bg-amber-500/20 hover:text-amber-50"
              onClick={() => setMode((m) => (m === 'ask' ? 'files' : 'ask'))}
              disabled={loading || !!error || nothing}
            >
              {mode === 'ask' ? <FolderOpen className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {mode === 'ask' ? 'Files' : 'Ask AI'}
            </Button>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {nothing ? (
            <p className="text-sm text-muted-foreground">
              No File of This IS Code in the Standards Library. Add It to the Oracle Database Folder and Sync.
            </p>
          ) : null}
          {mode === 'ask' && !loading && !error && !nothing ? <AskPanel key={isCodeId ?? ''} isLabel={title} files={f} /> : null}
          {mode === 'files' && !loading && !error && !nothing ? (
            <>
              <Group title="Main Standard" count={f.standards.length}>
                {f.standards.length ? f.standards.map((s) => <FileRow key={s.relpath} file={s} />) : <Empty text="Not in the Library." />}
              </Group>
              <Group title="Amendments" count={f.amendments.length}>
                {f.amendments.length ? f.amendments.map((s) => <FileRow key={s.relpath} file={s} />) : <Empty text="No Separate Amendment File." />}
              </Group>
              <Group title="Product Manual" count={f.manuals.length}>
                {f.manuals.length ? f.manuals.map((s) => <FileRow key={s.relpath} file={s} />) : <Empty text="Not in the Library." />}
              </Group>
              <Group title="Reference Standards" count={f.references.length} collapsible>
                {f.references.length ? (
                  f.references.map((r) =>
                    r.file ? (
                      <FileRow key={r.key} file={r.file} label={r.key} />
                    ) : (
                      <p key={r.key} className="border-b border-stone-200 px-3 py-2 text-sm text-stone-400 last:border-b-0">
                        {r.key} — Not in the Library
                      </p>
                    ),
                  )
                ) : (
                  <Empty text="None Found in the Standard's Text." />
                )}
              </Group>
              {f.older.length ? (
                <Group title="Older Editions (Superseded)" count={f.older.length}>
                  {f.older.map((s) => (
                    <FileRow key={s.relpath} file={s} />
                  ))}
                </Group>
              ) : null}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
