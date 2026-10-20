import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'

export function parseJson(reply: string): Record<string, unknown> {
  if (!reply.includes('{')) throw new Error(`AI gave no answer (${reply.trim() || 'empty reply'}). Please try again.`)
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? reply
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  try {
    return JSON.parse(start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced) as Record<string, unknown>
  } catch {
    throw new Error('AI returned an unreadable answer. Please try again.')
  }
}

export const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export async function askJson(page: string, message: string, context: string, image?: File): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { reply } = await sendQiAssistantMessage({ page, responseFormat: 'json_object', history: [], context, message, ...(image ? { attachedImage: image } : {}) })
      if (reply.includes('{')) return parseJson(reply)
    } catch (err) {
      if (attempt === 2) throw err
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
  }
  throw new Error('AI gave no answer. Please try again.')
}

