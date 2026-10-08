import { useMemo } from 'react'
import { Textarea } from '@/components/ui/textarea'
import {
  formatPartDRemarksLine1,
  joinPartDRemarks,
  splitPartDRemarks,
} from './testReportPartDRemarks'
import { reportPartTableBaseCss } from './reportPartTypography'

export const PART_D_HEADING = 'PART D. REMARKS'

export { formatPartDRemarksLine1, joinPartDRemarks, splitPartDRemarks } from './testReportPartDRemarks'

export function TestReportRemarksSection({
  remarks,
  onRemarksChange,
  isCodeLabel,
  disabled,
}: {
  remarks: string
  onRemarksChange: (value: string) => void
  isCodeLabel?: string | null
  disabled?: boolean
}) {
  const line1 = formatPartDRemarksLine1(isCodeLabel)
  const line2 = useMemo(() => splitPartDRemarks(remarks, isCodeLabel).line2, [remarks, isCodeLabel])

  const handleLine2Change = (value: string) => {
    onRemarksChange(joinPartDRemarks(line1, value))
  }

  return (
    <div className="overflow-x-auto border-2 border-stone-500 bg-white p-2 shadow-sm ring-1 ring-amber-700/15 sm:p-3">
      <style>{`
        ${reportPartTableBaseCss('part-d-screen-table')}
        .part-d-screen-table td {
          line-height: 1.35;
        }
        .part-d-screen-table .part-d-line-edit {
          padding: 0;
        }
      `}</style>
      <table className="part-d-screen-table">
        <thead>
          <tr>
            <th>{PART_D_HEADING}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="part-d-line">{line1}</td>
          </tr>
          <tr>
            <td className="part-d-line-edit">
              <Textarea
                id="tr-remarks-line2"
                value={line2}
                onChange={(e) => handleLine2Change(e.target.value)}
                rows={2}
                disabled={disabled}
                className="min-h-[2.75rem] w-full resize-y rounded-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-1 focus-visible:ring-amber-500/40 focus-visible:ring-offset-0"
                placeholder="2. Additional remarks (optional)"
                aria-label="Part D remarks line 2"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
