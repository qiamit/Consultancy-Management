import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  sendQiAssistantMessage,
  type QiAssistantActionResult,
  type QiChatMessage,
} from './qiAssistantApi'
import { cn } from '@/lib/utils'

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export type QiAssistantSendContext = {
  context: string
  isCodeId?: string
  /** Disables IS notebook-only mode when reviewing samples/test reports */
  activeRecordId?: string
  activeRecordTable?: string
  /** Shown in chat instead of raw user text when set */
  displayMessage?: string
  error?: string
}

export function QiAssistantChatPanel({
  page,
  contextSummary,
  welcomeMessage = '',
  suggestedQuestions = [],
  placeholder = 'Ask QI Assistant…',
  staticIsCodeId,
  staticActiveRecordId,
  staticActiveRecordTable,
  resetKey = 0,
  resolveContextOnSend,
  prepareMessage,
  primaryAction,
  onAssistantReply,
}: {
  page: string
  contextSummary: string
  welcomeMessage?: string
  suggestedQuestions?: string[]
  placeholder?: string
  staticIsCodeId?: string
  staticActiveRecordId?: string
  staticActiveRecordTable?: string
  /** Change to reset conversation when dialog reopens */
  resetKey?: number
  resolveContextOnSend?: (message: string) => Promise<QiAssistantSendContext>
  /** Transform user text before sending to the API (display text unchanged). */
  prepareMessage?: (text: string) => string
  /** Optional prominent action (e.g. Full Review). */
  primaryAction?: { label: string; message: string }
  /** Called after a successful assistant reply (before chat append). */
  onAssistantReply?: (reply: string) => void
}) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<QiChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const prompts = suggestedQuestions.length > 0 ? suggestedQuestions : []

  useEffect(() => {
    const intro = welcomeMessage.trim()
    setMessages(intro ? [{ id: newId(), role: 'assistant', content: intro }] : [])
    setInput('')
    setError(null)
  }, [resetKey, welcomeMessage])

  const appendAssistantResult = (reply: string, actionsExecuted?: QiAssistantActionResult[]) => {
    let content = reply
    if (actionsExecuted?.length) {
      const lines = actionsExecuted.map(
        (a) => `${a.ok ? '✓' : '✗'} ${a.operation} **${a.table}**${a.id ? ` \`${a.id}\`` : ''}: ${a.message}`,
      )
      content = `${reply}\n\n**Database changes:**\n${lines.join('\n')}`
    }
    setMessages((prev) => [...prev, { id: newId(), role: 'assistant', content }])
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return

      setError(null)
      setInput('')

      let effectiveContext = contextSummary
      let isCodeId = staticIsCodeId
      let activeRecordId = staticActiveRecordId
      let activeRecordTable = staticActiveRecordTable
      let userDisplay = trimmed

      if (resolveContextOnSend) {
        try {
          const resolved = await resolveContextOnSend(trimmed)
          if (resolved.error) {
            setError(resolved.error)
            return
          }
          effectiveContext = resolved.context
          if (resolved.isCodeId) isCodeId = resolved.isCodeId
          if (resolved.activeRecordId) activeRecordId = resolved.activeRecordId
          if (resolved.activeRecordTable) activeRecordTable = resolved.activeRecordTable
          if (resolved.displayMessage) userDisplay = resolved.displayMessage
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not prepare section context')
          return
        }
      }

      const apiMessage = prepareMessage?.(trimmed) ?? trimmed
      const userMsg: QiChatMessage = { id: newId(), role: 'user', content: userDisplay }
      setMessages((prev) => [...prev, userMsg])
      setLoading(true)

      try {
        const history = [...messages, userMsg]
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }))

        const { reply, actionsExecuted } = await sendQiAssistantMessage({
          page,
          message: apiMessage,
          context: effectiveContext,
          isCodeId,
          activeRecordId,
          activeRecordTable,
          history,
        })

        onAssistantReply?.(reply)
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
    [
      contextSummary,
      loading,
      messages,
      onAssistantReply,
      page,
      resolveContextOnSend,
      staticActiveRecordId,
      staticActiveRecordTable,
      staticIsCodeId,
      prepareMessage,
    ],
  )

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  const loadingLabel = useMemo(() => {
    if (resolveContextOnSend && loading) return 'Loading section data and IS PDFs…'
    if (staticIsCodeId) return 'Reading IS PDFs and thinking…'
    return 'Working…'
  }, [loading, resolveContextOnSend, staticIsCodeId])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {primaryAction ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => void sendMessage(primaryAction.message)}
          >
            {primaryAction.label}
          </Button>
        </div>
      ) : null}
      <div ref={scrollRef} className="min-h-[240px] max-h-[45vh] flex-1 space-y-3 overflow-y-auto px-1 py-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'rounded-lg px-3 py-2 text-sm leading-relaxed',
              m.role === 'user' ? 'ml-8 bg-primary text-primary-foreground' : 'mr-4 bg-muted text-foreground',
            )}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {loading && (
          <div className="mr-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            {loadingLabel}
          </div>
        )}
      </div>

      {messages.length <= 1 && prompts.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border py-3">
          {prompts.map((q) => (
            <button
              key={q}
              type="button"
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => void sendMessage(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive pb-2">{error}</p>}

      <div className="flex gap-2 border-t border-border pt-3">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="min-h-[44px] max-h-28 resize-none"
          rows={1}
          onKeyDown={handleInputKeyDown}
          disabled={loading}
          aria-label="Message to QI Assistant"
        />
        <Button
          type="button"
          size="icon"
          className="shrink-0 self-end"
          aria-label="Send message"
          disabled={loading || !input.trim()}
          onClick={() => void sendMessage(input)}
        >
          <Send size={18} />
        </Button>
      </div>
    </div>
  )
}
