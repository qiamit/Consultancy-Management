# F5: Invoice ageing

Status: coded 2026-10-09. Migration not applied. No commit.
Work-order slot: Finance, after F4

## Scope
- In: days since the tax invoice date. Open invoices (outstanding above zero) fall into 0–30, 31–60, 61–90, or Over 90. The tax invoice list shows a four-bucket total and an age on each open row. Before the migration, the page computes the same buckets from the tables it can already read (up to 2,000 invoices).
- Out: GimBooks import, e-Invoice, BIS fee master, rewriting old documents, blocking an over-receipt, a bucket filter on the paged list, reminder emails.

## Later, not in this slice
- Clicking a bucket filters the invoice list. That needs a paged RPC.
- A reminder for Over 90 stays a later slice.

## Acceptance
The tax invoice page shows four ageing totals. A settled invoice has no age. Quotation, proforma, credit note, and receipt lists stay unchanged. Commit only when Amit says "commit".
