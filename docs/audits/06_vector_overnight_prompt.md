# Vector DB: the 6 PM session tonight and the overnight indexing plan (2026-10-08)

- **Repo:** `/Users/amitkumar/Documents/Softwares/Consultancy Management` (`qiamit/Consultancy-Management`, `main`, HEAD `d6d47e6`)
- **Details source:** `docs/audits/vector-db-status-2026-10-08.md` (already on the Mac, same as `05_vector_db_status.md`)
- **Plan:** at 6 PM IST, one Cursor session (~1 hour) with ONE combined prompt (V0 + V3 + V4 + the overnight script). Then at night, ONE terminal command. That takes 2–3 nights. After review, V1, V2 and V6 happen in the daytime.
- Nothing in this file has been run on the Mac yet. These are prompts and commands only.

---

## 1. The 6 PM combined prompt (paste into Cursor as-is)

```text
Vector DB combined session (V0 + V3 + V4 + overnight runner). Date: 2026-10-08.
Repo root: /Users/amitkumar/Documents/Softwares/Consultancy Management
Follow .cursor/rules: 00-project-core, 40-knowledge-engine, 50-workflow-prompts.

READ FIRST (don't re-audit, the facts are already measured there):
- docs/audits/vector-db-status-2026-10-08.md: section 2 (corpus facts), section 3 (VDB tracker = source of truth), and section 5 Prompts V0, V3 and V4 (detailed specs). This prompt overrides those specs wherever they differ.
- docs/audits/vector-db-preaudit.md (the repo tracker; VDB-03..18 and 20..29 still say "Reserved").
- knowledge_engine/config.py, pilot/constants.py, pilot/collection_guards.py, chunk_extract.py, pilot/quality_gate.py, pilot/manifest.py, pilot/v2_live_index.py (process_content_unit, v2_paths), pilot/alias_policy.py, extract_pdf.py.

=====================================================================
HOUSE RULES (they apply to every step; breaking one = stop)
=====================================================================
1. No git commit, push, branch, stash or reset. Leave all changes uncommitted.
2. No Railway, no deploy, no npm run db:*, no psql, no network calls. This session is fully local on the Mac.
3. Never open, print, cat, copy or edit .env, knowledge_engine/.env, frontend/web/.env or .railway-secrets.env. Read paths only through knowledge_engine/config.py (load_settings). Never print absolute paths in reports; use paths relative to KNOWLEDGE_PDF_SOURCE_DIR. Console logs may say "<VDB>/corpus/..." instead of the real path.
4. Protected / read-only collections: bis_two_sample_usable_v1, bis_two_sample_usable_multilingual_exp_v1, bis_pilot_representative_v1 (PROTECTED_COLLECTIONS), and also bis_pilot_representative_v2 (treat as read-only even though it isn't in the frozenset). Never write, upsert, delete, reset or re-create them, and never write anything under sample_collections/<those names>/. Don't weaken or bypass pilot/collection_guards.py.
5. The ONLY vector writes allowed are: (a) the scratch collections bis_vector_test_scratch_tmp / bis_multilingual_test_scratch_tmp (V3 validation), and (b) the NEW collection "bis_corpus_v3" in its OWN Chroma persist dir <KNOWLEDGE_VECTOR_DB_PATH>/corpus/bis_corpus_v3/chroma (never inside sample_collections/, never in the same PersistentClient dir the search API opens).
6. The served runtime must not change: PILOT_COLLECTION_NAME stays "bis_pilot_representative_v1"; don't change search_pipeline.open_search_collection, the API, or the frontend. Don't restart or stop the local API on port 3851.
7. Never write inside the PDF source folder. Never open a cloud-only (dataless) PDF: on macOS st_flags & 0x40000000 (SF_DATALESS), or st_blocks == 0 with st_size > 0. Re-stat right before every open, because OneDrive can evict a file at any time.
8. No model downloads. The FastEmbed model (sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2, fastembed_onnx) must already be cached; if loading it would download, STOP and tell me. No external LLM/API calls. Don't touch knowledge_engine/eval/*.json gold files.
9. Indexing approval for THIS session: at most 10 content units in total may be really indexed into bis_corpus_v3 (pilot batch ≤ 5 + wrapper smoke run ≤ 3 + stop test ≤ 2). OCR is allowed only for those units. Nothing else. Don't run run_second_pilot_indexing or any v1/v2 indexer.
10. Keep all knowledge tests green (see VERIFY). Don't edit an existing test's assertions to make it pass.

STOP RULE (strict):
- Before changing any code, run the baseline test loop (VERIFY, step 0). If any existing test already fails, STOP and report. Don't fix unrelated things.
- After each part (A, B, C, D), run that part's tests. If a test fails and you can't fix it with a small change inside the files of that part, STOP. Don't continue to the next part, and don't run any real batch.
- If the dry run, the pilot batch, the smoke run or the stop test fails or shows anything unexpected (an unexpected Chroma target, a touched protected path, a unit stuck in "processing", an opened cloud-only file, a model download attempt, a disk guard failure), STOP immediately. Leave the manifest consistent, and report the exact error and what you'd change. Don't retry more than once.
- If the session is running out of time, stop at the end of a complete part with green tests, and report what's left.
- Always end with exactly one line: "OVERNIGHT: READY" (only if every acceptance item below passed) or "OVERNIGHT: NOT READY: <reason>".

=====================================================================
PART A: V0, tracker + read-only corpus progress report (VDB-30, VDB-36)
=====================================================================
A1. Tracker: in docs/audits/vector-db-preaudit.md, replace every "Reserved" entry (VDB-03..18, VDB-20..29) using section 3 of docs/audits/vector-db-status-2026-10-08.md (titles, priority, status, evidence) and the item table at the end of Prompt V0 in section 5 (fix plan + acceptance). Each item gets: title, priority, status, date 2026-10-08, affected files, problem/evidence, fix plan, acceptance criteria, and the log line "2026-10-08: filled from status audit (read-only)". Keep VDB-01/02/19 exactly as they are. Append VDB-30..VDB-36. Never renumber. Use post-restructure paths only (backend/services/functions, backend/services/gateway, frontend/web/src, frontend/web/vite.config.ts). Add or refresh a summary table at the top: ID | Title | Priority | Status | Updated.
A2. Add knowledge_engine/scripts/report_corpus_progress.py exactly as specified in Prompt V0 (stat-only walk; SHA-256 only for local files; hash cache <VDB>/corpus/hash_cache.sqlite3 keyed by (relative_path, size, mtime_ns); unique-size files may skip hashing; read v1/v2 manifest.json + source_aliases + any <VDB>/corpus/*/manifest.sqlite3, opened read-only; JSON + MD under <VDB>/diagnostics/corpus/corpus_progress_<UTC>.json/.md, never overwrite; console table; flags --json-only and --no-hash). Also expose a function the batch indexer can import to reuse the inventory + hash cache.
A3. Add knowledge_engine/scripts/test_corpus_progress.py as specified in Prompt V0 (fake PDFs in a temp dir, two identical files in different folders, one dataless via an injectable stat function, assert it is never opened, manifest cross-referencing).
Acceptance A: the first real run reports ≈ 10,830 PDF paths / 5,676 unique / 5,154 duplicate paths in 1,177 groups / 2 cloud-only (STD 17633/IS 17633_2022.pdf, STD 1659/IS 1659.pdf) / v2 embedded 135 units / 865 paths / v1 served 39 units / 189 paths (small drift OK; explain any drift). A rerun is fast because of the hash cache. VDB-30 and VDB-36 → Done, with commands and results.

=====================================================================
PART B: V3, chunker v2 + v3 collection spec, scratch only (VDB-08, VDB-09, VDB-07a, VDB-29, VDB-15)
=====================================================================
Implement Prompt V3 steps 1–5 with these overrides:
- Version safety (overrides V3 step 4): do NOT change the existing constants CHUNK_VERSION = "clause_chunk_v1" and QUALITY_GATE_VERSION = "usable_needs_review_v1"; v1/v2 pipelines and their tests must behave identically. Add NEW constants CHUNK_VERSION_V2 = "clause_chunk_v2" and QUALITY_GATE_VERSION_V2 = "usable_needs_review_v2", and make the new behaviour opt-in (a parameter or a separate function used only by the corpus indexer). Existing callers keep the old behaviour by default.
- Identity: identity_v1.sqlite3 (V2) does not exist yet. Use the filename/folder heuristic (local_vector_test.is_number_from_source_path, alias_policy) with is_number_provenance "filename_heuristic_unverified", and never label it verified. Keep the identity source behind one function, so V2 can later re-queue units whose identity changes (store identity_version per unit).
- Token counting must use the model's own tokenizer from the local cache (no download).
- pilot/corpus_v3_spec.py: CORPUS_COLLECTION_NAME = "bis_corpus_v3", metadata builder with "hnsw:space": "cosine" + model/backend/versions/chunk_id_scheme/identity_version, chunk metadata fields as in V3 step 5, metric-aware similarity (cosine → 1 - d; L2 unchanged for existing collections).
- collection_guards: add assert_corpus_target(name) that allows ONLY "bis_corpus_v3" (refuses v1, v2, every protected collection and empty names) and assert_corpus_persist_dir(path), which must be under <VDB>/corpus/bis_corpus_v3/ and never under sample_collections/. Don't add bis_corpus_v3 to PROTECTED_COLLECTIONS yet.
- Scratch validation (reduced to fit the session): re-chunk the 2 baselines (STD 9666/IS 9666 2023 - 00.pdf, STD 21/Test Method/IS 2676 1981 - 00.pdf) plus ≤ 3 already-extracted v2 PDFs from SAVED page text (no OCR), embed into a scratch collection only, and report clause/garble/token stats.
Tests: test_chunk_clause_regex.py, test_chunk_embedding_view.py, test_similarity_metric.py (as in V3), and extend test_collection_guards for assert_corpus_target / assert_corpus_persist_dir.
Acceptance B: on scratch, 0 date/table clause ids; "5 PACKING" and "6 MARKING" are their own clauses; p95 embedded tokens ≤ 128; no chunk < 40 chars; the garble samples route to needs_review. run_reliability_eval and run_pilot_eval on the CURRENT runtime (v1) are unchanged: 34/35, NOT_FOUND 16/16, leaks 0, pilot 6/6 and 3/3 (report before/after). Update VDB-07 (part a), 08, 09, 15 and 29.

=====================================================================
PART C: V4, resumable content-addressed corpus batch indexer (VDB-32, VDB-33, VDB-34)
=====================================================================
Implement Prompt V4 "Build" steps 1–7 (knowledge_engine/pilot/corpus_index.py + knowledge_engine/scripts/run_corpus_batch_index.py; SQLite manifest <VDB>/corpus/bis_corpus_v3/manifest.sqlite3 in WAL mode; statuses pending → processing → done | done_no_usable | failed | skipped_cloud_only | skipped_unreadable; stale "processing" → pending on start; deterministic tiers; the 135 v2 units first via REUSE of saved page text with re-chunk v2 + re-embed into v3; --max-units / --max-minutes / --tier / --dry-run / --retry-failed; stop after 3 consecutive failures; lock file with PID; os.nice(10); checkpoint after every unit; per-batch report <VDB>/corpus/bis_corpus_v3/reports/batch_<UTC>.json; disk guard ≥ 20 GB free), plus:
- Content-addressed: one unit per SHA-256; record all_rel_paths_json and std_folders_json (path_std_contexts) so Test Methods stay linked to every STD folder (VDB-33).
- Re-stat right before opening each file; dataless → skipped_cloud_only without opening (VDB-34). Known FileDataError (STD 80601/Test Method/IS 15575 Part 1 2016 - 00.pdf) → failed with a short error, never a crash.
- Graceful stop: on SIGTERM/SIGINT or when the file <VDB>/corpus/bis_corpus_v3/STOP exists, abort at the next page boundary (≤ 60 s), discard the partial unit (delete only that unit's ids from bis_corpus_v3 through the guards), set it back to pending, release the lock and exit 0 with stop_reason "stop_requested".
- Lock: if the lock's PID is not alive, treat the lock as stale, log it and take over. If it is alive, refuse with exit code 3.
- Add --summary-json <path> (machine-readable batch result for the overnight runner) and --status (read-only: opens the manifest with sqlite "mode=ro", prints counts by status, % of unique units, v3 usable chunks from the manifest, no Chroma open).
- Never call v2_live_index.run_second_pilot_indexing and don't change its behaviour. Reuse helper logic by import or by a small extraction into shared functions, keeping v2 tests green.
Tests: test_corpus_batch_index.py with spy adapters (no real OCR/embedding) covering everything in V4's test list, plus the STOP file, the stale lock takeover, re-stat-before-open, and "partial unit discarded on stop".

=====================================================================
PART D: overnight runner (one command at night)
=====================================================================
D1. knowledge_engine/scripts/run_overnight_index.py (Python orchestrator):
- Options: --until HH:MM (local time, default 07:00, next occurrence), --max-hours (default 9; the run ends at whichever of the two comes first), --batch-units (default 150), --batch-minutes (default 40), --max-batches (default 40), --pause-seconds (default 20), --allow-battery.
- On start: try os.setsid(), then spawn `caffeinate -dimsu -w <own pid>` so the Mac stays awake exactly as long as the runner lives (if caffeinate is missing, log a warning). os.nice(10).
- Its own lock <VDB>/corpus/bis_corpus_v3/.overnight.lock (PID + start time; stale-PID takeover; refuse a second runner with exit code 3). Remove any old STOP file only at start, and log it.
- PREFLIGHT (refuse to start, exit 2, with a clear message if any fail): config paths set (don't print them); free disk ≥ 20 GB; on AC power (pmset -g batt) unless --allow-battery; FastEmbed model loadable from the local cache with no download; tesseract available via prefer_project_tesseract; manifest readable; test_collection_guards and test_corpus_batch_index pass (run as subprocesses). Print "PREFLIGHT OK".
- Protected fingerprint: before and after the run, a stat-only fingerprint (relative file name, size, mtime_ns) of sample_collections/bis_pilot_representative_v1 and _v2, ignoring *-wal / *-shm. Report "v1/v2 untouched: OK" or "WARNING: changed files: ..." (warning only, since the local API may be reading). Never open those collections.
- Loop: run each batch as a CHILD process (`python -m knowledge_engine.scripts.run_corpus_batch_index --max-units N --max-minutes M --summary-json ...`) in its own process group, so memory is freed between batches. Before each batch, check the deadline, the STOP file, free disk (≥ 20 GB) and max-batches. Forward SIGTERM/SIGINT to the child, wait up to 120 s, then exit cleanly.
- Stop reasons (exactly one, logged): deadline | max_batches | queue_empty | stop_requested | consecutive_failures (3 failed batches in a row, or a batch reporting its 3-failure stop) | disk_low | preflight_failed | error.
- At the end, always (also on stop): run report_corpus_progress --json-only, then write the morning report <VDB>/corpus/bis_corpus_v3/reports/overnight_<UTC>.md + .json (never overwrite) with: start/end time (IST), stop reason, batches run, units processed tonight by status, cumulative done / 5,676 unique (%), v3 usable chunks, needs_review count, failed + skipped list (relative path + short error, max 30), median s/page, ETA in hours and "nights left" at 8 h/night, free disk, v3 folder size, and the protected fingerprint result. Release the locks. A file-based log goes to <VDB>/corpus/bis_corpus_v3/logs/overnight_<UTC>.log (relative paths only). Stdout is a short human log.
D2. knowledge_engine/scripts/overnight_index.sh (bash, `set -euo pipefail`, cd to the repo root derived from the script's own location, uses knowledge_engine/.conda/bin/python), with subcommands:
- start [options passed through]: refuses if a runner is alive; mkdir -p "$HOME/Library/Logs/ConsultancyPro"; then `nohup <python> -m knowledge_engine.scripts.run_overnight_index "$@" >> "$HOME/Library/Logs/ConsultancyPro/knowledge-overnight.log" 2>&1 < /dev/null &` + disown; waits up to 90 s for "PREFLIGHT OK" or a failure in the log; prints the PID, the log path and the stop command. It must survive closing the Terminal or Cursor window.
- status: running or not (PID from the lock), current batch, units done tonight, cumulative %, last 15 log lines. Read-only (uses run_corpus_batch_index --status; no Chroma open).
- stop: creates the STOP file and sends SIGTERM to the runner PID; waits up to 3 minutes, printing progress; reports "stopped cleanly" or tells me to run `stop` again. No SIGKILL by default; `stop --force` only after a clear warning.
- report: prints the newest overnight_*.md (or says none yet).
- log: tail -n 60 of the log file.
D3. test_overnight_index.py with a fake batch runner and a fake clock: deadline stop, max_batches, queue_empty, STOP file, 3 consecutive failures, disk_low, lock refusal and stale takeover, preflight failure blocks the loop, the morning report is always written, and the signal is forwarded to the child. Also run `bash -n knowledge_engine/scripts/overnight_index.sh` (and shellcheck if it's installed).
D4. knowledge_engine/README.md: a section "Overnight corpus indexing" with start / status / stop / report / log commands, what each stop reason means, how to roll back (delete only bis_corpus_v3 + its folder through the guard helper; never v1/v2), and the note "Mac on charger, lid open if it's a laptop; don't shut down or log out".

=====================================================================
REAL RUNS ALLOWED IN THIS SESSION (in this order, max 10 units total)
=====================================================================
R1. run_corpus_batch_index --dry-run: expect ≈ 5,676 units, 2 skipped_cloud_only planned, tier counts, the 135 reuse units first. Nothing written to Chroma.
R2. Pilot: run_corpus_batch_index --max-units 5 --max-minutes 15 (include ≥ 2 reuse units and ≥ 2 fresh units if the queue allows). Then rerun --status, and confirm a rerun would continue with the NEXT units (dry-run again; no repeats).
R3. Wrapper smoke: bash knowledge_engine/scripts/overnight_index.sh start --max-batches 1 --batch-units 3 --batch-minutes 5 --allow-battery, then `status`; when it finishes, `report`, and check that the morning report exists and the locks are released.
R4. Stop test: start again with --max-batches 1 --batch-units 2 --batch-minutes 5 --allow-battery, then `stop` within ~20 s; verify stop_reason stop_requested, no unit left in "processing", locks released, a report written.
After R1–R4: the manifest shows ≤ 10 done/failed units in total; bis_corpus_v3 exists ONLY under <VDB>/corpus/bis_corpus_v3/chroma; the protected fingerprint is OK.

=====================================================================
VERIFY (run from the repo root and show the output)
=====================================================================
0. Baseline before any change, and again at the end:
for t in knowledge_engine/scripts/test_*.py; do m=$(basename "$t" .py); knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.$m >/tmp/kt_$m.log 2>&1 && echo "PASS $m" || echo "FAIL $m"; done
(At the end this includes the new modules: test_corpus_progress, test_chunk_clause_regex, test_chunk_embedding_view, test_similarity_metric, test_corpus_batch_index, test_overnight_index; all must PASS.)
1. knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.report_corpus_progress
2. knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_reliability_eval (before + after: 34/35, 16/16, leaks 0)
3. knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_pilot_eval (before + after: 6/6, 3/3)
4. bash -n knowledge_engine/scripts/overnight_index.sh
5. R1–R4 above.
6. git status --short (show it; nothing committed; no files outside knowledge_engine/ and docs/audits/ changed; no .env touched).

=====================================================================
FINISH
=====================================================================
- Update docs/audits/vector-db-preaudit.md: VDB-30, VDB-36 → Done; VDB-07a/08/09/15/29 and VDB-32/33/34 → Done or Partial with commands and results; append a VDB-10 log line "2026-10-08: pilot ≤10 units into bis_corpus_v3; overnight runner ready". Add one line per part to knowledge_engine/CHANGELOG.md.
- Report: files changed; the test PASS list (before/after); eval numbers before/after; the dry-run plan (tier counts); the pilot + smoke + stop-test results (units, s/page, usable chunks); the progress table.
- Print the exact one-line night command, exactly in this form:
  cd "/Users/amitkumar/Documents/Softwares/Consultancy Management" && bash knowledge_engine/scripts/overnight_index.sh start
  plus the status / stop / report / log commands.
- Last line: "OVERNIGHT: READY" or "OVERNIGHT: NOT READY: <reason>".
- Don't commit.
```

---

## 2. यह prompt क्या करेगा (आसान हिंदी में)

**क्या करेगा:** एक ही Cursor session में चार काम होंगे:
- **A (V0):** Tracker file `docs/audits/vector-db-preaudit.md` में जहाँ अभी "Reserved" लिखा है, वहाँ हर item (VDB-03 से VDB-36) की पूरी जानकारी भर दी जाएगी। साथ में एक read-only script `report_corpus_progress` बनेगी, जो बताएगी कि OneDrive की 5,676 unique PDFs में से कितनी हो चुकी हैं।
- **B (V3):** Chunking सुधरेगी: "5 PACKING" जैसी headings ठीक से पकड़ में आएँगी, तारीखें और table के नंबर clause नहीं बनेंगे, लंबे chunks 120 tokens में बँटेंगे, और खराब OCR text needs_review में जाएगा। नए collection `bis_corpus_v3` का design (cosine metric) भी बनेगा। सारी जाँच सिर्फ़ scratch collection पर होगी।
- **C (V4):** एक indexer बनेगा, जो PDFs को छोटे-छोटे batches में नए collection `bis_corpus_v3` में डालेगा। हर PDF सिर्फ़ एक बार process होगी, duplicate copies दोबारा नहीं। बीच में रुके तो अगली बार वहीं से आगे चलेगा।
- **D (रात वाला runner):** एक script `overnight_index.sh` बनेगी। उसे रात में एक command से चलाना है, सुबह तक batches चलते रहेंगे और फिर अपने-आप रुक जाएँगे।

**कैसे करेगा:**
- Code बदलने से पहले Cursor सारे पुराने tests चलाएगा। कोई test पहले से fail हुआ तो वहीं रुककर आपको बताएगा।
- हर हिस्से के बाद tests चलेंगे। कोई fail हुआ, या pilot batch में कुछ गलत दिखा, तो Cursor आगे नहीं बढ़ेगा, रुककर report देगा (STOP rule)।
- इस session में असली indexing सिर्फ़ **10 PDFs** तक होगी: 5 का pilot, 3 का smoke test और 2 का stop test। यह सब सिर्फ़ नए `bis_corpus_v3` में जाएगा।
- अंत में Cursor एक line लिखेगा: **"OVERNIGHT: READY"** या "NOT READY + कारण"। READY आए, तभी रात का command चलाइए।

**क्या बदलेगा:**
- सिर्फ़ `knowledge_engine/` की नई और कुछ बदली हुई files, tracker, README और CHANGELOG।
- चालू search (v1), v2, आपका app, `.env`, Railway और OneDrive की PDFs में कुछ नहीं बदलेगा। Commit भी नहीं होगा।
- Vector DB folder में एक नया अलग folder `corpus/bis_corpus_v3` बनेगा, जिसमें manifest, reports और logs रहेंगे।

---

## 3. रात का command

Cursor के "OVERNIGHT: READY" बोलने के बाद ही चलाइए। सोने से पहले: Mac charger पर लगा हो, MacBook हो तो lid खुला रहे, और shut down या log out मत कीजिए। Command macOS के Terminal app में चलाना सबसे अच्छा है, पर Cursor का terminal बंद करने पर भी यह चलता रहेगा।

**शुरू करना (सोने से पहले, एक line):**
```bash
cd "/Users/amitkumar/Documents/Softwares/Consultancy Management" && bash knowledge_engine/scripts/overnight_index.sh start
```
→ पहले खुद की जाँच (tests, disk, charger, model) करेगा, "PREFLIGHT OK" दिखाएगा, फिर background में सुबह 7 बजे तक (या ज़्यादा से ज़्यादा 9 घंटे) batches चलाएगा।

**अपना समय देना हो (optional):**
```bash
cd "/Users/amitkumar/Documents/Softwares/Consultancy Management" && bash knowledge_engine/scripts/overnight_index.sh start --until 06:30
```
→ यह सुबह 6:30 पर अपने-आप रुक जाएगा।

**चल रहा है या नहीं / progress देखना:**
```bash
cd "/Users/amitkumar/Documents/Softwares/Consultancy Management" && bash knowledge_engine/scripts/overnight_index.sh status
```
→ दिखाएगा कि run चल रहा है या नहीं, कौन सा batch है, आज कितनी PDFs हुईं और कुल कितने % हो गया।

**Log देखना:**
```bash
tail -f ~/Library/Logs/ConsultancyPro/knowledge-overnight.log
```
→ Live log दिखेगा। Ctrl+C सिर्फ़ देखना बंद करता है, indexing चलती रहती है।

**बीच में रोकना (सुरक्षित):**
```bash
cd "/Users/amitkumar/Documents/Softwares/Consultancy Management" && bash knowledge_engine/scripts/overnight_index.sh stop
```
→ अभी वाली PDF को बीच में छोड़कर 1–3 मिनट में साफ़ तरीके से रुक जाएगा। वो PDF अगली रात फिर से होगी, कुछ खराब नहीं होगा।

**सुबह की report:**
```bash
cd "/Users/amitkumar/Documents/Softwares/Consultancy Management" && bash knowledge_engine/scripts/overnight_index.sh report
```
→ रात भर का हिसाब दिखाएगा: कितनी PDFs हुईं, कुल %, कौन सी fail हुईं, क्यों रुका, और कितनी रातें बाकी हैं।

**पूरी progress table (optional):**
```bash
cd "/Users/amitkumar/Documents/Softwares/Consultancy Management" && knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.report_corpus_progress
```
→ पूरी corpus की table दिखाएगा: हर चरण और category के हिसाब से कितना हो चुका है।

अगली रात भी वही `start` command चलाइए। यह अपने-आप वहीं से आगे शुरू होगा। 2–3 रातों में पूरा हो जाना चाहिए; पहली रात में लगभग 30–60% की उम्मीद है।

---

## 4. सुबह क्या देखना है

1. `report` चलाइए। **Stop reason** `deadline` या `queue_empty` हो तो सब ठीक है। `consecutive_failures`, `disk_low`, `preflight_failed` या `error` हो तो report मुझे यहाँ paste कीजिए।
2. **आज रात कितनी PDFs हुईं** और **कुल % (5,676 में से)** देखिए। पहली रात में 30–60% के आस-पास होना चाहिए।
3. **Failed list:** 1–5 PDFs fail होना सामान्य है (जैसे IS 15575 Part 1 वाली खराब file)। 10 से ज़्यादा हों तो paste कीजिए।
4. **skipped_cloud_only** लगभग 2 होनी चाहिए (IS 17633 और IS 1659)। ये files सिर्फ़ cloud पर हैं और जानबूझकर नहीं खोली गईं।
5. **"v1/v2 untouched: OK"** लिखा होना चाहिए। WARNING दिखे तो paste कीजिए।
6. `status` में **"not running"** दिखना चाहिए, यानी run खत्म हो गया और lock नहीं बचा।
7. **Free disk 20 GB से ऊपर** होनी चाहिए (अभी ~600 GB है, तो कोई चिंता नहीं)। v3 folder हर रात लगभग 1 GB बढ़ेगा।
8. App की चालू knowledge search पहले जैसी ही चलनी चाहिए (वो अभी भी पुराना v1 इस्तेमाल करती है)।
9. Report यहाँ paste कर दीजिए। मैं बताऊँगा कि अगली रात चलानी है या कुछ ठीक करना है, और कब V1, V2 और V6 (search fix + नया data serve करना) करें।
