#!/usr/bin/env python3
"""Keep the standards index (~/standards_ocr/standards.db) in step with the IS Standards folder on this Mac.

Run it after adding, replacing, moving or deleting PDFs (a new Standard, a revised edition, an Amendment, a Product
Manual, a folder sorted into a category): only the changed files are read again; scanned pages are read with OCR
(tesseract). Nothing leaves this Mac.

Usage:
  update_index.py --hash          # BEFORE moving files: record every indexed file's checksum (sha256) and size
  update_index.py --dry-run       # only list what would change, with counts per IS folder (and a CSV report)
  update_index.py                 # update the index
  update_index.py --ocr-only      # only finish OCR of scanned pages left over (budget reached earlier)
Options: --db PATH, --root PATH (the "IS Standards" folder), --no-ocr, --ocr-budget SECONDS, --report CSV

Layout. An IS folder ("IS 2062", "IS 302 Part 2 Sec 14") is found at any depth, so both layouts work:
  IS Standards/IS 2062/…                                   (old: IS folders in the root)
  IS Standards/1 Specifications/IS 2062/…                  (new: under a category folder)
  IS Standards/2 Test Methods/…, 3 General and Reference/…, _Review/…
The index keys a file by its path FROM THE IS FOLDER ("IS 2062/IS 2062 Part 1 2025 - 00.pdf"), so moving an IS
folder into a category folder changes nothing in the index or the app except its category; the real place on disk
is kept in disk_path. The category comes from the top folder: Specification / Test Method / General and Reference /
Review ("_Review"); none in the old layout.
A file whose path inside its IS folder changed (e.g. _Extra/Amendments/x.pdf -> Amendments/x.pdf, or a rename) is
recognised by its checksum (or, when it was never hashed, by name + size) and keeps its pages and OCR text: nothing is
read again. The Archive ("IS Standards Archive", next to the root) is never read; a folder of that name inside the
root is skipped too.

How a file's kind is decided (path inside its IS folder):
  <IS folder>/IS 1786 2008 - 00.pdf                        -> Standard
  PM IS 1786.pdf, "Product Manual" names (anywhere)        -> Product Manual
  Amendments/…  and  _Extra/Amendments/…                   -> Amendment
  _Extra/Old Versions/…                                    -> Old version
  Current Official Set - …/…                               -> Amendment when the name says Amd / Amendment, else Standard
  Master Documents/<file>                                  -> Amendment / Standard by name ("Amd", "Revised Standard",
                                                              a bare number like 14587_2023.pdf), else Extra (other)
  anything else under _Extra or a sub-folder               -> Extra (other)
Not indexed: files in a sub-folder of Master Documents (e.g. a product's Invoice Copy / Test Report) and any file
whose name says Invoice or Test Report: they are business papers, not standards.
A PDF portfolio (a PDF that only carries attached PDFs) is indexed as "file.pdf::attachment.pdf", one entry each.
A file whose date changed but whose text did not (OneDrive re-sync) only gets its date updated.
"""
import argparse
import collections
import csv
import glob
import hashlib
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time

DEFAULT_DB = os.path.expanduser("~/standards_ocr/standards.db")
DEFAULT_ROOT = os.path.expanduser(
    "~/Library/CloudStorage/OneDrive-Personal/Documents/All Standards Databse/All Standards/IS Standards"
)
DEFAULT_REPORT = os.path.expanduser("~/standards_ocr/update-report.csv")
BLANK_BELOW = 30  # characters: a page with less text than this is a picture (scanned) or empty

AMENDMENT_NAME = re.compile(r"(?i)(^|[\s_.-])amd[\s_.-]*\d|amendment")
IS_FOLDER = re.compile(r"^IS\s*[A-Z]{0,2}\s*\d")  # "IS 2062", "IS 302 Part 2 Sec 14", "IS B9020"
CATEGORY_DIRS = {
    "1 Specifications": "Specification",
    "2 Test Methods": "Test Method",
    "3 General and Reference": "General and Reference",
    "_Review": "Review",
}
ARCHIVE_DIR = re.compile(r"(?i)^IS Standards Archive$")


def kind_of(rel):
    """rel: path from the IS folder ("IS 1786/Amendments/x.pdf", or "x.pdf::attachment.pdf")."""
    base = rel.split("::", 1)[0]
    parts = base.split("/")
    name = parts[-1]
    path = "/" + base
    if "/_Extra/Amendments/" in path or (len(parts) > 2 and parts[1] == "Amendments"):
        return "Amendment"
    if "/_Extra/Old Versions/" in path:
        return "Old version"
    if re.match(r"(?i)^pm[\s_-]", name) or re.search(r"(?i)product[\s_-]*man[ua]+l", name):
        return "Product Manual"
    if len(parts) > 2 and parts[1].startswith("Current Official Set"):
        return "Amendment" if AMENDMENT_NAME.search(name) else "Standard"
    if len(parts) == 3 and parts[1] == "Master Documents":
        if AMENDMENT_NAME.search(name):
            return "Amendment"
        if re.search(r"(?i)revised\s*standard", name) or re.match(r"^\d{2,5}([\s_.-]|\.pdf$)", name):
            return "Standard"
        return "Extra (other)"
    if "/_Extra/" in path or len(parts) > 2:
        return "Extra (other)"
    return "Standard"


def skipped(rel):
    """Business papers kept beside the standards: never indexed (rel: path from the IS folder)."""
    parts = rel.split("/")
    if len(parts) > 3 and parts[1] == "Master Documents":
        return True
    return bool(re.search(r"(?i)invoice|test[\s_-]*reports?\b", parts[-1]))


def words(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def same_text(new_texts, old_texts):
    """True when a re-synced file has the same text (word sets 90 % alike on every page with text)."""
    if len(new_texts) != len(old_texts):
        return False
    for new, old in zip(new_texts, old_texts):
        if len(new) < BLANK_BELOW:
            continue  # scanned page: the stored text is the OCR read
        a, b = words(new), words(old)
        if len(a & b) / max(1, len(a | b)) < 0.9:
            return False
    return True


def run(cmd, timeout=180):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def page_count(pdf):
    out = run(["pdfinfo", pdf], 60).stdout
    m = re.search(r"^Pages:\s+(\d+)", out, re.M)
    return int(m.group(1)) if m else 0


def page_texts(pdf):
    """Selectable text of every page ('' for a page that is a picture)."""
    n = page_count(pdf)
    if not n:
        return []
    out = run(["pdftotext", "-enc", "UTF-8", pdf, "-"], 300).stdout
    texts = [t.replace("\x00", "").strip() for t in out.split("\f")]
    texts = (texts + [""] * n)[:n]
    return texts


def attachments(pdf):
    out = run(["pdfdetach", "-list", pdf], 60).stdout
    return [m.group(1).strip() for m in re.finditer(r"^\s*\d+:\s+(.+)$", out, re.M)]


def ocr_page(pdf, page):
    with tempfile.TemporaryDirectory() as td:
        run(["pdftoppm", "-r", os.environ.get("OCR_DPI", "200"), "-f", str(page), "-l", str(page), "-png", pdf, td + "/pg"], 90)
        imgs = glob.glob(td + "/pg*.png")
        if not imgs:
            return ""
        env = dict(os.environ, OMP_THREAD_LIMIT="1")
        return subprocess.run(["tesseract", imgs[0], "-", "-l", "eng"], capture_output=True, text=True, timeout=120, env=env).stdout


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_schema(db):
    """Columns added for the category layout and checksum reuse (old databases get them on first run)."""
    have = {row[1] for row in db.execute("pragma table_info(docs)")}
    for col, typ in (("sha256", "text"), ("bytes", "integer"), ("category", "text"), ("disk_path", "text")):
        if col not in have:
            db.execute(f"alter table docs add column {col} {typ}")
    db.execute("create index if not exists docs_sha256 on docs(sha256)")
    db.commit()


def scan(root):
    """{rel: (disk_path, mtime, category)} of every PDF inside an IS folder, at any depth under the root.

    rel is the path from the IS folder; disk_path the path from the root. Files outside an IS folder are ignored, and
    so is any "IS Standards Archive" folder. The same rel found twice (one IS folder under two category folders) is
    reported and only the first is kept."""
    found = {}
    clashes = []
    for dirpath, dirnames, files in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and not ARCHIVE_DIR.match(d))
        rel_dir = os.path.relpath(dirpath, root)
        segs = [] if rel_dir == "." else rel_dir.split(os.sep)
        is_at = next((i for i, s in enumerate(segs) if IS_FOLDER.match(s)), None)
        if is_at is None:
            continue
        category = CATEGORY_DIRS.get(segs[0]) if is_at > 0 else None
        for f in files:
            if f.startswith((".", "~$")) or not f.lower().endswith(".pdf"):
                continue
            rel = "/".join(segs[is_at:] + [f])
            if skipped(rel):
                continue
            disk = "/".join(segs + [f])
            if rel in found:
                clashes.append((rel, found[rel][0], disk))
                continue
            found[rel] = (disk, int(os.path.getmtime(os.path.join(root, disk))), category)
    return found, clashes


def remove(db, rel):
    like = rel.replace("%", r"\%").replace("_", r"\_") + "::%"
    db.execute("delete from pages where relpath = ? or relpath like ? escape '\\'", (rel, like))
    db.execute("delete from docs where relpath = ? or relpath like ? escape '\\'", (rel, like))


def rename(db, old, new, disk, category, mtime):
    """Carry a moved file's rows (and its portfolio attachments' rows) to its new path: pages and OCR text kept."""
    folder = new.split("/", 1)[0]
    rows = db.execute(
        "select relpath from docs where relpath = ? or relpath like ? escape '\\'",
        (old, old.replace("%", r"\%").replace("_", r"\_") + "::%"),
    ).fetchall()
    for (r,) in rows:
        nr = new + r[len(old):]
        kind = kind_of(nr)
        db.execute(
            "update docs set relpath = ?, folder = ?, kind = ?, category = ?, disk_path = ?, mtime = ? where relpath = ?",
            (nr, folder, kind, category, disk, float(mtime), r),
        )
        db.execute("update pages set relpath = ?, folder = ?, kind = ? where relpath = ?", (nr, folder, kind, r))


def index_file(db, rel, full, disk, category, mtime, ocr, deadline):
    """Index one PDF (or the PDFs attached to a portfolio). Returns (entries, pages, ocr_pages)."""
    texts = page_texts(full)
    entries = [(rel, full, texts, None)]
    if sum(len(t) for t in texts) < 200:
        names = [n for n in attachments(full) if n.lower().endswith(".pdf")]
        if names:
            td = tempfile.mkdtemp()
            run(["pdfdetach", "-saveall", "-o", td + "/", full], 180)
            entries = [(f"{rel}::{n}", os.path.join(td, n), None, td) for n in names if os.path.exists(os.path.join(td, n))]
    folder = rel.split("/", 1)[0]
    digest, size = sha256_of(full), os.path.getsize(full)
    total_pages = total_ocr = 0
    for entry_rel, path, entry_texts, _ in entries:
        if entry_texts is None:
            entry_texts = page_texts(path)
        blank = [i + 1 for i, t in enumerate(entry_texts) if len(t) < BLANK_BELOW]
        done = 0
        if ocr:
            for p in blank:
                if time.time() > deadline:
                    break
                try:
                    text = ocr_page(path, p).replace("\x00", "").strip()
                except Exception:
                    text = ""
                if text:
                    entry_texts[p - 1] = text
                done += 1
        kind = kind_of(entry_rel)
        db.execute(
            "insert into docs(folder, relpath, kind, pages, ocr_pages, mtime, blank, sha256, bytes, category, disk_path)"
            " values (?,?,?,?,?,?,?,?,?,?,?)",
            (folder, entry_rel, kind, len(entry_texts), done, float(mtime), len(blank), digest, size, category, disk),
        )
        db.executemany(
            "insert into pages(folder, relpath, kind, page, text) values (?,?,?,?,?)",
            [(folder, entry_rel, kind, i + 1, t) for i, t in enumerate(entry_texts)],
        )
        total_pages += len(entry_texts)
        total_ocr += done
    return len(entries), total_pages, total_ocr


def disk_of(db, root, rel):
    """Where an indexed file is on disk (rel for rows written before disk_path existed)."""
    row = db.execute("select coalesce(disk_path, relpath) from docs where relpath = ? or relpath like ? limit 1",
                     (rel, rel + "::%")).fetchone()
    return os.path.join(root, row[0] if row else rel)


def hash_all(db, root):
    """Record sha256 and size of every indexed file still at its place (run before moving files)."""
    rows = db.execute(
        "select distinct substr(relpath, 1, case when instr(relpath, '::') > 0 then instr(relpath, '::') - 1 else length(relpath) end),"
        " coalesce(disk_path, relpath) from docs where sha256 is null"
    ).fetchall()
    done = missing = 0
    for i, (rel, disk) in enumerate(rows, 1):
        base_disk = disk.split("::", 1)[0]
        path = os.path.join(root, base_disk)
        if not os.path.exists(path):
            missing += 1
            continue
        digest, size = sha256_of(path), os.path.getsize(path)
        like = rel.replace("%", r"\%").replace("_", r"\_") + "::%"
        db.execute("update docs set sha256 = ?, bytes = ? where relpath = ? or relpath like ? escape '\\'", (digest, size, rel, like))
        done += 1
        if i % 500 == 0:
            db.commit()
            print(f"  {i} of {len(rows)} files hashed…")
    db.commit()
    print(f"Checksums recorded for {done} files; {missing} not found at their place (moved or removed already).")


def ocr_left(db, root, budget):
    """Finish OCR of scanned pages that were left over (budget reached or --no-ocr)."""
    deadline = time.time() + budget
    docs = db.execute(
        "select relpath, coalesce(disk_path, relpath) from docs where blank > ocr_pages order by (1.0 * blank / pages) desc"
    ).fetchall()
    done_pages = 0
    for rel, disk in docs:
        if time.time() > deadline:
            break
        if "::" in rel:
            base, name = rel.split("::", 1)
            td = tempfile.mkdtemp()
            run(["pdfdetach", "-saveall", "-o", td + "/", os.path.join(root, disk.split("::", 1)[0])], 180)
            path = os.path.join(td, name)
        else:
            path = os.path.join(root, disk)
        if not os.path.exists(path):
            continue
        pages = [p for (p,) in db.execute("select page from pages where relpath = ? and length(trim(text)) < ? order by page", (rel, BLANK_BELOW))]
        n = 0
        for p in pages:
            if time.time() > deadline:
                break
            try:
                text = ocr_page(path, p).replace("\x00", "").strip()
            except Exception:
                text = ""
            if text:
                db.execute("update pages set text = ? where relpath = ? and page = ?", (text, rel, p))
            n += 1
        db.execute("update docs set ocr_pages = min(blank, ocr_pages + ?) where relpath = ?", (n, rel))
        db.commit()
        done_pages += n
    left = db.execute("select count(*) from docs where blank > ocr_pages").fetchone()[0]
    print(f"OCR pass: {done_pages} pages read; documents still with scanned pages left: {left}.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--root", default=os.environ.get("STANDARDS_ROOT", DEFAULT_ROOT))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--hash", action="store_true", help="only record checksums of the indexed files (before a move)")
    ap.add_argument("--ocr-only", action="store_true", help="only finish OCR of scanned pages left over")
    ap.add_argument("--no-ocr", action="store_true")
    ap.add_argument("--ocr-budget", type=float, default=6 * 3600, help="seconds of OCR at most (default 6 h)")
    ap.add_argument("--report", default=DEFAULT_REPORT, help="CSV with the counts per IS folder")
    a = ap.parse_args()
    if not os.path.isdir(a.root):
        sys.exit(f"IS Standards folder not found: {a.root}")
    db = sqlite3.connect(a.db, timeout=300)
    db.execute("pragma busy_timeout=300000")
    ensure_schema(db)
    if a.hash:
        hash_all(db, a.root)
        return
    if a.ocr_only:
        ocr_left(db, a.root, a.ocr_budget)
        return

    on_disk, clashes = scan(a.root)
    indexed = {}
    for rel, mtime, disk, category, digest, size in db.execute(
        "select relpath, mtime, coalesce(disk_path, relpath), category, sha256, bytes from docs"
    ):
        base = rel.split("::", 1)[0]
        indexed.setdefault(base, (int(round(mtime or 0)), disk.split("::", 1)[0], category, digest, size))
    unhashed = sum(1 for v in indexed.values() if not v[3])

    new = sorted(r for r in on_disk if r not in indexed)
    gone = sorted(r for r in indexed if r not in on_disk)
    changed = sorted(r for r in on_disk if r in indexed and indexed[r][0] != on_disk[r][1])
    # Same path from the IS folder, another place on disk (the IS folder moved into a category folder): metadata only.
    relocated = sorted(
        r for r in on_disk if r in indexed and r not in changed and (indexed[r][1] != on_disk[r][0] or indexed[r][2] != on_disk[r][2])
    )

    # A new path whose file is one that vanished (moved / renamed inside its IS folder): reuse its pages by checksum,
    # or by name + size when it was never hashed.
    gone_by_hash = {indexed[r][3]: r for r in gone if indexed[r][3]}
    gone_by_name = collections.defaultdict(list)
    for r in gone:
        if indexed[r][4]:
            gone_by_name[(r.rsplit("/", 1)[-1], indexed[r][4])].append(r)
    reused = []  # (old, new)
    for r in new:
        full = os.path.join(a.root, on_disk[r][0])
        try:
            digest, size = sha256_of(full), os.path.getsize(full)
        except OSError:
            continue
        old = gone_by_hash.pop(digest, None)
        if not old:
            same = [g for g in gone_by_name.get((r.rsplit("/", 1)[-1], size), []) if g in gone]
            old = same[0] if same else None
        if not old:
            # Never hashed: the one vanished file of the same name in the same IS folder, with the same page count.
            folder, name = r.split("/", 1)[0], r.rsplit("/", 1)[-1]
            same = [g for g in gone if g.split("/", 1)[0] == folder and g.rsplit("/", 1)[-1] == name and not indexed[g][3]]
            if len(same) == 1:
                pages = db.execute("select max(pages) from docs where relpath = ?", (same[0],)).fetchone()[0]
                if pages and pages == page_count(full):
                    old = same[0]
        if old and old in gone:
            reused.append((old, r))
            gone.remove(old)
    reused_new = {n for _, n in reused}
    new = [r for r in new if r not in reused_new]

    print(
        f"IS Standards folder: {len(on_disk)} PDFs. New {len(new)}, changed {len(changed)}, removed {len(gone)}, "
        f"moved to a category / other place {len(relocated)}, reused by checksum {len(reused)}."
    )
    if unhashed and (a.dry_run or gone):
        print(f"  Note: {unhashed} indexed files have no checksum yet. Before moving files, run: update_index.py --hash")
    for rel, first, second in clashes[:20]:
        print(f"  CLASH (same IS folder twice, kept the first): {rel}: {first} | {second}")
    for label, items in (("new", new), ("changed", changed), ("removed", gone), ("moved", relocated)):
        for r in items[:10]:
            print(f"  {label}: {r}")
        if len(items) > 10:
            print(f"  … and {len(items) - 10} more {label}")
    for old, nr in reused[:10]:
        print(f"  reused: {old} -> {nr}")
    if len(reused) > 10:
        print(f"  … and {len(reused) - 10} more reused")

    # Counts per IS folder, for checking a reorganisation.
    per = collections.defaultdict(collections.Counter)
    for label, items in (("new", new), ("changed", changed), ("removed", gone), ("moved", relocated)):
        for r in items:
            per[r.split("/", 1)[0]][label] += 1
    for _, nr in reused:
        per[nr.split("/", 1)[0]]["reused"] += 1
    cats = collections.Counter(v[2] or "(none)" for v in on_disk.values())
    print("Files per category: " + ", ".join(f"{k} {v}" for k, v in sorted(cats.items())))
    try:
        with open(a.report, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["is_folder", "new", "changed", "removed", "moved", "reused"])
            for folder in sorted(per):
                c = per[folder]
                w.writerow([folder, c["new"], c["changed"], c["removed"], c["moved"], c["reused"]])
        print(f"Counts per IS folder: {a.report}")
    except OSError as err:
        print(f"  (report not written: {err})")
    if a.dry_run or not (new or changed or gone or relocated or reused):
        return

    deadline = time.time() + a.ocr_budget
    for old, nr in reused:
        disk, mtime, category = on_disk[nr]
        rename(db, old, nr, disk, category, mtime)
    for r in relocated:
        disk, mtime, category = on_disk[r]
        like = r.replace("%", r"\%").replace("_", r"\_") + "::%"
        db.execute("update docs set disk_path = ?, category = ? where relpath = ?", (disk, category, r))
        db.execute("update docs set disk_path = ? || substr(relpath, ?), category = ? where relpath like ? escape '\\'",
                   (disk, len(r) + 1, category, like))
    db.commit()
    for r in gone:
        remove(db, r)
        db.commit()
    touched = 0
    really_changed = []
    for r in changed:
        old = [t for (t,) in db.execute("select text from pages where relpath = ? order by page", (r,))]
        if old and same_text(page_texts(os.path.join(a.root, on_disk[r][0])), old):
            db.execute("update docs set mtime = ?, disk_path = ?, category = ? where relpath = ?",
                       (float(on_disk[r][1]), on_disk[r][0], on_disk[r][2], r))
            touched += 1
        else:
            really_changed.append(r)
    db.commit()
    if touched:
        print(f"{touched} changed files had the same text (date only): date updated, not read again.")
    changed = really_changed
    done_entries = done_pages = done_ocr = 0
    for i, r in enumerate(changed + new, 1):
        remove(db, r)
        disk, mtime, category = on_disk[r]
        try:
            e, p, o = index_file(db, r, os.path.join(a.root, disk), disk, category, mtime, not a.no_ocr, deadline)
        except Exception as err:  # one bad PDF must not stop the rest
            db.rollback()
            print(f"  skipped (could not read): {r}: {err}")
            continue
        db.commit()
        done_entries += e
        done_pages += p
        done_ocr += o
        if i % 25 == 0:
            print(f"  {i} of {len(changed) + len(new)} files…")
    left = db.execute("select count(*) from docs where blank > ocr_pages").fetchone()[0]
    print(
        f"Done: {done_entries} entries, {done_pages} pages, {done_ocr} pages read by OCR. Removed {len(gone)}, "
        f"moved {len(relocated)}, reused by checksum {len(reused)}."
    )
    if left:
        print(f"{left} documents still have scanned pages without OCR (budget reached or --no-ocr). Finish them with:\n"
              f"  update_index.py --ocr-only")
    print("Next: sync_app.py, to bring these changes into the app.")


if __name__ == "__main__":
    main()
