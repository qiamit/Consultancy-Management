# Test copy of Consultancy Pro on the Mac

A separate Consultancy Pro on this Mac for **QE - Local Host**, built from the same `deploy/oracle` files, with
its own database, files and keys. Nothing saved here reaches the server. Guide: `docs/local-and-live.md`.

| | |
|---|---|
| App, built as on the server | http://127.0.0.1:8090 |
| App, while developing | http://localhost:5177 (`npm run dev --prefix frontend/web -- --mode testcopy --port 5177`, after `tc.sh use-frontend`) |
| API / MCP / PDF / database | http://127.0.0.1:54331, :8091, :3857, Postgres on :54332 |
| Ports | 127.0.0.1 only: not reachable from another computer |
| Email, reminders, scheduled AI tasks | Off |
| AI, Manak, mail passwords | Removed by masking; this copy has its own encryption key |
| Files | Docker volume. Real files are not copied; `tc.sh placeholders` puts a placeholder behind each record |
| Docker | Colima in the user's home folder, shared with the LIMS test copy but separate by name (`qe-test`) |

## First time on a Mac

Docker (Colima) is already installed for the LIMS. Then, once:

```bash
deploy/test-copy/tc.sh settings
```

```bash
deploy/test-copy/tc.sh refresh
```

```bash
deploy/test-copy/tc.sh use-frontend
```

`refresh` = `fetch` + `load` + `up` + `placeholders`. Run it from the Mac's Terminal app: it asks for `COPY`.
It uses the server key `~/.ssh/qe_oracle`.

## What fetch does

1. Starts a throwaway database in memory with no network.
2. Reads the live database read only (`default_transaction_read_only`) over SSH: schemas public, private, auth,
   storage. Vault (the live encryption key) is not read.
3. `mask.sql` replaces client names, contact people, addresses, emails, phones, GST, PAN and Manak user ids, also
   inside other text and JSON (application sections, audit log). People named in application sections (Top
   Management, signatories) are replaced too. Q Engineering's bank details are replaced.
4. Removes all stored secrets (Manak passwords, AI keys, mail and portal secrets), mail, connector sign-ins,
   sessions and authenticators. Sign-ins become `user-NN@example.test` with one test password.
5. Checks the result (counts only, never a value). Only if every check is `ok` is a copy saved in
   `deploy/test-copy/local/`, which git ignores.

Limits: a name written differently in free text (a spelling mistake, a short form) or a one-word name inside other
text can remain. Staff names stay. Treat a masked copy as confidential: keep it on this Mac.

## Testing the scripts

`mask-test-fixture.sql` holds invented data. With the test copy's database running (`tc.sh up`), load it there and
let a local script stand in for the server:

```bash
TC_CONFIRM=yes TC_FAKE_SERVER=/path/to/fake-server.sh deploy/test-copy/tc.sh fetch
```

where the fake server runs `docker exec -e PGOPTIONS='-c default_transaction_read_only=on' qe-test-db-1 sh -c "$1"`.

## Rules

- `tc.sh` refuses to run unless Docker is on this Mac's Colima engine and the settings file is this copy's.
- `frontend/web/.env` points at the live API. Only `.env.testcopy` (mode testcopy) points here.
- The migrations do not replay on an empty database (the first tables came from the old app), so the test copy is
  always made from a masked live copy.
