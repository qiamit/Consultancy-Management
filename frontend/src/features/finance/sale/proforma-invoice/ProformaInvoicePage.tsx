import { SaleDocumentMasterPage } from '../shared/SaleDocumentMasterPage'

export default function ProformaInvoicePage() {
  return (
    <SaleDocumentMasterPage
      config={{
        title: 'Proforma Invoice',
        documentKind: 'proformaInvoice',
        addLabel: 'Add New Proforma Invoice',
        emptyHint: 'No proforma invoices added yet.',
        numberColumnLabel: 'Proforma No.',
      }}
    />
  )
}
