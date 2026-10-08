# <ID> coding report

- Date/time (IST):
- Expected HEAD → new commit: `<prev>` → `<hash>` · Push: `<prev>..<hash> main -> main`
- Result: SHIPPED | STOPPED at step <n>

## Verify
| Check | Result | Baseline |
|---|---|---|
| typecheck | | 122 |
| lint | | 352 |
| build | | pass |
| functions:check | | pass |

## db:migrate
```
<APPLY / OK / FAIL lines, full error if any>
```

## Files changed
- `<path>`: one line

## Deviations from the prompt
- none / ...

## Notes for Auditor and Tester
- Railway services that must redeploy: frontend / functions / api
- Things worth a closer look:
