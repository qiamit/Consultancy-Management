import { getCurrencySymbol } from '@/lib/appCurrency'
import { cn } from '@/lib/utils'
import { formatMoney } from '../quotation/types'
import {
  INVOICE_AGE_BUCKETS,
  type InvoiceAgeBucket,
  type InvoiceAgeingRow,
} from './invoiceBalanceApi'

/** Open tax invoices grouped by days since the invoice date. A bucket filters the list. */
export function InvoiceAgeingStrip({
  rows,
  selected,
  onSelect,
  onClear,
  onRemind,
}: {
  rows: InvoiceAgeingRow[]
  selected: InvoiceAgeBucket | null
  onSelect: (bucket: InvoiceAgeBucket) => void
  onClear: () => void
  onRemind?: () => void
}) {
  const byId = new Map(rows.map((row) => [row.bucket, row]))
  const selectedLabel = INVOICE_AGE_BUCKETS.find((bucket) => bucket.id === selected)?.label
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Open invoices by age">
        {INVOICE_AGE_BUCKETS.map((bucket) => {
          const row = byId.get(bucket.id)
          const count = row?.invoice_count ?? 0
          const amount = row?.outstanding ?? 0
          const pressed = selected === bucket.id
          return (
            <button
              key={bucket.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => onSelect(bucket.id)}
              className={cn(
                'min-h-10 border px-2.5 py-2 text-left',
                pressed
                  ? 'border-amber-600 bg-amber-50 ring-1 ring-amber-600'
                  : 'border-stone-400 bg-[#fffcf7]',
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">{bucket.label}</p>
              <p className="mt-0.5 text-[13px] font-bold tabular-nums text-[#1c1917]">
                {getCurrencySymbol()} {formatMoney(amount)}
              </p>
              <p className="text-[11px] text-stone-600">{count} open</p>
            </button>
          )
        })}
      </div>
      {selectedLabel ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="min-h-10 px-1 text-left text-[12px] font-semibold text-amber-800 underline"
          >
            Show all invoices
          </button>
          {selected === 'over_90' && onRemind ? (
            <button
              type="button"
              onClick={onRemind}
              className="min-h-10 border border-amber-700 bg-amber-700 px-3 text-[12px] font-semibold text-white"
            >
              Send reminders
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
