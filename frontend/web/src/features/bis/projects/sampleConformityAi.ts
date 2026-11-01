import { loadPdfjs } from '@/lib/pdfjsLoader'
import { loadIsCodeFileLinks, type IsCodeFileLink } from '@/features/masters/is-codes/loadIsCodeFileLinks'
import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import { pdfFileToAiPages } from '@/components/qi-assistant/aiImages'
import { createBisProjectFileUrls } from './bisProjectFilesApi'
import { parseOslConformityCheck, type OslConformityCheck, type OslSampleRequirementRow } from './oslSampleRequirementsModel'

/** Text budget per document (characters), so the whole check fits the AI model's context. */
const LIMITS = { request: 6_000, report: 22_000, standard: 38_000, manual: 14_000 }
const MAX_PAGES = 80

const isManualName = (name: string) => /product[_\s-]*manual|\bmanual\b|\bpm\b|^pm[_\s-]/i.test(name)

function pickIsFile(files: IsCodeFileLink[], kind: 'manual' | 'standard'): IsCodeFileLink | null {
  const usable = files.filter((f) => Boolean(f.url?.trim()))
  return (kind === 'manual' ? usable.find((f) => isManualName(f.file_name)) : usable.find((f) => !isManualName(f.file_name))) ?? null
}

async function fetchFile(url: string, name: string): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${name} could not be downloaded (${res.status}).`)
  return new File([await res.blob()], name, { type: 'application/pdf' })
}

async function storedFile(storagePath: string, name: string): Promise<File> {
  const { viewUrl } = await createBisProjectFileUrls(storagePath, name)
  if (!viewUrl) throw new Error(`${name} could not be opened.`)
  return fetchFile(viewUrl, name)
}

/** All selectable text of a PDF (page markers kept, so the AI can cite pages), cut to `max` characters. */
async function pdfText(file: File, max: number): Promise<string> {
  const { getDocument } = await loadPdfjs()
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    const parts: string[] = []
    let total = 0
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES) && total < max; n += 1) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ('str' in item ? String(item.str ?? '') : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      page.cleanup()
      if (text) {
        parts.push(`[Page ${n}] ${text}`)
        total += text.length
      }
    }
    const all = parts.join('\n')
    return all.length > max ? `${all.slice(0, max)}\n… (cut)` : all
  } finally {
    void task.destroy()
  }
}

function sampleFacts(row: OslSampleRequirementRow): string {
  return [
    ['Sample Code', row.sampleCode],
    ['QR Code', row.qrCode],
    ['Grade / Type / Variety / Size', row.gradeTypeVariety],
    ['Sample Description', row.sampleDescription],
    ['Declared Value', row.declaredValue],
    ['Test Required', row.testRequired],
    ['Sample Type', row.sampleType],
    ['Batch Number', row.batchNumber],
    ['Laboratory', row.laboratoryName || row.destinationLab],
  ]
    .filter(([, v]) => String(v ?? '').trim())
    .map(([k, v]) => `- ${k}: ${String(v).trim()}`)
    .join('\n')
}

const INSTRUCTIONS = `You are a BIS product certification reviewer checking one sample's Test Report.
Use ONLY the documents below. Work in this order:
1. Identify the exact sample (grade / type / size / class / declared values) from the Test Request and the sample details.
2. From the Indian Standard and the Product Manual (scheme of testing), list every test / requirement that applies to THIS sample, with clause numbers and limits (including tolerances on declared values).
3. For each test in the Test Report, compare the reported result with the applicable requirement: Pass, Fail, or Not Clear (when the requirement or the result cannot be read).
4. List the required tests that are missing from the Test Report (compare with "Test Required" and the Product Manual).
5. Verdict: "Yes" only when every reported result passes and no required test is missing; "No" when any result fails the requirement (even if the lab wrote "conforms"); "Undecided" when the documents are not enough to decide (say why in notes).
Do not invent values. Quote results and limits as written. Keep wording short.
Reply with JSON only:
{"verdict":"Yes|No|Undecided","summary":"one or two sentences","results":[{"parameter":"","clause":"","requirement":"","result":"","verdict":"Pass|Fail|Not Clear"}],"missing_tests":["test (clause)"],"notes":["…"]}`

/**
 * AI conformity check of one sample: reads the Test Request, the Test Report (text, or page pictures when scanned),
 * the IS specification and the Product Manual, and compares every result with the requirement for this sample.
 */
export async function checkSampleConformity(input: {
  row: OslSampleRequirementRow
  isCodeId: string | null
  isLabel: string
  onStep?: (step: string) => void
}): Promise<OslConformityCheck> {
  const { row, onStep } = input
  if (!row.testReportStoragePath.trim()) throw new Error('Attach the Test Report first.')
  const sources: string[] = []

  onStep?.('Reading the Test Report…')
  const reportFile = await storedFile(row.testReportStoragePath, row.testReportFileName || 'Test_Report.pdf')
  const report = await pdfFileToAiPages(reportFile, 4)
  let reportText = report.text
  if (reportText.length < 400) reportText = (await pdfText(reportFile, LIMITS.report)) || reportText
  const images = reportText.trim().length < 400 ? report.images : []
  sources.push(`Test Report: ${row.testReportFileName || 'attached'}${images.length ? ' (scanned — read as pictures)' : ''}`)

  let requestText = ''
  if (row.testRequestStoragePath.trim()) {
    onStep?.('Reading the Test Request…')
    requestText = await pdfText(await storedFile(row.testRequestStoragePath, row.testRequestFileName || 'Test_Request.pdf'), LIMITS.request).catch(() => '')
    if (requestText) sources.push(`Test Request: ${row.testRequestFileName || 'attached'}`)
  }

  let standardText = ''
  let manualText = ''
  if (input.isCodeId) {
    onStep?.('Reading the Standard and the Product Manual…')
    const files = await loadIsCodeFileLinks(input.isCodeId).catch(() => [] as IsCodeFileLink[])
    const standard = pickIsFile(files, 'standard')
    const manual = pickIsFile(files, 'manual')
    if (standard) {
      standardText = await fetchFile(standard.url!, standard.file_name).then((f) => pdfText(f, LIMITS.standard)).catch(() => '')
      if (standardText) sources.push(`Standard: ${standard.file_name}`)
    }
    if (manual) {
      manualText = await fetchFile(manual.url!, manual.file_name).then((f) => pdfText(f, LIMITS.manual)).catch(() => '')
      if (manualText) sources.push(`Product Manual: ${manual.file_name}`)
    }
  }
  if (!standardText && !manualText) {
    throw new Error('The IS specification / Product Manual PDF is not attached to this IS Code (IS Code Master), so results cannot be checked.')
  }

  onStep?.('AI is comparing the results with the Standard…')
  const message = [
    INSTRUCTIONS,
    `=== SAMPLE (${input.isLabel}) ===\n${sampleFacts(row)}`,
    requestText ? `=== TEST REQUEST ===\n${requestText}` : '',
    `=== TEST REPORT ===\n${reportText || '(scanned — see the attached page pictures)'}`,
    standardText ? `=== INDIAN STANDARD ===\n${standardText}` : '',
    manualText ? `=== PRODUCT MANUAL ===\n${manualText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const { reply } = await sendQiAssistantMessage({
    page: 'bis/sample-conformity',
    message,
    responseFormat: 'json_object',
    history: [],
    ...(images.length ? { images } : {}),
  })
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  let raw: Record<string, unknown> = {}
  try {
    raw = json ? (JSON.parse(json) as Record<string, unknown>) : {}
  } catch {
    throw new Error('The AI answer could not be read. Try again.')
  }
  const check = parseOslConformityCheck({
    ...raw,
    missingTests: raw.missing_tests ?? raw.missingTests,
    checkedAt: new Date().toISOString(),
    sources,
  })
  if (!check) throw new Error('The AI answer could not be read. Try again.')
  return check
}
