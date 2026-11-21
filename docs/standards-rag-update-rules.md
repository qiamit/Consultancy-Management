# Standards RAG — How New Standards, Revisions and Amendments Get In

Owner's decisions of 19 Nov 2026. These rules are fixed **before** the library is turned into the RAG layer, so
every chunk is built with the version facts from the start.

## One Way In
- The Mac "Oracle Database" folder stays the only master. Every change (new file, revision, amendment, deleted
  page) reaches the app only through `standards-sync.sh` (manual / Sunday 10 pm / Sync Now).
- Nothing is uploaded or edited in the app itself.

## Each Run Only Does What Changed
- A file is matched by sha256: unchanged → nothing done; moved / renamed → only its path and tags change; changed
  → its pages, chunks and embeddings are all rebuilt; deleted → its chunks go with it (file kept in `removed/`).
- Every chunk stores the sha256 of its file and the embedding model name. Changing the model = a full re-embed
  into a new column, switched over at once (search never mixes two models).

## Version Facts on Every Chunk
IS number, Part, Sec, edition year, kind (Standard / Amendment / Product Manual / Test Method …), amendment
number, status, and for an amendment the base edition it belongs to.

## New Revision (owner: keep the old one as Superseded)
- When a file with the same number + Part + Sec and a **later** edition year arrives, the older edition becomes
  `Superseded` automatically. It stays in the index and the RAG layer.
- Search, Required Tests and the Conformity Check use only the `Current` edition by default; a History switch
  shows superseded editions (old test reports, licences granted on the old edition).
- The owner removes an old edition only by deleting its file from the folder.

## Amendments (owner: separate files, linked to the base)
- Stay as `IS N YYYY Amd K.pdf` next to the base file; the indexer links each one to the base edition `IS N YYYY`.
- An amendment chunk that changes a clause or table ranks above the base clause it replaces, and the answer names
  both (e.g. "Table 1, as changed by Amd 2").
- When a merged file of that edition arrives (`- 02` = Amd 1 and 2 merged), Amd 1 and Amd 2 are marked `Included`
  and are no longer searched separately.
- An amendment of an edition that is superseded is superseded with it.

## Withdrawn (owner: Status column in Standards List.xlsx)
- `Standards List.xlsx` gets a **Status** column: `Current`, `Withdrawn`, or `Superseded by IS …`.
- Every sync reads it; a Withdrawn standard is left out of default search and shown with a Withdrawn tag.

## When a Standard Changes (owner: Review flag on Required Tests)
- When an IS Code's own Standard gets a new revision or amendment, its locked Required Tests list shows
  **"Standard Revised — Review"** with what changed (new edition / Amd K), until an admin reviews it.
  **Done 21 Nov 2026:** locking a list saves the library's basis (latest Current edition of the own folder + Part +
  Sec, and its amendment count: amendment files or the "- 0N" of a merged file, whichever is more) in
  `is_code_required_test_lists.standard_basis`; `required_tests_standard_check` compares it with the library now;
  the Required Tests window shows the red flag and an admin's **Mark Reviewed** (`mark_required_tests_standard_reviewed`)
  takes the library as it is now. Unlocking drops the basis. IS Code Master marks the Required Tests icon with a red dot.

## Order of Work
1. Version facts + status rules in the index (this document). **Done 20 Nov 2026:** `standard_docs.part`,
   `section`, `amendment_no`, `version_status` (Current / Superseded / Withdrawn / Included), `superseded_by`, worked
   out by `refresh_versions` on every sync; Standards List read by header (Status, Revision Year, Amendments,
   Reaffirmed Year into `standard_list`). Shown as tags in IS Files.
2. Clause / table chunks with these tags. **Done 20 Nov 2026:** `standard_chunks` (table = column layout from
   `pdftotext -layout`, clause = page text cut at clause headings, page = no heading), built by `build_chunks`
   (`CHUNKS_VERSION`), word search `search_standard_chunks`; Ask AI reads the tables from here.
3. pgvector embeddings in the same Postgres (incremental by sha256). **20 Nov 2026:** local BAAI/bge-small-en-v1.5
   (owner's choice: free, nothing leaves the server) — `standard_chunks.embedding` / `embed_model`, embedded by the
   indexer (`embed_chunks`, current Standards first, resumable); questions by the `standards-embed` service;
   `search_library_hybrid` merges word and meaning search (reciprocal rank).
4. Hybrid search (words + codes + meaning), Current-only by default. **Done 21 Nov 2026** (PRs #154–#164): Ask AI
   (Library + IS Files) uses `search_library_hybrid`; a folder search scans that folder exactly (HNSW + folder filter
   returned nothing).
5. App Search Window with Standard, page and clause in every answer. **Done:** Ask the Library and IS Files → Ask AI
   (PRs #146–#149, #154–#164). Outside the app: MCP `search_library` (PR #166) and the Library API for qirlpl.com
   with keys from Settings → API Keys (PR #168); ASTM / ISO / JIS / EN folders and Part filter (PR #172).
