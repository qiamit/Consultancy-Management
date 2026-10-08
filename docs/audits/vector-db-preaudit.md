# Vector DB pre-audit

Opened: 2026-10-08

IDs **VDB-01** through **VDB-29** are reserved. Never renumber them.

The full source text for VDB-03–VDB-18 and VDB-20–VDB-29 was not in the repository when this file was created. Those IDs stay **Open** with no invented findings. When the source audit is copied in, replace only the reserved rows and keep these IDs.

## VDB-01 — Search API log_message crashes every response

- Priority: P0
- Status: Done
- Date: 2026-10-08
- Files changed: `knowledge_engine/scripts/serve_knowledge_search_api.py`, `knowledge_engine/scripts/test_search_api_http.py`

`Handler.log_message` formatted `fmt % ("*",)`, while `BaseHTTPRequestHandler.log_request` calls `log_message('"%s" %s %s', requestline, code, size)`. That `TypeError` happens inside `send_response`, so every request ends with "Remote end closed connection without response".

Fix: log method and status only. Do not interpolate the request line. Must not raise on the 3-argument request format or on a `%d` format.

Verification (2026-10-08):

- `knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_search_api_http` — ALL PASS (log.no_raise, log.has_status, log.no_query; live requests returned JSON).
- Manual: restarted API on 127.0.0.1:3851. `GET /health` 200, `GET /standards` 200, `POST /search` `{"query":"scope of this standard","standard":"IS 2142"}` → `ok: true`. Server log lines are `GET`/`POST` plus status only.

## VDB-02 — Search rejects standards the API advertises

- Priority: P0
- Status: Done
- Date: 2026-10-08
- Files changed: `knowledge_engine/search_pipeline.py`, `knowledge_engine/scripts/test_search_api_http.py`

`run_hybrid_search` rejected any standard outside `STANDARD_FILTERS` (`all`, `IS 9666`, `IS 2676`). `list_verified_standards()` / `build_standards_payload()` advertise the standards actually present on the open collection. Commit `9495c4c` relaxed `load_pool_chunks()` and left this guard in place.

Fix: accept `all` or any standard returned by `list_verified_standards(collection)`. Otherwise return `unknown_standard` with a Hindi message that does not hard-code IS 9666 or IS 2676. Keep usable / needs_review gating unchanged.

Verification (2026-10-08):

- HTTP test: `all` and `IS 2142` return `ok: true`; `IS 99999` returns `unknown_standard` and the Hindi message has no 9666/2676.
- Manual `POST /search` standard `IS 2142` on `bis_pilot_representative_v1`: `ok: true`, `answerability_state: supported`, `result_count: 5`. `/standards` lists 38 entries (`all` plus 37), including `IS 2142`.
- `run_reliability_eval`: Pass@1 34/35, NOT_FOUND hard reject 16/16, leaks 0.
- `run_pilot_eval`: Pass@1 6/6, NOT_FOUND reject 3/3.

## VDB-03 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-04 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-05 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-06 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-07 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-08 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-09 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-10 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-11 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-12 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-13 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-14 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-15 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-16 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-17 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-18 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-19 — Search has no error boundary around collection reads

- Priority: P0
- Status: Done
- Date: 2026-10-08
- Files changed: `knowledge_engine/scripts/serve_knowledge_search_api.py`, `knowledge_engine/scripts/test_search_api_http.py`

`run_hybrid_search` does not catch failures from `collection.get` / `collection.query`. Minimal fix: `run_search` returns `{"ok": false, "error_code": "search_failed", "message_hi": ...}` with no paths and no traceback. Response fields used by the frontend stay the same. Pipeline callers (evals) still see the original exception.

Verification (2026-10-08):

- HTTP test `search.failed.*`: a raising `collection.query` returns HTTP 400, `error_code: search_failed`, Hindi `message_hi`, and the body has no path and no traceback.

## VDB-20 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-21 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-22 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-23 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-24 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-25 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-26 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-27 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-28 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.

## VDB-29 — Reserved

- Priority: —
- Status: Open
- Date: 2026-10-08
- Source finding text not in repo. Do not renumber.
