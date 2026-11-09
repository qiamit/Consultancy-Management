#!/usr/bin/env python3
"""Keep the standards index (~/standards_ocr/standards.db) in step with the IS Standards folder on this Mac.

Run it after adding, replacing or deleting PDFs (a new Standard, a revised edition, an Amendment, a Product Manual):
only the changed files are read again; scanned pages are read with OCR (tesseract). Nothing leaves this Mac.

Usage:
  update_index.py                 # update the index
  update_index.py --dry-run       # only list what would change
Options: --db PATH, --root PATH (the "IS Standards" folder), --no-ocr, --ocr-budget SECONDS

How a file's kind is decided (the rule the index was built with, plus the newer folders):
  IS 1786/IS 1786 2008 - 00.pdf                    -> Standard
  IS 1786/PM IS 1786.pdf, "Product Manual" names    -> Product Manual (anywhere)
  IS 1786/_Extra/Amendments/...                     -> Amendment
  IS 1786/_Extra/Old Versions/...                   -> Old version
  IS 1786/Current Official Set - .../...            -> Amendment when the name says Amd / Amendment, else Standard
  IS 1786/Master Documents/<file>                   -> Amendment / Standard by name ("Amd", "Revised Standard",
                                                       a bare number like 14587_2023.pdf), else Extra (other)
  anything else under _Extra or a sub-folder        -> Extra (other)
Not indexed: files in a sub-folder of Master Documents (e.g. a product's Invoice Copy / Test Report) and any file
whose name says Invoice or Test Report: they are business papers, not standards.
A PDF portfolio (a PDF that only carries attached PDFs) is indexed as "file.pdf::attachment.pdf", one entry each.
A file whose date changed but whose text did not (OneDrive re-sync) only gets its date updated.
"""
import argparse
import glob
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
BLANK_BELOW = 30  # characters: a page with less text than this is a picture (scanned) or empty


AMENDMENT_NAME = re.compile(r"(?i)(^|[\s_.-])amd[\s_.-]*\d|amendment")


def kind_of(rel):
    base = rel.split("::", 1)[0]
    parts = base.split("/")
    name = parts[-1]
    path = "/" + base
    if "/_Extra/Amendments/" in path:
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
    """Business papers kept beside the standards: never indexed."""
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


def scan(root):
    """{relpath: mtime} of every PDF inside an IS folder (files directly in the root are ignored)."""
    found = {}
    for top in sorted(os.listdir(root)):
        top_path = os.path.join(root, top)
        if top.startswith(".") or not os.path.isdir(top_path):
            continue
        for dirpath, dirnames, files in os.walk(top_path):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            for f in files:
                if f.startswith((".", "~$")) or not f.lower().endswith(".pdf"):
                    continue
                full = os.path.join(dirpath, f)
                rel = os.path.relpath(full, root)
                if not skipped(rel):
                    found[rel] = int(os.path.getmtime(full))
    return found


def remove(db, rel):
    like = rel.replace("%", r"\%").replace("_", r"\_") + "::%"
    db.execute("delete from pages where relpath = ? or relpath like ? escape '\\'", (rel, like))
    db.execute("delete from docs where relpath = ? or relpath like ? escape '\\'", (rel, like))


def index_file(db, rel, full, mtime, ocr, deadline):
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
            "insert into docs(folder, relpath, kind, pages, ocr_pages, mtime, blank) values (?,?,?,?,?,?,?)",
            (folder, entry_rel, kind, len(entry_texts), done, float(mtime), len(blank)),
        )
        db.executemany(
            "insert into pages(folder, relpath, kind, page, text) values (?,?,?,?,?)",
            [(folder, entry_rel, kind, i + 1, t) for i, t in enumerate(entry_texts)],
        )
        total_pages += len(entry_texts)
        total_ocr += done
    return len(entries), total_pages, total_ocr


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--root", default=os.environ.get("STANDARDS_ROOT", DEFAULT_ROOT))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-ocr", action="store_true")
    ap.add_argument("--ocr-budget", type=float, default=6 * 3600, help="seconds of OCR at most (default 6 h)")
    a = ap.parse_args()
    if not os.path.isdir(a.root):
        sys.exit(f"IS Standards folder not found: {a.root}")
    db = sqlite3.connect(a.db, timeout=300)
    db.execute("pragma busy_timeout=300000")

    on_disk = scan(a.root)
    indexed = {}
    for rel, mtime in db.execute("select relpath, mtime from docs"):
        indexed.setdefault(rel.split("::", 1)[0], int(round(mtime or 0)))
    new = sorted(r for r in on_disk if r not in indexed)
    changed = sorted(r for r in on_disk if r in indexed and indexed[r] != on_disk[r])
    gone = sorted(r for r in indexed if r not in on_disk)
    print(f"IS Standards folder: {len(on_disk)} PDFs. New {len(new)}, changed {len(changed)}, removed {len(gone)}.")
    for label, items in (("new", new), ("changed", changed), ("removed", gone)):
        for r in items[:15]:
            print(f"  {label}: {r}")
        if len(items) > 15:
            print(f"  … and {len(items) - 15} more {label}")
    if a.dry_run or not (new or changed or gone):
        return

    deadline = time.time() + a.ocr_budget
    for r in gone:
        remove(db, r)
        db.commit()
    touched = 0
    really_changed = []
    for r in changed:
        old = [t for (t,) in db.execute("select text from pages where relpath = ? order by page", (r,))]
        if old and same_text(page_texts(os.path.join(a.root, r)), old):
            db.execute("update docs set mtime = ? where relpath = ?", (float(on_disk[r]), r))
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
        try:
            e, p, o = index_file(db, r, os.path.join(a.root, r), on_disk[r], not a.no_ocr, deadline)
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
    print(f"Done: {done_entries} entries, {done_pages} pages, {done_ocr} pages read by OCR. Removed {len(gone)}.")
    if left:
        print(
            f"{left} documents still have scanned pages without OCR (budget reached or --no-ocr). Finish them with:\n"
            f'  STANDARDS_ROOT="{a.root}" python3 ~/standards_ocr/ocr_pass.py "{a.db}" 3600'
        )
    print("Next: sync_app.py, to bring these changes into the app.")


if __name__ == "__main__":
    main()
