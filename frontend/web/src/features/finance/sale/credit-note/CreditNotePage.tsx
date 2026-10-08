import { SaleDocumentMasterPage } from '../shared/SaleDocumentMasterPage'

export default function CreditNotePage() {
  return (
    <SaleDocumentMasterPage
      config={{
        title: 'Credit Note',
        documentKind: 'creditNote',
        addLabel: 'Add New Credit Note',
        emptyHint: 'No credit notes added yet.',
        numberColumnLabel: 'Credit Note No.',
      }}
    />
  )
}
