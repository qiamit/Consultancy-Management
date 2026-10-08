# S6 coding report

- Date/time (IST): 2026-10-08 20:37 IST
- Expected HEAD → new commit: `ff2b9f7` → `e5dd94a` · Push: `ff2b9f7..e5dd94a main -> main`
- Result: SHIPPED

## Verify
| Check | Result | Baseline |
|---|---|---|
| typecheck | 122 errors, none new in touched files | 122 |
| lint | 352 problems (313 errors, 39 warnings), none new in touched files | 352 |
| build | pass (existing CSS `button` warning and chunk-size warning) | pass |
| functions:check | not run (functions service not changed) | pass |

`frontend/web/src` grep for `passwd`: no matches. `portal_password` remains only as the deprecated always-null column type and `portal_password_set`. `portalPassword` remains only in the new-password form field, the save RPC, and the extension postMessage payload.

## db:migrate
Only `20261008200000_s6_portal_secrets_bis_rls.sql` was applied. Every older file was `SKIP` or `MARK SKIPPED`.

```
APPLY 20261008200000_s6_portal_secrets_bis_rls.sql
OK 20261008200000_s6_portal_secrets_bis_rls.sql
```

The migrator does not print `RAISE NOTICE`. The line `S6: 257 portal passwords encrypted and verified` was not shown. Exit code 0.

## Files changed
- `backend/database/migrations/20261008200000_s6_portal_secrets_bis_rls.sql`: encryption, BIS RLS, roles, audit history RPC, `search_clients`, live-schema reconciliation (verbatim from the prompt).
- `frontend/web/src/features/bis/projects/bisPortalSecretApi.ts`: typed set / extension-login / reveal RPCs with friendly errors and no password in thrown text.
- `frontend/web/src/features/bis/projects/types.ts`: `portal_password_set`, new-password form fields; list mapping no longer reads the plaintext column.
- `frontend/web/src/features/bis/projects/bisProjectsApi.ts`: password removed from the row payload; set/clear after save; client search via `search_clients`; archived hidden on lab and IS-code option lookups.
- `frontend/web/src/features/bis/projects/BisProjectsForm.tsx`: masked saved password, Change/Clear, admin Reveal (20 s) and Copy.
- `frontend/web/src/features/bis/projects/BisProjectsMasterPage.tsx`: passes `projectId` into the form so Reveal/Copy know the row.
- `frontend/web/src/features/bis/projects/BisProjectsTable.tsx`: Manak Assist sends `projectId`, not a password.
- `frontend/web/src/features/bis/projects/manakExtensionBridge.ts`: no `passwd` in the URL; `postMessage` target is this origin; password fetched only after the extension answers.
- `frontend/web/src/features/bis/projects/LegalDocumentsModuleDialog.tsx`: `hasPortalPassword` from `portal_password_set`.
- `frontend/web/src/features/bis/projects/OslSampleRequirementsModuleFields.tsx`: QR import and test-request fill use `projectId`.
- `frontend/web/src/features/bis/renewals/bisRenewalsApi.ts`: client name match excludes archived rows.
- `frontend/web/src/lib/clientsApi.ts`: typed `searchClients`.
- `frontend/web/src/lib/clientsCache.ts`: `archived_at` on picker rows; `activePickerClients` keeps the current document client.
- `frontend/web/src/features/finance/sale/quotation/QuotationMasterPage.tsx`: dropdown hides archived clients; contact lookup still uses the full cache.
- `frontend/web/src/features/finance/sale/shared/SaleDocumentMasterPage.tsx`: same picker rule.
- `frontend/web/src/lib/auditApi.ts`: `getAuditHistory`.
- `frontend/web/src/components/lims/AuditHistoryDialog.tsx`: admin history dialog, table at ≥640 px and cards below, fits 360 px.
- `frontend/web/src/features/masters/clients/ClientsFooterBar.tsx` and `ClientsMasterPage.tsx`: History for `clients`.
- `frontend/web/src/features/masters/is-codes/IsCodesFooterBar.tsx` and `IsCodesMasterPage.tsx`: History for `is_codes`.
- `frontend/web/src/features/masters/test-parameter/TestParameterFooterBar.tsx` and `TestParameterMasterPage.tsx`: History for `test_parameters`.
- `frontend/web/src/features/masters/products-services/ProductsServicesFooterBar.tsx` and `ProductsServicesMasterPage.tsx`: History for `products_services_master`.
- `frontend/web/src/hooks/useAuth.ts`: loads `role`.
- `frontend/web/src/lib/isLaboratoryDirector.ts`: `role === 'admin'` counts as admin.
- `frontend/web/src/components/lims/LaboratoryDirectorOnly.tsx`: passes `role` from `useAuth`.
- `frontend/web/src/features/settings/module-access/resolveModuleAccess.ts`: viewer caps `edit` to `view`.
- `frontend/web/src/features/settings/module-access/ModuleAccessProvider.tsx`: puts `role` on the access context.
- `frontend/web/src/features/settings/user-management/types.ts`: `accessRole` on the user record.
- `frontend/web/src/lib/fetchTeamUsers.ts`: merges `user_profiles.role` (`list_team_users` does not return it).
- `frontend/web/src/features/settings/user-management/UserManagementMasterPage.tsx`: maps `accessRole`.
- `frontend/web/src/features/settings/user-management/UserManagementForm.tsx`: Admin / Staff / Viewer select; `set_user_role` after profile save.
- `frontend/web/src/features/settings/user-management/UserManagementTable.tsx`: Role column; table scrolls sideways.
- `docs/agents/api-catalog.md`: rows for the new RPCs.
- `docs/agents/BASELINES.md`: latest applied migration filename only. Counts unchanged.
- `.cursorrules` and `.cursor/rules/*`: QE workflow files already in the working tree, included by the prompt.
- `docs/agents/**`: plans, this report, catalog, status, baselines.

## Deviations from the prompt
- `bisRenewalsApi.ts` has no separate IS-code option lookup. The only client query is `matchingClientIds` (also used by the renewals list search). `.is('archived_at', null)` was added there, so an archived client's name also drops out of renewal list search.
- C4: Add Client quick-add (`AddClientDialog`) does not check duplicates. Skipped, as the prompt allows when no check exists.
- E3 needed `ModuleAccessProvider.tsx` so `ctx.role` exists. E4 needed `types.ts`, `fetchTeamUsers.ts`, and `UserManagementMasterPage.tsx` because `list_team_users` does not return `role`. B4 needed `BisProjectsMasterPage.tsx` to pass `projectId`.
- Two lint hits from new effects (password reset, history load) were rewritten so the lint count stayed 352. Not a behaviour change.

## Notes for Auditor and Tester
- Railway services that must redeploy: frontend (api/functions unchanged).
- Between migrate and the new frontend, the old UI opens Manak without a password in the URL. Saving a password still encrypts via the compatibility trigger.
- Confirm `portal_password` is null, `portal_password_set` matches the secret count, and `portal_secret_access_log` has the migrate rows. Do not paste any password into chat or a report.
- Things worth a closer look: BIS RLS (view / edit / none), viewer cap, self-demotion refused, Reveal/Copy admin-only and cleared after 20 s, archived clients hidden in pickers but still shown on an existing quotation, History only for one selected row and only for admin.
- Futuristic proposals (not built): a small admin view of `portal_secret_access_log` on the BIS form; press `H` for History when one master row is selected; picker hint “archived clients hidden”.
