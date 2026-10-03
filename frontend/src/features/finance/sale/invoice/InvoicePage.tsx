import { SaleDocumentMasterPage } from '../shared/SaleDocumentMasterPage'

export default function InvoicePage() {
  return (
    <SaleDocumentMasterPage
      config={{
        title: 'Invoice',
        documentKind: 'invoice',
        addLabel: 'Add New Invoice',
        emptyHint: 'No invoices added yet.',
        numberColumnLabel: 'Invoice No.',
      }}
    />
  )
}
