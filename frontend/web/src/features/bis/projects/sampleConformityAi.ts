import { loadPdfjs } from '@/lib/pdfjsLoader'
import { loadIsCodeFileLinks, type IsCodeFileLink } from '@/features/masters/is-codes/loadIsCodeFileLinks'
import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import { pdfFileToAiPages } from '@/components/qi-assistant/aiImages'
import { ocrPdfText } from '@/lib/ocrPdf'
import { createBisProjectFileUrls } from './bisProjectFilesApi'
import { parseOslConformityCheck, type OslConformityCheck, type OslSampleRequirementRow } from './oslSampleRequirementsModel'

/** Text budget per document (characters), so the whole check fits the AI model's context (~60k tokens in all). */
const LIMITS = { request: 12_000, report: 70_000, standard: 100_000, manual: 35_000 }
const MAX_PAGES = 120
/** Less selectable text than this means a scanned PDF: it is read with OCR. */
const SCANNED_BELOW = 300
/** Scanned pages read by OCR per document (a few seconds each). */
const OCR_PAGES = { request: 4, report: 30, standard: 25, manual: 20 }
/** Page pictures sent along for a vision AI model (the server accepts 8). */
const REPORT_IMAGES = 8

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

/** Selectable text of a PDF, or its OCR text when it is scanned. */
async function readPdf(
  file: File,
  kind: keyof typeof LIMITS,
  label: string,
  onStep?: (step: string) => void,
): Promise<{ text: string; ocr: boolean }> {
  const text = await pdfText(file, LIMITS[kind])
  if (text.replace(/\[Page \d+\]/g, '').trim().length >= SCANNED_BELOW) return { text, ocr: false }
  const ocr = await ocrPdfText(file, {
    maxPages: OCR_PAGES[kind],
    onPage: (page, total) => onStep?.(`Reading the Scanned ${label} (OCR) — Page ${page} of ${total}…`),
  })
  return { text: ocr.length > LIMITS[kind] ? `${ocr.slice(0, LIMITS[kind])}\n… (cut)` : ocr, ocr: true }
}

const VISION_MISSING = /vision ai model|reading photos needs/i

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
2. From the Indian Standard and the Product Manual (scheme of testing), list every test / requirement that applies to THIS sample, with clause numbers and limits (including tolerances on declared values). Amendments printed with the Standard replace the clauses they name: use the amended text.
3. For each test in the Test Report, compare the reported result with the applicable requirement: Pass or Fail. Work out the limit for this sample's size / grade yourself (tables, formulas, tolerances); do not just copy the lab's own remark.
4. List the required tests that are missing from the Test Report. Which tests the laboratory must do comes from the Product Manual (tests on the sample drawn for independent testing / "Test Required"); tests the Product Manual leaves to the factory (for example a test on every pipe during production) are not missing from a lab report.
5. Verdict: "Yes" when every applicable result passes and no required test is missing; "No" when any applicable result fails (even if the lab wrote "conforms") or a required test is missing; "Undecided" only when a deciding figure cannot be read at all (say which in notes).
Scanned reports are read by OCR, which confuses digits (0↔8, 0↔6, 1↔7, 5↔S). When the two reads differ, or a figure is impossible for its unit or limit (8.26 for a ratio whose limit is 0.45; 16.660 kg/m for 10.60 nominal), take the plausible reading, judge it, and say so in the result. Use "Not Clear" only when no plausible reading exists.
Do not invent values. Quote results and limits as written. Keep wording short.
Reply with JSON only:
{"verdict":"Yes|No|Undecided","summary":"one or two sentences","results":[{"parameter":"","clause":"","requirement":"","result":"","verdict":"Pass|Fail|Not Clear"}],"missing_tests":["test (clause)"],"notes":["…"]}`

/**
 * AI conformity check of one sample: reads the Test Request, the Test Report (text; OCR and page pictures when scanned),
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
  const report = await readPdf(reportFile, 'report', 'Test Report', onStep)
  // A scanned report also goes as page pictures, for an AI model that can see (tables read best that way).
  const images = report.ocr ? (await pdfFileToAiPages(reportFile, REPORT_IMAGES).catch(() => null))?.images ?? [] : []
  if (!report.text.trim() && !images.length) throw new Error('The Test Report PDF has no readable text.')
  sources.push(`Test Report: ${row.testReportFileName || 'attached'}${report.ocr ? ' (scanned — read by OCR)' : ''}`)

  let requestText = ''
  if (row.testRequestStoragePath.trim()) {
    onStep?.('Reading the Test Request…')
    const request = await storedFile(row.testRequestStoragePath, row.testRequestFileName || 'Test_Request.pdf')
      .then((f) => readPdf(f, 'request', 'Test Request', onStep))
      .catch(() => ({ text: '', ocr: false }))
    requestText = request.text
    if (requestText) sources.push(`Test Request: ${row.testRequestFileName || 'attached'}${request.ocr ? ' (scanned — read by OCR)' : ''}`)
  }

  let standardText = ''
  let manualText = ''
  if (input.isCodeId) {
    onStep?.('Reading the Standard and the Product Manual…')
    const files = await loadIsCodeFileLinks(input.isCodeId).catch(() => [] as IsCodeFileLink[])
    const standard = pickIsFile(files, 'standard')
    const manual = pickIsFile(files, 'manual')
    if (standard) {
      const read = await fetchFile(standard.url!, standard.file_name)
        .then((f) => readPdf(f, 'standard', 'Standard', onStep))
        .catch(() => ({ text: '', ocr: false }))
      standardText = read.text
      if (standardText) sources.push(`Standard: ${standard.file_name}${read.ocr ? ' (scanned — read by OCR)' : ''}`)
    }
    if (manual) {
      const read = await fetchFile(manual.url!, manual.file_name)
        .then((f) => readPdf(f, 'manual', 'Product Manual', onStep))
        .catch(() => ({ text: '', ocr: false }))
      manualText = read.text
      if (manualText) sources.push(`Product Manual: ${manual.file_name}${read.ocr ? ' (scanned — read by OCR)' : ''}`)
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
    `=== TEST REPORT${report.ocr ? ' (scanned, read by OCR twice per page — figures may have OCR mistakes such as 0↔8, 0↔6, 1↔I: compare both reads, take the one that fits the units and limits, and prefer the page pictures when attached)' : ''} ===\n${report.text || '(scanned — see the attached page pictures)'}`,
    standardText ? `=== INDIAN STANDARD ===\n${standardText}` : '',
    manualText ? `=== PRODUCT MANUAL ===\n${manualText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const ask = (pictures: string[]) =>
    sendQiAssistantMessage({
      page: 'bis/sample-conformity',
      message,
      responseFormat: 'json_object',
      history: [],
      ...(pictures.length ? { images: pictures } : {}),
    })
  // Without a vision model the pictures are refused: the OCR text alone is then checked.
  const { reply } = await ask(images).catch((err: unknown) => {
    if (images.length && report.text.trim() && VISION_MISSING.test(err instanceof Error ? err.message : String(err))) return ask([])
    throw err
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
