import { buildConsentLetterPrintStylesCss } from './buildConsentLetterPrintStylesCss'
import { buildPrintStylesCss } from './buildPrintStylesCss'
import { formatConsentLetterClientDisplayLine } from './consentLetterDefaults'
import type { ConsentLetterPrintContext } from './fetchConsentLetterPrintContext'
import {
  formatSignatureDesignationLine,
  type TestReportSignature,
} from '@/features/settings/lab-settings/printSettingsTypes'
import { formatIsCodeLabelFromParts, normalizeIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import { digitalSignatureStampFields } from './digitalSignatureStamp'

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatIsCodeDisplay(
  isCodeLabel: string | null | undefined,
  isNumber: string,
  revisionYear: string | null,
): string {
  const label = normalizeIsCodeLabel(isCodeLabel)
  if (label) return label
  return formatIsCodeLabelFromParts(isNumber, revisionYear) || '—'
}

function imgTag(url: string, alt: string): string {
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`
}

function buildConsentLetterTestParameterRows(
  testParameterNames: string[],
  clauseSummary: string,
): Array<{ testName: string; clauseNo: string }> {
  const fallbackClause = clauseSummary.trim() || '—'
  const clauseParts = fallbackClause
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^relevant clause/i.test(part))

  if (testParameterNames.length === 0) {
    return [{ testName: '—', clauseNo: clauseParts[0] ?? fallbackClause }]
  }

  return testParameterNames.map((testName, index) => {
    let clauseNo = '—'
    if (clauseParts.length === testParameterNames.length) {
      clauseNo = clauseParts[index] ?? '—'
    } else if (clauseParts.length === 1) {
      clauseNo = clauseParts[0]
    } else if (clauseParts.length > 0) {
      clauseNo = clauseParts[index] ?? clauseParts[clauseParts.length - 1] ?? '—'
    }
    return { testName, clauseNo }
  })
}

function buildTestParameterTableRows(
  testParameterNames: string[],
  clauseSummary: string,
): string {
  const rows = buildConsentLetterTestParameterRows(testParameterNames, clauseSummary)
  return rows
    .map(
      (row, index) => `<tr>
          <td class="num">${index + 1}</td>
          <td class="param-name">${escapeHtml(row.testName)}</td>
          <td class="clause">${escapeHtml(row.clauseNo)}</td>
        </tr>`,
    )
    .join('\n')
}

function buildSignatureBlock(signatures: TestReportSignature[]): string {
  const sig = signatures.find((s) => s.name.trim() || s.designation.trim()) ?? signatures[0]
  const stamp = digitalSignatureStampFields({
    roleLabel: sig?.roleLabel ?? 'Approved By',
    name: sig?.name ?? '',
    designation: sig ? formatSignatureDesignationLine(sig) : 'Quality Manager',
  })
  const roleHtml = stamp.roleLabel
    ? `<div class="report-signature-role">${escapeHtml(stamp.roleLabel)}</div>`
    : ''
  return `<div class="consent-block closing">
    <div class="report-signature-cell">
      ${roleHtml}
      <div class="report-signature-line" aria-hidden="true"></div>
      <div class="report-signature-name">${escapeHtml(stamp.name)}</div>
      <div class="report-signature-designation">${escapeHtml(stamp.designation)}</div>
    </div>
  </div>`
}

export type BuildConsentLetterHtmlInput = {
  lab: ConsentLetterPrintContext['lab']
  clientName: string
  clientAddress: string
  consentLetterNo: string
  letterDate: string
  isCodeLabel?: string | null
  isNumber: string
  revisionYear: string | null
  productTitle: string
  testParameterNames: string[]
  clauseSummary: string
  print: ConsentLetterPrintContext
}

function buildConsentLetterBody(input: BuildConsentLetterHtmlInput): string {
  const clauseText = input.clauseSummary.trim() || 'Relevant Clause of Correspondence IS'
  const isCodeText = formatIsCodeDisplay(input.isCodeLabel, input.isNumber, input.revisionYear)
  const productTitle = input.productTitle.trim() || '—'
  const labName = input.lab.labName.trim() || 'Quality International Research & Laboratories Private Limited'

  return `
  <div class="consent-block">
    <hr class="consent-section-rule" aria-hidden="true" />
    <table class="meta-table" role="presentation">
      <tr>
        <td><strong>Consent Letter No :</strong> ${escapeHtml(input.consentLetterNo)}</td>
        <td class="meta-right"><strong>Date :</strong> ${escapeHtml(input.letterDate)}</td>
      </tr>
    </table>
  </div>

  <div class="consent-block client-block">${escapeHtml(formatConsentLetterClientDisplayLine(input.clientName, input.clientAddress))}</div>

  <div class="consent-block is-spec-block">
    <p><strong>IS Title :</strong> ${escapeHtml(productTitle)}</p>
    <p><strong>IS Code :</strong> ${escapeHtml(isCodeText)}</p>
  </div>

  <p class="consent-block subject">
    <strong>Subject:</strong> Consent Letter for Testing of Samples as per Applicable Indian Standards
    (${escapeHtml(isCodeText)})
  </p>

  <p class="consent-block salutation">Dear Sir,</p>

  <p class="consent-block body-text">
    This is with reference to your request for the testing of your samples at our laboratory. We,
    ${escapeHtml(labName)}, hereby give our formal consent to carry out the testing of the following
    parameters / products as per the requirements of the Bureau of Indian Standards (BIS):
  </p>

  <div class="consent-block">
    <table class="details">
      <thead>
        <tr>
          <th>Sr<br />No</th>
          <th>Test Parameter Name</th>
          <th>Clause No</th>
        </tr>
      </thead>
      <tbody>
        ${buildTestParameterTableRows(input.testParameterNames, clauseText)}
      </tbody>
    </table>
  </div>

  <div class="consent-block credentials">
    <strong>Laboratory Credentials:</strong>
    <ol>
      <li>
        <strong>BIS Recognition:</strong> We are a BIS Recognized Laboratory (OSL) with OSL Code:
        ${escapeHtml(input.lab.bisOslCode)}.
      </li>
      <li>
        <strong>NABL Accreditation:</strong> Our laboratory is accredited by NABL (Certificate No.
        ${escapeHtml(input.lab.nablCertificateNo)}) and the above-mentioned testing is covered under our
        current scope of accreditation.
      </li>
    </ol>
  </div>

  <p class="consent-block body-text">
    We hereby confirm that we have the necessary infrastructure and calibrated equipment to perform these tests
    with high precision. We agree to test the samples as and when submitted by your firm and will provide the
    Test Reports in the prescribed format required for BIS compliance.
  </p>

  <p class="consent-block body-text">
    This consent is valid for the current Certification / Licensing period or as per the validity of our NABL /
    BIS recognition.
  </p>

  ${buildSignatureBlock(input.print.signatures)}`
}

export function buildConsentLetterHtml(input: BuildConsentLetterHtmlInput): string {
  const { printSettings, template, lab } = input.print
  const styles = `${buildPrintStylesCss(printSettings)}${buildConsentLetterPrintStylesCss(printSettings)}`

  const headerInner = template.headerUrl
    ? imgTag(template.headerUrl, 'Letterhead')
    : `<strong>${escapeHtml(lab.labName)}</strong>`

  const footerInner = template.footerUrl ? imgTag(template.footerUrl, 'Footer') : ''

  const headerHtml = `<header class="print-header${template.headerUrl ? '' : ' fallback'}">${headerInner}</header>`
  const footerHtml = footerInner ? `<footer class="print-footer">${footerInner}</footer>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Consent Letter — ${escapeHtml(input.consentLetterNo)}</title>
<style>${styles}</style>
</head>
<body>
${headerHtml}
${footerHtml}
<main class="print-body">
${buildConsentLetterBody(input)}
</main>
</body>
</html>`
}
