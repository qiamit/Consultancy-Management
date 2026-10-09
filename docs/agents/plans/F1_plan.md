# F1: Finance numbering, GST on invoice, TDS on receipt

Status: started 2026-10-09 (Amit: F1 shuru karo)
Work-order slot: Finance, after Masters S10

## Scope
- In: `document_series` and `next_document_number()`. Tax invoice prefix `QE/26-27/SL/` so the first number is `QE/26-27/SL/0001`. Company Settings can edit the prefix and warns when the sample number is longer than 16 characters. New tax-invoice lines default to SAC `998393` at 18%. Quotation, proforma, and receipt do not add GST. A payment receipt can record TDS at 2% or 10%. Existing document numbers and totals are not rewritten.
- Out: GimBooks import, e-Invoice, BIS fee master, place-of-supply auto switch, company PAN/CIN profile.

## Acceptance
A new tax invoice gets the series number and 18% on SAC 998393. A receipt can show TDS and the net. A quotation save does not invent GST. Commit only when Amit says "commit".
