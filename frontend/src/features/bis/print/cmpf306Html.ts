import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationMetaTableHtml,
  blankTableRows,
  buildPrintPage,
  CMPF_FORM_STYLES,
  cmpfDeclarationHtml,
  inspectionDateOrToday,
  letterheadHtml,
  preparedByHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'
import { parseCmpf306Payload } from '../projects/cmpf306Model'

export type Cmpf306EquipmentRow = {
  equipmentName: string
  make: string
  leastCount: string
  range: string
  calibrationStatus: string
  clauseNo: string
  quantity: string
}

export type Cmpf306Data = PrintApplicantContext & {
  firmRepName: string
  firmRepDesignation: string
  inspectionOfficerName: string
  inspectionOfficerDesignation: string
  rows: Cmpf306EquipmentRow[]
}

const MIN_BLANK_ROWS = 15

function equipmentRows(rows: Cmpf306EquipmentRow[]): string {
  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim()))
  if (filled.length === 0) return blankTableRows(MIN_BLANK_ROWS, 8, { leftColumn: 1 })
  const total = Math.max(MIN_BLANK_ROWS, filled.length)
  const out: string[] = []
  for (let i = 0; i < total; i += 1) {
    const r = filled[i]
    const cell = (v?: string) => (v ? esc(v) : '&nbsp;')
    out.push(`<tr>
      <td>${i + 1}</td>
      <td class="pd-left">${cell(r?.equipmentName)}</td>
      <td>${cell(r?.make)}</td><td>${cell(r?.leastCount)}</td><td>${cell(r?.range)}</td>
      <td>${cell(r?.calibrationStatus)}</td><td>${cell(r?.clauseNo)}</td><td>${cell(r?.quantity)}</td>
    </tr>`)
  }
  return out.join('')
}

function buildBody(data: Cmpf306Data): string {
  const date = inspectionDateOrToday(data.dateOfInspection)
  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <div class="cmpf-form-id">Form - II</div>
  <h1 class="pd-title">Declaration Regarding Testing Equipments</h1>
  ${applicationMetaTableHtml(data)}
  <div class="cmpf-to">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>

  <table class="pd-table cmpf-table">
    <colgroup>
      <col style="width:5%"/><col style="width:27%"/><col style="width:11%"/><col style="width:11%"/>
      <col style="width:11%"/><col style="width:14%"/><col style="width:11%"/><col style="width:10%"/>
    </colgroup>
    <thead>
      <tr>
        <th>Sr<br/>No</th><th>Test Equipments / Chemicals</th><th>Make</th><th>Least Count</th>
        <th>Range</th><th>Calibration Status</th><th>Clause No.</th><th>Quantity</th>
      </tr>
    </thead>
    <tbody>${equipmentRows(data.rows)}</tbody>
  </table>
  <p class="pd-note">Note: Attach extra sheet, if required.</p>

  ${cmpfDeclarationHtml({
    firmParagraphs: [
      'I hereby declare that the equipments of which details are given above are owned by me and are actually installed in the premises.*',
      'I also declare that in case of grant of licence, I will send prior intimation to BIS whenever any equipment is taken out of the premises of the firm due to any reason.',
    ],
    bisParagraphs: [
      'I have checked and found that the equipments of which details are given above were available during my inspection.',
    ],
    repName: data.firmRepName || data.contactPerson,
    repDesignation: data.firmRepDesignation,
    officerName: data.inspectionOfficerName,
    officerDesignation: data.inspectionOfficerDesignation,
    date,
  })}
  <p class="cmpf-footnote">* If any part of the testing activity is outsourced, details of test equipment used for the outsourced activity shall be indicated in a separate form along with the complete address of the outsourced premises.</p>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

export function buildCmpf306Html(data: Cmpf306Data): string {
  return buildPrintPage({
    title: `CMPF 306 — ${data.applicantName || 'Applicant'}`,
    styles: CMPF_FORM_STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into CMPF-306 fields. */
export function cmpf306DataFromPrintData(printData: BisPrintData): Cmpf306Data {
  const parsed = parseCmpf306Payload(
    printData.modulePayload && typeof printData.modulePayload === 'object'
      ? (printData.modulePayload as Record<string, unknown>)
      : null,
  )
  return {
    ...applicantContextFromPrintData(printData),
    firmRepName: parsed.firmRepName || printData.client.contactPerson,
    firmRepDesignation: parsed.firmRepDesignation,
    inspectionOfficerName: parsed.inspectionOfficerName,
    inspectionOfficerDesignation: parsed.inspectionOfficerDesignation,
    rows: parsed.rows,
  }
}
