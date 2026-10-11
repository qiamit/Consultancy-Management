import { SaleDocumentMasterPage } from '@/features/finance/sale/shared/SaleDocumentMasterPage'

export default function DebitNotePage() {
  return (
    <SaleDocumentMasterPage
      config={{
        title: 'Debit Note',
        documentKind: 'debitNote',
        addLabel: 'Add New Debit Note',
        emptyHint: 'No debit notes added yet.',
        numberColumnLabel: 'Debit Note No.',
      }}
    />
  )
}
