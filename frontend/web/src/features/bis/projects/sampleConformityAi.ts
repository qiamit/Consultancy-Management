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

/**
 * The review method and answer format. Written for any chat model (DeepSeek, Gemini, GPT, Claude…): fixed steps,
 * fixed field formats and one example, so every model answers the same way.
 */
const INSTRUCTIONS = `ROLE: You are a BIS product certification reviewer. Decide whether ONE sample conforms, by checking its Test Report against the Indian Standard and the Product Manual below. Use ONLY these documents.

METHOD (follow every step):
1. Identify the sample from the Test Report (Part A / particulars) and the Test Request: description (type, grade, size), declared values, batch number, date of manufacture.
2. From the Indian Standard (with its amendments — an amendment replaces the clause it names) and the Product Manual, find every requirement that applies to THIS sample's type / grade / size, and work out the actual limit (tables, formulas, tolerances on declared or nominal values).
3. Go through the Test Report and take EVERY test it reports, in the report's order, one row each (the same test reported twice is one row). Compare the reported value with the limit from step 2 yourself; never rely on the lab's own "conforms" remark.
4. Missing tests: tests the Product Manual / Standard require the LABORATORY to do on this sample that are not in the report. Tests the Product Manual leaves to the factory (for example on every pipe during production) are not missing.
5. Verdict: "Yes" = every result passes and no test is missing. "No" = any result fails or any required test is missing. "Undecided" = a deciding value cannot be read at all.

SCANNED REPORTS: the text was read by OCR twice per page and may confuse digits (0↔8, 0↔6, 1↔7, 5↔S). Read 1 has the more reliable digits. When reads differ or a value is impossible for its unit or limit, take the plausible reading. Put any such reading in "notes", never in "result". Use "Not Clear" only when no plausible reading exists.

FIELD FORMATS (keep each cell short, no sentences in the table):
- parameter: the test name in Title Case, without method or standard numbers ("Ultimate Tensile Strength").
- clause: the IS clause / table only ("9.1, Table 4"); add "Amd 6" when an amendment sets it.
- requirement: the limit for this sample with unit ("≤ 0.25 %", "≥ 450 MPa", "168.30 ± 0.75 % (167.04 – 169.56 mm)", "No Crack").
- result: the reported value with unit, exactly as the report gives it ("0.20 %", "486.90 MPa", "Satisfactory").
- verdict: "Pass", "Fail" or "Not Clear".
- missing_tests: "Test Name (Clause x)".
- summary: one sentence with the verdict and the deciding reason.
- notes: the observations, one short sentence each: whether the sample matches the Test Request, every failure with its reason, missing tests, disagreement with the lab's remark, anything else the reviewer must know. OCR corrections: ONE note listing only the values you changed.
Before answering, re-check every row: for "≥ X" the result must be at least X; for "≤ X" at most X. Compare the numbers, not the words.
- sample: values as written in the report ("" when not given).

ANSWER: JSON only, no other text, exactly these keys. Example of the format (values are only an example):
{"sample":{"description":"ERW, Black, Fe 410, 168.3 mm OD × 4.5 mm","declared_values":"Silicon killed","batch_number":"B-12","date_of_manufacture":"12-10-2026"},"verdict":"No","summary":"Does not conform: Yield Strength 231 MPa is below the 235 MPa minimum.","results":[{"parameter":"Carbon","clause":"8.1, Table 2","requirement":"≤ 0.25 %","result":"0.18 %","verdict":"Pass"},{"parameter":"Yield Strength","clause":"9.1, Table 4","requirement":"≥ 235 MPa","result":"231 MPa","verdict":"Fail"}],"missing_tests":["Flattening Test (Clause 9.2.1)"],"notes":["Sample details match the Test Request.","Yield Strength 231 MPa is below the 235 MPa minimum of Table 4.","Flattening Test required by the Product Manual is not reported."]}`

type CheckResult = OslConformityCheck['results'][number]

const NUMBER = /-?\d+(?:\.\d+)?/g

/**
 * Re-does the arithmetic of a one-sided numeric limit ("≥ 450 MPa", "≤ 0.25 %", "450 Minimum", "Max 0.040") against
 * the reported value(s) — every number of a range such as "2.61 - 2.65 mm" must meet it. Returns the verdict the
 * numbers give, or null when the requirement or result is not a simple numeric limit.
 */
function numericVerdict(r: CheckResult): 'Pass' | 'Fail' | null {
  const req = r.requirement.replace(/,/g, '')
  const min = /≥|>=|\bmin(?:imum)?\b|\bnot less than\b|\bat least\b/i.test(req)
  const max = /≤|<=|\bmax(?:imum)?\b|\bnot more than\b|\bup to\b/i.test(req)
  if (min === max || /±|%\s*of|of\s+(?:od|thickness|length)|\(|\bor\b/i.test(req)) return null
  const limits = req.match(NUMBER) ?? []
  const values = (r.result.replace(/,/g, '').match(NUMBER) ?? []).map(Number)
  if (limits.length !== 1 || !values.length || values.length > 2) return null
  const limit = Number(limits[0])
  return values.every((v) => (min ? v >= limit : v <= limit)) ? 'Pass' : 'Fail'
}

/**
 * Makes the answer consistent whatever model wrote it: numeric limits are re-checked, and the overall verdict follows
 * the fixed rule (any Fail or missing test = No; otherwise Undecided when the AI could not decide; else Yes).
 */
function settleCheck(check: OslConformityCheck): OslConformityCheck {
  const corrections: string[] = []
  const results = check.results.map((r) => {
    const computed = numericVerdict(r)
    if (!computed || computed === r.verdict || r.verdict === 'Not Clear') return r
    corrections.push(`${r.parameter}: ${r.result} against ${r.requirement} is ${computed === 'Pass' ? 'within' : 'outside'} the limit — verdict corrected to ${computed}.`)
    return { ...r, verdict: computed }
  })
  const failed = results.some((r) => r.verdict === 'Fail') || check.missingTests.length > 0
  const verdict = failed ? 'No' : check.verdict === 'Undecided' ? 'Undecided' : 'Yes'
  const notes = corrections.length ? [...check.notes, ...corrections] : check.notes
  const summary =
    corrections.length && verdict !== check.verdict
      ? `${verdict === 'Yes' ? 'Conforms' : 'Does not conform'} after re-checking the figures: ${corrections.join(' ')}`
      : check.summary
  return { ...check, results, verdict, notes, summary }
}

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
    `=== TEST REPORT${report.ocr ? ' (scanned, read by OCR twice per page — figures may have OCR mistakes such as 0↔8, 0↔6, 1↔I: read 1 has the more reliable digits; compare both reads, take the one that fits the units and limits, and prefer the page pictures when attached)' : ''} ===\n${report.text || '(scanned — see the attached page pictures)'}`,
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
  const parsed = parseOslConformityCheck({
    ...raw,
    missingTests: raw.missing_tests ?? raw.missingTests,
    checkedAt: new Date().toISOString(),
    sources,
  })
  if (!parsed) throw new Error('The AI answer could not be read. Try again.')
  // Sample details the AI could not read come from the sample row.
  const check = {
    ...parsed,
    sample: {
      description: parsed.sample.description || row.sampleDescription || row.gradeTypeVariety,
      declaredValues: parsed.sample.declaredValues || row.declaredValue,
      batchNumber: parsed.sample.batchNumber || row.batchNumber,
      manufactureDate: parsed.sample.manufactureDate,
    },
  }
  return settleCheck(check)
}
