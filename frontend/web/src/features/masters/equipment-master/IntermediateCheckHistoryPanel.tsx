import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, History, Thermometer, Droplets } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import {
  filterIntermediateCheckHistoryLastYears,
  INTERMEDIATE_CHECK_HISTORY_YEARS,
  sortIntermediateCheckHistoryNewestFirst,
  type IntermediateCheckHistoryRecord,
  type IntermediateCheckMasterSnapshot,
  type IntermediateCheckReadingItem,
} from './intermediateCheckHistory'

function formatDisplayDate(dateStr: string): string {
  return formatDate(dateStr)
}

function extractAcceptanceCriteriaUnit(criteria: string): string {
  if (!criteria.trim()) return ''
  return criteria.replace(/[\d.\s±+\-]+/g, '').trim()
}

function statusBadge(status: IntermediateCheckHistoryRecord['status']) {
  if (status === 'Satisfactory') {
    return (
      <span className="inline-flex items-center font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
        Satisfactory
      </span>
    )
  }
  if (status === 'Unsatisfactory') {
    return (
      <span className="inline-flex items-center font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded text-[10px]">
        Unsatisfactory
      </span>
    )
  }
  return <span className="text-muted-foreground text-[10px]">N/A</span>
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-white px-2 py-0.5 text-[10px] text-slate-600">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-slate-800">{value || '-'}</span>
    </span>
  )
}

function MasterSnapshotsPreview({ masters }: { masters: IntermediateCheckMasterSnapshot[] }) {
  if (masters.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Master Standard(s) Used
      </p>
      {masters.map((master) => {
        const isOverdue =
          master.nextCalibrationDue && new Date(master.nextCalibrationDue) < new Date()
        return (
          <div
            key={master.id}
            className="rounded-md border border-slate-200 bg-white p-2.5 space-y-1.5 text-[11px]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-800">{master.equipmentName || '—'}</div>
                {master.assetCode ? (
                  <div className="font-mono text-[10px] text-muted-foreground">{master.assetCode}</div>
                ) : null}
              </div>
              {master.nextCalibrationDue ? (
                <span
                  className={
                    isOverdue
                      ? 'text-rose-600 font-bold text-[10px]'
                      : 'text-slate-500 text-[10px]'
                  }
                >
                  Cal Due: {formatDisplayDate(master.nextCalibrationDue)}
                  {isOverdue ? ' (Overdue)' : ''}
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-600 sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">Range: </span>
                {master.rangeCapacity || '-'}
              </div>
              <div>
                <span className="text-muted-foreground">Resolution: </span>
                {master.resolutionLeastCount || '-'}
              </div>
              <div>
                <span className="text-muted-foreground">Acceptance: </span>
                {master.acceptanceCriteria || '-'}
              </div>
              <div>
                <span className="text-muted-foreground">Cal Frequency: </span>
                {master.calibrationFrequency || '-'}
              </div>
              <div>
                <span className="text-muted-foreground">Last Cal: </span>
                {master.lastCalibrationDate
                  ? formatDisplayDate(master.lastCalibrationDate)
                  : '-'}
              </div>
              <div>
                <span className="text-muted-foreground">Cert No: </span>
                {master.certificateNumber || '-'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ReadingsPreview({
  readings,
  acceptanceCriteria,
}: {
  readings: IntermediateCheckReadingItem[]
  acceptanceCriteria?: string
}) {
  const unit = extractAcceptanceCriteriaUnit(acceptanceCriteria ?? '')

  return (
    <div className="overflow-x-auto rounded-md border border-border/70">
      <table className="w-full min-w-[520px] text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="p-2 text-center font-medium">#</th>
            <th className="p-2 text-center font-medium">Check Point</th>
            <th className="p-2 text-center font-medium">Std Value</th>
            <th className="p-2 text-center font-medium">Obs Value</th>
            <th className="p-2 text-center font-medium">
              Error{unit ? ` (${unit})` : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          {readings.map((row, index) => {
            const stdNum = parseFloat(row.std)
            const obsNum = parseFloat(row.obs)
            const errText =
              !Number.isNaN(stdNum) && !Number.isNaN(obsNum)
                ? `${Math.abs(obsNum - stdNum).toFixed(4)}${unit ? ` ${unit}` : ''}`
                : '-'

            return (
              <tr key={`${row.checkPointValue}-${index}`} className="border-t border-border/60">
                <td className="p-2 text-center text-muted-foreground">{index + 1}</td>
                <td className="p-2 text-center">{row.checkPointValue || '-'}</td>
                <td className="p-2 text-center font-mono">{row.std || '-'}</td>
                <td className="p-2 text-center font-mono">{row.obs || '-'}</td>
                <td className="p-2 text-center font-mono">{errText}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type RecordViewProps = {
  label?: string
  conductedOn: string
  doneByName: string
  status: IntermediateCheckHistoryRecord['status']
  summary?: string
  readings: IntermediateCheckReadingItem[]
  nextDueDate?: string
  temperature?: string
  humidity?: string
  masters?: IntermediateCheckMasterSnapshot[]
  acceptanceCriteria?: string
  highlight?: boolean
}

function RecordDetails({
  label,
  conductedOn,
  doneByName,
  status,
  summary,
  readings,
  nextDueDate,
  temperature,
  humidity,
  masters = [],
  acceptanceCriteria,
  highlight = false,
}: RecordViewProps) {
  const [readingsOpen, setReadingsOpen] = useState(highlight)

  return (
    <div
      className={
        highlight
          ? 'rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs'
          : 'border-t border-border px-3 pb-3 pt-2 space-y-2.5 text-xs'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={highlight ? 'font-medium text-primary' : 'font-medium text-slate-700'}>
          {label ?? formatDisplayDate(conductedOn)}
        </p>
        {statusBadge(status)}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <MetaChip label="Date" value={formatDisplayDate(conductedOn)} />
        <MetaChip label="Done by" value={doneByName || '-'} />
        {temperature ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-white px-2 py-0.5 text-[10px] text-slate-600">
            <Thermometer size={11} className="text-orange-500" />
            <span className="text-muted-foreground">Temp:</span>
            <span className="font-medium">{temperature} °C</span>
          </span>
        ) : null}
        {humidity ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-white px-2 py-0.5 text-[10px] text-slate-600">
            <Droplets size={11} className="text-sky-500" />
            <span className="text-muted-foreground">RH:</span>
            <span className="font-medium">{humidity} %</span>
          </span>
        ) : null}
        <MetaChip label="Readings" value={String(readings.length)} />
        {nextDueDate ? (
          <MetaChip label="Next due" value={formatDisplayDate(nextDueDate)} />
        ) : null}
      </div>

      {summary ? <p className="text-[11px] text-slate-600 leading-relaxed">{summary}</p> : null}

      <MasterSnapshotsPreview masters={masters} />

      <div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          onClick={() => setReadingsOpen((open) => !open)}
        >
          {readingsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {readingsOpen ? 'Hide readings' : 'View readings'}
        </button>
        {readingsOpen ? (
          <div className="mt-2">
            <ReadingsPreview readings={readings} acceptanceCriteria={acceptanceCriteria} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function IntermediateCheckHistoryPanel({
  history,
  currentLastDate,
  currentDoneByName,
  currentStatus,
  currentSummary,
  currentReadings,
  currentTemperature,
  currentHumidity,
  currentMasters,
  currentNextDueDate,
  acceptanceCriteria,
}: {
  history: IntermediateCheckHistoryRecord[]
  currentLastDate?: string
  currentDoneByName?: string
  currentStatus?: IntermediateCheckHistoryRecord['status']
  currentSummary?: string
  currentReadings?: IntermediateCheckReadingItem[]
  currentTemperature?: string
  currentHumidity?: string
  currentMasters?: IntermediateCheckMasterSnapshot[]
  currentNextDueDate?: string
  acceptanceCriteria?: string
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const filteredHistory = useMemo(
    () =>
      sortIntermediateCheckHistoryNewestFirst(
        filterIntermediateCheckHistoryLastYears(history, INTERMEDIATE_CHECK_HISTORY_YEARS),
      ),
    [history],
  )

  const hasCurrent =
    !!currentLastDate?.trim() &&
    (currentReadings?.length ?? 0) > 0 &&
    filterIntermediateCheckHistoryLastYears(
      [
        {
          id: 'current',
          conductedOn: currentLastDate,
          doneBy: '',
          doneByName: '',
          status: currentStatus ?? 'N/A',
          resultSummary: currentSummary ?? '',
          readings: currentReadings ?? [],
          nextDueDate: currentNextDueDate ?? '',
          temperature: currentTemperature ?? '',
          humidity: currentHumidity ?? '',
          masters: currentMasters ?? [],
        },
      ],
      INTERMEDIATE_CHECK_HISTORY_YEARS,
    ).length > 0

  if (filteredHistory.length === 0 && !hasCurrent) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        No intermediate check results in the last {INTERMEDIATE_CHECK_HISTORY_YEARS} years. Use{' '}
        <strong>Save & Close</strong> after conducting a check to start history.
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-slate-50/80 p-3">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
        <span className="flex items-center gap-2">
          <History size={14} />
          Intermediate Check Results
        </span>
        <span className="font-normal text-muted-foreground">
          Last {INTERMEDIATE_CHECK_HISTORY_YEARS} years
        </span>
      </div>

      {hasCurrent ? (
        <RecordDetails
          label="Latest saved (current)"
          conductedOn={currentLastDate!}
          doneByName={currentDoneByName ?? ''}
          status={currentStatus ?? 'N/A'}
          summary={currentSummary}
          readings={currentReadings!}
          nextDueDate={currentNextDueDate}
          temperature={currentTemperature}
          humidity={currentHumidity}
          masters={currentMasters}
          acceptanceCriteria={acceptanceCriteria}
          highlight
        />
      ) : null}

      {filteredHistory.length > 0 ? (
        <div className="space-y-1.5">
          {filteredHistory.map((record) => {
            const open = expandedId === record.id
            const recordAcceptance =
              record.masters.find((m) => m.acceptanceCriteria)?.acceptanceCriteria ??
              acceptanceCriteria
            return (
              <div key={record.id} className="rounded-md border border-border bg-white">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-muted/30"
                  onClick={() => setExpandedId(open ? null : record.id)}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {formatDisplayDate(record.conductedOn)}
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-2 text-muted-foreground">
                    {statusBadge(record.status)}
                    <span className="text-[10px]">
                      {record.doneByName || '—'} · {record.readings.length} rdg
                      {record.masters.length > 0 ? ` · ${record.masters.length} master(s)` : ''}
                    </span>
                  </span>
                </button>
                {open ? (
                  <RecordDetails
                    conductedOn={record.conductedOn}
                    doneByName={record.doneByName}
                    status={record.status}
                    summary={record.resultSummary}
                    readings={record.readings}
                    nextDueDate={record.nextDueDate}
                    temperature={record.temperature}
                    humidity={record.humidity}
                    masters={record.masters}
                    acceptanceCriteria={recordAcceptance}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
