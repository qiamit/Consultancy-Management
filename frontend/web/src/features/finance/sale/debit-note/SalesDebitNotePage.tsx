import { SaleDocumentMasterPage } from '@/features/finance/sale/shared/SaleDocumentMasterPage'

export default function SalesDebitNotePage() {
  return (
    <SaleDocumentMasterPage
      config={{
        title: 'Sales Debit Note',
        documentKind: 'salesDebitNote',
        addLabel: 'Add New Sales Debit Note',
        emptyHint: 'No sales debit notes added yet.',
        numberColumnLabel: 'Debit Note No.',
      }}
    />
  )
}