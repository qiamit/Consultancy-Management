import { useEffect, useRef, useState } from 'react'
import { AudioLines, BookOpen, ChevronDown, ChevronUp, FileText, Loader2, Mic, MicOff, Paperclip, Send, Square, Volume2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AssistantMessage } from '@/components/qi-assistant/AssistantMessage'
import { toAttachments, type ChatAttachment } from '@/components/qi-assistant/chatAttachments'
import { splitQuote, withQuote } from '@/components/qi-assistant/chatQuote'
import { MessageActions, ReplyQuoteBar, SelectionPopup, type ChatActionHandlers } from '@/components/qi-assistant/QiChatActions'
import { AUTO_VOICE_LANG, useVoiceInput } from '@/features/bis/shared/useVoiceInput'
import { cn } from '@/lib/utils'
import { readAskAttachments } from './askAttachments'
import type { AskAnswer, AskSource, AskTurn } from './isLibraryAsk'
import { openLibraryFile } from './isLibraryFiles'
import { useSpeech } from './useSpeech'

type ChatItem = AskTurn & { id: number; sources?: AskSource[]; model?: string | null; files?: string[] }

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

const smallBtn =
  'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap border border-transparent px-1.5 text-[11px] font-semibold text-stone-600 hover:border-stone-300 hover:bg-white hover:text-amber-800 disabled:opacity-40'
const toolBtn =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center border border-stone-300 bg-white text-stone-700 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-40'

/** The answer's pages, folded into a "Sources" button (owner, 21 Nov 2026); each opens the PDF at that page. */
function SourcesButton({ answer, sources }: { answer: string; sources: AskSource[] }) {
  const [open, setOpen] = useState(false)
  const list = citedSources(answer, sources)
  if (!list.length) return null
  return (
    <>
      <button type="button" className={smallBtn} title="Pages This Answer Comes From" onClick={() => setOpen((v) => !v)}>
        <BookOpen size={12} aria-hidden />
        <span>Sources ({list.length})</span>
        {open ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
      </button>
      {open ? (
        <div className="basis-full">
          <div className="mt-1 flex flex-wrap gap-1 border-t border-stone-200 pt-1.5">
            {list.map((s) => (
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
        </div>
      ) : null}
    </>
  )
}

/** One question or answer, formatted, with its options under it. */
function ChatRow({
  item,
  handlers,
  speaking,
  canSpeak,
  onSpeak,
}: {
  item: ChatItem
  handlers: ChatActionHandlers
  speaking: boolean
  canSpeak: boolean
  onSpeak: () => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const own = item.role === 'user'
  const { quote, text } = own ? splitQuote(item.content) : { quote: null, text: item.content }
  return (
    <div className={cn('flex flex-col', own ? 'ml-10 items-end' : 'mr-4 items-start')}>
      <div className={cn('max-w-full border px-3 py-2 text-sm leading-relaxed', own ? 'border-amber-300 bg-amber-50' : 'w-full border-stone-300 bg-white')}>
        <div ref={bodyRef} data-chat-body className="break-words text-stone-900">
          {own ? (
            <>
              {quote ? <blockquote className="mb-1 line-clamp-3 whitespace-pre-wrap border-l-2 border-amber-500 pl-2 text-xs text-stone-600">{quote}</blockquote> : null}
              <p className="whitespace-pre-wrap">{text}</p>
            </>
          ) : (
            <AssistantMessage content={item.content} clampQuotes={false} />
          )}
        </div>
        {item.files?.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.files.map((f) => (
              <span key={f} className="inline-flex items-center gap-1 border border-amber-300 bg-white px-1.5 py-0.5 text-[11px] text-stone-700">
                <FileText size={11} aria-hidden /> {f}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className={cn('flex w-full flex-wrap items-center gap-0.5', own && 'justify-end')}>
        <MessageActions role={item.role} handlers={handlers} bodyRef={bodyRef} />
        {!own && canSpeak ? (
          <button type="button" className={smallBtn} title={speaking ? 'Stop Reading' : 'Read Aloud'} onClick={onSpeak}>
            {speaking ? <Square size={11} aria-hidden /> : <Volume2 size={12} aria-hidden />}
            <span className="hidden sm:inline">{speaking ? 'Stop' : 'Listen'}</span>
          </button>
        ) : null}
        {!own && item.sources?.length ? <SourcesButton answer={item.content} sources={item.sources} /> : null}
      </div>
    </div>
  )
}

/**
 * Chat over Standards Library text (IS Files → Ask AI, Ask the Library). Owner, 21 Nov 2026: formatted answers, the
 * QE Assistant's options under each message (Reply, Copy, Ask Again, Edit, Explain), the pages in a Sources button,
 * files of one's own to check against the standard, voice typing and a voice conversation (Voice Talk).
 */
export function StandardsAskPanel({
  intro,
  placeholder,
  flagLabel,
  flagDefault = false,
  note,
  ask: askFn,
}: {
  intro: string
  placeholder: string
  /** A tick box under the chat (e.g. "Also Read the Reference Standards"); its value goes to ask(). */
  flagLabel?: string
  /** The tick box starts ticked. */
  flagDefault?: boolean
  note?: string
  /** `attached`: the text of the files attached to this question (read in the browser), or ''. */
  ask: (question: string, history: AskTurn[], flag: boolean, attached: string) => Promise<AskAnswer>
}) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [flag, setFlag] = useState(flagDefault)
  const [replyQuote, setReplyQuote] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [talk, setTalk] = useState(false)
  const talkRef = useRef(false)
  const nextId = useRef(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const speech = useSpeech()
  const typing = useVoiceInput(setQuestion)
  // Voice Talk asks from an earlier render (after the answer is read aloud): it reads the chat as it is now from here.
  const live = useRef({ items, flag })
  useEffect(() => {
    live.current = { items, flag }
  }, [items, flag])

  useEffect(() => {
    // Braces: newer browsers return a Promise from scrollIntoView, which React would take as a clean-up.
    end.current?.scrollIntoView({ block: 'end' })
  }, [items, busy])

  useEffect(() => {
    const message = speech.error ?? typing.error
    if (message) toast.error(message)
  }, [speech.error, typing.error])

  const focusBox = () => requestAnimationFrame(() => textRef.current?.focus())

  const ask = async (textOverride?: string, quoteOverride?: string | null): Promise<void> => {
    const q = (textOverride ?? question).trim()
    if (!q || busy) return
    if (typing.listening) typing.stop()
    const quote = quoteOverride !== undefined ? quoteOverride : replyQuote
    const asked = withQuote(quote, q)
    const files = textOverride === undefined ? attachments : []
    const history = live.current.items.map(({ role, content }) => ({ role, content }))
    setItems((list) => [...list, { id: nextId.current++, role: 'user', content: asked, files: files.map((f) => f.path) }])
    if (textOverride === undefined) {
      setQuestion('')
      setAttachments([])
    }
    setReplyQuote(null)
    let answer = ''
    try {
      let attached = ''
      if (files.length) {
        setBusy('Reading the Attached Files…')
        attached = await readAskAttachments(files, (step) => setBusy(step))
      }
      setBusy('Reading the Standards…')
      const a = await askFn(asked, history, live.current.flag, attached)
      answer = a.answer
      setItems((list) => [...list, { id: nextId.current++, role: 'assistant', content: a.answer, sources: a.sources, model: a.model }])
    } catch (e) {
      answer = e instanceof Error ? e.message : String(e)
      setItems((list) => [...list, { id: nextId.current++, role: 'assistant', content: answer }])
    } finally {
      setBusy(null)
    }
    // Voice Talk: the answer is read aloud, then the next question is heard.
    if (talkRef.current && answer) {
      await speech.speak(answer, -1, AUTO_VOICE_LANG)
      if (talkRef.current) void listenForTalk()
    }
  }

  /** Voice Talk: hears one question, asks it; stops after two silent tries. */
  const listenForTalk = async (silent = 0): Promise<void> => {
    if (!talkRef.current) return
    const said = await speech.listenOnce(AUTO_VOICE_LANG, setQuestion)
    if (!talkRef.current) return
    if (said) {
      setQuestion('')
      await ask(said, null)
    } else if (silent < 1) {
      void listenForTalk(silent + 1)
    } else {
      stopTalk()
      toast.message('Voice Talk Stopped — Nothing Was Heard.')
    }
  }

  const stopTalk = () => {
    talkRef.current = false
    setTalk(false)
    speech.stopListening()
    speech.stopSpeaking()
  }

  const toggleTalk = () => {
    if (talk) return stopTalk()
    if (typing.listening) typing.stop()
    talkRef.current = true
    setTalk(true)
    void listenForTalk()
  }

  const toggleTyping = () => {
    if (typing.listening) return typing.stop()
    if (talk) stopTalk()
    typing.start(question)
  }

  const shared: ChatActionHandlers = {
    busy: busy !== null,
    onReply: (quote) => {
      setReplyQuote(quote)
      focusBox()
    },
    onExplain: (quote) => void ask('Explain this in simple words, in the language of this chat.', quote),
  }
  const actionsFor = (item: ChatItem, index: number): ChatActionHandlers => {
    if (item.role === 'user') {
      const { quote, text } = splitQuote(item.content)
      return {
        ...shared,
        onEdit: () => {
          setReplyQuote(quote)
          setQuestion(text)
          focusBox()
        },
        onSendAgain: () => void ask(text, quote),
      }
    }
    const before = items.slice(0, index).reverse().find((x) => x.role === 'user')
    if (!before) return shared
    const { quote, text } = splitQuote(before.content)
    return { ...shared, onAskAgain: () => void ask(text, quote) }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div ref={scrollRef} className="relative min-h-[16rem] flex-1 space-y-3 overflow-y-auto">
        {!items.length ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
        {items.map((m, i) => (
          <ChatRow
            key={m.id}
            item={m}
            handlers={actionsFor(m, i)}
            canSpeak={speech.synthOk}
            speaking={speech.speakingId === m.id}
            onSpeak={() => (speech.speakingId === m.id ? speech.stopSpeaking() : void speech.speak(m.content, m.id, AUTO_VOICE_LANG))}
          />
        ))}
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {busy}
          </p>
        ) : null}
        <div ref={end} />
        <SelectionPopup containerRef={scrollRef} handlers={shared} />
      </div>
      <div className="space-y-1.5 border-t border-stone-200 pt-2">
        {note ? <p className="text-xs text-stone-700">{note}</p> : null}
        {flagLabel ? (
          <label className="flex items-center gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} />
            {flagLabel}
          </label>
        ) : null}
        <div className="border border-stone-300 bg-white focus-within:border-amber-600">
          {replyQuote ? <ReplyQuoteBar quote={replyQuote} onClear={() => setReplyQuote(null)} /> : null}
          {attachments.length ? (
            <div className="flex flex-wrap gap-1 border-b border-stone-200 px-2 py-1.5">
              {attachments.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 border border-stone-300 bg-stone-50 px-1.5 py-0.5 text-[11px] text-stone-700">
                  <FileText size={11} aria-hidden /> {a.path}
                  <button
                    type="button"
                    className="ml-0.5 text-stone-500 hover:text-red-700"
                    aria-label={`Remove ${a.path}`}
                    onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {talk ? (
            <p className="flex items-center gap-2 border-b border-stone-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
              <AudioLines size={13} className="animate-pulse" aria-hidden />
              {speech.listening ? 'Voice Talk — Listening… Speak Your Question.' : speech.speakingId === -1 ? 'Voice Talk — Reading the Answer…' : 'Voice Talk Is On.'}
            </p>
          ) : null}
          <textarea
            ref={textRef}
            className="block min-h-[2.75rem] w-full resize-y bg-transparent px-2 py-1.5 text-sm outline-none"
            rows={2}
            placeholder={typing.listening ? 'Listening… Speak Now.' : placeholder}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void ask()
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-100 px-1.5 py-1.5">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,image/*,.txt,.csv,.xlsx,.xls"
              onChange={(e) => {
                if (e.target.files?.length) setAttachments((list) => [...list, ...toAttachments(e.target.files!, list)].slice(0, 5))
                e.target.value = ''
              }}
            />
            <button type="button" className={toolBtn} title="Attach a File (PDF, Photo, Excel) to Check Against the Standard" aria-label="Attach a File" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              <Paperclip size={16} aria-hidden />
            </button>
            {typing.supported ? (
              <button
                type="button"
                className={cn(toolBtn, typing.listening && 'border-red-400 bg-red-50 text-red-700')}
                title={typing.listening ? 'Stop Voice Typing' : 'Voice Typing'}
                aria-label={typing.listening ? 'Stop Voice Typing' : 'Voice Typing'}
                disabled={busy !== null}
                onClick={toggleTyping}
              >
                {typing.listening ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
              </button>
            ) : null}
            {speech.recognitionOk && speech.synthOk ? (
              // An icon like the mic (owner, 26 Nov 2026: no "Voice Talk" label, no language button).
              <button
                type="button"
                className={cn(toolBtn, talk && 'border-red-400 bg-red-50 text-red-700')}
                title={talk ? 'Stop Voice Talk' : 'Voice Talk: Speak a Question, Hear the Answer, Then Speak the Next One'}
                aria-label={talk ? 'Stop Voice Talk' : 'Voice Talk'}
                aria-pressed={talk}
                onClick={toggleTalk}
              >
                <AudioLines size={16} aria-hidden className={talk ? 'animate-pulse' : undefined} />
              </button>
            ) : null}
            <Button
              type="button"
              className="ml-auto h-9 rounded-none bg-amber-700 px-3 text-white hover:bg-amber-800"
              title="Send"
              aria-label="Send"
              onClick={() => void ask()}
              disabled={busy !== null || !question.trim()}
            >
              <Send className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
