# F7: Over 90 payment reminder

Status: coded 2026-10-09. Migration not applied. No commit.
Work-order slot: Finance, after F6

## Scope
- In: on the tax invoice list, Over 90 shows Send reminders. The user confirms before any mail goes out. A reminder is allowed only when `invoice_needs_reminder` is true: the invoice is in the Over 90 bucket and still has an outstanding amount. The mail uses the existing send-email path and attaches the invoice. The current page is the limit (at most 50). A client with no email is skipped. Before the migration, the page uses the same date and outstanding check locally.
- Out: GimBooks import, e-Invoice, BIS fee master, rewriting old documents, blocking an over-receipt, automatic or scheduled mail, reminders for 0–30, 31–60, or 61–90.

## Acceptance
Nothing is emailed until the user confirms. An empty Over 90 page does not call the email service. Commit only when Amit says "commit".
