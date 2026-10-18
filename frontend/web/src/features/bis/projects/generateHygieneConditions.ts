import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import { AI_WRITING_RULES, formatAiLabel, formatAiNote, formatAiSentence } from './aiTextFormat'

export type HygieneConditionRow = { aspect: string; arrangement: string; remarks: string }

export type HygieneConditionsGenerateContext = {
  applicantName: string
  isNumber: string
  isTitle: string
  /** Licence / manufacturing scope notes of the application. */
  licenseScope: string
  /** Product manual (Scheme of Inspection & Testing) number for this IS, when known. */
  productManualNumber: string
  /** Lets the assistant load the IS and its product manual documents. */
  isCodeId?: string | null
  /** Aspects already in the table, so the AI adds what is missing. */
  existingAspects: string[]
}

const ROW_COUNT = 10

function buildMessage(input: HygieneConditionsGenerateContext): string {
  return `Generate the Hygiene Conditions requirements for the manufacturing premises of a BIS licence application.

Base them on the Indian Standard, its product manual / Scheme of Inspection and Testing, and the manufacturing scope given in the context. Cover what applies to this product: premises and housekeeping, raw material and finished goods storage, pest control, water, waste disposal, personal hygiene and protective clothing, equipment cleaning, ventilation and lighting, and any hygiene-related requirement the IS or product manual states.
${input.existingAspects.length ? `\nThese aspects are already listed — do not repeat them: ${input.existingAspects.join('; ')}.\n` : ''}
Return ONLY a JSON block (optionally inside \`\`\`json fences) with this shape:
{ "rows": [ { "aspect": "Pest control", "arrangement": "what the unit maintains, in one or two sentences", "remarks": "clause / record reference, or empty" } ] }

Rules:
- About ${ROW_COUNT} rows, each a distinct hygiene aspect relevant to this product.
- "arrangement" states the condition actually maintained at the unit, in formal English for BIS.
- "remarks" may cite the IS / product manual clause or the record kept; leave it empty when there is nothing specific.
- No numbering, letterhead, salutation or signature.
- "aspect" is a short Title Case heading (e.g. "Pest Control", "Personal Hygiene of Workers").

${AI_WRITING_RULES}`
}

function buildContext(input: HygieneConditionsGenerateContext): string {
  return [
    'BIS Hygiene Conditions generation context:',
    `Applicant / Firm: ${input.applicantName || '—'}`,
    `IS Number: ${input.isNumber || '—'}`,
    `IS Title / Product: ${input.isTitle || '—'}`,
    `Product manual (SIT): ${input.productManualNumber || '—'}`,
    '',
    'Licence / manufacturing scope notes:',
    input.licenseScope.trim() || '(not provided)',
    '',
    'Also use the attached / loaded Indian Standard and product manual documents for this IS code when available.',
  ].join('\n')
}

function parseRows(reply: string): HygieneConditionRow[] {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const text = (fenced?.[1] ?? reply).trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  let payload: unknown = null
  try {
    payload = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text)
  } catch {
    return []
  }
  const rows = payload && typeof payload === 'object' ? (payload as { rows?: unknown }).rows : null
  if (!Array.isArray(rows)) return []
  return rows
    .map((r) => {
      const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
      const s = (v: unknown) => String(v ?? '').trim()
      return { aspect: formatAiLabel(s(o.aspect)), arrangement: formatAiSentence(s(o.arrangement)), remarks: formatAiNote(s(o.remarks)) }
    })
    .filter((r) => r.aspect && r.arrangement)
}

export async function generateHygieneConditions(input: HygieneConditionsGenerateContext): Promise<HygieneConditionRow[]> {
  const { reply } = await sendQiAssistantMessage({
    page: 'bis/hygiene-conditions',
    message: buildMessage(input),
    context: buildContext(input),
    isCodeId: input.isCodeId?.trim() || undefined,
    history: [],
  })
  const rows = parseRows(reply)
  if (rows.length === 0) {
    const preview = reply.replace(/\s+/g, ' ').trim().slice(0, 240)
    throw new Error(preview ? `AI did not return usable hygiene conditions. Reply: ${preview}` : 'AI did not return hygiene conditions. Please try again.')
  }
  return rows
}
