import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { MaintenanceHistoryRecord } from './maintenanceHistory'
import type { MaintenanceChecklistItem } from './types'

function formatDisplayDate(dateStr: string): string {
  return formatDate(dateStr)
}

function ChecklistPreview({ checklist }: { checklist: MaintenanceChecklistItem[] }) {
  return (
    <div className="overflow-x-auto rounded-none border-2 border-stone-400">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-stone-800 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
            <th className="w-[5%] border border-stone-700 px-2 py-2 text-center">#</th>
            <th className="border border-stone-700 px-2 py-2 text-left">Check Point</th>
            <th className="w-28 border border-stone-700 px-2 py-2 text-center">Status</th>
            <th className="border border-stone-700 px-2 py-2 text-right">Repair If Any</th>
          </tr>
        </thead>
        <tbody className="bg-[#f7f3eb]">
          {checklist.map((row, index) => (
            <tr key={`${row.checkPoint}-${index}`}>
              <td className="border border-stone-300 px-2 py-1.5 text-center font-mono text-stone-500">
                {index + 1}
              </td>
              <td className="border border-stone-300 px-2 py-1.5 text-left text-stone-800">
                {row.checkPoint}
              </td>
              <td className="border border-stone-300 px-2 py-1.5 text-center text-stone-800">
                {row.status}
              </td>
              <td className="border border-stone-300 px-2 py-1.5 text-right text-stone-800">
                {row.repairIfAny || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MaintenanceHistoryPanel({
  history,
  currentLastDate,
  currentDoneByName,
  currentChecklist,
}: {
  history: MaintenanceHistoryRecord[]
  currentLastDate?: string
  currentDoneByName?: string
  currentChecklist?: MaintenanceChecklistItem[]
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const hasCurrent = !!currentLastDate?.trim() && (currentChecklist?.length ?? 0) > 0

  if (history.length === 0 && !hasCurrent) {
    return (
      <div className="rounded-none border-2 border-dashed border-stone-400 bg-stone-50 px-3 py-6 text-center text-xs text-stone-500">
        No previous maintenance records yet.
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-none border-2 border-stone-400 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
        Maintenance History
      </p>

      {hasCurrent ? (
        <div className="rounded-none border-2 border-stone-400 bg-stone-50 p-2.5 text-xs">
          <p className="font-semibold text-amber-800">Latest saved (current)</p>
          <p className="mt-0.5 text-stone-500">
            Date: {formatDisplayDate(currentLastDate!)} · Done by: {currentDoneByName || '-'} ·{' '}
            {currentChecklist!.length} check point(s)
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer font-medium text-amber-800 hover:underline">
              View checklist
            </summary>
            <div className="mt-2">
              <ChecklistPreview checklist={currentChecklist!} />
            </div>
          </details>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="space-y-1.5">
          {history.map((record) => {
            const open = expandedId === record.id
            return (
              <div key={record.id} className="rounded-none border-2 border-stone-400 bg-white">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-amber-50/40"
                  onClick={() => setExpandedId(open ? null : record.id)}
                >
                  <span className="flex items-center gap-1.5 font-medium text-stone-800">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {formatDisplayDate(record.conductedOn)}
                  </span>
                  <span className="text-stone-500">
                    {record.doneByName || '—'} · {record.checklist.length} points · Next due{' '}
                    {formatDisplayDate(record.nextDueDate)}
                  </span>
                </button>
                {open ? (
                  <div className="border-t border-stone-300 px-3 pb-3 pt-2">
                    <ChecklistPreview checklist={record.checklist} />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
