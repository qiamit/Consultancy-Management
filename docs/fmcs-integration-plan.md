# FMCS in Consultancy Pro — Review and Plan

Date: 22 Oct 2026. Sources: the app code (BIS Licences / New Applications, Client Master, extension bridge), the QE Consultancy
extension (v2.7.6), and a read-only walk through the FMCS portal (`manakonline.in/FMCS`, draft application 41000532, IS 6603,
ASOFORGE S.r.l., Italy). Nothing was saved or submitted on Manak.

## 1. What the FMCS portal asks for

The FMCS portal is a separate login (`/FMCS/login`, not `/MANAK/eBISLogin`) with the same 9-step application. Most field ids are the
same as the domestic form, so the app's data and the extension's filling code can be reused. The differences:

| Step (FMCS URL) | Same as domestic | New / different for FMCS |
|---|---|---|
| 1 General (`FMCS_GeneralInfomationForm`) | IS search (`knowStandardNumber`, `standardNumberTemp`, group/sub-group), BIS SIT Yes/No + own SIT upload, varieties + files | Firm and factory are foreign (country, no state/district, foreign phone). Procedure is **Option 1** (normal). Marking fee shown in ₹ per unit. |
| 2 Management (`FMCS_ManagementDetails`) | Top management rows, correspondence (Office/Factory + contact), technical staff (qualification doc, photo) | **AIR Details (single)**: name, designation, contact, email, DIN, **AIR Nomination Letter** (file), **Residency Status** (Resident Indian / Resident Indian working in applicant's organisation or group company). Phone numbers with country code (0039…). |
| 3 Manufacturing (`FMCS_ManufacturingProcess`) | Raw material rows, outsourcing, hygiene, process flow chart (docId909), layout (docId203), machinery Excel (docId908), production unit / value / capacity | Raw material row has **Supplier Country** (253-country select). Extra upload docId929 (outsourcing controls). Production value asked in ₹. |
| 4 Packaging (`FMCS_PackagingDetails`) | Identical (nature, quantity, marking, method, label, batch code, brands + files) | — |
| 5 Testing (`FMCS_TestingInspection`) | In-house Yes/No, sub-contract rows (clause, test, lab), equipment list Excel (docId305) | **Consent letter** upload (docId306). Sub-contract lab type: *Lab of same group of company / BIS lab / BIS approved lab / BIS licensee lab* with free-text **Name of Lab** (foreign group lab). |
| 6 Test Reports (`FMCS_TestReport`) | — | **Option 1 only**: (A) in-house test report of the product in **Form IV** format (docId913); (B) raw material: per material — description, test report/certificate file, complete Yes/No, conformity Yes/No. No QR / OSL rows. |
| 7 Declaration (`FMCS_Declaration`) | Statutory permissions, other info / other request files, submitting person, authorization letter, weekly offs | FMCS undertakings: bear **inspection charges**, arrange **translator**, sign **agreement** with BIS, **Indemnity Bond**, **Performance Bank Guarantee of US $10,000** (Indian bank branch) after grant. |
| 8–9 Preview / Pay fee | — | Fee paid by the foreign firm. |

After submission (FMCS "Submitted Applications"): BIS sends the **STI and marking fee for acceptance** (Accept STI, Marking Fee per
year/unit, DO remarks). Granted licences list has CM/L no., validity, brand/label upload. "Test Samples" has Generate QR Codes and
Test Request (same idea as domestic).

## 2. What the app has today

- One table `bis_projects` serves All BIS Licences, New Applications, Inclusion, Renewals (split only by `project_kind` and dates).
- **FMCS already exists as a scheme row** (`certification_schemes.code = 'fmcs'`) and `bis_projects.certification_scheme_id` exists,
  but no screen sets or shows it. Client type **"Foreign Manufacturer"** already exists.
- Missing: AIR (no contact role, no fields), country on client sites, foreign phone format, FMCS undertakings/bond/PBG,
  Option-1 test-report data in the extension payload, USD amounts, FMCS portal login URL.
- Extension 2.7.6 fills only domestic Manak (`/MANAK/...` paths and login). It has no AIR, supplier country, Option-1 test report,
  consent letter (docId306) or docId929 handling.

## 3. Plan

### Phase 1 — FMCS as a scheme inside the same pages (app + DB)
1. **Scheme on every application/licence**: a "Scheme" select (Domestic / FMCS) on the New Application and licence form, saved in
   `certification_scheme_id`. A **Domestic / FMCS filter** and an **FMCS badge** on All BIS Licences and New Applications
   (same pages, no new route, so Module Access and RLS stay as they are).
2. **Client Master for foreign firms**: country on client sites (office and factory), state/district/PIN optional when country ≠
   India, phone with country code; the "Foreign Manufacturer" type preselects FMCS on new applications.
3. **Portal login**: FMCS user id/password stored like today; the login button opens `/FMCS/login` for FMCS rows.

### Phase 2 — FMCS steps in the application wizard
1. Step 2: **AIR module** (name, designation, mobile, email, DIN, residency status, nomination letter) + a generated
   **AIR Nomination Letter** document. DIN optional for foreign top management.
2. Step 3: **Supplier Country** column in raw materials (default = factory country).
3. Step 5: **Consent Letter** document; sub-contract rows with lab type and free-text group-lab name.
4. Step 6: **Option 1 test reports**: in-house test report in Form IV (generated from the Factory Test Report data) and raw-material
   test certificate rows (file, complete, conformity) — instead of QR/OSL rows for FMCS.
5. Step 7: FMCS undertakings page + documents: **Agreement**, **Indemnity Bond**, **PBG** format, translator undertaking.
6. After submission: track **STI acceptance and marking fee acceptance**, PBG (bank, amount US$ 10,000, number, validity with renewal
   reminder), agreement and indemnity bond status, inspection (dates, inspection charges, visa/travel notes).
7. Fees: amount + currency (₹ / US$) for application fee, inspection charges, marking fee, PBG.

### Phase 3 — QE Consultancy extension (FMCS)
1. Detect FMCS by path `/FMCS/`; FMCS login URL; navigation `FMCS_ApplicantDashBoard → FMCS_ApplicantSaveAsDraft → Edit` or
   "Apply for new licence" (`#pcappsublink`).
2. Step detection by FMCS page names (`FMCS_ManagementDetails`, `FMCS_ManufacturingProcess`, `FMCS_PackagingDetails`,
   `FMCS_TestingInspection`, `FMCS_TestReport`, `FMCS_Declaration`) — more reliable than field markers.
3. Reuse the existing fillers (same ids) and add: AIR row (`allIndiaRepresentativeDetails*`, nomination letter file, residency
   checkbox), `supplierCountryId#`, docId929, docId306, `surveyItemTypeName#` + `textBox#`, Option-1 test report (`docId913`,
   `optionOneRawMaterial*`, `optionOneTestReport*`, `optionOneConformityRawMaterial*`).
4. Payload gets `scheme: 'fmcs'` and the new data; Pay / Submit are never clicked (as today).
5. Later: FMCS Test Samples (QR / test request) like the domestic import.

### Phase 4 — MCP and reports
`search_projects` / `licences_due` get a scheme filter; FMCS shown in dashboards and renewal reminders (incl. PBG expiry).

## 4. Order of work
Phase 1 → Phase 2 (AIR, Option-1 test report and declaration first) → Phase 3 → Phase 4. Each phase is its own PR, merged and
deployed with its migrations, then checked on the FMCS draft (fill only, no submit).
