import { AddClientDialog as SharedAddClientDialog } from '@/features/sample-handling/receiving/AddClientDialog'

/** Nested Agency client dialog — same Client Master theme as Sample Receiving. */
export function AddClientDialog({
  open,
  onOpenChange,
  onClientSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onClientSaved: (clientId: string) => void
}) {
  return (
    <SharedAddClientDialog
      open={open}
      onOpenChange={onOpenChange}
      onSaved={onClientSaved}
      nested
      title="Add New Client (Agency)"
    />
  )
}
