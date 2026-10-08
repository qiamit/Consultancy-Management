import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { generateNextConsentLetterNumber } from '@/features/masters/consent-letter/consentLetterDb'
import { buildConsentLetterHtml } from './buildConsentLetterHtml'
import { fetchConsentLetterPrintContext } from './fetchConsentLetterPrintContext'
import {
  formatConsentLetterDate,
  parseConsentLetterDateInput,
} from './consentLetterDefaults'
import {
  fetchConsentLetterFormData,
  type ConsentLetterFormData,
} from './fetchConsentLetterFormData'
import { outputConsentLetterDocument } from './outputConsentLetterDocument'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export function ConsentLetterDialog({
  open,
  onOpenChange,
  onGenerated,
  sampleId,
  srfNumber,
  defaultIsCodeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated?: () => void
  sampleId: string | null
  srfNumber: string | null | undefined
  defaultIsCodeId: string | null | undefined
}) {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<ConsentLetterFormData | null>(null)

  const [clientId, setClientId] = useState('')
  const [isCodeId, setIsCodeId] = useState('')
  const [selectedParamKeys, setSelectedParamKeys] = useState<Set<string>>(() => new Set())
  const [consentLetterNo, setConsentLetterNo] = useState('')
  const [letterDate, setLetterDate] = useState(() => formatConsentLetterDate())
  const [numberLoading, setNumberLoading] = useState(false)
  const [clauseSummary, setClauseSummary] = useState('Relevant Clause of Correspondence IS')

  useEffect(() => {
    if (!open || !sampleId) {
      setFormData(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setLetterDate(formatConsentLetterDate())
    setConsentLetterNo('')

    void (async () => {
      try {
        const data = await fetchConsentLetterFormData(sampleId, defaultIsCodeId ?? null)
        if (cancelled) return
        setFormData(data)
        setClientId(data.defaultClientId ?? data.clients[0]?.id ?? '')
        const preferredIs =
          (defaultIsCodeId && data.isCodes.some((c) => c.id === defaultIsCodeId)
            ? defaultIsCodeId
            : data.isCodes[0]?.id) ?? ''
        setIsCodeId(preferredIs)
        setSelectedParamKeys(new Set(data.testParameters.map((p) => p.key)))
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load consent letter data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, sampleId, defaultIsCodeId])

  useEffect(() => {
    if (!open || loading) return
    if (!parseConsentLetterDateInput(letterDate)) return

    let cancelled = false
    setNumberLoading(true)
    void (async () => {
      try {
        const next = await generateNextConsentLetterNumber(letterDate)
        if (!cancelled) setConsentLetterNo(next)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to generate consent letter number')
        }
      } finally {
        if (!cancelled) setNumberLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [letterDate, open, loading])

  const selectedClient = useMemo(
    () => formData?.clients.find((c) => c.id === clientId) ?? null,
    [formData, clientId],
  )

  const selectedIsCode = useMemo(
    () => formData?.isCodes.find((c) => c.id === isCodeId) ?? null,
    [formData, isCodeId],
  )

  const selectedParameters = useMemo(() => {
    if (!formData) return []
    return formData.testParameters.filter((p) => selectedParamKeys.has(p.key))
  }, [formData, selectedParamKeys])

  const toggleParam = (key: string, checked: boolean) => {
    setSelectedParamKeys((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const toggleAllParams = (checked: boolean) => {
    if (!formData) return
    setSelectedParamKeys(checked ? new Set(formData.testParameters.map((p) => p.key)) : new Set())
  }

  const canGenerate =
    Boolean(
      selectedClient &&
        selectedIsCode &&
        selectedParameters.length > 0 &&
        consentLetterNo.trim() &&
        !numberLoading,
    )

  const handleGenerate = async () => {
    if (!formData || !selectedClient || !selectedIsCode || !canGenerate) return
    setGenerating(true)
    setError(null)
    try {
      const clauseFromParams = selectedParameters
        .map((p) => p.clauseNo?.trim())
        .filter(Boolean)
        .join(', ')
      const print = await fetchConsentLetterPrintContext()
      const html = buildConsentLetterHtml({
        lab: print.lab,
        print,
        clientName: selectedClient.companyName,
        clientAddress: selectedClient.addressBlock,
        consentLetterNo: consentLetterNo.trim(),
        letterDate: letterDate.trim() || formatConsentLetterDate(),
        isCodeLabel: selectedIsCode.label,
        isNumber: selectedIsCode.isNumber,
        revisionYear: selectedIsCode.revisionYear,
        productTitle: selectedIsCode.title,
        testParameterNames: selectedParameters.map((p) => p.testName),
        clauseSummary: clauseFromParams || clauseSummary.trim(),
      })
      const filenameBase = `Consent-Letter-${consentLetterNo.trim().replace(/[/\\]+/g, '-')}`
      await outputConsentLetterDocument(html, filenameBase)
      onGenerated?.()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to generate consent letter')
    } finally {
      setGenerating(false)
    }
  }

  const allParamsChecked =
    (formData?.testParameters.length ?? 0) > 0 &&
    formData!.testParameters.every((p) => selectedParamKeys.has(p.key))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consent Letter</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          SRF: <span className="font-medium text-foreground">{fmt(srfNumber)}</span>
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="consent-client">Client</Label>
              <Select value={clientId} onValueChange={setClientId} disabled={!formData?.clients.length}>
                <SelectTrigger id="consent-client">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {(formData?.clients ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedClient?.addressBlock ? (
                <p className="text-xs text-muted-foreground whitespace-pre-line rounded-md border border-border/60 bg-muted/30 p-2">
                  {selectedClient.addressBlock}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="consent-is-code">IS Code</Label>
              <Select value={isCodeId} onValueChange={setIsCodeId} disabled={!formData?.isCodes.length}>
                <SelectTrigger id="consent-is-code">
                  <SelectValue placeholder="Select IS code" />
                </SelectTrigger>
                <SelectContent>
                  {(formData?.isCodes ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedIsCode?.title ? (
                <p className="text-xs text-muted-foreground">{selectedIsCode.title}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Test Parameters</Label>
                {(formData?.testParameters.length ?? 0) > 0 ? (
                  <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allParamsChecked}
                      onChange={(e) => toggleAllParams(e.target.checked)}
                    />
                    Select all
                  </label>
                ) : null}
              </div>
              {(formData?.testParameters.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No test parameters found for this SRF.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-md border border-border/80 divide-y">
                  {(formData?.testParameters ?? []).map((p) => (
                    <label
                      key={p.key}
                      className="flex items-start gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={selectedParamKeys.has(p.key)}
                        onChange={(e) => toggleParam(p.key, e.target.checked)}
                      />
                      <span>
                        <span className="font-medium">{p.testName}</span>
                        {p.clauseNo ? (
                          <span className="block text-xs text-muted-foreground">Clause: {p.clauseNo}</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="consent-letter-no">Consent Letter No</Label>
                <Input
                  id="consent-letter-no"
                  value={numberLoading ? 'Generating…' : consentLetterNo}
                  readOnly
                  className="bg-muted/40"
                  placeholder="QI/yymmdd-01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consent-letter-date">Date</Label>
                <Input
                  id="consent-letter-date"
                  value={letterDate}
                  onChange={(e) => setLetterDate(e.target.value)}
                  placeholder="DD-MM-YYYY"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="consent-clause-summary">Clause summary (optional)</Label>
              <Input
                id="consent-clause-summary"
                value={clauseSummary}
                onChange={(e) => setClauseSummary(e.target.value)}
                placeholder="Relevant Clause of Correspondence IS"
              />
              <p className="text-xs text-muted-foreground">
                Used when selected parameters have no clause numbers. Otherwise clause numbers from parameters are
                used.
              </p>
            </div>
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleGenerate()} disabled={loading || generating || !canGenerate}>
            {generating ? 'Generating…' : 'Generate PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
