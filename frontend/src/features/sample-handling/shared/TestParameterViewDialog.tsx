import type { ReactNode } from 'react'
import { ClipboardList, FileText, Files } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { TestAllocationParameterRow } from '../types'
import { resolveSectionSpecificRequirement } from './resolveSectionSpecificRequirement'
import type { IsCodeFileLink } from './fetchSampleSrfViewDetails'

const fmt = (v: unknown) =>
  v !== null && v !== undefined && String(v).trim() !== '' ? String(v).trim() : '—'

export type TestParameterViewExtras = {
  loading: boolean
  isCodeLabel: string | null
  sampleDescription: string | null
  declaredValue: string | null
  isCodeFiles: IsCodeFileLink[]
}

function SectionBlock({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: typeof FileText
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2 border-b border-stone-500 pb-2">
        <span className="flex h-7 w-7 items-center justify-center border border-stone-500 bg-stone-800 text-amber-200">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-700">{title}</h4>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
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

function SampleAndIsCodeSection({ extras }: { extras: TestParameterViewExtras }) {
  return (
    <SectionBlock icon={Files} title="IS Code Files">
      {extras.loading ? (
        <p className="border border-dashed border-stone-500 bg-stone-50 px-3 py-6 text-center text-sm text-[#57534e]">
          Loading IS code files…
        </p>
      ) : (
        <IsCodeFilesList files={extras.isCodeFiles} />
      )}
    </SectionBlock>
  )
}

export function TestParameterViewDialog({
  open,
  onOpenChange,
  label: _label,
  parameters,
  extras,
  sectionParameters,
  sectionCode: _sectionCode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  parameters: Record<string, unknown>[]
  extras: TestParameterViewExtras
  sectionParameters?: TestAllocationParameterRow[] | null
  sectionCode?: string | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layer="nested"
        className={cn(limsDialogClass, 'max-h-[88vh] max-w-3xl overflow-hidden p-0')}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative space-y-0 pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Test Parameter
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(88vh-4.5rem)] space-y-4 overflow-y-auto bg-[#f7f3eb] px-4 py-4 sm:px-5">
          {parameters.length === 0 ? (
            <>
              {!extras.loading ? (
                <p className="border border-dashed border-stone-500 bg-stone-50 px-3 py-4 text-center text-sm text-[#57534e]">
                  No matching test parameter found in Test Parameter directory.
                </p>
              ) : null}
              <SampleAndIsCodeSection extras={extras} />
            </>
          ) : (
            parameters.map((tp, idx) => {
              const tpId = typeof tp.id === 'string' ? tp.id.trim() : ''
              const sectionParam = sectionParameters?.find((p) => p.testParameterId === tpId)
              const displaySpecificRequirement = fmt(
                resolveSectionSpecificRequirement(
                  sectionParam?.sectionSpecOverride,
                  String(tp.specific_requirement ?? ''),
                ),
              )
              const itemName = fmt(tp.item_name)
              const isCode = fmt(extras.isCodeLabel ?? tp.is_code_label)
              const method = fmt(tp.test_method)
              const clause = fmt(tp.clause_no)
              const unit = fmt(tp.unit_value)

              return (
                <div
                  key={tpId || idx}
                  className="overflow-hidden border-2 border-stone-500 bg-[#f7f3eb] shadow-sm ring-1 ring-amber-700/20"
                >
                  <div className="space-y-3 border-b border-stone-500 bg-stone-800 px-4 py-3.5 text-white">
                    <div className="flex flex-wrap items-start gap-2">
                      <h3 className="text-base font-semibold tracking-tight text-amber-100">{itemName}</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="min-w-0 border border-amber-500/35 bg-stone-900/50 px-3 py-2 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200/90">
                          IS Code
                        </p>
                        <p className="mt-1 break-words text-sm font-medium text-amber-50">{isCode}</p>
                      </div>
                      <div className="min-w-0 border border-amber-500/35 bg-stone-900/50 px-3 py-2 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200/90">
                          Test Method
                        </p>
                        <p className="mt-1 break-words text-sm font-medium text-amber-50">{method}</p>
                      </div>
                      <div className="min-w-0 border border-amber-500/35 bg-stone-900/50 px-3 py-2 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200/90">
                          Clause
                        </p>
                        <p className="mt-1 break-words text-sm font-medium text-amber-50">{clause}</p>
                      </div>
                      <div className="min-w-0 border border-amber-500/35 bg-stone-900/50 px-3 py-2 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200/90">
                          Unit
                        </p>
                        <p className="mt-1 break-words text-sm font-medium text-amber-50">{unit}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5 px-4 py-4">
                    <SampleAndIsCodeSection extras={extras} />

                    <SectionBlock icon={ClipboardList} title="Requirements">
                      <div className="overflow-hidden border-2 border-stone-500 bg-[#f7f3eb] shadow-sm ring-1 ring-amber-700/20">
                        <div className="grid grid-cols-3 border-b border-stone-700 bg-stone-800">
                          <div className="border-r border-stone-700 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200 last:border-r-0">
                            Specified Requirement
                          </div>
                          <div className="border-r border-stone-700 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200 last:border-r-0">
                            Acceptance Criteria
                          </div>
                          <div className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                            Uncertainty (MU)
                          </div>
                        </div>
                        <div className="grid grid-cols-3 bg-[#f7f3eb]">
                          <div className="border-r border-[#e7e0d4] px-3 py-2.5 text-center text-sm font-medium text-[#1c1917]">
                            {displaySpecificRequirement}
                          </div>
                          <div className="border-r border-[#e7e0d4] px-3 py-2.5 text-center text-sm font-medium text-[#1c1917]">
                            {fmt(tp.acceptance_criteria)}
                          </div>
                          <div className="px-3 py-2.5 text-center text-sm font-medium text-[#1c1917]">
                            {fmt(tp.uncertainty_mu)}
                          </div>
                        </div>
                      </div>
                    </SectionBlock>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
