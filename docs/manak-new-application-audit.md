# Manak Online — New Licence Application: field audit

Walked read-only on draft 74001988 (IS 17631:2022, Option 2, Indmet Press Metal). Nothing submitted, paid or uploaded.
Steps 1–4 captured. Step 5 (Testing & Inspection) blocks on an Excel upload, so steps 6–9 were NOT reached.
Side effect: step 1 was saved (SIT = Yes); steps 2–4 were saved empty by pressing Next.

## Portal flow
Login (eBISLogin: user id, password, captcha) → Product Certification → Apply for new licence (or Draft Applications → edit) →
1 General Info → 2 Management → 3 Manufacturing → 4 Packaging/Brand → 5 Testing → 6 Test Reports → 7 Declaration → 8 Preview → 9 Pay Fee.
Each step POSTs on "Next" (e.g. GeneralInfoFormSubmit, ManagementDetailsSubmit); draft auto-saves per step.

## Fields per step
| Step | Fields the portal asks for |
|---|---|
| 1 General Info | Prefilled from org profile (firm, factory, GST/PAN, lat/long). Asks: Indian Standard (search), Scheme of Inspection & Testing accept Yes/No (`sitBISSelect`), Varieties (text + supporting doc ≤20 MB, repeatable) |
| 2 Management | Top management rows (name, designation, contact, email, DIN); Correspondence (address Office/Factory, contact name, designation, email, phone); Technical/QA personnel rows (name, designation, qualification, qualification doc, experience yrs, photo) |
| 3 Manufacturing | Raw material rows (material+grade, supplier, conformity multi-select ISI/BIS lab/supplier cert/in-house/other, package nature, records Y/N); outsource Y/N; hygiene Y/N; Process flow chart PDF; Factory layout PDF; Machinery list Excel (template); production unit, production value, installed capacity |
| 4 Packaging/Brand | Nature of packaging, qty/package, marking on article, method (Printing/Stencilling/Embossing/Other), label form file, batch/code scheme; Brand rows (name, owned Self/Others, Registered/Unregistered, date, file); "I Agree" undertaking |
| 5 Testing | In-house testing Y/N. Yes → Testing equipment Excel (template) + declaration. No → sub-contract rows (IS clause, test, consent letter, BIS-recognised lab dropdown) |
| 6–9 | Not reached (Test Reports, Declaration/Undertaking, Preview, Pay Fee) |

## Gap check against our module (first pass, by code search in `frontend/web/src/features/bis/projects`)
Found models for: top management, technical staff, raw material reference, process flow, plant layout, machinery (CMPF305), test equipment (CMPF306/311), brand (CMPF307), location map, production value/capacity (ApplicationDetailsFields).
Not found by keyword (verify, then add): outsourcing Y/N, hygienic-conditions Y/N, correspondence block (address type + contact person), method of marking / batch-code scheme / label form, sub-contract lab list with consent letter (only partly in CMPF311), per-variety supporting documents, SIT acceptance flag, raw-material conformity multi-select and package-nature/records columns, DIN on top management (check), brand registered/date/file fields.
Also needed for the extension: a map of portal field names (listed above, e.g. `topManagementPersonName`, `rawMaterial`, `markingMethod`, `isInhouseTesting`) to our data.

## To finish the audit
Steps 6–9 need step 5 completed (equipment Excel). Options: upload the client's real equipment sheet, or walk a throwaway test firm.

---
## Update — second walk in Chrome (extension loaded), draft 74001988, IS 17631:2022

**What the extension already does:** with the QE extension in Chrome, steps 2–4 text fields were already filled from our data (top management, correspondence, technical person, raw material CRCA, outsourcing/hygiene, production value, capacity, packaging, marking method, batch code, brand name/date, "I Agree" ticked) and step 1 SIT=Yes + variety text were retained.

**Files uploaded this run** (generated from our module via PDF/Excel download, uploaded through Claude-in-Chrome): Process Flow Chart PDF, Plant Layout PDF, CMPF-305 Excel (machinery list), CMPF-306 Excel (testing equipment). Portal accepted all four without error, but whether the portal parses our Excel layout vs. its own template is **not verified** (it only validates on later steps / submit).

**Stopped at step 6 (Test Report – Option 2).** Next is silently blocked until at least one test-report row is added (variety, QR code, sample code, issue date, delay reason, report PDF, complete Y/N, conformity). Steps 7 (Declaration), 8 (Preview), 9 (Pay Fee) were not reached. Nothing submitted or paid.

### Extension updates needed
1. File-upload automation per portal field: `docId909` (flow chart), `docId203` (layout), `docId908` (machinery Excel), `docId305` (test equipment Excel), `formLabelFile`, `brandFile`, `productVaritiesFile`, technical staff qualification doc + photo. (Content scripts can't read local files; fetch from our app/storage and set via DataTransfer, or have the bridge pass blobs.)
2. Step 1: select SIT acceptance, fill variety, Next.
3. Step 5 "No in-house testing" branch: sub-contract rows (IS clause, test, consent letter, BIS-recognised lab dropdown).
4. Step 6: add test-report rows (QR/sample code dropdowns, date, report PDF, complete, conformity) from Sample Requirements / Test Reports data.
5. Steps 7–9: declaration tick, preview check, then stop before Pay Fee (never auto-pay).
6. Row "Add" buttons for repeatable tables (top management, technical staff, raw material, brand, variety) — verify they iterate over multiple rows.

### Module updates needed
1. Export formats: confirm CMPF-305/306 Excel columns match the portal's "Download Template" files (not checked).
2. Store/produce: technical staff qualification document and photo; brand logo/trademark file; label form file; per-variety supporting document.
3. Test-report data per variety: QR code, sample code, issue date, report PDF, conformity.
4. Fields missing from module (from first-pass): sub-contract lab + consent letter, correspondence address type, SIT acceptance flag.

### Dev setup notes
- `.env.local` (gitignored) sets `VITE_PDF_SERVICE_URL=/api/pdf` so local PDF export uses the Vite proxy; `.env` pointed at a hosted URL that wasn't reachable.
- Generated files are in the session scratchpad `files/` folder (not in the repo).

---
## Update 3 — reached the Preview page ("Proceed to Payment"), STOPPED there (not clicked)

Draft 74001988 / IS 17631:2022, walked all 8 steps in Chrome. Nothing submitted, nothing paid.

**Corrections to earlier notes:** test-report row, technical staff docs, consent letter, SIT flag and correspondence type already exist in the app; step 6 was only blocked because the row hadn't been added.

**Done this run**
- Step 2: uploaded Education Certificate PDF + staff photo PNG (downloaded from the app's Technical Staff Details).
- Step 6: Test Report is NOT uploaded by the applicant — the portal pulls the lab report by QR code (download button bound to QR 100001365448 / sample code 10111376/2026/SS/9, issued 16/10/2026). Added the row: variety 1st Family, QR 100001365448, Test report complete = Yes, Conformity = Yes.
- Step 7: filled "Person submitting" = Ram Natthulal Choudhary / Director (same as correspondence person); "I Agree" was already ticked; other flags = No.

**Please verify before paying**
1. Conformity = Yes was chosen without reading the 15-page lab report (could not render pages 2–15). Confirm the report says the sample conforms to IS 17631:2022.
2. "Submitting person" name/designation was my assumption (director); change if someone else submits.
3. Preview text shows SIT acceptance as an unselected dropdown, and blank cells for: Form of Label file ("File Not upload"), brand file, variety supporting document, equipment list, flow chart, layout, machinery list, staff photo. Some may just be download icons not visible in text — open the Preview page and check each.
4. Weekly offs = No, statutory permissions = No (unchanged defaults).

**Extension additions (updated):** file uploads per field (flow chart `docId909`, layout `docId203`, machinery `docId908`, equipment `docId305`, staff qualification + photo, label `formLabelFile`, brand `brandFile`, variety `productVaritiesFile`); step 6 row add (variety select, QR select, complete, conformity, click `addDetails`); step 7 submitter name/designation; stop at Preview — never click "Proceed to Payment".
**Module additions (updated):** test-report conformity flag per sample row; submitting-person name/designation; label-form file, brand logo file and variety supporting doc if not stored; confirm CMPF-305/306 Excel layout matches the portal template.

---
## Update 4 — Manak Assist + QE extension "New Application" (draft 74001990, reached Preview, NOT paid)

Flow: Consultancy Pro → BIS New Applications → Manak Assist (↗) builds `QE_MANAK_NEWAPP_V1`
(`frontend/web/src/features/bis/projects/manakNewAppPayload.ts`) → extension opens eBIS login (user id + password filled,
user types captcha) → `newapp-fill.js` fills each step on page load. It never clicks Next / Submit / Proceed to Payment.

Generated by the app at click time (saved to `bis-project-files/<projectId>/manak-assist/`): Own SIT (CMPF-311 PDF, only when SIT = No),
Process Flow Chart, Plant Layout, Outsourcing controls (Sub-contracting doc), Hygiene Conditions, CMPF-305 machinery `.xlsx`,
CMPF-306 equipment `.xlsx` (Manak requires it even when testing is sub-contracted).

Portal field map (exact ids; rows are numbered `…0, …1`, "+" appends a blank row, so fill row i before adding i+1):
| Step | Fields |
|---|---|
| 1 GeneralInfoForm | `knowStandardNumber`, `standardNumberTemp` + Search, IS select, Option select (simplified → Option 2), `sitBISSelect`, `sitApplicantFileUpload` (own SIT), `productVarities#`, `productVaritiesFile#`, + `addproductVarities()` |
| 2 ManagementDetails | `topManagementPerson{Name,Designation,ContactNumber,EmailId,DIN}#`, `correspondenceCommunication`, `correspondencePerson{Name,Designation,EmailId,ContactNumber}`, `technicalManagement{PersonName,PersonDesignation,Qualification,Experiance}#`, `technicalManagementQualificationDocumentFile#`, `technicalManagementPersonPhoto#` |
| 3 ManufacturingProcess | `rawMaterial#`, `nameSupplier#`, `conformityMaterial#` (select2 multi: 1 ISI, 3 BIS lab report, 4 supplier TC, 5 in-house, 6 other), `naturePackage#`, `recordMaintained#` (yes/no); `isOutsource` (+ `docId929` agreement, `docId930` controls), `isHyygenicCondition` (+ `docId316`), `docId909` flow chart, `docId203` layout, `docId908` machinery xlsx, `unit`, `productionValue`, `presentCapacity` |
| 4 PackagingDetails | `packagingNature`, `packageQuantity`, `markingArticle`, `markingMethod` (+ `markingMethodOther`), `batchCode`, `formLabelFile` (optional), `brandName#`, `brandOwned#`, `brandRegister#`, `brandRegisterDate#` (dd/mm/yyyy), `brandFile#`, `agree` |
| 5 TestingInspection | `isInhouseTesting`, `docId305` equipment xlsx (always), `clauseNumber#`, `testSubContract#`, `labSubContract#` (option value = lab OSL code), `consentLetterFile#` |
| 6 TestReport | `productVarirtyDescription`, `qrCode` (value = QR), `testDelayReason`, `testReportComplete`, `conformitySample`, `#addDetails`; `longDurationTestsFlag`, `rawMaterialOption1Flag` |
| 7 Declaration | `appSubmittingPersonName`, `appSubmittingPersonDesignation`, `isWeeklyOff` (+ `weeklyOffDays` multi), statutory / other info / other request / auth letter flags, `agree` |

Lessons: Manak validates uploads by file-name extension; a malformed email blocks Next; lab names are ambiguous
(two "Alpha Test House Private Limited") — match by OSL code; portal alerts are captured into the panel while the extension fills.

Step 7 Other Information: Yes by default; it carries every application document as a PDF (the Step 8 list,
`applicationDocuments.ts`, rendered with the Documents dialog's PDF routine `bisDocumentPdf.ts`) plus files added by hand.
On Manak each becomes an `otherInformationFile#` row with its file name. Generating ~30 PDFs takes about a minute.
