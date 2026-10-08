import { useEffect, useMemo, useState } from 'react'
import { History, Printer, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import type { UncertaintyCalculationData } from './testParameterUncertainty'
import {
  sortUncertaintyHistoryNewestFirst,
  type UncertaintyHistoryRecord,
} from './uncertaintyHistory'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function printHistoryRecords(
  parameterName: string,
  isCodeLabel: string | null | undefined,
  records: UncertaintyHistoryRecord[],
) {
  const rowsHtml = records
    .map(
      (r) =>
        `<tr>
          <td>${escHtml(formatDate(r.recordedAt))}</td>
          <td>${escHtml(r.uncertaintyMu)}</td>
          <td>${escHtml(r.savedByName || '—')}</td>
        </tr>`,
    )
    .join('')

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Uncertainty History — ${escHtml(parameterName)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1c1917; padding: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p { margin: 0 0 16px; font-size: 12px; color: #57534e; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #78716c; padding: 6px 8px; text-align: left; }
    th { background: #292524; color: #fde68a; text-transform: uppercase; font-size: 11px; }
  </style>
</head>
<body>
  <h1>Uncertainty History</h1>
  <p>${escHtml(parameterName)}${isCodeLabel ? ` · ${escHtml(isCodeLabel)}` : ''}</p>
  <table>
    <thead>
      <tr>
        <th>Date of MU</th>
        <th>Uncertainty</th>
        <th>Saved By</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`

  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
}

function CalculationSnapshot({ data }: { data: UncertaintyCalculationData | null }) {
  if (!data) {
    return <p className="text-sm text-stone-500">No calculation data stored for this history entry.</p>
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-row items-center justify-between gap-3 rounded-none border border-stone-500 bg-stone-50 px-3 py-2">
          <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Result MU
          </p>
          <p className="min-w-0 text-right font-semibold tabular-nums text-stone-900">
            {data.resultMu || '—'}
          </p>
        </div>
        <div className="flex flex-row items-center justify-between gap-3 rounded-none border border-stone-500 bg-stone-50 px-3 py-2">
          <p className="m-0 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Confidence / k
          </p>
          <p className="m-0 min-w-0 whitespace-nowrap text-right font-semibold tabular-nums text-stone-900">
            {data.confidenceLevel || '—'}% · k = {data.coverageFactor || '—'}
          </p>
        </div>
      </div>
      <div className={cn(limsPanelClass, 'overflow-x-auto p-0')}>
        <table className="w-full border-collapse text-xs">
          <thead className="bg-stone-800">
            <tr>
              <th className="p-2 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Type A Readings
              </th>
              <th className="p-2 text-right text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Value
              </th>
              <th className="p-2 text-right text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Unit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e7e0d4] bg-[#fffcf7]">
            {data.typeAMeasurements.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-2 text-center text-stone-500">
                  No Type A readings
                </td>
              </tr>
            ) : (
              data.typeAMeasurements.map((m) => (
                <tr key={m.key}>
                  <td className="p-2">{m.label || '—'}</td>
                  <td className="p-2 text-right tabular-nums">{m.value || '—'}</td>
                  <td className="p-2 text-right">{m.unit || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className={cn(limsPanelClass, 'overflow-x-auto p-0')}>
        <table className="w-full border-collapse text-xs">
          <thead className="bg-stone-800">
            <tr>
              <th className="p-2 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Type B Source
              </th>
              <th className="p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Std. Uncertainty
              </th>
              <th className="p-2 text-right text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Relative %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e7e0d4] bg-[#fffcf7]">
            {data.typeBContributors.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-2 text-center text-stone-500">
                  No Type B contributors
                </td>
              </tr>
            ) : (
              data.typeBContributors.map((c) => (
                <tr key={c.key}>
                  <td className="p-2">
                    <span className="font-medium text-stone-800">{c.sourceName || c.sourceType || '—'}</span>
                    {c.sourceType ? (
                      <span className="mt-0.5 block text-[11px] text-stone-500">{c.sourceType}</span>
                    ) : null}
                  </td>
                  <td className="p-2 text-center tabular-nums">
                    {c.uncertainty || '—'}
                    {c.uncertaintyUnit ? ` ${c.uncertaintyUnit}` : ''}
                  </td>
                  <td className="p-2 text-right tabular-nums">{c.relativeUncertainty || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function UncertaintyHistoryDialog({
  open,
  onOpenChange,
  parameterName,
  isCodeLabel,
  history,
  onHistoryChange,
  layer = 'stacked',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  parameterName: string
  isCodeLabel?: string | null
  history: UncertaintyHistoryRecord[]
  onHistoryChange: (next: UncertaintyHistoryRecord[]) => Promise<void> | void
  layer?: 'default' | 'nested' | 'stacked' | 'top'
}) {
  const { designation } = useAuth()
  const canDelete = isLaboratoryDirector(designation)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [viewing, setViewing] = useState<UncertaintyHistoryRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set())
      setViewing(null)
      setMessage(null)
    }
  }, [open])

  const rows = useMemo(() => sortUncertaintyHistoryNewestFirst(history), [history])

  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(rows.map((r) => r.id)) : new Set())
  }

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handlePrint = (records: UncertaintyHistoryRecord[]) => {
    if (records.length === 0) {
      setMessage('Select at least one history record to print.')
      return
    }
    printHistoryRecords(parameterName, isCodeLabel, records)
  }

  const handleDelete = async (ids: string[]) => {
    if (!canDelete || ids.length === 0) return
    const ok = window.confirm(
      ids.length === 1
        ? 'Delete this uncertainty history record? This cannot be undone.'
        : `Delete ${ids.length} uncertainty history records? This cannot be undone.`,
    )
    if (!ok) return
    setBusy(true)
    setMessage(null)
    try {
      const idSet = new Set(ids)
      const next = history.filter((r) => !idSet.has(r.id))
      await onHistoryChange(next)
      setSelectedIds((prev) => {
        const kept = new Set<string>()
        for (const id of prev) if (!idSet.has(id)) kept.add(id)
        return kept
      })
      if (viewing && idSet.has(viewing.id)) setViewing(null)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to delete history.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          persistOnFocusLoss
          layer={layer}
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden p-0',
            'left-0 top-0',
            'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
            '[&>button]:!text-white [&>button]:hover:bg-white/10',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
                <DialogTitle className="flex shrink-0 items-center gap-2 text-base font-semibold tracking-tight text-white">
                  <History className="size-4 shrink-0 text-amber-300" aria-hidden />
                  Uncertainty History
                </DialogTitle>
                {(parameterName.trim() || isCodeLabel?.trim()) ? (
                  <p
                    className="min-w-0 justify-self-end text-right text-sm font-medium leading-snug text-amber-200/95 break-words"
                    title={[parameterName, isCodeLabel].filter(Boolean).join(' · ')}
                  >
                    {parameterName}
                    {isCodeLabel ? ` · ${isCodeLabel}` : ''}
                  </p>
                ) : (
                  <span className="justify-self-end" aria-hidden />
                )}
              </div>
            </DialogHeader>
          </div>

          <div
            className={cn(
              limsRegistryFormClass,
              'min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5',
            )}
          >
            {message ? <p className="text-xs font-medium text-amber-800">{message}</p> : null}

            <div className="overflow-x-auto rounded-none border-2 border-stone-500">
              <Table
                className={cn(
                  'min-w-[720px] table-fixed border-collapse text-xs',
                  '[&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4]',
                )}
              >
                <TableHeader className="bg-stone-800">
                  <TableRow className="border-stone-700 hover:bg-stone-800">
                    <TableHead className="w-10 border-stone-700 bg-stone-800 p-2 text-center">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={allChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = !allChecked && someChecked
                        }}
                        onChange={(e) => toggleAll(e.target.checked)}
                        aria-label="Select all history rows"
                      />
                    </TableHead>
                    <TableHead className="border-stone-700 bg-stone-800 p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Date of MU
                    </TableHead>
                    <TableHead className="border-stone-700 bg-stone-800 p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Uncertainty
                    </TableHead>
                    <TableHead className="border-stone-700 bg-stone-800 p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Uncertainty Calculation
                    </TableHead>
                    <TableHead className="w-28 border-stone-700 bg-stone-800 p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="border-[#e7e0d4] p-4 text-center text-sm text-stone-500"
                      >
                        No uncertainty history saved for this parameter yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, index) => {
                      const selected = selectedIds.has(row.id)
                      return (
                        <TableRow
                          key={row.id}
                          className={cn(
                            selected ? 'bg-[#fde68a]/80' : index % 2 === 0 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]',
                          )}
                        >
                          <TableCell className="border-[#e7e0d4] p-2 text-center">
                            <input
                              type="checkbox"
                              className={checkboxClass}
                              checked={selected}
                              onChange={(e) => toggleOne(row.id, e.target.checked)}
                              aria-label={`Select history ${formatDate(row.recordedAt)}`}
                            />
                          </TableCell>
                          <TableCell className="border-[#e7e0d4] p-2 text-center tabular-nums text-stone-800">
                            {formatDate(row.recordedAt)}
                          </TableCell>
                          <TableCell className="border-[#e7e0d4] p-2 text-center font-medium tabular-nums text-stone-900">
                            {row.uncertaintyMu}
                          </TableCell>
                          <TableCell className="border-[#e7e0d4] p-2 text-center">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn(limsOutlineBtnClass, 'h-7 px-2 text-xs')}
                              onClick={() => setViewing(row)}
                            >
                              View Calculation
                            </Button>
                          </TableCell>
                          <TableCell className="border-[#e7e0d4] p-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className={cn(limsOutlineBtnClass, 'h-7 w-7')}
                                aria-label={`Print history ${formatDate(row.recordedAt)}`}
                                title="Print"
                                onClick={() => handlePrint([row])}
                              >
                                <Printer size={14} />
                              </Button>
                              {canDelete ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className={cn(limsOutlineBtnClass, 'h-7 w-7 text-red-700 hover:text-red-800')}
                                  aria-label={`Delete history ${formatDate(row.recordedAt)}`}
                                  title="Delete"
                                  disabled={busy}
                                  onClick={() => void handleDelete([row.id])}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end sm:px-5">
            <Button type="button" className={limsPrimaryBtnClass} onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(next) => !next && setViewing(null)}>
        <DialogContent
          persistOnFocusLoss
          layer="top"
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden p-0',
            'left-0 top-0',
            'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
            '[&>button]:!text-white [&>button]:hover:bg-white/10',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <DialogTitle className="min-w-0 text-base font-semibold tracking-tight text-white">
                  Uncertainty Calculation
                </DialogTitle>
                {viewing ? (
                  <p
                    className="min-w-0 justify-self-end text-right text-sm font-medium leading-snug tabular-nums text-amber-200/95 break-words"
                    title={`${formatDate(viewing.recordedAt)} · ${viewing.uncertaintyMu}`}
                  >
                    {formatDate(viewing.recordedAt)} · {viewing.uncertaintyMu}
                  </p>
                ) : (
                  <span className="justify-self-end" aria-hidden />
                )}
              </div>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
            <CalculationSnapshot data={viewing?.calculationData ?? null} />
          </div>
          <DialogFooter className="shrink-0 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
            <Button type="button" className={limsPrimaryBtnClass} onClick={() => setViewing(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
