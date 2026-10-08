# BIS knowledge search HTTP API

Implemented by `knowledge_engine/scripts/serve_knowledge_search_api.py`. Bind is localhost only (`127.0.0.1`, port `3851`). Start from the repo root:

```
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.serve_knowledge_search_api
```

The Vite dev server proxies `/api/knowledge` to this process. The same handlers accept `/health` and `/api/knowledge/health`, `/standards` and `/api/knowledge/standards`, `/search` and `/api/knowledge/search`.

JSON responses use `Content-Type: application/json; charset=utf-8`. There is no API key. The process refuses to bind to any host other than `127.0.0.1`, `localhost` or `::1`.

## GET /health

`200` when a collection is open. `503` when it is not. Body fields:

- `ok` (boolean)
- `host`, `port`
- `collection`, `usable_chunk_total`, `model_name`, `corpus_mode` (`pilot` or `baseline_test`)
- `error` (init error string, or null)
- `message_hi`
- when a collection is open: `banner_en`, `banner_hi`, `disclaimer_hi`

## GET /standards

`200`. Body fields:

- `ok`
- `collection`, `usable_chunk_total`, `corpus_mode`
- `standards`: `[{ "id", "label" }]`, with `id: "all"` first, then verified IS numbers from usable chunks
- `modes_note_en`, `modes_note_hi`
- `banner_en`, `banner_hi`, `disclaimer_hi` when a collection name is set

## POST /search

JSON body (also accepted as GET query `q` / `query`, `standard`, `limit`):

- `query` or `q` (string, required for a search; max 2000 characters)
- `standard` (string, default `all`)
- `limit` (integer, default 5, clamped to 1–10)

`200` when `ok` is true. `400` when `ok` is false (except transport limits below).

Success fields (`ok: true`):

- `query`, `standard`, `limit`, `result_count`
- `answerability_state`: `supported`, `uncertain` or `not_found`
- `message_hi`
- `results`: when `answerability_state` is `not_found` this is `[]`. Otherwise each hit has `chunk_id`, `text`, `is_number`, `clause_number`, `pdf_pages`, `source_relative_path`, `source_aliases`, `path_std_contexts`, `alias_decision`, `content_document_id`, `review_status`, `sample_label`, `is_number_verified`, `is_number_metadata_status`, `rank`, `_debug`
- `evidence_chunks`: same empty rule as `results`. Each item has `chunk_id`, `text`, `standard`, `clause`, `pdf_pages`, `review_status`, `rank`, `sample_label`, `source_relative_path`, `source_aliases`, `path_std_contexts`, `alias_decision`, `content_document_id`
- `evidence_reasons`, `signals_summary`, `debug_scores`, `debug_nearest`
- `alias_dedupe_applied`, `ranked_before_dedupe`, `ranked_after_dedupe`
- `disclaimer_hi`, `note_hi`
- added by the HTTP layer: `collection`, `usable_chunk_total`, `model_name`, `corpus_mode`, `banner_en`, `banner_hi`

There is no nested `banners` object. Banner text is the top-level `banner_en` and `banner_hi` fields (plus `disclaimer_hi`).

## Error codes

| `error_code` | When | HTTP |
|---|---|---|
| `unknown_standard` | `standard` is not `all` and not a verified IS number in the open collection | 400 |
| `empty_query` | query is blank | 400 |
| `search_failed` | `collection.get` / `collection.query` (or another search step) raised. Body has `message_hi` only. No path and no traceback | 400 |
| `service_unavailable` | no collection open | 400 on `/search` |
| `query_too_long` | query longer than 2000 characters | 400 |
| `body_too_large` | body over 32768 bytes | 413 |
| `invalid_json` | body is not a JSON object | 400 |
| `not_found` | unknown path | 404 |
| `cors_denied` | `Origin` is not a local Vite origin | 403 |

Failed search bodies still include `answerability_state` (`not_found`), `results` (`[]`) and `evidence_chunks` (`[]`) for `unknown_standard`, `empty_query`, `search_failed`, `service_unavailable` and `query_too_long`.

## Usable / needs_review

Search loads chunks with `collection.get` and drops any chunk whose `review_status` is not `usable` (missing status is treated as usable). `needs_review` chunks are not candidates. The IS 2676 page-8 forbid rule is unchanged. Choosing a standard keeps other standards out of the candidate set. `all` searches the current usable corpus.
