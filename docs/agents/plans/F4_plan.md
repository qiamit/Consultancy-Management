# F4: Receivables on the tax invoice list

Status: coded 2026-10-09. Migration not applied. No commit.
Work-order slot: Finance, after F3

## Scope
- In: `invoice_outstanding_for(invoice ids)`, at most 200 ids. The tax invoice list shows Outstanding and Paid, Part, or Unpaid. The amount uses the F3 rule: grand total minus linked gross receipts and linked credit notes. Before the migration, the page computes the same amounts from the tables it can already read.
- Out: GimBooks import, e-Invoice, BIS fee master, rewriting old documents, blocking an over-receipt, ageing buckets.

## Acceptance
The invoice list shows a due amount for each row on the page. A fully settled invoice reads Paid. Commit only when Amit says "commit".
