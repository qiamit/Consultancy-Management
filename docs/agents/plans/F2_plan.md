# F2: GST place of supply

Status: started 2026-10-09 (Amit: F2 start karo)
Work-order slot: Finance, after F1

## Scope
- In: `sale_gst_supply_mode(supplier GSTIN, recipient GSTIN)`. A tax invoice or credit note uses CGST + SGST when both GSTINs are valid and the state code matches, and IGST when the state code differs. A missing or invalid GSTIN stays intra-state. The chosen mode is stored on that document. Quotation, proforma, and receipt stay without GST.
- Out: GimBooks import, e-Invoice, BIS fee master, rewriting old invoices, SEZ or export supplies.

## Acceptance
A new tax invoice for a client in another state shows IGST. A client in the company state shows CGST and SGST. Commit only when Amit says "commit".
