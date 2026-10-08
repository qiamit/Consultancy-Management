import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import { processFlowOutlineText, type ProcessFlowNode } from './processFlowModel'

export type ProcessDescriptionTone =
  | 'technical'
  | 'professional'
  | 'inspection'

export type ProcessDescriptionLength = 'short' | 'medium' | 'long'

export type ProcessDescriptionGenerateOptions = {
  /** Target number of description points / paragraphs. */
  pointCount: number
  /** How long each point should be. */
  length: ProcessDescriptionLength
  /** Writing style. */
  tone: ProcessDescriptionTone
}

export type ProcessDescriptionGenerateContext = {
  applicantName: string
  isNumber: string
  isTitle: string
  licenseScope: string
  productName: string
  nodes: ProcessFlowNode[]
  isCodeId?: string | null
  options?: ProcessDescriptionGenerateOptions
}

export const DEFAULT_PROCESS_DESCRIPTION_OPTIONS: ProcessDescriptionGenerateOptions =
  {
    pointCount: 8,
    length: 'medium',
    tone: 'professional',
  }

const LENGTH_GUIDE: Record<ProcessDescriptionLength, string> = {
  short: 'each point 1 sentence only (concise)',
  medium: 'each point 1–2 sentences',
  long: 'each point 2–4 sentences (detailed)',
}

const TONE_GUIDE: Record<ProcessDescriptionTone, string> = {
  technical:
    'Technical tone: process / QC terminology, equipment and controls named clearly; suitable for engineers.',
  professional:
    'Professional formal English suitable for a BIS Process Description annex.',
  inspection:
    'Inspection-ready tone: emphasises verification, records, sampling, and audit trail for BIS officers.',
}

function buildGenerateMessage(
  options: ProcessDescriptionGenerateOptions,
): string {
  const count = Math.min(30, Math.max(3, Math.round(options.pointCount)))
  const minAccept = Math.max(3, Math.min(count - 1, Math.floor(count * 0.75)))

  return `Generate a BIS Process Description for a manufacturing unit licence / application.

Read and use: the Indian Standard (IS code / product manual files available for this IS), the licence / manufacturing scope notes, and the Process Flow Chart hierarchy in the context.

${TONE_GUIDE[options.tone]}
Length: ${LENGTH_GUIDE[options.length]}.
Produce exactly ${count} points (paragraphs) — not fewer than ${minAccept}.

Cover the manufacturing sequence from raw material receipt through processing, in-process controls, finished goods inspection, packing and dispatch, and control of non-conforming product / records — aligned to the flow chart steps.

Return ONLY a JSON block (optionally inside \`\`\`json fences) with this shape:
{ "descriptionPoints": ["paragraph 1", "paragraph 2", ...] }

Rules:
- Exactly ${count} strings in descriptionPoints (or as close as possible, at least ${minAccept}).
- No numbering inside the strings (the form will number them).
- Do not invent unrelated products; stay consistent with the IS and scope.
- Do not include letterhead, salutation, or signature blocks.`
}

function extractJsonPayload(reply: string): unknown | null {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? reply).trim()
  if (!candidate) return null
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      try {
        return JSON.parse(candidate.slice(arrStart, arrEnd + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function parseDescriptionPoints(reply: string): string[] | null {
  const payload = extractJsonPayload(reply)
  if (!payload) return null
  if (Array.isArray(payload)) {
    return payload.map((p) => String(p ?? '').trim()).filter(Boolean)
  }
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    for (const key of ['descriptionPoints', 'points', 'paragraphs', 'items']) {
      if (Array.isArray(obj[key])) {
        return (obj[key] as unknown[])
          .map((p) => String(p ?? '').trim())
          .filter(Boolean)
      }
    }
  }
  return null
}

function buildContext(input: ProcessDescriptionGenerateContext): string {
  const outline = processFlowOutlineText(input.nodes)
  const options = input.options ?? DEFAULT_PROCESS_DESCRIPTION_OPTIONS
  return [
    'BIS Process Description generation context:',
    `Applicant / Firm: ${input.applicantName || '—'}`,
    `IS Number: ${input.isNumber || '—'}`,
    `IS Title / Product: ${input.isTitle || input.productName || '—'}`,
    `Product name (scope): ${input.productName || '—'}`,
    `Requested points: ${options.pointCount}`,
    `Requested length: ${options.length}`,
    `Requested tone: ${options.tone}`,
    '',
    'Licence / manufacturing scope notes:',
    input.licenseScope.trim() || '(not provided)',
    '',
    'Process Flow Chart hierarchy (user-built):',
    outline || '(empty — infer a typical sequence for this IS)',
    '',
    'Also use the attached / loaded Indian Standard and product manual documents for this IS code when available.',
  ].join('\n')
}

export async function generateProcessDescription(
  input: ProcessDescriptionGenerateContext,
): Promise<string[]> {
  const options = input.options ?? DEFAULT_PROCESS_DESCRIPTION_OPTIONS
  const target = Math.min(30, Math.max(3, Math.round(options.pointCount)))
  const minAccept = Math.max(3, Math.min(target - 1, Math.floor(target * 0.75)))

  const { reply } = await sendQiAssistantMessage({
    page: 'bis/process-flow',
    message: buildGenerateMessage(options),
    context: buildContext(input),
    isCodeId: input.isCodeId?.trim() || undefined,
    history: [],
  })

  const points = parseDescriptionPoints(reply)
  if (!points || points.length < minAccept) {
    const preview = reply.replace(/\s+/g, ' ').trim().slice(0, 240)
    throw new Error(
      points && points.length > 0
        ? `AI returned only ${points.length} point(s). At least ${minAccept} are required. Please try again.`
        : preview
          ? `AI did not return usable points. Reply: ${preview}`
          : 'Could not read process description from AI response. Please try again.',
    )
  }
  return points.slice(0, Math.max(target, points.length))
}
