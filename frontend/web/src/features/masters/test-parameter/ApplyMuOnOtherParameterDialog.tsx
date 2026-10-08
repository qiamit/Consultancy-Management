import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, CheckSquare, CopyPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { supabase } from '@/lib/supabaseClient'
import {
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { UncertaintyCalculationData } from './testParameterUncertainty'
import {
  newUncertaintyHistoryId,
  parseUncertaintyMuHistory,
  todayIsoDate,
  type UncertaintyHistoryRecord,
} from './uncertaintyHistory'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

type PeerParameterRow = {
  id: string
  itemName: string
  unitValue: string | null
  previousMu: string | null
  history: UncertaintyHistoryRecord[]
}

type PeerSortKey = 'itemName' | 'unitValue' | 'previousMu'
type PeerSortDir = 'asc' | 'desc'

function normalizeMethod(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function formatSupabaseError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function sortPeerValue(peer: PeerParameterRow, key: PeerSortKey): string {
  if (key === 'itemName') return peer.itemName.trim()
  if (key === 'unitValue') return peer.unitValue?.trim() || ''
  return peer.previousMu?.trim() || ''
}

export function ApplyMuOnOtherParameterDialog({
  open,
  onOpenChange,
  sourceParameterId,
  sourceParameterName,
  testMethod,
  currentMu,
  calculationData,
  savedByName,
  onApplied,
  layer = 'stacked',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceParameterId: string
  sourceParameterName: string
  testMethod: string
  currentMu: string
  calculationData: UncertaintyCalculationData
  savedByName: string
  onApplied: () => Promise<void> | void
  layer?: 'base' | 'stacked'
}) {
  const [peers, setPeers] = useState<PeerParameterRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<PeerSortKey>('itemName')
  const [sortDir, setSortDir] = useState<PeerSortDir>('asc')
  const [search, setSearch] = useState('')

  const methodLabel = testMethod.trim()
  const muLabel = currentMu.trim()

  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set())
    setMessage(null)
    setBusyIds(new Set())
    setBulkBusy(false)
    setSortKey('itemName')
    setSortDir('asc')
    setSearch('')

    if (!methodLabel || !sourceParameterId) {
      setPeers([])
      return
    }

    void (async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('test_parameters')
          .select('id, item_name, unit_value, uncertainty_mu, uncertainty_mu_history, test_method')
          .neq('id', sourceParameterId)
          .order('item_name', { ascending: true })

        if (error) throw error

        const methodKey = normalizeMethod(methodLabel)
        const list = (Array.isArray(data) ? data : [])
          .filter((r) => normalizeMethod(r.test_method as string | null) === methodKey)
          .map((r) => ({
            id: String(r.id),
            itemName: String(r.item_name ?? '').trim() || '—',
            unitValue: r.unit_value ? String(r.unit_value) : null,
            previousMu: r.uncertainty_mu ? String(r.uncertainty_mu) : null,
            history: parseUncertaintyMuHistory(r.uncertainty_mu_history),
          }))

        setPeers(list)
      } catch (err) {
        setPeers([])
        setMessage(formatSupabaseError(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [open, methodLabel, sourceParameterId])

  const filteredPeers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return peers
    return peers.filter((p) => {
      const haystack = [p.itemName, p.unitValue ?? '', p.previousMu ?? ''].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [peers, search])

  const sortedPeers = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filteredPeers].sort((a, b) => {
      const cmp = sortPeerValue(a, sortKey).localeCompare(sortPeerValue(b, sortKey), undefined, {
        sensitivity: 'base',
        numeric: true,
      })
      return cmp * dir
    })
  }, [filteredPeers, sortKey, sortDir])

  const selectedPeers = useMemo(
    () => peers.filter((p) => selectedIds.has(p.id)),
    [peers, selectedIds],
  )

  const visibleAllChecked =
    sortedPeers.length > 0 && sortedPeers.every((p) => selectedIds.has(p.id))
  const visibleSomeChecked = sortedPeers.some((p) => selectedIds.has(p.id))

  const handleSort = (key: PeerSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const SortHeader = ({
    label,
    columnKey,
    className,
  }: {
    label: string
    columnKey: PeerSortKey
    className?: string
  }) => {
    const active = sortKey === columnKey
    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <TableHead className={className}>
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-1 text-amber-200 transition-colors hover:text-amber-100"
          onClick={() => handleSort(columnKey)}
          aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
        >
          <span>{label}</span>
          <Icon
            className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-amber-300' : 'text-amber-200/60')}
          />
        </button>
      </TableHead>
    )
  }

  const toggleAll = (checked: boolean) => {
    if (sortedPeers.length === 0) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        for (const p of sortedPeers) next.add(p.id)
      } else {
        for (const p of sortedPeers) next.delete(p.id)
      }
      return next
    })
  }

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const applyToPeers = async (targets: PeerParameterRow[]) => {
    if (!muLabel || targets.length === 0) return

    const historyEntry: UncertaintyHistoryRecord = {
      id: newUncertaintyHistoryId(),
      recordedAt: todayIsoDate(),
      uncertaintyMu: muLabel,
      calculationData,
      savedByName: savedByName.trim(),
    }

    const appliedIds: string[] = []
    for (const target of targets) {
      const nextHistory = [historyEntry, ...target.history]
      const { error } = await supabase
        .from('test_parameters')
        .update({
          uncertainty_mu: muLabel,
          uncertainty_calculation_data: calculationData,
          uncertainty_mu_history: nextHistory,
        })
        .eq('id', target.id)
      if (error) throw error
      appliedIds.push(target.id)
    }

    setPeers((prev) =>
      prev.map((p) =>
        appliedIds.includes(p.id)
          ? {
              ...p,
              previousMu: muLabel,
              history: [historyEntry, ...p.history],
            }
          : p,
      ),
    )
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of appliedIds) next.delete(id)
      return next
    })
    await onApplied()
  }

  const handleApplyOne = async (peer: PeerParameterRow) => {
    setMessage(null)
    setBusyIds((prev) => new Set(prev).add(peer.id))
    try {
      await applyToPeers([peer])
      setMessage(`MU applied to “${peer.itemName}”.`)
    } catch (err) {
      setMessage(formatSupabaseError(err))
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(peer.id)
        return next
      })
    }
  }

  const handleApplySelected = async () => {
    if (selectedPeers.length === 0) return
    setMessage(null)
    setBulkBusy(true)
    try {
      await applyToPeers(selectedPeers)
      setMessage(`MU applied to ${selectedPeers.length} parameter(s).`)
    } catch (err) {
      setMessage(formatSupabaseError(err))
    } finally {
      setBulkBusy(false)
    }
  }

  const anyBusy = bulkBusy || busyIds.size > 0

  return (
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
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <DialogTitle className="flex shrink-0 items-center gap-2 text-base font-semibold tracking-tight text-white">
                  <CopyPlus className="size-4 shrink-0 text-amber-300" aria-hidden />
                  Apply MU on Other Parameter
                </DialogTitle>
                <div className="min-w-0 w-full sm:max-w-xs sm:flex-1">
                  <Input
                    id="apply-mu-peer-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search parameter / unit / MU..."
                    className={limsDarkBarSearchClass}
                    aria-label="Search parameters"
                  />
                </div>
                <p
                  className="min-w-0 sm:ml-auto sm:max-w-[40%] text-left text-sm font-medium leading-snug text-amber-200/95 break-words sm:text-right"
                  title={[sourceParameterName, methodLabel].filter(Boolean).join(' · ')}
                >
                  {sourceParameterName}
                  {methodLabel ? ` · ${methodLabel}` : ''}
                </p>
              </div>
            </DialogHeader>
        </div>

        <div
          className={cn(
            limsRegistryFormClass,
            'min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5',
          )}
        >
          {message ? (
            <p
              className={cn(
                'text-xs font-medium',
                message.toLowerCase().includes('applied') ? 'text-amber-800' : 'text-red-700',
              )}
            >
              {message}
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-none border-2 border-stone-500">
            <Table
              className={cn(
                'min-w-[880px] table-fixed border-collapse text-xs',
                '[&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4]',
              )}
            >
              <TableHeader className="bg-stone-800">
                <TableRow className="border-stone-700 hover:bg-stone-800">
                  <TableHead className="w-10 border-stone-700 bg-stone-800 p-2 text-center">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={visibleAllChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = !visibleAllChecked && visibleSomeChecked
                      }}
                      onChange={(e) => toggleAll(e.target.checked)}
                      disabled={sortedPeers.length === 0 || anyBusy}
                      aria-label="Select all parameters"
                    />
                  </TableHead>
                  <SortHeader
                    label="Test Parameter Name"
                    columnKey="itemName"
                    className="border-stone-700 bg-stone-800 p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200"
                  />
                  <SortHeader
                    label="Unit"
                    columnKey="unitValue"
                    className="w-28 border-stone-700 bg-stone-800 p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200"
                  />
                  <SortHeader
                    label="Previous MU if Any"
                    columnKey="previousMu"
                    className="w-40 border-stone-700 bg-stone-800 p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200"
                  />
                  <TableHead className="w-40 border-stone-700 bg-stone-800 p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Current MU
                  </TableHead>
                  <TableHead className="w-28 border-stone-700 bg-stone-800 p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Apply
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-4 text-center text-stone-500">
                      Loading parameters…
                    </TableCell>
                  </TableRow>
                ) : sortedPeers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-4 text-center text-stone-500">
                      {!methodLabel
                        ? 'Test method is missing on this parameter.'
                        : search.trim()
                          ? 'No parameters match your search.'
                          : 'No other test parameters found with this test method.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedPeers.map((peer) => {
                    const rowBusy = busyIds.has(peer.id)
                    return (
                      <TableRow key={peer.id} className="border-[#e7e0d4] bg-white hover:bg-amber-50/40">
                        <TableCell className="p-2 text-center">
                          <input
                            type="checkbox"
                            className={checkboxClass}
                            checked={selectedIds.has(peer.id)}
                            onChange={(e) => toggleOne(peer.id, e.target.checked)}
                            disabled={anyBusy}
                            aria-label={`Select ${peer.itemName}`}
                          />
                        </TableCell>
                        <TableCell className="p-2 font-medium text-stone-800">{peer.itemName}</TableCell>
                        <TableCell className="p-2 text-center tabular-nums text-stone-700">
                          {peer.unitValue?.trim() || '—'}
                        </TableCell>
                        <TableCell className="p-2 text-center tabular-nums text-stone-700">
                          {peer.previousMu?.trim() || '—'}
                        </TableCell>
                        <TableCell className="p-2 text-center tabular-nums font-medium text-amber-900">
                          {muLabel || '—'}
                        </TableCell>
                        <TableCell className="p-2 text-center">
                          <Button
                            type="button"
                            size="sm"
                            className={cn('h-7 px-2', limsPrimaryBtnClass)}
                            disabled={!muLabel || anyBusy}
                            onClick={() => void handleApplyOne(peer)}
                          >
                            {rowBusy ? 'Applying…' : 'Apply'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:justify-between sm:px-5">
          <p className="text-xs text-stone-500 self-center">
            {selectedPeers.length > 0 ? `${selectedPeers.length} selected` : 'Select rows for bulk apply'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn('h-8 gap-1.5', limsOutlineBtnClass)}
              onClick={() => onOpenChange(false)}
              disabled={anyBusy}
            >
              Close
            </Button>
            <Button
              type="button"
              className={cn('h-8 gap-1.5', limsPrimaryBtnClass)}
              disabled={!muLabel || selectedPeers.length === 0 || anyBusy}
              onClick={() => void handleApplySelected()}
            >
              <CheckSquare size={14} />
              {bulkBusy ? 'Applying…' : `Apply to Selected (${selectedPeers.length})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
