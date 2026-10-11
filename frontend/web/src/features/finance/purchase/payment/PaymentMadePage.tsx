import { SaleDocumentMasterPage } from '@/features/finance/sale/shared/SaleDocumentMasterPage'

export default function PaymentMadePage() {
  return (
    <SaleDocumentMasterPage
      config={{
        title: 'Payment Made',
        documentKind: 'paymentMade',
        addLabel: 'Add New Payment Made',
        emptyHint: 'No payments made added yet.',
        numberColumnLabel: 'Payment No.',
      }}
    />
  )
}
