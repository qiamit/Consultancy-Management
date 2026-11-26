import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  AudioLines,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  FileText,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { AssistantMessage } from '@/components/qi-assistant/AssistantMessage'
import { readAttachments, toAttachments, type ChatAttachment } from '@/components/qi-assistant/chatAttachments'
import { useVoiceInput } from '@/features/bis/shared/useVoiceInput'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { RequiredTest } from './requiredTestsApi'
import {
  askRequiredTestsAi,
  loadAiSourceCatalog,
  readAiSources,
  type AiReading,
  type AiSource,
  type AiSourceCatalog,
  type AiStageId,
} from './requiredTestsAi'
import { useSpeech } from './useSpeech'

/*
 * Suggest Tests With AI as a chat, like the QE Assistant (owner, 25 Nov 2026): messages above, a chat box below with
 * file upload, voice typing and Voice Talk; what the AI is doing shows inside the chat; every source (this IS Code's
 * Standard, amendments, Product Manual and the standards they refer to, plus files the user attaches) sits behind one
 * Sources button where each can be ticked or left out. Tests the AI lists are ticked and added to the Required Tests.
 */

type StageKey = AiStageId | 'cache' | 'files'
type Stage = { id: StageKey; status: 'running' | 'done' | 'failed'; detail?: string }
type UserItem = { id: number; role: 'user'; text: string; files?: string[] }
type BotItem = {
  id: number
  role: 'assistant'
  text: string
  stages: Stage[]
  tests?: RequiredTest[]
  picked?: number[]
  model?: string
  pages?: string[]
  failed?: boolean
  added?: boolean
}
type ChatItem = UserItem | BotItem
type UserFile = { att: ChatAttachment; on: boolean; read?: { text: string; images: string[] } }

const STAGE_LABEL: Record<StageKey, string> = {
  cache: 'Using the Documents Already Read',
  read: 'Reading the Product Manual and the Standard',
  methods: 'Finding the Method Standards',
  refs: 'Reading the Reference Standards',
  files: 'Reading Your Files',
  ai: 'AI Is Writing the Answer',
}

const GROUP_LABEL: Record<AiSource['group'], string> = {
  standard: 'Standard',
  amendment: 'Amendment',
  manual: 'Product Manual',
  reference: 'Reference Standards',
}

const GENERATE_MESSAGE = 'Generate the required tests.'
const SUGGESTIONS = [
  { label: 'Generate Tests', message: GENERATE_MESSAGE },
  { label: 'Only Chemical and Mechanical Tests', message: 'Generate only the chemical and mechanical tests.' },
  { label: 'Leave Out Marking and Packing', message: 'Generate the required tests, leaving out marking and packing.' },
  { label: 'Which Tests Can Be Done in a Day?', message: 'Which of the tests can be done in a day?' },
]

/** A spoken command at the end: "Generate" / "जनरेट करो" sends, "Add" / "ऐड करो" adds the ticked tests. */
const GENERATE_WORDS = /(?:^|\s+)(?:generate|जनरेट|start|शुरू|send|भेजो)(?:\s*(?:karo|kar do|करो|कर दो|करें|please))?\s*[.!।]?\s*$/i
const ADD_WORDS = /(?:^|\s+)(?:add|ऐड|जोड़)(?:\s*(?:karo|kar do|करो|कर दो|करें|please))?\s*[.!।]?\s*$/i

const VOICE_LANG_KEY = 'qe-assistant-voice-lang'

function readVoiceLang(): 'hi-IN' | 'en-IN' {
  try {
    return window.localStorage.getItem(VOICE_LANG_KEY) === 'en-IN' ? 'en-IN' : 'hi-IN'
  } catch {
    return 'hi-IN'
  }
}

/** The library sources ticked by default: every readable one. */
const defaultKeys = (catalog: AiSourceCatalog | null) => new Set((catalog?.sources ?? []).filter((s) => s.inLibrary).map((s) => s.key))

export function RequiredTestsAiDialog({
  open,
  onOpenChange,
  isCodeId,
  isLabel,
  existingKey,
  listNames = [],
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId: string | null
  isLabel: string
  /** Is a test (by its key) already in the list? Those rows are shown but not ticked. */
  existingKey: (t: RequiredTest) => boolean
  /** Names already in the Required Tests list: the AI uses the same name for the same test ("Carbon as (C)"). */
  listNames?: string[]
  onAdd: (tests: RequiredTest[], sources: string[], model?: string) => void
}) {
  // Everything below belongs to one IS Code: a new IS Code starts a new chat.
  const id = isCodeId ?? ''
  const [catalogFor, setCatalogFor] = useState<{ id: string; catalog: AiSourceCatalog | null; failed?: boolean } | null>(null)
  const catalogState = catalogFor?.id === id ? catalogFor : null
  const catalog = catalogState?.catalog ?? null
  const [chatFor, setChatFor] = useState<{ id: string; items: ChatItem[] }>({ id: '', items: [] })
  const items = useMemo(() => (chatFor.id === id ? chatFor.items : []), [chatFor, id])
  const [selFor, setSelFor] = useState<{ id: string; keys: Set<string> } | null>(null)
  const selected = useMemo(() => (selFor?.id === id ? selFor.keys : defaultKeys(catalog)), [selFor, id, catalog])
  const [filesFor, setFilesFor] = useState<{ id: string; files: UserFile[] }>({ id: '', files: [] })
  const files = filesFor.id === id ? filesFor.files : []
  const readingRef = useRef<{ id: string; key: string; reading: AiReading } | null>(null)

  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [voiceLang, setVoiceLang] = useState<'hi-IN' | 'en-IN'>(readVoiceLang)
  const [talk, setTalk] = useState(false)
  const talkRef = useRef(false)
  const nextId = useRef(1)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const sourcesRef = useRef<HTMLDivElement | null>(null)
  const speech = useSpeech()

  // Load the sources once per IS Code.
  useEffect(() => {
    if (!open || !id || catalogState) return
    let live = true
    loadAiSourceCatalog(id)
      .then((c) => live && setCatalogFor({ id, catalog: c }))
      .catch(() => live && setCatalogFor({ id, catalog: null, failed: true }))
    return () => {
      live = false
    }
  }, [open, id, catalogState])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [items])

  // The Sources panel closes on a click outside it or Escape (caught first, so the window stays open).
  useEffect(() => {
    if (!sourcesOpen) return
    const onDown = (e: MouseEvent) => {
      if (sourcesRef.current && !sourcesRef.current.contains(e.target as Node)) setSourcesOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setSourcesOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [sourcesOpen])

  const updateItems = useCallback(
    (fn: (prev: ChatItem[]) => ChatItem[]) => setChatFor((c) => ({ id, items: fn(c.id === id ? c.items : []) })),
    [id],
  )
  const updateBot = useCallback(
    (botId: number, fn: (b: BotItem) => BotItem) =>
      updateItems((prev) => prev.map((m) => (m.id === botId && m.role === 'assistant' ? fn(m) : m))),
    [updateItems],
  )
  const setStage = useCallback(
    (botId: number, stage: Stage) =>
      updateBot(botId, (b) => ({
        ...b,
        stages: b.stages.some((s) => s.id === stage.id) ? b.stages.map((s) => (s.id === stage.id ? stage : s)) : [...b.stages, stage],
      })),
    [updateBot],
  )

  const setSelected = (keys: Set<string>) => {
    setSelFor({ id, keys })
    readingRef.current = null // other sources: read again on the next message
  }
  const toggleSource = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }
  const setFiles = (fn: (prev: UserFile[]) => UserFile[]) => setFilesFor((f) => ({ id, files: fn(f.id === id ? f.files : []) }))

  const sources = catalog?.sources ?? []
  const libraryCount = sources.filter((s) => s.inLibrary).length
  const tickedCount = sources.filter((s) => s.inLibrary && selected.has(s.key)).length + files.filter((f) => f.on).length
  const notInLibrary = Boolean(catalog && !catalog.folders.length)
  const latestTests = [...items].reverse().find((m): m is BotItem => m.role === 'assistant' && Boolean(m.tests?.length))

  /** Adds the ticked tests of an answer to the Required Tests list. */
  const addFrom = (bot: BotItem | undefined) => {
    if (!bot?.tests) return
    const tests = bot.tests.filter((_, i) => bot.picked?.includes(i))
    if (!tests.length) return toast.message('Tick the Tests to Add First.')
    onAdd(tests, bot.pages ?? [], bot.model)
    updateBot(bot.id, (b) => ({ ...b, added: true }))
    stopTalk()
    onOpenChange(false)
  }

  const send = async (raw: string) => {
    const text = raw.trim() || (files.some((f) => f.on) ? 'Read the files I attached and update the list if they change it.' : '')
    if (!text || busy || !id || !catalog) return
    setInput('')
    const userId = nextId.current++
    const botId = nextId.current++
    const history = items
      .filter((m) => m.text && !(m.role === 'assistant' && m.failed))
      .map((m) => ({ role: m.role, content: m.role === 'assistant' && m.tests ? `${m.text}\n(List of ${m.tests.length} tests given.)` : m.text }))
    const current = latestTests?.tests ?? null
    updateItems((prev) => [
      ...prev,
      { id: userId, role: 'user', text, files: files.filter((f) => f.on).map((f) => f.att.path) },
      { id: botId, role: 'assistant', text: '', stages: [] },
    ])
    setBusy(true)
    let running: StageKey = 'read'
    try {
      // The ticked library sources are read once and kept for the next messages.
      const key = [...selected].filter((k) => sources.some((s) => s.key === k && s.inLibrary)).sort().join('\n')
      let reading = readingRef.current?.id === id && readingRef.current.key === key ? readingRef.current.reading : null
      if (reading) setStage(botId, { id: 'cache', status: 'done', detail: reading.summary })
      else {
        reading = await readAiSources({
          isCodeId: id,
          catalog,
          selected,
          words: text,
          onStage: (e) => {
            if (e.status === 'running') running = e.id
            setStage(botId, { id: e.id, status: e.status, detail: e.detail })
          },
        })
        readingRef.current = { id, key, reading }
      }

      // The user's own files, read in the browser once.
      let filesText = ''
      const images: string[] = []
      const onFiles = files.filter((f) => f.on)
      if (onFiles.length) {
        running = 'files'
        setStage(botId, { id: 'files', status: 'running' })
        const read = await Promise.all(onFiles.map(async (f) => f.read ?? (await readAttachments([f.att]))))
        setFiles((prev) => prev.map((f) => ({ ...f, read: f.read ?? read[onFiles.findIndex((o) => o.att.id === f.att.id)] })))
        filesText = read.map((r) => r.text).filter(Boolean).join('\n\n')
        images.push(...read.flatMap((r) => r.images).slice(0, 8))
        setStage(botId, { id: 'files', status: 'done', detail: `${onFiles.length} ${onFiles.length === 1 ? 'File' : 'Files'}` })
      }

      running = 'ai'
      setStage(botId, { id: 'ai', status: 'running' })
      const out = await askRequiredTestsAi({ isLabel, reading, message: text, history, currentTests: current, listNames, filesText, images })
      setStage(botId, {
        id: 'ai',
        status: 'done',
        detail: [out.tests ? `${out.tests.length} ${out.tests.length === 1 ? 'Test' : 'Tests'}` : 'Answer', out.model].filter(Boolean).join(' · '),
      })
      updateBot(botId, (b) => ({
        ...b,
        text: out.reply,
        tests: out.tests ?? undefined,
        picked: out.tests ? out.tests.map((t, i) => (existingKey(t) ? -1 : i)).filter((i) => i >= 0) : undefined,
        model: out.model,
        pages: reading!.pages,
      }))
      if (talkRef.current) {
        await speech.speak(out.reply, botId, voiceLang)
        if (talkRef.current) void listenForTalk()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'The AI Could Not Answer.'
      setStage(botId, { id: running, status: 'failed', detail: msg })
      updateBot(botId, (b) => ({ ...b, text: msg, failed: true }))
      stopTalk()
    } finally {
      setBusy(false)
    }
  }

  // Voice typing: the words go into the chat box; "Generate" at the end sends, "Add" adds the ticked tests.
  const firedRef = useRef(false)
  const actionsRef = useRef<{ send: (text: string) => void; add: () => void; stop: () => void }>({ send: () => {}, add: () => {}, stop: () => {} })
  const onVoiceText = useCallback((spoken: string) => {
    const kind = GENERATE_WORDS.test(spoken) ? 'send' : ADD_WORDS.test(spoken) ? 'add' : null
    if (!kind) return setInput(spoken)
    const rest = spoken.replace(kind === 'send' ? GENERATE_WORDS : ADD_WORDS, '').trim()
    setInput(rest)
    if (firedRef.current) return
    firedRef.current = true
    window.setTimeout(() => {
      actionsRef.current.stop()
      if (kind === 'send') actionsRef.current.send(rest || GENERATE_MESSAGE)
      else actionsRef.current.add()
    }, 0)
  }, [])
  const voice = useVoiceInput(onVoiceText, voiceLang)

  // Voice Talk: the AI's answer is read aloud, then the next request is heard; stops after two silent tries.
  const stopTalk = () => {
    talkRef.current = false
    setTalk(false)
    speech.stopListening()
    speech.stopSpeaking()
  }
  const listenForTalk = async (silent = 0): Promise<void> => {
    if (!talkRef.current) return
    const said = await speech.listenOnce(voiceLang, setInput)
    if (!talkRef.current) return
    if (!said) {
      if (silent < 1) return void listenForTalk(silent + 1)
      stopTalk()
      toast.message('Voice Talk Stopped — Nothing Was Heard.')
      return
    }
    // The functions of the latest render: this one may be from before the last answer.
    if (ADD_WORDS.test(said)) return actionsRef.current.add()
    actionsRef.current.send(said.replace(GENERATE_WORDS, '').trim() || GENERATE_MESSAGE)
  }
  const toggleTalk = () => {
    if (talk) return stopTalk()
    voice.stop()
    talkRef.current = true
    setTalk(true)
    void listenForTalk()
  }

  useEffect(() => {
    actionsRef.current = { send: (t) => void send(t), add: () => addFrom(latestTests), stop: voice.stop }
  })

  // Closing the window stops the microphone and the voice.
  const { listening: voiceListening, stop: stopVoice } = voice
  useEffect(() => {
    if (open) return
    if (voiceListening) stopVoice()
    talkRef.current = false
  }, [open, voiceListening, stopVoice])

  const switchLang = () => {
    const next = voiceLang === 'hi-IN' ? 'en-IN' : 'hi-IN'
    setVoiceLang(next)
    try {
      window.localStorage.setItem(VOICE_LANG_KEY, next)
    } catch {
      // The choice is kept for this window only.
    }
  }

  const newChat = () => {
    stopTalk()
    setChatFor({ id, items: [] })
    setInput('')
  }

  const groups = (['standard', 'amendment', 'manual', 'reference'] as const)
    .map((g) => ({ group: g, list: sources.filter((s) => s.group === g) }))
    .filter((g) => g.list.length)
  const refs = sources.filter((s) => s.group === 'reference')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) stopTalk()
        onOpenChange(next)
      }}
    >
      <DialogContent
        showCloseButton={false}
        persistOnFocusLoss
        layer="above"
        aria-describedby={undefined}
        className={cn(limsDialogClass, 'h-[min(92dvh,920px)] w-[min(72rem,calc(100vw-1.5rem))] max-w-none')}
      >
        {/* Header: title, Sources, New Chat */}
        <div className="relative z-20 shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogHeader className="relative flex flex-row items-center gap-2 space-y-0 text-left">
            <DialogTitle className="flex min-w-0 flex-1 items-center gap-2 truncate text-base font-semibold tracking-tight text-white">
              <Sparkles size={16} aria-hidden /> <span className="truncate">Suggest Tests With AI{isLabel ? ` — ${isLabel}` : ''}</span>
            </DialogTitle>
            <div ref={sourcesRef} className="relative">
              <button
                type="button"
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 border px-2.5 text-xs font-semibold transition-colors',
                  sourcesOpen ? 'border-amber-400 bg-amber-500/25 text-white' : 'border-stone-500 bg-stone-800/70 text-stone-100 hover:bg-stone-700',
                )}
                aria-expanded={sourcesOpen}
                aria-label="Sources"
                onClick={() => setSourcesOpen((v) => !v)}
              >
                {!catalogState ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <BookOpen size={13} aria-hidden />}
                Sources
                {catalog ? (
                  <span className="bg-amber-500 px-1.5 text-[10px] font-bold text-stone-950">
                    {tickedCount}/{libraryCount + files.length}
                  </span>
                ) : null}
                <ChevronDown size={13} aria-hidden />
              </button>
              {sourcesOpen ? (
                <div
                  role="dialog"
                  aria-label="Choose the Sources"
                  className="absolute right-0 top-full z-50 mt-1.5 max-h-[min(62vh,34rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto border-2 border-stone-600 bg-white text-stone-900 shadow-2xl"
                >
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-stone-300 bg-stone-100 px-3 py-2">
                    <p className="text-xs font-semibold text-stone-700">Tick the Sources the AI Reads</p>
                    <div className="flex gap-1">
                      <button type="button" className="border border-stone-400 bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-amber-50" onClick={() => setSelected(defaultKeys(catalog))}>
                        Tick All
                      </button>
                      <button
                        type="button"
                        className="border border-stone-400 bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-amber-50"
                        onClick={() => setSelected(new Set([...selected].filter((k) => !k.startsWith('ref:'))))}
                      >
                        No References
                      </button>
                    </div>
                  </div>
                  {catalogState?.failed ? (
                    <p className="px-3 py-3 text-xs text-stone-600">Could Not Look Up the Standards Library Just Now. Close and Open the Window Again.</p>
                  ) : notInLibrary ? (
                    <p className="px-3 py-3 text-xs text-red-700">This IS Code Is Not in the Standards Library Yet. Add Its PDF to the Oracle Database Folder and Run Standards Sync.</p>
                  ) : !catalog ? (
                    <p className="px-3 py-3 text-xs text-stone-600">Looking Up the Standards Library…</p>
                  ) : null}
                  {groups.map(({ group, list }) => (
                    <section key={group} className="border-b border-stone-200 px-3 py-2">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                        {GROUP_LABEL[group]}
                        {group === 'reference' ? ` (${refs.filter((r) => r.inLibrary).length} in the Library, ${refs.filter((r) => !r.inLibrary).length} Not)` : ''}
                      </p>
                      <ul className="space-y-0.5">
                        {list.map((s) => (
                          <li key={s.key}>
                            <label className={cn('flex items-start gap-2 px-1 py-1 text-xs', s.inLibrary ? 'cursor-pointer hover:bg-amber-50' : 'opacity-60')}>
                              <input
                                type="checkbox"
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-700"
                                checked={s.inLibrary && selected.has(s.key)}
                                disabled={!s.inLibrary}
                                onChange={() => toggleSource(s.key)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="font-semibold">{s.label}</span>
                                {s.title ? <span className="block truncate text-[11px] text-stone-500">{s.title}</span> : null}
                              </span>
                              <span className="shrink-0 text-[10px] text-stone-500">
                                {!s.inLibrary ? 'Not in Library' : s.cites ? `Cited ${s.cites}×` : ''}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                  <section className="px-3 py-2">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Your Files ({files.length})</p>
                      <button type="button" className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:underline" onClick={() => fileInputRef.current?.click()}>
                        <Paperclip size={12} aria-hidden /> Attach Files
                      </button>
                    </div>
                    {files.length ? (
                      <ul className="space-y-0.5">
                        {files.map((f) => (
                          <li key={f.att.id} className="flex items-center gap-2 px-1 py-1 text-xs">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 shrink-0 accent-amber-700"
                              checked={f.on}
                              aria-label={`Use ${f.att.path}`}
                              onChange={() => setFiles((prev) => prev.map((x) => (x.att.id === f.att.id ? { ...x, on: !x.on } : x)))}
                            />
                            <span className="min-w-0 flex-1 truncate">{f.att.path}</span>
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center text-stone-500 hover:bg-red-50 hover:text-red-700"
                              aria-label={`Remove ${f.att.path}`}
                              onClick={() => setFiles((prev) => prev.filter((x) => x.att.id !== f.att.id))}
                            >
                              <X size={12} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-stone-500">PDFs, Photos, Excel or Text Files You Attach Are Read With the Sources.</p>
                    )}
                  </section>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center border border-stone-500 bg-stone-800/70 text-stone-100 hover:bg-stone-700 disabled:opacity-40"
              aria-label="New Chat"
              title="New Chat"
              disabled={busy || !items.length}
              onClick={newChat}
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center border border-stone-500 bg-stone-800/70 text-stone-100 hover:!bg-red-500/30 disabled:opacity-40"
              aria-label="Close"
              title={busy ? 'Wait for the AI to Finish' : 'Close'}
              disabled={busy}
              onClick={() => {
                stopTalk()
                onOpenChange(false)
              }}
            >
              <X size={15} />
            </button>
          </DialogHeader>
        </div>

        {/* Chat */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-3">
          <div className="mr-10 border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 shadow-sm">
            <p>
              I read this IS Code&apos;s Standard, Product Manual and the standards they refer to
              {catalog ? ` (${libraryCount} in the library)` : ''}, and list the tests the laboratory must report. Give
              instructions in Hindi or English — a grade, tests to add or leave out — or ask anything about the tests.
              Choose what I read with the <b>Sources</b> button; attach your own files with <b>+</b>.
            </p>
            {notInLibrary ? (
              <p className="mt-1.5 text-xs font-semibold text-red-700">This IS Code Is Not in the Standards Library Yet. Add Its PDF to the Oracle Database Folder and Run Standards Sync.</p>
            ) : null}
            {!items.length && !notInLibrary ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className="border border-amber-600/60 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-40"
                    disabled={busy || !catalog}
                    onClick={() => void send(s.message)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {items.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="ml-10 flex flex-col items-end gap-1">
                <div className="max-w-full whitespace-pre-wrap bg-amber-700 px-3 py-2 text-sm text-white">{m.text}</div>
                {m.files?.length ? <p className="text-[11px] text-stone-500">With {m.files.join(', ')}</p> : null}
              </div>
            ) : (
              <BotMessage
                key={m.id}
                bot={m}
                speaking={speech.speakingId === m.id}
                onSpeak={() => (speech.speakingId === m.id ? speech.stopSpeaking() : void speech.speak(m.text, m.id, voiceLang))}
                existingKey={existingKey}
                onPick={(picked) => updateBot(m.id, (b) => ({ ...b, picked }))}
                onAdd={() => addFrom(m)}
              />
            ),
          )}
        </div>

        {/* Chat box */}
        <div className="shrink-0 border-t border-stone-300 bg-stone-100 px-4 py-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.xlsx,.xls,.xlsm,.md,.json"
            onChange={(e) => {
              // Copied first: clearing the input below empties its live file list.
              const picked = Array.from(e.target.files ?? [])
              if (picked.length) setFiles((prev) => [...prev, ...toAttachments(picked, prev.map((f) => f.att)).map((att) => ({ att, on: true }))])
              e.target.value = ''
            }}
          />
          {voice.listening || talk ? (
            <div className="mb-2 flex items-center gap-2 border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700" role="status">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
              </span>
              {talk
                ? speech.speakingId !== null
                  ? 'Voice Talk — Reading the Answer…'
                  : busy
                    ? 'Voice Talk — AI Is Working…'
                    : `Voice Talk — Speak Now (${voiceLang === 'hi-IN' ? 'Hindi' : 'English'}). Say "Add" to Add the Ticked Tests.`
                : `Listening (${voiceLang === 'hi-IN' ? 'Hindi' : 'English'}) — Say "Generate" at the End to Send, or "Add" to Add the Ticked Tests.`}
            </div>
          ) : null}
          {voice.error || speech.error ? <p className="mb-1.5 text-xs text-red-700">{voice.error || speech.error}</p> : null}
          <div className={cn('border-2 bg-white shadow-sm focus-within:border-amber-600', voice.listening || talk ? 'border-red-400' : 'border-stone-400')}>
            {files.length ? (
              <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto border-b border-stone-200 p-2">
                {files.map((f) => (
                  <span
                    key={f.att.id}
                    className={cn('inline-flex max-w-[14rem] items-center gap-1 border py-0.5 pl-1.5 pr-0.5 text-[11px]', f.on ? 'border-stone-300 bg-stone-50 text-stone-700' : 'border-dashed border-stone-300 text-stone-400 line-through')}
                    title={f.att.path}
                  >
                    {f.att.kind === 'image' ? <ImagePlus size={12} className="shrink-0 text-amber-700" aria-hidden /> : <FileText size={12} className="shrink-0 text-amber-700" aria-hidden />}
                    <span className="truncate">{f.att.path}</span>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-stone-500 hover:bg-red-50 hover:text-red-700"
                      aria-label={`Remove ${f.att.path}`}
                      onClick={() => setFiles((prev) => prev.filter((x) => x.att.id !== f.att.id))}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
              placeholder={busy ? 'AI Is Working…' : 'Give Instructions or Ask About the Tests… (Hindi or English)'}
              className="max-h-36 min-h-[3.25rem] w-full resize-none rounded-none border-0 bg-transparent px-3 py-2.5 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={2}
              disabled={busy || talk}
              aria-label="Message to the AI"
            />
            <div className="flex items-center gap-1.5 border-t border-stone-200 bg-stone-50/70 px-2 py-1.5">
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center border border-stone-400 bg-white text-amber-800 hover:bg-amber-50"
                aria-label="Attach Files"
                title="Attach Files (PDF, Photo, Excel, Text)"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={16} />
              </button>
              {voice.supported ? (
                <>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center border',
                      voice.listening ? 'border-red-600 bg-red-600 text-white hover:bg-red-700' : 'border-stone-400 bg-white text-stone-700 hover:bg-amber-50',
                    )}
                    aria-label={voice.listening ? 'Stop Voice Typing' : 'Voice Typing'}
                    title={voice.listening ? 'Stop Listening' : 'Voice Typing'}
                    disabled={busy || talk}
                    onClick={() => {
                      if (voice.listening) return voice.stop()
                      firedRef.current = false
                      voice.start(input)
                    }}
                  >
                    {voice.listening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center border border-stone-400 bg-white px-2 text-[11px] font-bold text-stone-700 hover:bg-amber-50"
                    title="Voice Language — Click to Switch"
                    aria-label={`Voice Language: ${voiceLang === 'hi-IN' ? 'Hindi' : 'English'}`}
                    disabled={voice.listening || talk}
                    onClick={switchLang}
                  >
                    {voiceLang === 'hi-IN' ? 'हिंदी' : 'EN'}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-8 items-center gap-1 border px-2 text-[11px] font-bold',
                      talk ? 'border-red-600 bg-red-600 text-white hover:bg-red-700' : 'border-stone-400 bg-white text-stone-700 hover:bg-amber-50',
                    )}
                    aria-pressed={talk}
                    title="Voice Talk: Speak, Hear the Answer, Speak Again"
                    disabled={!catalog || notInLibrary || !speech.recognitionOk}
                    onClick={toggleTalk}
                  >
                    <AudioLines size={14} aria-hidden className={talk ? 'animate-pulse' : undefined} /> {talk ? 'Stop Talk' : 'Voice Talk'}
                  </button>
                </>
              ) : null}
              <span className="ml-auto truncate text-[10px] text-stone-400">{files.length ? `${files.filter((f) => f.on).length} of ${files.length} Files in Use` : ''}</span>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-40"
                aria-label="Send Message"
                disabled={busy || talk || !catalog || notInLibrary || (!input.trim() && !files.some((f) => f.on))}
                onClick={() => void send(input)}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** One AI message: what it is doing (live), its answer, and the tests it found with ticks and Add. */
function BotMessage({
  bot,
  speaking,
  onSpeak,
  existingKey,
  onPick,
  onAdd,
}: {
  bot: BotItem
  speaking: boolean
  onSpeak: () => void
  existingKey: (t: RequiredTest) => boolean
  onPick: (picked: number[]) => void
  onAdd: () => void
}) {
  const picked = new Set(bot.picked ?? [])
  const fresh = (bot.tests ?? []).map((t, i) => (existingKey(t) ? -1 : i)).filter((i) => i >= 0)
  return (
    <div className="mr-10 space-y-2 border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 shadow-sm">
      {bot.stages.length ? (
        <ol className={cn('space-y-1', bot.text && 'border-b border-stone-200 pb-2')} aria-label="What the AI Is Doing">
          {bot.stages.map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">
                {s.status === 'running' ? (
                  <Loader2 size={13} className="animate-spin text-amber-700" aria-label="Working" />
                ) : s.status === 'done' ? (
                  <CheckCircle2 size={13} className="text-emerald-700" aria-label="Done" />
                ) : (
                  <AlertTriangle size={13} className="text-red-700" aria-label="Failed" />
                )}
              </span>
              <span className="min-w-0">
                <span className="font-medium text-stone-800">{STAGE_LABEL[s.id]}</span>
                {s.detail ? <span className={cn('ml-1.5 text-[11px]', s.status === 'failed' ? 'text-red-700' : 'text-stone-500')}>{s.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : bot.text ? null : (
        <p className="flex items-center gap-2 text-xs text-stone-500">
          <Loader2 size={13} className="animate-spin" /> Starting…
        </p>
      )}

      {bot.text ? (
        <div className="flex items-start gap-2">
          <div className={cn('min-w-0 flex-1', bot.failed && 'text-red-800')}>
            <AssistantMessage content={bot.text} />
          </div>
          {!bot.failed ? (
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-stone-500 hover:bg-amber-50 hover:text-amber-800"
              aria-label={speaking ? 'Stop Reading' : 'Read Aloud'}
              title={speaking ? 'Stop Reading' : 'Read Aloud'}
              onClick={onSpeak}
            >
              {speaking ? <Square size={12} /> : <Volume2 size={13} />}
            </button>
          ) : null}
        </div>
      ) : null}

      {bot.tests?.length ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
              Tests Found ({bot.tests.length}){bot.model ? ` · ${bot.model}` : ''}
            </p>
            <label className="inline-flex items-center gap-1.5 text-xs text-stone-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-amber-700"
                checked={fresh.length > 0 && fresh.every((i) => picked.has(i))}
                disabled={!fresh.length || bot.added}
                onChange={(e) => onPick(e.target.checked ? fresh : [])}
              />
              Tick All New
            </label>
          </div>
          <div className="max-h-[22rem] overflow-auto border border-stone-400">
            <table className="w-full min-w-[48rem] border-collapse text-xs">
              <thead className="sticky top-0 bg-stone-800 text-[11px] uppercase tracking-wide text-stone-100">
                <tr>
                  <th className="w-8 px-2 py-1.5" />
                  <th className="px-2 py-1.5 text-left">Test Name</th>
                  <th className="w-24 px-2 py-1.5 text-center">Clause</th>
                  <th className="w-36 px-2 py-1.5 text-center">Test Method</th>
                  <th className="w-16 px-2 py-1.5 text-center">Unit</th>
                  <th className="px-2 py-1.5 text-center">Requirement</th>
                  <th className="w-16 px-2 py-1.5 text-center">In a Day</th>
                </tr>
              </thead>
              <tbody>
                {bot.tests.map((t, i) => {
                  const inList = existingKey(t)
                  return (
                    <tr key={`${t.testName}-${i}`} className={cn('border-t border-stone-200', inList && 'text-stone-500')}>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-amber-700"
                          aria-label={`Add ${t.testName}`}
                          disabled={inList || bot.added}
                          checked={picked.has(i)}
                          onChange={(e) => onPick(e.target.checked ? [...picked, i] : [...picked].filter((x) => x !== i))}
                        />
                      </td>
                      <td className="px-2 py-1 text-left">
                        {t.testName}
                        {inList ? <span className="ml-1.5 text-[10px] font-semibold uppercase text-stone-500">Already in List</span> : null}
                      </td>
                      <td className="px-2 py-1 text-center">{t.clause}</td>
                      <td className="px-2 py-1 text-center">{t.testMethod}</td>
                      <td className="px-2 py-1 text-center">{t.unit}</td>
                      <td className="px-2 py-1 text-center">{t.requirement}</td>
                      <td className="px-2 py-1 text-center">{t.possibleInADay ? 'Yes' : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {bot.pages?.length ? (
              <details className="min-w-0 flex-1 text-[11px] text-stone-600">
                <summary className="cursor-pointer font-semibold">Pages the AI Read ({bot.pages.length})</summary>
                <p className="mt-1 leading-relaxed">{bot.pages.join('; ')}</p>
              </details>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-40"
              disabled={!picked.size || bot.added}
              onClick={onAdd}
            >
              <Plus size={14} aria-hidden />
              {bot.added ? 'Added' : picked.size ? `Add ${picked.size} ${picked.size === 1 ? 'Test' : 'Tests'} to the List` : 'Add Tests to the List'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
