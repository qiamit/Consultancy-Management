import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { getCurrencySymbol } from '@/lib/appCurrency'
import type { RenewalSlabRate } from './types'

/** Slab rates of the licence's IS Code (from the IS Code Master), shown on request in the Renewal Sheet. */
export function RenewalSlabRatesPanel({ slabRates, unitOfIs }: { slabRates: RenewalSlabRate[]; unitOfIs: string }) {
  const [open, setOpen] = useState(false)
  // Same slabs the fee uses: N/A or empty slabs are left out.
  const rows = slabRates.filter((slab) => slab.quantity.trim() && slab.quantity.trim().toLowerCase() !== 'n/a')
  return (
    <section className="mb-4 border border-stone-300 bg-white" aria-label="Slab Rates">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-stone-800 hover:bg-stone-50"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        {open ? 'Hide Slab Rates' : 'Show Slab Rates'}
        <span className="font-normal text-stone-500">({rows.length ? `${rows.length} from IS Code Master` : 'None in IS Code Master'})</span>
      </button>
      {open ? (
        rows.length ? (
          <table className="w-full border-t border-stone-300 text-sm">
            <thead className="bg-stone-100 text-xs text-stone-700">
              <tr>
                <th className="border-r border-stone-300 px-3 py-1.5 text-left font-semibold">Quantity{unitOfIs ? ` (${unitOfIs})` : ''}</th>
                <th className="px-3 py-1.5 text-right font-semibold">Rate per Unit ({getCurrencySymbol()})</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((slab, index) => (
                <tr key={`${slab.quantity}-${index}`} className={index % 2 ? 'bg-stone-50' : 'bg-white'}>
                  <td className="border-r border-t border-stone-200 px-3 py-1.5">{slab.quantity || '—'}</td>
                  <td className="border-t border-stone-200 px-3 py-1.5 text-right tabular-nums">{slab.rate || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="border-t border-stone-300 px-3 py-2 text-sm text-stone-600">
            No Slab Rates Are Set for This IS Code. Add Them in the IS Code Master.
          </p>
        )
      ) : null}
    </section>
  )
}
