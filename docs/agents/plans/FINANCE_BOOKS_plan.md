# Finance books plan

Updated 2026-10-09 from the GimBooks menu Amit is signed into. This is the roadmap after F10. It does not start code. F1–F10 stay uncommitted until Amit says "commit".

Company name in the app stays **Quality International Research & Laboratories Private Limited**. Q Engineering is the consultancy brand.

## Already in the app (F1–F10, coded, not migrated)

Sale books that exist today:

| Book | Route | Prefix in Lab Settings |
|---|---|---|
| Quotation | `/finance/sale/quotation` | `QE/26-27/QT/` |
| Proforma Invoice | `/finance/sale/proforma-invoice` | `QE/26-27/PI/` |
| Tax Invoice | `/finance/sale/invoice` | `QE/26-27/SL/` |
| Credit Note | `/finance/sale/credit-note` | `QE/26-27/CN/` |
| Payment Receipt | `/finance/sale/payment-receipt` | `QE/26-27/RC/` |

Rules already decided and coded: GST only on the tax invoice (and credit note place of supply), SAC 998393 at 18%, TDS 2% or 10% on the receipt, outstanding from linked receipts and credit notes, ageing, Over 90 reminder after confirm, settlements on the invoice. Prefix edit and the 16-character warning live on the Lab Settings Prefixes tab (`DocumentSeriesPanel`).

## What the GimBooks menu contains

Sale books: Invoices, Retail Invoices, Quotations, Payment Receipts, Refund Vouchers, Proforma Invoice, Export Invoice, Export Proforma Invoice, Delivery Challans, Job Work, Recurring Invoices, Credit Note, e-Invoice, Sales Debit Note.

Purchase books: Purchase, Payments Made, Debit Note, Purchase Order, Reverse Charge.

Also: e-Waybill, Inventory, Ledger, Expense, Accounting (Chart of Accounts, Manual Journal, Balance Sheet, Profit and Loss, Accounting Reports), Reports, and Settings.

Ledger tabs: Debtors (Customers), Creditors (Vendors), Both, Cash and Banks, Other Accounts, Summary of Transactions.

Inventory tabs: All Items, Category Wise, Settings.

Reports list: product-wise sales and purchase, party-wise sales and purchase, GST sales and purchase, GSTR-1, GSTR-2, GSTR filing, HSN sales, delivery challan, bulk export, invoice details, party-wise invoice details, purchase details, TDS payable, TDS receivable, current stock, delivery challan details, audit trail, ageing, balance sheet, profit and loss.

## Settings that go into Lab Settings

No second settings app. Each item lands on the existing Lab Settings page when its book is built.

| GimBooks setting | Where in this app | When |
|---|---|---|
| Prefix Management | Prefixes tab, `document_series`. One row per book. Same 16-character warning. | Each new book adds its row in that session's migration |
| Sequence reset (which FY new numbers follow) | Same Prefixes tab. FY is already inside the prefix (`26-27`). | With the first new book after F10 |
| Invoice: round off, additional charges | Invoice section on Lab Settings | F11 only if the purchase form needs the same toggles; sale round-off can wait until Amit asks |
| Invoice: auto e-way, TCS, cash discount, retail | Out until that book is in scope | — |
| Expense categories | Lab Settings, expense section | F14 |
| Inventory: stock from invoice or challan, warning, MRP, wholesale, barcode, CESS | Lab Settings, inventory section | F18 |
| Sector template (Mandi, Pharma, Retail, …) | Out. This app is a BIS consultancy, not a shop template. | — |
| Merge products / buyers / sellers, subscription, restore deleted | Out | — |

New prefix rows, added only when that book is built:

| Book | `doc_type` | Suggested prefix |
|---|---|---|
| Purchase | `PURCHASE` | `QE/26-27/PU/` |
| Payment made | `PAYMENT_MADE` | `QE/26-27/PM/` |
| Debit note | `DEBIT_NOTE` | `QE/26-27/DN/` |
| Purchase order | `PURCHASE_ORDER` | `QE/26-27/PO/` |
| Expense | `EXPENSE` | `QE/26-27/EX/` |
| Refund voucher | `REFUND` | `QE/26-27/RF/` |
| Journal | `JOURNAL` | `QE/26-27/JN/` |

Vendors stay on the Client master, flagged Buyer / Vendor / Both (decision #22). Purchase, payments made, debit notes, and the creditor ledger use that flag. There is no second vendor master.

## Session order

One session at a time, in this chat, after Amit says to start it. Do not migrate or commit until he says "commit".

| Session | Book | Done when |
|---|---|---|
| F11 | Purchase bill | List and form. Vendor is a client flagged Vendor or Both. GST on the bill. Outstanding = bill total minus linked payments made and debit notes. Prefix in Lab Settings. |
| F12 | Payments made and debit note | A payment or debit note can name one purchase bill. Gross reduces that bill. TDS stays off purchase until Amit gives the rule. |
| F13 | Purchase order | Order does not hit GST or stock. Convert to a purchase bill copies lines. |
| F14 | Expenses | Expense list and form. Categories are masters in Lab Settings. A category can be added there, not only inside the expense form. |
| F15 | Ledger | Five tabs from data we already store: debtors from sale outstanding, creditors from purchase outstanding, both, cash and bank from receipt and payment mode, other accounts empty until the chart of accounts exists. |
| F16 | Refund voucher | Money returned to a client. It does not invent a new GST document. It reduces the receipt or the client balance. |
| F17 | Sales debit note | Extra charge to a client against one tax invoice. Prefix in Lab Settings. |
| F18 | Inventory | Stock on the existing Products master. Tabs: All Items, Category, and the Lab Settings inventory switches (track from invoice, low-stock warning). Do not copy GimBooks item rows. |
| F19 | Chart of accounts and manual journal | Asset, Liability, Equity, Income, Expense. A journal balances. Sale and purchase still post their own documents. The journal is for adjustments. |
| F20 | Balance sheet and profit and loss | Date range. Figures come from posted documents plus journals. |
| F21 | Reports that match the books we have | GST sales, GST purchase, party-wise sales, party-wise purchase, SAC/HSN sales, TDS receivable (receipts), ageing (already on the invoice list), current stock after F18. |

## Stays later

These were on the GimBooks menu. They are not the next sessions.

- e-Invoice and GSTR filing. Turnover has not crossed ₹5 Cr (decision #26).
- e-Waybill. The GimBooks screen is a portal login. Do not store that username or password in this app. Add an e-way record only when a delivery challan exists and Amit asks.
- GimBooks import of old parties, openings, and invoices (decision #20). After the books exist, not inside F11–F21.
- Export invoice, export proforma, retail invoice, delivery challan, job work, recurring invoice, reverse charge. Ask before any of these. A consultancy tax invoice is SAC 998393, not a goods bill.
- BIS fee master. Still out.
- Digital signature, barcode billing, and sector templates.

## Small improvements to offer, not to sneak in

- On a purchase bill, suggest the last SAC/HSN that vendor used.
- Ledger cash and bank tab can jump to the receipt or payment that created the row.
- Report pages share one date range (this FY by default) instead of a new picker on every report.
