import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bell, Brain, CalendarClock, Maximize2, Minus, FileText, FileUp, FolderUp, History, ImagePlus, Loader2, MessageSquare, Mic, MicOff, Paperclip, Pause, Play, Plug, Plus, RotateCcw, Send, ShieldCheck, Sparkles, Trash2, X, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
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
import { useIsLaboratoryDirector } from '@/components/lims/LaboratoryDirectorOnly'
import { flattenNavModules } from '@/lib/appNav'
import { AgentProposals, AgentSteps } from './QiAgentParts'
import { splitQuote, withQuote } from './chatQuote'
import { MessageActions, ReplyQuoteBar, SelectionPopup, type ChatActionHandlers } from './QiChatActions'
import { readAttachments, toAttachments, type ChatAttachment } from './chatAttachments'
import { useAssistantNotices, type AssistantNotice } from './assistantNotices'
import { QiNoticesPanel } from './QiNoticesPanel'
import {
  createConversation,
  deleteConversation,
  addMemory,
  deleteMemory,
  listConversations,
  listMemories,
  loadConversationMessages,
  saveMessage,
  deleteTask,
  listTaskRuns,
  listTasks,
  markRunsSeen,
  runTaskNow,
  saveRunAgent,
  setTaskEnabled,
  type AssistantConversation,
  type AssistantMemory,
  type AssistantTask,
  type AssistantTaskRun,
} from './assistantStore'
import { describeSchedule, formatIst } from './assistantSchedule'
import { MailConnectorPanel } from './MailConnectorPanel'
import {
  sendQiAssistantMessage,
  validateAssistantImageFile,
  validateAssistantPdfFile,
  type QiAgentResult,
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

function headerToolClass(active: boolean) {
  return cn(
    'inline-flex h-7 w-7 items-center justify-center border text-amber-100 hover:bg-amber-500/20',
    active ? 'border-amber-300 bg-amber-500/30' : 'border-amber-500/40 bg-stone-800/80',
  )
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function renderAssistantInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) nodes.push(text.slice(cursor, index))
    const token = match[0]
    const body = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1)
    const key = `md-${index}`
    nodes.push(token.startsWith('**')
      ? <strong key={key}>{body}</strong>
      : token.startsWith('`')
        ? <code key={key} className="rounded bg-black/5 px-1">{body}</code>
        : <em key={key}>{body}</em>)
    cursor = index + token.length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

type MessageSegment =
  | { kind: 'heading'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'p'; lines: string[] }
  | { kind: 'quote'; lines: string[] }

const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

/** Markdown the agent writes → segments: headings, tables, bullet / numbered lists, paragraphs (--- rules dropped). */
function parseMessage(content: string): MessageSegment[] {
  const out: MessageSegment[] = []
  const push = (seg: MessageSegment) => {
    const last = out[out.length - 1]
    if (seg.kind === 'p' && last?.kind === 'p') last.lines.push(...seg.lines)
    else if (seg.kind === 'quote' && last?.kind === 'quote') last.lines.push(...seg.lines)
    else if ((seg.kind === 'ul' || seg.kind === 'ol') && last?.kind === seg.kind) last.items.push(...seg.items)
    else out.push(seg)
  }
  const lines = content.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (!line.trim()) {
      out.push({ kind: 'p', lines: [] })
      continue
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) continue
    if (line.startsWith('> ')) {
      push({ kind: 'quote', lines: [line.slice(2)] })
      continue
    }
    const heading = line.match(/^\s*#{1,4}\s+(.+)$/)
    if (heading) {
      push({ kind: 'heading', text: heading[1]! })
      continue
    }
    if (TABLE_ROW.test(line)) {
      const rows: string[][] = []
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) {
        if (!TABLE_RULE.test(lines[i]!)) {
          rows.push(lines[i]!.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
        }
        i += 1
      }
      i -= 1
      if (rows.length) push({ kind: 'table', rows })
      continue
    }
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/)
    if (bullet) {
      push({ kind: 'ul', items: [bullet[1]!] })
      continue
    }
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (numbered) {
      push({ kind: 'ol', items: [numbered[1]!] })
      continue
    }
    push({ kind: 'p', lines: [line.trim()] })
  }
  return out.filter((seg) => seg.kind !== 'p' || seg.lines.length > 0)
}

function AssistantMessage({ content }: { content: string }) {
  const segments = parseMessage(content.trim())
  return (
    <div className="space-y-2 whitespace-normal">
      {segments.map((seg, index) => {
        if (seg.kind === 'heading') {
          return <h4 key={index} className="pt-1 text-[13px] font-bold text-stone-900">{renderAssistantInline(seg.text)}</h4>
        }
        if (seg.kind === 'table') {
          const [head, ...body] = seg.rows
          return (
            <div key={index} className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {head!.map((cell, c) => (
                      <th key={c} className="border border-stone-300 bg-stone-100 px-2 py-1 text-left font-semibold text-stone-700">{renderAssistantInline(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, r) => (
                    <tr key={r} className={r % 2 ? 'bg-stone-50/70' : undefined}>
                      {head!.map((_, c) => (
                        <td key={c} className="border border-stone-200 px-2 py-1 align-top text-stone-800">{renderAssistantInline(row[c] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (seg.kind === 'ul' || seg.kind === 'ol') {
          const List = seg.kind
          return (
            <List key={index} className={cn('space-y-0.5 pl-5', seg.kind === 'ol' ? 'list-decimal' : 'list-disc')}>
              {seg.items.map((item, i) => (
                <li key={i}>{renderAssistantInline(item)}</li>
              ))}
            </List>
          )
        }
        if (seg.kind === 'quote') {
          return <blockquote key={index} className="line-clamp-4 whitespace-pre-wrap break-words border-l-2 border-current pl-2 text-xs opacity-80">{seg.lines.join('\n')}</blockquote>
        }
        if (seg.kind !== 'p') return null
        return (
          <p key={index}>
            {seg.lines.map((line, i) => (
              <span key={i}>{renderAssistantInline(line)}{i < seg.lines.length - 1 ? <br /> : null}</span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

/** One chat bubble with its options under it. */
function ChatMessageRow({
  message,
  handlers,
  children,
}: {
  message: QiChatMessage
  handlers: ChatActionHandlers
  children?: ReactNode
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const own = message.role === 'user'
  return (
    <div className={cn('flex max-w-[92%] flex-col', own ? 'ml-auto items-end' : 'mr-auto items-start')}>
      <div
        className={cn(
          'max-w-full border px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
          own ? 'border-amber-800/30 bg-amber-700 text-amber-50 selection:bg-stone-900 selection:text-white' : 'border-stone-400 bg-white text-stone-800',
        )}
      >
        <div ref={bodyRef} data-chat-body>
          <AssistantMessage content={message.content} />
        </div>
        {children}
      </div>
      <MessageActions role={message.role} handlers={handlers} bodyRef={bodyRef} />
    </div>
  )
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
  /** No longer shown (the Try Asking list was removed); kept so existing callers compile. */
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
  // QE Assistant is for admins only; the header assistant runs as the Admin Agent (tools over the whole app).
  const isAdmin = useIsLaboratoryDirector()
  const agentMode = isAdmin && page === 'global'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const agentRoutes = useMemo(() => flattenNavModules().map((m) => ({ path: m.key, label: m.label })), [])
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  /** The text the next message replies to. */
  const [replyQuote, setReplyQuote] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<QiChatMessage[]>([])
  // Admin Agent: the saved chat being continued (null = a new chat, created on the first message).
  const conversationIdRef = useRef<string | null>(null)
  // Same id for rendering (refs are not read during render).
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  // Admin Agent panel folded to a small bar (chat kept).
  const [minimized, setMinimized] = useState(false)
  const [agentView, setAgentView] = useState<'chat' | 'history' | 'memory' | 'tasks' | 'connectors' | 'notifications'>('chat')
  const [tasks, setTasks] = useState<AssistantTask[]>([])
  const [runs, setRuns] = useState<AssistantTaskRun[]>([])
  const [conversations, setConversations] = useState<AssistantConversation[]>([])
  const [memories, setMemories] = useState<AssistantMemory[]>([])
  const [viewLoading, setViewLoading] = useState(false)
  const restoredRef = useRef(false)
  const [agentCrudEnabled, setAgentCrudEnabled] = useState(true)
  const [skills, setSkills] = useState<AiSkillPick[]>([])
  const [selectedSkill, setSelectedSkill] = useState<AiSkillPick | null>(null)
  const [selectedIsCodeId, setSelectedIsCodeId] = useState('')
  const [attachedPdf, setAttachedPdf] = useState<File | null>(null)
  const [attachedImage, setAttachedImage] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  // Files / folders attached with the + button (read in the browser when the message is sent).
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [plusOpen, setPlusOpen] = useState(false)
  // Voice typing language, remembered in this browser.
  const [voiceLang, setVoiceLang] = useState<'en-IN' | 'hi-IN'>(() => {
    try {
      return window.localStorage.getItem('qe-assistant-voice-lang') === 'hi-IN' ? 'hi-IN' : 'en-IN'
    } catch {
      return 'en-IN'
    }
  })
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
  // True while the user wants to keep listening: the browser ends recognition after a silence, so it restarts.
  const wantListeningRef = useRef(false)
  const filesInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)

  const openNotices = useCallback(() => {
    setOpen(true)
    setMinimized(false)
    setAgentView('notifications')
  }, [])
  const { notices, refresh: refreshNotices, addChatNotice, clearChatNotices, dismiss: dismissNotice, clearAll: clearAllNotices } = useAssistantNotices(agentMode, openNotices)
  // Is the admin looking at the chat right now? Read when an answer arrives, which can be minutes after asking.
  const chatVisibleRef = useRef(false)
  const chatInView = () => chatVisibleRef.current && document.visibilityState === 'visible'
  useEffect(() => {
    chatVisibleRef.current = open && !minimized && agentView === 'chat'
    if (chatVisibleRef.current) clearChatNotices()
  }, [open, minimized, agentView, clearChatNotices])

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
    if (agentMode && !restoredRef.current) {
      restoredRef.current = true
      void listConversations(1)
        .then(async ([latest]) => {
          if (!latest) return
          const saved = await loadConversationMessages(latest.id)
          conversationIdRef.current = latest.id
          setActiveChatId(latest.id)
          setMessages((prev) => (prev.length ? prev : saved))
        })
        .catch(() => undefined)
    }
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
    // The Admin Agent starts with an empty chat (no welcome message).
    const intro = agentMode
      ? ''
      : welcomeMessage !== undefined
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
    agentMode,
    agentCrudEnabled,
    enablePdfImport,
    enableImageImport,
    showIsCodePicker,
  ])

  /** Tells the admin what the AI said when they are not looking at the chat (it can run for minutes). */
  const noticeChatReply = (reply: string, agent?: QiAgentResult) => {
    if (!agentMode || chatInView()) return
    const waiting = agent?.proposals.length ?? 0
    const short = reply.replace(/[*#|`]/g, ' ').replace(/\s+/g, ' ').trim()
    if (waiting) addChatNotice({ kind: 'confirm', title: 'AI Needs Your Confirmation', detail: `${waiting} Change${waiting === 1 ? '' : 's'} Waiting. ${short}` })
    else if (/[?？]/.test(short.slice(-200))) addChatNotice({ kind: 'question', title: 'AI Has a Question', detail: short.slice(-200) })
    else addChatNotice({ kind: 'reply', title: 'AI Has Replied', detail: short })
  }

  const appendAssistantResult = (reply: string, actionsExecuted?: QiAssistantActionResult[], agent?: QiAgentResult) => {
    noticeChatReply(reply, agent)
    // Admin Agent: open the page it chose (the panel stays open beside it).
    const target = agent?.navigation.at(-1)
    if (target?.path) navigate(target.path)
    let content = reply
    if (actionsExecuted?.length) {
      const lines = actionsExecuted.map(
        (a) => `${a.ok ? '✓' : '✗'} ${a.operation} **${a.table}**${a.id ? ` \`${a.id}\`` : ''}: ${a.message}`,
      )
      content = `${reply}\n\n**Database changes:**\n${lines.join('\n')}`
      if (actionsExecuted.some((a) => a.ok)) onDataChanged?.()
    }
    const message: QiChatMessage = { id: newId(), role: 'assistant', content, agent }
    setMessages((prev) => [...prev, message])
    persistMessage(message)
  }

  /** Admin Agent: saves a message to the current chat (best effort: the chat keeps working if saving fails). */
  const persistMessage = (message: QiChatMessage) => {
    const id = conversationIdRef.current
    if (!agentMode || !id) return
    void saveMessage(id, message).catch(() => undefined)
  }

  /** Confirmed agent changes: tell the chat (so the agent knows next turn) and refresh what the app shows. */
  const handleAgentApplied = (lines: string[]) => {
    const message: QiChatMessage = { id: newId(), role: 'assistant', content: lines.join('\n') }
    setMessages((prev) => [...prev, message])
    persistMessage(message)
    void queryClient.invalidateQueries()
    onDataChanged?.()
  }

  const resetChat = () => {
    conversationIdRef.current = null
    setActiveChatId(null)
    setMessages([])
    setError(null)
    setInput('')
    setReplyQuote(null)
    setAgentView('chat')
  }

  const openAgentView = (view: 'history' | 'memory' | 'tasks' | 'connectors' | 'notifications') => {
    if (agentView === view) {
      setAgentView('chat')
      return
    }
    setAgentView(view)
    // The Connectors view loads its own data; notifications are already here.
    if (view === 'connectors' || view === 'notifications') return
    setViewLoading(true)
    const load =
      view === 'history'
        ? listConversations().then(setConversations)
        : view === 'memory'
          ? listMemories().then(setMemories)
          : Promise.all([listTasks(), listTaskRuns()]).then(([t, r]) => {
              setTasks(t)
              setRuns(r)
              return markRunsSeen(r.filter((x) => !x.seen && x.status !== 'running').map((x) => x.id))
            })
            .then(() => refreshNotices())
    void load
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could Not Load.'))
      .finally(() => setViewLoading(false))
  }

  const updateTask = (task: AssistantTask, action: 'pause' | 'resume' | 'run' | 'delete') => {
    const work =
      action === 'delete'
        ? deleteTask(task.id).then(() => setTasks((prev) => prev.filter((t) => t.id !== task.id)))
        : (action === 'run' ? runTaskNow(task) : setTaskEnabled(task, action === 'resume')).then((next) =>
            setTasks((prev) => prev.map((t) => (t.id === task.id ? next : t))),
          )
    void work.catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could Not Update the Task.'))
  }

  /** A change from a scheduled run was confirmed: remember it on the run so it is not offered again. */
  const recordRunChange = (run: AssistantTaskRun, key: string, line: string) => {
    if (!run.agent) return
    const agent = { ...run.agent, applied: { ...(run.agent.applied ?? {}), [key]: line } }
    setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, agent } : r)))
    void saveRunAgent(run.id, agent).catch(() => undefined)
  }

  const openConversation = (id: string) => {
    setViewLoading(true)
    void loadConversationMessages(id)
      .then((saved) => {
        conversationIdRef.current = id
        setActiveChatId(id)
        setMessages(saved)
        setAgentView('chat')
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could Not Open the Chat.'))
      .finally(() => setViewLoading(false))
  }

  /** What a notification's button does: a mail is read by the AI, the rest open where it needs the admin. */
  const actOnNotice = (notice: AssistantNotice) => {
    dismissNotice(notice)
    setMinimized(false)
    if (notice.mailId) {
      setAgentView('chat')
      void sendMessage(`Read the mail with id ${notice.mailId} (“${notice.title}”) and tell me what it needs from me.`)
    } else if (notice.runId) openAgentView('tasks')
    else if (notice.kind === 'mailbox') openAgentView('connectors')
    else setAgentView('chat')
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
    wantListeningRef.current = false
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const VOICE_ERRORS: Record<string, string> = {
    'not-allowed': 'Allow Microphone Access for This Site (Lock Icon in the Address Bar → Microphone), Then Try Again.',
    'service-not-allowed': 'Allow Microphone Access for This Site, Then Try Again.',
    'audio-capture': 'No Microphone Found. Connect a Microphone and Try Again.',
    network: 'Voice Typing Needs an Internet Connection.',
    'language-not-supported': 'This Browser Cannot Type This Language by Voice.',
  }

  const startRecognition = (lang: 'en-IN' | 'hi-IN') => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = lang
    recognition.onresult = (event) => {
      let interim = ''
      let finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i]![0]!.transcript
        if (event.results[i]!.isFinal) finalChunk += piece
        else interim += piece
      }
      if (finalChunk) {
        const base = voiceBaseRef.current
        const joiner = base && !/\s$/.test(base) ? ' ' : ''
        voiceBaseRef.current = `${base}${joiner}${finalChunk.trim()} `.replace(/\s+/g, ' ')
      }
      setInput(`${voiceBaseRef.current}${interim}`.trimStart())
    }
    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return
      wantListeningRef.current = false
      setError(VOICE_ERRORS[String(event.error)] ?? `Voice Typing Stopped (${String(event.error)}).`)
      setListening(false)
    }
    recognition.onend = () => {
      recognitionRef.current = null
      // Keep listening through pauses until the user taps the mic again (or sends).
      if (wantListeningRef.current) {
        try {
          startRecognition(lang)
          return
        } catch {
          wantListeningRef.current = false
        }
      }
      setListening(false)
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  const toggleListening = () => {
    if (loading) return
    if (!getSpeechRecognitionCtor()) {
      setError('Voice Typing Works in Chrome or Edge. This Browser Does Not Support It.')
      return
    }
    if (listening) {
      stopListening()
      return
    }
    try {
      voiceBaseRef.current = input.trim() ? `${input.trim()} ` : ''
      wantListeningRef.current = true
      startRecognition(voiceLang)
      setListening(true)
      setError(null)
    } catch {
      wantListeningRef.current = false
      setError('Could Not Start Voice Typing.')
      setListening(false)
    }
  }

  const switchVoiceLang = () => {
    const next = voiceLang === 'en-IN' ? 'hi-IN' : 'en-IN'
    setVoiceLang(next)
    try {
      window.localStorage.setItem('qe-assistant-voice-lang', next)
    } catch {
      /* private mode: not remembered */
    }
    // Restart in the new language when already listening.
    if (listening) {
      recognitionRef.current?.abort()
      recognitionRef.current = null
      try {
        voiceBaseRef.current = input.trim() ? `${input.trim()} ` : ''
        startRecognition(next)
      } catch {
        stopListening()
      }
    }
  }

  const addAttachments = (files: FileList | null) => {
    if (!files?.length) return
    // Copy now: the input is cleared right after, which empties its live FileList before the state updates.
    const list = Array.from(files)
    setAttachments((prev) => [...prev, ...toAttachments(list, prev)])
    setPlusOpen(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(
    async (text: string, quoteOverride?: string) => {
      const trimmed =
        text.trim() ||
        (attachedImage && isClientsPage ? CLIENT_CARD_SAVE_PROMPT : '') ||
        (attachments.length ? 'Read the attached files and summarise them.' : '')
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
      const asked = withQuote(quoteOverride ?? replyQuote, trimmed)
      setReplyQuote(null)

      const skillTag = selectedSkill ? `[Skill: ${selectedSkill.name}] ` : ''
      const pdfTag = attachedPdf ? `📎 PDF: ${attachedPdf.name}\n\n` : ''
      const imageTag = attachedImage ? `🖼️ Card/Photo: ${attachedImage.name}\n\n` : ''
      const files = attachments
      const filesTag = files.length
        ? `**Attached (${files.length}):** ${files.slice(0, 6).map((a) => a.path).join(', ')}${files.length > 6 ? ` +${files.length - 6} more` : ''}\n\n`
        : ''
      const userMsg: QiChatMessage = {
        id: newId(),
        role: 'user',
        content: `${skillTag}${pdfTag}${imageTag}${filesTag}${asked}`,
      }
      const skillId = selectedSkill?.id
      const pdfFile = attachedPdf
      const imageFile = attachedImage
      setSelectedSkill(null)
      setAttachedPdf(null)
      setAttachedImage(null)
      setAttachments([])

      setMessages((prev) => [...prev, userMsg])
      setAgentView('chat')
      if (agentMode) {
        try {
          if (!conversationIdRef.current) {
            conversationIdRef.current = await createConversation(trimmed)
            setActiveChatId(conversationIdRef.current)
          }
          void saveMessage(conversationIdRef.current, userMsg).catch(() => undefined)
        } catch {
          /* chat works unsaved (e.g. before the memory migration) */
        }
      }
      setLoading(true)
      setBusyHint(
        files.length
          ? `Reading ${files.length} attached file${files.length === 1 ? '' : 's'}…`
          : imageFile
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

        const read = files.length ? await readAttachments(files) : null
        if (read) setBusyHint('Working…')
        const { reply, actionsExecuted, agent } = await sendQiAssistantMessage({
          ...(agentMode ? { mode: 'agent' as const, routes: agentRoutes } : {}),
          ...(read?.images.length ? { images: read.images } : {}),
          page,
          message: read?.text ? `${asked}\n\n${read.text}` : asked,
          context: contextSummary,
          isCodeId: effectiveIsCodeId,
          activeRecordId,
          activeRecordTable,
          activeSkillId: skillId,
          attachedPdf: pdfFile ?? undefined,
          attachedImage: imageFile ?? undefined,
          history,
        })

        appendAssistantResult(reply, actionsExecuted, agent)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to get a response'
        setError(msg)
        if (agentMode && !chatInView()) addChatNotice({ kind: 'failed', title: 'AI Could Not Answer', detail: msg })
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
      addChatNotice,
      activeRecordId,
      activeRecordTable,
      attachedImage,
      attachedPdf,
      attachments,
      contextSummary,
      effectiveIsCodeId,
      isClientsPage,
      loading,
      messages,
      page,
      agentMode,
      agentRoutes,
      replyQuote,
      selectedSkill,
      showIsCodePicker,
      stopListening,
    ],
  )

  const focusComposer = () => requestAnimationFrame(() => textareaRef.current?.focus())
  const sharedActions: ChatActionHandlers = {
    busy: loading,
    onReply: (quote) => {
      setReplyQuote(quote)
      focusComposer()
    },
    onExplain: (quote) => void sendMessage('Explain this in simple words, in the language of this chat.', quote),
    ...(agentMode
      ? {
          onRemember: (text: string) => addMemory(text),
          onEmail: (quote: string) => {
            setReplyQuote(quote)
            setInput('Prepare an email with this to ')
            focusComposer()
          },
        }
      : {}),
  }
  /** What the options do for one message: an answer can be asked again, an own message edited or sent again. */
  const messageActions = (m: QiChatMessage, index: number): ChatActionHandlers => {
    if (m.role === 'user') {
      const { quote, text } = splitQuote(m.content)
      return {
        ...sharedActions,
        onEdit: () => {
          setReplyQuote(quote)
          setInput(text)
          focusComposer()
        },
        onSendAgain: () => void sendMessage(text, quote ?? ''),
      }
    }
    const question = messages.slice(0, index).reverse().find((x) => x.role === 'user')
    if (!question) return sharedActions
    const { quote, text } = splitQuote(question.content)
    return { ...sharedActions, onAskAgain: () => void sendMessage(text, quote ?? '') }
  }

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

  if (!showAssistant || !isAdmin) return null

  const canSend = Boolean(input.trim() || (attachedImage && isClientsPage) || attachments.length)

  return (
    // The Admin Agent panel is not modal: the page behind stays usable (and shows what the agent opened).
    <Dialog open={open} onOpenChange={setOpen} modal={!agentMode}>
      <DialogTrigger asChild>
        {triggerVariant === 'icon' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'relative rounded-none border-amber-500/45 bg-stone-800/80 text-amber-200 shadow-none hover:bg-amber-500/20 hover:text-amber-100',
              triggerClassName,
            )}
            title={`QE Assistant — ${pageTitle}`}
            aria-label={`Open QE Assistant (${pageTitle})`}
          >
            <Sparkles size={14} className="text-current" />
            {agentMode && notices.length > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-0.5 text-[9px] font-bold text-white" aria-hidden>
                {notices.length > 99 ? '99+' : notices.length}
              </span>
            ) : null}
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
            {agentMode && notices.length > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white" title={`${notices.length} New Notification${notices.length === 1 ? '' : 's'}`}>
                {notices.length}
              </span>
            ) : null}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={!agentMode}
        onInteractOutside={(e) => {
          if (agentMode) e.preventDefault()
        }}
        className={cn(
          'flex flex-col gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-[#fffcf7] p-0 shadow-2xl ring-2 ring-amber-700/35',
          '[&>button]:!rounded-none [&>button]:opacity-100',
          agentMode && minimized
            ? // Minimized: a small bar at the bottom right; the chat stays as it was.
              'left-auto right-4 top-auto bottom-4 h-auto max-h-none w-[min(22rem,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0'
            : agentMode
            ? // Admin Agent: a full-height panel on the right, so the page it opens stays visible beside it.
              'left-auto right-0 top-0 h-[100dvh] max-h-[100dvh] w-[min(34rem,100vw)] max-w-none translate-x-0 translate-y-0 border-y-0 border-r-0'
            : 'max-h-[90dvh] w-[calc(100vw-1rem)] sm:max-w-xl md:top-1/2 md:!-translate-x-1/2 md:!-translate-y-1/2',
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
          <DialogHeader className={cn('relative space-y-1 text-left', !agentMode && 'pr-10')}>
            <DialogTitle className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-white sm:text-lg">
              <span className="flex h-8 w-8 items-center justify-center border border-amber-400/40 bg-amber-400/15">
                <Sparkles size={16} className="text-amber-200" />
              </span>
              <span className="min-w-0 truncate">
                {agentMode ? 'QE Assistant' : assistantDialogTitle(activeRecordTable, effectiveIsCodeId, page)}
              </span>
              {agentMode && !minimized ? (
                <span className="hidden shrink-0 items-center gap-1 border border-emerald-400/50 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200 sm:inline-flex">
                  <ShieldCheck size={12} aria-hidden /> Admin Agent
                </span>
              ) : null}
              {agentMode ? (
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={cn(headerToolClass(agentView === 'notifications'), 'relative')}
                    title="Notifications"
                    aria-label={`Notifications (${notices.length})`}
                    onClick={() => {
                      if (minimized) {
                        setMinimized(false)
                        setAgentView('notifications')
                      } else openAgentView('notifications')
                    }}
                  >
                    <Bell size={14} aria-hidden />
                    {notices.length > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-0.5 text-[9px] font-bold text-white" aria-hidden>
                        {notices.length > 99 ? '99+' : notices.length}
                      </span>
                    ) : null}
                  </button>
                  {minimized ? null : (
                  <>
                  <button type="button" className={headerToolClass(agentView === 'history')} title="Saved Chats" aria-label="Saved Chats" disabled={loading} onClick={() => openAgentView('history')}>
                    <History size={14} aria-hidden />
                  </button>
                  <button type="button" className={headerToolClass(agentView === 'memory')} title="Memory" aria-label="Memory" disabled={loading} onClick={() => openAgentView('memory')}>
                    <Brain size={14} aria-hidden />
                  </button>
                  <button type="button" className={cn(headerToolClass(agentView === 'tasks'), 'relative')} title="Scheduled Tasks" aria-label="Scheduled Tasks" disabled={loading} onClick={() => openAgentView('tasks')}>
                    <CalendarClock size={14} aria-hidden />
                    {notices.some((n) => n.runId) ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden /> : null}
                  </button>
                  <button type="button" className={headerToolClass(agentView === 'connectors')} title="Connectors (Mail)" aria-label="Connectors" disabled={loading} onClick={() => openAgentView('connectors')}>
                    <Plug size={14} aria-hidden />
                  </button>
                  <button type="button" className={headerToolClass(false)} title="New Chat" aria-label="New Chat" disabled={loading} onClick={() => resetChat()}>
                    <RotateCcw size={14} aria-hidden />
                  </button>
                  <span className="mx-0.5 h-5 w-px bg-amber-500/30" aria-hidden />
                  </>
                  )}
                  <button
                    type="button"
                    className={headerToolClass(false)}
                    title={minimized ? 'Restore' : 'Minimize'}
                    aria-label={minimized ? 'Restore QE Assistant' : 'Minimize QE Assistant'}
                    onClick={() => setMinimized((m) => !m)}
                  >
                    {minimized ? <Maximize2 size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center border border-red-700 bg-red-600 text-white hover:bg-red-700"
                    title="Close"
                    aria-label="Close QE Assistant"
                    onClick={() => setOpen(false)}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          ref={scrollRef}
          className={cn(
            'relative flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-[#f7f3eb] to-[#fffcf7] px-4 py-3 sm:px-5',
            agentMode && minimized && 'hidden',
            agentMode ? 'min-h-0' : 'min-h-[220px] max-h-[42dvh]',
          )}
        >
          {agentMode && agentView !== 'chat' ? (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">
                {agentView === 'history'
                  ? 'Saved Chats'
                  : agentView === 'tasks'
                    ? 'Scheduled Tasks'
                    : agentView === 'connectors'
                      ? 'Connectors'
                      : agentView === 'notifications'
                        ? 'Notifications'
                        : 'Memory — Facts and Standing Instructions'}
              </p>
              {agentView === 'connectors' ? (
                <MailConnectorPanel />
              ) : agentView === 'notifications' ? (
                <QiNoticesPanel notices={notices} busy={loading} onAct={actOnNotice} onDismiss={dismissNotice} onClearAll={clearAllNotices} />
              ) : viewLoading ? (
                <p className="flex items-center gap-2 text-sm text-stone-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>
              ) : agentView === 'tasks' ? (
                <div className="space-y-3">
                  {tasks.length ? (
                    tasks.map((t) => (
                      <div key={t.id} className={cn('border bg-white px-2.5 py-2', t.enabled ? 'border-stone-300' : 'border-stone-200 opacity-70')}>
                        <div className="flex items-start gap-2">
                          <CalendarClock size={14} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-stone-800" title={t.instruction}>{t.title}</p>
                            <p className="text-[11px] text-stone-500">
                              {describeSchedule(t)} · {t.enabled ? `Next ${formatIst(t.next_run_at)}` : 'Paused'}
                              {t.last_status ? ` · Last ${t.last_status === 'ok' ? 'Done' : t.last_status === 'error' ? 'Failed' : 'Running'}` : ''}
                              {t.notify_email ? ' · Emailed' : ''}
                            </p>
                          </div>
                          <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-stone-500 hover:bg-amber-50 hover:text-amber-800" title="Run Now (Within a Minute)" aria-label={`Run ${t.title} Now`} onClick={() => updateTask(t, 'run')}>
                            <Zap size={13} />
                          </button>
                          <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-stone-500 hover:bg-amber-50 hover:text-amber-800" title={t.enabled ? 'Pause' : 'Resume'} aria-label={t.enabled ? `Pause ${t.title}` : `Resume ${t.title}`} onClick={() => updateTask(t, t.enabled ? 'pause' : 'resume')}>
                            {t.enabled ? <Pause size={13} /> : <Play size={13} />}
                          </button>
                          <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-stone-400 hover:bg-red-50 hover:text-red-700" title="Delete Task" aria-label={`Delete ${t.title}`} onClick={() => updateTask(t, 'delete')}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-stone-500">No Scheduled Tasks. Tell Me in the Chat, e.g. “Every Morning at 9, List the Licences Due This Week”.</p>
                  )}
                  {runs.length ? (
                    <>
                      <p className="pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">Recent Results</p>
                      {runs.map((r) => (
                        <div key={r.id} className={cn('border bg-white px-3 py-2 text-sm', r.status === 'error' ? 'border-red-300' : 'border-stone-300')}>
                          <p className="mb-1 flex items-center gap-2 text-[11px] text-stone-500">
                            <span className="font-semibold text-stone-700">{tasks.find((t) => t.id === r.task_id)?.title ?? 'Task'}</span>
                            <span>{formatIst(r.started_at)}</span>
                            <span className={cn('ml-auto border px-1 text-[9px] font-bold uppercase', r.status === 'ok' ? 'border-emerald-600 text-emerald-700' : r.status === 'error' ? 'border-red-600 text-red-700' : 'border-stone-400 text-stone-500')}>
                              {r.status === 'ok' ? 'Done' : r.status === 'error' ? 'Failed' : 'Running'}
                            </span>
                          </p>
                          {r.output ? <AssistantMessage content={r.output} /> : null}
                          {r.agent ? (
                            <>
                              <AgentSteps steps={r.agent.steps} />
                              <AgentProposals
                                proposals={r.agent.proposals}
                                done={r.agent.applied}
                                onSaved={(key, line) => recordRunChange(r, key, line)}
                                onApplied={() => {
                                  void queryClient.invalidateQueries()
                                  onDataChanged?.()
                                }}
                              />
                            </>
                          ) : null}
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : agentView === 'history' ? (
                conversations.length ? (
                  conversations.map((c) => (
                    <div key={c.id} className={cn('flex items-center gap-2 border bg-white px-2.5 py-2', c.id === activeChatId ? 'border-amber-600' : 'border-stone-300')}>
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => openConversation(c.id)}>
                        <MessageSquare size={14} className="shrink-0 text-amber-700" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{c.title}</span>
                        <span className="shrink-0 text-[10px] text-stone-400">{new Date(c.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-stone-400 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Delete Chat ${c.title}`}
                        title="Delete Chat"
                        onClick={() => {
                          void deleteConversation(c.id)
                            .then(() => {
                              setConversations((prev) => prev.filter((x) => x.id !== c.id))
                              if (conversationIdRef.current === c.id) resetChat()
                            })
                            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could Not Delete.'))
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-500">No Saved Chats Yet.</p>
                )
              ) : memories.length ? (
                memories.map((m) => (
                  <div key={m.id} className="flex items-start gap-2 border border-stone-300 bg-white px-2.5 py-2">
                    <span className={cn('mt-0.5 shrink-0 border px-1 text-[9px] font-bold uppercase', m.kind === 'instruction' ? 'border-amber-600 text-amber-800' : 'border-stone-400 text-stone-600')}>
                      {m.kind === 'instruction' ? 'Rule' : 'Fact'}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-sm text-stone-800">{m.content}</span>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-stone-400 hover:bg-red-50 hover:text-red-700"
                      aria-label="Forget This"
                      title="Forget This"
                      onClick={() => {
                        void deleteMemory(m.id)
                          .then(() => setMemories((prev) => prev.filter((x) => x.id !== m.id)))
                          .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could Not Delete.'))
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-stone-500">Nothing Saved Yet. Tell Me “Remember …” in the Chat.</p>
              )}
            </div>
          ) : null}
          {(!agentMode || agentView === 'chat') && messages.map((m, index) => (
            <ChatMessageRow key={m.id} message={m} handlers={messageActions(m, index)}>
              {m.agent ? (
                <>
                  <AgentSteps steps={m.agent.steps} />
                  <AgentProposals proposals={m.agent.proposals} onApplied={handleAgentApplied} readOnly={m.fromHistory} />
                </>
              ) : null}
            </ChatMessageRow>
          ))}
          {!agentMode || agentView === 'chat' ? <SelectionPopup containerRef={scrollRef} handlers={sharedActions} /> : null}
          {loading && (
            <div className="mr-auto flex max-w-[92%] items-center gap-2 border border-stone-400 bg-white px-3.5 py-2.5 text-sm text-stone-600">
              <Loader2 size={14} className="animate-spin text-amber-700" />
              {busyHint ?? 'Working…'}
            </div>
          )}
        </div>


        {error && !(agentMode && minimized) && (
          <p className="border-t border-red-300 bg-red-50 px-4 py-2 text-xs text-red-700 sm:px-5">{error}</p>
        )}

        <div className={cn('relative border-t-2 border-stone-500 bg-[#fffcf7]', agentMode && minimized && 'hidden')}>
          {skillPickerOpen && (
            <div
              className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-48 overflow-y-auto border-2 border-stone-600 bg-white shadow-xl ring-1 ring-amber-700/25"
              role="listbox"
              aria-label="Select AI Skill"
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
              aria-label="Attach a File"
            >
              <div className="border-b border-stone-500 bg-stone-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Attach · type @ to pick from computer
              </div>
              {filteredAttachOptions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-stone-500">No Attach Options Match.</p>
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
                    aria-label="Clear Selected IS Code"
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
                    aria-label="Clear Selected Skill"
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
                    aria-label="Remove Attached PDF"
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
                    aria-label="Remove Attached Image"
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

          <div className="space-y-2 p-3 sm:p-4">
            <input
              ref={filesInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addAttachments(e.target.files)
                e.target.value = ''
              }}
            />
            <input
              ref={(el) => {
                folderInputRef.current = el
                // Folder picking is not in React's input typings.
                el?.setAttribute('webkitdirectory', '')
                el?.setAttribute('directory', '')
              }}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addAttachments(e.target.files)
                e.target.value = ''
              }}
            />
            {listening ? (
              <div className="flex items-center gap-2 border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700" role="status">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
                </span>
                Listening — Speak Now ({voiceLang === 'hi-IN' ? 'Hindi' : 'English'}). Tap the Mic to Stop.
              </div>
            ) : null}
            <div
              className={cn(
                'border-2 bg-white shadow-sm transition-colors focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-500/20',
                listening ? 'border-red-400' : 'border-stone-400',
              )}
            >
              {replyQuote ? <ReplyQuoteBar quote={replyQuote} onClear={() => setReplyQuote(null)} /> : null}
              {attachments.length ? (
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto border-b border-stone-200 p-2">
                  {attachments.map((a) => (
                    <span key={a.id} className="inline-flex max-w-[14rem] items-center gap-1 border border-stone-300 bg-stone-50 py-0.5 pl-1.5 pr-0.5 text-[11px] text-stone-700" title={a.path}>
                      {a.kind === 'image' ? <ImagePlus size={12} className="shrink-0 text-amber-700" aria-hidden /> : <FileText size={12} className="shrink-0 text-amber-700" aria-hidden />}
                      <span className="truncate">{a.path}</span>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-stone-500 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Remove ${a.path}`}
                        onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
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
                      ? 'Type command for attached PDF, then Send…'
                      : showIsCodePicker
                        ? 'Select IS Code, then ask…'
                        : listening
                          ? 'Listening…'
                          : 'Ask Anything, or Tell Me What to Do…'
                }
                className="min-h-[3.25rem] max-h-40 w-full resize-none rounded-none border-0 bg-transparent px-3 py-2.5 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                rows={2}
                onKeyDown={handleInputKeyDown}
                disabled={loading}
                aria-label="Message to QE Assistant"
                aria-expanded={skillPickerOpen || attachPickerOpen}
                aria-autocomplete="list"
              />
              <div className="flex items-center gap-1.5 border-t border-stone-200 bg-stone-50/70 px-2 py-1.5">
                <div className="relative">
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center border text-amber-800 transition-colors',
                      plusOpen ? 'border-amber-600 bg-amber-100' : 'border-stone-400 bg-white hover:bg-amber-50',
                    )}
                    aria-label="Attach Files or a Folder"
                    title="Attach Files or a Folder From the Computer"
                    disabled={loading}
                    onClick={() => setPlusOpen((v) => !v)}
                  >
                    <Plus size={16} />
                  </button>
                  {plusOpen ? (
                    <div className="absolute bottom-full left-0 z-20 mb-1 w-52 border-2 border-stone-600 bg-white py-1 shadow-xl" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-800 hover:bg-amber-50"
                        onClick={() => filesInputRef.current?.click()}
                      >
                        <Paperclip size={15} className="text-amber-700" aria-hidden /> Attach Files
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-800 hover:bg-amber-50"
                        onClick={() => folderInputRef.current?.click()}
                      >
                        <FolderUp size={15} className="text-amber-700" aria-hidden /> Attach Folder
                      </button>
                    </div>
                  ) : null}
                </div>
                {voiceSupported ? (
                  <>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex h-8 w-8 items-center justify-center border transition-colors',
                        listening
                          ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
                          : 'border-stone-400 bg-white text-stone-700 hover:bg-amber-50 hover:text-amber-900',
                      )}
                      aria-label={listening ? 'Stop Voice Typing' : 'Start Voice Typing'}
                      title={listening ? 'Stop Listening' : 'Voice Typing'}
                      disabled={loading}
                      onClick={toggleListening}
                    >
                      {listening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center border border-stone-400 bg-white px-2 text-[11px] font-bold text-stone-700 hover:bg-amber-50"
                      title="Voice Typing Language — Click to Switch"
                      aria-label={`Voice Typing Language: ${voiceLang === 'hi-IN' ? 'Hindi' : 'English'}`}
                      disabled={loading}
                      onClick={switchVoiceLang}
                    >
                      {voiceLang === 'hi-IN' ? 'हिंदी' : 'EN'}
                    </button>
                  </>
                ) : null}
                <span className="ml-auto truncate text-[10px] text-stone-400">
                  {attachments.length ? `${attachments.length} File${attachments.length === 1 ? '' : 's'}` : ''}
                </span>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 bg-amber-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-800 disabled:opacity-40"
                  aria-label="Send Message"
                  disabled={loading || !canSend}
                  onClick={() => void sendMessage(input)}
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
