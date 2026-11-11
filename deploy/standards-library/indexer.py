#!/usr/bin/env python3
"""Standards Library indexer: reads the owner's "Oracle Database" folder (category folders with one PDF per Standard,
Part and Section) and keeps the app's standards index (standard_docs / standard_pages, source 'library') equal to it.

Only what changed since the last run is read again:
  - same size and date as indexed            -> unchanged
  - other date, same sha256                  -> date updated only
  - new path, sha256 of a file that is gone  -> moved (category / name updated, pages kept)
  - otherwise                                -> read: text page by page, OCR for scanned pages, BSB stamp removed
  - indexed but no longer in the folder      -> removed from the index
Every file is written in its own transaction, so a run that stops keeps what it finished; the next run goes on.
Two runs never overlap (database lock). Each run is logged in standard_index_runs.

Runs in its container (deploy/standards-library/Dockerfile): on the server after standards-sync.sh, on Local Host via
deploy/test-copy/tc.sh index-standards.

  indexer.py [--root /library] [--dry-run] [--workers N] [--only TEXT] [--limit N] [--trigger manual|weekly]
Needs migration 20261112100000_standards_library.sql. Database: DATABASE_URL or PGHOST / PGUSER / PGPASSWORD of a
database owner (postgres), never printed.
"""
import argparse
import concurrent.futures as cf
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time

import psycopg

BLANK_BELOW = 30  # characters: a page with less text than this is a picture (scanned) or empty
# A file's own row and its portfolio attachments' rows ("file.pdf::attachment.pdf").
OWN = "source = 'library' AND (relpath = %s OR starts_with(relpath, %s))"
ROOT_DIR = "/library"
LOCK_KEY = 7_204_311  # pg advisory lock: one indexer run at a time
AMENDMENT_NAME = re.compile(r"(?i)(^|[\s_.-])amd[\s_.-]*\d|amendment")
SET_DIR = re.compile(r"(?i)^current official set\b")
# "IS 10124 Part 1 2009 - 02.pdf": number, Part, Sec, edition year, amendments merged into the file.
STRICT_NAME = re.compile(r"^(?:IS |ISO |IS ISO |ISO-IEC |IS ISO-IEC )\d+(?: Part \d+[A-Z]?)?(?: Sec \d+[A-Z]?)? (?:19|20)\d{2} - \d{2}$")
NUMBER = re.compile(
    r"^(?P<pre>IS[\s_/]+(?:ISO|IEC)(?:[\s_/-]+IEC)?|IS|ISO(?:[\s_/-]+IEC)?|IEC)[\s_/-]*(?P<num>\d+)(?P<rest>.*)$", re.I
)
LIST_FILE = "Standards List.xlsx"  # at the root of the library: the IS numbers that should have a file

# BSB download stamp on every page: "Free Standard provided by BIS via BSB Edge Private Limited to <buyer name>
# (<email>) <IP> [for non-commercial use only]." It names a person and adds nothing to the requirements: removed.
# (Same cleaning as deploy/standards-index/sync_app.py.)
BSB_STAMP = re.compile(
    r"Free\s+(?:Standard|amendment|\w+)?\s*provided\s+by\s+BIS\s+via\s+BSB\s+Edge\s+Private\s+Limited\s+to\s+.{0,240}?"
    r"(?:\)\s*(?:\d{1,3}(?:\.\d{1,3}){3})?|\d{1,3}(?:\.\d{1,3}){3}|$)(?:\s*\[for\s+non-commercial\s+use\s+only\])?\.?",
    re.I | re.S,
)
BSB_STAMP_LINE = re.compile(
    r"[^\n]{0,40}via\s+BSB\s+Edge\s+Private\s+Limited\s+to[^\n]{0,160}(?:-[ \t]*\n[^\n]{0,160})?", re.I
)
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
IPV4 = re.compile(r"(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.]?\d)")


def drop_ips(part):
    """IP addresses of a garbled stamp (an octet of 100+, none above 255): clause numbers like 9.1.2.1 stay."""
    def keep_or_drop(m):
        octets = [int(x) for x in m.groups()]
        return "" if 100 <= max(octets) <= 255 else m.group(0)
    return IPV4.sub(keep_or_drop, part)


def clean_text(text):
    stamped = "BSB Edge" in (text or "")
    text = BSB_STAMP_LINE.sub(" ", BSB_STAMP.sub(" ", text or ""))
    if stamped:  # the stamp sits at the top or bottom of the page
        text = drop_ips(text[:600]) + text[600:-600] + drop_ips(text[-600:]) if len(text) > 1200 else drop_ips(text)
    text = EMAIL.sub(lambda m: m.group(0) if m.group(0).lower().endswith(("bis.gov.in", "bis.org.in")) else "", text)
    return text.replace("\x00", "")


# ---------------------------------------------------------------- names

def number_of(m):
    """'IS 2062', 'ISO-IEC 17025' from a NUMBER match. An Indian adoption (IS/ISO 7240, IS/IEC 60947) is filed under
    its IS number ('IS 7240'), as the IS Code Master and the owner's file names write it."""
    pre = re.sub(r"[\s_/-]+", " ", m.group("pre").upper()).replace("ISO IEC", "ISO-IEC")
    if pre.startswith("IS "):
        pre = "IS"
    return f"{pre} {int(m.group('num'))}"


def read_list(root):
    """Rows of Standards List.xlsx (S.No, IS Number, IS Title, Standard type, Technical Committee, Department, PM)."""
    path = os.path.join(root, LIST_FILE)
    if not os.path.isfile(path):
        return None
    import openpyxl

    rows = []
    sheet = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
    for i, r in enumerate(sheet.iter_rows(values_only=True)):
        r = [("" if c is None else str(c).strip()) for c in (list(r) + [None] * 7)[:7]]
        if i == 0 or not r[1]:
            continue
        m = NUMBER.match(r[1])
        rows.append((int(r[0]) if r[0].isdigit() else None, r[1], number_of(m) if m else r[1],
                     r[2] or None, r[3] or None, r[4] or None, r[5] or None, r[6] or None))
    return rows


def write_list(conn, rows):
    with conn.transaction():
        conn.execute("DELETE FROM public.standard_list")
        with conn.cursor().copy(
            "COPY public.standard_list (row_no, is_number, base, title, standard_type, committee, department, pm_ref) FROM STDIN"
        ) as cp:
            for row in rows:
                cp.write_row(row)


def describe(rel):
    """What a library path is: number (folder in the index), kind, edition year, merged amendments, review note."""
    parts = rel.split("/")
    name = parts[-1]
    stem = re.sub(r"(?i)\.pdf$", "", name)
    in_set = len(parts) > 2 and SET_DIR.match(parts[-2] or "")
    m = NUMBER.match(stem.strip())
    if not m and in_set:  # a set file without a number: the set folder's number
        m = NUMBER.match(re.sub(SET_DIR, "", parts[-2]).strip(" -"))
    review = []
    if m:
        base = number_of(m)
        rest = re.sub(r"[_]+", " ", m.group("rest"))
    else:
        base, rest = stem, ""
        review.append("Name Not Understood (No IS Number)")
    year = re.search(r"\b((?:19|20)\d{2})\b", rest)
    merged = re.search(r"-\s*(\d{2})\s*$", stem)
    if re.match(r"(?i)^pm[\s_-]", name) or re.search(r"(?i)product[\s_-]*man[ua]+l", name):
        kind = "Product Manual"
    elif AMENDMENT_NAME.search(stem):
        kind = "Amendment"
    else:
        kind = "Standard"
    if kind == "Standard" and not in_set and m and not STRICT_NAME.match(stem):
        review.append("Name Not in the Form 'IS N [Part P] [Sec S] YYYY - AA'")
    if len(parts) < 2:
        review.append("Not in a Category Folder")
    return {
        "folder": base,
        "category": parts[0] if len(parts) > 1 else None,
        "kind": kind,
        "edition_year": int(year.group(1)) if year else None,
        "amendments_merged": int(merged.group(1)) if merged and kind == "Standard" and not in_set else None,
        "review": review,
    }


def scan(root):
    """{relpath: (full path, bytes, mtime)} of every PDF under the root (hidden files and Office lock files left out)."""
    found = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith((".", "~$")))
        for f in sorted(filenames):
            if f.startswith((".", "~$")) or not f.lower().endswith(".pdf"):
                continue
            full = os.path.join(dirpath, f)
            st = os.stat(full)
            found[os.path.relpath(full, root).replace(os.sep, "/")] = (full, st.st_size, st.st_mtime)
    return found


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------- reading a PDF

def run(cmd, timeout=180, env=None):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)


def page_count(pdf):
    m = re.search(r"^Pages:\s+(\d+)", run(["pdfinfo", pdf], 60).stdout, re.M)
    return int(m.group(1)) if m else 0


def why_unreadable(pdf):
    """Review note for a PDF of which no page could be read."""
    err = run(["pdfinfo", pdf], 60).stderr
    if "security handler" in err:  # FileOpen (FOPN_foweb) and other DRM: no tool can open it
        return "Locked by DRM (FileOpen): Add an Unlocked Copy"
    return "No Pages Read (Damaged or Password-Protected PDF)"


def page_texts(pdf):
    n = page_count(pdf)
    if not n:
        return []
    out = run(["pdftotext", "-enc", "UTF-8", pdf, "-"], 600).stdout
    texts = [t.strip() for t in out.split("\f")]
    return (texts + [""] * n)[:n]


def ocr_page(pdf, page):
    with tempfile.TemporaryDirectory() as td:
        run(["pdftoppm", "-r", os.environ.get("OCR_DPI", "200"), "-f", str(page), "-l", str(page), "-png", pdf, td + "/pg"], 120)
        imgs = glob.glob(td + "/pg*.png")
        if not imgs:
            return ""
        env = dict(os.environ, OMP_THREAD_LIMIT="1")
        return run(["tesseract", imgs[0], "-", "-l", "eng", "--psm", "3"], 180, env).stdout


def read_pdf(pdf):
    """[(page no., text, ocr?)] of a PDF; scanned pages OCR'd."""
    pages = []
    for i, text in enumerate(page_texts(pdf), start=1):
        ocr = False
        if len(text) < BLANK_BELOW:
            t = ocr_page(pdf, i).strip()
            if len(t) > len(text):
                text, ocr = t, True
        pages.append((i, clean_text(text), ocr))
    return pages


def read_file(full):
    """The file's own pages, plus each PDF portfolio attachment as [(suffix '::name.pdf', pages)]."""
    docs = [("", read_pdf(full))]
    listing = run(["pdfdetach", "-list", full], 60).stdout
    names = [m.group(1).strip() for m in re.finditer(r"^\s*\d+:\s+(.+)$", listing, re.M)]
    if any(n.lower().endswith(".pdf") for n in names):
        with tempfile.TemporaryDirectory() as td:
            run(["pdfdetach", "-saveall", "-o", td, full], 120)
            for n in names:
                p = os.path.join(td, os.path.basename(n))
                if n.lower().endswith(".pdf") and os.path.exists(p):
                    docs.append(("::" + os.path.basename(n), read_pdf(p)))
    return docs


# ---------------------------------------------------------------- database

def write_file(conn, rel, info, size, mtime, sha, docs):
    """Replace the file's documents (and its attachments') in one transaction."""
    with conn.transaction():
        conn.execute(f"DELETE FROM public.standard_docs WHERE {OWN}", (rel, rel + "::"))
        for suffix, pages in docs:
            review = list(info["review"])
            if not pages:
                review.append(why_unreadable(os.path.join(ROOT_DIR, rel)) if not suffix else "No Pages Read (Damaged or Protected PDF)")
            elif sum(len(t) for _, t, _ in pages) < 20 * len(pages):
                review.append("Almost No Text, Even After OCR")
            kind = "Amendment" if suffix and AMENDMENT_NAME.search(suffix) else info["kind"]
            row = conn.execute(
                """INSERT INTO public.standard_docs
                   (folder, base, relpath, kind, pages, mtime, synced_at, category, source, active, sha256, bytes,
                    edition_year, amendments_merged, ocr_pages, review)
                   VALUES (%s, %s, %s, %s, %s, %s, now(), %s, 'library', true, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (info["folder"], info["folder"], rel + suffix, kind, len(pages), mtime, info["category"], sha, size,
                 info["edition_year"], info["amendments_merged"], sum(1 for p in pages if p[2]),
                 "; ".join(review) or None),
            ).fetchone()
            with conn.cursor().copy("COPY public.standard_pages (doc_id, page, text) FROM STDIN") as cp:
                for no, text, _ in pages:
                    cp.write_row((row[0], no, text))


def summary(conn):
    rows = conn.execute(
        """SELECT coalesce(category, '(none)'), count(*) FILTER (WHERE relpath NOT LIKE '%%::%%'), coalesce(sum(pages), 0),
                  coalesce(sum(ocr_pages), 0), count(*) FILTER (WHERE review IS NOT NULL)
           FROM public.standard_docs WHERE source = 'library' GROUP BY 1 ORDER BY 1"""
    ).fetchall()
    return {c: {"files": f, "pages": int(p), "ocr_pages": int(o), "review": r} for c, f, p, o, r in rows}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=os.environ.get("LIBRARY_ROOT", "/library"))
    ap.add_argument("--dry-run", action="store_true", help="only count what would change")
    ap.add_argument("--workers", type=int, default=int(os.environ.get("INDEXER_WORKERS", "1")))
    ap.add_argument("--only", help="only paths containing this text (a test run)")
    ap.add_argument("--limit", type=int, help="read at most this many new / changed files in this run")
    ap.add_argument("--trigger", default=os.environ.get("INDEX_TRIGGER", "manual"))
    ap.add_argument("--host", default=os.environ.get("INDEX_HOST", ""))
    args = ap.parse_args()

    global ROOT_DIR
    root = ROOT_DIR = args.root.rstrip("/")
    if not os.path.isdir(root):
        sys.exit(f"STOP: library folder not found: {root}")
    found = scan(root)
    if args.only:
        found = {k: v for k, v in found.items() if args.only.lower() in k.lower()}
    if not found and not args.only:
        sys.exit("STOP: the library folder has no PDFs (is it mounted / synced?). Nothing removed.")

    conn = psycopg.connect(os.environ.get("DATABASE_URL", ""), autocommit=True)  # or PGHOST / PGUSER / PGPASSWORD
    if not conn.execute("SELECT pg_try_advisory_lock(%s)", (LOCK_KEY,)).fetchone()[0]:
        sys.exit("STOP: another indexer run is still working.")

    indexed = {}
    for rel, size, mtime, sha in conn.execute(
        "SELECT relpath, bytes, mtime, sha256 FROM public.standard_docs WHERE source = 'library' AND relpath NOT LIKE '%::%'"
    ):
        if not args.only or args.only.lower() in rel.lower():
            indexed[rel] = (size, mtime, sha)

    unchanged, touched, to_read = [], [], []
    for rel, (full, size, mtime) in found.items():
        old = indexed.get(rel)
        if old and old[0] == size and abs((old[1] or 0) - mtime) < 1:
            unchanged.append(rel)
        else:
            to_read.append(rel)
    gone = [rel for rel in indexed if rel not in found]

    # sha256 of the files to read: an unchanged text (date only) or a move keeps its pages.
    gone_by_sha = {indexed[r][2]: r for r in gone if indexed[r][2]}
    sha_of, moves, reads = {}, [], []
    for rel in to_read:
        old = indexed.get(rel)
        if not old and not gone_by_sha:
            reads.append(rel)  # a new file and nothing removed: no move possible, hashed while it is read
            continue
        sha_of[rel] = sha256_of(found[rel][0])
        if old and old[2] == sha_of[rel]:
            touched.append(rel)
        elif rel not in indexed and sha_of[rel] in gone_by_sha:
            moves.append((gone_by_sha.pop(sha_of[rel]), rel))
        else:
            reads.append(rel)
    moved_from = {a for a, _ in moves}
    removed = [r for r in gone if r not in moved_from]
    if args.limit is not None:
        reads = reads[: args.limit]

    print(f"Library: {len(found)} PDFs | unchanged {len(unchanged)} | date only {len(touched)} | moved {len(moves)} | "
          f"to read {len(reads)} | removed {len(removed)}")
    if args.dry_run:
        for rel in reads[:30]:
            print("  read:", rel)
        for a, b in moves[:30]:
            print("  move:", a, "->", b)
        for rel in removed[:30]:
            print("  remove:", rel)
        return

    run_id = conn.execute(
        "INSERT INTO public.standard_index_runs (host, trigger, files) VALUES (%s, %s, %s) RETURNING id",
        (args.host, args.trigger, len(found)),
    ).fetchone()[0]
    errors, pages_read, ocr_read, added, changed = [], 0, 0, 0, 0
    status = "done"
    try:
        for rel in touched:
            conn.execute(f"UPDATE public.standard_docs SET mtime = %s WHERE {OWN}", (found[rel][2], rel, rel + "::"))
        for a, b in moves:
            info = describe(b)
            with conn.transaction():
                for (rp,) in conn.execute(f"SELECT relpath FROM public.standard_docs WHERE {OWN}", (a, a + "::")).fetchall():
                    conn.execute(
                        """UPDATE public.standard_docs SET relpath = %s, folder = %s, base = %s, category = %s, mtime = %s,
                           edition_year = %s, amendments_merged = %s, synced_at = now() WHERE source = 'library' AND relpath = %s""",
                        (b + rp[len(a):], info["folder"], info["folder"], info["category"], found[b][2],
                         info["edition_year"], info["amendments_merged"], rp),
                    )
        for rel in removed:
            conn.execute(f"DELETE FROM public.standard_docs WHERE {OWN}", (rel, rel + "::"))
        if not args.only:
            try:
                listed = read_list(root)
                if listed is not None:
                    write_list(conn, listed)
                    print(f"Standards List: {len(listed)} IS numbers")
            except Exception as e:  # the list is extra: a bad workbook never stops the index
                errors.append({"file": LIST_FILE, "error": str(e)[:300]})

        started = time.time()
        with cf.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            def job(rel):
                full = found[rel][0]
                return sha_of.get(rel) or sha256_of(full), read_file(full)

            futures = {pool.submit(job, rel): rel for rel in reads}
            for i, fut in enumerate(cf.as_completed(futures), start=1):
                rel = futures[fut]
                try:
                    sha, docs = fut.result()
                    write_file(conn, rel, describe(rel), found[rel][1], found[rel][2], sha, docs)
                    if rel in indexed:
                        changed += 1
                    else:
                        added += 1
                    pages_read += sum(len(p) for _, p in docs)
                    ocr_read += sum(1 for _, p in docs for x in p if x[2])
                except Exception as e:  # one bad file never stops the run
                    errors.append({"file": rel, "error": str(e)[:300]})
                if i % 25 == 0 or i == len(reads):
                    mins = (time.time() - started) / 60
                    print(f"  {i}/{len(reads)} files, {pages_read} pages ({ocr_read} OCR), {mins:.1f} min", flush=True)
                    conn.execute(
                        "UPDATE public.standard_index_runs SET added = %s, changed = %s, pages = %s, ocr_pages = %s WHERE id = %s",
                        (added, changed, pages_read, ocr_read, run_id),
                    )
    except KeyboardInterrupt:
        status = "stopped"
    except Exception as e:
        status = "failed"
        errors.append({"file": "", "error": str(e)[:300]})
    # The owner's decision (11 Nov 2026): the old Mac index goes once the library is indexed. A complete run
    # (whole folder, no --only / --limit, finished) removes it; until then its rows only answer for numbers the
    # library does not have.
    if status == "done" and not args.only and args.limit is None:
        hidden = conn.execute("DELETE FROM public.standard_docs WHERE source = 'mac'").rowcount
        note = f"old index rows removed: {hidden}"
    else:
        hidden = conn.execute("SELECT public.standard_library_refresh_active()").fetchone()[0]
        note = f"old index rows switched: {hidden}"
    conn.execute(
        """UPDATE public.standard_index_runs SET finished_at = now(), status = %s, added = %s, changed = %s, moved = %s,
           removed = %s, unchanged = %s, pages = %s, ocr_pages = %s, categories = %s, errors = %s, message = %s WHERE id = %s""",
        (status, added, changed, len(moves), len(removed), len(unchanged) + len(touched), pages_read, ocr_read,
         json.dumps(summary(conn)), json.dumps(errors), note, run_id),
    )
    print(f"{status}: added {added}, changed {changed}, moved {len(moves)}, removed {len(removed)}, "
          f"{pages_read} pages ({ocr_read} OCR), {len(errors)} errors; {note}")
    for e in errors[:20]:
        print("  error:", e["file"], e["error"])
    if status != "done":
        sys.exit(1)


if __name__ == "__main__":
    main()
