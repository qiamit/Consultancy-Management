#!/usr/bin/env python3
"""Bring the standards index (SQLite, from update_index.py) into the app's database (tables standard_docs and
standard_pages). Only what changed since the last sync is sent: new and changed files are loaded again, files no
longer in the index are removed. Everything happens in one transaction, so a failed sync changes nothing.

Usage:
  sync_app.py                        # Local Host test copy (docker container qe-test-db-1)
  sync_app.py --dry-run              # only count what would change
  sync_app.py --psql "<command>"     # any psql command that reads SQL from stdin, e.g. on the live server:
      --psql "docker exec -i <db container> psql -U postgres -d postgres"
Needs the standards_index migration (20261109110000) and the category migration (20261111100000) in that database.
A file whose category or kind changed but whose text did not (an IS folder moved into "1 Specifications" …) only gets
its row updated; its pages are not sent again.
"""
import argparse
import os
import re
import shlex
import sqlite3
import subprocess
import sys

DEFAULT_DB = os.path.expanduser("~/standards_ocr/standards.db")
DEFAULT_PSQL = "docker exec -i qe-test-db-1 psql -U postgres -d postgres"


# BSB download stamp on every page: "Free Standard provided by BIS via BSB Edge Private Limited to <buyer name>
# (<email>) <IP> [for non-commercial use only]." It names a person and adds nothing to the requirements: removed.
BSB_STAMP = re.compile(
    r"Free\s+(?:Standard|amendment|\w+)?\s*provided\s+by\s+BIS\s+via\s+BSB\s+Edge\s+Private\s+Limited\s+to\s+.{0,240}?"
    r"(?:\)\s*(?:\d{1,3}(?:\.\d{1,3}){3})?|\d{1,3}(?:\.\d{1,3}){3}|$)(?:\s*\[for\s+non-commercial\s+use\s+only\])?\.?",
    re.I | re.S,
)
# What is left of a stamp that OCR garbled or cut ("Fre$ provided by BIS via BSB Edge … to Raipur( …"): its line
# (and the next one when the name runs on after a dash).
BSB_STAMP_LINE = re.compile(
    r"[^\n]{0,40}via\s+BSB\s+Edge\s+Private\s+Limited\s+to[^\n]{0,160}(?:-[ \t]*\n[^\n]{0,160})?", re.I
)
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")


IPV4 = re.compile(r"(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.]?\d)")


def drop_ips(part):
    """IP addresses of a garbled stamp (an octet of 100+, none above 255): clause numbers like 9.1.2.1 stay."""
    def keep_or_drop(m):
        octets = [int(x) for x in m.groups()]
        return "" if max(octets) >= 100 and max(octets) <= 255 else m.group(0)
    return IPV4.sub(keep_or_drop, part)


def clean_text(text):
    stamped = "BSB Edge" in (text or "")
    text = BSB_STAMP_LINE.sub(" ", BSB_STAMP.sub(" ", text or ""))
    if stamped:  # the stamp sits at the top or bottom of the page
        text = drop_ips(text[:600]) + text[600:-600] + drop_ips(text[-600:]) if len(text) > 1200 else drop_ips(text)
    return EMAIL.sub(lambda m: m.group(0) if m.group(0).lower().endswith(("bis.gov.in", "bis.org.in")) else "", text)


def copy_value(v):
    if v is None:
        return r"\N"
    s = str(v).replace("\x00", "")
    return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def copy_row(*values):
    return "\t".join(copy_value(v) for v in values) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--psql", default=DEFAULT_PSQL)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--full", action="store_true", help="load every file again (after a change to clean_text)")
    a = ap.parse_args()
    psql = shlex.split(a.psql) + ["-v", "ON_ERROR_STOP=1", "-q", "-X"]

    got = subprocess.run(
        psql + ["-At", "-F", "\t", "-c", "select relpath, mtime, kind, coalesce(category, '') from public.standard_docs"],
        capture_output=True, text=True,
    )
    if got.returncode != 0:
        sys.exit("Could not read the app's standard_docs (are the standards_index and category migrations applied?):\n"
                 + got.stderr.strip())
    in_app = {}
    for line in got.stdout.splitlines():
        cols = line.split("\t")
        if len(cols) >= 4 and cols[0]:
            rel, mtime, kind, category = "\t".join(cols[:-3]), cols[-3], cols[-2], cols[-1]
            in_app[rel] = (int(round(float(mtime or 0))), kind, category or None)

    db = sqlite3.connect(a.db)
    have = {row[1] for row in db.execute("pragma table_info(docs)")}
    cat_col = "category" if "category" in have else "null"
    docs = {rel: (folder, kind, pages, int(round(mtime or 0)), category)
            for folder, rel, kind, pages, mtime, category in
            db.execute(f"select folder, relpath, kind, pages, mtime, {cat_col} from docs")}
    gone = sorted(r for r in in_app if r not in docs)
    new = sorted(r for r in docs if r not in in_app)
    changed = sorted(r for r in docs if r in in_app and (a.full or in_app[r][0] != docs[r][3]))
    # Same text, another category or kind (the file's IS folder was sorted into a category folder): row only.
    meta = sorted(r for r in docs if r in in_app and r not in changed
                  and (in_app[r][1] != docs[r][1] or in_app[r][2] != docs[r][4]))
    load = new + changed
    pages = sum(docs[r][2] or 0 for r in load)
    print(f"App has {len(in_app)} files, index has {len(docs)}. New {len(new)}, changed {len(changed)}, removed {len(gone)}, "
          f"category / kind only {len(meta)} ({pages} pages to load).")
    if a.dry_run or not (gone or load or meta):
        return

    proc = subprocess.Popen(psql, stdin=subprocess.PIPE, text=True, encoding="utf-8")
    w = proc.stdin.write
    w("BEGIN;\n")
    w("CREATE TEMP TABLE sync_del (relpath text) ON COMMIT DROP;\n")
    w("CREATE TEMP TABLE sync_docs (folder text, relpath text, kind text, pages integer, mtime double precision, category text) ON COMMIT DROP;\n")
    w("CREATE TEMP TABLE sync_meta (relpath text, kind text, category text) ON COMMIT DROP;\n")
    w("CREATE TEMP TABLE sync_pages (relpath text, page integer, text text) ON COMMIT DROP;\n")
    w("COPY sync_del FROM STDIN;\n")
    for r in gone + changed:
        w(copy_row(r))
    w("\\.\n")
    w("COPY sync_docs FROM STDIN;\n")
    for r in load:
        folder, kind, n, mtime, category = docs[r]
        w(copy_row(folder, r, kind, n or 0, mtime, category))
    w("\\.\n")
    w("COPY sync_meta FROM STDIN;\n")
    for r in meta:
        w(copy_row(r, docs[r][1], docs[r][4]))
    w("\\.\n")
    w("COPY sync_pages FROM STDIN;\n")
    for r in load:
        for page, text in db.execute("select page, text from pages where relpath = ? order by page", (r,)):
            w(copy_row(r, int(page), clean_text(text)))
    w("\\.\n")
    w("DELETE FROM public.standard_docs d USING sync_del x WHERE d.relpath = x.relpath;\n")
    w("INSERT INTO public.standard_docs (folder, relpath, kind, pages, mtime, category) "
      "SELECT folder, relpath, kind, pages, mtime, category FROM sync_docs;\n")
    w("UPDATE public.standard_docs d SET kind = m.kind, category = m.category FROM sync_meta m WHERE d.relpath = m.relpath;\n")
    w("INSERT INTO public.standard_pages (doc_id, page, text) "
      "SELECT d.id, s.page, s.text FROM sync_pages s JOIN public.standard_docs d ON d.relpath = s.relpath "
      "ON CONFLICT (doc_id, page) DO UPDATE SET text = excluded.text;\n")
    w("COMMIT;\n")
    w("ANALYZE public.standard_docs; ANALYZE public.standard_pages;\n")
    w("SELECT 'App now has ' || count(*) || ' files, ' || (SELECT count(*) FROM public.standard_pages) || ' pages.' "
      "FROM public.standard_docs;\n")
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("Sync failed: nothing was changed in the app (one transaction).")
    print("Sync done.")


if __name__ == "__main__":
    main()
