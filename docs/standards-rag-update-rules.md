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

## Order of Work
1. Version facts + status rules in the index (this document).
2. Clause / table chunks with these tags.
3. pgvector embeddings in the same Postgres (incremental by sha256).
4. Hybrid search (words + codes + meaning), Current-only by default.
5. App Search Window with Standard, page and clause in every answer.
