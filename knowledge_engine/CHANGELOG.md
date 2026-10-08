# Changelog

## 0.1.0 — 2026-10-08

- Pilot search API on 127.0.0.1:3851 (`GET /health`, `GET /standards`, `POST /search`).
- VDB-01: `log_message` no longer crashes the HTTP response.
- VDB-02: search accepts `all` or any verified standard in the open collection.
- VDB-19: search failures return `error_code: search_failed` without paths or tracebacks.
