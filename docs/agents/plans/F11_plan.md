# F11 — Purchase bill

Status: coded. Migration file only. Do not migrate until Amit says "commit".

## In

- Route `/finance/purchase/bill`, sidebar **Purchase Bill**.
- List and form reuse the sale document page.
- Vendor picker lists clients whose company type is Vendor or Both. The database trigger rejects any other client.
- GST is calculated on the bill. The vendor GSTIN is the supplier. The company GSTIN is the recipient. Same state is CGST + SGST. A different state is IGST. A new line starts at 18% GST. HSN/SAC stays blank until the user types it.
- Outstanding on the list and the form is the bill total. Payments made and debit notes are F12, so the form says no payment or debit note is linked.
- Prefix row `PURCHASE` / `QE/26-27/PU/` in `document_series`. Lab Settings Prefixes tab shows it after migrate. Sample length is 16 characters.

## Out

- Payments made, debit note, purchase order.
- e-Invoice, e-way bill, GimBooks import.
- Forcing SAC 998393 onto a purchase line.
