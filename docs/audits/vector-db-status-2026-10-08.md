# Vector DB / BIS Knowledge Search: status audit, corpus progress and background prompts

- **Repo:** `qiamit/Consultancy-Management`, branch `main`, HEAD `d6d47e6` (working tree clean)
- **Audit time:** 2026-10-08, about 12:50–13:20 IST
- **Method:** read-only. Commands ran on Amit's Mac. The vector store was opened only from a **copy** in `/tmp/vdb_audit_chroma`. The source folder was inventoried with `find`/`stat` only. SHA-256 was computed only for local PDFs whose size matches another file; cloud-only files were skipped, so nothing was downloaded. Railway was read through the MCP (list-services, describe-environment). Production was probed with `curl`. Nothing was edited, committed, indexed or deployed.
- **Previous baseline:** `01_vector_db_preaudit.md` / `vector-db-preaudit.md` (2026-10-08 morning, HEAD `9495c4c`)

---

## 1. Status summary

**What works now**
- Local API (`127.0.0.1:3851`) works. It was **running at audit time** (started 10:35 IST by Cursor) and `/health` returned `ok:true`.
  - It serves collection `bis_pilot_representative_v1`: 1,156 usable chunks from 40 paths (39 unique PDFs).
  - Embedding model: `paraphrase-multilingual-MiniLM-L12-v2` (FastEmbed ONNX, 384-dim, 128-token limit).
- The VDB-01/02/19 hotfix (`b76f370`) holds.
  - All **37** standards in the dropdown are accepted by `/search`, with 0 `unknown_standard` errors (tested in-process on the copy).
  - All 8 side-effect-free test modules **PASS**: `test_search_api_http`, `test_api_selection_mocks`, `test_collection_guards`, `test_standard_filter_v2_candidate`, `test_alias_policy`, `test_alias_dedupe_regressions`, `test_alias_pipeline_integration`, `test_v2_pipeline_resilience`.
- `bis_pilot_representative_v2` is built but **not served**: 6,028 usable chunks from 135 indexed PDFs (137 unique contents: 1 failed, 1 needs_review-only).
- Tooling already in place:
  - content-hash manifest (`pilot/manifest.py`, `skipped_unchanged`, stale-processing recovery)
  - alias / duplicate policy
  - protected-collection guards
  - a human Document-IS review registry, plus a metadata patch applied to 17 v2 documents

**What doesn't work, or isn't true yet**
1. **Corpus coverage is tiny.** Only 2.4% of unique source PDFs are embedded (v2), and 0.7% are served (v1). Details in section 2.
2. **Production has no knowledge search.**
   - Railway has 9 services and **no knowledge service**. The only volume belongs to Postgres.
   - The index lives only on the Mac: `~/Library/Application Support/ConsultancyPro/knowledge-index`, 283 MB. It is outside the repo and doesn't ship with any deploy.
   - On `https://www.qengineering.in/bis/knowledge-search`, `/api/knowledge/health` returns the **SPA `index.html` (200 text/html)**, so the page always shows "service down". `functions/v1/knowledge-search` returns 404.
3. **"Search works on 37 standards" is only half true.**
   - Every standard is accepted. But a generic query ("scope of this standard") returns `not_found` on **21 of 37** standards and `supported` on 16.
   - Most standards are 1 PDF with very few chunks: 13 standards have ≤ 5 chunks, and IS 650 / IS 14543 / IS 4367 / IS 5204 / IS 17265 have 1 chunk each.
   - The v1 `is_number` values come from filenames (VDB-13).
4. **Scoped vector search is still broken (VDB-03).**
   - For 6 of the first 10 standards in v1, and 7 of 10 in v2, the global vector top-n contains **zero** in-scope chunks. Ranking for those standards is lexical only.
5. **Latency got worse (VDB-17).**
   - Each query now runs **two full collection scans**: `standard_is_allowed()` → `list_verified_standards()`, and then `load_pool_chunks()`.
   - Warm p50 was 37 ms on v1 and **222 ms on v2**, up from 113 ms in the morning baseline.
6. **v2 can't replace v1 as-is (new VDB-31).**
   - **117 of 135** v2 documents (5,045 of 6,028 chunks, 84%) have a blank `is_number`. Only human-reviewed IS numbers are written.
   - Serving v2 today would shrink the dropdown from 37 to **16** standards.
   - Human review can't scale to 5,676 documents, so automatic, cross-checked identity is a hard prerequisite for growing the corpus.
7. **No full-corpus batch indexer (new VDB-32).**
   - `run_second_pilot_indexing` is hard-wired to the v2 collection and a 150-path selection file (`assert_second_pilot_target`).
8. **The repo tracker is a placeholder (new VDB-30).**
   - `docs/audits/vector-db-preaudit.md` in the repo has full text only for VDB-01/02/19. VDB-03..18 and 20..29 say "Reserved", so Cursor's "regular work" prompt has nothing to work from.
9. Still open from the morning: VDB-04 (Hinglish false negative, re-confirmed: "LHC kaise calculate kare" → not_found) and VDB-05 (moisture false positive, re-confirmed: → IS 9000 supported), plus VDB-06/07/08/09/11/12/14/15/16/18/20–24/27–29.

**Bottom line:** the pilot engine is sound and well guarded. But going from 135 to about 5,700 documents needs three things first:
- correct scoped retrieval with a pool cache (VDB-03/17)
- automatic document identity (VDB-31)
- the fixed chunker (VDB-08/09/07a)

After that comes a resumable, content-addressed batch indexer (VDB-32), which can run unattended in the background.

---

## 2. Corpus progress

### 2.1 Source folder (read-only inventory)

| Item | Value |
|---|---|
| `KNOWLEDGE_PDF_SOURCE_DIR` (only this key was read from `knowledge_engine/.env`) | `/Users/amitkumar/Library/CloudStorage/OneDrive-Personal/Documents/All Standards` (OneDrive Personal sync folder) |
| PDF files (paths) | **10,830** (the morning count was 10,829; one file was added since) |
| Non-PDF files in the same tree (not used) | 5,715 (5,608 xlsx, 65 docx, 23 doc, 6 xlsb, 3 xls, 3 png, 7 other) |
| Total PDF size | 20.37 GB (18.97 GiB) |
| Downloaded locally vs cloud-only | **10,828 local**. **2 cloud-only** (macOS `SF_DATALESS` flag, 0 blocks): `STD 17633/IS 17633_2022.pdf`, `STD 1659/IS 1659.pdf` |
| Top-level folders | 1,846: 1,845 `STD <n>` folders plus `_Audit` (5 ASTM PDFs) |
| **Unique contents (SHA-256)** | **5,676** unique PDFs, **8.81 GB**. 5,154 paths are duplicates, in 1,177 groups. Most are the same Test Method PDF copied into several `STD` folders. |
| PDFs per STD folder | 1 PDF: 126 · 2–5: 1,044 · 6–10: 434 · 11–25: 223 · 26–50: 16 · >50: 3 (largest: STD 14543 = 79, STD 302 = 66, STD 13428 = 54) |
| Remaining unique PDFs by size | <1 MB: 2,531 · 1–5 MB: 2,813 · 5–20 MB: 185 · ≥20 MB: 12 |
| Free disk on Mac / RAM / cores | 603 GiB free · 24 GB · 15 |

### 2.2 Progress per pipeline stage

Denominators: **5,676 unique PDFs** (the real work) and **10,830 paths** (what Amit sees in OneDrive). "Paths covered" means paths whose content is in the stage.

| Stage | Unique PDFs | % of 5,676 | Paths covered | % of 10,830 | Notes |
|---|---:|---:|---:|---:|---|
| Inventoried and locally available | 5,674 (+2 cloud-only) | 100% | 10,830 | 100% | Pilot inventory summaries exist. This audit's full hash list exists only in `/tmp` on the Mac, not persisted in the pipeline. |
| Hashed by the pipeline (persisted) | 137 | 2.4% | 150 | 1.4% | v2 preflight (`second_pilot_sha256_audit_v1`) |
| Extracted (native + OCR) | 137 | 2.4% | 865 | 8.0% | 2,423 pages, 373 OCR pages. 1 failed: `STD 80601/Test Method/IS 15575 Part 1 2016 - 00.pdf` (PyMuPDF FileDataError) |
| Chunked + quality-gated | 136 | 2.4% | 865 | 8.0% | 7,544 chunks: 6,028 usable, 1,516 needs_review |
| Embedded in Chroma (v2, not served) | **135** | **2.38%** | **865** | **8.0%** | 6,028 chunks, 2 PDFs with 0 usable chunks. Only **18 documents / 983 chunks** carry an IS number. |
| Served locally (v1 runtime) | **39** | **0.69%** | **189** | **1.7%** | 1,156 chunks; 37 standards in the filter |
| Served in production (qengineering.in) | **0** | **0%** | 0 | 0% | No service, route or index on Railway |
| Remaining to process | **5,541** | 97.6% | — | — | 8.60 GB, about **97,000 pages** (estimated at the v2 rate of 11.3 pages/MB) |

Bytes already processed: 214 MB of 8.81 GB unique (2.4%).

### 2.3 Breakdown by folder category

Each unique PDF is counted once. If any copy sits at the STD-folder root, the PDF counts as "root".

| Category | Paths | Unique PDFs | Embedded in v2 | % embedded |
|---|---:|---:|---:|---:|
| STD folder root (product standards, amendments) | 4,102 | 3,970 | 65 | 1.6% |
| `Test Method/` | 6,689 | 1,668 | 49 | 2.9% |
| `Master Documents/` | 34 | 33 | 21 | 64% |
| `_Audit/` (ASTM) | 5 | 5 | 0 | 0% |
| **Total** | **10,830** | **5,676** | **135** | **2.4%** |

### 2.4 Breakdown by standard / folder

- STD folders with any embedded content (v2): **572 of 1,846**. Only 6 are fully covered; 566 are partial, because shared Test Methods touch many folders. **1,274** folders have nothing.
- STD folders whose **root standard PDF** is embedded: v2 **61 of 1,841** (3.3%); v1 (served) **21 of 1,841** (1.1%).
- Served standards (v1, filename-derived IS number), shown as chunks/paths:
  - IS 3203 221/3 · IS 2997 137/1 · IS 14700 87/1 · IS 1180 79/1 · IS 18297 61/1 · IS 1608 61/1 · IS 2454 55/1 · IS 10641 49/1 · IS 2142 36/1 · IS 1599 35/1
  - IS 14885 34/1 · IS 1889 31/1 · IS 269 25/1 · IS 1730 24/1 · IS 17545 23/1 · IS 8702 22/1 · IS 4984 20/1 · IS 17357 17/1 · IS 2552 17/1 · IS 4031 16/1
  - IS 10500 12/1 · IS 1161 12/1 · IS 1500 12/1 · IS 17354 11/1 · IS 9666 10/1 · IS 13826 10/1 · IS 2676 9/1 · IS 9000 6/1 · IS 458 5/1 · IS 694 5/1
  - IS 1660 3/1 · IS 1956 2/1 · IS 14543 1/1 · IS 17265 1/1 · IS 4367 1/1 · IS 5204 1/1 · IS 650 1/1
  - (no IS) 4/1
- v2 standards that are filterable (human-verified IS only), shown as chunks/docs:
  - IS 8251 193/1 · IS 14899 175/1 · IS 15490 142/1 · IS 2997 137/1 · IS 1180 79/1 · IS 2712 63/1 · IS 14534 58/1 · IS 1875 35/2
  - IS 1501 28/1 · IS 15058 26/1 · IS 2742 19/1 · IS 9666 10/1 · IS 2676 9/1 · IS 16709 7/2 · IS 14587 1/1 · IS 3087 1/1
  - **(blank) 5,045 chunks / 117 docs**

### 2.5 Where the index lives / production

| Question | Answer (verified) |
|---|---|
| Collection the API serves | `bis_pilot_representative_v1`, a code constant (`pilot/constants.PILOT_COLLECTION_NAME`, opened in `search_pipeline.open_search_collection`). There's no env switch (VDB-27). |
| Index location | Mac only: `~/Library/Application Support/ConsultancyPro/knowledge-index/sample_collections/` (v1 88 MB, v2 180 MB, two 2-sample baselines 6 MB). Chroma 0.6.3. Collection metadata has no `hnsw:space`, so the metric defaults to L2. |
| In repo / in deploy? | No. It isn't in git and isn't in any Dockerfile or volume. |
| Railway | 9 services (functions, frontend, storage-api, auth, api, rest, Resend, pdf-service, Postgres-MC1Y). The only volume is the 5 GB `postgres-volume` on Postgres. The gateway Caddyfile has no knowledge route. `functions/server.mjs` has no knowledge route. The Postgres image is `supabase-postgres:17.6.1.136`, which normally bundles pgvector, but no migration enables it (unverified). |
| Prod UI | The route `/bis/knowledge-search` exists in `frontend/web/src/App.tsx`. `bisKnowledgeSearchApi.ts` always calls `/api/knowledge`, which in prod returns the SPA HTML, so the page shows "service down" (new VDB-35). |

---

## 3. Updated VDB tracker (status as of 2026-10-08, 13:20 IST)

Statuses are Done / Partial / Open. IDs are never renumbered. New IDs start at VDB-30.

| ID | Title | Pri | Status | Evidence now (HEAD d6d47e6) |
|---|---|---|---|---|
| VDB-01 | log_message crash | P0 | **Done** | b76f370; HTTP test PASS; local API answering |
| VDB-02 | Dropdown 37 vs search 2 | P0 | **Done** | All 37 standards accepted (0 errors). The quality gap is tracked in VDB-10/31. |
| VDB-03 | Scoped vector search = global top-n then filter | P1 | **Open** | `run_hybrid_search` still calls `collection.query` with no `where`. In 6/10 (v1) and 7/10 (v2) standards, zero in-scope chunks are in the vector top-n. |
| VDB-04 | Hindi/Hinglish rejected by gate | P1 | Open | "LHC kaise calculate kare" [all] → not_found (v1 and v2) |
| VDB-05 | Answerability overfit to IS 9666/2676 | P1 | Open | "What is the moisture content limit" → supported, IS 9000 (v1) |
| VDB-06 | standard_filter_ok hard-coded | P1 | Open | The candidate is still offline (`test_standard_filter_v2_candidate` asserts `not_live_wired`). |
| VDB-07 | 128-token truncation | P1 | Open | No change |
| VDB-08 | Clause regex bugs | P1 | Open | `CLAUSE_HEADING_RE` unchanged (`chunk_extract.py:18-28`) |
| VDB-09 | No context header / heading-only chunks | P2 | Open | No change |
| VDB-10 | Served corpus tiny; v2 not served | P1 | **Open (re-measured)** | Served: 39/5,676 unique (0.69%). Embedded: 135 (2.38%). Generic query not_found on 21/37 standards. |
| VDB-11 | pilot_auto shown as "verified" | P1 | Open | v1: 1,137 pilot_auto vs 19 verified. UI still says 'जाँचा हुआ' ("verified") (`knowledgeSearchUiI18n.ts:122`). |
| VDB-12 | Requirement tables needs_review | P2 | Open | 388 (v1) / 1,516 (v2) |
| VDB-13 | Filename IS treated as verified | P2 | **Partial** | v2 has `is_number_provenance`, with a human patch on 17 documents (974 Chroma rows). v1 is still filename-derived, and the UI doesn't show provenance. |
| VDB-14 | Forbidden-page rule duplicated / broad | P2 | Open (**broader**) | `load_pool_chunks` drops page 8 when `"2676" in rel or rel.startswith("STD 21/")`. That matches any path containing "2676". |
| VDB-15 | Implicit L2 metric | P2 | Open | v1/v2 collection metadata has no `hnsw:space` |
| VDB-16 | No model/metadata check; silent fallback | P2 | Open | bare `except: pass` still in `open_search_collection` |
| VDB-17 | Full scan per query | P2 | Open (**worse**) | 2 full `collection.get()` per query. Warm p50: v1 37 ms, v2 222 ms. |
| VDB-18 | Substring lexical, no BM25 | P2 | Open | No change |
| VDB-19 | Unhandled Chroma errors | P2 | **Done** | b76f370 (`search_failed`) |
| VDB-20 | TS types lag; not_found hides candidates | P3 | Open | No change |
| VDB-21 | No production knowledge service | P1 | Open (**confirmed**) | Railway inventory plus prod probe (section 2.5) |
| VDB-22 | QI Assistant not grounded | P1 | Open | `backend/services/functions/qiAssistant.mjs:250` still defaults temperature to 0.7; no KB fetch |
| VDB-23 | No grounded answer generation | P2 | Open | No change |
| VDB-24 | Gold set covers only 2 standards | P2 | Open | No change |
| VDB-25 | No runner/CI; no HTTP test | P2 | **Partial** | The HTTP test exists and 8 modules pass. There's still no `run_all_checks` and no CI. |
| VDB-26 | Unpinned deps; stale docs | P3 | **Partial** | Added `requirements-conda.lock.txt` (chromadb 0.6.3, fastembed 0.5.1, onnxruntime 1.30.0, pymupdf 1.28.2, numpy 2.4.6), `pyproject.toml`, `API.md`, `CHANGELOG.md`; `.env.example` is down to the 3 path keys. `requirements.txt` still lacks chromadb/fastembed/onnxruntime. |
| VDB-27 | Runtime collection is a code constant | P3 | Open | No `KNOWLEDGE_RUNTIME_COLLECTION` |
| VDB-28 | Paths/debug exposed; no auth | P3 | Open | `_debug`, `debug_nearest`, `source_relative_path` still returned |
| VDB-29 | Garbled OCR passes gate | P2 | Open | No change |
| **VDB-30** | Repo tracker is a placeholder | P1 | **Open (new)** | `docs/audits/vector-db-preaudit.md`: VDB-03..18 and 20..29 say "Reserved", so Cursor can't pick items. |
| **VDB-31** | Document identity doesn't scale | P1 | **Open (new)** | v2: 117/135 docs (84% of chunks) have a blank `is_number`, because only human-reviewed IS numbers are written. At 5,676 docs the standard filter would cover only a sliver. Fix: automatic IS extraction from the cover page, cross-checked with filename and folder; provenance-labelled; conflicts go to a review queue. |
| **VDB-32** | No resumable full-corpus batch indexer | P1 | **Open (new)** | `run_second_pilot_indexing` is v2-only and selection-file-only (`assert_second_pilot_target`). Needed: a corpus manifest (SQLite) keyed by SHA-256, a priority queue, `--max-units`/`--max-minutes`, a lock file and checkpoints. |
| **VDB-33** | Duplicate content and product→test-method context | P2 | **Open (new)** | 10,830 paths = 5,676 unique contents (5,154 duplicate paths, 1,177 groups). Indexing must be content-addressed, and `path_std_contexts` (every STD folder a PDF appears in) must be kept so a product-standard filter can include its Test Methods. |
| **VDB-34** | Cloud-only files and failed PDFs | P3 | **Open (new)** | 2 dataless files (would trigger an OneDrive download if opened); 1 FileDataError (IS 15575 Part 1, STD 80601 copy); 1 needs_review-only (IS 1570 Part 2 AMD1). The indexer must detect `SF_DATALESS`, skip and queue those files, and record per-file errors. |
| **VDB-35** | Prod page reachable but always "service down" | P2 | **Open (new)** | `/api/knowledge/*` on qengineering.in returns the SPA HTML. Show a clear "available on the office computer only" state in prod builds until VDB-21. |
| **VDB-36** | Old prompts / tracker use pre-restructure paths | P3 | **Open (new)** | Path changes: `railway-stack/functions` → `backend/services/functions`; `railway-stack/gateway` → `backend/services/gateway`; `frontend/src` → `frontend/web/src`; `frontend/vite.config.ts` → `frontend/web/vite.config.ts`. |

Totals: **3 Done** (01, 02, 19), **3 Partial** (13, 25, 26), **30 Open** (23 old + 7 new).

---

## 4. Remaining work, in phases

Compute numbers are measured from the v1/v2 runs:
- extraction plus embedding took 0.25–0.49 s per page (v2: 1,837 fresh pages in 461 s; v1: 593 pages in 291 s)
- about 2.5 usable chunks per page
- about 8.8 KB of Chroma storage per chunk

| Phase | Goal | Items | Effort (Cursor sessions) | Unattended compute | Amit's time |
|---|---|---|---|---|---|
| **V0** | Tracker in repo plus a read-only corpus progress report | VDB-30, VDB-36 | 1 | ~1 min (stat + hash) | 5 min review |
| **V1** | Correct and fast scoped retrieval before growth; prod "local only" state | VDB-03, VDB-17a, VDB-14, VDB-16, VDB-27, VDB-35 | 1–2 | — | 10 min |
| **V2** | Automatic document identity (shadow first) | VDB-31, VDB-13 | 1–2 | ~5–10 min (page-1 text of 5,676 PDFs) | ~30 min to spot-check conflicts |
| **V3** | Chunker v2 plus v3 collection spec (scratch) | VDB-08, VDB-09, VDB-07a, VDB-29, VDB-15 | 2 | minutes (scratch) | 10 min |
| **V4** | Resumable content-addressed batch indexer, plus 1 pilot batch of ≤10 PDFs | VDB-32, VDB-33, VDB-34 | 1–2 | ~5 min | 5 min |
| **V5** | Background batches until the corpus is done | VDB-10 | 0 (terminal command) or 1 short session per batch | **≈ 7–14 h total** for ~5,541 PDFs / ~97k pages, e.g. ~20–30 batches of 45–60 min. Chroma grows by ~2.1 GB (≈ 242k usable chunks); the working dir by ~7 GB. | 1 line per batch |
| **V6** | Serve v3 locally behind an eval gate; coverage endpoint; honest badges | VDB-06, VDB-10 switch, VDB-11, VDB-20 | 1–2 | — | 15 min |
| **Later** | Quality (Hinglish, BM25, gold v2), LLM answers, production deploy | VDB-04/05/18/24/25, VDB-22/23, VDB-21/28/12 | 6–8 | — | ~2 h of gold review, plus the deploy decision |

**Total left:** about 14–20 Cursor sessions, about 7–14 hours of unattended Mac compute, and about 3–4 hours of Amit's review.
- V5 can start after V0–V4, about 6–9 sessions from now.
- Corpus growth itself needs no Cursor time: it's one terminal command per batch, so it can run alongside the masters and finance work.
- Production (Later) needs a choice:
  - a Railway knowledge service with a ~5 GB volume and ≥ 2 GB RAM, or
  - pgvector on Postgres, where ~250k × 384-dim vectors plus HNSW plus text ≈ 2–3 GB, so the current 5 GB volume probably needs to grow.
- The deploy needs Amit's explicit approval.

---

## 5. Phased Cursor prompts (paste one per session)

Ground rules for every prompt (repeated inside each prompt so each one is self-contained):
- no commits or pushes
- no deploys or Railway changes
- never print `.env` or secrets
- never write to protected collections (`bis_two_sample_usable_v1`, `bis_two_sample_usable_multilingual_exp_v1`, `bis_pilot_representative_v1`)
- keep the knowledge test modules passing
- keep `npm run build` green when the frontend is touched
- the default runtime stays `bis_pilot_representative_v1` until Amit approves a switch

---

### Prompt V0 — Fill the repo tracker and add a read-only corpus progress report (VDB-30, VDB-36)

```text
Vector DB session V0. Follow .cursor/rules (00-project-core, 40-knowledge-engine, 50-workflow-prompts). READ-ONLY on all vector collections and on the PDF source folder. No commits.

Goal:
(1) Replace the "Reserved" placeholders in docs/audits/vector-db-preaudit.md with real items.
(2) Add a read-only script that measures how much of the OneDrive PDF corpus has been processed, so every later batch can report progress.

Part 1: tracker (VDB-30, VDB-36)
- If docs/audits/vector-db-status-2026-10-08.md exists (Grok may have copied it there), use its section 3 as the source of truth. Otherwise use the table at the end of this prompt.
- For every Reserved ID (VDB-03..18, VDB-20..29), write: title, priority, status, date 2026-10-08, affected files, problem/evidence, fix plan, acceptance criteria, log line "2026-10-08: filled from status audit (read-only)".
- Keep VDB-01/02/19 exactly as they are (Done). Append the new IDs VDB-30..VDB-36. Never renumber.
- Use post-restructure paths everywhere (VDB-36): backend/services/functions, backend/services/gateway, frontend/web/src, frontend/web/vite.config.ts.
- Add or refresh the summary table at the top (ID | Title | Priority | Status | Updated).

Part 2: corpus progress report
Add knowledge_engine/scripts/report_corpus_progress.py (run as a module). It must:
- Read KNOWLEDGE_PDF_SOURCE_DIR and KNOWLEDGE_VECTOR_DB_PATH only through knowledge_engine/config.py. Never print other .env values.
- Walk the source tree with os.scandir/stat only.
  - For each *.pdf record: relative path, size, mtime, top folder (e.g. "STD 9666"), category ("root" | "Test Method" | "Master Documents" | other), and a cloud-only flag.
  - Cloud-only on macOS: st_flags & 0x40000000 (SF_DATALESS), or st_blocks == 0 with size > 0.
  - NEVER open cloud-only files (opening triggers an OneDrive download).
- Compute SHA-256 only for local files.
  - Cache hashes in <KNOWLEDGE_VECTOR_DB_PATH>/corpus/hash_cache.sqlite3, keyed by (relative_path, size, mtime_ns), so reruns are instant.
  - Optimisation allowed: skip hashing a file whose size is unique in the corpus, and treat it as its own content unit.
- Read the existing manifests (sample_collections/bis_pilot_representative_v1/manifest.json and .../bis_pilot_representative_v2/manifest.json, including source_aliases). Also read any future corpus manifest under <KNOWLEDGE_VECTOR_DB_PATH>/corpus/*/manifest.sqlite3 if present.
- Output, with paths relative to the source dir only (no absolute paths):
  - JSON report: <KNOWLEDGE_VECTOR_DB_PATH>/diagnostics/corpus/corpus_progress_<UTC timestamp>.json (never overwrite)
  - a short Markdown summary next to it
  - a console table
  Contents:
  a. totals: PDF paths, unique content units, duplicate paths and groups, total and unique bytes, cloud-only list
  b. per stage, for each collection: unique units and paths covered, with % (extracted, chunked, embedded/indexed, failed, needs_review-only), and which collection the API serves (read pilot/constants; don't open Chroma for writing)
  c. breakdown by category and by STD folder (folders fully / partially / not covered; folders whose root PDF is indexed)
  d. remaining unique units by size bucket, and estimated pages (use pages/MB from manifests that have page_count)
- Use a --json-only flag for quiet runs and --no-hash for a fast stat-only run.

Expected numbers today (sanity check; small drift is fine):
- 10,830 PDF paths, 5,676 unique contents, 5,154 duplicate paths in 1,177 groups
- 2 cloud-only files (STD 17633/IS 17633_2022.pdf, STD 1659/IS 1659.pdf)
- v2 embedded 135 units / 865 paths; v1 served 39 units / 189 paths

Constraints:
- No writes to Chroma. No writes inside the PDF source folder. Writes only under <KNOWLEDGE_VECTOR_DB_PATH>/corpus and <KNOWLEDGE_VECTOR_DB_PATH>/diagnostics/corpus.
- No OCR, no embedding, no model download.
- Add knowledge_engine/scripts/test_corpus_progress.py: build a temp dir with fake PDFs (two identical files in different folders, one "dataless" simulated via an injectable stat function), and assert unique-unit counting, duplicate grouping, that the cloud-only file is never opened, and manifest cross-referencing. It must print PASS/FAIL and exit non-zero on failure.

Verify (from the repo root):
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_corpus_progress
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.report_corpus_progress
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_search_api_http
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_api_selection_mocks
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_collection_guards
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_standard_filter_v2_candidate

Then update VDB-30 and VDB-36 to Done (with commands and results) in docs/audits/vector-db-preaudit.md, add a line to knowledge_engine/CHANGELOG.md, and show me the progress table. Don't commit.

Item table (use only if the status file isn't present):
VDB-03 P1 Open | search_pipeline.run_hybrid_search queries Chroma without a filter, then appends pool ids unranked; most standard-scoped hits have no vector distance | fix: rank inside the candidate set | accept: every scoped top-5 hit has a distance; evals not worse
VDB-04 P1 Open | answerability._intent_anchors makes Hindi/Hinglish tokens mandatory ("LHC kaise calculate kare" → not_found) | fix: HI/Hinglish stopwords + reviewed glossary_hi_en.json | accept: hi/mixed gold cases supported or uncertain
VDB-05 P1 Open | phrase lists/boosts tuned to IS 9666/2676; "What is the moisture content limit" → supported with IS 9000 | fix: standard-agnostic calibrated signals; tune on a dev split | accept: moisture FP not supported
VDB-06 P1 Open | answerability standard_filter_ok hard-coded; pilot/standard_filter_v2_candidate.py not wired | fix: wire candidate | accept: eval_standard_filter_v2_candidate live == candidate
VDB-07 P1 Open | FastEmbed MiniLM-L12 truncates at 128 tokens (436/1,156 v1 chunks longer) | fix: sub-chunk ≤120 tokens + optional longer model on scratch | accept: p95 embedded tokens ≤ limit
VDB-08 P1 Open | chunk_extract CLAUSE_HEADING_RE misses "1 SCOPE"; dates/table numbers become clauses | fix: new regex + CHUNK_VERSION | accept: 0 date/table clause ids on scratch
VDB-09 P2 Open | no "IS | title | clause" header; heading-only chunks | fix: embedding view with header, merge short headings | accept: no chunk < 40 chars
VDB-10 P1 Open | served 39/5,676 unique PDFs (v1); v2 135 not served | fix: corpus batch indexing + env switch after eval gate | accept: documented coverage per stage
VDB-11 P1 Open | UI says 'जाँचा हुआ' (verified) for pilot_auto chunks | fix: return visual_verification_status; badge Human-verified vs Auto-checked | accept: badge visible, build green
VDB-12 P2 Open | requirement tables stay needs_review | fix: design note for row-wise table chunks | accept: approved design
VDB-13 P2 Partial | v1 IS from filename; v2 has is_number_provenance for 17 human-reviewed docs | fix: provenance on every hit + UI | accept: heuristics never shown as verified
VDB-14 P2 Open | load_pool_chunks drops page 8 when "2676" in path or path starts "STD 21/"; duplicated in quality_gate | fix: single rule keyed by sha256 | accept: IS 2676 p8 excluded, others allowed, test
VDB-15 P2 Open | no hnsw:space (L2); similarity 1/(1+d) | fix: cosine for new collections, metric-aware similarity | accept: unit test
VDB-16 P2 Open | open_search_collection bare except, no model check | fix: registry + loud mismatch error | accept: mismatch test
VDB-17 P2 Open | 2 full collection.get() per query; v2 warm p50 222 ms | fix: per-collection cache + scoped query | accept: v2 scoped p50 < 60 ms
VDB-18 P2 Open | substring lexical scoring, no BM25/reranker | fix: BM25 with Devanagari-aware tokens | accept: evals not worse
VDB-20 P3 Open | TS types lag payload; not_found hides candidates; _debug shipped | fix: types + collapsed candidates + debug flag | accept: lint/typecheck
VDB-21 P1 Open | no knowledge service on Railway; prod /api/knowledge returns SPA HTML | fix: private service or pgvector + functions proxy (deploy only on approval) | accept: code ready, Blocked until approval
VDB-22 P1 Open | backend/services/functions/qiAssistant.mjs has no KB grounding; temperature 0.7 | fix: KB mode via KNOWLEDGE_SEARCH_URL, temp ≤ 0.2 | accept: node --check, graceful when unset
VDB-23 P2 Open | no grounded answer generation | fix: answer_prompt + functions /knowledge-answer | accept: test_answer_prompt
VDB-24 P2 Open | gold covers only IS 9666/2676 | fix: ≥80 reviewed cases across ≥10 standards, dev/test split | accept: Amit-approved gold file
VDB-25 P2 Partial | HTTP test exists; no run_all_checks/CI | fix: runner with metric baseline | accept: fails on injected failure
VDB-26 P3 Partial | lock file exists; requirements.txt lacks chromadb/fastembed/onnxruntime | fix: pin from lock | accept: fresh install works
VDB-27 P3 Open | runtime collection is a code constant | fix: KNOWLEDGE_RUNTIME_COLLECTION env (default v1) | accept: v1↔v2 switch test
VDB-28 P3 Open | source paths, _debug, debug_nearest returned; no auth for prod | fix: filename only, debug flag, token in private mode | accept: HTTP test
VDB-29 P2 Open | garbled OCR / date tables pass the gate | fix: garble heuristics → needs_review | accept: samples routed on scratch
VDB-30 P1 Open | this tracker had Reserved placeholders | fix: this prompt | accept: all IDs filled
VDB-31 P1 Open | v2: 117/135 docs have blank is_number (only human-reviewed IS written) | fix: automatic cover-page IS extraction cross-checked with filename/folder, provenance-labelled | accept: shadow report, 100% agreement on human-verified docs
VDB-32 P1 Open | no resumable full-corpus batch indexer (v2 runner is selection-only) | fix: SQLite corpus manifest, priority queue, batch limits, lock, checkpoints | accept: dry-run + 1 pilot batch
VDB-33 P2 Open | 10,830 paths = 5,676 unique contents; Test Methods shared across STD folders | fix: content-addressed indexing, keep path_std_contexts | accept: product filter includes its test methods
VDB-34 P3 Open | 2 cloud-only PDFs, 1 FileDataError, 1 needs_review-only | fix: skip/queue dataless, record errors | accept: never opens dataless files
VDB-35 P2 Open | prod /bis/knowledge-search always shows service down | fix: prod-only "office computer only" state | accept: build green, no /api/knowledge call in prod
VDB-36 P3 Open | old prompts use railway-stack/* and frontend/src/* paths | fix: use backend/services/*, frontend/web/src/* | accept: tracker uses new paths
```

**यह prompt क्या करेगा (हिंदी में):**
- **क्या:** Repo में vector DB की tracker file (`docs/audits/vector-db-preaudit.md`) अभी अधूरी है। उसमें VDB-03 से VDB-29 तक ज़्यादातर items के आगे सिर्फ़ "Reserved" लिखा है, इसलिए Cursor को पता ही नहीं कि किस item पर काम करना है। यह prompt हर item का पूरा विवरण भर देगा: समस्या, सबूत, fix का तरीका और acceptance। साथ में नए items VDB-30 से VDB-36 भी जोड़ देगा।
- **नई script:** यह एक नई read-only script बनाएगी, `report_corpus_progress`। वह OneDrive के "All Standards" folder की हर PDF को गिनेगी, एक जैसी (duplicate) files पहचानेगी, और बताएगी कि हर चरण में कितना काम हुआ है: extract, chunk, embed और serve।
- **कैसे:** Script सिर्फ़ file का size और date पढ़ती है। केवल local files का hash बनाती है। जो files सिर्फ़ cloud पर हैं (अभी 2), उन्हें खोलती ही नहीं, ताकि OneDrive कुछ download न करे। Report vector DB वाले folder में नई file के रूप में save होगी, पुरानी file overwrite नहीं होगी।
- **क्या बदलेगा:** Tracker file, एक नई script, उसका test और CHANGELOG। Vector DB, PDFs, app और Railway में कुछ नहीं बदलेगा। आगे हर batch के बाद यही script बताएगी कि कितने % काम हो चुका है।

---

### Prompt V1 — Correct, fast scoped retrieval + honest prod state (VDB-03, VDB-17a, VDB-14, VDB-16, VDB-27, VDB-35)

```text
Vector DB session V1. Follow .cursor/rules (00, 20-frontend, 40-knowledge-engine, 50-workflow-prompts). Read VDB-03, VDB-14, VDB-16, VDB-17, VDB-27 and VDB-35 in docs/audits/vector-db-preaudit.md first. No commits. No writes to any Chroma collection.

Goal: Before the corpus grows 40×, make standard-scoped search rank by vector similarity inside the chosen standard, stop full collection scans per query, and make the runtime collection switchable by env. Also make the production page honest.

Facts (verified 2026-10-08, HEAD d6d47e6):
- knowledge_engine/search_pipeline.py run_hybrid_search calls standard_is_allowed() → list_verified_standards() (full collection.get of metadatas), then load_pool_chunks() (a second full collection.get with documents), then collection.query(query_texts=[q], n_results=min(pool,50)) WITHOUT a filter. Pool ids missing from the global top-n get distance=None.
  - On a copy of v1, for 6 of the first 10 standards, the global top-n contains ZERO in-scope chunks.
  - Warm p50: v1 (1,156 chunks) 37 ms; v2 (6,028 chunks) 222 ms.
- v1 is_number values look like "IS 3203 : 1982"; v2 uses "IS 3203" or blank. matches_standard()/_normalize_is_number() normalise them. Chroma is 0.6.3; the protected v1 collection must not be written, so no new metadata can be added to it.
- Forbidden-page rule: load_pool_chunks drops page 8 whenever ("2676" in rel or rel.startswith("STD 21/")). FORBIDDEN = {"scanned": {8}} and pilot/quality_gate.py carry duplicates.
- open_search_collection: the runtime is the code constant pilot.constants.PILOT_COLLECTION_NAME, with bare `except: pass` fallbacks to the 19-chunk experimental/baseline collections and no model check against collection.metadata["model"].
- Production: frontend/web/src/features/bis/knowledge-search/bisKnowledgeSearchApi.ts always calls /api/knowledge. On qengineering.in that path returns the SPA index.html (200 text/html), so the page shows "service down".

Do:
1. VDB-17a — per-collection pool cache (new module knowledge_engine/pool_cache.py):
   - Load ids, documents and metadatas once per (collection name, collection.count()). Precompute the usable, non-forbidden pool, a normalised-standard → ids index, and the verified standards list.
   - standard_is_allowed, list_verified_standards (used by /standards) and load_pool_chunks read from the cache.
   - Refresh only when count() changes. Thread-safe (the server uses ThreadingHTTPServer).
2. VDB-03 — scoped vector ranking:
   - For standard != "all": get the query embedding with the collection's embedding function. Rank the pool's own embeddings (cached lazily per collection via collection.get(ids=..., include=["embeddings"])) with the SAME metric the collection uses (L2 for v1/v2; read collection.metadata.get("hnsw:space", "l2")). Every pool hit then gets a real distance.
   - For "all": keep collection.query.
   - For future collections that have metadata "is_number_norm", allow a `where={"is_number_norm": std}` query path instead.
   - Keep hybrid_rank / RRF and the answerability inputs the same shape.
3. VDB-14 — one forbidden-page source of truth in knowledge_engine/pilot/forbidden_pages.py, keyed by content sha256 (the IS 2676 1981 baseline sha256 is 0784f2f3049c4b4084c62ede4a0f8de7987826a36ab88d16ef10a4543610c6c5, page 8), plus the legacy sample_label "scanned". Use it from search_pipeline and quality_gate. Remove the "2676 in path / STD 21/" substring rule.
4. VDB-27/16 — KNOWLEDGE_RUNTIME_COLLECTION env (read via config.py; default bis_pilot_representative_v1, so behaviour doesn't change). Add a placeholder line to knowledge_engine/.env.example only.
   - On open, check collection.metadata["model"] == PILOT_EMBEDDING_MODEL. On mismatch set the error "embedding_model_mismatch" (no silent fallback).
   - Allow the old fallback chain only when KNOWLEDGE_ALLOW_FALLBACK=1.
   - Log the opened collection name (no paths).
5. VDB-35 — in bisKnowledgeSearchApi.ts / BisKnowledgeSearchPage.tsx: when import.meta.env.PROD and no VITE_KNOWLEDGE_SEARCH_URL is configured, don't call /api/knowledge. Show a clear state in EN and हिंदी: "BIS knowledge search currently runs only on the office computer (local service). Online access is coming." / "BIS ज्ञान खोज अभी केवल ऑफ़िस कंप्यूटर (लोकल सेवा) पर चलती है। ऑनलाइन सुविधा जल्द आएगी।"
   - Also, if any knowledge response has a content-type that isn't JSON, show the same "service unavailable" message instead of a parse error.
   - Keep the dev flow (Vite proxy) unchanged and keep all existing Hindi strings.

Tests to add (PASS/FAIL, non-zero exit on failure, no model download, mocks or temp collections only):
- knowledge_engine/scripts/test_scoped_vector_rank.py: with a fake collection (deterministic embeddings), every scoped top-5 hit has a non-null distance, and ranking within the pool follows distance.
- knowledge_engine/scripts/test_pool_cache.py: the cache is built once, refreshes on a count change, and concurrent calls are safe.
- knowledge_engine/scripts/test_forbidden_pages.py: IS 2676 sha p8 is excluded; page 8 of another STD 21 PDF and of a path containing "12676" is allowed.
- Extend test_search_api_http (or test_api_selection_mocks) for KNOWLEDGE_RUNTIME_COLLECTION and the model-mismatch error.

Acceptance:
- All new tests plus test_search_api_http, test_api_selection_mocks, test_collection_guards, test_standard_filter_v2_candidate, test_alias_pipeline_integration and test_v2_pipeline_resilience PASS.
- run_reliability_eval: Pass@1 ≥ 34/35, NOT_FOUND hard reject 16/16, leaks 0. run_pilot_eval: 6/6 and 3/3. Report before/after.
- Read-only latency check (open v2 read-only via KNOWLEDGE_RUNTIME_COLLECTION=bis_pilot_representative_v2 in the shell only, or against a /tmp copy): scoped warm p50 < 60 ms on v2 and ≤ 37 ms on v1. Report numbers.
- Frontend (repo root): npm run lint && npm run typecheck && npm run build pass.

Verify:
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_scoped_vector_rank
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_pool_cache
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_forbidden_pages
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_search_api_http
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_api_selection_mocks
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_collection_guards
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_standard_filter_v2_candidate
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_reliability_eval
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_pilot_eval
npm run lint && npm run typecheck && npm run build

Then:
- Restart the local API: npm run knowledge:api (stop the old process on port 3851 first). Curl /health and /standards, and POST /search {"query":"scope of this standard","standard":"IS 2142"}.
- Update VDB-03, VDB-14, VDB-16, VDB-17, VDB-27 and VDB-35 in docs/audits/vector-db-preaudit.md (status, date, files, commands + results), update knowledge_engine/API.md if any field changed (additive only), and add a CHANGELOG line.
- Don't commit. Summarise and show the verification output.
```

**यह prompt क्या करेगा (हिंदी में):**
- **क्या:** Corpus 40 गुना बढ़ाने से पहले search को सही और तेज़ बनाएगा।
  - अभी कोई standard चुनने पर vector search पूरे collection में top results ढूँढता है और फिर उन्हें filter करता है। इसलिए 10 में से 6 standards के लिए असली vector ranking मिलती ही नहीं।
  - अब ranking चुने गए standard के chunks के अंदर ही होगी।
  - हर query पर पूरा collection दो बार पढ़ा जाता है, उसकी जगह cache लगेगा। v2 पर 222 ms को 60 ms से नीचे लाने का लक्ष्य है।
- **कैसे:**
  - पहले से बने embeddings को memory cache में रखकर उसी metric से rank करेगा। इससे protected v1 collection में कुछ लिखना नहीं पड़ेगा।
  - Page-8 वाला गलत, बहुत बड़ा नियम हटाकर एक ही जगह sha256 पर आधारित नियम बनेगा।
  - Collection अब env variable `KNOWLEDGE_RUNTIME_COLLECTION` से चुना जा सकेगा। Default अभी भी v1 रहेगा।
  - Model mismatch होने पर साफ़ error आएगा, चुपचाप पुराने 19-chunk collection पर नहीं जाएगा।
- **Production page:** qengineering.in पर knowledge search page अभी हमेशा "service down" दिखाता है। अब वहाँ साफ़ हिंदी/English message दिखेगा कि यह सुविधा अभी केवल ऑफ़िस कंप्यूटर पर चलती है।
- **क्या बदलेगा:** `knowledge_engine` की search files, 3 नए tests, frontend की knowledge-search की 2 files, API.md, CHANGELOG और tracker। Vector data, Railway या deploy में कुछ नहीं बदलेगा। Evals पहले जितने ही रहने चाहिए: 34/35, 16/16, 6/6, 3/3।

---

### Prompt V2 — Automatic document identity at scale, shadow mode (VDB-31, VDB-13)

```text
Vector DB session V2. Follow .cursor/rules (40-knowledge-engine, 50-workflow-prompts). Read VDB-13, VDB-31 and VDB-33 in docs/audits/vector-db-preaudit.md. No commits. No Chroma writes. No OCR. No model downloads.

Goal: Every indexed PDF needs a trustworthy IS number, or the standard filter can't scale. Today only human-reviewed IS numbers are written: in bis_pilot_representative_v2, 117 of 135 documents (5,045 of 6,028 chunks) have a blank is_number. Build an automatic, cross-checked identity step and run it in SHADOW mode (report only) over the whole corpus.

Facts:
- Source: KNOWLEDGE_PDF_SOURCE_DIR (via config.py). 10,830 PDF paths, 5,676 unique contents. Layout: "STD <n>/<file>.pdf" (product standard root, amendments), "STD <n>/Test Method/<file>.pdf", "STD <n>/Master Documents/<file>.pdf", plus "_Audit/" (ASTM).
- Existing pieces to reuse: pilot/document_identity.py, pilot/document_identity_review_registry.py (human decisions; provenance "human_review_with_evidence"), local_vector_test.is_number_from_source_path (filename heuristic), pilot/alias_policy.py (path_std_contexts), the hash cache from V0 (<KNOWLEDGE_VECTOR_DB_PATH>/corpus/hash_cache.sqlite3) if present.
- 2 PDFs are cloud-only (SF_DATALESS). Never open them.

Do:
1. New module knowledge_engine/pilot/auto_identity.py, function identify_document(path, *, first_pages_text, rel_path) → dict with:
   is_number_norm ("IS 3203" or "IS 1180 (Part 3)"), year, title (if found), doc_kind (standard | amendment | test_method | master_document | foreign_standard | unknown), provenance, evidence (short snippet ≤ 200 chars + page), confidence.
   - Text source: PyMuPDF native text of pages 1–2 only (no OCR). If there's no text layer, return provenance "no_text_layer" (OCR identity can come later).
   - Patterns: Indian Standard cover lines such as "IS 9666 : 2023", "IS 1180 (Part 3) : 2014", "भारतीय मानक", "Indian Standard", "AMENDMENT NO. 1 … TO IS 4984", and ASTM designations for _Audit.
   - Provenance values:
     - "human_review_with_evidence" (registry wins, always)
     - "auto_text_filename_agree" (cover text and filename/folder agree)
     - "auto_text_only" (text found, filename silent)
     - "filename_heuristic_unverified"
     - "conflict_needs_review" (text and filename disagree)
     - "no_text_layer"
2. Add knowledge_engine/scripts/run_auto_identity_shadow.py:
   - Iterate unique content units (use the V0 hash cache, or hash on the fly for local files only). Read page 1–2 text and call identify_document.
   - Write <KNOWLEDGE_VECTOR_DB_PATH>/corpus/identity_v1.sqlite3 (sha256 PK, all fields, primary_rel_path, all_rel_paths_json, std_folders_json) and a versioned report <KNOWLEDGE_VECTOR_DB_PATH>/diagnostics/corpus/auto_identity_shadow_<UTC>.json/.md.
   - Must be resumable (skip shas already done for the same identity version) and accept --max-units and --max-minutes.
   - Run os.nice(10). Relative paths only in reports.
3. Agreement check against the human registry: for every document that has a human_review_with_evidence decision (the 17 patched v2 docs plus the IS 2676 baseline), auto identity must give the SAME is_number_norm or report a conflict. Print the agreement table.
4. Report:
   - counts per provenance, per doc_kind and per category
   - % of unique units with a filter-safe IS (human + auto_text_filename_agree)
   - the top 30 conflicts with evidence snippets, for Amit to spot-check
   - an estimate of how many STD folders would become filterable
5. Policy proposal (documentation only, write it into VDB-31; don't implement in search yet):
   - The filter may use human_review_with_evidence and auto_text_filename_agree.
   - The UI labels the latter "Auto-identified" / "स्वतः पहचाना गया".
   - conflict/no_text_layer/filename-only stay searchable under "all" but aren't filter keys until reviewed.
   - Test Method documents are also linked to every product standard folder they appear in (path_std_contexts), for a later "include test methods of this product standard" filter (VDB-33).

Tests: knowledge_engine/scripts/test_auto_identity.py with real-looking text snippets: IS 9666 cover, IS 1180 (Part 3), an amendment page, a Hindi+English cover, a test method whose filename IS differs from the folder STD (folder ≠ conflict for Test Method), a garbage page, and an ASTM cover. Assert is_number_norm and provenance. Never open real cloud-only files (injectable reader).

Run (allowed in this session; read-only on PDFs, writes only under <KNOWLEDGE_VECTOR_DB_PATH>/corpus and diagnostics/corpus):
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_auto_identity
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_auto_identity_shadow --max-minutes 30
(rerun until it reports all units done; it's resumable)
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_collection_guards
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_search_api_http

Acceptance:
- 100% agreement (or explicit conflict) on all human-verified documents, and zero silent disagreements.
- The report shows the % of unique units with a filter-safe IS. Target ≥ 70% for root standards. Report the actual number; don't tune to it.
- All existing test modules still pass. No Chroma or source-folder writes.

Update VDB-31 (status Partial: shadow done, with numbers) and VDB-13 in docs/audits/vector-db-preaudit.md, and add a CHANGELOG line. Don't commit. Show me the provenance table and the top conflicts.
```

**यह prompt क्या करेगा (हिंदी में):**
- **क्या:** Standard वाला filter तभी काम करेगा जब हर PDF पर सही IS number लगा हो।
  - अभी IS number सिर्फ़ उन्हीं documents पर लगता है जिन्हें इंसान ने जाँचा है। इसलिए v2 के 135 में से 117 documents पर IS number खाली है।
  - 5,676 PDFs को हाथ से जाँचना संभव नहीं है।
  - यह prompt एक automatic पहचान step बनाएगा जो हर PDF के पहले 1–2 पन्नों का text पढ़कर IS number, साल और title निकालेगा।
- **कैसे:**
  - निकाला गया IS number filename और folder से मिलाया जाएगा। दोनों मिल गए तो "Auto-identified" माना जाएगा। न मिले तो "conflict" बनकर आपकी review list में जाएगा।
  - आपके पहले से जाँचे हुए 18 documents पर नतीजा 100% मिलना चाहिए। यही इसका पक्का test है।
  - अभी यह सिर्फ़ "shadow mode" में चलेगा: रिपोर्ट बनेगी, search या vector DB में कुछ नहीं बदलेगा।
  - Script resumable है, यानी बीच में रुके तो वहीं से आगे चलेगी। Mac पर धीमी priority से चलेगी और cloud-only files को नहीं छुएगी।
- **क्या बदलेगा:** एक नया module, एक script, एक test, और vector DB folder में एक identity database व रिपोर्ट। आपको लगभग 30 conflicts देखने होंगे (करीब 30 मिनट)। App, Chroma और Railway में कुछ नहीं बदलेगा।

---

### Prompt V3 — Chunker v2 + v3 collection spec on scratch (VDB-08, VDB-09, VDB-07a, VDB-29, VDB-15)

```text
Vector DB session V3. Follow .cursor/rules (40-knowledge-engine, 50-workflow-prompts). Read VDB-07, VDB-08, VDB-09, VDB-15 and VDB-29 in docs/audits/vector-db-preaudit.md. No commits. Writes ONLY to scratch collections (bis_vector_test_scratch_tmp / bis_multilingual_test_scratch_tmp) via pilot/collection_guards. No model downloads, no bulk indexing.

Goal: Fix chunk quality BEFORE ~5,500 more PDFs are indexed, and define the metadata of the future corpus collection "bis_corpus_v3".

Facts (verified on v1/v2):
- knowledge_engine/chunk_extract.py CLAUSE_HEADING_RE (lines 18-28):
  - misses BIS headings without a dot ("1 SCOPE", "5 PACKING", "6 MARKING")
  - turns dates and table numbers into clauses (105 suspicious ids in v1: "01.03.2018", "95.0", "0.05")
- The embedding model sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 (FastEmbed ONNX) truncates at 128 tokens. In v1, 436/1,156 chunks are longer (97 > 512 tokens).
- 163 v1 chunks are under 100 characters (heading-only).
- Garbled OCR passes the gate, e.g. "0. FOREWORD IS t 10641 - 1983 FOR AND", and IS 1161 price/date tables "01.03.2018 to 31.03.2018 27.040 …".
- Collections are created without "hnsw:space" (L2 default); hybrid_retrieval.distance_to_similarity uses 1/(1+d).

Do:
1. VDB-08: new heading detection.
   - Accept `^\d{1,2}\s+[A-Z][A-Z ,/&—-]{2,}$`.
   - Reject dd.mm.yyyy dates, pure numeric table cells, and ids whose first component is > 30 (configurable).
   - Keep the ANNEX / A-n / 0. FOREWORD handling.
2. VDB-09 + VDB-07a: embedding view.
   - Prefix "IS <no>[:<year>] | <title if known> | Clause <id> <heading>", using the auto identity from <KNOWLEDGE_VECTOR_DB_PATH>/corpus/identity_v1.sqlite3 when present (V2). Otherwise use the filename IS, marked unverified.
   - Store raw text separately (metadata raw_text, or chunk JSON) for display.
   - Merge heading-only segments (< 80 chars) into the next one.
   - Split anything over 120 tokens (count with the model's own tokenizer) with ~20-token overlap. Sub-chunk ids get a suffix "-s2" etc. and keep the parent clause.
3. VDB-29: garble and date/price-table heuristics route chunks to needs_review with explicit reasons. Never promote anything to usable.
4. Bump CHUNK_VERSION to "clause_chunk_v2" and QUALITY_GATE_VERSION to "usable_needs_review_v2" (pilot/constants.py). Leave v1/v2 artefacts untouched.
5. VDB-15 + the v3 spec: add pilot/corpus_v3_spec.py with
   CORPUS_COLLECTION_NAME = "bis_corpus_v3" and a collection metadata builder:
   {"hnsw:space": "cosine", model, backend, extraction_version, chunk_version, quality_gate_version, chunk_id_scheme "document_id_page_ordinal_v1", identity_version}.
   Chunk metadata adds: document_id (sha256:…), is_number_norm, is_number_provenance, doc_kind, std_folders_json (path_std_contexts), category, title, year, page numbers, raw_text_ref.
   - Add a metric-aware similarity: cosine → 1 - d; L2 on normalised vectors → 1 - d²/2.
   - Existing L2 collections must keep identical answerability behaviour (unit test).
   - Add "bis_corpus_v3" to the writable-target guard (a new assert_corpus_target in collection_guards) but NOT to PROTECTED_COLLECTIONS yet.
6. Scratch validation: re-chunk the 2 baseline PDFs (STD 9666/IS 9666 2023 - 00.pdf, STD 21/Test Method/IS 2676 1981 - 00.pdf) plus ≤ 5 other already-extracted v2 PDFs, reusing saved page text where available (no OCR). Embed into a scratch collection only, and compare with run_reliability_eval logic pointed at the scratch collection (read-only for everything else).

Tests:
- test_chunk_clause_regex.py (real snippets: IS 9666 p3 "1 SCOPE…2 REFERENCES…3 TYPES…4 REQUIREMENTS", "5 PACKING", "6 MARKING", and the table row "01.03.2018 to 31.03.2018 27.040")
- test_chunk_embedding_view.py (header present, raw text kept, ≤ 120 tokens, merge rule)
- test_similarity_metric.py

Acceptance:
- On scratch: 0 date/table clause ids; "5 PACKING" and "6 MARKING" are their own clauses; p95 embedded tokens ≤ 128; no chunk < 40 chars. The garble samples go to needs_review.
- All test modules pass (including test_collection_guards, test_search_api_http, test_standard_filter_v2_candidate, and the V1/V2 tests if present).
- run_reliability_eval and run_pilot_eval on the CURRENT runtime (v1) are unchanged: 34/35, 16/16, 6/6, 3/3. Put the scratch-collection numbers in the item logs.

Verify:
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_chunk_clause_regex
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_chunk_embedding_view
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_similarity_metric
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_collection_guards
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_search_api_http
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_reliability_eval
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_pilot_eval

Update VDB-07 (a part), VDB-08, VDB-09, VDB-15 and VDB-29 in docs/audits/vector-db-preaudit.md, and add a CHANGELOG line. Don't commit. Summarise and show the verification output.
```

**यह prompt क्या करेगा (हिंदी में):**
- **क्या:** 5,500 नई PDFs डालने से पहले chunking ठीक करेगा, ताकि गलत chunks बड़े पैमाने पर DB में न भरें।
  - "1 SCOPE", "5 PACKING" जैसी headings अभी पकड़ में नहीं आतीं।
  - तारीखें और table के नंबर clause बन जाते हैं।
  - Model सिर्फ़ 128 tokens पढ़ता है, जबकि 38% chunks उससे लंबे हैं।
- **कैसे:**
  - नई heading पहचान।
  - हर chunk के आगे "IS नंबर | title | clause" वाला header, ताकि search बेहतर समझे।
  - लंबे chunks को 120 tokens के टुकड़ों में बाँटना।
  - छोटे heading-only chunks को अगले chunk में जोड़ना।
  - खराब OCR text को needs_review में भेजना।
  - नए collection `bis_corpus_v3` का पूरा design (cosine metric और पूरा metadata) तय होगा।
  - जाँच सिर्फ़ scratch collection पर 2 baseline और 5 और PDFs से होगी।
- **क्या बदलेगा:** `chunk_extract.py`, constants, एक नई spec file, guards, 3 नए tests, tracker और CHANGELOG। चालू v1 search और उसके evals वैसे के वैसे रहेंगे। Protected collections को कोई नहीं छुएगा।

---

### Prompt V4 — Resumable, content-addressed corpus batch indexer + one pilot batch (VDB-32, VDB-33, VDB-34)

```text
Vector DB session V4. Follow .cursor/rules (40-knowledge-engine, 50-workflow-prompts). Read VDB-10, VDB-32, VDB-33 and VDB-34 in docs/audits/vector-db-preaudit.md. No commits. Writes only to the NEW collection "bis_corpus_v3" (pilot/corpus_v3_spec.py from V3) and its folder <KNOWLEDGE_VECTOR_DB_PATH>/corpus/bis_corpus_v3/. Never write v1, v2 or other protected collections. The runtime stays bis_pilot_representative_v1.

APPROVAL IN THIS PROMPT: after the dry run passes, you may run exactly ONE real batch of at most 10 content units into bis_corpus_v3. Nothing more.

Goal: A background-friendly indexer that processes the 5,676 unique PDFs in small, resumable batches, so it can run for weeks in short slots without risk.

Facts:
- Source: 10,830 PDF paths → 5,676 unique contents (5,154 duplicate paths; Test Methods are copied into many STD folders). 2 cloud-only PDFs (macOS SF_DATALESS). 1 known FileDataError (STD 80601/Test Method/IS 15575 Part 1 2016 - 00.pdf).
- The existing pieces are proven:
  - extract_pdf.py (PyMuPDF native + Tesseract OCR fallback; project tesseract via pilot.pipeline.prefer_project_tesseract)
  - chunk_extract (clause_chunk_v2 from V3)
  - pilot/quality_gate.py
  - FastEmbedMultilingualEF (same model as runtime)
  - pilot/manifest.py
  - pilot/v2_live_index.process_content_unit (reuse logic)
  - pilot/alias_policy (path_std_contexts)
  - identity_v1.sqlite3 (V2), hash_cache.sqlite3 (V0)
- run_second_pilot_indexing is v2- and selection-file-only (assert_second_pilot_target). Don't modify its behaviour.
- Measured throughput: 0.25–0.5 s/page; ~2.5 usable chunks/page; ~8.8 KB Chroma per chunk.

Build:
1. knowledge_engine/pilot/corpus_index.py and knowledge_engine/scripts/run_corpus_batch_index.py.
2. Corpus manifest: <KNOWLEDGE_VECTOR_DB_PATH>/corpus/bis_corpus_v3/manifest.sqlite3 (WAL mode).
   - Table units: sha256 PK, primary_rel_path, all_rel_paths_json, std_folders_json, category, size, page_count, tier, priority, status, attempts, last_error (short, no absolute paths), versions (extraction/chunk/gate/model/identity), usable_count, needs_review_count, native_pages, ocr_pages, timings_json, started_at, finished_at.
   - Statuses: pending → processing → done | done_no_usable | failed | skipped_cloud_only | skipped_unreadable.
   - On start, rows stuck in "processing" go back to pending (stale recovery).
3. Queue / priority (deterministic):
   - tier 1 = STD-folder root standard PDFs (latest-looking "- 00"/year version first)
   - tier 2 = Test Method units, ordered by the number of STD folders that reference them (desc)
   - tier 3 = amendments and Master Documents
   - tier 4 = _Audit (ASTM)
   - Within a tier, smaller files first.
   - The 135 units already in v2 are processed first via REUSE (no re-extraction when saved page text exists; re-chunk with clause_chunk_v2 and re-embed into v3).
4. Batch controls:
   - --max-units (default 25), --max-minutes (default 45), --tier, --dry-run (prints the plan and counts; writes nothing to Chroma)
   - --retry-failed
   - stop after 3 consecutive failures
   - lock file (corpus/bis_corpus_v3/.lock with PID; refuse a second run)
   - os.nice(10)
   - graceful SIGINT/SIGTERM: finish or roll back the current unit, then exit
   - checkpoint the manifest after EVERY unit (atomic)
5. Per unit:
   - Skip cloud-only files WITHOUT opening them (st_flags & 0x40000000, or st_blocks == 0 with size > 0) → skipped_cloud_only.
   - Extract → chunk v2 → gate → identity from identity_v1 (provenance kept) → upsert ONLY usable chunks into bis_corpus_v3, with metadata from corpus_v3_spec, including is_number_norm and std_folders_json.
   - Save needs_review chunks as JSON under corpus/bis_corpus_v3/needs_review_chunks/.
   - Idempotent: delete only this unit's previous ids in v3 before upsert (via collection_guards).
   - Record timings.
6. After each batch:
   - write corpus/bis_corpus_v3/reports/batch_<UTC>.json
   - print a one-screen summary: units done this batch, totals by status, % of 5,676, ETA from median s/page
   - call report_corpus_progress (V0) so the overall table updates
7. Disk guard: refuse to start if free disk < 20 GB. Print the current size of the v3 folder.

Tests (spy adapters, no real OCR/embedding, temp dirs):
knowledge_engine/scripts/test_corpus_batch_index.py must cover:
- ordering by tier
- resume after a simulated crash (a unit in processing → pending)
- lock refusal
- the cloud-only file is never opened
- duplicate paths are processed once with all paths recorded
- max-units/max-minutes stop
- 3-failure stop
- idempotent re-run (no duplicate ids)
- guards refuse v1/v2/protected targets

Run in this session:
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_corpus_batch_index
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_collection_guards
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_corpus_batch_index --dry-run
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_corpus_batch_index --max-units 10 --max-minutes 20
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.report_corpus_progress
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_search_api_http
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_reliability_eval   (runtime v1 must be unchanged: 34/35, 16/16)

Acceptance:
- The dry run shows ≈ 5,676 units, 2 skipped_cloud_only, and the tier counts.
- The pilot batch finishes ≤ 10 units with a report. Re-running the same command continues with the NEXT units (no repeats).
- v1/v2 counts unchanged (1,156 / 6,028).
- All test modules pass.

Also add to knowledge_engine/README.md a "Background corpus indexing" section with the exact terminal command Amit can run himself:
cd "/Users/amitkumar/Documents/Softwares/Consultancy Management" && caffeinate -i knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_corpus_batch_index --max-units 200 --max-minutes 60
plus how to stop it (Ctrl+C is safe), how to check progress, and how to roll back (delete only bis_corpus_v3 via the guard helper).

Update VDB-32, VDB-33 and VDB-34 in docs/audits/vector-db-preaudit.md, and add a CHANGELOG line. Don't commit. Show the dry-run plan, the pilot batch report and the progress table.
```

**यह prompt क्या करेगा (हिंदी में):**
- **क्या:** पूरे 5,676 unique PDFs को धीरे-धीरे, छोटे batches में vector DB में डालने वाली मशीन बनाएगा। यह कभी भी रुक सकती है और फिर से वहीं से शुरू हो सकती है।
  - OneDrive में 10,830 files हैं, पर उनमें 5,154 एक जैसी copies हैं, खासकर Test Method वाली। इसलिए हर PDF सिर्फ़ एक बार process होगी।
  - Index में यह भी दर्ज रहेगा कि वह किन-किन STD folders में है।
- **कैसे:**
  - एक SQLite manifest हर PDF की हालत रखेगा: pending, done, failed या cloud-only।
  - क्रम यह होगा: पहले main standards, फिर ज़्यादा इस्तेमाल होने वाले Test Methods, फिर amendments और बाकी।
  - हर batch में सीमित PDFs और सीमित मिनट। हर PDF के बाद checkpoint।
  - Lock file रहेगी ताकि दो run एक साथ न चलें। Mac पर धीमी priority और disk space की जाँच भी होगी।
  - Cloud-only files को खोलेगा नहीं।
  - पहले से बने v2 के 135 documents दोबारा extract नहीं होंगे, उनका text reuse होगा।
  - इस prompt में केवल 10 PDFs का एक pilot batch नए collection `bis_corpus_v3` में चलाने की अनुमति है।
- **क्या बदलेगा:** नया indexer module, script, test, README में terminal command, tracker और CHANGELOG। v1 (जो अभी search में चलता है) और v2 नहीं बदलेंगे। App पहले जैसा ही चलेगा।

---

### Prompt V5 — Background batch (repeat as often as you like) (VDB-10)

Amit can skip Cursor entirely and run this in Terminal (from V4's README):

```bash
cd "/Users/amitkumar/Documents/Softwares/Consultancy Management" && caffeinate -i knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_corpus_batch_index --max-units 200 --max-minutes 60
```

Or paste this into Cursor when you want it checked and logged:

```text
Vector DB session V5 (background batch). Follow .cursor/rules (40-knowledge-engine, 50-workflow-prompts). No code changes unless a test or batch fails. No commits.

APPROVAL IN THIS PROMPT: run ONE batch of run_corpus_batch_index into bis_corpus_v3 with --max-units 200 --max-minutes 60 (use caffeinate -i). Nothing else is approved.

Steps:
1. Preflight:
   - knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_corpus_batch_index
   - knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_collection_guards
   - confirm free disk ≥ 20 GB and no .lock is held
2. Run: caffeinate -i knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_corpus_batch_index --max-units 200 --max-minutes 60
3. Then: knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.report_corpus_progress
4. Sanity:
   - v1 count is still 1,156 and v2 is still 6,028 (read-only)
   - knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_search_api_http passes
5. If units failed: list them (relative path, short error). If one error pattern repeats (e.g. FileDataError, a Tesseract timeout), propose the smallest fix, but don't change code until I reply "fix it". Never retry more than once in this session.
6. Append a log line to VDB-10 in docs/audits/vector-db-preaudit.md: date, units processed this batch, cumulative unique units done / 5,676 (%), usable chunks in v3, failures, v3 folder size, ETA.
7. End with a 5-line summary in English plus the same in simple Hindi.
```

**यह prompt क्या करेगा (हिंदी में):**
- **क्या:** यह बार-बार चलाने वाला prompt है। हर बार ज़्यादा से ज़्यादा 200 नई PDFs या 60 मिनट, जो पहले पूरा हो, vector DB `bis_corpus_v3` में जोड़ेगा। उसके बाद progress report बनाएगा: कितने % हो गया, कितना बचा, अनुमानित समय कितना है।
- **कैसे:**
  - पहले tests और disk space जाँचेगा, फिर batch चलाएगा।
  - `caffeinate` से Mac बीच में sleep नहीं करेगा।
  - Ctrl+C दबाना सुरक्षित है, अगली बार वहीं से आगे चलेगा।
  - कोई PDF fail हुई तो उसकी list देगा और सबसे छोटा fix सुझाएगा। आपकी अनुमति के बिना code नहीं बदलेगा।
- **क्या बदलेगा:** सिर्फ़ नया `bis_corpus_v3` collection बढ़ेगा और tracker में एक log line जुड़ेगी। चालू search (v1) वैसा ही रहेगा।
- **अनुमान:** कुल लगभग 20–30 batches (7–14 घंटे का computer समय)। आप masters और finance का काम करते रहिए, यह पीछे चलता रहेगा। Cursor के बिना ऊपर वाला एक terminal command भी काफ़ी है।

---

### Prompt V6 — Serve the corpus collection locally behind an eval gate (VDB-06, VDB-10, VDB-11, VDB-20)

Run this once v3 has at least all tier-1 standards (or whenever Amit wants a preview).

```text
Vector DB session V6. Follow .cursor/rules (20-frontend, 40-knowledge-engine, 50-workflow-prompts). Read VDB-06, VDB-10, VDB-11 and VDB-20 in docs/audits/vector-db-preaudit.md. No commits. Read-only on all collections. No deploy.

Goal: Let the local app search bis_corpus_v3 instead of the 40-PDF pilot, but only through an eval gate and with honest labels. Keep v1 as the instant rollback.

Do:
1. VDB-06: wire pilot/standard_filter_v2_candidate (metadata-first: is_number_norm + is_number_provenance; legacy mapping for v1) into answerability.compute_signals standard_filter_ok.
   - test_standard_filter_v2_candidate currently asserts "not_live_wired". Update ONLY that assertion, deliberately, to assert it IS wired. Explain this in the item log.
   - Run eval_standard_filter_v2_candidate before and after.
2. Filter keys for v3:
   - the standards list = is_number_norm values whose provenance is human_review_with_evidence or auto_text_filename_agree
   - add an optional "include test methods of this product standard" toggle that also matches chunks whose std_folders_json contains the chosen "STD <n>" (VDB-33)
   - labels: human = "Verified IS" / "सत्यापित IS"; auto = "Auto-identified" / "स्वतः पहचाना गया"
3. VDB-11: return visual_verification_status, extraction_method, is_number_provenance and doc_kind in results/evidence_chunks (additive). In BisKnowledgeSearchPage.tsx + knowledgeSearchUiI18n.ts:
   - show the badge "Human-verified" / "मानव-सत्यापित" vs "Auto-checked" / "स्वतः जाँच"
   - change the supported-state copy (currently 'जाँचा हुआ संबंधित स्रोत मिला।', i.e. "a verified related source was found") so it doesn't claim human verification for auto-checked evidence
   - keep all other Hindi strings
4. VDB-20: update the TS types for all fields; on not_found show up to 3 "nearest candidates (unverified)", collapsed; hide _debug unless KNOWLEDGE_API_DEBUG=1.
5. New GET /coverage (and /api/knowledge/coverage), documented in API.md. It returns the latest report_corpus_progress summary (units done / total, %, standards count, last updated) with no paths. The page shows a small banner: "Library coverage: X of 5,676 PDFs (Y%)" / "लाइब्रेरी कवरेज: 5,676 में से X PDF (Y%)".
6. Eval gate: run run_reliability_eval, run_pilot_eval and run_post_v2_validation with KNOWLEDGE_RUNTIME_COLLECTION=bis_corpus_v3 set in the shell (not in .env), and compare with v1. The gate is:
   - Pass@1 ≥ 34/35
   - NOT_FOUND hard reject 16/16, leaks 0
   - pilot 6/6 and 3/3
   - no new false positive on "What is the moisture content limit"
   If the gate passes, tell me the exact one-line .env change to switch (KNOWLEDGE_RUNTIME_COLLECTION=bis_corpus_v3). Don't edit .env yourself. If it fails, list the failing cases and stop.

Verify:
all knowledge_engine/scripts/test_*.py modules (including test_standard_filter_v2_candidate after the deliberate assertion change, test_search_api_http, test_collection_guards, test_scoped_vector_rank, test_corpus_batch_index)
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.eval_standard_filter_v2_candidate
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_reliability_eval
knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_pilot_eval
npm run lint && npm run typecheck && npm run build

Update VDB-06, VDB-10, VDB-11 and VDB-20 in docs/audits/vector-db-preaudit.md and API.md, and add a CHANGELOG line. Don't commit. Show the v1 vs v3 eval table.
```

**यह prompt क्या करेगा (हिंदी में):**
- **क्या:** जब नए collection `bis_corpus_v3` में काफ़ी PDFs आ जाएँ (कम से कम सारे main standards), तब app की local search को 40-PDF वाले pilot से हटाकर इस बड़े collection पर चलाने की तैयारी करेगा। यह switch तभी होगा जब eval test पास हों।
- **कैसे:**
  - Standard filter अब IS number और उसकी पहचान का स्रोत (इंसान ने जाँचा या automatic) देखेगा।
  - किसी product standard के Test Methods भी साथ में खोजने का option आएगा।
  - हर result पर साफ़ badge दिखेगा, "मानव-सत्यापित" या "स्वतः जाँच", ताकि automatic text को "जाँचा हुआ" न बताया जाए।
  - Page पर "लाइब्रेरी कवरेज: X PDF (Y%)" banner दिखेगा।
  - Not found होने पर सबसे नज़दीकी 3 results (unverified) छिपे हुए रूप में दिखेंगे।
- **क्या बदलेगा:** `answerability`, search API (सिर्फ़ नए fields जुड़ेंगे), frontend की knowledge-search files, API.md, tracker और CHANGELOG। `.env` को Cursor खुद नहीं बदलेगा, सिर्फ़ एक line बताएगा। आप चाहें तो एक line से वापस v1 पर लौट सकते हैं।

---

### Later prompts (after V6; reuse from `01_vector_db_preaudit.md` with path fixes)

Use `01_vector_db_preaudit.md` Prompt 3 (rest: VDB-04/05/18), Prompt 4 (VDB-22/23), Prompt 5 (VDB-21/28) and Prompt 6 (VDB-24/25). Before pasting, replace these paths:

| Old path in 01 | Current path |
|---|---|
| `railway-stack/functions/...` | `backend/services/functions/...` |
| `railway-stack/gateway/Caddyfile` | `backend/services/gateway/Caddyfile` |
| `frontend/src/...` | `frontend/web/src/...` |
| `frontend/vite.config.ts` | `frontend/web/vite.config.ts` |
| `node --check railway-stack/functions/*.mjs` | `npm run functions:check` (plus any new .mjs) |

Production (Prompt 5) also needs a decision before code:
- **(a)** a dedicated Railway "knowledge" service with a ~5 GB volume and ≥ 2 GB RAM, holding the Chroma snapshot and the ONNX model, or
- **(b)** pgvector on Postgres-MC1Y. The image `supabase-postgres:17.6.1.136` normally ships pgvector, but that's unverified and no migration enables it. The volume is 5 GB, so expect to resize.
- Either way, deploy only on Amit's explicit approval.

---

## 6. Not verified in this audit
- Whether the frontend `/bis/knowledge-search` route is linked in the production navigation. The route exists, and the prod API calls return HTML.
- Whether pgvector is installed or enabled on Postgres-MC1Y (the DB wasn't queried) and how much of the 5 GB volume is used.
- Page counts for unprocessed PDFs. ~97k pages is an estimate from the v2 average of 11.3 pages/MB; scanned-heavy folders may differ. OCR time per page for the rest of the corpus is likewise extrapolated.
- The evals (`run_reliability_eval` / `run_pilot_eval`) were **not** re-run, to stay strictly read-only on the live store. The last recorded results are 34/35, 16/16, 6/6, 3/3 (tracker entry for VDB-02, 2026-10-08).
- The SHA-256 dedupe hashed only files that share a size with another file. Files with a unique size were treated as unique without hashing. A size collision is necessary for identical content, so this is exact.
- Scratch files left on the Mac, outside the repo: `/tmp/vdb_src_inventory.tsv`, `/tmp/vdb_hashes.json`, `/tmp/vdb_audit_chroma/` (65 MB copy), `/tmp/vdb_t.out`, `/tmp/vdb_hash_out.txt`, `/tmp/vdb_audit_counts.json`, `/tmp/vdb_audit_cats.json`. They're safe to delete with `rm -rf /tmp/vdb_*`.
