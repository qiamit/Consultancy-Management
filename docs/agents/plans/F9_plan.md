# F9: Receipt list shows the invoice and TDS

Status: coded 2026-10-09. No migration. No commit.
Work-order slot: Finance, after F8

## Scope
- In: the payment receipt list shows the tax invoice the receipt names, or Not Linked. When TDS is 2% or 10%, the row also shows the net after TDS. A credit note that names an invoice shows that invoice number. The figures use the receipt already saved. Gross still reduces the invoice. TDS stays on the receipt.
- Out: GimBooks import, e-Invoice, BIS fee master, rewriting saved documents, blocking an over-receipt.

## Acceptance
A linked receipt shows Against and the invoice number. An unlinked receipt shows Not Linked. A 10% receipt shows the net. Commit only when Amit says "commit".
