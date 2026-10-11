import { SaleDocumentMasterPage } from '@/features/finance/sale/shared/SaleDocumentMasterPage'

export default function RefundPage() {
  return (
    <SaleDocumentMasterPage
      config={{
        title: 'Refund Voucher',
        documentKind: 'refund',
        addLabel: 'Add New Refund Voucher',
        emptyHint: 'No refund vouchers added yet.',
        numberColumnLabel: 'Refund No.',
      }}
    />
  )
}
