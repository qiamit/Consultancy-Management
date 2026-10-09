# S7 coding report

- Date/time (IST): 2026-10-09 07:57
- Expected HEAD: `6da1adb` (S6b). No new commit. Push: not run.
- Result: CODED, waiting for Amit to say "commit"

## Verify
| Check | Result | Baseline |
|---|---|---|
| typecheck | 122, no new errors in touched files | 122 |
| lint | 352 (313 errors, 39 warnings), no new problems in touched files | 352 |
| build | pass, 3.97s. Existing CSS `button` warning and chunk size warning | pass |
| functions:check | not needed | pass |

Browser: local Vite `http://localhost:5173/masters/clients`, signed in as Admin. Directory loaded 17,902 clients. Edit opened an existing client. Statutory, Sites, Contacts, Lifecycle, and Certificates were on the form. GST and MSME upload buttons were present. No save was clicked. Live DB does not have the new columns yet, so the form fell back to the old client columns.

## db:migrate
Not run. File only: `backend/database/migrations/20261009060000_s7_client_master_v2.sql`.

When Amit says "commit", apply this migration before the frontend that writes the new columns is deployed. Until then, the directory payment term stays blank (`—`) because `search_clients` does not return `payment_term` yet. Edit of an old client still opens.

## Files changed
- `backend/database/migrations/20261009060000_s7_client_master_v2.sql`: states, statutory columns, sites, contacts, factory link, certificate files, similar-name RPC, `search_clients` extra columns.
- `frontend/web/src/lib/indiaValidators.ts`: GSTIN checksum, PAN, PIN, +91 mobile.
- `frontend/web/src/lib/clientsApi.ts`: search row maps `payment_term` and `remark` with null left as null.
- `frontend/web/src/features/masters/clients/types.ts`: statutory fields, sites, contacts, extra company types, state names.
- `frontend/web/src/features/masters/clients/clientsApi.ts`: similar clients, sites, contacts, certificate upload/list/delete.
- `frontend/web/src/features/masters/clients/ClientIdentitySections.tsx`: Statutory, Sites, Contacts, Lifecycle, Certificates.
- `frontend/web/src/features/masters/clients/ClientsForm.tsx`: GSTIN fills PAN, upload buttons, PAN-from-GSTIN note, 40px save.
- `frontend/web/src/features/masters/clients/ClientsMasterPage.tsx`: duplicate warning, copy name, CSV preview, sites/contacts save, edit fallback before migrate.
- `frontend/web/src/features/masters/clients/ClientsFooterBar.tsx`: Archive, Import, Export, Delete at least 40px.
- `frontend/web/src/features/sample-handling/receiving/AddClientDialog.tsx`: GSTIN check and save-anyway duplicate warning.
- `frontend/web/src/features/bis/projects/types.ts`: `factorySiteId`.
- `frontend/web/src/features/bis/projects/bisProjectsApi.ts`: saves `factory_site_id`.
- `frontend/web/src/features/bis/projects/BisProjectsForm.tsx`: factory site select.
- `frontend/web/src/features/bis/print/loadBisPrintData.ts`: office, factory, sector, top management.
- `frontend/web/src/features/bis/print/bisForm1Html.ts`: Form-I uses those values.
- `frontend/extensions/qe-consultancy-chrome/background.js`: strip `passwd` and `password`; clear `fillSentAt`.
- `frontend/extensions/qe-consultancy-safari/background.js`: same copy.
- `docs/agents/api-catalog.md`: `find_similar_clients`, `search_clients` extra columns, client certificates.

## Deviations from the prompt
- Certificate row delete uses `app_can_edit('/masters/clients')`, matching the certificate sentence. Site and contact delete stays admin-only.
- New client state default is still Chhattisgarh. Company-settings default was a listed gap, not in the build list.
- `account_manager_id` is a column and an index. There is no picker on the form.
- Before the migration, edit loads the old columns if the new ones are missing. Save of the new columns still needs the migration.
- `india_states` select policy is `USING (true)` for `authenticated` only. There is no write policy.

## Notes for the later module test
- Railway: frontend only, after migrate and push. Extension is a Chrome reload, not a Railway deploy.
- Do not drop `portal_password`. Do not remove the BIS Legal Documents screen.
- Similarity warning uses 0.35. A missing RPC returns no hits, so save is not blocked before migrate.
