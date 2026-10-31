import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { RATE_FREQUENCIES, planFinal, rateFrequency } from '@/lib/ratePlans'
import { cn } from '@/lib/utils'

export type RatePlanDraft = { frequency: string; amount: string; discount: string }

const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-amber-200'
const td = 'border border-[#e7e0d4] px-2 py-1 text-center align-middle text-sm text-stone-800'
const iconBtn = 'inline-flex h-7 w-7 items-center justify-center border disabled:opacity-40'

const rupees = (n: number) => `₹ ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function figures(p: { frequency: string; amount: string; discount: string }) {
  const amount = Number(p.amount)
  if (p.amount.trim() === '' || !Number.isFinite(amount)) return null
  const final = planFinal(amount, Number(p.discount) || 0)
  return { final, perMonth: final / rateFrequency(p.frequency).months }
}

/**
 * Customer Portal records price list: per billing frequency an amount and an optional discount (%); the final
 * amount and the monthly equivalent are worked out. Records Service picks these up when a plan is chosen.
 */
export function RatePlansEditor({ value, onChange }: { value: RatePlanDraft[]; onChange: (next: RatePlanDraft[]) => void }) {
  const unused = RATE_FREQUENCIES.filter((f) => !value.some((v) => v.frequency === f.value))
  const [frequency, setFrequency] = useState('')
  const [amount, setAmount] = useState('')
  const [discount, setDiscount] = useState('')
  const chosen = frequency || unused[0]?.value || ''
  const draftFig = figures({ frequency: chosen, amount, discount })
  const add = () => {
    if (!chosen || amount.trim() === '' || !Number.isFinite(Number(amount))) return
    onChange(
      [...value, { frequency: chosen, amount: amount.trim(), discount: discount.trim() }].sort(
        (a, b) => rateFrequency(a.frequency).months - rateFrequency(b.frequency).months,
      ),
    )
    setFrequency('')
    setAmount('')
    setDiscount('')
  }
  const patch = (f: string, change: Partial<RatePlanDraft>) => onChange(value.map((x) => (x.frequency === f ? { ...x, ...change } : x)))
  const pct = (v: string) => {
    const t = v.replace(/[^\d.]/g, '')
    return t !== '' && Number(t) > 100 ? '100' : t
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Customer Portal Records Rates (₹ / Licence)</p>
      <div className="overflow-x-auto border border-stone-300 bg-white shadow-sm">
        <table className="w-full min-w-[46rem] border-collapse">
          <thead>
            <tr>
              <th className={cn(th, 'w-12')}>#</th>
              <th className={cn(th, 'w-[10rem]')}>Frequency</th>
              <th className={th}>Amount (₹)</th>
              <th className={cn(th, 'w-[8rem]')}>Discount (%)</th>
              <th className={cn(th, 'w-[9.5rem]')}>Final Amount</th>
              <th className={cn(th, 'w-[8.5rem]')}>Per Month</th>
              <th className={cn(th, 'w-16')}>Action</th>
            </tr>
          </thead>
          <tbody>
            {value.map((p, i) => {
              const fig = figures(p)
              return (
                <tr key={p.frequency} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                  <td className={cn(td, 'text-xs text-stone-500')}>{i + 1}</td>
                  <td className={cn(td, 'font-semibold')}>{rateFrequency(p.frequency).label}</td>
                  <td className={td}>
                    <Input type="number" inputMode="decimal" min={0} aria-label={`Amount ${p.frequency}`} className="h-8 min-h-8 text-center" value={p.amount}
                      onChange={(e) => patch(p.frequency, { amount: e.target.value })} />
                  </td>
                  <td className={td}>
                    <Input inputMode="decimal" aria-label={`Discount ${p.frequency}`} placeholder="0" className="h-8 min-h-8 text-center" value={p.discount}
                      onChange={(e) => patch(p.frequency, { discount: pct(e.target.value) })} />
                  </td>
                  <td className={cn(td, 'font-semibold text-emerald-800')}>{fig ? rupees(fig.final) : '—'}</td>
                  <td className={cn(td, 'text-xs text-stone-600')}>{fig ? rupees(fig.perMonth) : '—'}</td>
                  <td className={td}>
                    <button type="button" className={cn(iconBtn, 'border-stone-300 bg-white text-red-700 hover:bg-red-50')} title="Delete" aria-label={`Delete ${p.frequency}`}
                      onClick={() => onChange(value.filter((x) => x.frequency !== p.frequency))}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {unused.length ? (
              <tr className="bg-amber-50/70">
                <td className={cn(td, 'text-xs font-semibold text-amber-800')}>New</td>
                <td className={td}>
                  <select aria-label="New Frequency" className="h-8 w-full border border-input bg-stone-50 px-2 text-sm" value={chosen} onChange={(e) => setFrequency(e.target.value)}>
                    {unused.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </td>
                <td className={td}>
                  <Input type="number" inputMode="decimal" min={0} aria-label="New Amount" placeholder="Amount" className="h-8 min-h-8 text-center" value={amount}
                    onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
                </td>
                <td className={td}>
                  <Input inputMode="decimal" aria-label="New Discount" placeholder="0" className="h-8 min-h-8 text-center" value={discount}
                    onChange={(e) => setDiscount(pct(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && add()} />
                </td>
                <td className={cn(td, 'text-stone-500')}>{draftFig ? rupees(draftFig.final) : '—'}</td>
                <td className={cn(td, 'text-xs text-stone-500')}>{draftFig ? rupees(draftFig.perMonth) : '—'}</td>
                <td className={td}>
                  <button type="button" className={cn(iconBtn, 'border-amber-600 bg-amber-600 text-white hover:bg-amber-700')} disabled={amount.trim() === ''} title="Add Rate" aria-label="Add Rate" onClick={add}>
                    <Plus size={14} />
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
