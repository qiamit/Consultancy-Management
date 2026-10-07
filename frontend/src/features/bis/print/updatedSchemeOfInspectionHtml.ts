import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  blankTableRows,
  buildPrintPage,
  dateOrNa,
  isStandardRefHtml,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type UpdatedSchemeOfInspectionData = PrintApplicantContext & {
  pmReference: string
  signatoryName: string
  signatoryDesignation: string
  annexSections: Array<{ header: string; text: string }>
  notes: string[]
}

const DEFAULT_ANNEX_HEADERS = [
  'Laboratory',
  'Test Records',
  'Labelling & Marking',
  'Control Unit',
  'Levels of Control',
  'Standard Mark',
  'Rejections',
]

const TABLE_BLANK_ROWS = 14

function toBlock(ctx: PrintApplicantContext): string {
  const branch = ctx.bisBranchName.trim() || 'Branch Office'
  const state = ctx.bisBranchState.trim() || '________________'
  return `To<br/>The Director &amp; Head<br/>Bureau of Indian Standards<br/>${esc(branch)}, ${esc(state)}, India`
}

function metaRow(data: UpdatedSchemeOfInspectionData): string {
  const pm = data.pmReference.trim() || 'PM/ IS __________/1/__________'
  return `
<div class="pd-to-row">
  <div class="pd-to-block">${toBlock(data)}</div>
  <div class="pd-date-block">
    <div><strong>Date of Application:</strong> ${esc(dateOrNa(data.dateOfApplication))}</div>
    <div><strong>Application Number:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    <div><strong>PM Number:</strong> ${esc(pm)}</div>
  </div>
</div>`
}

function annexSectionsHtml(sections: UpdatedSchemeOfInspectionData['annexSections']): string {
  return sections
    .map((s, i) => {
      const body = s.text.trim()
      const content = body
        ? body
            .split('\n')
            .map((line) => `<p class="usit-para">${esc(line) || '&nbsp;'}</p>`)
            .join('')
        : '<div class="usit-blank"></div>'
      return `<p class="usit-annex-header">${i + 1}. ${esc(s.header.toUpperCase())}</p>${content}`
    })
    .join('')
}

function buildBody(data: UpdatedSchemeOfInspectionData): string {
  const standard = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const notes = data.notes
    .map(
      (text, i) =>
        `<p class="usit-annex-header">Note ${i + 1}</p>${
          text.trim() ? `<p class="usit-para">${esc(text)}</p>` : '<div class="usit-blank usit-blank-sm"></div>'
        }`,
    )
    .join('')

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  ${metaRow(data)}
  <h1 class="usit-title">ANNEX C</h1>
  <h2 class="usit-subtitle">Scheme of Inspection and Testing</h2>
  ${standard ? `<p class="usit-standard">${standard}</p>` : ''}
  ${annexSectionsHtml(data.annexSections)}
  ${preparedByHtml(data.preparedBy)}
</div>
<div class="pd-sheet">
  ${letterheadHtml(data)}
  ${metaRow(data)}
  <p class="usit-table-title"><strong>TABLE 1</strong></p>
  <table class="pd-table usit-table">
    <colgroup>
      <col style="width:6%"/><col style="width:25%"/><col style="width:14%"/><col style="width:6%"/>
      <col style="width:9%"/><col style="width:14%"/><col style="width:26%"/>
    </colgroup>
    <thead>
      <tr>
        <th colspan="3">(1) Test Details</th>
        <th colspan="4">(2) Test equipment requirement — R: Required (or) S: Subcontracting permitted &nbsp;|&nbsp; (3) Levels of Control</th>
      </tr>
      <tr>
        <th>Cl.</th><th>Requirement</th><th>Test Methods<br/>Reference</th><th>R/S</th>
        <th>No. of<br/>Sample</th><th>Frequency</th><th>Remarks</th>
      </tr>
    </thead>
    <tbody>${blankTableRows(TABLE_BLANK_ROWS, 7, { leftColumn: 1, unnumbered: true })}</tbody>
  </table>
  ${notes}
  <div class="usit-sign">
    ${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}
    <div class="usit-auth">Authorized Signatory</div>
  </div>
</div>`
}

const STYLES = `
  .usit-title { text-align: center; font-size: 15px; font-weight: 700; margin: 0 0 2px; }
  .usit-subtitle { text-align: center; font-size: 13px; font-weight: 700; text-decoration: underline; margin: 0 0 8px; }
  .usit-standard { text-align: center; font-size: 11.5px; margin: 0 0 8px; }
  .usit-annex-header { margin: 10px 0 2px; font-weight: 700; font-size: 11.5px; }
  .usit-para { margin: 0 0 5px; text-align: justify; font-size: 11px; line-height: 1.4; }
  .usit-blank { height: 16mm; border-bottom: 1px dotted #78716c; }
  .usit-blank-sm { height: 9mm; }
  .usit-table-title { text-align: center; font-size: 12px; margin: 6px 0 4px; }
  .usit-table th, .usit-table td { font-size: 9.5px; }
  .usit-table td { height: 8mm; }
  .usit-sign { margin-top: 14px; text-align: right; }
  .usit-sign .pd-signatory { text-align: left; }
  .usit-auth { margin-top: 4px; font-weight: 700; }
`

export function buildUpdatedSchemeOfInspectionHtml(data: UpdatedSchemeOfInspectionData): string {
  return buildPrintPage({
    title: `Updated Scheme of Inspection & Testing — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into Updated SIT fields (blank content sections). */
export function updatedSchemeOfInspectionDataFromPrintData(printData: BisPrintData): UpdatedSchemeOfInspectionData {
  return {
    ...applicantContextFromPrintData(printData),
    pmReference: '',
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
    annexSections: DEFAULT_ANNEX_HEADERS.map((header) => ({ header, text: '' })),
    notes: ['', '', ''],
  }
}
