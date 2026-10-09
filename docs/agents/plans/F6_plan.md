# F6: Ageing bucket filter

Status: coded 2026-10-09. Migration not applied. No commit.
Work-order slot: Finance, after F5

## Scope
- In: on the tax invoice list, clicking 0–30, 31–60, 61–90, or Over 90 shows only open invoices in that bucket. Clicking the same bucket, or Show all invoices, clears the filter. Search still applies inside the bucket. `invoice_ids_for_age_bucket` pages the ids (at most 50). Before the migration, the page uses the same rule on the invoices it can already read (up to 2,000).
- Out: GimBooks import, e-Invoice, BIS fee master, rewriting old documents, blocking an over-receipt, reminder emails.

## Later, not in this slice
- An email reminder for Over 90.

## Acceptance
A selected bucket lists only open invoices of that age. The other sale lists do not gain this filter. Commit only when Amit says "commit".
