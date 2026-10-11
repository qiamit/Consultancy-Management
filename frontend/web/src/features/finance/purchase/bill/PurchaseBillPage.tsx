import { SaleDocumentMasterPage } from '@/features/finance/sale/shared/SaleDocumentMasterPage'

export default function PurchaseBillPage() {
  return (
    <SaleDocumentMasterPage
      config={{
        title: 'Purchase Bill',
        documentKind: 'purchase',
        addLabel: 'Add New Purchase Bill',
        emptyHint: 'No purchase bills added yet.',
        numberColumnLabel: 'Purchase No.',
      }}
    />
  )
}
