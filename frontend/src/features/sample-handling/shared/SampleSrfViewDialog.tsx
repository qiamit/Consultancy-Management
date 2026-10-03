import { useEffect, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import {
  fetchSampleSrfViewDetails,
  type SampleSrfViewDetails,
} from '@/features/sample-handling/shared/fetchSampleSrfViewDetails'
import { getSampleWorkflowStatusLabel } from '@/features/sample-handling/sampleWorkflowStatus'
import type { SampleStage } from '@/features/sample-handling/types'
import { SampleReceivingEditDialog } from '@/features/sample-handling/receiving/SampleReceivingEditDialog'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')
const fmtDate = (v: string | null | undefined) => formatDate(v)

function fmtStage(details: SampleSrfViewDetails): string {
  return getSampleWorkflowStatusLabel({
    stage: (details.stage ?? 'receiving') as SampleStage,
    sample_receiving_status: details.sampleReceivingStatus,
    status: details.sampleReceivingStatus,
  })
}

function BoolBadge({ value }: { value: boolean | null | undefined }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center border border-emerald-700/40 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        Yes
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center border border-stone-400 bg-stone-50 px-2 py-0.5 text-xs font-semibold text-stone-600">
        No
      </span>
    )
  }
  return <span className="text-sm font-medium text-stone-500">—</span>
}

type DetailRow = [string, string] | [string, boolean | null | undefined, 'bool']

function DetailField({ label, value, isBool }: { label: string; value: string; isBool?: boolean }) {
  return (
    <div className="min-w-0 border border-stone-400 bg-white px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium leading-snug text-stone-900">
        {isBool ? (
          <BoolBadge value={value === 'Yes' ? true : value === 'No' ? false : null} />
        ) : (
          <span className="whitespace-pre-wrap break-words">{value}</span>
        )}
      </dd>
    </div>
  )
}

function DetailFields({ rows, columns = 2 }: { rows: DetailRow[]; columns?: 1 | 2 }) {
  return (
    <dl
      className={cn(
        'grid gap-2',
        columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
      )}
    >
      {rows.map(([label, value, kind]) => {
        const display =
          kind === 'bool'
            ? value === true
              ? 'Yes'
              : value === false
                ? 'No'
                : '—'
            : String(value)
        return (
          <DetailField
            key={label}
            label={label}
            value={display}
            isBool={kind === 'bool'}
          />
        )
      })}
    </dl>
  )
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('overflow-hidden border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/15', className)}>
      <div className="border-b border-stone-500 bg-stone-800 px-4 py-2">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">{title}</h4>
      </div>
      <div className="bg-[#f7f3eb] p-3">{children}</div>
    </section>
  )
}

function IsCodeFilesList({ files }: { files: SampleSrfViewDetails['isCodeFiles'] }) {
  if (files.length === 0) {
    return <p className="text-sm text-stone-500">No files uploaded for this IS Code.</p>
  }
  return (
    <ul className="space-y-1.5">
      {files.map((f) => (
        <li
          key={f.file_name}
          className="flex items-center justify-between gap-2 border border-stone-400 bg-white px-3 py-2"
        >
          <span className="truncate text-sm text-stone-800">{f.file_name}</span>
          {f.url ? (
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs font-semibold text-amber-800 hover:text-amber-950 hover:underline"
            >
              View
            </a>
          ) : (
            <span className="shrink-0 text-xs text-stone-500">—</span>
          )}
        </li>
      ))}
    </ul>
  )
}

const headerBadgeClass =
  'rounded-none border border-amber-500/40 bg-stone-800/80 font-medium text-amber-100'

export function SampleSrfViewDialog({
  open,
  onOpenChange,
  sampleId,
  fallbackSrf,
  fallbackClient,
  fallbackIsLabel,
  hideClient = false,
  allowEdit = true,
  onSampleUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string | null
  fallbackSrf?: string | null
  fallbackClient?: string | null
  fallbackIsLabel?: string | null
  /** Omit client section (e.g. Sample Allocation form). */
  hideClient?: boolean
  /** Show Edit to open Sample Receiving form (default true). */
  allowEdit?: boolean
  /** Called after receiving data is saved — refresh parent lists. */
  onSampleUpdated?: (payload: { sampleId: string; srfNumber: string | null }) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<SampleSrfViewDetails | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [detailsVersion, setDetailsVersion] = useState(0)

  const reloadDetails = () => {
    if (!sampleId) return
    setLoading(true)
    setError(null)
    void fetchSampleSrfViewDetails(sampleId, {
      srfNumber: fallbackSrf,
      clientName: fallbackClient,
      isCodeLabel: fallbackIsLabel,
    })
      .then(setDetails)
      .catch((e) => {
        setDetails(null)
        setError(e instanceof Error ? e.message : 'Unable to load sample details')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open || !sampleId) {
      setDetails(null)
      setError(null)
      setEditOpen(false)
      return
    }
    reloadDetails()
  }, [open, sampleId, fallbackSrf, fallbackClient, fallbackIsLabel, detailsVersion])

  const titleSrf = details?.srfNumber ?? fallbackSrf ?? '—'
  const stageLabel = details ? fmtStage(details) : null
  const receivingStatus = details?.sampleReceivingStatus?.trim()

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          portalClassName="lg:left-[268px] lg:p-2"
          className={cn(
            limsDialogClass,
            'flex h-[96vh] w-[calc(100vw-0.75rem)] max-w-none flex-col',
            'lg:!relative lg:!left-auto lg:!right-auto lg:!top-auto lg:!mx-0 lg:!translate-x-0 lg:!translate-y-0',
            'lg:h-full lg:w-full lg:max-h-none',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <div className="relative flex flex-nowrap items-center gap-2 pr-10 sm:gap-3">
              <DialogHeader className="min-w-0 shrink space-y-0 text-left">
                <DialogTitle className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">
                  {hideClient ? `Sample Details — ${fmt(titleSrf)}` : `SRF Details — ${fmt(titleSrf)}`}
                </DialogTitle>
              </DialogHeader>
              {details ? (
                <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto">
                  {receivingStatus && (
                    <Badge variant="outline" className={cn(headerBadgeClass, 'shrink-0')}>
                      {receivingStatus}
                    </Badge>
                  )}
                  {stageLabel && (
                    <Badge variant="outline" className={cn(headerBadgeClass, 'shrink-0')}>
                      {stageLabel}
                    </Badge>
                  )}
                  {details.isCodeLabel?.trim() && (
                    <Badge variant="outline" className={cn(headerBadgeClass, 'max-w-[16rem] shrink-0 truncate')}>
                      IS: {details.isCodeLabel.trim()}
                    </Badge>
                  )}
                </div>
              ) : (
                <div className="min-w-0 flex-1" />
              )}
              {allowEdit && sampleId && !loading && !error && details ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn('ml-auto shrink-0 gap-1.5', limsDarkBarBtnClass)}
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil size={14} />
                  Edit
                </Button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4 sm:px-6 sm:py-5">
            {loading && <p className="text-sm text-stone-600">Loading sample details…</p>}
            {error && (
              <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {!loading && !error && details && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-4">
                  <Section title="SRF & Receiving">
                    <DetailFields
                      columns={2}
                      rows={[
                        ['SRF Number', fmt(details.srfNumber)],
                        ['Referenced SRF', fmt(details.referencedSrfNumber)],
                        ['Report Type', fmt(details.receivingReportType)],
                        ['Date of Receiving', fmtDate(details.dateOfSampleReceiving)],
                        ['Receiving Status', fmt(details.sampleReceivingStatus)],
                        ['Current Stage', stageLabel ?? fmt(details.stage)],
                      ]}
                    />
                  </Section>

                  {!hideClient && (
                    <Section title="Client">
                      <DetailFields
                        columns={2}
                        rows={[
                          ['Customer', fmt(details.clientName)],
                          ['Client Reference', fmt(details.clientReference)],
                          ['Contact Person', fmt(details.clientContact)],
                          ['Email', fmt(details.clientEmail)],
                          ['Phone', fmt(details.clientPhone)],
                          ['Address', fmt(details.clientAddress)],
                        ]}
                      />
                      {details.clientReferenceUrl && (
                        <p className="mt-3">
                          <a
                            href={details.clientReferenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-amber-800 hover:text-amber-950 hover:underline"
                          >
                            View client reference document
                          </a>
                        </p>
                      )}
                    </Section>
                  )}

                  <Section title={fmt(details.isCodeLabel)}>
                    <IsCodeFilesList files={details.isCodeFiles} />
                  </Section>
                </div>

                <div className="space-y-4">
                  <Section title="Sample Identification">
                    <DetailFields
                      columns={2}
                      rows={[
                        ['Sample Code', fmt(details.sampleCode)],
                        ['Sample QR Code', fmt(details.sampleQrCode)],
                        ['Batch Number', fmt(details.batchNumber)],
                        ['Date of Manufacturing', details.dateOfManufacturing ? fmtDate(details.dateOfManufacturing) : '---'],
                        ['Sample Quantity', fmt(details.sampleQuantity)],
                        ['Shelf Life', fmt(details.shelfLife)],
                        ['Test Required', fmt(details.testRequired)],
                        ['Nature of Sample', fmt(details.natureOfSample)],
                        ['Mode of Disposal', fmt(details.modeOfDisposal)],
                        ['Tentative Date (Required)', fmtDate(details.tentativeDateRequired)],
                        ['Tentative Date (By Lab)', fmtDate(details.tentativeDateByLab)],
                        ['BIS Seal', details.bisSeal, 'bool'],
                        ['IO Signature', details.ioSignature, 'bool'],
                      ]}
                    />
                  </Section>

                  <Section title="Receiving Review">
                    <DetailFields
                      columns={2}
                      rows={[
                        ['Statement of Conformity', details.statementConformityRequired, 'bool'],
                        ['Witness Test Required', details.witnessTestRequired, 'bool'],
                        ['Competent Person Available', details.competentPersonAvailable, 'bool'],
                        ['Equipment Available', details.equipmentAvailable, 'bool'],
                        ['Can Complete Within Time', details.canCompleteWithinTime, 'bool'],
                        ['Deviation from Methods', details.deviationFromMethods, 'bool'],
                        ['Supporting Docs Required', details.supportingDocsRequired, 'bool'],
                        ['Decision Rule Applied', details.decisionRuleApplied, 'bool'],
                        ['Testing Method Available', details.testingMethodAvailable, 'bool'],
                        ['Sampling Procedure Ref', details.samplingProcedureRef, 'bool'],
                      ]}
                    />
                  </Section>
                </div>

                <Section title="Sample Description & Declaration" className="xl:col-span-2">
                  <DetailFields
                    columns={2}
                    rows={[
                      ['Sample Description', fmt(details.sampleDescription)],
                      ['Sample Declaration', fmt(details.sampleDeclaration)],
                      ['Any Other Information', fmt(details.anyOtherInformation)],
                    ]}
                  />
                </Section>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SampleReceivingEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        sampleId={sampleId}
        onSaved={(result) => {
          setDetailsVersion((v) => v + 1)
          onSampleUpdated?.(result)
        }}
      />
    </>
  )
}
