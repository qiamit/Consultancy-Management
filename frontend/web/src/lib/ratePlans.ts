/* Customer Portal records service: the price list (Lab Settings → Bank Details) as amounts per billing frequency. */

export type RateFrequency = { value: string; label: string; months: number; per: string }

export const RATE_FREQUENCIES: RateFrequency[] = [
  { value: 'monthly', label: 'Monthly', months: 1, per: 'Month' },
  { value: 'quarterly', label: 'Quarterly', months: 3, per: 'Quarter' },
  { value: 'half_yearly', label: 'Half-Yearly', months: 6, per: 'Half Year' },
  { value: 'yearly', label: 'Yearly', months: 12, per: 'Year' },
  { value: 'two_years', label: '2 Years', months: 24, per: '2 Years' },
  { value: 'three_years', label: '3 Years', months: 36, per: '3 Years' },
]

export type RatePlan = { frequency: string; amount: number }

export function rateFrequency(value: string): RateFrequency {
  return RATE_FREQUENCIES.find((f) => f.value === value) ?? RATE_FREQUENCIES[3]!
}

/** Plans from lab_settings.portal_records_rates; an older single yearly rate counts as the Yearly plan. */
export function parseRatePlans(raw: unknown, yearly?: unknown): RatePlan[] {
  const list = Array.isArray(raw)
    ? raw
        .map((r) => ({ frequency: String((r as RatePlan)?.frequency ?? ''), amount: Number((r as RatePlan)?.amount) }))
        .filter((r) => RATE_FREQUENCIES.some((f) => f.value === r.frequency) && Number.isFinite(r.amount) && r.amount >= 0)
    : []
  if (list.length === 0 && yearly != null && yearly !== '' && Number.isFinite(Number(yearly))) list.push({ frequency: 'yearly', amount: Number(yearly) })
  return list.sort((a, b) => rateFrequency(a.frequency).months - rateFrequency(b.frequency).months)
}
