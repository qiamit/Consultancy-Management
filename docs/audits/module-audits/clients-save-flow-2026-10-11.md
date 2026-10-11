# Client Master save-flow follow-up audit — 2026-10-11

Scope: longitude/latitude persistence and Google Maps coordinate paste in Client Master.

## Completed

- Added nullable `clients.longitude` and `clients.latitude` columns with migration `20261009340000_client_longitude_latitude.sql`; applied it to the connected database and recorded it in `app_schema_migrations`.
- Updated the Client Master edit/new form to load and save both columns. Coordinates are no longer silently omitted from a successful save.
- Added paste parsing for comma-separated coordinates, Google Maps coordinate URLs, and the compact clipboard string supplied by the user. Parsing maps the first value to latitude and the second to longitude, with range validation.
- Database transaction round-trip passed: inserted a temporary `ZZ TEST` row, updated both coordinate values, read back exact values, then rolled back. Verified no test row remained.
- Verified the supplied compact sample maps to latitude `21.33220017266269` and longitude `81.61637891580143`.
- Targeted ESLint and production build passed on a clean `HEAD` snapshot with the isolated patch.

## Remaining verification

- Authenticated browser UI testing (paste into both fields, save/reopen, and Save & Close) could not be automated because no browser debugging connection was available. The database round-trip verifies persistence directly but does not replace this UI check.
- Full repository typecheck remains blocked by pre-existing unrelated diagnostics in BIS, Finance, and shared frontend files. The staged Client Master files produced no TypeScript diagnostics.
- The save flow writes the client row before related site/contact rows; those related writes are not one database transaction. A later child-write failure can therefore leave the client row updated. This is outside the coordinate persistence change.
