import { useEffect, useMemo, useState } from 'react'
import { Check, Import, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  BIS_PRINT_DOCUMENT_LABEL,
  type BisPrintDocumentKind,
} from '../print/printBisDocument'
import { formatBisApiError } from './bisProjectsApi'
import {
  fetchImportClientOptions,
  fetchImportIsCodeOptions,
  fetchImportSourceProjects,
  formatImportDataLabel,
  importBisModuleFromProject,
  isImportableBisModuleKind,
  type BisImportLookupOption,
} from './bisModuleImportApi'
import type { BisProjectRow } from './types'

const STEPS = [
  { key: 'client', title: '1. Client', hint: 'Defaults to this Application’s client' },
  { key: 'is', title: '2. IS Number', hint: 'IS codes filtered by selected client' },
  { key: 'data', title: '3. Available Data', hint: 'Pick Application / License to import' },
] as const

type StepKey = (typeof STEPS)[number]['key']

function clientFromTarget(row: BisProjectRow | null): BisImportLookupOption | null {
  const id = (row?.client_id ?? '').trim()
  if (!id) return null
  const label = (row?.client?.company_name ?? '').trim() || 'Client'
  return { id, label }
}

function LookupList({
  loading,
  emptyText,
  options,
  selectedId,
  onSelect,
}: {
  loading: boolean
  emptyText: string
  options: BisImportLookupOption[]
  selectedId: string | null
  onSelect: (opt: BisImportLookupOption) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-stone-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading…
      </div>
    )
  }
  if (options.length === 0) {
    return <p className="px-3 py-10 text-center text-sm text-stone-500">{emptyText}</p>
  }
  return (
    <ul className="divide-y divide-stone-300">
      {options.map((opt) => {
        const selected = selectedId === opt.id
        return (
          <li key={opt.id}>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                selected
                  ? 'bg-amber-100 text-amber-950'
                  : 'bg-transparent text-stone-900 hover:bg-amber-50',
              )}
              onClick={() => onSelect(opt)}
            >
              <span className="min-w-0 flex-1 font-medium leading-snug">{opt.label}</span>
              {selected ? <Check className="h-4 w-4 shrink-0 text-amber-800" aria-hidden /> : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function BisModuleImportDialog({
  open,
  onOpenChange,
  targetRow,
  kind,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetRow: BisProjectRow | null
  kind: BisPrintDocumentKind | null
  onImported?: () => void
}) {
  const [step, setStep] = useState<StepKey>('client')
  const [isSearch, setIsSearch] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [isOptions, setIsOptions] = useState<BisImportLookupOption[]>([])
  const [clientOptions, setClientOptions] = useState<BisImportLookupOption[]>([])
  const [sources, setSources] = useState<BisProjectRow[]>([])
  const [selectedIs, setSelectedIs] = useState<BisImportLookupOption | null>(null)
  const [selectedClient, setSelectedClient] = useState<BisImportLookupOption | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingIs, setLoadingIs] = useState(false)
  const [loadingClients, setLoadingClients] = useState(false)
  const [loadingSources, setLoadingSources] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = kind ? BIS_PRINT_DOCUMENT_LABEL[kind] : 'Module'
  const canImport = Boolean(
    targetRow?.id && kind && isImportableBisModuleKind(kind) && selectedId,
  )

  const resetWizard = () => {
    setStep('client')
    setIsSearch('')
    setClientSearch('')
    setIsOptions([])
    setClientOptions([])
    setSources([])
    setSelectedIs(null)
    setSelectedClient(null)
    setSelectedId(null)
    setLoadingIs(false)
    setLoadingClients(false)
    setLoadingSources(false)
    setImporting(false)
    setError(null)
  }

  useEffect(() => {
    if (!open) {
      resetWizard()
      return
    }
    if (kind && !isImportableBisModuleKind(kind)) {
      setError(`${label} has no stored module data to import.`)
    }
    const defaultClient = clientFromTarget(targetRow)
    if (defaultClient) {
      setSelectedClient(defaultClient)
      setStep('is')
    } else {
      setSelectedClient(null)
      setStep('client')
    }
    setSelectedIs(null)
    setSelectedId(null)
    setSources([])
    setIsSearch('')
    setClientSearch('')
  }, [open, kind, label, targetRow?.id, targetRow?.client_id, targetRow?.client?.company_name])

  // Step 1 — Client options
  useEffect(() => {
    if (!open || !kind || !isImportableBisModuleKind(kind)) return
    let cancelled = false
    const handle = window.setTimeout(() => {
      setLoadingClients(true)
      void (async () => {
        try {
          const rows = await fetchImportClientOptions(clientSearch)
          if (!cancelled) setClientOptions(rows)
        } catch (err) {
          if (!cancelled) setError(formatBisApiError(err))
        } finally {
          if (!cancelled) setLoadingClients(false)
        }
      })()
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [open, kind, clientSearch])

  // Step 2 — IS Numbers filtered by Client
  useEffect(() => {
    if (!open || !selectedClient?.id) {
      setIsOptions([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      setLoadingIs(true)
      void (async () => {
        try {
          const rows = await fetchImportIsCodeOptions(selectedClient.id, isSearch)
          if (!cancelled) setIsOptions(rows)
        } catch (err) {
          if (!cancelled) setError(formatBisApiError(err))
        } finally {
          if (!cancelled) setLoadingIs(false)
        }
      })()
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [open, selectedClient?.id, isSearch])

  // Step 3 — Available Application / License rows
  useEffect(() => {
    if (!open || !selectedIs?.id || !selectedClient?.id || !targetRow?.id) {
      setSources([])
      return
    }
    let cancelled = false
    setLoadingSources(true)
    void (async () => {
      try {
        const rows = await fetchImportSourceProjects({
          isCodeId: selectedIs.id,
          clientId: selectedClient.id,
          excludeProjectId: targetRow.id,
        })
        if (!cancelled) {
          setSources(rows)
          setSelectedId(null)
        }
      } catch (err) {
        if (!cancelled) setError(formatBisApiError(err))
      } finally {
        if (!cancelled) setLoadingSources(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, selectedIs?.id, selectedClient?.id, targetRow?.id])

  const activeStepIndex = useMemo(
    () => STEPS.findIndex((s) => s.key === step),
    [step],
  )

  const handleSelectClient = (opt: BisImportLookupOption) => {
    setSelectedClient(opt)
    setSelectedIs(null)
    setSelectedId(null)
    setIsSearch('')
    setSources([])
    setError(null)
    setStep('is')
  }

  const handleSelectIs = (opt: BisImportLookupOption) => {
    setSelectedIs(opt)
    setSelectedId(null)
    setError(null)
    setStep('data')
  }

  const handleImport = () => {
    if (!targetRow?.id || !kind || !selectedId) return
    void (async () => {
      setImporting(true)
      setError(null)
      try {
        const result = await importBisModuleFromProject({
          targetProjectId: targetRow.id,
          sourceProjectId: selectedId,
          kind,
        })
        const parts = [
          result.filesCopied > 0
            ? `${result.filesCopied} file${result.filesCopied === 1 ? '' : 's'}`
            : null,
          result.fieldsCopied ? 'module fields' : null,
        ].filter(Boolean)
        toast.success(`Imported ${label}`, {
          description:
            parts.length > 0
              ? `Copied ${parts.join(' + ')} from selected source.`
              : 'Source had no module data to copy.',
        })
        onImported?.()
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : formatBisApiError(err))
      } finally {
        setImporting(false)
      }
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        className={cn(limsDialogClass, 'w-[min(40rem,calc(100vw-1.5rem))] max-w-2xl p-0')}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
              <Import size={18} aria-hidden />
              Import — {label}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="space-y-3 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
          <div className="grid grid-cols-3 gap-1.5">
            {STEPS.map((s, index) => {
              const done =
                (s.key === 'client' && selectedClient) ||
                (s.key === 'is' && selectedIs) ||
                (s.key === 'data' && selectedId)
              const active = step === s.key
              const reachable =
                s.key === 'client' ||
                (s.key === 'is' && selectedClient) ||
                (s.key === 'data' && selectedClient && selectedIs)
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={!reachable}
                  onClick={() => setStep(s.key)}
                  className={cn(
                    'rounded-none border px-2 py-1.5 text-left transition-colors',
                    active
                      ? 'border-amber-700 bg-amber-100 text-amber-950'
                      : done
                        ? 'border-stone-400 bg-stone-50 text-stone-800'
                        : 'border-stone-300 bg-white text-stone-500',
                    !reachable && 'opacity-50',
                  )}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-wide">
                    {s.title}
                    {done && index <= activeStepIndex ? ' ✓' : ''}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug opacity-80">{s.hint}</span>
                </button>
              )
            })}
          </div>

          {(selectedIs || selectedClient) && (
            <div className="rounded-none border border-stone-300 bg-[#fffcf7] px-2.5 py-1.5 text-[11px] text-stone-700">
              {selectedClient ? (
                <span>
                  <span className="font-semibold text-stone-500">Client:</span>{' '}
                  {selectedClient.label}
                </span>
              ) : null}
              {selectedIs ? (
                <span className={selectedClient ? ' ml-3' : undefined}>
                  <span className="font-semibold text-stone-500">IS:</span> {selectedIs.label}
                </span>
              ) : null}
            </div>
          )}

          {step === 'client' ? (
            <div className="space-y-1.5">
              <Label htmlFor="import-client-search" className="text-xs font-semibold text-stone-700">
                Select Client Name
              </Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500"
                  aria-hidden
                />
                <Input
                  id="import-client-search"
                  type="search"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search client name…"
                  className={cn(limsFieldClass, 'pl-8')}
                  autoFocus
                />
              </div>
              <div className="max-h-56 min-h-[11rem] overflow-auto rounded-none border border-stone-400 bg-[#fffcf7]">
                <LookupList
                  loading={loadingClients}
                  emptyText="No client found with Applications / Licenses."
                  options={clientOptions}
                  selectedId={selectedClient?.id ?? null}
                  onSelect={handleSelectClient}
                />
              </div>
            </div>
          ) : null}

          {step === 'is' ? (
            <div className="space-y-1.5">
              <Label htmlFor="import-is-search" className="text-xs font-semibold text-stone-700">
                Select IS Number
              </Label>
              <p className="text-[11px] text-stone-500">
                Only IS numbers that <strong>{selectedClient?.label}</strong> already has are shown.
              </p>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500"
                  aria-hidden
                />
                <Input
                  id="import-is-search"
                  type="search"
                  value={isSearch}
                  onChange={(e) => setIsSearch(e.target.value)}
                  placeholder="Search IS number…"
                  className={cn(limsFieldClass, 'pl-8')}
                  autoFocus
                />
              </div>
              <div className="max-h-56 min-h-[11rem] overflow-auto rounded-none border border-stone-400 bg-[#fffcf7]">
                <LookupList
                  loading={loadingIs}
                  emptyText="No IS Number found for this client on other Applications / Licenses."
                  options={isOptions}
                  selectedId={selectedIs?.id ?? null}
                  onSelect={handleSelectIs}
                />
              </div>
            </div>
          ) : null}

          {step === 'data' ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-stone-700">
                Available Application / License Data
              </Label>
              <div className="max-h-56 min-h-[11rem] overflow-auto rounded-none border border-stone-400 bg-[#fffcf7]">
                {loadingSources ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-stone-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading…
                  </div>
                ) : sources.length === 0 ? (
                  <p className="px-3 py-10 text-center text-sm text-stone-500">
                    No other Application / License found for this Client + IS.
                  </p>
                ) : (
                  <ul className="divide-y divide-stone-300">
                    {sources.map((row) => {
                      const selected = selectedId === row.id
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            className={cn(
                              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                              selected
                                ? 'bg-amber-100 text-amber-950'
                                : 'bg-transparent text-stone-900 hover:bg-amber-50',
                            )}
                            onClick={() => setSelectedId(row.id)}
                          >
                            <span className="min-w-0 flex-1 font-medium leading-snug">
                              {formatImportDataLabel(row)}
                            </span>
                            {selected ? (
                              <Check className="h-4 w-4 shrink-0 text-amber-800" aria-hidden />
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          {error ? <p className="text-xs text-red-700">{error}</p> : null}
        </div>

        <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-between gap-2">
          <div className="flex gap-2">
            {step !== 'client' ? (
              <Button
                type="button"
                variant="outline"
                className={cn(limsOutlineBtnClass, 'min-w-[6rem]')}
                disabled={importing}
                onClick={() => setStep(step === 'data' ? 'is' : 'client')}
              >
                Back
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'min-w-[6.5rem]')}
              onClick={() => onOpenChange(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
              disabled={!canImport || importing}
              onClick={handleImport}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  Importing…
                </>
              ) : (
                <>
                  <Import className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Import
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
