# F10: Invoice settlements

Status: coded 2026-10-09. Migration not applied. No commit.
Work-order slot: Finance, after F9

## Scope
- In: on a tax invoice, under Outstanding, list the receipts and credit notes that name that invoice. Same match as F3. A receipt shows its gross amount. A credit note shows its grand total. At most 50 rows. Before the migration, the form reads the same rows from the tables it can already see. A new invoice with no links says that nothing is linked.
- Out: GimBooks import, e-Invoice, BIS fee master, rewriting saved documents, blocking an over-receipt.

## Acceptance
An invoice with a linked receipt shows that receipt number and gross amount. An invoice with no link says so. Commit only when Amit says "commit".
