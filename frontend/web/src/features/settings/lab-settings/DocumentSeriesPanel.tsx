import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  listDocumentSeries,
  sampleDocumentNumber,
  saveDocumentSeriesPrefix,
  type DocumentSeriesRow,
} from '@/features/finance/sale/shared/documentSeriesApi'

const LABELS: Record<string, string> = {
  QUOTATION: 'Quotation',
  PROFORMA: 'Proforma Invoice',
  TAX_INVOICE: 'Tax Invoice',
  CREDIT_NOTE: 'Credit Note',
  PAYMENT_RECEIPT: 'Payment Receipt',
}

export function DocumentSeriesPanel() {
  const [rows, setRows] = useState<DocumentSeriesRow[]>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void listDocumentSeries()
      .then(setRows)
      .catch((err: unknown) => {
        const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code ?? '') : ''
        const text = err instanceof Error ? err.message : ''
        if (code === '42P01' || code === 'PGRST205' || /document_series/i.test(text)) return
        setMessage(text || 'Document series could not be loaded')
      })
  }, [])

  const save = (row: DocumentSeriesRow) => {
    void saveDocumentSeriesPrefix(row.doc_type, row.prefix)
      .then(() => setMessage(`Saved ${LABELS[row.doc_type] ?? row.doc_type}`))
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Save failed'))
  }

  if (rows.length === 0 && !message) return null

  return (
    <section className="space-y-3 border border-stone-300 p-3">
      <h3 className="text-sm font-semibold text-stone-800">Document series</h3>
      <p className="text-xs text-stone-600">
        Tax invoice numbers should stay within 16 characters. The next number is taken from the database so two users cannot get the same number.
      </p>
      {message ? <p className="text-sm text-stone-700">{message}</p> : null}
      <div className="space-y-3">
        {rows.map((row) => {
          const sample = sampleDocumentNumber(row.prefix, row.pad_width, row.next_number)
          const tooLong = sample.length > 16
          return (
            <div key={row.doc_type} className="grid grid-cols-12 items-end gap-2">
              <label className="col-span-12 text-sm text-stone-800 sm:col-span-3">{LABELS[row.doc_type] ?? row.doc_type}</label>
              <Input
                className="col-span-12 h-10 min-h-10 sm:col-span-5"
                aria-label={`${row.doc_type} prefix`}
                value={row.prefix}
                onChange={(e) => setRows((prev) => prev.map((item) => item.doc_type === row.doc_type ? { ...item, prefix: e.target.value } : item))}
              />
              <Button type="button" className="col-span-12 h-10 min-h-10 sm:col-span-2" onClick={() => save(row)}>
                Save
              </Button>
              <p className={`col-span-12 text-xs sm:col-span-12 ${tooLong ? 'text-red-700' : 'text-stone-600'}`}>
                Next: {sample} ({sample.length} characters){tooLong ? '. Longer than 16 characters.' : ''}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
