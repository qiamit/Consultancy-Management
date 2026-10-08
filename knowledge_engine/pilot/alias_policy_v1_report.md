# Second-pilot alias policy v1 — applied decisions (config only)

**Policy file:** `knowledge_engine/pilot/alias_policy_v1.json`  
**Selection file:** unchanged (`pilot_selection_v2_selected.json` still lists 150 path rows)  
**Live indexing:** not started (`applied_to_live_index: false`)  
**v1 collections:** read-only — not written/deleted

## Approved decisions

| Group | Decision | SHA-256 (full) | Paths |
|-------|----------|----------------|-------|
| g1 IS 3203 | **B** | `df1253c095b98504f09a881546ca3df2caeccc89ac2d0d873710eadf3dd33d39` | STD 14951 + STD 4246 |
| g2 IS 1500 Part 1 | **B** | `945be84ad87cde81e9adad0a5f1e0fc08c385b09ccf1d9836f5ba7d8e459ae50` | STD 18384 + 3443 + 617 |
| g3 IS 1956 AMD1 | **A** | `a51dc99b354112a14b9d635d3ce6de56b70cd5ca4cf44a6eccab4d933539384c` | 6 filename variants under STD 1956 |
| g4 IS 4367 AMD1 | **A** | `7c4b2a53da3ceecde289ab477c0c3d9a61605a0c0c011fa7a6a626447f02ed74` | 2 variants under STD 4367 |
| g5 10951_Amd3 | **A** | `58c6073ef08e9e46d601aa0f92b8dcd60055d1ce07162d48237b26edcd9c3d17` | 2 variants; `is_number` stays null |
| g6 IS 1570 AMD1 | **A** | `40dea9b3b17ab4d38edee9e50551a874a4a1d674e65e1aec9389f0a4e94d439c` | 3 variants; **suspect/needs_review** forced |
| g7 IS 2074 AMD1 | **A** | `404e5a9672f5273dabbcc6da798bc0df9e68ac4419ee7282e2e0a23907826c4e` | 2 variants |

## v1 → v2 content mapping plan (no v1 mutation)

- **g1:** Two v1 path-keyed chunk sets (`doc_72ff1f7cb222`, `doc_69bd99162b87`) share bytes. v2 uses one content-hash identity `doc_df1253c095b9…`; reuse candidate = STD 14951 set; STD 4246 = alias only (no second upsert).
- **g2:** Reuse STD 18384 v1 set once; STD 3443 / 617 aliases share the same content chunk identity.
- **g3–g4:** Single v1 path evidence → one content reuse after hash match; remaining filenames are aliases.
- **g5–g7:** No v1 evidence; one new content identity per hash when indexing is later approved.

## Fail-closed gates

Missing policy file, path not in selection, hash/path mismatch, duplicate path/sha mapping, or verified-flag on heuristic `is_number` → `AliasPolicyError` (v2 pipeline/runner refuses).

## Not done in this stage

Indexing, OCR, extraction, embedding, Chroma access, API restart, selection overwrite, approval-gate removal.
