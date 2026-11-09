# Standards Index (Mac → App)

The text of every IS Standard, Amendment and Product Manual, page by page, with OCR for scanned pages. AI document
checks (AI Conformity Check, and later the Required Tests list) read only the pages that matter from it, instead of
the first 100k characters of a Standard.

```
OneDrive: All Standards Databse/All Standards/IS Standards/IS 1786/...pdf
        │  update_index.py   (Mac: reads new / changed PDFs, OCR for scanned pages)
        ▼
~/standards_ocr/standards.db   (SQLite FTS index, stays on the Mac)
        │  sync_app.py       (only the changes, one transaction)
        ▼
App database: standard_docs + standard_pages  →  search_standard_pages() / standard_folders_for_is_code()
```

## When a Standard is revised or an Amendment comes

1. Put the PDF in its IS folder on OneDrive, as today:
   - New edition: in the IS folder (move the old one to `_Extra/Old Versions`).
   - Amendment: `_Extra/Amendments`, or with the edition in `Current Official Set - …`.
   - Product Manual: a name starting with `PM ` or containing "Product Manual".
   - Business papers (Invoice, Test Report, a product's sub-folder in `Master Documents`) are never indexed.
2. Update the index on the Mac:
   ```bash
   python3 deploy/standards-index/update_index.py --dry-run   # what changed
   python3 deploy/standards-index/update_index.py             # read the changes (OCR for scanned pages)
   ```
   A file whose date changed but whose text did not (OneDrive re-sync) only gets its date updated.
3. Bring the changes into the app:
   - **Local Host** (test copy): `python3 deploy/standards-index/sync_app.py`
   - **Live**: QE - Live Production, with the owner's OK. It copies `standards.db` to the server (rsync sends only
     the changed parts) and runs `sync_app.py` there against the live database:
     ```bash
     rsync -az ~/standards_ocr/standards.db ubuntu@<server>:/opt/qe/standards/standards.db
     ssh ubuntu@<server> 'cd /opt/qe/app && python3 deploy/standards-index/sync_app.py \
         --db /opt/qe/standards/standards.db \
         --psql "docker exec -i $(docker compose -f deploy/oracle/docker-compose.yml ps -q db) psql -U postgres -d postgres"'
     ```
   Only new, changed and removed files are sent, in one transaction: a failed sync changes nothing.
   The BSB download stamp on each page ("Free Standard provided by BIS via BSB Edge … to <buyer name> (<email>) <IP>")
   and any other email address are removed on the way, so no person's details reach the app or the AI.
   After a change to that cleaning, `sync_app.py --full` loads every file again.

## Size

About 94,000 pages (5,864 files), about 245 MB of text. In Postgres with the search index: 354 MB (measured on
Local Host after `VACUUM FULL`). A full reload (`--full`) needs about twice that until vacuum. The first load takes
about 7 minutes; later syncs send only the changed files. The nightly backup grows by the compressed size of the
text.

## Search

- `standard_folders_for_is_code(is_code_id)`: the index folders of an IS Code in the IS Code Master, most
  specific first. For example, `IS 302 Part 2 Sec 14`, then `IS 302 Part 2`, then `IS 302`.
- `search_standard_pages(folders, words, limit, kinds)`: the best-matching pages (any of the words). Standard text
  ranks first, then Amendment, Extra and Product Manual. The same page in two files is returned once. Old versions
  are left out unless asked for.
- Staff only (customers never); only the database owner (`sync_app.py`) writes.
