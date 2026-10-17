export type Cmpf310ModulePayload = {
  feePerYear: string
  unit: string
  /** "Yes" when the application is an All India First one: Annexure 1 (Undertaking for Minimum Marking Fee) then goes with the acceptance. */
  allIndiaFirst: 'Yes' | 'No'
}

export function emptyCmpf310Payload(): Cmpf310ModulePayload {
  return { feePerYear: '', unit: '', allIndiaFirst: 'No' }
}

export function parseCmpf310Payload(payload: Record<string, unknown> | null): Cmpf310ModulePayload {
  return {
    feePerYear: String(payload?.feePerYear ?? payload?.fee_per_year ?? '').trim(),
    unit: String(payload?.unit ?? '').trim(),
    allIndiaFirst: String(payload?.allIndiaFirst ?? payload?.all_india_first ?? '').trim().toLowerCase() === 'yes' ? 'Yes' : 'No',
  }
}
