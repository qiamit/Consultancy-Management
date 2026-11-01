import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Brain, Check, Copy, CornerUpLeft, HelpCircle, Mail, MoreHorizontal, Pencil, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const POPUP_WIDTH_PX = 300
const POPUP_HEIGHT_PX = 36
const COPIED_MS = 1500

/** Copies with formatting where the browser allows it, so tables paste as tables in Word and Excel. */
async function copyToClipboard(text: string, html?: string): Promise<boolean> {
  try {
    if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ])
      return true
    }
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
}

const actionClass =
  'inline-flex h-6 items-center gap-1 border border-transparent px-1.5 text-[11px] font-semibold text-stone-600 hover:border-stone-300 hover:bg-white hover:text-amber-800 disabled:opacity-40'

function ActionButton({ icon, label, onClick, disabled, className }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      className={cn(actionClass, className)}
      disabled={disabled}
      // Keeps the text selection while the button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

/** Copies and shows the result on the button for a moment. */
function useCopy(): { label: string; icon: ReactNode; copy: (text: string, html?: string) => void } {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return {
    label: state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy Failed' : 'Copy',
    icon: state === 'copied' ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />,
    copy: (text, html) => {
      void copyToClipboard(text, html).then((ok) => {
        setState(ok ? 'copied' : 'failed')
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setState('idle'), COPIED_MS)
      })
    },
  }
}

export type ChatActionHandlers = {
  onReply: (quote: string) => void
  /** Sends a question about the quoted text straight away. */
  onExplain: (quote: string) => void
  /** Agent chats only: keeps the text in the assistant's memory. */
  onRemember?: (text: string) => Promise<void>
  /** Agent chats only: starts an email with the text. */
  onEmail?: (quote: string) => void
  /** Assistant message: repeat the question that led to it. */
  onAskAgain?: () => void
  /** Own message: put it back in the box to change it. */
  onEdit?: () => void
  /** Own message: send it again as it is. */
  onSendAgain?: () => void
  busy?: boolean
}

function RememberButton({ text, onRemember, busy }: { text: () => string; onRemember: (text: string) => Promise<void>; busy?: boolean }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  return (
    <ActionButton
      icon={state === 'saved' ? <Check size={12} aria-hidden /> : <Brain size={12} aria-hidden />}
      label={state === 'saved' ? 'Remembered' : state === 'failed' ? 'Not Saved' : 'Remember'}
      disabled={busy || state === 'saving' || state === 'saved'}
      onClick={() => {
        setState('saving')
        onRemember(text())
          .then(() => setState('saved'))
          .catch(() => setState('failed'))
      }}
    />
  )
}

/** Reply, Copy and More under one message. The text comes from what is on screen (no Markdown marks). */
export function MessageActions({ role, handlers, bodyRef }: { role: 'user' | 'assistant'; handlers: ChatActionHandlers; bodyRef: RefObject<HTMLDivElement | null> }) {
  const [more, setMore] = useState(false)
  const copier = useCopy()
  const shownText = () => bodyRef.current?.innerText.trim() ?? ''
  return (
    <div
      className={cn(
        'mt-0.5 flex flex-wrap items-center gap-0.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-within:opacity-100 [@media(hover:hover)]:group-hover/message:opacity-100',
        more && '[@media(hover:hover)]:opacity-100',
        role === 'user' && 'justify-end',
      )}
    >
      <ActionButton icon={<CornerUpLeft size={12} aria-hidden />} label="Reply" disabled={handlers.busy} onClick={() => handlers.onReply(shownText())} />
      <ActionButton icon={copier.icon} label={copier.label} onClick={() => copier.copy(shownText(), bodyRef.current?.innerHTML)} />
      <ActionButton icon={<MoreHorizontal size={12} aria-hidden />} label="More" onClick={() => setMore((v) => !v)} />
      {more ? (
        <>
          {handlers.onAskAgain ? <ActionButton icon={<RotateCcw size={12} aria-hidden />} label="Ask Again" disabled={handlers.busy} onClick={handlers.onAskAgain} /> : null}
          {handlers.onEdit ? <ActionButton icon={<Pencil size={12} aria-hidden />} label="Edit" disabled={handlers.busy} onClick={handlers.onEdit} /> : null}
          {handlers.onSendAgain ? <ActionButton icon={<RotateCcw size={12} aria-hidden />} label="Send Again" disabled={handlers.busy} onClick={handlers.onSendAgain} /> : null}
          {role === 'assistant' ? <ActionButton icon={<HelpCircle size={12} aria-hidden />} label="Explain" disabled={handlers.busy} onClick={() => handlers.onExplain(shownText())} /> : null}
          {handlers.onRemember ? <RememberButton text={shownText} onRemember={handlers.onRemember} busy={handlers.busy} /> : null}
          {handlers.onEmail ? <ActionButton icon={<Mail size={12} aria-hidden />} label="Prepare Email" disabled={handlers.busy} onClick={() => handlers.onEmail?.(shownText())} /> : null}
        </>
      ) : null}
    </div>
  )
}

type ChatSelection = { text: string; html: string; top: number; left: number }

/** Text selected inside a chat message, with where to show the popup (in the scrolling chat's own coordinates). */
function useChatSelection(containerRef: RefObject<HTMLDivElement | null>): [ChatSelection | null, () => void] {
  const [selection, setSelection] = useState<ChatSelection | null>(null)
  useEffect(() => {
    let pressed = false
    const read = () => {
      if (pressed) return
      const container = containerRef.current
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      if (!container || !sel || sel.isCollapsed || !text || !sel.rangeCount) {
        setSelection(null)
        return
      }
      const start = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
      if (!start || !container.contains(start) || !start.closest('[data-chat-body]')) {
        setSelection(null)
        return
      }
      const range = sel.getRangeAt(0)
      const box = range.getBoundingClientRect()
      const outer = container.getBoundingClientRect()
      const holder = document.createElement('div')
      holder.appendChild(range.cloneContents())
      const left = Math.min(
        Math.max(4, box.left - outer.left + box.width / 2 - POPUP_WIDTH_PX / 2),
        Math.max(4, container.clientWidth - POPUP_WIDTH_PX - 4),
      )
      const above = box.top - outer.top - POPUP_HEIGHT_PX - 6
      // No room above the selection: show it below.
      const top = (above >= 0 ? above : box.bottom - outer.top + 6) + container.scrollTop
      setSelection({ text, html: holder.innerHTML, top, left })
    }
    let timer: number | undefined
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(read, 150)
    }
    const down = () => {
      pressed = true
    }
    const up = () => {
      pressed = false
      later()
    }
    document.addEventListener('selectionchange', later)
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('selectionchange', later)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerup', up, true)
    }
  }, [containerRef])
  return [selection, () => setSelection(null)]
}

/** The popup over text selected in the chat. Render it inside the scrolling chat, which must be `relative`. */
export function SelectionPopup({ containerRef, handlers }: { containerRef: RefObject<HTMLDivElement | null>; handlers: ChatActionHandlers }) {
  const [selection, clear] = useChatSelection(containerRef)
  const copier = useCopy()
  if (!selection) return null
  const finish = (run: () => void) => {
    run()
    window.getSelection()?.removeAllRanges()
    clear()
  }
  return (
    <div
      role="toolbar"
      aria-label="Selected Text"
      className="absolute z-20 flex items-center gap-0.5 border-2 border-stone-700 bg-[#fffcf7] px-1 py-0.5 shadow-lg"
      style={{ top: selection.top, left: selection.left }}
    >
      <ActionButton icon={<CornerUpLeft size={12} aria-hidden />} label="Reply" disabled={handlers.busy} className="text-amber-800" onClick={() => finish(() => handlers.onReply(selection.text))} />
      <ActionButton icon={copier.icon} label={copier.label} onClick={() => copier.copy(selection.text, selection.html)} />
      <ActionButton icon={<HelpCircle size={12} aria-hidden />} label="Explain" disabled={handlers.busy} onClick={() => finish(() => handlers.onExplain(selection.text))} />
      {handlers.onRemember ? <RememberButton text={() => selection.text} onRemember={handlers.onRemember} busy={handlers.busy} /> : null}
    </div>
  )
}

/** The text being replied to, above the message box. */
export function ReplyQuoteBar({ quote, onClear }: { quote: string; onClear: () => void }) {
  return (
    <div className="flex items-start gap-1.5 border-b border-stone-200 bg-amber-50/70 px-2 py-1.5">
      <CornerUpLeft size={12} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
      <p className="line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-stone-600">{quote}</p>
      <button type="button" className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-stone-500 hover:bg-red-50 hover:text-red-700" aria-label="Remove Reply" onClick={onClear}>
        <X size={12} />
      </button>
    </div>
  )
}
