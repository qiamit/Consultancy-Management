export const TEST_PARAMETER_SYNC_CHANNEL = 'qe-consultancy-test-parameter-sync'

export type TestParameterSyncAddedMessage = {
  type: 'test-parameter-added'
  /** When set, only the matching opener should consume the message. */
  syncToken?: string
  param: {
    id: string
    item_name: string
    clause_no: string | null
    unit_value: string | null
    specific_requirement: string | null
    test_method: string | null
    is_code_label: string | null
    is_code_id: string | null
  }
}

export function openAddTestParameterWindow(opts: {
  isCodeId?: string | null
  isCodeLabel?: string | null
  department?: string | null
  designation?: string | null
}) {
  const params = new URLSearchParams({ openAdd: '1' })
  if (opts.isCodeId?.trim()) params.set('isCodeId', opts.isCodeId.trim())
  if (opts.isCodeLabel?.trim()) params.set('isCodeLabel', opts.isCodeLabel.trim())
  if (opts.department?.trim()) params.set('department', opts.department.trim())
  if (opts.designation?.trim()) params.set('designation', opts.designation.trim())
  window.open(`/masters/test-parameter?${params.toString()}`, '_blank', 'noopener,noreferrer')
}

/** Opens Test Parameter master filtered to one IS (same page UI; list + blank add row). */
export function openTestParameterModuleWindow(opts: {
  isCodeId?: string | null
  isCodeLabel?: string | null
  /** Prefill the blank inline add row for this IS (default true when opening from FTR). */
  withBlankRow?: boolean
  /** BroadcastChannel token so Factory Test Report can add the new row to the report. */
  syncToken?: string | null
}) {
  const params = new URLSearchParams({ filterIs: '1' })
  if (opts.withBlankRow !== false) params.set('openAdd', '1')
  if (opts.isCodeId?.trim()) params.set('isCodeId', opts.isCodeId.trim())
  if (opts.isCodeLabel?.trim()) params.set('isCodeLabel', opts.isCodeLabel.trim())
  if (opts.syncToken?.trim()) params.set('syncToken', opts.syncToken.trim())
  window.open(`/masters/test-parameter?${params.toString()}`, '_blank', 'noopener,noreferrer')
}
