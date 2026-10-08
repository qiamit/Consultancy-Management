import { useEffect, useState } from 'react'
import {
  SAMPLE_QUOTATION_ASSETS,
  SAMPLE_QUOTATION_ROW,
  QuotationDocumentView,
} from '@/features/finance/sale/quotation/QuotationDocumentView'
import {
  fetchLabCompanySignContext,
  resolveSignatureSignedUrl,
} from '@/features/finance/sale/quotation/quotationSignatureStorage'
import { resolveNamedLetterheadTemplates } from '@/features/sample-handling/report-preparation/reportScopeConfig'
import { cn } from '@/lib/utils'
import {
  type DocumentTemplateKind,
  type LabDocumentTemplates,
} from './documentTemplateTypes'

type NamedTemplate = { id: string; name: string; fileUrl?: string | null }

type TemplatesTabProps = {
  templates: LabDocumentTemplates
  onChange: (next: LabDocumentTemplates) => void
  headerTemplates: NamedTemplate[]
  footerTemplates: NamedTemplate[]
  /** Defaults to quotation (Finance → Quotation templates screen). */
  documentKind?: DocumentTemplateKind
}

export function TemplatesTab({
  templates,
  documentKind = 'quotation',
}: TemplatesTabProps) {
  const current = templates[documentKind]
  const [headerUrl, setHeaderUrl] = useState<string | null>(null)
  const [footerUrl, setFooterUrl] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [sealSignUrl, setSealSignUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const resolved = await resolveNamedLetterheadTemplates(
          current.headerTemplateName || 'General Letter Header',
          current.footerTemplateName || 'General Letter Footer',
        )
        if (cancelled) return
        setHeaderUrl(resolved.headerUrl)
        setFooterUrl(resolved.footerUrl)
      } catch {
        if (!cancelled) {
          setHeaderUrl(null)
          setFooterUrl(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [current.headerTemplateName, current.footerTemplateName])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const ctx = await fetchLabCompanySignContext()
        const url = await resolveSignatureSignedUrl(ctx.sealSignPath || null)
        if (cancelled) return
        setCompanyName(ctx.labName)
        setSealSignUrl(url)
      } catch {
        if (!cancelled) {
          setCompanyName('')
          setSealSignUrl(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-none border-2 border-stone-500 bg-stone-200/70 shadow-sm ring-1 ring-amber-700/20',
        current.centreOnPageVertical && 'justify-center',
      )}
    >
      <div
        className={cn(
          'min-h-0 flex-1 overflow-auto p-3 sm:p-4',
          current.centreOnPageVertical && 'flex items-start justify-center',
        )}
      >
        <QuotationDocumentView
          tpl={current}
          row={SAMPLE_QUOTATION_ROW}
          assets={{
            ...SAMPLE_QUOTATION_ASSETS,
            headerUrl,
            footerUrl,
            companyName: companyName || SAMPLE_QUOTATION_ASSETS.companyName,
            sealSignUrl,
          }}
        />
      </div>
    </div>
  )
}
