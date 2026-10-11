import { SaleDocumentMasterPage } from '@/features/finance/sale/shared/SaleDocumentMasterPage'

export default function PurchaseOrderPage() {
  return (
    <SaleDocumentMasterPage
      config={{
        title: 'Purchase Order',
        documentKind: 'purchaseOrder',
        addLabel: 'Add New Purchase Order',
        emptyHint: 'No purchase orders added yet.',
        numberColumnLabel: 'Order No.',
      }}
    />
  )
}
