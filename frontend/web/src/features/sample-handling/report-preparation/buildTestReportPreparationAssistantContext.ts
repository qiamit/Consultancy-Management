import { supabase } from '@/lib/supabaseClient'
import type { TestReportCoverDetails } from './fetchTestReportCoverDetails'
import type { ReportResultRow } from './reportResultRows'
import { splitPartDRemarks } from './testReportPartDRemarks'
import { partBValuesList, PART_B_ROW_LABELS, type TestReportPartBDetails } from './testReportPartB'

export type ReportPreparationListRow = {
  id: string
  srfNumber: string | null
  dateReceiving: string | null
  clientName: string | null
  isCodeId: string | null
  isCodeLabel: string | null
  reportNumber: string | null
  draftNotes: string | null
  nablUlrNumber: string | null
}

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export const FULL_REVIEW_USER_COMMAND = `Full Review`

export const TEST_REPORT_FULL_REVIEW_INSTRUCTIONS = `You are the **Test Report Full Review Assistant** for an ISO 17025 laboratory (Clause 7.8).

When the user requests a **Full Review** (or equivalent), you MUST:

1. **Review Part A** — customer, IS details, sample identification, dates, section codes, description, declared value.
2. **Review Part B** — all supplementary information answers.
3. **Review Part C** — every test result row, cross-checked against the **attached IS standard PDF copies** (notebook context) for methods, clauses, units, and limits.
4. **Review Part D** — remarks and conformity statements.
5. **Review attached IS standard PDFs** — cite relevant clauses where used.

After Parts A–D narrative notes, include a **test-wise observation table** in markdown for **every Part C test**:

| Test Name | Specific Requirements | Pass / Fail | Remark For Fail with Justification |
|-----------|----------------------|-------------|-------------------------------------|
| … | … | Pass or Fail | Required when Fail; "—" when Pass |

End with:

## Final Verdict
**Status:** OK | NOT OK
**Summary:** (short paragraph)
**Blockers:** (bullet list if NOT OK; otherwise "None")

RULES:
- Advisory only — do not issue or save the report.
- If IS PDFs are missing, state that limitation in the table remarks and rely on structured context.
- Be specific; reference actual values from the draft report.`

export const TEST_REPORT_GENERAL_ASK_INSTRUCTIONS = `You are the **IS Code & Test Report Q&A Assistant** for an ISO 17025 laboratory.

Answer **general questions** about:
- The applicable **IS standard** (clauses, test methods, limits, terminology) using uploaded PDF copies when available.
- Test report practice (ISO/IEC 17025 Clause 7.8) and laboratory wording.
- How the linked IS code on this SRF relates to the user's question.

RULES:
- Advisory only — do not issue, save, or modify reports.
- For a **complete pre-issue review of Parts A–D**, tell the user to use the **Full Review of Report** tab.
- Cite IS clause numbers when referencing the standard PDF.
- If IS PDFs are missing, say so clearly.`

/** @deprecated Use TEST_REPORT_FULL_REVIEW_INSTRUCTIONS */
export const TEST_REPORT_PREPARE_DIALOG_INSTRUCTIONS = TEST_REPORT_FULL_REVIEW_INSTRUCTIONS

export const REPORT_PREP_SYSTEM_INSTRUCTIONS = `You are the **Test Report Preparation** assistant for an ISO 17025 laboratory (Clause 7.8).

RULES:
- Provide **advisory suggestions only** for drafting and issuing test reports. Do not claim official issuance.
- Use sample description, declared value, IS standard context, and consolidated results below.
- Help with report numbering, wording, conformity statements, and checklist before **Issue test report**.

Topics you may cover:
1. **Report completeness** — all sections/parameters included vs NABL scope.
2. **Results vs requirements** — summary for the test report body.
3. **Report number / draft notes** — naming conventions and internal notes.
4. **Pre-issue checklist** — what to verify before moving SRF to Issued Test Report.`

export function buildTestReportPreparationListContext(
  rows: ReportPreparationListRow[],
  search: string,
): string {
  const lines = [
    'Module: Test Report Preparation (Clause 7.8 — consolidate approved results and issue test report)',
    `SRFs ready for reporting: ${rows.length}`,
    search.trim() ? `Active search filter: "${search.trim()}"` : 'No search filter applied',
    '',
    'Workflow: Prepare → Save draft → Print draft → Issue test report → Issued Test Report module.',
    'Use **SRF Analysis** tab: enter an SRF number from the table for report-focused guidance on that SRF only.',
    '',
    'SRFs on screen (up to 30):',
  ]

  const slice = rows.slice(0, 30)
  if (slice.length === 0) {
    lines.push('(none — approve all sections in Results Under Review first)')
  } else {
    for (const r of slice) {
      lines.push(
        `- SRF=${fmt(r.srfNumber)} | client=${fmt(r.clientName)} | IS=${fmt(r.isCodeLabel)} | draft_report_no=${fmt(r.reportNumber)} | receiving=${fmt(r.dateReceiving)}`,
      )
    }
    if (rows.length > 30) lines.push(`… and ${rows.length - 30} more.`)
  }

  return lines.join('\n')
}

export function parseSrfFromMessage(message: string, knownSrfs: string[]): string | null {
  const trimmed = message.trim()
  if (!trimmed) return null

  const norm = (s: string) => s.trim().toLowerCase()
  const unique = [...new Set(knownSrfs.map((s) => s.trim()).filter(Boolean))]

  const tryMatch = (candidate: string): string | null => {
    const c = candidate.trim()
    if (!c) return null
    const n = norm(c)
    const exact = unique.find((s) => norm(s) === n)
    if (exact) return exact
    const partial = unique.filter((s) => norm(s).includes(n) || n.includes(norm(s)))
    if (partial.length === 1) return partial[0]!
    return null
  }

  const firstLine = trimmed.split('\n')[0]!.trim()
  const fromFirst = tryMatch(firstLine)
  if (fromFirst) return fromFirst

  for (const line of trimmed.split(/\n+/)) {
    const m = tryMatch(line.trim())
    if (m) return m
  }

  if (unique.length === 1 && trimmed.length < 48) return unique[0]!
  return tryMatch(trimmed) ?? (firstLine.length <= 64 ? firstLine : null)
}

export function findRowBySrf(
  rows: ReportPreparationListRow[],
  srf: string,
): ReportPreparationListRow | null {
  const n = srf.trim().toLowerCase()
  if (!n) return null
  const exact = rows.filter((r) => (r.srfNumber ?? '').trim().toLowerCase() === n)
  if (exact.length >= 1) return exact[0]!
  const partial = rows.filter((r) => {
    const s = (r.srfNumber ?? '').trim().toLowerCase()
    return s.includes(n) || n.includes(s)
  })
  if (partial.length === 1) return partial[0]!
  return null
}

export async function buildSrfReportAssistantContext(
  row: ReportPreparationListRow,
): Promise<string> {
  const { data: sampleRow } = await supabase
    .from('samples')
    .select(
      'sample_description, sample_declaration, test_report_number, test_report_draft_notes, test_report_nabl_ulr_number',
    )
    .eq('id', row.id)
    .maybeSingle()

  const sample = sampleRow as {
    sample_description?: string | null
    sample_declaration?: string | null
    test_report_number?: string | null
    test_report_draft_notes?: string | null
    test_report_nabl_ulr_number?: string | null
  } | null

  const { data: allocs } = await supabase
    .from('sample_allocations')
    .select('id, section_code, department')
    .eq('sample_id', row.id)

  const allocList = Array.isArray(allocs) ? allocs : []
  const allocIds = allocList.map((a: { id: string }) => a.id)

  let paramLines: string[] = []
  if (allocIds.length > 0) {
    const { data: tas } = await supabase
      .from('test_allocations')
      .select('id, sample_allocation_id')
      .in('sample_allocation_id', allocIds)
      .eq('sent_for_testing', true)

    const taList = Array.isArray(tas) ? tas : []
    const taIds = taList.map((t: { id: string }) => t.id)
    const allocById = new Map(
      allocList.map((a: { id: string; section_code: string; department: string | null }) => [
        a.id,
        { sectionCode: a.section_code, department: a.department },
      ]),
    )
    const taToAlloc = new Map(
      taList.map((t: { id: string; sample_allocation_id: string }) => [t.id, t.sample_allocation_id]),
    )

    if (taIds.length > 0) {
      const { data: params } = await supabase
        .from('test_allocation_parameters')
        .select('test_allocation_id, test_label, test_start_date, test_end_date, results')
        .in('test_allocation_id', taIds)

      for (const p of Array.isArray(params) ? params : []) {
        const pr = p as {
          test_allocation_id: string
          test_label?: string | null
          test_start_date?: string | null
          test_end_date?: string | null
          results?: string | null
        }
        const allocId = taToAlloc.get(pr.test_allocation_id)
        const sec = allocId ? allocById.get(allocId) : undefined
        paramLines.push(
          `- section=${fmt(sec?.sectionCode)} | dept=${fmt(sec?.department)} | test=${fmt(pr.test_label)} | start=${fmt(pr.test_start_date)} | end=${fmt(pr.test_end_date)} | results=${fmt(pr.results)}`,
        )
      }
    }
  }

  const body = [
    `SRF: ${fmt(row.srfNumber)}`,
    `Client: ${fmt(row.clientName)}`,
    `Report as per IS: ${fmt(row.isCodeLabel)}`,
    `Date of receiving: ${fmt(row.dateReceiving)}`,
    `Draft report number: ${fmt(sample?.test_report_number ?? row.reportNumber)}`,
    `Part D remarks: ${fmt(sample?.test_report_draft_notes ?? row.draftNotes)}`,
    `NABL ULR number: ${fmt(sample?.test_report_nabl_ulr_number ?? row.nablUlrNumber)}`,
    '',
    'Sample Description:',
    fmt(sample?.sample_description),
    '',
    'Declared Value:',
    fmt(sample?.sample_declaration),
    '',
    'Consolidated results (sent for testing):',
    paramLines.length > 0 ? paramLines.join('\n') : '(no parameter rows)',
  ].join('\n')

  return `${REPORT_PREP_SYSTEM_INSTRUCTIONS}\n\n--- SRF CONTEXT ---\n${body}`
}

export type TestReportPrepareDialogAssistantInput = {
  row: ReportPreparationListRow
  coverDetails: TestReportCoverDetails | null
  partBDetails: TestReportPartBDetails | null
  resultRows: ReportResultRow[]
  reportNumber: string
  nablUlrNumber: string
  draftNotes: string
}

function formatPartBBlock(partB: TestReportPartBDetails | null): string {
  if (!partB) return '(Part B not loaded)'
  const values = partBValuesList(partB)
  return PART_B_ROW_LABELS.map((label, i) => `- ${label}: ${values[i] ?? '—'}`).join('\n')
}

function formatPartCBlock(rows: ReportResultRow[]): string {
  if (rows.length === 0) return '(no Part C result rows)'
  const lines: string[] = []
  let lastSection = ''
  for (const r of rows) {
    if (r.sectionCode !== lastSection) {
      lastSection = r.sectionCode
      lines.push(`\n[Section ${r.sectionCode}]`)
    }
    lines.push(
      `  ${r.srNo}. ${fmt(r.testName)} | method/clause=${fmt(r.testMethodClause)} | unit=${fmt(r.unit)} | requirement=${fmt(r.specifiedRequirement)} | observed=${fmt(r.observedValue)} | uncertainty=${fmt(r.uncertainty)} | remark=${fmt(r.remark)} | scope=${fmt(r.scope)}`,
    )
  }
  return lines.join('\n')
}

function formatPartABlock(cover: TestReportCoverDetails | null): string {
  if (!cover) return '(Part A not loaded)'
  return [
    `Customer: ${fmt(cover.customerDetails)}`,
    `IS Details: ${fmt(cover.isDetails)}`,
    `Sample Code: ${fmt(cover.sampleCode)} | QR: ${fmt(cover.sampleQrCode)} | Nature: ${fmt(cover.natureOfSample)}`,
    `Batch: ${fmt(cover.batchNumber)} | Mfg date: ${fmt(cover.dateOfManufacturing)} | Party ref: ${fmt(cover.partyReferenceNo)}`,
    `Qty: ${fmt(cover.sampleQuantity)} | BIS Seal: ${fmt(cover.bisSeal)} | IO Sig: ${fmt(cover.ioSignature)}`,
    `Section codes: ${fmt(cover.sectionCodes)} | Section report no: ${fmt(cover.sectionReportNo)} | Report type: ${fmt(cover.reportType)}`,
    `Receipt: ${fmt(cover.dateOfSampleReceipt)} | Testing started: ${fmt(cover.dateOfTestingStarted)} | Completed: ${fmt(cover.dateOfTestingCompleted)}`,
    `Reporting date: ${fmt(cover.dateOfReporting)} | Reference report no: ${fmt(cover.referenceReportNo)} | Other info: ${fmt(cover.anyOtherInformation)}`,
    `Sample description: ${fmt(cover.sampleDescription)}`,
    `Declared value: ${fmt(cover.declaredValue)}`,
  ].join('\n')
}

export type TestReportAssistantMode = 'full_review' | 'general_ask'

const FULL_REVIEW_API_MESSAGE = `Perform a complete Full Review of this draft test report now.

Review Part A, Part B, Part C, and Part D in detail.
Cross-check all tests against the attached IS standard PDF copies.
Provide the required test-wise markdown table (Test Name | Specific Requirements | Pass / Fail | Remark For Fail with Justification) for every Part C test, then the Final Verdict.`

/** Expands shorthand "Full Review" commands to the full API instruction. */
export function expandFullReviewUserMessage(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  if (/^full\s*review(\s+of\s+(the\s+)?report)?\.?$/i.test(trimmed)) {
    return FULL_REVIEW_API_MESSAGE
  }
  return trimmed
}

/** Full draft test report snapshot for the Prepare dialog AI assistant. */
export function buildTestReportPrepareDialogAssistantContext(
  input: TestReportPrepareDialogAssistantInput,
  mode: TestReportAssistantMode = 'full_review',
): string {
  const { row, coverDetails, partBDetails, resultRows, reportNumber, nablUlrNumber, draftNotes } =
    input
  const partD = splitPartDRemarks(draftNotes, row.isCodeLabel)
  const partB = partBDetails ?? coverDetails?.partB ?? null

  const instructions =
    mode === 'full_review'
      ? TEST_REPORT_FULL_REVIEW_INSTRUCTIONS
      : TEST_REPORT_GENERAL_ASK_INSTRUCTIONS

  const body =
    mode === 'general_ask'
      ? [
          `SRF: ${fmt(row.srfNumber)}`,
          `Sample id: ${row.id}`,
          `IS Code (report): ${fmt(row.isCodeLabel)}`,
          `Client: ${fmt(row.clientName)}`,
          `Date of receiving: ${fmt(row.dateReceiving)}`,
          `Sample description: ${fmt(coverDetails?.sampleDescription)}`,
          `Declared value: ${fmt(coverDetails?.declaredValue)}`,
          '',
          'The user is in General Ask mode — answer IS standard and related questions. Full Parts A–D are in the system if needed but not attached unless the question requires them.',
        ].join('\n')
      : [
          `SRF: ${fmt(row.srfNumber)}`,
          `Sample id: ${row.id}`,
          `IS Code (report): ${fmt(row.isCodeLabel)}`,
          `Client (list): ${fmt(row.clientName)}`,
          `Date of receiving: ${fmt(row.dateReceiving)}`,
          `Draft report number (canonical …A): ${fmt(reportNumber) || fmt(row.reportNumber)}`,
          `NABL ULR: ${fmt(nablUlrNumber) || fmt(row.nablUlrNumber)}`,
          '',
          '=== Part A — Particulars of Sample ===',
          formatPartABlock(coverDetails),
          '',
          '=== Part B — Supplementary Information ===',
          formatPartBBlock(partB),
          '',
          '=== Part C — Test Results ===',
          formatPartCBlock(resultRows),
          '',
          '=== Part D — Remarks ===',
          `Line 1: ${partD.line1}`,
          `Line 2: ${partD.line2 || '(empty)'}`,
          '',
          'The user is editing this draft in the Test Report Prepare dialog before Save Draft or Issue.',
        ].join('\n')

  return `${instructions}\n\n--- DRAFT TEST REPORT ---\n${body}`
}
