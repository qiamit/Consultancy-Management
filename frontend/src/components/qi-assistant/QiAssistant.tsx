import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, Loader2, Send, Sparkles, X } from 'lucide-react'
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
  validateAssistantPdfFile,
  type QiAssistantActionResult,
  type QiChatMessage,
} from './qiAssistantApi'
import {
  filterSkillsForTrigger,
  parseSkillTrigger,
  type AiSkillPick,
  type SkillTriggerMatch,
} from './skillTrigger'
import { cn } from '@/lib/utils'

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function assistantDialogTitle(activeRecordTable?: string, isCodeId?: string, page?: string): string {
  if (page === 'samples/receiving') return 'Sample Receiving Assistant'
  if (page === 'nabl-scope') return 'NABL Scope Assistant'
  if (page === 'calibration-nabl-scope') return 'Calibration NABL Scope Assistant'
  if (page === 'equipment-breakdown-register') return 'Equipment Breakdown Register Assistant'
  if (activeRecordTable === 'test_parameters') return 'Test Parameter Assistant'
  if (activeRecordTable === 'is_codes' || isCodeId) return 'IS Code Assistant'
  return 'QI Assistant'
}

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
  pdfAttachHint = 'IS standard PDF',
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
  /** Label for PDF attach button, e.g. "test request PDF" */
  pdfAttachHint?: string
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
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [skillHighlight, setSkillHighlight] = useState(0)
  const [caretPos, setCaretPos] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const skillTrigger = useMemo(
    () => (skillPickerOpen ? parseSkillTrigger(input, caretPos) : null),
    [skillPickerOpen, input, caretPos],
  )

  const filteredSkills = useMemo(() => {
    if (!skillTrigger) return skills
    return filterSkillsForTrigger(skills, skillTrigger.filter)
  }, [skills, skillTrigger])

  const defaults = [
    'How do I add a new client?',
    'What does balance type Dr and Cr mean?',
    'Summarize the clients shown in the list',
  ]

  const prompts = suggestedQuestions ?? defaults

  const showIsCodePicker = Boolean(isCodeOptions?.length) && !isCodeId
  const effectiveIsCodeId = isCodeId ?? (selectedIsCodeId || undefined)
  const selectedIsCodeLabel = isCodeOptions?.find((o) => o.id === selectedIsCodeId)?.label

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
      setSkillPickerOpen(false)
      setInput('')
      return
    }
    if (messages.length > 0) return
    const pdfNote = enablePdfImport
      ? ' Use the **PDF** button to attach a file, then type your command and press **Send** (nothing runs until you send).'
      : ''
    const crudNote = agentCrudEnabled
      ? ' I can **create, update, and delete** records in this module when you ask.'
      : ''
    const isCodeNote = showIsCodePicker
      ? ' Pick an **IS Code** below so I can read its uploaded PDFs.'
      : ''
    const skillNote = ' Tap **!** or type **!** in the box to pick a **Skill** for your next message.'
    const intro =
      welcomeMessage !== undefined
        ? welcomeMessage
        : `Hello! I'm **QI Assistant** on **${pageTitle}**. Ask me about this screen or the data shown here.${crudNote}${pdfNote}${isCodeNote}${skillNote}`
    if (intro.trim()) {
      setMessages([{ id: newId(), role: 'assistant', content: intro }])
    }
  }, [open, messages.length, pageTitle, welcomeMessage, agentCrudEnabled, enablePdfImport, showIsCodePicker])

  const openSkillPicker = () => {
    const next = input.includes('!') ? input : `${input}${input && !input.endsWith(' ') ? ' ' : ''}!`
    setInput(next)
    const pos = next.length
    setCaretPos(pos)
    setSkillPickerOpen(true)
    setSkillHighlight(0)
    requestAnimationFrame(() => textareaRef.current?.focus())
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

  const syncSkillPicker = (text: string, pos: number) => {
    setCaretPos(pos)
    const trigger = parseSkillTrigger(text, pos)
    setSkillPickerOpen(Boolean(trigger))
    if (trigger) setSkillHighlight(0)
  }

  const applySkillSelection = (skill: AiSkillPick, trigger: SkillTriggerMatch | null) => {
    setSelectedSkill(skill)
    setSkillPickerOpen(false)
    if (trigger) {
      const before = input.slice(0, trigger.start)
      const after = input.slice(trigger.end)
      const next = `${before}${after}`.replace(/^\s+/, '')
      setInput(next)
    }
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handlePdfAttach = (file: File) => {
    try {
      validateAssistantPdfFile(file)
      setAttachedPdf(file)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PDF')
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
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

      setError(null)
      setInput('')
      setSkillPickerOpen(false)

      const skillTag = selectedSkill ? `[Skill: ${selectedSkill.name}] ` : ''
      const pdfTag = attachedPdf ? `📎 Attached: ${attachedPdf.name}\n\n` : ''
      const userMsg: QiChatMessage = {
        id: newId(),
        role: 'user',
        content: `${skillTag}${pdfTag}${trimmed}`,
      }
      const skillId = selectedSkill?.id
      const pdfFile = attachedPdf
      setSelectedSkill(null)
      setAttachedPdf(null)

      setMessages((prev) => [...prev, userMsg])
      setLoading(true)

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
      }
    },
    [activeRecordId, activeRecordTable, attachedPdf, contextSummary, effectiveIsCodeId, loading, messages, page, selectedSkill],
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

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  if (!showAssistant) return null

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
            aria-label={`Ask AI Assistant about ${pageTitle}`}
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
            aria-label="Open QI Assistant"
          >
            <Sparkles size={16} className="text-primary" />
            QI Assistant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          'flex max-h-[88vh] w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:max-w-xl sm:rounded-lg',
          'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          '[&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100',
        )}
      >
        <div className="relative bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-4 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
            }}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative space-y-1.5 pr-8 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-none bg-amber-400/20 ring-1 ring-amber-400/30">
                <Sparkles size={16} className="text-amber-200" />
              </span>
              {assistantDialogTitle(activeRecordTable, effectiveIsCodeId, page)}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          ref={scrollRef}
          className="min-h-[260px] max-h-[46vh] flex-1 space-y-3 overflow-y-auto bg-[#fafbfc] px-5 py-4"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'max-w-[92%] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                m.role === 'user'
                  ? 'ml-auto rounded-2xl rounded-br-md bg-teal-600 text-white'
                  : 'mr-auto rounded-2xl rounded-bl-md border border-slate-200 bg-white text-slate-800',
              )}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
          {loading && (
            <div className="mr-auto flex max-w-[92%] items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin text-teal-600" />
              {effectiveIsCodeId && page !== 'samples/receiving'
                ? 'Reading IS PDFs and thinking…'
                : attachedPdf
                  ? 'Reading test request and thinking…'
                  : 'Working…'}
            </div>
          )}
        </div>

        {messages.length <= 1 && prompts.length > 0 && (
          <div className="space-y-2 border-t border-slate-200 bg-white px-5 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Try asking</p>
            <div className="flex flex-col gap-1.5">
              {prompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-md border border-slate-200 bg-[#fafbfc] px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:border-teal-500/40 hover:bg-teal-50/60 hover:text-teal-900"
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
          <p className="border-t border-destructive/20 bg-destructive/5 px-5 py-2 text-xs text-destructive">{error}</p>
        )}

        <div className="relative border-t border-slate-200 bg-white">
          {skillPickerOpen && (
            <div
              className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
              role="listbox"
              aria-label="Select AI skill"
            >
              {filteredSkills.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
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
                      'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors',
                      idx === skillHighlight ? 'bg-teal-50 text-teal-950' : 'hover:bg-slate-50',
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
                    <span className="font-medium">{skill.name}</span>
                    {skill.description && (
                      <span className="line-clamp-1 text-xs text-muted-foreground">{skill.description}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {(selectedSkill || attachedPdf || (showIsCodePicker && selectedIsCodeId)) && (
            <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
              {showIsCodePicker && selectedIsCodeId && selectedIsCodeLabel && (
                <Badge variant="outline" className="max-w-full gap-1 border-slate-300 pr-1 font-normal">
                  <span className="truncate">IS: {selectedIsCodeLabel}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-0.5 hover:bg-muted"
                    aria-label="Clear selected IS code"
                    onClick={() => {
                      setSelectedIsCodeId('')
                    }}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {selectedSkill && (
                <Badge className="gap-1 bg-teal-100 pr-1 font-normal text-teal-900 hover:bg-teal-100">
                  Skill: {selectedSkill.name}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-teal-200/60"
                    aria-label="Clear selected skill"
                    onClick={() => setSelectedSkill(null)}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {attachedPdf && (
                <Badge variant="outline" className="gap-1 border-slate-300 pr-1 font-normal">
                  PDF: {attachedPdf.name}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted"
                    aria-label="Remove attached PDF"
                    onClick={() => setAttachedPdf(null)}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              <span className="w-full text-xs text-slate-500 sm:w-auto">
                {attachedPdf ? 'Type a command below, then Send' : 'Active for next message'}
              </span>
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

          <div className="flex items-end gap-2 p-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 border-slate-300 font-semibold text-teal-700 hover:bg-teal-50 hover:text-teal-900"
              aria-label="Pick AI skill"
              disabled={loading}
              title="Pick skill (!)"
              onClick={openSkillPicker}
            >
              !
            </Button>
            {enablePdfImport && (
              <>
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
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 border-slate-300"
                  aria-label={`Upload ${pdfAttachHint} to process with AI`}
                  disabled={loading}
                  title={`Attach ${pdfAttachHint} — then type a command and Send`}
                  onClick={() => pdfInputRef.current?.click()}
                >
                  <FileUp size={18} />
                </Button>
              </>
            )}
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                syncSkillPicker(e.target.value, e.target.selectionStart ?? e.target.value.length)
              }}
              onClick={(e) => syncSkillPicker(input, e.currentTarget.selectionStart ?? input.length)}
              onKeyUp={(e) => syncSkillPicker(input, e.currentTarget.selectionStart ?? input.length)}
              placeholder={
                attachedPdf
                  ? page === 'samples/receiving'
                    ? 'e.g. Register this test request as a new sample…'
                    : 'Type command for attached PDF, then Send…'
                  : showIsCodePicker
                    ? 'Select IS Code, pick ! skill, ask to import test parameters…'
                    : page === 'samples/receiving'
                      ? 'Attach Test Request PDF, then ask to add sample…'
                      : 'Ask QI Assistant… (type ! for skills)'
              }
              className="min-h-10 max-h-28 flex-1 resize-none rounded-md border-slate-300 bg-[#fafbfc] shadow-none focus-visible:border-teal-600 focus-visible:ring-teal-600/20"
              rows={1}
              onKeyDown={handleInputKeyDown}
              disabled={loading}
              aria-label="Message to QI Assistant"
              aria-expanded={skillPickerOpen}
              aria-autocomplete="list"
            />
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 shrink-0 bg-teal-600 text-white hover:bg-teal-500"
              aria-label="Send message"
              disabled={loading || !input.trim()}
              onClick={() => void sendMessage(input)}
            >
              <Send size={18} />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
