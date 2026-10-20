import type { Cmpf310ModulePayload } from './cmpf310Model'

const field = 'h-9 w-full border border-stone-400 bg-white px-2 text-sm text-stone-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60'

export function Cmpf310ModuleFields({ value, onChange, disabled = false, isNumber = '', isUnit = '' }: {
  value: Cmpf310ModulePayload
  onChange: (next: Cmpf310ModulePayload) => void
  disabled?: boolean
  isNumber?: string
  isUnit?: string
}) {
  return <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
    <header className="border-b border-stone-300 pb-3"><h2 className="text-sm font-bold uppercase tracking-wide text-stone-800">Marking Fee · Product Certification</h2><p className="mt-1 text-xs text-stone-500">Enter the fee schedule returned for this Indian Standard. The preview follows the BIS Marking Fee report layout.</p></header>
    <section className="mx-auto w-full max-w-3xl rounded-sm border border-stone-300 p-4">
      <h3 className="mb-4 text-center text-lg font-bold text-stone-900">Marking Fee</h3>
      <label className="mb-4 block space-y-1 text-sm font-semibold text-stone-800">IS Number<input className={field} value={isNumber} readOnly aria-label="Indian Standard Number" /></label>
      <label className="mb-4 block space-y-1 text-sm font-semibold text-stone-800">Marking Fee Per Year<textarea className={`${field} h-24 resize-y py-2`} value={value.feePerYear} disabled={disabled} onChange={(e) => onChange({ ...value, feePerYear: e.target.value })} placeholder="Enter the fee rate and minimum annual fee for applicable firm scales" /></label>
      <label className="block space-y-1 text-sm font-semibold text-stone-800">Unit<input className={field} value={value.unit || isUnit} disabled={disabled} onChange={(e) => onChange({ ...value, unit: e.target.value })} placeholder="e.g. TONNE" /></label>
    </section>
  </div>
}
