# F3: Invoice outstanding

Status: started 2026-10-09 (Amit: F3 start karo)
Work-order slot: Finance, after F2

## Scope
- In: `client_invoice_balances(client id)`. A tax invoice outstanding is grand total minus gross receipts and credit notes that name that invoice. The receipt and credit-note forms can pick the invoice. A new invoice with no link shows its own total as outstanding. Unlinked receipts still count only in the client balance.
- Out: GimBooks import, e-Invoice, BIS fee master, rewriting old documents, blocking a receipt that is larger than the outstanding.

## Acceptance
A receipt linked to an invoice reduces that invoice's outstanding by the gross amount. A credit note linked the same way does too. Commit only when Amit says "commit".
