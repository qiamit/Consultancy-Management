export type Cmpf310ModulePayload = {
  feePerYear: string
  unit: string
}

export function emptyCmpf310Payload(): Cmpf310ModulePayload {
  return { feePerYear: '', unit: '' }
}

export function parseCmpf310Payload(payload: Record<string, unknown> | null): Cmpf310ModulePayload {
  return {
    feePerYear: String(payload?.feePerYear ?? payload?.fee_per_year ?? '').trim(),
    unit: String(payload?.unit ?? '').trim(),
  }
}
