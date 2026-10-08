import { useEffect, useState, type ReactNode } from 'react'
import { BookMarked, FileText, Files, ScrollText } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabelFromParts, normalizeIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import type { TestAllocationRow } from '../types'
import { loadIsCodeFiles, type IsCodeFileLink } from './fetchSampleSrfViewDetails'

const fmt = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '—')

type IsCodeDetails = {
  isNumber: string | null
  revisionYear: string | null
  reaffirmationYear: string | null
  amendmentNumber: string | null
  title: string | null
  aspect: string | null
  remarks: string | null
}

function formatIsCodeLabel(d: IsCodeDetails | null, fallback: string | null | undefined): string {
  if (d?.isNumber?.trim()) {
    return formatIsCodeLabelFromParts(d.isNumber, d.revisionYear) || d.isNumber.trim()
  }
  const normalized = normalizeIsCodeLabel(fallback)
  return normalized || '—'
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-amber-500/35 bg-stone-900/50 px-3 py-2 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200/90">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-amber-50" title={value}>
        {value}
      </p>
    </div>
  )
}

function SectionBlock({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: typeof FileText
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-2.5', className)}>
      <div className="flex items-center gap-2 border-b border-stone-500 pb-2">
        <span className="flex h-7 w-7 items-center justify-center border border-stone-500 bg-stone-800 text-amber-200">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-700">{title}</h4>
      </div>
      {children}
    </section>
  )
}

function ProsePanel({ children }: { children: ReactNode }) {
  return (
    <div className="border border-stone-500 bg-[#fffcf7] px-3.5 py-3 text-sm leading-relaxed text-[#1c1917] shadow-sm ring-1 ring-amber-700/10">
      <p className="break-words whitespace-pre-wrap">{children}</p>
    </div>
  )
}

function DetailItem({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div
      className={cn(
        'min-w-0 border border-stone-500 bg-stone-50 px-3 py-2 shadow-sm ring-1 ring-amber-700/10',
        wide && 'sm:col-span-2',
      )}
    >
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-600">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium leading-snug whitespace-pre-wrap text-[#1c1917]">
        {value}
      </dd>
    </div>
  )
}

function IsCodeFilesList({ files }: { files: IsCodeFileLink[] }) {
  if (files.length === 0) {
    return (
      <p className="border border-dashed border-stone-500 bg-stone-50 px-3 py-4 text-center text-sm text-[#57534e]">
        No files uploaded for this IS Code.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-[#e7e0d4] overflow-hidden border-2 border-stone-500 bg-[#f7f3eb] shadow-sm ring-1 ring-amber-700/20">
      {files.map((f) => (
        <li key={f.file_name} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Files className="h-3.5 w-3.5 shrink-0 text-amber-800" aria-hidden />
            <span className="truncate text-sm text-[#1c1917]">{f.file_name}</span>
          </div>
          {f.url ? (
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className={cn(limsOutlineBtnClass, 'inline-flex h-7 items-center px-2.5 text-xs font-semibold')}
            >
              View
            </a>
          ) : (
            <span className="shrink-0 text-xs text-[#a8a29e]">—</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function SectionSampleDescViewDialog({
  row,
  open,
  onOpenChange,
  layer = 'nested',
}: {
  row: TestAllocationRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  layer?: 'default' | 'nested' | 'stacked' | 'top'
}) {
  const [isCodeLoading, setIsCodeLoading] = useState(false)
  const [isCodeDetails, setIsCodeDetails] = useState<IsCodeDetails | null>(null)
  const [isCodeFiles, setIsCodeFiles] = useState<IsCodeFileLink[]>([])

  useEffect(() => {
    if (!open || !row) {
      setIsCodeDetails(null)
      setIsCodeFiles([])
      setIsCodeLoading(false)
      return
    }

    const isCodeId = row.isCodeId?.trim() ?? ''
    if (!isCodeId) {
      setIsCodeDetails(null)
      setIsCodeFiles([])
      setIsCodeLoading(false)
      return
    }

    let cancelled = false
    setIsCodeLoading(true)

    void (async () => {
      try {
        const [detailsResult, files] = await Promise.all([
          supabase
            .from('is_codes')
            .select(
              'is_number, revision_year, reaffirmation_year, amendment_number, title, aspect, remarks',
            )
            .eq('id', isCodeId)
            .maybeSingle(),
          loadIsCodeFiles(isCodeId),
        ])

        if (cancelled) return

        const d = detailsResult.data as {
          is_number?: string | null
          revision_year?: string | null
          reaffirmation_year?: string | null
          amendment_number?: string | null
          title?: string | null
          aspect?: string | null
          remarks?: string | null
        } | null

        setIsCodeDetails(
          d
            ? {
                isNumber: d.is_number ?? null,
                revisionYear: d.revision_year ?? null,
                reaffirmationYear: d.reaffirmation_year ?? null,
                amendmentNumber: d.amendment_number ?? null,
                title: d.title ?? null,
                aspect: d.aspect ?? null,
                remarks: d.remarks ?? null,
              }
            : null,
        )
        setIsCodeFiles(files)
      } catch {
        if (!cancelled) {
          setIsCodeDetails(null)
          setIsCodeFiles([])
        }
      } finally {
        if (!cancelled) setIsCodeLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, row])

  const isCodeLabel = formatIsCodeLabel(isCodeDetails, row?.isCodeLabel)
  const sectionCode = row?.sectionCode?.trim() || '—'
  const department = row?.department?.trim() || '—'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer={layer}
        className={cn(
          limsDialogClass,
          'max-h-[88vh] max-w-3xl overflow-hidden p-0',
          'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="lg:left-[268px]"
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative space-y-3 pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Sample Details
            </DialogTitle>
            {row ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <MetaChip label="Section Code" value={sectionCode} />
                <MetaChip label="Department" value={department} />
              </div>
            ) : null}
          </DialogHeader>
        </div>

        {row ? (
          <div className="max-h-[calc(88vh-8rem)] space-y-5 overflow-y-auto bg-[#f7f3eb] px-4 py-4 sm:px-5">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <SectionBlock icon={FileText} title="Sample Description">
                <ProsePanel>{fmt(row.sampleDescription)}</ProsePanel>
              </SectionBlock>
              <SectionBlock icon={ScrollText} title="Sample Declaration">
                <ProsePanel>{fmt(row.declaredValue)}</ProsePanel>
              </SectionBlock>
            </div>

            <SectionBlock icon={BookMarked} title="IS Code">
              {isCodeLoading ? (
                <p className="border border-dashed border-stone-500 bg-stone-50 px-3 py-6 text-center text-sm text-[#57534e]">
                  Loading IS Code details…
                </p>
              ) : (
                <div className="space-y-3 overflow-hidden border-2 border-stone-500 bg-[#f7f3eb] p-3 shadow-sm ring-1 ring-amber-700/20">
                  <div className="flex flex-wrap items-center gap-2 border border-stone-500 bg-stone-50 px-3.5 py-3 shadow-sm ring-1 ring-amber-700/10">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-600">
                      Code
                    </span>
                    <span className="text-base font-semibold tracking-tight text-[#1c1917]">
                      {isCodeLabel}
                    </span>
                    {isCodeDetails?.aspect?.trim() ? (
                      <span className="ml-auto border border-amber-700/45 bg-[#f7f3eb] px-2 py-0.5 text-[11px] font-semibold text-[#92400e]">
                        {isCodeDetails.aspect.trim()}
                      </span>
                    ) : null}
                  </div>

                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <DetailItem label="Title" value={fmt(isCodeDetails?.title)} wide />
                    <DetailItem label="Reaffirmation" value={fmt(isCodeDetails?.reaffirmationYear)} />
                    <DetailItem label="Amendment" value={fmt(isCodeDetails?.amendmentNumber)} />
                    <DetailItem label="Remarks" value={fmt(isCodeDetails?.remarks)} wide />
                  </dl>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-600">
                      IS Code Files
                    </p>
                    <IsCodeFilesList files={isCodeFiles} />
                  </div>
                </div>
              )}
            </SectionBlock>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
