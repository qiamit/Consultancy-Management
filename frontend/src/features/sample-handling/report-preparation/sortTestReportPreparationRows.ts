import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'

export type TestReportPreparationSortKey = 'srfNumber' | 'clientName' | 'isCode' | 'dateReceiving'

export function sortTestReportPreparationRows(
  rows: ReportPreparationListRow[],
  key: TestReportPreparationSortKey,
  direction: 'asc' | 'desc',
): ReportPreparationListRow[] {
  const mul = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'srfNumber':
        cmp = (a.srfNumber ?? '').localeCompare(b.srfNumber ?? '', undefined, { numeric: true })
        break
      case 'clientName':
        cmp = (a.clientName ?? '').localeCompare(b.clientName ?? '', undefined, { numeric: true })
        break
      case 'isCode':
        cmp = (a.isCodeLabel ?? '').localeCompare(b.isCodeLabel ?? '', undefined, { numeric: true })
        break
      case 'dateReceiving':
        cmp = (a.dateReceiving ?? '').localeCompare(b.dateReceiving ?? '')
        if (cmp === 0) {
          cmp = (a.srfNumber ?? '').localeCompare(b.srfNumber ?? '', undefined, { numeric: true })
        }
        break
    }
    return cmp * mul
  })
}
