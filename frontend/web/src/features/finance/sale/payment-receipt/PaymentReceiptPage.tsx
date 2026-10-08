import { SaleDocumentMasterPage } from '../shared/SaleDocumentMasterPage'

export default function PaymentReceiptPage() {
  return (
    <SaleDocumentMasterPage
      config={{
        title: 'Payment Receipt',
        documentKind: 'paymentReceipt',
        addLabel: 'Add New Payment Receipt',
        emptyHint: 'No payment receipts added yet.',
        numberColumnLabel: 'Receipt No.',
      }}
    />
  )
}
