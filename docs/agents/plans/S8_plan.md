# S8: BIS reference masters

Status: started 2026-10-09 (Amit: start S8, then S9, then S10, then migrate, commit, and go live)
Work-order slot: Masters, after S7

## Scope
- In: `certification_schemes`, `bis_offices` (HQ and five regional offices), `licence_statuses`. Nullable links on `bis_projects`. Selects on the BIS project form.
- Out: officer master, document-type checklist, fee amounts, Finance.

## Acceptance
Reference rows are readable by someone who can view BIS projects. Only an admin can change them. Existing projects keep working when the new ids are empty.
