import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * The AI's Markdown as chat text: **bold**, `code`, *italic*, headings, tables, bullet / numbered lists and "> " quotes
 * (used by the QE Assistant and by Ask AI over the Standards Library).
 */

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

export function AssistantMessage({ content, clampQuotes = true }: { content: string; clampQuotes?: boolean }) {
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
          return (
            <blockquote
              key={index}
              className={cn('whitespace-pre-wrap break-words border-l-2 border-current pl-2', clampQuotes ? 'line-clamp-4 text-xs opacity-80' : 'italic text-stone-700')}
            >
              {seg.lines.map((line, i) => (
                <span key={i}>{renderAssistantInline(line)}{i < seg.lines.length - 1 ? '\n' : null}</span>
              ))}
            </blockquote>
          )
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
