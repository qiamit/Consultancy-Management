import { loadPdfjs } from '@/lib/pdfjsLoader'
import { loadIsCodeFileLinks, type IsCodeFileLink } from '@/features/masters/is-codes/loadIsCodeFileLinks'
import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import { pdfPagesToAiPictures } from '@/components/qi-assistant/aiImages'
import { ocrPdfPages } from '@/lib/ocrPdf'
import { createBisProjectFileUrls } from './bisProjectFilesApi'
import { sizeTableRows } from './sampleSizeTable'
import { gradeTablePages } from './sampleGradeTable'
import { designationRows, ROLLED_SECTION } from './sampleDesignationTable'
import { parseOslConformityCheck, type OslConformityCheck, type OslSampleRequirementRow } from './oslSampleRequirementsModel'
import {
  fetchIsCodeEdition,
  fetchProductManualPages,
  fetchStandardPage,
  fetchRequiredTests,
  pickStandardDocs,
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

type PdfRead = { text: string; ocr: boolean; scannedPages: number[] }

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
  return { text: cut(text, LIMITS[kind]), ocr: ocr.size > 0, scannedPages: [...ocr.keys()].sort((a, b) => a - b) }
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
1a. SAMPLE CONDITIONS: from the sample description, declared values, grade and size, list what decides which requirements apply — e.g. grade, nominal size / thickness, "Aluminium Killed" / "Silicon Killed" / "Semi-Killed", coated or not, class / type. Use them in every step below.
2. From the Indian Standard (with its amendments — an amendment replaces the clause it names), any REFERENCED STANDARD it points to (e.g. "steel conforming to IS 2062": its chemical table and notes then apply) and the Product Manual, find every requirement that applies to THIS sample's conditions, and work out the actual limit (tables, formulas, tolerances on declared or nominal values). Read the table NOTES: a note such as "when killed by aluminium alone, total aluminium ≥ 0.020 %; when killed by silicon alone, silicon ≥ 0.10 %" changes which elements are required for this sample.
2a. RAW-MATERIAL CHEMISTRY: when the declared values name a standard and grade ("as per Grade 5 of IS 10748", "Raw Material IS 10748 Gr 3"), the chemical limits and their notes (killed type, nitrogen, carbon equivalent, micro-alloying) come from THAT standard's row for that grade — never from another referenced standard. The Test Request only gives the declared facts (grade, killed type, micro alloys), not limits. A limit the Standard gives only for another process (e.g. seamless sections) does not apply to a welded sample. A clause, table or annex deleted by an amendment: requirement "Not Applicable — Deleted by Amd N", verdict "Pass".
2b. TABLES: never say what a table holds unless its rows are in the documents above. The SIZE TABLE ROWS block (when given) is complete — it has every row of this sample's size and of the next higher standard size, read by the app from the Standard (an amendment's substituted table already replaces the original). When the same table appears twice, an amendment's substituted table replaces the original printed later. When a requirement needs a table that is not in the documents, give that row verdict "Not Clear" and say in notes which table is missing — never fail a sample on a guessed table.
2c. OPTIONS: when the documents give one test more than one limit depending on a condition (grade, size range, a process such as mill straightened or as rolled, coating, killed type …), list every option in "options" and choose the one whose condition the sample's own words state (description, declared values, Test Request), quoting those words in "chosen_because". Never fall back to a default option when the sample states the condition. When the sample does NOT state the condition (e.g. the killed type is not declared), do not guess it from the results: give that row requirement "Depends on <condition> — Not Declared", verdict "Not Clear", and say in notes what must be declared — unless the result meets the limit of EVERY option, which is then "Pass" (the condition does not change the outcome). A designation states conditions too: CF… = cold formed, HF… = hot formed, ERW = electric resistance welded, GI / galvanized = zinc coated.
2d. REVISION AND BANDS: use only the tables of the Standard under check (the IS, part and year in the SAMPLE heading) — table numbers differ between revisions, so never take or cite another revision's table. Take the thickness / size band of a table from the sample's declared size (e.g. ISA 130X130X12 → t = 12 mm). A test the Standard's notes make optional or subject to agreement, not reported and not asked for in the Test Request, is not missing; when reported, check it.
2e. DIMENSIONS AND TOLERANCES: take them only from the documents — the clause of a tolerance / dimension standard for the sample's own product form (e.g. equal leg angles, not bulb angles; square hollow sections, not circular) — never from the laboratory's "specified" column. In standards read by OCR, "±" often appears as "f", "*", "t" or "+" before a number ("f 2 percent" = ± 2 percent).
2f. NOMINAL ONLY: when the documents give only a nominal value for a parameter (e.g. t, R1, R2 in the DESIGNATION ROW) and the tolerance standard has no tolerance for it for this product form, first look in the tolerance standard's clause for this product form; then give requirement exactly "Nominal <value> <unit> — No Tolerance Specified (IS <number> cl. <clause you checked>)" and verdict "Pass" when the result is within ±5 % of the nominal, else "Not Clear". Never "Fail" on a nominal-only value. When the documents give a tolerance (±, min / max, a percentage such as mass +5 / −3 %), apply it to the nominal instead.
2g. BY AGREEMENT: a requirement the Standard leaves to agreement between purchaser and manufacturer (exact length, coating, finish, end type …) with no agreed value in the Test Request or the declared values: requirement "By Agreement — Not Declared", verdict "Pass" (it is not Not Clear and not a failure).
3. Go through the LABORATORY REPORT PAGES and take EVERY test with its observed value, in the laboratory's order, one row each (the same test reported twice is one row). The Manak summary pages only list tests with "Test Report Attached": that text is never a result — take the value from the laboratory pages (chemical results may be on a separate laboratory page from the mechanical / dimensional ones; read all of them). Compare the reported value with the limit from step 2 yourself; never rely on the lab's own "conforms" remark. The report's own "specified requirement" column is a cross-check: where your limit differs from it, re-read the Standard's table row for this grade (for example Table 4 gives tensile strength, yield stress and elongation as separate columns) and say in notes which is right.
4. Missing tests: tests the Product Manual / Standard require the LABORATORY to do on THIS sample (its conditions from step 1a) that are not in the report. A test whose requirement does not apply to this sample's conditions (other grade / size / killed type / coating) is NOT missing: if the report gives it anyway, give the row requirement "Not Applicable — <reason>" and verdict "Pass". Tests the Product Manual leaves to the factory (for example on every pipe during production) are not missing.
4a. Sample Stage "SS": the Marking clause is not applicable — give the Marking row requirement "Not Applicable — SS Sample (No Licence Yet)", verdict "Pass", never list Marking as missing or as a failure.
5. Verdict: "Yes" = every result passes and no test is missing. "No" = any result fails or any required test is missing. "Undecided" = a deciding value cannot be read at all.

SCANNED REPORTS: the page pictures (each page may come as a top and a bottom half) are the primary source: read every value from the picture. The OCR text (read twice per page) is only a guide and may confuse digits (0↔8, 0↔6, 1↔7, 3↔8, 5↔S, "3.5"↔"15" when the decimal point is faint). PLAUSIBILITY: check each value against the sample's own size and the limit — e.g. a wall thickness reported for a 3.5 mm section cannot be 15 mm, a mass per metre must match the size — and when a reading is implausible, look at the picture again and take the reading that fits; say so in "notes". Use "Not Clear" only when neither the picture nor the OCR gives a plausible value.

FIELD FORMATS (keep each cell short, no sentences in the table):
- parameter: the test name in Title Case, without method or standard numbers ("Ultimate Tensile Strength").
- clause: the IS clause / table only ("9.1, Table 4"); add "Amd 6" when an amendment sets it.
- requirement: the limit for this sample with unit ("≤ 0.25 %", "≥ 450 MPa", "168.30 ± 0.75 % (167.04 – 169.56 mm)", "No Crack").
- result: the reported value with unit, exactly as the report gives it ("0.20 %", "486.90 MPa", "Satisfactory").
- verdict: "Pass", "Fail" or "Not Clear".
- options: only for a test whose limit depends on a condition — every option as {"condition": the documents' words naming when it applies, "requirement": its limit}; leave it out for a test with one limit.
- chosen_because: with "options", the exact words from the sample's description / declared values / Test Request that decide the option ("" when the sample does not state it).
- evidence: for every "Fail" row, the exact words copied from the documents (Standard, amendment, referenced standard, Product Manual or SIZE TABLE ROWS) that set the limit it fails — the table row or the clause sentence with the number, up to 200 characters, copied character for character; "" for other rows. A Fail without evidence that the app finds in the documents is not accepted.
- missing_tests: "Test Name (Clause x)".
- summary: one sentence with the verdict and the deciding reason.
- KEEP THE ANSWER SHORT: nothing outside the JSON, no reasoning written out, "requirement" and "result" cells under 60 characters each, no note that repeats a table row.
- notes: at most 8, one short sentence each: whether the sample matches the Test Request, every failure with its reason, missing tests, disagreement with the lab's remark, anything else the reviewer must know. OCR corrections: ONE note listing only the values you changed.
Before answering, re-check every row: for "≥ X" the result must be at least X; for "≤ X" at most X. Compare the numbers, not the words.
- sample: values as written in the report ("" when not given).

SELF-CHECK before answering: no result is "Test Report Attached"; every laboratory test appears once; each "≥ X" result is at least X and each "≤ X" at most X; the verdict follows step 5.

ANSWER: JSON only, no other text, exactly these keys. Example of the format (values are only an example):
{"sample":{"description":"ERW, Black, Fe 410, 168.3 mm OD × 4.5 mm","declared_values":"Silicon killed","batch_number":"B-12","date_of_manufacture":"12-10-2026"},"verdict":"No","summary":"Does not conform: Yield Strength 231 MPa is below the 235 MPa minimum.","results":[{"parameter":"Carbon","clause":"8.1, Table 2","requirement":"≤ 0.25 %","result":"0.18 %","verdict":"Pass"},{"parameter":"Yield Strength","clause":"9.1, Table 4","requirement":"≥ 235 MPa","result":"231 MPa","verdict":"Fail","evidence":"Fe 410 410 235 23"},{"parameter":"Straightness","clause":"10.7","requirement":"≤ 1/200 of length (5.0 mm)","result":"0.30 mm","verdict":"Pass","options":[{"condition":"mill straightened","requirement":"1/200 of length"},{"condition":"other than mill straightened","requirement":"1/600 of length"}],"chosen_because":"Mill Straightened"}],"missing_tests":["Flattening Test (Clause 9.2.1)"],"notes":["Sample details match the Test Request.","Yield Strength 231 MPa is below the 235 MPa minimum of Table 4.","Flattening Test required by the Product Manual is not reported."]}`

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
 * A reviewer types the value of a row the AI could not read ("Not Clear"): the row gets that value and its verdict
 * (from the limit when it is a simple number limit, else the one the reviewer chose), and the overall verdict follows
 * the same rule as the AI check (any Fail or missing test = No; any row still Not Clear = Undecided; else Yes).
 */
export function setResultByHand(
  check: OslConformityCheck,
  index: number,
  value: string,
  chosen?: 'Pass' | 'Fail',
): { check: OslConformityCheck; needsChoice: boolean } {
  const row = check.results[index]
  const result = value.trim()
  if (!row || !result) return { check, needsChoice: false }
  const verdict = numericVerdict({ ...row, result }) ?? chosen ?? null
  if (!verdict) return { check, needsChoice: true }
  const results = check.results.map((r, i) => (i === index ? { ...r, result, verdict } : r))
  const failed = results.some((r) => r.verdict === 'Fail') || check.missingTests.length > 0
  const unclear = results.some((r) => r.verdict === 'Not Clear')
  const overall = failed ? 'No' : unclear ? 'Undecided' : 'Yes'
  const note = `${row.parameter}: value set by hand to ${result} (${verdict}).`
  return {
    check: {
      ...check,
      results,
      verdict: overall,
      notes: [...check.notes, note],
      summary: overall === check.verdict ? check.summary : `${overall === 'Yes' ? 'Conforms' : overall === 'No' ? 'Does not conform' : 'Undecided'} after a value was set by hand.`,
    },
    needsChoice: false,
  }
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
function indexPagesText(pages: StandardPage[], budget: number): { text: string; count: number; refs: string[] } {
  const seen = new Set<string>()
  let text = ''
  let count = 0
  const refs: string[] = []
  for (const p of pages) {
    const body = p.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    const key = body.slice(0, 400)
    if (!body || seen.has(key)) continue
    seen.add(key)
    const block = `[${p.kind} — ${p.relpath.split('/').pop()} — page ${p.page}]\n${body}\n\n`
    if (text.length + block.length > budget) break
    text += block
    count += 1
    refs.push(`${p.relpath.split('/').pop()} p${p.page}`)
  }
  return { text, count, refs }
}

/** "IS 2062 Part 1 2025 - 00.pdf p3, p5, p9" — the pages sent, for the check's Sources. */
function pageList(refs: string[]): string {
  const byFile = new Map<string, string[]>()
  for (const r of refs) {
    const at = r.lastIndexOf(' p')
    const file = r.slice(0, at)
    byFile.set(file, [...(byFile.get(file) ?? []), r.slice(at + 1)])
  }
  return [...byFile.entries()].map(([f, ps]) => `${f} ${ps.join(', ')}`).join('; ')
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

const REQUIRED_RULES = `REQUIRED TESTS: the locked list below is authoritative for missing tests. For EVERY listed test give one entry in "required_check": {"test": the name exactly as listed, "applicable": false only when its "applies to" excludes this sample's grade / type / size (else true), "found": true when the laboratory report gives a result for it (under any name)}. "missing_tests" = the applicable listed tests with found false (add others only when the Standard clearly requires them). Use the listed requirement as the limit unless the Standard pages show an amended limit. Add "required_check" to the JSON answer.`

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
const ownNumbers = (folders: string[]) => new Set(folders.map((f) => f.match(/\d+/)?.[0]))
const isKey = (num: string, part?: string) => (part ? `IS ${num} Part ${part}` : `IS ${num}`)

/**
 * IS numbers the sample itself names — "Chemical Composition as per Grade 5 of IS 10748", "Raw Material IS 10748 Gr 3":
 * any IS number, whatever words come before it. These decide the raw material's limits, so they are always read.
 */
export function sampleNamedStandards(text: string, ownFolders: string[]): string[] {
  const own = ownNumbers(ownFolders)
  const out: string[] = []
  for (const m of text.matchAll(/\bIS\s*:?\s*(\d{2,5})(?:\s*\(?\s*Part\s*[-:]?\s*(\d+)\s*\)?)?/gi)) {
    const key = isKey(m[1], m[2])
    if (!own.has(m[1]) && !out.includes(key)) out.push(key)
  }
  return out
}

export type CitedStandard = { key: string; role: 'material' | 'coating' | 'coating-method' | 'tolerance' | 'dimension' | 'method' | 'other'; score: number }

/** Titles from the Standard's list of references: "IS 4736 : 1986 Specification for hot-dip zinc coatings on …". */
function referenceTitles(text: string): Map<string, string> {
  const titles = new Map<string, string>()
  const re = /\bIS\s*:?\s*(\d{2,5})(?:\s*\(\s*Part\s*(\d+)\s*\))?\s*:\s*(?:19|20)\d{2}\s+([A-Z][^\n]{8,140})/g
  for (const m of text.matchAll(re)) {
    const key = isKey(m[1], m[2])
    if (!titles.has(key)) titles.set(key, m[3].replace(/\s+IS\s*:?\s*\d{2,5}[\s\S]*$/, '').trim())
  }
  return titles
}

/**
 * Standards the Standard / Manual send the reader to, by what they decide. "Manufactured from hot rolled steel strip
 * conforming to IS 10748" (the material) ranks first however rarely it is cited; coating specifications ("the
 * requirement of mass of zinc coating shall be as per IS 4736") next, then coating test methods (IS 2633 uniformity,
 * IS 6745 mass); other test-method standards ("tensile test as per IS 1608") set no limit and come last. The title in
 * the Standard's own list of references settles what a standard is ("Method for …", "Specification for … zinc …").
 */
export function referencedStandards(text: string, ownFolders: string[]): CitedStandard[] {
  const own = ownNumbers(ownFolders)
  const titles = referenceTitles(text)
  const tally = new Map<string, { material: number; coating: number; tolerance: number; method: number; other: number }>()
  const bump = (key: string, field: 'material' | 'coating' | 'tolerance' | 'method' | 'other') => {
    const t = tally.get(key) ?? { material: 0, coating: 0, tolerance: 0, method: 0, other: 0 }
    t[field] += 1
    tally.set(key, t)
  }
  const re = /\b(?:conform(?:ing|s)?\s+to|as\s+per|in\s+accordance\s+with|requirements?\s+of|specified\s+in|given\s+in|according\s+to|refer)\s+(?:the\s+)?(?:requirements?\s+of\s+)?IS\s*:?\s*(\d{2,5})(?:\s*\(\s*Part\s*(\d+)\s*\))?/gi
  for (const m of text.matchAll(re)) {
    if (own.has(m[1])) continue
    const before = text.slice(Math.max(0, (m.index ?? 0) - 140), m.index ?? 0).toLowerCase()
    const near = before.slice(-60)
    const key = isKey(m[1], m[2])
    if (/requirement/.test(near) && /galvani|zinc|coat/.test(before)) bump(key, 'coating')
    else if (/\b(tests?|tested|testing|method|determin\w*|analysis|sampling|measured|procedure|practice|welding|weldability)\b/.test(near)) bump(key, 'method')
    else if (/toleranc|dimension/.test(before)) bump(key, 'tolerance')
    else if (/galvani|zinc|coat/.test(before)) bump(key, 'coating')
    else if (/(manufactured|made|produced|rolled)\s+from|\b(steel|strip|sheet|coil|plate|billet|bloom|wire rod|raw material)\b/.test(before)) bump(key, 'material')
    else bump(key, 'other')
  }
  // Listed in the references but never cited with a lead phrase (IS 2633): still known by its title.
  for (const key of titles.keys()) if (!tally.has(key) && !own.has(key.match(/\d+/)?.[0])) tally.set(key, { material: 0, coating: 0, tolerance: 0, method: 0, other: 0 })
  return [...tally.entries()]
    .map(([key, t]) => {
      const title = titles.get(key) ?? ''
      const isMethod = /^methods?\b|\bmethods? (of|for)\b/i.test(title)
      const isGeneral = /general requirements|glossary|terminology|code of practice/i.test(title)
      const isCoating = /zinc|coat|galvani/i.test(title)
      const isTolerance = /toleranc/i.test(title)
      const isDimension = !isTolerance && /\bdimensions?\b/i.test(title)
      let role: CitedStandard['role']
      if (isDimension && !isMethod) role = 'dimension'
      else if ((isTolerance || (t.tolerance > 0 && t.tolerance >= t.material)) && !isMethod) role = 'tolerance'
      else if (isCoating) role = isMethod ? 'coating-method' : 'coating'
      else if (isMethod) role = 'method'
      else if (isGeneral) role = 'other'
      else if (t.material) role = 'material'
      else if (t.coating) role = 'coating'
      else role = t.method > t.other ? 'method' : 'other'
      return { key, role, score: t.material * 10 + t.coating * 3 + t.tolerance * 3 + t.other + t.method * 0.2 }
    })
    .sort((x, y) => y.score - x.score)
}

const REFERENCED_WORDS =
  'chemical composition table notes killed aluminium silicon carbon manganese sulphur phosphorus nitrogen carbon equivalent micro alloying mechanical properties tensile yield elongation grade'
const COATING_WORDS = 'zinc coating mass uniformity thickness galvanized requirements table adherence'
const DIMENSION_WORDS =
  'tolerance tolerances dimensions length difference between out square squareness camber straightness twist weight mass thickness width depth radius toe root'
/** Section designations in the sample's words → the words a tolerance / dimension standard uses for that product. */
const PRODUCT_FORMS: Array<[RegExp, string]> = [
  [/\bISA\b|\bangles?\b/i, 'angle angles equal unequal leg legs'],
  [/\bIS[MLWH]B\b|\bbeams?\b|\bcolumns?\b/i, 'beam beams column flange web'],
  [/\bIS[MJL]C\b|\bchannels?\b/i, 'channel channels flange web'],
  [/\b(?:CF|HF)?[SR]HS\b|\bhollow\b/i, 'hollow section sections square rectangular'],
  [/\bCHS\b|\btubes?\b|\bpipes?\b/i, 'tube tubes pipe pipes circular outside diameter'],
  [/\bplates?\b/i, 'plate plates'],
  [/\bsheets?\b|\bstrips?\b|\bcoils?\b/i, 'sheet sheets strip coil'],
  [/\bbars?\b|\brounds?\b|\bTMT\b|\bwire rod\b/i, 'bar bars round rod'],
  [/\bflats?\b/i, 'flat flats'],
]
const productFormWords = (text: string) => PRODUCT_FORMS.filter(([re]) => re.test(text)).map(([, w]) => w).join(' ')
/** Pages / characters read per referenced standard, by why it is read. */
const REFERENCED_LIMITS = {
  named: { standards: 2, pages: 8, chars: 24_000 },
  material: { standards: 2, pages: 6, chars: 16_000 },
  coating: { standards: 3, pages: 4, chars: 8_000 },
  tolerance: { standards: 2, pages: 5, chars: 14_000 },
}

async function readFromStandardsIndex(
  isCodeId: string,
  words: string,
  conditionWords: string,
  /** The sample's declared values, description, variety and the Test Request's declared / raw-material lines. */
  declaredText: string,
  /** The sample is zinc coated (galvanized), so the coating standards the Standard cites are read too. */
  coated: boolean,
): Promise<{
  folders: string[]
  standardDocs: string[]
  standardText: string
  gradeText: string
  designationText: string
  manualText: string
  referencedText: string
  sources: string[]
} | null> {
  const folders = await fetchStandardFolders(isCodeId).catch(() => [] as string[])
  if (!folders.length) return null
  // Only the IS Code's own part and revision: one folder can hold IS 2062:2011, Part 1:2025 and Part 2:2026, whose
  // tables are numbered differently.
  const edition = await fetchIsCodeEdition(isCodeId).catch(() => null)
  const pick = await pickStandardDocs(folders, edition).catch(() => ({ standards: [] as string[], manuals: [] as string[] }))
  const [standardPages, manualPages] = await Promise.all([
    searchStandardPages(folders, words, INDEX_LIMITS.standardPages, ['Standard', 'Amendment'], pick.standards.length ? pick.standards : undefined).catch(() => []),
    fetchProductManualPages(folders, 40, pick.manuals.length ? pick.manuals : undefined).catch(() => []),
  ])
  const standard = indexPagesText(standardPages, INDEX_LIMITS.standard)
  const manual = indexPagesText(manualPages, INDEX_LIMITS.manual)
  if (!standard.text) return null
  // The declared grade's own table pages (chemistry, mechanical, notes), read by the app.
  const grade = await gradeTablePages(pick.standards, declaredText, new Set(standard.refs)).catch(() => ({ text: '', pages: [] as string[] }))
  const sources = [
    `Standard (Standards Index): ${standard.count} Pages — ${pageList(standard.refs)}`,
    ...(grade.pages.length ? [`Grade Table Pages (Standards Index): ${pageList(grade.pages)}`] : []),
    ...(manual.count ? [`Product Manual (Standards Index): ${manual.count} Pages — ${pageList(manual.refs)}`] : []),
  ]
  // The standard the sample's declared values name (e.g. IS 10748 Grade 5) sets the raw material's limits: always read,
  // and then other material standards the Standard cites are not (they would give a second, wrong set of limits).
  const named = sampleNamedStandards(declaredText, folders).slice(0, REFERENCED_LIMITS.named.standards)
  // The Standard's own pages are only its best matches; cite counts come from them and the whole of the manual.
  const cited = referencedStandards(`${standard.text}\n${manual.text}`, folders).filter((c) => !named.includes(c.key))
  const material = named.length ? [] : cited.filter((c) => c.role === 'material').slice(0, REFERENCED_LIMITS.material.standards)
  const coating = coated
    ? [...cited.filter((c) => c.role === 'coating'), ...cited.filter((c) => c.role === 'coating-method')].slice(0, REFERENCED_LIMITS.coating.standards)
    : []
  // Rolling / dimension tolerance standards (IS 1852, IS 808): searched by the sample's product form ("angle",
  // "hollow section") and dimension words, never by chemistry words.
  const tolerance = cited.filter((c) => c.role === 'tolerance').slice(0, REFERENCED_LIMITS.tolerance.standards)
  const form = productFormWords(declaredText)
  const plan: Array<{ key: string; why: string; words: string; limits: { pages: number; chars: number }; nextPage?: boolean }> = [
    ...named.map((key) => ({
      key,
      why: "named in the sample's declared values — its row for the declared grade and its notes set the raw material's chemical limits",
      words: `${REFERENCED_WORDS} ${conditionWords}`,
      limits: REFERENCED_LIMITS.named,
    })),
    ...material.map((c) => ({ key: c.key, why: 'the material the Standard says the product is made from', words: `${REFERENCED_WORDS} ${conditionWords}`, limits: REFERENCED_LIMITS.material })),
    ...coating.map((c) => ({ key: c.key, why: 'zinc coating requirements the Standard points to', words: `${COATING_WORDS} ${conditionWords}`, limits: REFERENCED_LIMITS.coating })),
    ...tolerance.map((c) => ({
      key: c.key,
      why: `dimension and rolling tolerances the Standard points to — use the clause for this sample's own product form${form ? ` (${form.split(' ')[0]})` : ''}`,
      words: `${DIMENSION_WORDS} ${form}`,
      limits: REFERENCED_LIMITS.tolerance,
      nextPage: true,
    })),
  ]
  let referencedText = ''
  for (const ref of plan) {
    const refFolders = ref.key.includes(' Part ') ? [ref.key, ref.key.replace(/ Part \d+$/, '')] : [ref.key]
    // A referenced standard is read in its latest revision (its folder may hold old ones too).
    const refPick = await pickStandardDocs(refFolders, null).catch(() => ({ standards: [] as string[], manuals: [] as string[] }))
    const pages = await searchStandardPages(refFolders, ref.words, ref.limits.pages, ['Standard', 'Amendment'], refPick.standards.length ? refPick.standards : undefined).catch(
      () => [] as StandardPage[],
    )
    // A tolerance standard whose best pages never name the sample's product form (an angle sample, a beam standard)
    // is not this product's: skip it.
    const formWord = form.split(' ')[0]
    if (ref.nextPage && formWord && !pages.some((p) => new RegExp(`\\b${formWord}`, 'i').test(p.text))) continue
    // A tolerance clause often runs on to the next page: add the page after each of the two best pages.
    if (ref.nextPage) {
      for (const p of pages.slice(0, 2)) {
        if (pages.some((q) => q.relpath === p.relpath && q.page === p.page + 1)) continue
        const next = await fetchStandardPage(p.relpath, p.page + 1).catch(() => null)
        if (next) pages.splice(pages.indexOf(p) + 1, 0, next)
      }
    }
    // The grade-wise chemistry / mechanical / coating tables decide the limits: those pages first, then the rest by rank.
    const isTable = (p: StandardPage) => /table\s*\d+[^\n]{0,120}(chemical composition|mechanical properties|coating|zinc)/i.test(p.text)
    const read = indexPagesText([...pages.filter(isTable), ...pages.filter((p) => !isTable(p))], ref.limits.chars)
    if (!read.text) continue
    referencedText += `--- ${ref.key} (${ref.why}) ---\n${read.text}`
    sources.push(`Referenced Standard (Standards Index, ${ref.key}): ${read.count} Pages — ${pageList(read.refs)}`)
  }
  // Nominal dimensions and mass of the sample's rolled section from a dimension standard (IS 808 for ISA / ISMB / ISMC
  // designations, or one the Standard cites as a dimension standard).
  const dimensionKeys = [
    ...cited.filter((c) => c.role === 'dimension').map((c) => c.key),
    ...(ROLLED_SECTION.test(declaredText) ? ['IS 808'] : []),
  ].filter((v, i, a) => a.indexOf(v) === i)
  let designationText = ''
  for (const key of dimensionKeys.slice(0, 2)) {
    const dimPick = await pickStandardDocs([key], null).catch(() => ({ standards: [] as string[], manuals: [] as string[] }))
    const rows = await designationRows(dimPick.standards, declaredText).catch(() => ({ text: '', pages: [] as string[] }))
    if (!rows.text) continue
    designationText += `${designationText ? '\n\n' : ''}--- ${key} ---\n${rows.text}`
    sources.push(`Designation Row (Standards Index, ${key}): ${pageList(rows.pages)}`)
  }
  return {
    folders,
    standardDocs: pick.standards,
    standardText: standard.text,
    gradeText: grade.text,
    designationText,
    manualText: manual.text,
    referencedText,
    sources,
  }
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Text for comparing a quote with the documents: case, spacing, punctuation and "×" / "x" do not matter. */
export const normEvidence = (v: string) =>
  v
    .toLowerCase()
    .replace(/[×*]/g, 'x')
    .replace(/\.(?=\s|$)/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    // "113.5 × 113.5 × 3" = "113.5x113.5x3"
    .replace(/(\d) ?x ?(?=\d)/g, '$1x')
    .trim()

/** The quote is in the documents: each part of it (split at "…" / "|") of 12+ characters is found word for word. */
export function evidenceFound(evidence: string, docsNorm: string): boolean {
  const parts = evidence
    .split(/…|\.\.\.|\s\|\s|;/)
    .map(normEvidence)
    .filter((part) => part.length >= 12)
  return parts.length > 0 && parts.every((part) => docsNorm.includes(part))
}

const overallOf = (check: OslConformityCheck): OslConformityCheck['verdict'] =>
  check.results.some((r) => r.verdict === 'Fail') || check.missingTests.length
    ? 'No'
    : check.results.some((r) => r.verdict === 'Not Clear')
      ? 'Undecided'
      : 'Yes'
const verdictWord = (v: OslConformityCheck['verdict']) => (v === 'Yes' ? 'Conforms' : v === 'No' ? 'Does not conform' : 'Undecided')

/**
 * A Fail must quote the rule it rests on: the app looks for the quote in the documents that were sent. A Fail whose
 * quote is not there (a guessed table, an invented limit) becomes "Not Clear" and goes to the review.
 */
export function checkFailEvidence(
  check: OslConformityCheck,
  rawResults: unknown,
  docsNorm: string,
): { check: OslConformityCheck; evidence: string[]; unbacked: number[] } {
  const rawRows = (Array.isArray(rawResults) ? rawResults : []).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
  const evidence = check.results.map((_, i) => text(rawRows[i]?.evidence))
  const unbacked: number[] = []
  const results = check.results.map((r, i) => {
    if (r.verdict !== 'Fail' || evidenceFound(evidence[i], docsNorm)) return r
    unbacked.push(i)
    return { ...r, verdict: 'Not Clear' as const }
  })
  if (!unbacked.length) return { check, evidence, unbacked }
  const notes = unbacked.map(
    (i) => `${check.results[i].parameter}: the Fail against ${check.results[i].requirement} is not backed by the documents (its quoted rule was not found) — checked again by the review.`,
  )
  return { check: { ...check, results, notes: [...check.notes, ...notes] }, evidence, unbacked }
}

/** Page header written by indexPagesText: "[Standard — IS 4923 2017 - 03.pdf — page 9]". */
const PAGE_HEADER = /(?=^\[(?:Standard|Amendment|Product Manual|Old version|Extra \(other\)) — [^\n]*page \d+\]$)/m

/**
 * The few document pages the second review needs: those holding a Fail row's quoted rule, its clause or table, or the
 * test's name — not the whole Standard again (that was ~60k tokens for a review of two rows). A long block without page
 * headers (a Standard read from its PDF) is cut to the passages around the matches.
 */
export function pickReviewPages(
  texts: string[],
  items: Array<{ parameter: string; clause: string; evidence: string }>,
  missing: string[],
  budget = 20_000,
): string {
  const fragments = items.flatMap((it) =>
    it.evidence
      .split(/…|\.\.\.|\s\|\s|;/)
      .map(normEvidence)
      .filter((f) => f.length >= 12),
  )
  const clauseKeys = items.flatMap((it) => normEvidence(it.clause).match(/\d+(?:\.\d+)+|table \d+|annex [a-z]/g) ?? [])
  const words = [...items.map((it) => it.parameter), ...missing.map((m) => m.split(' (')[0])]
    .flatMap((w) => normEvidence(w).split(' '))
    .filter((w) => w.length >= 4 && !/^(test|tests|total|value|side|with|from)$/.test(w))
  const hits = (norm: string) =>
    fragments.filter((f) => norm.includes(f)).length * 10 +
    clauseKeys.filter((k) => new RegExp(`(^|[^0-9.])${k.replace(/\./g, '\\.')}([^0-9]|$)`).test(norm)).length * 3 +
    [...new Set(words)].filter((w) => norm.includes(w)).length * 2
  const blocks = texts
    .flatMap((t) => t.split(PAGE_HEADER))
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const norm = normEvidence(b)
      let text = b
      if (b.length > 6_000) {
        // No page headers: keep ±1,500 characters around each match.
        const low = b.toLowerCase()
        const at = [...fragments, ...clauseKeys, ...words]
          .map((k) => low.indexOf(k.split(' ')[0]))
          .filter((i) => i >= 0)
          .sort((x, y) => x - y)
          .slice(0, 6)
        text = at.map((i) => b.slice(Math.max(0, i - 1_500), i + 1_500)).join('\n…\n') || b.slice(0, 3_000)
      }
      const amended = /^\[Amendment|amendment no/i.test(b.slice(0, 300)) ? 2 : 0
      const score = hits(norm)
      return { text, score: score ? score + amended : 0 }
    })
    .filter((b) => b.score > 0)
    .sort((x, y) => y.score - x.score)
  let out = ''
  for (const b of blocks) {
    if (out.length + b.text.length > budget) continue
    out += `${b.text}\n\n`
  }
  return out.trim()
}

export type RowOption = { condition: string; requirement: string }

const OPTION_NEGATION = /\b(not|non|without|other than|otherwise than|except|excluding)\b/
const OPTION_FALLBACK = /\b(others?|otherwise|all other|any other|remaining)\b/
const OPTION_STOP = new Set(
  'the and for with from that this shall when where which than case cases type types grade grades size sizes section sections tube tubes pipe pipes hollow steel sample samples product products having made other all any alone only used are its their such also'.split(
    ' ',
  ),
)
const stemOf = (w: string) => w.slice(0, 6)

/** The condition's own words (no negation, no filler, no numbers: size ranges are left to the AI). */
function conditionWords(condition: string): string[] {
  return normEvidence(condition)
    .replace(/\b(not|non|without|other than|otherwise than|except|excluding|otherwise|others?|remaining)\b/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !OPTION_STOP.has(w) && !/^\d/.test(w))
}

/**
 * Which of a test's options the sample's own words state — the same check for every Standard, no rules per Standard.
 * A positive option ("mill straightened", "silicon killed", "galvanized") whose words are all in the sample text is
 * stated by the sample; "without micro alloys" in the sample does not state "micro alloyed". Returns a hint when the
 * AI chose another option while the sample states this one, or quoted words the sample does not have.
 */
export function optionMismatch(
  options: RowOption[],
  requirement: string,
  chosenBecause: string,
  sampleText: string,
): string | null {
  if (options.length < 2) return null
  const sampleNorm = normEvidence(sampleText)
  const negated = new Set<string>()
  for (const m of sampleNorm.matchAll(/\b(?:without|non|not|no)\s+([a-z]+)(?:\s+([a-z]+))?/g)) {
    negated.add(stemOf(m[1]))
    if (m[2]) negated.add(stemOf(m[2]))
  }
  const stems = new Set(sampleNorm.split(' ').filter((w) => w.length >= 3 && !negated.has(stemOf(w))).map(stemOf))
  const reqNorm = normEvidence(requirement)
  const numbersOf = (v: string) => normEvidence(v).match(/\d+(?:[./]\d+)?/g) ?? []
  const scored = options.map((o) => {
    const cond = normEvidence(o.condition)
    const words = conditionWords(o.condition)
    const positive = !OPTION_NEGATION.test(cond) && !OPTION_FALLBACK.test(cond)
    const stated = positive && words.length > 0 && words.every((w) => stems.has(stemOf(w)))
    const nums = numbersOf(o.requirement)
    const optNorm = normEvidence(o.requirement)
    const chosen = nums.length > 0 ? nums.every((n) => reqNorm.includes(n)) : optNorm.length >= 3 && reqNorm.includes(optNorm)
    return { o, stated, chosen }
  })
  const statedOpts = scored.filter((x) => x.stated)
  const chosen = scored.filter((x) => x.chosen)
  // Two options both fully stated (or the same numbers in two options) — too unclear for the app to judge.
  if (statedOpts.length === 1 && chosen.length === 1 && !chosen[0].stated) {
    const want = statedOpts[0].o
    return `The sample states "${want.condition}", so the option "${want.condition}: ${want.requirement}" applies — not "${chosen[0].o.condition}: ${chosen[0].o.requirement}".`
  }
  const because = normEvidence(chosenBecause)
  if (because.length >= 5 && !sampleNorm.includes(because)) {
    return `The words "${chosenBecause}" given for choosing this option are not in the sample's description, declared values or Test Request.`
  }
  return null
}

/** Rows whose chosen option the sample's own words contradict: Not Clear, and sent to the review with the hint. */
export function checkOptionChoices(
  check: OslConformityCheck,
  rawResults: unknown,
  sampleText: string,
): { check: OslConformityCheck; flagged: number[]; hints: Record<number, string>; options: Record<number, RowOption[]> } {
  const rawRows = (Array.isArray(rawResults) ? rawResults : []).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
  const flagged: number[] = []
  const passEvery: number[] = []
  const hints: Record<number, string> = {}
  const options: Record<number, RowOption[]> = {}
  check.results.forEach((r, i) => {
    const raw = rawRows[i]
    const opts = (Array.isArray(raw?.options) ? (raw.options as unknown[]) : [])
      .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === 'object')
      .map((o) => ({ condition: text(o.condition), requirement: text(o.requirement) }))
      .filter((o) => o.condition && o.requirement)
    if (opts.length < 2) return
    options[i] = opts
    // A row left Not Clear for an undeclared condition, whose result meets every option's limit: the condition does
    // not change the outcome, so it is Pass.
    if (r.verdict === 'Not Clear' && opts.every((o) => numericVerdict({ ...r, requirement: o.requirement }) === 'Pass')) {
      passEvery.push(i)
      return
    }
    const hint = optionMismatch(opts, r.requirement, text(raw?.chosen_because ?? raw?.chosenBecause), sampleText)
    if (!hint) return
    flagged.push(i)
    hints[i] = hint
  })
  if (!flagged.length && !passEvery.length) return { check, flagged, hints, options }
  const results = check.results.map((r, i) =>
    flagged.includes(i) ? { ...r, verdict: 'Not Clear' as const } : passEvery.includes(i) ? { ...r, verdict: 'Pass' as const } : r,
  )
  const notes = [
    ...flagged.map((i) => `${check.results[i].parameter}: app check — ${hints[i]} Checked again by the review.`),
    ...passEvery.map(
      (i) => `${check.results[i].parameter}: ${check.results[i].result} meets the limit of every option (${(options[i] ?? []).map((o) => o.requirement).join(' / ')}), so the undeclared condition does not change the outcome — Pass.`,
    ),
  ]
  const next = { ...check, results, notes: [...check.notes, ...notes] }
  const verdict = passEvery.length ? overallOf(next) : check.verdict
  return {
    check: { ...next, verdict, summary: verdict === check.verdict ? check.summary : `${verdictWord(verdict)} after the app's option check.` },
    flagged,
    hints,
    options,
  }
}

/** Owner's rule: a nominal-only value (no tolerance anywhere for this product form) within ±5 % of the nominal is Pass. */
export const NOMINAL_BAND = 0.05

/**
 * A row the AI marked nominal-only ("Nominal 10.0 mm — No Tolerance Specified (IS 1852 cl. 4.3)"): the app confirms the
 * clause it checked is named and is in the documents sent, then decides by the band — Pass within ±5 %, otherwise Not
 * Clear (check by hand). Never Fail. Null for any other row.
 */
export function nominalOnlyVerdict(r: CheckResult, docsNorm: string): { verdict: 'Pass' | 'Not Clear'; note?: string } | null {
  const req = r.requirement
  const nominalMatch = req.match(/^\s*nominal\s*:?\s*(\d+(?:\.\d+)?)/i)
  if (!nominalMatch || !/no\s+tolerance/i.test(req)) return null
  const nominal = Number(nominalMatch[1])
  const std = req.match(/\bIS\s*:?\s*(\d{2,5})/i)?.[1]
  const clause = req.match(/\b(?:cl(?:ause)?)\.?\s*(\d+(?:\.\d+)+|\d+)/i)?.[1]
  const clauseFound = clause ? new RegExp(`(^|[^0-9.])${clause.replace(/\./g, '\\.')}([^0-9]|$)`).test(docsNorm) : false
  if (!std || !clause || !docsNorm.includes(`is ${std}`) || !clauseFound) {
    return {
      verdict: 'Not Clear',
      note: `${r.parameter}: "no tolerance specified" is not confirmed — the tolerance standard's clause checked is not named or not in the documents read; check by hand.`,
    }
  }
  const values = (stripUnitPowers(r.result.replace(/,/g, '')).match(NUMBER) ?? [])
    .map((v) => Math.abs(Number(v)))
    .filter((v) => Number.isFinite(v) && v > 0)
  if (!values.length || !nominal) return { verdict: 'Not Clear', note: `${r.parameter}: no measured value to compare with the nominal ${nominal}; check by hand.` }
  if (values.every((v) => Math.abs(v - nominal) <= nominal * NOMINAL_BAND)) return { verdict: 'Pass' }
  return {
    verdict: 'Not Clear',
    note: `${r.parameter}: ${r.result} is more than ±${NOMINAL_BAND * 100} % from the nominal ${nominal} (no tolerance specified) — check by hand.`,
  }
}

/** The nominal rule over every row; the overall verdict follows when a row changes. */
export function applyNominalRule(check: OslConformityCheck, docsNorm: string): OslConformityCheck {
  const notes: string[] = []
  let changed = false
  const results = check.results.map((r) => {
    const n = nominalOnlyVerdict(r, docsNorm)
    if (!n) return r
    if (n.note) notes.push(n.note)
    if (n.verdict === r.verdict) return r
    changed = true
    return { ...r, verdict: n.verdict }
  })
  if (!changed && !notes.length) return check
  const next = { ...check, results, notes: [...check.notes, ...notes] }
  const verdict = overallOf(next)
  return {
    ...next,
    verdict,
    summary: verdict === check.verdict ? check.summary : `${verdictWord(verdict)} after the app's nominal-value check (±${NOMINAL_BAND * 100} % where no tolerance is specified).`,
  }
}

const REVIEW_INSTRUCTIONS = `ROLE: You are a second BIS reviewer. A first reviewer checked one sample's Test Report against the Indian Standard and marked the ITEMS below as failing (or as missing tests). Check ONLY those items again, using ONLY the documents below (the Standard with its amendments, referenced standards, the Product Manual, the SIZE TABLE ROWS). The results were read from the Test Report and are correct: check the RULE — which requirement applies to THIS sample (its grade, size, killed type, coating, stage) and its actual limit.
RULES: when an item carries an APP CHECK, the sample's own words decide which option applies: use the option whose condition they state. An amendment's substituted clause or table replaces the original (the original is often printed later in the same file). Never assume what a table holds: use only the rows shown; the SIZE TABLE ROWS block is complete for this sample's size and the next higher size. Compare the numbers yourself (for "≥ X" the result must be at least X).
For each row: "requirement" for this sample with unit; "verdict" comparing the given result with it ("Pass", "Fail", or "Not Clear" when the documents do not give the rule); "evidence": the exact words copied from the documents that set the limit (a table row or the clause sentence with the number, up to 200 characters, character for character); "reason": one short sentence.
For each missing test: "missing": true only when the documents require the LABORATORY to do it on THIS sample; false when it does not apply to this sample's conditions or is left to the factory; "reason": one short sentence.
ANSWER: JSON only: {"rows":[{"parameter":"","requirement":"","verdict":"Pass","evidence":"","reason":""}],"missing_tests":[{"test":"","missing":false,"reason":""}]}`

/**
 * Second look, by the same (cheap) model, at only the failed rows and the AI's own missing tests: one short call with
 * the documents and no report or pictures. A Fail stays only with a rule the app finds in the documents.
 */
async function reviewFails(input: {
  check: OslConformityCheck
  rows: number[]
  evidence: string[]
  /** App-check hints and the AI's options, by row (rows whose chosen option the sample contradicts). */
  hints?: Record<number, string>
  options?: Record<number, RowOption[]>
  sampleText?: string
  reviewMissing: boolean
  facts: string
  documents: string
  docsNorm: string
  useMainModel?: boolean
}): Promise<OslConformityCheck> {
  const { check, rows } = input
  const items = rows.map((i) => {
    const r = check.results[i]
    const opts = input.options?.[i]
    return `- ${r.parameter} | Clause ${r.clause || '—'} | Requirement given: ${r.requirement} | Result: ${r.result}${input.evidence[i] ? ` | First reviewer's evidence: "${input.evidence[i]}"` : ''}${opts ? ` | Options: ${opts.map((o) => `${o.condition} → ${o.requirement}`).join('; ')}` : ''}${input.hints?.[i] ? ` | APP CHECK: ${input.hints[i]}` : ''}`
  })
  const missing = input.reviewMissing ? check.missingTests : []
  if (!items.length && !missing.length) return check
  const message = [
    REVIEW_INSTRUCTIONS,
    `=== SAMPLE ===\n${input.facts}\n- As identified in the report: ${check.sample.description}${check.sample.declaredValues ? ` | ${check.sample.declaredValues}` : ''}`,
    items.length ? `=== ITEMS: ROWS TO CHECK AGAIN (failed, or an option the sample contradicts) ===\n${items.join('\n')}` : '',
    missing.length ? `=== ITEMS: MISSING TESTS ===\n${missing.map((m) => `- ${m}`).join('\n')}` : '',
    input.documents,
  ]
    .filter(Boolean)
    .join('\n\n')
  const { reply, model } = await sendQiAssistantMessage({
    page: 'bis/sample-conformity',
    message,
    responseFormat: 'json_object',
    history: [],
    ...(input.useMainModel ? { useMainModel: true } : {}),
  })
  const raw = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
  const byName = new Map(list(raw.rows).map((x) => [normName(text(x.parameter)), x]))
  const changes: string[] = []
  const results = check.results.map((r, i) => {
    if (!rows.includes(i)) return r
    const x = byName.get(normName(r.parameter))
    if (!x) return r
    const requirement = text(x.requirement) || r.requirement
    const said = x.verdict === 'Pass' || x.verdict === 'Fail' ? x.verdict : 'Not Clear'
    let verdict: 'Pass' | 'Fail' | 'Not Clear' = numericVerdict({ ...r, requirement }) ?? said
    if (verdict === 'Fail' && !evidenceFound(text(x.evidence) || input.evidence[i], input.docsNorm)) verdict = 'Not Clear'
    // A row sent for its option: the review's limit must be the option the sample states.
    const opts = input.options?.[i]
    if (input.hints?.[i] && opts && optionMismatch(opts, requirement, '', input.sampleText ?? '')) verdict = 'Not Clear'
    if (verdict !== r.verdict || requirement !== r.requirement) {
      changes.push(`${r.parameter}: ${r.result} against ${requirement} — ${verdict}${text(x.reason) ? ` (${text(x.reason)})` : ''}.`)
    }
    return { ...r, requirement, verdict }
  })
  const testKey = (v: string) => normName(v.split(' (')[0].split(' — ')[0])
  const dropped = new Set(
    list(raw.missing_tests)
      .filter((x) => x.missing === false)
      .map((x) => testKey(text(x.test))),
  )
  const missingTests = check.missingTests.filter((m) => {
    if (!missing.includes(m) || !dropped.has(testKey(m))) return true
    changes.push(`${m}: not required for this sample.`)
    return false
  })
  const reviewed = { ...check, results, missingTests }
  const verdict = overallOf(reviewed)
  const note = `Second review (${model ?? 'AI'}) of ${items.length} row(s)${missing.length ? ` and ${missing.length} missing test(s)` : ''}: ${changes.length ? changes.join(' ') : 'no change.'}`
  return {
    ...reviewed,
    verdict,
    notes: [...check.notes, note],
    summary: verdict === check.verdict ? check.summary : `${verdictWord(verdict)} after the second review: ${changes.join(' ')}`,
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
  // Pictures of the scanned (laboratory) pages, not just the first pages: Manak's own text pages often come first.
  // Up to 4 pages go as top and bottom halves at full size, so small table figures stay readable.
  const scanned = report.scannedPages
  const images = report.ocr
    ? await pdfPagesToAiPictures(reportFile, scanned, { halves: scanned.length <= REPORT_IMAGES / 2, maxPictures: REPORT_IMAGES }).catch(
        () => [] as string[],
      )
    : []
  if (!report.text.trim() && !images.length) throw new Error('The Test Report PDF has no readable text.')
  sources.push(`Test Report: ${row.testReportFileName || 'attached'}${report.ocr ? ' (scanned — read by OCR)' : ''}`)

  let requestText = ''
  if (row.testRequestStoragePath.trim()) {
    onStep?.('Reading the Test Request…')
    const request = await storedFile(row.testRequestStoragePath, row.testRequestFileName || 'Test_Request.pdf')
      .then((f) => readPdf(f, 'request', 'Test Request', onStep))
      .catch(() => ({ text: '', ocr: false, scannedPages: [] as number[] }))
    requestText = request.text
    if (requestText) sources.push(`Test Request: ${row.testRequestFileName || 'attached'}${request.ocr ? ' (scanned — read by OCR)' : ''}`)
  }

  // The locked Required Tests list of the IS Code: the authoritative list for missing tests.
  const requiredList = input.isCodeId ? await fetchRequiredTests(input.isCodeId).catch(() => null) : null
  const requiredTests = requiredList?.lockedAt ? requiredList.tests.filter((t) => t.testedBy === 'Lab') : []
  if (requiredTests.length) sources.push(`Required Tests: Locked List of ${requiredTests.length} Laboratory Tests`)

  let standardText = ''
  let manualText = ''
  let referencedText = ''
  let sizeText = ''
  let gradeText = ''
  let designationText = ''
  if (input.isCodeId) {
    onStep?.('Reading the Standard and the Product Manual (Standards Index)…')
    const conditionWords = `${row.gradeTypeVariety} ${row.sampleDescription} ${row.declaredValue}`
    // The Test Request's own declared / raw-material lines (not its list of test methods).
    const requestDeclared = requestText
      .split('\n')
      .filter((l) => /declared|raw\s*material|grade|killed/i.test(l) && !/\b(test|method)\b/i.test(l))
      .join('\n')
    const coated = /galvani[sz]|zinc\s*coat|\bGI\b|\bG\.I\./i.test(`${conditionWords}\n${requestDeclared}\n${report.text.slice(0, 20_000)}`)
    const indexed = await readFromStandardsIndex(
      input.isCodeId,
      indexQueryWords({ requiredTests, reportText: report.text, grade: conditionWords }),
      conditionWords,
      `${conditionWords}\n${requestDeclared}`,
      coated,
    )
    if (indexed) {
      standardText = indexed.standardText
      gradeText = indexed.gradeText
      designationText = indexed.designationText
      manualText = indexed.manualText
      referencedText = indexed.referencedText
      sources.push(...indexed.sources)
      // The size table rows of this sample's size and the next higher size, read by the app (not left to the AI).
      const size = await sizeTableRows(indexed.folders, `${conditionWords} ${requestText.slice(0, 4000)}`, indexed.standardDocs).catch(() => ({ text: '', rows: 0 }))
      if (size.text) {
        sizeText = size.text
        sources.push(`Size Table (Standards Index): ${size.rows} Rows for This Size and the Next Higher Size`)
      }
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
        .catch(() => ({ text: '', ocr: false, scannedPages: [] as number[] }))
      standardText = read.text
      if (standardText) sources.push(`Standard: ${standard.file_name}${read.ocr ? ' (scanned — read by OCR)' : ''}`)
    }
    if (manual && !manualText) {
      const read = await fetchFile(manual.url!, manual.file_name)
        .then((f) => readPdf(f, 'manual', 'Product Manual', onStep))
        .catch(() => ({ text: '', ocr: false, scannedPages: [] as number[] }))
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
    sizeText ? `=== SIZE TABLE ROWS (read by the app from the Standard's size tables; complete for this size and the next higher size) ===\n${sizeText}` : '',
    designationText
      ? `=== DESIGNATION ROW (read by the app from the dimension standard: this section's nominal mass and dimensions — the tolerance standard's tolerances apply to these nominal values) ===\n${designationText}`
      : '',
    requestText ? `=== TEST REQUEST ===\n${requestText}` : '',
    `=== TEST REPORT${report.ocr ? ' (scanned, read by OCR twice per page — figures may have OCR mistakes such as 0↔8, 0↔6, 1↔I: read 1 has the more reliable digits; compare both reads, take the one that fits the units and limits, and prefer the page pictures when attached)' : ''} ===\n${report.text || '(scanned — see the attached page pictures)'}`,
    gradeText ? `=== GRADE TABLE PAGES (read by the app: the tables of the Standard under check that list the declared grade, with the page before a continued table) ===\n${gradeText}` : '',
    standardText ? `=== INDIAN STANDARD ===\n${standardText}` : '',
    referencedText ? `=== REFERENCED STANDARD (its tables and notes apply where the Standard points to it) ===\n${referencedText}` : '',
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
      // Scanned reports too stay on the Model for Document Checks: the size table, the evidence check and the review
      // below keep a cheap model from failing a sample on a wrong rule. "Re-Check with Main Model" is there when needed.
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
  const settled = settleCheck(applyRequiredTests(check, requiredTests, raw.required_check ?? raw.requiredCheck), row)

  // A Fail must rest on a rule found in the documents; failed rows (and the AI's own missing tests when there is no
  // locked list) get one short second look by the same model.
  const documents = [
    sizeText ? `=== SIZE TABLE ROWS (complete for this size and the next higher size) ===\n${sizeText}` : '',
    designationText ? `=== DESIGNATION ROW ===\n${designationText}` : '',
    requiredTests.length ? `=== REQUIRED TESTS (locked list) ===\n${requiredTestsBlock(requiredTests)}` : '',
    gradeText ? `=== GRADE TABLE PAGES ===\n${gradeText}` : '',
    standardText ? `=== INDIAN STANDARD ===\n${standardText}` : '',
    referencedText ? `=== REFERENCED STANDARD ===\n${referencedText}` : '',
    manualText ? `=== PRODUCT MANUAL ===\n${manualText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const docsNorm = normEvidence(documents)
  // Nominal-only rows (no tolerance for this product form) are decided by the ±5 % band, never Fail.
  const nominaled = applyNominalRule(settled, docsNorm)
  const evidenced = checkFailEvidence(nominaled, raw.results, docsNorm)
  // The option a row's limit was taken from must be the one the sample's own words state.
  const sampleText = [sampleFacts(row), check.sample.description, check.sample.declaredValues, requestText.slice(0, 8_000)].join('\n')
  const chosen = checkOptionChoices(evidenced.check, raw.results, sampleText)
  const backed = { ...evidenced, check: chosen.check }
  const failedRows = backed.check.results
    .map((r, i) => (r.verdict === 'Fail' || backed.unbacked.includes(i) || chosen.flagged.includes(i) ? i : -1))
    .filter((i) => i >= 0)
  const reviewMissing = !requiredTests.length && backed.check.missingTests.length > 0
  if (!failedRows.length && !reviewMissing) return settleCheck(backed.check, row)
  onStep?.('AI is reviewing the failed results…')
  const reviewPages = pickReviewPages(
    [gradeText, standardText, referencedText, manualText],
    failedRows.map((i) => ({ ...backed.check.results[i], evidence: backed.evidence[i] ?? '' })),
    reviewMissing ? backed.check.missingTests : [],
  )
  const reviewDocuments = [
    sizeText ? `=== SIZE TABLE ROWS (complete for this size and the next higher size) ===\n${sizeText}` : '',
    designationText ? `=== DESIGNATION ROW ===\n${designationText}` : '',
    requiredTests.length ? `=== REQUIRED TESTS (locked list) ===\n${requiredTestsBlock(requiredTests)}` : '',
    reviewPages ? `=== DOCUMENT PAGES FOR THESE ITEMS (Standard, amendments, referenced standards, Product Manual) ===\n${reviewPages}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const reviewed = await reviewFails({
    check: backed.check,
    rows: failedRows,
    evidence: backed.evidence,
    hints: chosen.hints,
    options: chosen.options,
    sampleText,
    reviewMissing,
    facts: sampleFacts(row),
    // The pages for these items only; the evidence is still checked against all the documents.
    documents: reviewPages ? reviewDocuments : documents,
    docsNorm,
    useMainModel: input.useMainModel,
  }).catch((err: unknown) => ({
    ...backed.check,
    notes: [...backed.check.notes, `The second review could not run (${err instanceof Error ? err.message : String(err)}): check the failed rows by hand.`],
  }))
  return settleCheck(reviewed, row)
}
