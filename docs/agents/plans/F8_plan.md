# F8: Proper text on buttons and labels

Status: coded 2026-10-09. No migration. No commit.
Work-order slot: Amit asked for this with F8. It is not a finance calculation slice.

## Scope
- In: button text, label text, and table headings use title case. Small words such as of, and, or, the, for, and to stay lowercase unless they are the first or last word. BIS, NABL, QAI, IIT, NIT, GST, PDF, and the other listed short forms stay in that form. Roman numbers stay in capitals. An all-caps style on those controls is turned off so the proper text is what you see. A client name, an email, a long sentence, and a document number are left as stored.
- Out: GimBooks import, e-Invoice, BIS fee master, rewriting saved documents, changing client names in pickers.

## Acceptance
A button written as "show all invoices" reads "Show All Invoices". "Terms and Conditions" keeps "and" lowercase. "BIS operations" reads "BIS Operations". Commit only when Amit says "commit".
