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
