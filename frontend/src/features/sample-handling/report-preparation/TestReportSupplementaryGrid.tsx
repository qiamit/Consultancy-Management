import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  normalizePartBFieldValue,
  PART_B_ROWS,
  type PartBFieldKey,
  type TestReportPartBDetails,
} from './testReportPartB'
import { reportPartTableBaseCss } from './reportPartTypography'

export function TestReportSupplementaryGrid({
  details,
  onChange,
  disabled,
}: {
  details: TestReportPartBDetails
  onChange: (next: TestReportPartBDetails) => void
  disabled?: boolean
}) {
  const setField = (key: PartBFieldKey, value: string) => {
    onChange({ ...details, [key]: value })
  }

  return (
    <div className="overflow-x-auto border-2 border-stone-500 bg-white p-2 shadow-sm ring-1 ring-amber-700/15 sm:p-3">
      <style>{`
        ${reportPartTableBaseCss('part-b-screen-table')}
        .part-b-screen-table .part-b-col-k { width: 72%; }
        .part-b-screen-table .part-b-col-c { width: 3%; }
        .part-b-screen-table .part-b-col-v { width: 25%; }
        .part-b-screen-table td {
          vertical-align: middle;
          padding: 4px 8px;
        }
        .part-b-screen-table .part-b-c {
          text-align: center;
          padding-left: 0;
          padding-right: 0;
        }
        .part-b-screen-table th {
          text-transform: none;
        }
      `}</style>
      <table className="part-b-screen-table">
        <colgroup>
          <col className="part-b-col-k" />
          <col className="part-b-col-c" />
          <col className="part-b-col-v" />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={3}>Part B. Supplementary Information</th>
          </tr>
        </thead>
        <tbody>
          {PART_B_ROWS.map((row, index) => {
            const value = normalizePartBFieldValue(row.key, details[row.key])
            return (
              <tr key={row.key}>
                <td className="part-b-k">
                  {index + 1}. {row.label}
                </td>
                <td className="part-b-c">:</td>
                <td className="part-b-v">
                  <Select
                    value={value}
                    onValueChange={(next) => setField(row.key, next)}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      className="h-7 w-full min-w-0 border-0 bg-transparent px-0 shadow-none focus:ring-1 focus:ring-amber-500/40 focus:ring-offset-0"
                      aria-label={`Part B row ${index + 1} output`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {row.options.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
