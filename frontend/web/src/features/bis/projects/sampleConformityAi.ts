import { loadPdfjs } from '@/lib/pdfjsLoader'
import { loadIsCodeFileLinks, type IsCodeFileLink } from '@/features/masters/is-codes/loadIsCodeFileLinks'
import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import { pdfFileToAiPages } from '@/components/qi-assistant/aiImages'
import { ocrPdfPages } from '@/lib/ocrPdf'
import { createBisProjectFileUrls } from './bisProjectFilesApi'
import { parseOslConformityCheck, type OslConformityCheck, type OslSampleRequirementRow } from './oslSampleRequirementsModel'
import {
  fetchProductManualPages,
  fetchRequiredTests,
  fetchStandardFolders,
  searchStandardPages,
  type RequiredTest,
  type StandardPage,
} from '@/features/masters/is-codes/requiredTestsApi'

/** Text budget per document (characters), so the whole check fits the AI model's context (~60k tokens in all). */
const LIMITS = { request: 12_000, report: 70_000, standard: 100_000, manual: 35_000 }
const MAX_PAGES = 120
/** A page with less selectable text than this is a picture (scanned): it is read with OCR. */
const SCANNED_PAGE_BELOW = 60
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

type PdfRead = { text: string; ocr: boolean }

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n… (cut)` : text)

/** Manak / eLIMS summary pages list the tests with "Test Report Attached" in place of the values. */
const isManakSummaryPage = (text: string) => /test\s*report\s*attached/i.test(text)

/**
 * Text of every page: the selectable text where a page has it, OCR where the page is a scan. Page by page, because
 * a Manak Test Report is mixed — Manak's own pages are text, the laboratory's attached report is scanned. For the
 * Test Report the laboratory's pages (with the values) come first and the Manak summary pages are labelled, so the
 * AI never takes "Test Report Attached" for a result.
 */
async function readPdf(
  file: File,
  kind: keyof typeof LIMITS,
  label: string,
  onStep?: (step: string) => void,
): Promise<PdfRead> {
  const texts = await pdfPageTexts(file)
  const scanned = texts
    .map((text, i) => (text.replace(/\s/g, '').length < SCANNED_PAGE_BELOW ? i + 1 : 0))
    .filter((n) => n > 0)
    .slice(0, OCR_PAGES[kind])
  const ocr = await ocrPdfPages(file, {
    pages: scanned,
    onPage: (done, total, page) => onStep?.(`Reading the Scanned ${label} (OCR) — Page ${page} (${done} of ${total})…`),
  })
  const pages = texts
    .map((text, i) => {
      const reads = ocr.get(i + 1)
      const body = reads
        ? reads.length > 1
          ? reads.map((r, k) => `(OCR read ${k + 1})\n${r}`).join('\n')
          : `(OCR)\n${reads[0]}`
        : text
      return { n: i + 1, text: body }
    })
    .filter((page) => page.text.trim())
  const block = (list: typeof pages) => list.map((page) => `[Page ${page.n}] ${page.text}`).join('\n')
  let text = block(pages)
  if (kind === 'report') {
    const lab = pages.filter((page) => !isManakSummaryPage(page.text))
    const summary = pages.filter((page) => isManakSummaryPage(page.text))
    text = [
      lab.length ? `--- LABORATORY REPORT PAGES (take every result value from here) ---\n${block(lab)}` : '',
      summary.length
        ? `--- MANAK SUMMARY PAGES (they only list the tests; "Test Report Attached" is NOT a result — find the value on the laboratory pages) ---\n${block(summary)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')
  }
  return { text: cut(text, LIMITS[kind]), ocr: ocr.size > 0 }
}

const VISION_MISSING = /vision ai model|reading photos needs/i

/** Selectable text of each page ('' for a page that is a picture), up to MAX_PAGES pages. */
async function pdfPageTexts(file: File): Promise<string[]> {
  const { getDocument } = await loadPdfjs()
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    const texts: string[] = []
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n += 1) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      texts.push(
        content.items
          .map((item) => ('str' in item ? String(item.str ?? '') : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      page.cleanup()
    }
    return texts
  } finally {
    void task.destroy()
  }
}

/**
 * An SS sample (sample code like 10125009/2026/SS/10) is drawn for grant-of-licence testing: there is no licence yet,
 * so the Marking clause (Standard Mark / licence marking) does not apply, whatever the laboratory wrote.
 */
export const isSsSample = (row: OslSampleRequirementRow) => row.sampleCode.toUpperCase().split(/[\s/_-]+/).includes('SS')

const MARKING = /\bmark(?:ing|ed)?\b/i
const SS_MARKING_REQUIREMENT = 'Not Applicable — SS Sample (No Licence Yet)'

function sampleFacts(row: OslSampleRequirementRow): string {
  return [
    ['Sample Stage', isSsSample(row) ? 'SS — sample for grant of licence testing; no licence yet, so the Marking clause is NOT applicable (always Pass)' : ''],
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
3. Go through the LABORATORY REPORT PAGES and take EVERY test with its observed value, in the laboratory's order, one row each (the same test reported twice is one row). The Manak summary pages only list tests with "Test Report Attached": that text is never a result — take the value from the laboratory pages (chemical results may be on a separate laboratory page from the mechanical / dimensional ones; read all of them). Compare the reported value with the limit from step 2 yourself; never rely on the lab's own "conforms" remark. The report's own "specified requirement" column is a cross-check: where your limit differs from it, re-read the Standard's table row for this grade (for example Table 4 gives tensile strength, yield stress and elongation as separate columns) and say in notes which is right.
4. Missing tests: tests the Product Manual / Standard require the LABORATORY to do on this sample that are not in the report. Tests the Product Manual leaves to the factory (for example on every pipe during production) are not missing.
4a. Sample Stage "SS": the Marking clause is not applicable — give the Marking row requirement "Not Applicable — SS Sample (No Licence Yet)", verdict "Pass", never list Marking as missing or as a failure.
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

SELF-CHECK before answering: no result is "Test Report Attached"; every laboratory test appears once; each "≥ X" result is at least X and each "≤ X" at most X; the verdict follows step 5.

ANSWER: JSON only, no other text, exactly these keys. Example of the format (values are only an example):
{"sample":{"description":"ERW, Black, Fe 410, 168.3 mm OD × 4.5 mm","declared_values":"Silicon killed","batch_number":"B-12","date_of_manufacture":"12-10-2026"},"verdict":"No","summary":"Does not conform: Yield Strength 231 MPa is below the 235 MPa minimum.","results":[{"parameter":"Carbon","clause":"8.1, Table 2","requirement":"≤ 0.25 %","result":"0.18 %","verdict":"Pass"},{"parameter":"Yield Strength","clause":"9.1, Table 4","requirement":"≥ 235 MPa","result":"231 MPa","verdict":"Fail"}],"missing_tests":["Flattening Test (Clause 9.2.1)"],"notes":["Sample details match the Test Request.","Yield Strength 231 MPa is below the 235 MPa minimum of Table 4.","Flattening Test required by the Product Manual is not reported."]}`

type CheckResult = OslConformityCheck['results'][number]

const NUMBER = /-?\d+(?:\.\d+)?/g

/**
 * Re-does the arithmetic of a one-sided numeric limit ("≥ 450 MPa", "≤ 0.25 %", "450 Minimum", "Max 0.040") against
 * the reported value(s) — every number of a range such as "2.61 - 2.65 mm" must meet it. Returns the verdict the
 * numbers give, or null when the requirement or result is not a simple numeric limit.
 */
/** Units with a power ("N/mm2", "mm²", "g/m2", "m³") must not count as numbers: "545 N/mm2" is one value, 545. */
const stripUnitPowers = (v: string) => v.replace(/([A-Za-z])[23²³](?![\d.])/g, '$1')

export function numericVerdict(r: CheckResult): 'Pass' | 'Fail' | null {
  const req = stripUnitPowers(r.requirement.replace(/,/g, ''))
  const min = /≥|>=|\bmin(?:imum)?\b|\bnot less than\b|\bat least\b/i.test(req)
  const max = /≤|<=|\bmax(?:imum)?\b|\bnot more than\b|\bup to\b/i.test(req)
  if (min === max || /±|%\s*of|of\s+(?:od|thickness|length)|\(|\bor\b/i.test(req)) return null
  const limits = req.match(NUMBER) ?? []
  const values = (stripUnitPowers(r.result.replace(/,/g, '')).match(NUMBER) ?? []).map(Number)
  if (limits.length !== 1 || !values.length || values.length > 2) return null
  const limit = Number(limits[0])
  return values.every((v) => (min ? v >= limit : v <= limit)) ? 'Pass' : 'Fail'
}

/**
 * Makes the answer consistent whatever model wrote it: numeric limits are re-checked, and the overall verdict follows
 * the fixed rule (any Fail or missing test = No; otherwise Undecided when the AI could not decide; else Yes).
 */
function settleCheck(check: OslConformityCheck, row: OslSampleRequirementRow): OslConformityCheck {
  const corrections: string[] = []
  const ss = isSsSample(row)
  const results = check.results.map((r) => {
    if (ss && MARKING.test(r.parameter)) return { ...r, requirement: SS_MARKING_REQUIREMENT, verdict: 'Pass' as const }
    if (/test\s*report\s*attached/i.test(r.result)) return { ...r, verdict: 'Not Clear' as const }
    const computed = numericVerdict(r)
    if (!computed || computed === r.verdict || r.verdict === 'Not Clear') return r
    corrections.push(`${r.parameter}: ${r.result} against ${r.requirement} is ${computed === 'Pass' ? 'within' : 'outside'} the limit — verdict corrected to ${computed}.`)
    return { ...r, verdict: computed }
  })
  const missingTests = ss ? check.missingTests.filter((t) => !MARKING.test(t)) : check.missingTests
  const failed = results.some((r) => r.verdict === 'Fail') || missingTests.length > 0
  // Not Clear rows keep an AI "No" (given for them) from turning into "Yes".
  const unclear = results.some((r) => r.verdict === 'Not Clear')
  const verdict = failed ? 'No' : check.verdict === 'Undecided' || (unclear && check.verdict !== 'Yes') ? 'Undecided' : 'Yes'
  const ssNote =
    ss && check.results.some((r) => MARKING.test(r.parameter))
      ? ['Marking is not applicable to an SS sample (no licence yet), so it is taken as Pass.']
      : []
  const notes = (ss ? check.notes.filter((n) => !MARKING.test(n)) : check.notes).concat(ssNote, corrections)
  const reasons = [...ssNote, ...corrections]
  const summary =
    reasons.length && verdict !== check.verdict
      ? `${verdict === 'Yes' ? 'Conforms' : verdict === 'No' ? 'Does not conform' : 'Undecided'} after the app's re-check: ${reasons.join(' ')}`
      : check.summary
  return { ...check, results, missingTests, verdict, notes, summary }
}

/** Standards index budgets: only the matching pages are sent, far less than the whole Standard. */
const INDEX_LIMITS = { standard: 45_000, manual: 30_000, standardPages: 24 }
const REQUIREMENT_WORDS =
  'requirement requirements table clause test method limit shall tolerance chemical composition mechanical properties dimensions marking'
const WORD_STOP = new Set(
  'the and for with from that this test tests report page sample result results value values laboratory method remark conforms specified requirement observed signatory issued date number total'.split(
    ' ',
  ),
)

/** Pages as text, each page once (the same page often sits in two files), cut at a character budget. */
function indexPagesText(pages: StandardPage[], budget: number): { text: string; count: number } {
  const seen = new Set<string>()
  let text = ''
  let count = 0
  for (const p of pages) {
    const body = p.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    const key = body.slice(0, 400)
    if (!body || seen.has(key)) continue
    seen.add(key)
    const block = `[${p.kind} — ${p.relpath.split('/').pop()} — page ${p.page}]\n${body}\n\n`
    if (text.length + block.length > budget) break
    text += block
    count += 1
  }
  return { text, count }
}

/** Words that find the Standard's pages for this sample: the required tests, else the words of the report. */
export function indexQueryWords(input: { requiredTests: RequiredTest[]; reportText: string; grade: string }): string {
  const fromList = input.requiredTests.map((t) => t.testName).join(' ')
  const fromReport = fromList
    ? ''
    : [...new Set((input.reportText.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !WORD_STOP.has(w)))]
        .slice(0, 80)
        .join(' ')
  return `${REQUIREMENT_WORDS} ${input.grade} ${fromList} ${fromReport}`.replace(/\s+/g, ' ').trim()
}

const REQUIRED_RULES = `REQUIRED TESTS: the locked list below is authoritative for missing tests. For EVERY listed test give one entry in "required_check": {"test": the name exactly as listed, "applicable": false only when its "applies to" excludes this sample's grade / type / size (else true), "found": true when the laboratory report gives a result for it (under any name), "result_parameter": the matching "parameter" of your results table or ""}. "missing_tests" = the applicable listed tests with found false (add others only when the Standard clearly requires them). Use the listed requirement as the limit unless the Standard pages show an amended limit. Add "required_check" to the JSON answer.`

/** The locked list as prompt lines. */
export function requiredTestsBlock(tests: RequiredTest[]): string {
  return tests
    .map((t, i) => `${i + 1}. ${t.testName}${t.clause ? ` | Clause ${t.clause}` : ''}${t.requirement ? ` | ${t.requirement}` : ''}${t.appliesTo ? ` | Applies To: ${t.appliesTo}` : ''}`)
    .join('\n')
}

const normName = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Missing tests from the locked list, decided by the app: every applicable listed test the AI did not confirm as
 * found in the report is missing, also when the AI left it out of "required_check" altogether.
 */
export function applyRequiredTests(check: OslConformityCheck, required: RequiredTest[], rawRequiredCheck: unknown): OslConformityCheck {
  if (!required.length) return check
  const entries = (Array.isArray(rawRequiredCheck) ? rawRequiredCheck : []).filter(
    (e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object',
  )
  const byName = new Map(entries.map((e) => [normName(String(e.test ?? '')), e]))
  const missing: string[] = []
  for (const t of required) {
    const e = byName.get(normName(t.testName))
    const label = `${t.testName}${t.clause ? ` (Clause ${t.clause})` : ''}`
    if (!e) missing.push(`${label} — Not Confirmed in the Report`)
    else if (e.applicable !== false && e.found !== true) missing.push(label)
  }
  const have = new Set(missing.map((m) => normName(m.split(' (Clause')[0].split(' — ')[0])))
  const extra = check.missingTests.filter((m) => !have.has(normName(m.split(' (Clause')[0].split('(')[0])))
  const missingTests = [...missing, ...extra]
  const note = missing.length
    ? [`Missing tests checked against the locked Required Tests list (${required.length} laboratory tests).`]
    : [`All ${required.length} tests of the locked Required Tests list are in the report (or not applicable).`]
  return { ...check, missingTests, notes: [...check.notes, ...note] }
}

/**
 * The Standard's matching pages and the Product Manual from the standards index (no PDF download, no OCR in the
 * browser). Null when the IS Code is not in the index, so the check falls back to the IS Code's own PDF files.
 */
async function readFromStandardsIndex(
  isCodeId: string,
  words: string,
): Promise<{ standardText: string; manualText: string; sources: string[] } | null> {
  const folders = await fetchStandardFolders(isCodeId).catch(() => [] as string[])
  if (!folders.length) return null
  const [standardPages, manualPages] = await Promise.all([
    searchStandardPages(folders, words, INDEX_LIMITS.standardPages, ['Standard', 'Amendment']).catch(() => []),
    fetchProductManualPages(folders).catch(() => []),
  ])
  const standard = indexPagesText(standardPages, INDEX_LIMITS.standard)
  const manual = indexPagesText(manualPages, INDEX_LIMITS.manual)
  if (!standard.text) return null
  return {
    standardText: standard.text,
    manualText: manual.text,
    sources: [
      `Standard (Standards Index, ${folders[0]}): ${standard.count} Matching Pages`,
      ...(manual.count ? [`Product Manual (Standards Index): ${manual.count} Pages`] : []),
    ],
  }
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
  /** Re-check with the Default AI Model even when a Model for Document Checks is set. */
  useMainModel?: boolean
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

  // The locked Required Tests list of the IS Code: the authoritative list for missing tests.
  const requiredList = input.isCodeId ? await fetchRequiredTests(input.isCodeId).catch(() => null) : null
  const requiredTests = requiredList?.lockedAt ? requiredList.tests.filter((t) => t.testedBy === 'Lab') : []
  if (requiredTests.length) sources.push(`Required Tests: Locked List of ${requiredTests.length} Laboratory Tests`)

  let standardText = ''
  let manualText = ''
  if (input.isCodeId) {
    onStep?.('Reading the Standard and the Product Manual (Standards Index)…')
    const indexed = await readFromStandardsIndex(
      input.isCodeId,
      indexQueryWords({ requiredTests, reportText: report.text, grade: `${row.gradeTypeVariety} ${row.sampleDescription}` }),
    )
    if (indexed) {
      standardText = indexed.standardText
      manualText = indexed.manualText
      sources.push(...indexed.sources)
    }
  }
  if (input.isCodeId && !standardText) {
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
    if (manual && !manualText) {
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
    requiredTests.length ? `${REQUIRED_RULES}\n=== REQUIRED TESTS (locked list) ===\n${requiredTestsBlock(requiredTests)}` : '',
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
      ...(input.useMainModel ? { useMainModel: true } : {}),
      ...(pictures.length ? { images: pictures } : {}),
    })
  // Without a vision model the pictures are refused: the OCR text alone is then checked.
  const { reply, model } = await ask(images).catch((err: unknown) => {
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
    model: model ?? '',
    reportPath: row.testReportStoragePath,
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
  return settleCheck(applyRequiredTests(check, requiredTests, raw.required_check ?? raw.requiredCheck), row)
}
