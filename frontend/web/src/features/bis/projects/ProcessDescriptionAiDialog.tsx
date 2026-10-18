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
  limsDialogSidebarOverlayClass,
  limsDialogSidebarPortalClass,
  limsFieldClass,
  limsOutlineBtnClass,
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
  type ProcessFlowNode,
} from './processFlowModel'

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
  const [pointCount, setPointCount] = useState(10)
  const [length, setLength] = useState<ProcessDescriptionLength>(
    DEFAULT_PROCESS_DESCRIPTION_OPTIONS.length,
  )
  const [tone, setTone] = useState<ProcessDescriptionTone>('inspection')
  const [append, setAppend] = useState(false)
  const [genBusy, setGenBusy] = useState(false)

  const [input, setInput] = useState('')
  const [chatError, setChatError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceBaseRef = useRef('')
  const sessionRef = useRef(0)

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
    setInput('')
    setChatError(null)
    setGenBusy(false)
  }, [open])

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

  /** Generates points from the options above plus any typed instructions, writes them to the table and closes. */
  const runGenerate = async (instructions: string) => {
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
        instructions: [
          instructions,
          append && existingPoints.length
            ? `These points are already in the table — add new ones, do not repeat them:\n${existingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
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
      setInput('')
      onOpenChange(false)
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

  const submit = () => {
    stopListening()
    void runGenerate(input.trim())
  }

  const busy = genBusy

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
                    {n} Points
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
                <option value="short">Short (1 Sentence)</option>
                <option value="medium">Medium (1–2 Sentences)</option>
                <option value="long">Long (2–4 Sentences)</option>
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
                <option value="inspection">Inspection-Ready</option>
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
                <option value="replace">Replace All Points</option>
                <option value="append">Append to Table</option>
              </select>
            </label>
          </div>
        </div>

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
                className="min-h-10 max-h-28 flex-1 resize-none rounded-none border-stone-500 bg-stone-50 shadow-none focus-visible:border-amber-600 focus-visible:ring-amber-500/20"
                rows={1}
                disabled={busy || disabled}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                aria-label="Special instructions for the generated points"
              />
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-none bg-amber-700 text-white hover:bg-amber-800"
                aria-label="Generate points"
                title="Generate points with the options above and your instructions, and fill the table"
                disabled={busy || disabled}
                onClick={submit}
              >
                {genBusy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
