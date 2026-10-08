import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, ImagePlus, Loader2, Mic, MicOff, Send, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IsCodeSearchPicker } from './IsCodeSearchPicker'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabaseClient'
import { AI_SETTINGS_SINGLETON_ID } from '@/features/settings/ai-settings/types'
import { useShowAiAssistant } from '@/hooks/useShowAiAssistant'
import {
  sendQiAssistantMessage,
  validateAssistantImageFile,
  validateAssistantPdfFile,
  type QiAssistantActionResult,
  type QiChatMessage,
} from './qiAssistantApi'
import {
  filterSkillsForTrigger,
  parseAttachTrigger,
  parseSkillTrigger,
  type AiSkillPick,
  type SkillTriggerMatch,
} from './skillTrigger'

type AttachPickOption = {
  id: 'image' | 'pdf'
  label: string
  hint: string
  keywords: string[]
}
import { cn } from '@/lib/utils'

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function assistantDialogTitle(activeRecordTable?: string, isCodeId?: string, page?: string): string {
  if (page === 'samples/receiving') return 'Sample Receiving Assistant'
  if (page === 'nabl-scope') return 'NABL Scope Assistant'
  if (page === 'calibration-nabl-scope') return 'Calibration NABL Scope Assistant'
  if (page === 'equipment-breakdown-register') return 'Equipment Breakdown Register Assistant'
  if (page === 'clients') return 'Client Directory Assistant'
  if (activeRecordTable === 'test_parameters') return 'Test Parameter Assistant'
  if (activeRecordTable === 'is_codes' || isCodeId) return 'IS Code Assistant'
  return 'QE Assistant'
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

const CLIENT_CARD_SAVE_PROMPT =
  'Read this business card / photo and save the client now. Create the client record with company name and any contact, mobile, email, address, and GST you can read.'

export type QiAssistantIsCodeOption = { id: string; label: string; displayCode?: string }

export function QiAssistant({
  page,
  pageTitle,
  contextSummary,
  suggestedQuestions,
  isCodeId,
  isCodeOptions,
  activeRecordId,
  activeRecordTable,
  welcomeMessage,
  triggerVariant = 'default',
  triggerClassName,
  onDataChanged,
  enablePdfImport = false,
  enableImageImport = false,
  pdfAttachHint = 'IS standard PDF',
  imageAttachHint = 'business card or photo',
}: {
  page: string
  pageTitle: string
  contextSummary: string
  suggestedQuestions?: string[]
  isCodeId?: string
  /** Header assistant: user picks IS code to load PDFs for test-parameter import */
  isCodeOptions?: QiAssistantIsCodeOption[]
  activeRecordId?: string
  activeRecordTable?: string
  welcomeMessage?: string
  triggerVariant?: 'default' | 'icon'
  /** Optional classes for the dialog trigger button */
  triggerClassName?: string
  onDataChanged?: () => void
  enablePdfImport?: boolean
  /** Allow camera / gallery attach (vision) — e.g. Client Directory business cards */
  enableImageImport?: boolean
  /** Label for PDF attach button, e.g. "test request PDF" */
  pdfAttachHint?: string
  imageAttachHint?: string
}) {
  const showAssistant = useShowAiAssistant()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<QiChatMessage[]>([])
  const [agentCrudEnabled, setAgentCrudEnabled] = useState(true)
  const [skills, setSkills] = useState<AiSkillPick[]>([])
  const [selectedSkill, setSelectedSkill] = useState<AiSkillPick | null>(null)
  const [selectedIsCodeId, setSelectedIsCodeId] = useState('')
  const [attachedPdf, setAttachedPdf] = useState<File | null>(null)
  const [attachedImage, setAttachedImage] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [busyHint, setBusyHint] = useState<string | null>(null)
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [attachPickerOpen, setAttachPickerOpen] = useState(false)
  const [skillHighlight, setSkillHighlight] = useState(0)
  const [attachHighlight, setAttachHighlight] = useState(0)
  const [caretPos, setCaretPos] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceBaseRef = useRef('')

  const skillTrigger = useMemo(
    () => (skillPickerOpen ? parseSkillTrigger(input, caretPos) : null),
    [skillPickerOpen, input, caretPos],
  )

  const attachTrigger = useMemo(
    () => (attachPickerOpen ? parseAttachTrigger(input, caretPos) : null),
    [attachPickerOpen, input, caretPos],
  )

  const filteredSkills = useMemo(() => {
    if (!skillTrigger) return skills
    return filterSkillsForTrigger(skills, skillTrigger.filter)
  }, [skills, skillTrigger])

  const attachOptions = useMemo((): AttachPickOption[] => {
    const opts: AttachPickOption[] = []
    if (enableImageImport) {
      opts.push({
        id: 'image',
        label: 'Photo / card',
        hint: imageAttachHint,
        keywords: ['photo', 'image', 'card', 'pic', 'camera'],
      })
    }
    if (enablePdfImport) {
      opts.push({
        id: 'pdf',
        label: 'PDF file',
        hint: pdfAttachHint,
        keywords: ['pdf', 'file', 'document', 'doc'],
      })
    }
    return opts
  }, [enableImageImport, enablePdfImport, imageAttachHint, pdfAttachHint])

  const filteredAttachOptions = useMemo(() => {
    const q = (attachTrigger?.filter ?? '').trim().toLowerCase()
    if (!q) return attachOptions
    return attachOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.hint.toLowerCase().includes(q) ||
        o.keywords.some((k) => k.includes(q) || q.includes(k)),
    )
  }, [attachOptions, attachTrigger])

  const defaults = [
    'How do I add a new client?',
    'What does balance type Dr and Cr mean?',
    'Summarize the clients shown in the list',
  ]

  const prompts = suggestedQuestions ?? defaults
  const isClientsPage = page === 'clients'

  const showIsCodePicker = Boolean(isCodeOptions?.length) && !isCodeId
  const effectiveIsCodeId = isCodeId ?? (selectedIsCodeId || undefined)
  const selectedIsCodeLabel = isCodeOptions?.find((o) => o.id === selectedIsCodeId)?.label

  useEffect(() => {
    setVoiceSupported(Boolean(getSpeechRecognitionCtor()))
  }, [])

  useEffect(() => {
    if (!attachedImage) {
      setImagePreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(attachedImage)
    setImagePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [attachedImage])

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void Promise.all([
      supabase
        .from('ai_settings')
        .select('agent_crud_enabled')
        .eq('id', AI_SETTINGS_SINGLETON_ID)
        .maybeSingle(),
      supabase
        .from('ai_skills')
        .select('id, name, description, trigger_keywords, sort_order')
        .eq('is_enabled', true)
        .order('sort_order', { ascending: true }),
    ]).then(([settingsRes, skillsRes]) => {
      if (settingsRes.data && typeof settingsRes.data.agent_crud_enabled === 'boolean') {
        setAgentCrudEnabled(settingsRes.data.agent_crud_enabled)
      }
      setSkills((skillsRes.data ?? []) as AiSkillPick[])
    })
  }, [open])

  useEffect(() => {
    if (!open) {
      setSelectedSkill(null)
      setSelectedIsCodeId('')
      setAttachedPdf(null)
      setAttachedImage(null)
      setSkillPickerOpen(false)
      setInput('')
      setListening(false)
      recognitionRef.current?.abort()
      recognitionRef.current = null
      return
    }
    if (messages.length > 0) return
    const pdfNote = enablePdfImport
      ? ' Use the **PDF** button to attach a file, then type your command and press **Send**.'
      : ''
    const imageNote = ''
    const crudNote = ''
    const voiceNote = ' Tap the **mic** to speak your request.'
    const isCodeNote = showIsCodePicker
      ? ' Pick an **IS Code** below so I can read its uploaded PDFs.'
      : ''
    const skillNote = ' Type **/** for **Skills**, **@** to attach a file from your computer.'
    const intro =
      welcomeMessage !== undefined
        ? welcomeMessage
        : `Hello! I'm **QE Assistant** on **${pageTitle}**. Ask me about this screen or the data shown here.${crudNote}${imageNote}${pdfNote}${voiceNote}${isCodeNote}${skillNote}`
    if (intro.trim()) {
      setMessages([{ id: newId(), role: 'assistant', content: intro }])
    }
  }, [
    open,
    messages.length,
    pageTitle,
    welcomeMessage,
    agentCrudEnabled,
    enablePdfImport,
    enableImageImport,
    showIsCodePicker,
  ])

  const insertComposerToken = (token: '/' | '@') => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? input.length
    const end = el?.selectionEnd ?? start
    const before = input.slice(0, start)
    const after = input.slice(end)
    const needsSpace = before.length > 0 && !/\s$/.test(before)

    // Single attach type → open the computer file picker immediately.
    if (token === '@' && attachOptions.length === 1) {
      const option = attachOptions[0]!
      setSkillPickerOpen(false)
      setAttachPickerOpen(false)
      requestAnimationFrame(() => {
        if (option.id === 'image') imageInputRef.current?.click()
        else pdfInputRef.current?.click()
        el?.focus()
      })
      return
    }

    const next = `${before}${needsSpace ? ' ' : ''}${token}${after}`
    const caret = before.length + (needsSpace ? 1 : 0) + 1
    setInput(next)
    setCaretPos(caret)
    if (token === '/') {
      setAttachPickerOpen(false)
      setSkillPickerOpen(true)
      setSkillHighlight(0)
    } else {
      setSkillPickerOpen(false)
      setAttachPickerOpen(attachOptions.length > 0)
      setAttachHighlight(0)
    }
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  const appendAssistantResult = (reply: string, actionsExecuted?: QiAssistantActionResult[]) => {
    let content = reply
    if (actionsExecuted?.length) {
      const lines = actionsExecuted.map(
        (a) => `${a.ok ? '✓' : '✗'} ${a.operation} **${a.table}**${a.id ? ` \`${a.id}\`` : ''}: ${a.message}`,
      )
      content = `${reply}\n\n**Database changes:**\n${lines.join('\n')}`
      if (actionsExecuted.some((a) => a.ok)) onDataChanged?.()
    }
    setMessages((prev) => [...prev, { id: newId(), role: 'assistant', content }])
  }

  const stripTriggerFromInput = (trigger: SkillTriggerMatch | null) => {
    if (!trigger) return
    const before = input.slice(0, trigger.start)
    const after = input.slice(trigger.end)
    const next = `${before}${after}`.replace(/^\s+/, '').replace(/\s{2,}/g, ' ')
    setInput(next)
  }

  const syncComposerPickers = (text: string, pos: number) => {
    setCaretPos(pos)
    const skill = parseSkillTrigger(text, pos)
    const attach = parseAttachTrigger(text, pos)
    if (skill) {
      setSkillPickerOpen(true)
      setAttachPickerOpen(false)
      setSkillHighlight(0)
      return
    }
    if (attach && attachOptions.length > 0) {
      setAttachPickerOpen(true)
      setSkillPickerOpen(false)
      setAttachHighlight(0)
      return
    }
    setSkillPickerOpen(false)
    setAttachPickerOpen(false)
  }

  const applySkillSelection = (skill: AiSkillPick, trigger: SkillTriggerMatch | null) => {
    setSelectedSkill(skill)
    setSkillPickerOpen(false)
    stripTriggerFromInput(trigger)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const applyAttachSelection = (option: AttachPickOption, trigger: SkillTriggerMatch | null) => {
    setAttachPickerOpen(false)
    stripTriggerFromInput(trigger)
    requestAnimationFrame(() => {
      if (option.id === 'image') imageInputRef.current?.click()
      else pdfInputRef.current?.click()
      textareaRef.current?.focus()
    })
  }

  const handlePdfAttach = (file: File) => {
    try {
      validateAssistantPdfFile(file)
      setAttachedPdf(file)
      setAttachedImage(null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PDF')
    }
  }

  const handleImageAttach = (file: File) => {
    try {
      validateAssistantImageFile(file)
      setAttachedImage(file)
      setAttachedPdf(null)
      setError(null)
      if (isClientsPage && !input.trim()) {
        setInput(CLIENT_CARD_SAVE_PROMPT)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid image')
    }
  }

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const toggleListening = () => {
    if (loading) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setError('Voice typing is not supported in this browser. Try Chrome or Edge.')
      return
    }

    if (listening) {
      stopListening()
      return
    }

    try {
      const recognition = new Ctor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-IN'
      voiceBaseRef.current = input.trim() ? `${input.trim()} ` : ''
      recognition.onresult = (event) => {
        let interim = ''
        let finalChunk = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i]![0]!.transcript
          if (event.results[i]!.isFinal) finalChunk += piece
          else interim += piece
        }
        if (finalChunk) {
          voiceBaseRef.current = `${voiceBaseRef.current}${finalChunk}`.replace(/\s+/g, ' ')
        }
        setInput(`${voiceBaseRef.current}${interim}`.trimStart())
      }
      recognition.onerror = (event) => {
        if (event.error === 'aborted' || event.error === 'no-speech') return
        setError(event.error === 'not-allowed' ? 'Microphone permission denied.' : `Voice error: ${event.error}`)
        setListening(false)
      }
      recognition.onend = () => {
        setListening(false)
        recognitionRef.current = null
      }
      recognitionRef.current = recognition
      recognition.start()
      setListening(true)
      setError(null)
    } catch {
      setError('Could not start voice typing.')
      setListening(false)
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed =
        text.trim() ||
        (attachedImage && isClientsPage ? CLIENT_CARD_SAVE_PROMPT : '')
      if (!trimmed || loading) return

      if (
        showIsCodePicker &&
        !effectiveIsCodeId &&
        /\b(import|extract|add|create|populate|pull)\b/i.test(trimmed) &&
        /\b(test|parameter|clause|pdf|standard)\b/i.test(trimmed)
      ) {
        setError('Select an IS Code from the dropdown first so I can read its PDFs.')
        return
      }

      stopListening()
      setError(null)
      setInput('')
      setSkillPickerOpen(false)

      const skillTag = selectedSkill ? `[Skill: ${selectedSkill.name}] ` : ''
      const pdfTag = attachedPdf ? `📎 PDF: ${attachedPdf.name}\n\n` : ''
      const imageTag = attachedImage ? `🖼️ Card/Photo: ${attachedImage.name}\n\n` : ''
      const userMsg: QiChatMessage = {
        id: newId(),
        role: 'user',
        content: `${skillTag}${pdfTag}${imageTag}${trimmed}`,
      }
      const skillId = selectedSkill?.id
      const pdfFile = attachedPdf
      const imageFile = attachedImage
      setSelectedSkill(null)
      setAttachedPdf(null)
      setAttachedImage(null)

      setMessages((prev) => [...prev, userMsg])
      setLoading(true)
      setBusyHint(
        imageFile
          ? 'Reading card photo and saving client…'
          : pdfFile
            ? 'Reading attached PDF…'
            : effectiveIsCodeId && page !== 'samples/receiving'
              ? 'Reading IS PDFs and thinking…'
              : 'Working…',
      )

      try {
        const history = [...messages, userMsg]
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }))

        const { reply, actionsExecuted } = await sendQiAssistantMessage({
          page,
          message: trimmed,
          context: contextSummary,
          isCodeId: effectiveIsCodeId,
          activeRecordId,
          activeRecordTable,
          activeSkillId: skillId,
          attachedPdf: pdfFile ?? undefined,
          attachedImage: imageFile ?? undefined,
          history,
        })

        appendAssistantResult(reply, actionsExecuted)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to get a response'
        setError(msg)
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: 'assistant', content: `Sorry, I could not answer that. ${msg}` },
        ])
      } finally {
        setLoading(false)
        setBusyHint(null)
      }
    },
    [
      activeRecordId,
      activeRecordTable,
      attachedImage,
      attachedPdf,
      contextSummary,
      effectiveIsCodeId,
      isClientsPage,
      loading,
      messages,
      page,
      selectedSkill,
      showIsCodePicker,
      stopListening,
    ],
  )

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (skillPickerOpen && filteredSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSkillHighlight((i) => (i + 1) % filteredSkills.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSkillHighlight((i) => (i - 1 + filteredSkills.length) % filteredSkills.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const skill = filteredSkills[skillHighlight]
        if (skill) applySkillSelection(skill, skillTrigger)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSkillPickerOpen(false)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const skill = filteredSkills[skillHighlight]
        if (skill) applySkillSelection(skill, skillTrigger)
        return
      }
    }

    if (attachPickerOpen && filteredAttachOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAttachHighlight((i) => (i + 1) % filteredAttachOptions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAttachHighlight((i) => (i - 1 + filteredAttachOptions.length) % filteredAttachOptions.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const option = filteredAttachOptions[attachHighlight]
        if (option) applyAttachSelection(option, attachTrigger)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setAttachPickerOpen(false)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const option = filteredAttachOptions[attachHighlight]
        if (option) applyAttachSelection(option, attachTrigger)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  if (!showAssistant) return null

  const canSend = Boolean(input.trim() || (attachedImage && isClientsPage))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerVariant === 'icon' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'rounded-none border-amber-500/45 bg-stone-800/80 text-amber-200 shadow-none hover:bg-amber-500/20 hover:text-amber-100',
              triggerClassName,
            )}
            title={`QE Assistant — ${pageTitle}`}
            aria-label={`Open QE Assistant (${pageTitle})`}
          >
            <Sparkles size={14} className="text-current" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'gap-1.5 rounded-none border border-amber-500/40 bg-stone-800/80 text-amber-100 shadow-none hover:bg-amber-500/20 hover:text-amber-50',
              triggerClassName,
            )}
            aria-label="Open QE Assistant"
          >
            <Sparkles size={16} className="text-amber-300" />
            QE Assistant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          'flex max-h-[90vh] w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-[#fffcf7] p-0 shadow-2xl ring-2 ring-amber-700/35 sm:max-w-xl',
          'lg:left-[calc(268px+(100vw-268px)/2)] lg:right-auto lg:mx-0 md:top-1/2 md:!-translate-x-1/2 md:!-translate-y-1/2',
          '[&>button]:!rounded-none [&>button]:opacity-100',
        )}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
            }}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative space-y-1 pr-10 text-left">
            <DialogTitle className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-white sm:text-lg">
              <span className="flex h-8 w-8 items-center justify-center border border-amber-400/40 bg-amber-400/15">
                <Sparkles size={16} className="text-amber-200" />
              </span>
              <span className="min-w-0 truncate">
                {assistantDialogTitle(activeRecordTable, effectiveIsCodeId, page)}
              </span>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          ref={scrollRef}
          className="min-h-[220px] max-h-[42vh] flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-[#f7f3eb] to-[#fffcf7] px-4 py-3 sm:px-5"
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
          {loading && (
            <div className="mr-auto flex max-w-[92%] items-center gap-2 border border-stone-400 bg-white px-3.5 py-2.5 text-sm text-stone-600">
              <Loader2 size={14} className="animate-spin text-amber-700" />
              {busyHint ?? 'Working…'}
            </div>
          )}
        </div>

        {messages.length <= 1 && prompts.length > 0 && (
          <div className="space-y-2 border-t border-stone-400 bg-[#fffcf7] px-4 py-3 sm:px-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800/80">Try asking</p>
            <div className="flex flex-col gap-1.5">
              {prompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="border border-stone-400 bg-white px-3 py-2 text-left text-xs text-stone-700 transition-colors hover:border-amber-600 hover:bg-amber-50 hover:text-amber-950"
                  onClick={() => void sendMessage(q)}
                  disabled={loading}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="border-t border-red-300 bg-red-50 px-4 py-2 text-xs text-red-700 sm:px-5">{error}</p>
        )}

        <div className="relative border-t-2 border-stone-500 bg-[#fffcf7]">
          {skillPickerOpen && (
            <div
              className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-48 overflow-y-auto border-2 border-stone-600 bg-white shadow-xl ring-1 ring-amber-700/25"
              role="listbox"
              aria-label="Select AI skill"
            >
              <div className="border-b border-stone-500 bg-stone-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Skills · type / to filter
              </div>
              {filteredSkills.length === 0 ? (
                <p className="px-3 py-2 text-xs text-stone-500">
                  No skills match. Add skills in Lab Settings → AI Settings → Skills.
                </p>
              ) : (
                filteredSkills.map((skill, idx) => (
                  <button
                    key={skill.id}
                    type="button"
                    role="option"
                    aria-selected={idx === skillHighlight}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 border-l-2 px-3 py-2 text-left text-sm transition-colors',
                      idx === skillHighlight
                        ? 'border-l-amber-600 bg-amber-100 text-stone-950'
                        : 'border-l-transparent hover:bg-[#f3e9d8]',
                    )}
                    onMouseEnter={() => setSkillHighlight(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      applySkillSelection(skill, skillTrigger)
                    }}
                    onClick={() => applySkillSelection(skill, skillTrigger)}
                  >
                    <span className="font-semibold">/{skill.name}</span>
                    {skill.description && (
                      <span className="line-clamp-1 text-xs text-stone-500">{skill.description}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {attachPickerOpen && attachOptions.length > 0 && (
            <div
              className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-48 overflow-y-auto border-2 border-stone-600 bg-white shadow-xl ring-1 ring-amber-700/25"
              role="listbox"
              aria-label="Attach a file"
            >
              <div className="border-b border-stone-500 bg-stone-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Attach · type @ to pick from computer
              </div>
              {filteredAttachOptions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-stone-500">No attach options match.</p>
              ) : (
                filteredAttachOptions.map((option, idx) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={idx === attachHighlight}
                    className={cn(
                      'flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-sm transition-colors',
                      idx === attachHighlight
                        ? 'border-l-amber-600 bg-amber-100 text-stone-950'
                        : 'border-l-transparent hover:bg-[#f3e9d8]',
                    )}
                    onMouseEnter={() => setAttachHighlight(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      applyAttachSelection(option, attachTrigger)
                    }}
                    onClick={() => applyAttachSelection(option, attachTrigger)}
                  >
                    {option.id === 'image' ? (
                      <ImagePlus size={16} className="shrink-0 text-amber-800" />
                    ) : (
                      <FileUp size={16} className="shrink-0 text-amber-800" />
                    )}
                    <span className="min-w-0">
                      <span className="font-semibold">@{option.label}</span>
                      <span className="ml-1.5 text-xs text-stone-500">{option.hint}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {(selectedSkill ||
            attachedPdf ||
            attachedImage ||
            (showIsCodePicker && selectedIsCodeId) ||
            listening) && (
            <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
              {listening && (
                <Badge className="gap-1 rounded-none bg-red-600 font-normal text-white hover:bg-red-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  Listening…
                </Badge>
              )}
              {showIsCodePicker && selectedIsCodeId && selectedIsCodeLabel && (
                <Badge
                  variant="outline"
                  className="max-w-full gap-1 rounded-none border-stone-500 pr-1 font-normal"
                >
                  <span className="truncate">IS: {selectedIsCodeLabel}</span>
                  <button
                    type="button"
                    className="shrink-0 p-0.5 hover:bg-stone-100"
                    aria-label="Clear selected IS code"
                    onClick={() => setSelectedIsCodeId('')}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {selectedSkill && (
                <Badge className="gap-1 rounded-none bg-amber-100 pr-1 font-normal text-amber-950 hover:bg-amber-100">
                  Skill: {selectedSkill.name}
                  <button
                    type="button"
                    className="p-0.5 hover:bg-amber-200/60"
                    aria-label="Clear selected skill"
                    onClick={() => setSelectedSkill(null)}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {attachedPdf && (
                <Badge variant="outline" className="gap-1 rounded-none border-stone-500 pr-1 font-normal">
                  PDF: {attachedPdf.name}
                  <button
                    type="button"
                    className="p-0.5 hover:bg-stone-100"
                    aria-label="Remove attached PDF"
                    onClick={() => setAttachedPdf(null)}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {attachedImage && (
                <Badge
                  variant="outline"
                  className="max-w-full gap-1.5 rounded-none border-amber-700/50 bg-amber-50 pr-1 font-normal text-amber-950"
                >
                  {imagePreviewUrl ? (
                    <img
                      src={imagePreviewUrl}
                      alt=""
                      className="h-7 w-7 border border-stone-400 object-cover"
                    />
                  ) : null}
                  <span className="truncate">Card: {attachedImage.name}</span>
                  <button
                    type="button"
                    className="p-0.5 hover:bg-amber-100"
                    aria-label="Remove attached image"
                    onClick={() => setAttachedImage(null)}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {attachedImage && isClientsPage && (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 rounded-none bg-amber-700 px-2 text-[11px] text-white hover:bg-amber-800"
                  disabled={loading}
                  onClick={() => void sendMessage(CLIENT_CARD_SAVE_PROMPT)}
                >
                  Save client from card
                </Button>
              )}
            </div>
          )}

          {showIsCodePicker && (
            <div className="px-4 pt-3">
              <IsCodeSearchPicker
                options={isCodeOptions ?? []}
                valueId={selectedIsCodeId}
                onChange={setSelectedIsCodeId}
              />
            </div>
          )}

          {(enableImageImport || enablePdfImport) && (
            <>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                capture="environment"
                className="hidden"
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleImageAttach(f)
                  if (e.target) e.target.value = ''
                }}
              />
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handlePdfAttach(f)
                  if (e.target) e.target.value = ''
                }}
              />
            </>
          )}

          <div className="space-y-1.5 p-3 sm:p-4">
            <div className="flex items-end gap-1.5 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  'h-10 w-10 shrink-0 rounded-none border-stone-500 font-bold text-amber-800 hover:bg-amber-50',
                  skillPickerOpen && 'border-amber-600 bg-amber-50',
                )}
                aria-label="Pick AI skill"
                disabled={loading}
                title="Type / for skills"
                onClick={() => insertComposerToken('/')}
              >
                /
              </Button>
              {(enableImageImport || enablePdfImport) && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-10 w-10 shrink-0 rounded-none border-stone-500 font-bold text-amber-800 hover:bg-amber-50',
                    attachPickerOpen && 'border-amber-600 bg-amber-50',
                  )}
                  aria-label="Attach file from computer"
                  disabled={loading}
                  title="Type @ to attach a file from your computer"
                  onClick={() => insertComposerToken('@')}
                >
                  @
                </Button>
              )}
              {voiceSupported && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-10 w-10 shrink-0 rounded-none border-stone-500',
                    listening
                      ? 'border-red-600 bg-red-50 text-red-700 hover:bg-red-100'
                      : 'text-stone-700 hover:bg-amber-50 hover:text-amber-900',
                  )}
                  aria-label={listening ? 'Stop voice typing' : 'Start voice typing'}
                  disabled={loading}
                  title={listening ? 'Stop listening' : 'Voice typing'}
                  onClick={toggleListening}
                >
                  {listening ? <MicOff size={18} /> : <Mic size={18} />}
                </Button>
              )}
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  syncComposerPickers(e.target.value, e.target.selectionStart ?? e.target.value.length)
                }}
                onClick={(e) =>
                  syncComposerPickers(input, e.currentTarget.selectionStart ?? input.length)
                }
                onKeyUp={(e) =>
                  syncComposerPickers(input, e.currentTarget.selectionStart ?? input.length)
                }
                placeholder={
                  attachedImage && isClientsPage
                    ? 'Card attached — Send to save client, or edit the prompt…'
                    : attachedPdf
                      ? page === 'samples/receiving'
                        ? 'e.g. Register this test request as a new sample…'
                        : 'Type command for attached PDF, then Send…'
                      : showIsCodePicker
                        ? 'Select IS Code, type / for skill, ask to import…'
                        : page === 'samples/receiving'
                          ? 'Type @ to attach Test Request PDF, then ask…'
                          : 'Ask anything — / skills · @ attach file…'
                }
                className="min-h-10 max-h-28 flex-1 resize-none rounded-none border-stone-500 bg-stone-50 shadow-none focus-visible:border-amber-600 focus-visible:ring-amber-500/20"
                rows={1}
                onKeyDown={handleInputKeyDown}
                disabled={loading}
                aria-label="Message to QE Assistant"
                aria-expanded={skillPickerOpen || attachPickerOpen}
                aria-autocomplete="list"
              />
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-none bg-amber-700 text-white hover:bg-amber-800"
                aria-label="Send message"
                disabled={loading || !canSend}
                onClick={() => void sendMessage(input)}
              >
                <Send size={18} />
              </Button>
            </div>
            <p className="px-0.5 text-[10px] font-medium tracking-wide text-stone-500">
              <span className="text-amber-800">/</span> skills
              {(enableImageImport || enablePdfImport) && (
                <>
                  {' · '}
                  <span className="text-amber-800">@</span> attach from computer
                </>
              )}
              {voiceSupported ? ' · mic to speak' : ''}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
