# Baselines

A session may never make these worse. QE Coder updates this file when the numbers improve, and notes the commit.

## Code quality (repo root)
| Check | Value | At commit | Notes |
|---|---|---|---|
| `npm run typecheck` | 122 errors | `ff2b9f7` (S5) | No new errors in touched files |
| `npm run lint` | 352 problems (313 errors, 39 warnings) | `ff2b9f7` (S5) | No new problems in touched files |
| `npm run build` | pass | `ff2b9f7` (S5) | Existing CSS `button` warning + chunk-size warning are known |
| `npm run functions:check` | pass | `ff2b9f7` (S5) | `node --check` server.mjs + qiAssistant.mjs |

## DB sanity counts (live, 2026-10-08; for spotting unexpected drops, not exact matches)
| Table | Approx rows |
|---|---|
| `public.clients` | 17,902 |
| `public.is_codes` | 1,427 |
| `public.test_parameters` | 164 |
| `public.bis_projects` | 29,777 (255 QE-managed) |
| users (`user_profiles`) | 5 (Amit Kumar, Lalit Kumar, Praduman Dubey, Pritam Sharma, Swati) |
| `public.lab_settings` | 1 (id `00000000-0000-0000-0000-000000000001`) |

## Migrator
`npm run db:migrate` prints `APPLY` / `OK` / `FAIL` per file and does not print NOTICE lines. Latest applied: `20261008200000_s6_portal_secrets_bis_rls.sql`.
