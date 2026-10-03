export function digitalSignatureStampFields(sig: {
  roleLabel: string
  name: string
  designation: string
}): {
  roleLabel: string
  name: string
  designation: string
} {
  return {
    roleLabel: sig.roleLabel.trim(),
    name: sig.name.trim() || '—',
    designation: sig.designation.trim() || '—',
  }
}
