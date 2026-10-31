import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { RATE_FREQUENCIES } from '@/lib/ratePlans'
import { cn } from '@/lib/utils'

export type RatePlanDraft = { frequency: string; amount: string }

const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-amber-200'
const td = 'border border-[#e7e0d4] px-2 py-1 text-center align-middle text-sm text-stone-800'
const iconBtn = 'inline-flex h-7 w-7 items-center justify-center border disabled:opacity-40'

/** Customer Portal records price list: one amount per billing frequency (monthly, quarterly, yearly, …). */
export function RatePlansEditor({ value, onChange }: { value: RatePlanDraft[]; onChange: (next: RatePlanDraft[]) => void }) {
  const unused = RATE_FREQUENCIES.filter((f) => !value.some((v) => v.frequency === f.value))
  const [frequency, setFrequency] = useState('')
  const [amount, setAmount] = useState('')
  const chosen = frequency || unused[0]?.value || ''
  const add = () => {
    if (!chosen || amount.trim() === '' || !Number.isFinite(Number(amount))) return
    onChange([...value, { frequency: chosen, amount: amount.trim() }])
    setFrequency('')
    setAmount('')
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Customer Portal Records Rates (₹ / Licence)</p>
      <div className="max-w-2xl border border-stone-300 bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={cn(th, 'w-12')}>#</th>
              <th className={th}>Frequency</th>
              <th className={th}>Amount (₹)</th>
              <th className={cn(th, 'w-16')}>Action</th>
            </tr>
          </thead>
          <tbody>
            {value.map((p, i) => (
              <tr key={p.frequency} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                <td className={cn(td, 'text-xs text-stone-500')}>{i + 1}</td>
                <td className={cn(td, 'font-medium')}>{RATE_FREQUENCIES.find((f) => f.value === p.frequency)?.label ?? p.frequency}</td>
                <td className={td}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    aria-label={`Amount ${p.frequency}`}
                    className="h-8 min-h-8 text-center"
                    value={p.amount}
                    onChange={(e) => onChange(value.map((x) => (x.frequency === p.frequency ? { ...x, amount: e.target.value } : x)))}
                  />
                </td>
                <td className={td}>
                  <button type="button" className={cn(iconBtn, 'border-stone-300 bg-white text-red-700 hover:bg-red-50')} title="Delete" aria-label={`Delete ${p.frequency}`}
                    onClick={() => onChange(value.filter((x) => x.frequency !== p.frequency))}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
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
