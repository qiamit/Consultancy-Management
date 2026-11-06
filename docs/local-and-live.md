# Local Host and Live Production

Two Claude sessions look after Consultancy Pro (QE Consultancy). All work is done in **QE - Local Host**.
**QE - Live Production** only releases finished work to the Oracle server, checks it there and looks into live
errors. The two sessions message each other.

| | QE - Local Host | QE - Live Production |
|---|---|---|
| Works on | The test copy on this Mac | The Oracle server (`qe-consultancy`, 129.225.118.1) |
| App link | http://localhost:5177 (while developing), http://127.0.0.1:8090 (built as on the server) | https://qengineering.in |
| Data | Masked copy of live data. Nothing saved here reaches the server | Real client data: every production rule applies |
| Does | Build, test, commit, merge to `main` with the owner's OK | Release with the owner's go-ahead, check after release, look into live errors |
| Never | Writes to the live database or server | Writes new features. A live error is fixed in Local Host, then released |

The LIMS has its own pair (Lims - Local Host, Lims - Live Production). Its test copy runs on the same Docker
engine on this Mac but under its own name, ports and data (`qirlpl-lims-test`, 8088 / 54321); the QE copy is
`qe-test` (8090 / 54331 / 8091 / 3857 / 54332). The two never share a container, volume or key.

## Daily work (Local Host)

1. Work on the Local Host branch in its own worktree.
2. Develop on http://localhost:5177: the dev server runs in mode `testcopy`
   (`npm run dev --prefix frontend/web -- --mode testcopy --port 5177`, or the `qe-local` entry of
   `.claude/launch.json`). It reads `frontend/web/.env.testcopy`, written by `deploy/test-copy/tc.sh use-frontend`,
   which points at the test copy. Port 5176 (the `web` entry) still uses `frontend/web/.env`, which points at the
   live API: never save test data there.
3. A new migration: `deploy/test-copy/tc.sh migrate` applies it to the test copy. A frontend change for the built
   app: `tc.sh web`. A backend service change: `tc.sh up` rebuilds it.
4. Test, then commit each finished change. Nothing goes live until a release.
5. Sign-ins: `deploy/test-copy/local/test-accounts.txt`, password in `local/test-password.txt`. Admin accounts are
   asked to set up Two-Step Login again, as on the server.

## Refreshing the test copy from live

Run it from the Mac's Terminal app (not the chat). It asks for `COPY`, reads the live database read only, masks
it in memory and saves it only if all checks pass. Stored files are never copied.

```bash
deploy/test-copy/tc.sh refresh
```

`tc.sh status` shows what is running. After a Mac restart: `tc.sh start-docker`, then `tc.sh up`.
More in `deploy/test-copy/README.md`.

## Releasing (any day)

A merge to `main` deploys nothing. The "Deploy to Oracle" GitHub workflow runs only by hand.

1. **Local Host:** the change is tested on the test copy and the build passes (`npm run build` in `frontend/web`,
   `npx tsc --noEmit -p tsconfig.app.json` at its usual error count). With the owner's OK the branch is merged to
   `main`.
2. **Local Host to Live Production:** a message with the commit, what changed and what to smoke-test.
3. **Live Production:** shows the plan (read only):

   ```bash
   deploy/oracle/release-plan.sh
   ```

   It compares the last successful deploy with `origin/main`: migrations to apply, parts that change, steps.
4. **Live Production, after the owner says go in chat:** a backup first when there are migrations, then
   `gh workflow run deploy-oracle.yml --ref main` and `gh run watch`. The workflow builds the web app, rebuilds
   the containers and applies the migrations on the server.
5. **Live Production:** checks https://qengineering.in, smoke-tests the changed areas and reports back to Local
   Host. If the release breaks something: tell the owner, then release the last good commit (revert on `main` in
   Local Host and release again).

## A live error

Live Production finds the cause (the owner's report, the browser, read-only checks) and sends it to Local Host.
Local Host reproduces it on the test copy, fixes it and tests it, then it is released as above. Only an
emergency (site down or data at risk) may be fixed on the server first, with the owner's approval.

## Rules for both

- Secrets are never printed or asked for in chat. Passwords (Manak, BSB, Zoho) are typed by the owner in the app.
- Replies to the owner in Hindi: what is happening and what the owner has to do.
- Only these two sessions work on QE. No side sessions.
