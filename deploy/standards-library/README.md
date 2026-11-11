# Standards Library (Oracle Database folder → App)

The owner's folder on the Mac is the master:
`~/Library/CloudStorage/OneDrive-Personal/Documents/All Standards Databse/Oracle Database/`.
Every PDF in it is indexed page by page into the app's `standard_docs` / `standard_pages` (the tables the AI
Conformity Check and Required Tests read), with OCR for scanned pages. It replaces the old Mac index
(`deploy/standards-index`), which stays only as a fallback (see "The old index").

```
Mac: Oracle Database folder
   │  standards-sync.sh server      (manual, any time)  +  every Sunday 10 pm (launchd)
   │  rsync, one way. A file deleted or replaced on the Mac is kept in /opt/qe/standards/removed/<date>/
   ▼
Server: /opt/qe/standards/library
   │  standards-indexer container (docker compose --profile tools), right after the copy
   ▼
standard_docs + standard_pages (+ standard_index_runs: one row per run)
```

## The folder

- One category folder per kind of standard: `Product Specification`, `Test Method`, `Code of Practice`,
  `Dimension & Tolerances`, … A new category folder is picked up as it is (the category = the folder name).
- One file per Standard / Part / Section: `IS 10124 Part 1 2009 - 02.pdf` = IS number, Part, Sec, edition year,
  `- 02` = amendments already merged into the file.
- `Current Official Set - IS N YYYY - …/` folders: the base standard plus its separate amendment files
  (`…Amd1…` in the name → kind Amendment).
- A name starting with `PM ` or containing "Product Manual" → kind Product Manual.
- Names that do not follow the pattern are indexed anyway and put on the review list (`standard_docs.review`).

In the index, every file of one IS number has the folder `IS 2062` (`base` too); the checks pick the Part,
Section and edition year from the file name, as before.

## After adding or replacing PDFs

```bash
deploy/standards-library/standards-sync.sh server --dry-run   # what would be copied / read / removed
deploy/standards-library/standards-sync.sh server             # copy + index on the server
```

Only new and changed files are read (size + date, then sha256: a file whose date changed but whose content did
not keeps its pages; a moved or renamed file is found again by its checksum). Text pages take seconds, scanned
pages about 5 s each. The run stops without copying anything when the folder looks empty (OneDrive not ready) or
when more than 50 PDFs and 10 % of the library would be removed at once (`--allow-many-removals` when meant).

**Local Host** (test copy): `deploy/test-copy/tc.sh index-standards [--dry-run | --only "IS 2062 "]`. It first
copies the folder to `~/qe-standards/library` (Docker never reads the OneDrive folder itself: the VM stalls on
File Provider paths) and indexes that copy with 4 workers.

## The weekly run

```bash
deploy/standards-library/standards-sync.sh install-schedule   # every Sunday 10 pm; log ~/Library/Logs/qe-standards/sync.log
deploy/standards-library/standards-sync.sh remove-schedule
```

The schedule runs a copy of the script in `~/qe-standards/`. A Mac that is asleep at 10 pm runs it at the next
wake. The first scheduled run may ask macOS for access to the OneDrive folder: allow it. When nothing changed
the run only compares and finishes in about a minute.

## The old index

Rows from the old index have `source = 'mac'`; the library's have `source = 'library'`. After each run the
indexer calls `standard_library_refresh_active()`: an old row is hidden (`active = false`, invisible to the app)
as soon as the library has the same IS number in the same group. The groups are Product Manuals, and everything
else. So IS 808 still answers from the old index until it is in the library, and an old Product Manual stays
until the library has one for that number. When the folder is complete, on the owner's word:

```sql
DELETE FROM public.standard_docs WHERE source = 'mac';
```

## Rules kept from the old tool

- `pdftotext` page by page; a page with under 30 characters is OCR'd (tesseract, 200 dpi). A file with almost no
  text even after OCR goes on the review list.
- PDF portfolio attachments are indexed as their own documents (`<file>::<attachment>.pdf`).
- The BSB download stamp (buyer name, email, IP) and every email address are removed before saving.
- Customers never see these tables (staff-only RLS); only the indexer (database owner) writes. Two runs never
  overlap (advisory lock).
