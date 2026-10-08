import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, MicOff, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  sendQiAssistantMessage,
  type QiChatMessage,
} from '@/components/qi-assistant/qiAssistantApi'
import {
  limsDialogSidebarOverlayClass,
  limsDialogSidebarPortalClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  DEFAULT_PROCESS_DESCRIPTION_OPTIONS,
  generateProcessDescription,
  type ProcessDescriptionLength,
  type ProcessDescriptionTone,
} from './generateProcessDescription'
import {
  processFlowNodeHasContent,
  processFlowOutlineText,
  type ProcessFlowNode,
} from './processFlowModel'

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const SUGGESTED = [
  'Summarise this process flow in plain English for BIS.',
  'Suggest missing steps for a complete Process Description.',
  'Rewrite the description points in a more inspection-ready tone.',
]

export function ProcessDescriptionAiDialog({
  open,
  onOpenChange,
  disabled = false,
  applicantName,
  isNumber,
  isTitle,
  productName,
  licenseScope,
  isCodeId,
  nodes,
  existingPoints,
  onApplyPoints,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
  applicantName: string
  isNumber: string
  isTitle: string
  productName: string
  licenseScope: string
  isCodeId?: string | null
  nodes: ProcessFlowNode[]
  existingPoints: string[]
  onApplyPoints: (points: string[], mode: 'replace' | 'append') => void
}) {
  const [pointCount, setPointCount] = useState(
    DEFAULT_PROCESS_DESCRIPTION_OPTIONS.pointCount,
  )
  const [length, setLength] = useState<ProcessDescriptionLength>(
    DEFAULT_PROCESS_DESCRIPTION_OPTIONS.length,
  )
  const [tone, setTone] = useState<ProcessDescriptionTone>(
    DEFAULT_PROCESS_DESCRIPTION_OPTIONS.tone,
  )
  const [append, setAppend] = useState(false)
  const [genBusy, setGenBusy] = useState(false)

  const [messages, setMessages] = useState<QiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceBaseRef = useRef('')
  const sessionRef = useRef(0)

  const chatContext = [
    'Process Description assistant context:',
    `Applicant: ${applicantName || '—'}`,
    `IS: ${isNumber || '—'} — ${isTitle || productName || '—'}`,
    `Licence / manufacturing scope:\n${licenseScope.trim() || '(not provided)'}`,
    '',
    'Process flow hierarchy:',
    processFlowOutlineText(nodes) || '(empty)',
    '',
    existingPoints.length > 0
      ? `Current description points (${existingPoints.length}):\n${existingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
      : 'No description points yet.',
    '',
    'Help draft or refine BIS Process Description annex points. When asked to generate points, prefer clear numbered paragraphs suitable for the form.',
  ].join('\n')

  useEffect(() => {
    setVoiceSupported(Boolean(getSpeechRecognitionCtor()))
  }, [])

  useEffect(() => {
    if (!open) {
      recognitionRef.current?.abort()
      recognitionRef.current = null
      setListening(false)
      return
    }
    sessionRef.current += 1
    setMessages([
      {
        id: newId(),
        role: 'assistant',
        content:
          'Hello! I can generate Process Description points with the options above, or chat about your flow chart. Use the mic to speak.',
      },
    ])
    setInput('')
    setChatError(null)
    setGenBusy(false)
    setChatBusy(false)
  }, [open])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, chatBusy, genBusy])

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  const stopListening = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  const toggleListening = () => {
    if (listening) {
      stopListening()
      return
    }
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setChatError('Voice typing is not supported in this browser. Try Chrome or Edge.')
      return
    }
    try {
      const rec = new Ctor()
      recognitionRef.current = rec
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-IN'
      voiceBaseRef.current = input.trim() ? `${input.trim()} ` : ''
      rec.onresult = (event) => {
        let interim = ''
        let finalChunk = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const row = event.results[i]
          if (!row) continue
          if (row.isFinal) finalChunk += row[0].transcript
          else interim += row[0].transcript
        }
        if (finalChunk) {
          voiceBaseRef.current = `${voiceBaseRef.current}${finalChunk}`.replace(/\s+/g, ' ')
        }
        setInput(`${voiceBaseRef.current}${interim}`.trimStart())
      }
      rec.onerror = (event) => {
        setChatError(
          event.error === 'not-allowed'
            ? 'Microphone permission denied.'
            : `Voice error: ${event.error ?? 'unknown'}`,
        )
        stopListening()
      }
      rec.onend = () => {
        setListening(false)
        recognitionRef.current = null
      }
      rec.start()
      setListening(true)
      setChatError(null)
    } catch {
      setChatError('Could not start voice typing.')
    }
  }

  const runGenerate = async () => {
    if (disabled || genBusy) return
    const labeled = nodes.filter(processFlowNodeHasContent)
    if (labeled.length === 0) {
      toast.error('Add process flow steps first, then generate description.')
      return
    }
    setGenBusy(true)
    setChatError(null)
    try {
      const baseInput = {
        applicantName,
        isNumber,
        isTitle,
        productName,
        licenseScope,
        nodes,
        options: { pointCount, length, tone },
      }
      let points: string[]
      try {
        points = await generateProcessDescription({
          ...baseInput,
          isCodeId,
        })
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr)
        if (
          isCodeId &&
          /not available|unavailable|model.*not found|404|429|quota|overloaded/i.test(
            msg,
          )
        ) {
          toast.message('Retrying AI without IS file context…')
          points = await generateProcessDescription(baseInput)
        } else {
          throw firstErr
        }
      }
      onApplyPoints(points, append ? 'append' : 'replace')
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          content: `Generated ${points.length} description point(s) (${append ? 'appended' : 'replaced'} in the table). You can edit them in Description Points.`,
        },
      ])
      toast.success(
        append
          ? `Added ${points.length} AI point(s)`
          : `Generated ${points.length} description point(s)`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI generation failed'
      setChatError(msg)
      toast.error(msg)
    } finally {
      setGenBusy(false)
    }
  }

  const sendChat = async (raw: string) => {
    const text = raw.trim()
    if (!text || chatBusy || disabled) return
    stopListening()
    const session = sessionRef.current
    setChatBusy(true)
    setChatError(null)
    setInput('')
    setMessages((prev) => [...prev, { id: newId(), role: 'user', content: text }])
    try {
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }))
      const { reply } = await sendQiAssistantMessage({
        page: 'bis/process-flow',
        message: text,
        context: chatContext,
        isCodeId: isCodeId?.trim() || undefined,
        history,
      })
      if (session !== sessionRef.current) return
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'assistant', content: reply || 'No response.' },
      ])
    } catch (err) {
      if (session !== sessionRef.current) return
      const msg = err instanceof Error ? err.message : 'Chat failed'
      setChatError(msg)
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'assistant', content: `Sorry — ${msg}` },
      ])
    } finally {
      if (session === sessionRef.current) setChatBusy(false)
    }
  }

  const busy = genBusy || chatBusy

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="top"
        aria-describedby={undefined}
        overlayClassName={limsDialogSidebarOverlayClass}
        portalClassName={limsDialogSidebarPortalClass}
        className={cn(
          'flex max-h-[min(92dvh,820px)] w-[min(96vw,640px)] flex-col gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-[#fffcf7] p-0 shadow-2xl ring-2 ring-amber-700/35',
          '[&>button]:!rounded-none [&>button]:opacity-100',
        )}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
            }}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative space-y-1 pr-10 text-left">
            <DialogTitle className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-white">
              <span className="flex h-8 w-8 items-center justify-center border border-amber-400/40 bg-amber-400/15">
                <Sparkles size={16} className="text-amber-200" />
              </span>
              Process Description AI
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="shrink-0 space-y-2.5 border-b border-stone-400 bg-[#fffcf7] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800/80">
            Generate Points
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-stone-700">
              <span className="font-semibold">Points Count</span>
              <select
                className={cn(limsFieldClass, 'h-9')}
                value={pointCount}
                disabled={disabled || busy}
                onChange={(e) => setPointCount(Number(e.target.value))}
              >
                {[4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} points
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-700">
              <span className="font-semibold">Text Length</span>
              <select
                className={cn(limsFieldClass, 'h-9')}
                value={length}
                disabled={disabled || busy}
                onChange={(e) =>
                  setLength(e.target.value as ProcessDescriptionLength)
                }
              >
                <option value="short">Short (1 sentence)</option>
                <option value="medium">Medium (1–2 sentences)</option>
                <option value="long">Long (2–4 sentences)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-700">
              <span className="font-semibold">Tone / Style</span>
              <select
                className={cn(limsFieldClass, 'h-9')}
                value={tone}
                disabled={disabled || busy}
                onChange={(e) =>
                  setTone(e.target.value as ProcessDescriptionTone)
                }
              >
                <option value="professional">Professional</option>
                <option value="technical">Technical</option>
                <option value="inspection">Inspection-ready</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-700">
              <span className="font-semibold">Insert Mode</span>
              <select
                className={cn(limsFieldClass, 'h-9')}
                value={append ? 'append' : 'replace'}
                disabled={disabled || busy}
                onChange={(e) => setAppend(e.target.value === 'append')}
              >
                <option value="replace">Replace all points</option>
                <option value="append">Append to table</option>
              </select>
            </label>
          </div>
          <Button
            type="button"
            disabled={disabled || busy}
            className={cn(limsPrimaryBtnClass, 'h-9 w-full gap-1.5 text-xs sm:w-auto')}
            onClick={() => void runGenerate()}
          >
            {genBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {genBusy ? 'Generating…' : 'Generate Points'}
          </Button>
        </div>

        <div
          ref={scrollRef}
          className="min-h-[180px] max-h-[36vh] flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-[#f7f3eb] to-[#fffcf7] px-4 py-3"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'max-w-[92%] border px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                m.role === 'user'
                  ? 'ml-auto border-amber-800/30 bg-amber-700 text-amber-50'
                  : 'mr-auto border-stone-400 bg-white text-stone-800',
              )}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
          {chatBusy ? (
            <div className="mr-auto flex max-w-[92%] items-center gap-2 border border-stone-400 bg-white px-3.5 py-2.5 text-sm text-stone-600">
              <Loader2 size={14} className="animate-spin text-amber-700" />
              Working…
            </div>
          ) : null}
        </div>

        {messages.length <= 1 ? (
          <div className="space-y-2 border-t border-stone-400 bg-[#fffcf7] px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800/80">
              Try asking
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="border border-stone-400 bg-white px-3 py-2 text-left text-xs text-stone-700 transition-colors hover:border-amber-600 hover:bg-amber-50"
                  disabled={busy || disabled}
                  onClick={() => void sendChat(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {chatError ? (
          <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
            {chatError}
          </p>
        ) : null}

        <div className="shrink-0 border-t border-stone-400 bg-white">
          <div className="space-y-1.5 p-3 sm:p-4">
            <div className="flex items-end gap-1.5 sm:gap-2">
              {voiceSupported ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    limsOutlineBtnClass,
                    'h-10 w-10 shrink-0',
                    listening &&
                      'border-red-600 bg-red-50 text-red-700 hover:bg-red-100',
                  )}
                  aria-label={listening ? 'Stop voice typing' : 'Start voice typing'}
                  disabled={busy || disabled}
                  title={listening ? 'Stop listening' : 'Voice typing'}
                  onClick={toggleListening}
                >
                  {listening ? <MicOff size={18} /> : <Mic size={18} />}
                </Button>
              ) : null}
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about the process description… or use the mic"
                className="min-h-10 max-h-28 flex-1 resize-none rounded-none border-stone-500 bg-stone-50 shadow-none focus-visible:border-amber-600 focus-visible:ring-amber-500/20"
                rows={1}
                disabled={busy || disabled}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendChat(input)
                  }
                }}
                aria-label="Message to Process Description AI"
              />
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-none bg-amber-700 text-white hover:bg-amber-800"
                aria-label="Send message"
                disabled={busy || disabled || !input.trim()}
                onClick={() => void sendChat(input)}
              >
                <Send size={18} />
              </Button>
            </div>
            <p className="px-0.5 text-[10px] font-medium tracking-wide text-stone-500">
              Chat about the flow chart
              {voiceSupported ? ' · mic to speak' : ''}
              {' · '}
              Generate Points fills the table below
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
