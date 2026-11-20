#!/usr/bin/env python3
"""Standards Library indexer: reads the owner's "Oracle Database" folder (category folders with one PDF per Standard,
Part and Section) and keeps the app's standards index (standard_docs / standard_pages, source 'library') equal to it.

Only what changed since the last run is read again:
  - same size and date as indexed            -> unchanged
  - other date, same sha256                  -> date updated only
  - new path, sha256 of a file that is gone  -> moved (category / name updated, pages kept)
  - otherwise                                -> read: text page by page, OCR for scanned pages, BSB stamp removed
  - indexed but no longer in the folder      -> removed from the index
  - noted "Almost No Text" on the last read  -> read again on every run (few files; OCR may get their text now)
Every file is written in its own transaction, so a run that stops keeps what it finished; the next run goes on.
Two runs never overlap (database lock). Each run is logged in standard_index_runs.

Runs in its container (deploy/standards-library/Dockerfile) on the server, after standards-sync.sh.

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
# A whole set in one file: "IS 1708 Parts 1 to 18 1986 - 02.pdf".
# An Indian adoption keeps its body in the name: "IS IEC 60071 Part 1 2006 - 00.pdf", "IS ISO 16160 2012 - 00.pdf".
# Two Parts in one file: "IS 274 Part 1 and 2 1981 - 00.pdf".
STRICT_NAME = re.compile(
    r"^(?:IS |ISO |IEC |IS ISO |IS IEC |ISO-IEC |IS ISO-IEC )\d+"
    r"(?:(?: Part \d+[A-Z]?)?(?: Sec \d+[A-Z]?)?| Parts? \d+ (?:to|and) \d+) (?:19|20)\d{2} - \d{2}$"
)
# The same form after another body's number: "ASTM E18 2025 - 00", "ASTM E1507 1998 (R2003) - 00".
STRICT_TAIL = re.compile(r"^(?: Part \d+[A-Z]?)?(?: Sec \d+[A-Z]?)? (?:19|20)\d{2}(?: \(R(?:19|20)\d{2}\))? - \d{2}$")
NUMBER = re.compile(
    r"^(?P<pre>IS[\s_/]+(?:ISO|IEC)(?:[\s_/-]+IEC)?|IS|ISO(?:[\s_/-]+IEC)?|IEC)[\s_/-]*(?P<num>\d+)(?P<rest>.*)$", re.I
)
# Other standards bodies: "ASTM E18 2025 - 00", "JIS B 7184 2021 - 00", "BS EN 10002 Part 1 2001 - 00",
# "DIN EN ISO 6892 Part 1 2020 - 00", "SAE J1939 2021 - 00". The number may carry a series letter (ASTM E18, JIS B 7184).
# Longer prefixes first, so "BS EN ISO" is not read as "BS".
BODIES = (
    "BS EN ISO", "BS EN IEC", "BS EN", "BS ISO", "BS IEC", "BS",
    "DIN EN ISO", "DIN EN IEC", "DIN EN", "DIN ISO", "DIN IEC", "DIN",
    "NF EN ISO", "NF EN", "NF", "UNE EN ISO", "UNE EN", "UNE",
    "EN ISO", "EN IEC", "EN",
    "ANSI", "ASTM", "ASME", "AWS", "API", "SAE", "IEEE", "NEMA", "UL",
    "JIS", "KS", "GB/T", "GB", "AS/NZS", "AS", "CSA", "GOST",
)
def _body_pattern(body):
    """'BS EN' -> BS[\\s_-]+EN; 'GB/T' also matches 'GB_T' / 'GB-T' (a file name cannot hold a slash)."""
    return r"[\s_-]+".join(r"[\s_/-]*".join(re.escape(p) for p in w.split("/")) for w in body.split(" "))


OTHER_NUMBER = re.compile(
    r"^(?P<pre>" + "|".join(_body_pattern(b) for b in BODIES) + r")"
    r"[\s_/-]*(?P<ser>[A-Z]{1,2}(?=[\s_-]?\d))?[\s_-]?(?P<num>\d+)(?P<rest>.*)$",
    re.I,
)
BODY_BY_KEY = {re.sub(r"[\s/]+", "", b): b for b in BODIES}  # "GBT" -> "GB/T", "BSEN" -> "BS EN"
# Series letter written apart from the number in these bodies ("JIS B 7184", "KS D 3503"); joined elsewhere ("ASTM E18").
SERIES_APART = {"JIS", "KS"}
LIST_FILE = "Standards List.xlsx"  # at the root of the library: the IS numbers that should have a file
# At the root of the library: file names (one per line, "#" for a comment) the owner has checked and found right.
# Their name, content and same-PDF notes are not shown again.
REVIEWED_FILE = "Reviewed Files.txt"

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


def other_number_of(m):
    """'ASTM E18', 'JIS B 7184', 'BS EN 10002' from an OTHER_NUMBER match."""
    pre = BODY_BY_KEY[re.sub(r"[\s_/-]+", "", m.group("pre").upper())]
    ser = (m.group("ser") or "").upper()
    num = m.group("num")
    if ser:
        return f"{pre} {ser} {num}" if pre in SERIES_APART else f"{pre} {ser}{num}"
    return f"{pre} {num}"


def strict_name(base, stem, rest):
    """True when the file name is in the agreed form: '<number> [Part P] [Sec S] YYYY - AA' (rest: what follows the
    number in the name)."""
    if STRICT_NAME.match(stem):
        return True
    return not base.startswith(("IS ", "ISO", "IEC")) and bool(STRICT_TAIL.match(rest))


def match_number(text):
    """(number, rest of the name) for an IS / ISO / IEC number or another body's number; None when there is none."""
    m = NUMBER.match(text)
    if m:
        return number_of(m), m.group("rest")
    m = OTHER_NUMBER.match(text)
    if m:
        return other_number_of(m), m.group("rest")
    return None


# Standards List.xlsx columns, found by their header (case and extra words ignored); A–G are read by position when a
# header is missing, as before the owner added the BIS columns (19 Nov 2026).
LIST_COLUMNS = {
    "row_no": ("s.no", "s. no", "sno", "sr"),
    "is_number": ("is number",),
    "title": ("is title", "title"),
    "standard_type": ("standard type",),
    "committee": ("technical committee",),
    "department": ("department",),
    "pm_ref": ("pm document", "pm no"),
    "status": ("status",),
    "part": ("part",),
    "section": ("sec",),
    "revision_year": ("revision year",),
    "amendments": ("amendments",),
    "reaffirmed_year": ("reaffirmed",),
}


def list_columns(header):
    """{field: column index} from the header row."""
    names = [str(h or "").strip().lower() for h in header]
    found = {}
    for field, keys in LIST_COLUMNS.items():
        for i, name in enumerate(names):
            if i in found.values():
                continue
            if any(name == k or name.startswith(k + " ") or name.startswith(k + "(") for k in keys):
                found[field] = i
                break
    for i, field in enumerate(("row_no", "is_number", "title", "standard_type", "committee", "department", "pm_ref")):
        found.setdefault(field, i)
    return found


def read_list(root):
    """Rows of Standards List.xlsx as tuples in LIST_FIELDS order (header row read for the column of each field)."""
    path = os.path.join(root, LIST_FILE)
    if not os.path.isfile(path):
        return None
    import openpyxl

    rows, cols = [], None
    sheet = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
    for r in sheet.iter_rows(values_only=True):
        r = ["" if c is None else str(c).strip() for c in r]
        if cols is None:
            cols = list_columns(r)
            continue
        get = lambda f: r[cols[f]] if f in cols and cols[f] < len(r) else ""
        number = get("is_number")
        if not number:
            continue
        m = match_number(number)
        digits = lambda v: int(re.search(r"\d{4}|\d+", v).group(0)) if re.search(r"\d", v or "") else None
        part = re.search(r"\d+[A-Z]?", get("part") or "")
        sec = re.search(r"\d+[A-Z]?", get("section") or "")
        rows.append((
            int(get("row_no")) if get("row_no").isdigit() else None, number, m[0] if m else number,
            get("title") or None, get("standard_type") or None, get("committee") or None, get("department") or None,
            get("pm_ref") or None, part.group(0) if part else "", sec.group(0) if sec else "", get("status") or None,
            digits(get("revision_year")), digits(get("amendments")), digits(get("reaffirmed_year")),
        ))
    return rows


LIST_FIELDS = ("row_no", "is_number", "base", "title", "standard_type", "committee", "department", "pm_ref", "part",
               "section", "status", "revision_year", "amendments", "reaffirmed_year")


def write_list(conn, rows):
    with conn.transaction():
        conn.execute("DELETE FROM public.standard_list")
        with conn.cursor().copy(f"COPY public.standard_list ({', '.join(LIST_FIELDS)}) FROM STDIN") as cp:
            for row in rows:
                cp.write_row(row)


def describe(rel):
    """What a library path is: number (folder in the index), kind, edition year, merged amendments, review note."""
    parts = rel.split("/")
    name = parts[-1]
    stem = re.sub(r"(?i)\.pdf$", "", name)
    in_set = len(parts) > 2 and SET_DIR.match(parts[-2] or "")
    m = match_number(stem.strip())
    if not m and in_set:  # a set file without a number: the set folder's number
        m = match_number(re.sub(SET_DIR, "", parts[-2]).strip(" -"))
    review = []
    if m:
        base = m[0]
        rest = re.sub(r"[_]+", " ", m[1])
    else:
        base, rest = stem, ""
        review.append("Name Not Understood (No Standard Number)")
    year = re.search(r"\b((?:19|20)\d{2})\b", rest)
    merged = re.search(r"-\s*(\d{2})\s*$", stem)
    if re.match(r"(?i)^pm[\s_-]", name) or re.search(r"(?i)product[\s_-]*man[ua]+l", name):
        kind = "Product Manual"
    elif AMENDMENT_NAME.search(stem):
        kind = "Amendment"
    else:
        kind = "Standard"
    if kind == "Standard" and not in_set and m and not strict_name(base, stem, m[1]):
        body = base.rsplit(" ", 1)[0] if not base.startswith(("IS ", "ISO")) else "IS"
        review.append(f"Name Not in the Form '{body} N [Part P] [Sec S] YYYY - AA'")
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
    for i, raw in enumerate(page_texts(pdf), start=1):
        # Judged without the BSB stamp: a scanned page carrying the stamp's text line is still a scanned page.
        text, ocr = clean_text(raw).strip(), False
        if len(text) < BLANK_BELOW:
            t = clean_text(ocr_page(pdf, i)).strip()
            if len(t) > len(text):
                text, ocr = t, True
        pages.append((i, text, ocr))
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


# Review notes worked out again on every run: from the file's name, from what its first pages say, and duplicates.
# The other notes (no pages, almost no text, DRM) come from reading the file and stay until it is read again.
RUN_NOTES = ("Name Not", "Not in a Category Folder", "Content Shows", "Same PDF as")
# An IS number in a Standard's text: "IS 1608 (Part 1) : 2022", "IS 2062:2011", "IS/ISO 6892-1", "IS 4736 Part 2".
IS_REF = re.compile(
    r"\bIS\s*[:/]?\s*(?:(?:ISO|IEC)(?:\s*/\s*IEC)?\s*[:/]?\s*)?(?P<num>\d{2,5})(?![\d.])"
    r"(?:\s*[-\u2010\u2011\u2013]\s*(?P<dash>\d{1,2})(?!\d))?"
    r"(?:\s*\(?\s*Part\s*[-:]?\s*(?P<part>\d{1,3})\b)?"
)
ISO_REF = re.compile(r"\bISO(?:\s*/\s*IEC)?\s*[:/]?\s*(?P<num>\d{3,5})(?![\d.])(?:\s*[-\u2010\u2011\u2013]\s*(?P<dash>\d{1,2})(?!\d))?")
ASTM_REF = re.compile(r"\bASTM\s*(?P<ser>[A-G])\s*-?\s*(?P<num>\d{1,5})\b")
YEARS = range(1940, 2041)


def own_number_in(num, text):
    return re.search(rf"(?<!\d){num}(?!\d)", text) is not None


def content_note(base, text):
    """A note when the first pages are another standard's: the own number is nowhere on them and another IS number
    is named at least twice (or in the title area of page 1)."""
    num = base.split(" ")[-1]
    if not text or own_number_in(num, text):
        return None
    counts = {}
    for i, m in enumerate(IS_REF.finditer(text)):
        n = int(m.group("num"))
        if str(n) == num or n in YEARS:
            continue
        counts[n] = counts.get(n, 0) + (3 if m.start() < 800 else 1)
    if not counts:
        return None
    best, score = max(counts.items(), key=lambda kv: kv[1])
    return f"Content Shows IS {best}, Not {base}: Check the File Name" if score >= 2 else None


def other_numbers(base, rel, text):
    """The same standard's ISO / IEC numbers: from its name (an adoption, "IS ISO 16160 2012 - 00.pdf") and from its
    first pages, where the ISO number follows the IS number ("IS 1608 (Part 1) : 2022 / ISO 6892-1 : 2019")."""
    num = base.split(" ")[-1]
    aka = set()

    def add(m):
        iso = f"ISO {int(m.group('num'))}"
        aka.add(iso)
        if m.group("dash"):
            aka.add(f"{iso} Part {int(m.group('dash'))}")

    name = rel.split("/")[-1]
    if re.match(r"(?i)^IS[\s_/-]+ISO", name):
        aka.add(f"ISO {num}")
        part = re.search(r"(?i)\bPart\s*(\d+)", name)
        if part:
            aka.add(f"ISO {num} Part {int(part.group(1))}")
    for m in re.finditer(rf"\bIS\s*[:/]?\s*{num}(?!\d)", text[:6000]):
        iso = ISO_REF.search(text, m.end(), m.end() + 60)
        if iso and int(iso.group("num")) not in YEARS:
            add(iso)
            break
    return sorted(aka)


def learn_equivalents(conn):
    """{IS key: {ISO keys}} from the cross-reference tables of the library's Standards ("International Standard /
    Corresponding Indian Standard / Degree of Equivalence"): an ISO number and the IS number printed after it.
    A pair counts once per document and needs two documents; an ISO number must point mostly to one IS number, and
    an IS number keeps only its strong ISO numbers ("ISO 3696" -> "IS 1070", "ISO 6508-1" -> "IS 1586 Part 1")."""
    rows = conn.execute(
        """SELECT d.relpath, p.text FROM public.standard_pages p JOIN public.standard_docs d ON d.id = p.doc_id
           WHERE d.source = 'library' AND p.text ~ 'ISO'
             AND p.text ~* '(corresponding|identical|technically equivalent)'"""
    ).fetchall()
    docs = {}
    for relpath, text in rows:
        doc = relpath.split("::")[0]
        for m in ISO_REF.finditer(text):
            num = int(m.group("num"))
            # A year, or an adoption written as "IS/ISO 6892": not a table row.
            if num in YEARS or re.search(r"IS\s*/\s*$", text[max(0, m.start() - 4):m.start()]):
                continue
            im = IS_REF.search(text, m.end(), m.end() + 260)
            if not im or re.match(r"IS\s*[:/]?\s*(ISO|IEC)", im.group(0)):
                continue
            iso = f"ISO {num}" + (f" Part {int(m.group('dash'))}" if m.group("dash") else "")
            part = im.group("part") or im.group("dash")
            is_key = f"IS {int(im.group('num'))}" + (f" Part {int(part)}" if part else "")
            docs.setdefault((iso, is_key), set()).add(doc)
    by_iso, by_is = {}, {}
    for (iso, is_key), found in docs.items():
        by_iso.setdefault(iso, {})[is_key] = len(found)
        by_is.setdefault(is_key, {})[iso] = len(found)
    learned = {}
    for (iso, is_key), found in docs.items():
        votes = len(found)
        others = [n for k, n in by_iso[iso].items() if k != is_key]
        if votes < 2 or (others and votes < 2 * max(others)) or votes < 0.5 * max(by_is[is_key].values()):
            continue
        learned.setdefault(is_key, set()).add(iso)
    return learned


def learned_numbers(base, rel, text, learned):
    """The ISO numbers learned for this file's IS number (and Part). When one IS number has several (a set of
    Sections, each adopting another ISO standard), only those its own first pages name."""
    part = re.search(r"(?i)\bPart\s*(\d+)", rel.split("/")[-1])
    isos = learned.get(base + (f" Part {int(part.group(1))}" if part else ""), set())
    if len(isos) > 1:
        isos = {i for i in isos if re.search(rf"\bISO\s*[:/]?\s*{i.split(' ')[1]}(?!\d)", text)}
    aka = set()
    for iso in isos:
        aka.add(iso)
        aka.add(iso.split(" Part ")[0])  # "ISO 6508 Part 1" also answers for "ISO 6508"
    return aka


ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10, "XI": 11, "XII": 12}


def manual_covers_part(base, rel, text):
    """True when a manual's first pages name this file's Part among the Parts it covers: "IS 9873 (Parts 1,2,3,4,7,9)",
    "IS 2386 (PART I AND PART III)". A manual of another Part saved under this Part's name gives False."""
    part = re.search(r"(?i)\bPart\s*(\d+)", rel.split("/")[-1])
    if not part:
        return False
    num = base.split(" ")[-1]
    for m in re.finditer(rf"(?<!\d){num}\s*\(\s*(Parts?[^)]{{0,80}})\)", text[:8000], re.I):
        covered = {int(x) for x in re.findall(r"\d+", m.group(1))}
        covered |= {ROMAN[x] for x in re.findall(r"\b([IVX]{1,4})\b", m.group(1).upper()) if x in ROMAN}
        if len(covered) > 1 and int(part.group(1)) in covered:
            return True
    return False


def reviewed_names(root):
    """Lower-case file names listed in Reviewed Files.txt; empty when there is no such file."""
    try:
        with open(os.path.join(root, REVIEWED_FILE), encoding="utf-8-sig") as f:
            lines = [ln.strip() for ln in f]
    except OSError:
        return set()
    return {ln.split("/")[-1].lower() for ln in lines if ln and not ln.startswith("#")}


def refresh_notes(conn, reviewed=frozenset()):
    """Number, category, year and review notes of every indexed file, from its name and its first pages as the
    indexer reads them now: a better rule reaches files already indexed without reading them again."""
    rows = conn.execute(
        """SELECT d.id, d.relpath, d.folder, d.category, d.kind, d.edition_year, d.amendments_merged, d.review, d.sha256, d.aka,
                  (SELECT string_agg(left(p.text, 6000), ' ' ORDER BY p.page) FROM public.standard_pages p
                   WHERE p.doc_id = d.id AND p.page <= 3)
           FROM public.standard_docs d WHERE d.source = 'library'"""
    ).fetchall()
    # Files with the very same content under two names: one of the names is wrong (or a set file was copied per Part).
    same = {}
    for r in rows:
        if "::" not in r[1] and r[8]:
            same.setdefault(r[8], []).append(r[1].split("/")[-1])
    learned = learn_equivalents(conn)
    updates = []
    for doc_id, relpath, folder, category, kind, year, merged, review, sha, aka, first in rows:
        rel, _, suffix = relpath.partition("::")
        info = describe(rel)
        notes = list(info["review"])
        if not suffix:
            if re.match(r"^IS \d+$", info["folder"]):
                note = content_note(info["folder"], first or "")
                if note:
                    notes.append(note)
            twins = [n for n in same.get(sha, []) if n != rel.split("/")[-1]]
            if twins and info["kind"] == "Product Manual" and manual_covers_part(info["folder"], rel, first or ""):
                twins = []  # one manual for several Parts ("IS 9873 (Parts 1,2,3,4,7,9)"), saved under each Part
            if twins:
                notes.append("Same PDF as " + ", ".join(sorted(twins)[:3]) + (" …" if len(twins) > 3 else ""))
        read_notes = [n for n in (review or "").split("; ") if n and not n.startswith(RUN_NOTES)]
        if rel.split("/")[-1].lower() in reviewed:  # the owner checked this file: only reading notes (DRM …) stay
            notes = []
        new_review = "; ".join(notes + read_notes) or None
        new_kind = kind if suffix else info["kind"]
        new_aka = [] if suffix or not re.match(r"^IS \d+$", info["folder"]) else sorted(
            set(other_numbers(info["folder"], rel, first or "")) | learned_numbers(info["folder"], rel, first or "", learned))
        if (info["folder"], info["category"], new_kind, info["edition_year"], merged if suffix else info["amendments_merged"],
                new_review, new_aka) != (folder, category, kind, year, merged, review, list(aka or [])):
            updates.append((info["folder"], info["category"], new_kind, info["edition_year"], bool(suffix),
                            info["amendments_merged"], new_review, info["folder"], new_aka, doc_id))
    if updates:
        with conn.transaction(), conn.cursor() as cur:
            cur.executemany(
                """UPDATE public.standard_docs SET folder = %s, category = %s, kind = %s, edition_year = %s,
                   amendments_merged = CASE WHEN %s THEN amendments_merged ELSE %s END, review = %s, base = %s,
                   aka = %s WHERE id = %s""",
                updates,
            )
    return len(updates)


# ---------------------------------------------------------------- versions (RAG step 1)

AMENDMENT_NO = re.compile(r"(?i)\b(?:amd|amendment)[\s_.-]*(?:no\.?\s*)?(\d{1,2})\b")
ORDINAL = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8}


def edition_parts(name):
    """(part, section, year) written in a file name: "IS 2062 Part 1 2025 - 00.pdf" -> ("1", "", 2025)."""
    part = re.search(r"(?i)\bPart\s*-?\s*(\d+[A-Z]?)", name)
    sec = re.search(r"(?i)\bSec(?:tion)?\s*-?\s*(\d+[A-Z]?)", name)
    years = re.findall(r"\b((?:19|20)\d{2})\b", name)
    return (part.group(1) if part else "", sec.group(1) if sec else "", int(years[-1]) if years else None)


def amendment_number(name):
    m = AMENDMENT_NO.search(name)
    if m:
        return int(m.group(1))
    m = re.search(r"(?i)\b(" + "|".join(ORDINAL) + r")\s+amendment", name)
    return ORDINAL[m.group(1).lower()] if m else None


def label_of(folder, part, sec, year):
    return f"{folder}{f' Part {part}' if part else ''}{f' Sec {sec}' if sec else ''}{f' {year}' if year else ''}"


def refresh_versions(conn):
    """Part, Section, amendment number and version status of every library document (see the migration
    20261120100000_standards_versions.sql). Worked out again on every run from the names and Standards List."""
    rows = conn.execute(
        """SELECT id, folder, relpath, kind, edition_year, amendments_merged, part, section, amendment_no,
                  version_status, superseded_by
           FROM public.standard_docs WHERE source = 'library'"""
    ).fetchall()
    listed = {}
    for base, part, sec, status in conn.execute(
        "SELECT base, part, section, status FROM public.standard_list WHERE coalesce(status, '') <> ''"
    ).fetchall():
        listed[(base, part or "", sec or "")] = status.strip()

    info = {}
    for doc_id, folder, relpath, kind, year, merged, *_ in rows:
        own, _, inner = relpath.partition("::")
        name = own.split("/")[-1]
        part, sec, name_year = edition_parts(name)
        if inner:  # a file inside a PDF: its own name says Standard / Amendment, the outer file its edition
            amd = amendment_number(inner) if kind == "Amendment" else None
        else:
            amd = amendment_number(name) if kind == "Amendment" else None
        info[doc_id] = {"folder": folder, "kind": kind, "part": part, "sec": sec, "year": year or name_year,
                        "merged": merged, "amd": amd, "inner": bool(inner)}

    latest = {}  # (folder, part, sec, kind) -> latest edition year of Standards / Product Manuals
    for d in info.values():
        if d["kind"] in ("Standard", "Product Manual") and d["year"] and not d["inner"]:
            key = (d["folder"], d["part"], d["sec"], d["kind"])
            latest[key] = max(latest.get(key, 0), d["year"])
    merged_into = {}  # (folder, part, sec, year) -> amendments merged into that edition's file
    for d in info.values():
        if d["kind"] == "Standard" and d["merged"] and not d["inner"]:
            key = (d["folder"], d["part"], d["sec"], d["year"])
            merged_into[key] = max(merged_into.get(key, 0), d["merged"])

    updates = []
    for doc_id, folder, relpath, kind, year, merged, part0, sec0, amd0, status0, by0 in rows:
        d = info[doc_id]
        status, by = None, None
        if d["kind"] in ("Standard", "Product Manual", "Amendment"):
            top = latest.get((d["folder"], d["part"], d["sec"], "Standard" if d["kind"] == "Amendment" else d["kind"]))
            if top and d["year"] and d["year"] < top:
                status, by = "Superseded", label_of(d["folder"], d["part"], d["sec"], top)
            elif d["kind"] == "Amendment" and d["amd"] and merged_into.get((d["folder"], d["part"], d["sec"], d["year"]), 0) >= d["amd"]:
                status = "Included"
            else:
                status = "Current"
            bis = listed.get((d["folder"], d["part"], d["sec"])) or listed.get((d["folder"], "", ""))
            if bis and status == "Current":
                if bis.lower().startswith("withdrawn"):
                    status = "Withdrawn"
                elif bis.lower().startswith("superseded"):
                    status, by = "Superseded", (bis.split("by", 1)[1].strip() if "by" in bis else None) or None
        new = (d["part"], d["sec"], d["amd"], status, by)
        if new != (part0 or "", sec0 or "", amd0, status0, by0):
            updates.append((*new, doc_id))
    if updates:
        with conn.transaction(), conn.cursor() as cur:
            cur.executemany(
                """UPDATE public.standard_docs SET part = %s, section = %s, amendment_no = %s, version_status = %s,
                   superseded_by = %s WHERE id = %s""",
                updates,
            )
    return len(updates)


def references_in(text, own):
    """{(number, part): times named} of the standards a Standard's text names; its own number left out."""
    found = {}

    def add(key):
        if key[0] != own:
            found[key] = found.get(key, 0) + 1

    spans = []
    for m in IS_REF.finditer(text):
        part = m.group("part") or m.group("dash") or ""
        add((f"IS {int(m.group('num'))}", str(int(part)) if part else ""))
        spans.append((m.start(), m.end()))
    rest = text
    # An adoption ("IS/ISO 6892-1") is the IS number only; so is the ISO number written right after an IS number
    # ("IS 1608 (Part 1) : 2022/ISO 6892-1 : 2019": the same standard under its ISO name).
    for a, b in reversed(spans):
        b = min(len(rest), b + 45)
        rest = rest[:a] + " " * (b - a) + rest[b:]
    for m in ISO_REF.finditer(rest):
        if int(m.group("num")) in YEARS:  # "ISO : 2019" — a year, not a number
            continue
        add((f"ISO {int(m.group('num'))}", str(int(m.group("dash"))) if m.group("dash") else ""))
    for m in ASTM_REF.finditer(rest):
        add((f"ASTM {m.group('ser')}{int(m.group('num'))}", ""))
    return found


def scan_references(conn):
    """The referenced standards of every Standard / Amendment not scanned yet (new and changed files)."""
    todo = conn.execute(
        """SELECT id, base FROM public.standard_docs
           WHERE source = 'library' AND NOT refs_scanned AND kind IN ('Standard', 'Amendment')"""
    ).fetchall()
    total = 0
    for doc_id, base in todo:
        text = conn.execute(
            "SELECT coalesce(string_agg(text, ' ' ORDER BY page), '') FROM public.standard_pages WHERE doc_id = %s",
            (doc_id,),
        ).fetchone()[0]
        refs = references_in(text, base)
        with conn.transaction():
            conn.execute("DELETE FROM public.standard_refs WHERE doc_id = %s", (doc_id,))
            if refs:
                with conn.cursor().copy("COPY public.standard_refs (doc_id, ref_base, ref_part, cites) FROM STDIN") as cp:
                    for (ref_base, ref_part), n in refs.items():
                        cp.write_row((doc_id, ref_base, ref_part, n))
            conn.execute("UPDATE public.standard_docs SET refs_scanned = true WHERE id = %s", (doc_id,))
        total += len(refs)
    return len(todo), total


# ---------------------------------------------------------------- chunks (RAG step 2)

# Raised when the chunking rules change: every document is chunked again on the next run (no PDF is read again,
# apart from the quick column-layout pass for its tables).
CHUNKS_VERSION = 2
TABLE_TITLE = re.compile(r"^\s{0,140}Table\s+(\d+[A-Z]?)\b(.*)$", re.I)
# A clause heading at the start of a line: "7", "7.2", "8.1.3" + a title word, or Foreword / Annex / Scope.
CLAUSE_HEAD = re.compile(r"^\s*(?:(\d{1,2}(?:\.\d{1,2}){0,3})\s+(?=[A-Z(])|(FOREWORD|Foreword|ANNEX\s+[A-Z]|Annex\s+[A-Z])\b)")
NUMBERY = re.compile(r"\d")
CHUNK_MIN, CHUNK_MAX = 300, 1800


def layout_pages(pdf):
    """Column-layout text of each page (tables keep their rows); [] when the PDF cannot be read."""
    out = run(["pdftotext", "-layout", "-enc", "UTF-8", pdf, "-"], 600).stdout
    return [t for t in out.split("\f")]


ROW_MARK = re.compile(r"^(?:[ivxlc]+\)|\d{1,2}\)|\d{1,2}\.)$", re.I)  # "i)", "ii)", "3)", "3."
COLUMN_NO = re.compile(r"^\(\d{1,2}\)$")  # the "(1) (2) (3)" line under a table head
VALUE = re.compile(r"\d")


def cells(line):
    """[(start column, end column, text)] of a column-layout line (cells are split at two or more spaces)."""
    return [(m.start(), m.end(), m.group(0)) for m in re.finditer(r"\S+(?: \S+)*", line)]


def same_column(a, b):
    """Two cells in one column: their spans overlap or their centres are within 4 characters."""
    return not (a[1] <= b[0] or b[1] <= a[0]) or abs((a[0] + a[1]) / 2 - (b[0] + b[1]) / 2) <= 4


NUMBER_CELL = re.compile(r"^[\d.,\-–()≤≥<>%+/ ]+$")  # a value, not a name ("0.22", "≤ 16", "(-)20")
GRADE_LIKE = re.compile(r"^[A-Z]{1,4}\s?\d{2,4}[A-Z]{0,3}$")  # "E 250", "Fe 500D", "YSt 310"


def table_rows(block):
    """The rows of a column-layout table, each with the labels printed above or below its values joined in:
    "ii) | E 250 | BR, B0 | 0.22 | 1.50 …". In IS tables a grade / quality name often sits on its own line between
    value lines (IS 2062 Table 1: "E 250  BR" above the 0.22 row, "B0" below it). [] when it is not that kind of table."""
    lines = []
    for l in block[1:]:
        if re.match(r"\s*NOTES?\b", l):  # the notes under a table are text, not rows
            break
        if l.strip():
            lines.append(l)
    kinds = []
    for l in lines:
        cs = cells(l)
        values = [c for c in cs if VALUE.search(c[2]) and not ROW_MARK.match(c[2]) and not GRADE_LIKE.match(c[2])]
        if cs and all(COLUMN_NO.match(c[2]) for c in cs):
            kinds.append("colno")
        elif len(values) >= 2:
            kinds.append("value")
        else:
            kinds.append("label")
    if "value" not in kinds:
        return []
    head_end = max((i for i, k in enumerate(kinds) if k == "colno"), default=kinds.index("value") - 1)
    body = [(i, lines[i], kinds[i]) for i in range(head_end + 1, len(lines))]
    vals = [i for i, _, k in body if k == "value"]
    if len(vals) < 2:
        return []
    printed = {i: cells(lines[i]) for i in vals}
    own = {i: list(printed[i]) for i in vals}

    def free(i, c):  # the value line itself has nothing in this column (labels joined to it do not count)
        return not any(same_column(c, o) for o in printed[i])

    joined = 0
    for i, line, kind in body:
        if kind != "label":
            continue
        joined += 1
        above = max((v for v in vals if v < i), default=None)
        below = min((v for v in vals if v > i), default=None)
        for c in cells(line):
            if below is not None and free(below, c) and (above is None or i - above >= below - i or not free(above, c)):
                own[below].append(c)
            elif above is not None and free(above, c):
                own[above].append(c)
            elif below is not None:
                own[below].append(c)
            elif above is not None:
                own[above].append(c)
    if not joined:  # every row already on one line: the column text says it all
        return []
    # Rows between two row marks ("ii)" … "iii)") are one group: a label printed once for the group (the row mark,
    # the grade "E 250") goes to each of its rows; a label printed for one row (a quality) stays there.
    groups, current = [], []
    for i in vals:
        if current and any(ROW_MARK.match(c[2]) for c in own[i]):
            groups.append(current)
            current = []
        current.append(i)
    if current:
        groups.append(current)
    out = []
    for g in groups:
        once = [c for i in g for c in own[i] if ROW_MARK.match(c[2]) or GRADE_LIKE.match(c[2])]
        for i in g:
            mine = list(own[i])
            for c in once:
                if free_of(mine, c):
                    mine.append(c)
            mine.sort()
            merged = []
            for b, e, t in mine:
                if merged and same_column((b, e), merged[-1]) and not NUMBER_CELL.match(t) and not NUMBER_CELL.match(merged[-1][2]):
                    pb, pe, pt = merged[-1]
                    merged[-1] = (min(pb, b), max(pe, e), f"{pt}, {t}")
                else:
                    merged.append((b, e, t))
            out.append(" | ".join(t for _, _, t in merged))
    # A row this cannot follow (notes or a list of names joined into one cell) is left to the column text alone; a
    # table with several such rows gets no ROWS at all.
    bad = [r for r in out if len(r) > 260 or r.count(", ") > 6]
    if len(bad) > max(1, len(out) // 5):
        return []
    return [r for r in out if r not in bad]


def free_of(cs, c):
    return not any(same_column(c, o) for o in cs)


def table_chunks(layout):
    """[(heading, text)] of the tables on one page in column layout: from a "Table N" title to the next title, a
    run of blank lines or 70 lines; kept when it looks like a table (several lines with numbers in two columns)."""
    lines = clean_text(layout).split("\n")
    out, i = [], 0
    while i < len(lines):
        m = TABLE_TITLE.match(lines[i])
        line = lines[i]
        # A table title stands on its own, set in from the margin ("        Table 1 Chemical Composition"); a sentence
        # that starts with "Table 1 and Table 3. For grades…" at the margin of a column is text, not a title.
        if not m or len(line.strip()) > 160 or len(line) - len(line.lstrip()) < 8 or re.search(r"[.,;:]\s*$", line) \
                or re.match(r"\s*Table\s+\d+[A-Z]?\s*(and|or|to|of|shall|gives?|is|are|see|for\s+the|without)\b", line, re.I):
            i += 1
            continue
        start, j, blanks = i, i + 1, 0
        while j < len(lines) and j - start < 70:
            if TABLE_TITLE.match(lines[j]):
                break
            blanks = blanks + 1 if not lines[j].strip() else 0
            if blanks >= 3:
                break
            j += 1
        block = [l.rstrip() for l in lines[start:j]]
        while block and not block[-1].strip():
            block.pop()
        # Rows: lines in columns (two or more gaps); a title set in from the margin is already a strong sign.
        gaps = lambda l: len(re.findall(r"\S\s{2,}(?=\S)", l.strip()))
        rows = [l for l in block[1:] if gaps(l) >= 2 or (gaps(l) >= 1 and len(NUMBERY.findall(l)) >= 2)]
        if len(rows) >= 3:
            indent = min((len(l) - len(l.lstrip()) for l in block if l.strip()), default=0)
            text = "\n".join(l[indent:] for l in block)
            text = re.sub(r" {4,}", "   ", text)[:6000]
            joined = table_rows(block)
            if joined:
                text += "\n\nROWS (one row per line; the grade / quality names printed above or below its values joined in):\n"
                text += "\n".join(joined)[:5000]
            out.append((re.sub(r"\s{2,}", " ", f"Table {m.group(1)}{m.group(2).rstrip()}")[:200], text))
        i = j
    return out


def clause_chunks(text):
    """[(heading, text)] of one page's text cut at clause headings, small pieces merged, long ones cut at a blank line."""
    parts, head, buf = [], "", []
    for line in text.split("\n"):
        m = CLAUSE_HEAD.match(line)
        if m and buf and sum(len(b) for b in buf) > 40:
            parts.append((head, "\n".join(buf).strip()))
            buf = []
        if m:
            head = line.strip()[:160]
        buf.append(line)
    if buf:
        parts.append((head, "\n".join(buf).strip()))
    merged = []
    for h, t in parts:
        if not t:
            continue
        if merged and (len(merged[-1][1]) < CHUNK_MIN or len(t) < 80) and len(merged[-1][1]) + len(t) < CHUNK_MAX:
            merged[-1] = (merged[-1][0] or h, merged[-1][1] + "\n" + t)
        else:
            merged.append((h, t))
    out = []
    for h, t in merged:
        while len(t) > CHUNK_MAX * 1.5:
            cut = t.rfind("\n\n", CHUNK_MIN, CHUNK_MAX)
            cut = cut if cut > 0 else t.rfind("\n", CHUNK_MIN, CHUNK_MAX)
            cut = cut if cut > 0 else CHUNK_MAX
            out.append((h, t[:cut].strip()))
            t = t[cut:].strip()
        out.append((h, t))
    return out


def chunks_of(pages, layouts):
    """[(page, seq, kind, heading, text)] of one document: its tables (from the column layout of the page) and its
    clauses (from the page text)."""
    out = []
    for no, text in pages:
        seq = 0
        lay = layouts[no - 1] if 0 < no <= len(layouts) else ""
        for h, t in table_chunks(lay):
            out.append((no, seq, "table", h, t))
            seq += 1
        pieces = clause_chunks(text or "")
        has_heads = any(h for h, _ in pieces)
        for h, t in pieces:
            out.append((no, seq, "clause" if has_heads and h else "page", h, t))
            seq += 1
    return out


def build_chunks(conn, root):
    """Chunks of every library document whose chunks are missing or from older rules (new / changed files after a
    read, every file once after CHUNKS_VERSION goes up)."""
    todo = conn.execute(
        """SELECT id, relpath FROM public.standard_docs
           WHERE source = 'library' AND chunks_version < %s AND pages > 0 ORDER BY id""",
        (CHUNKS_VERSION,),
    ).fetchall()
    made = 0
    layout_cache = {}
    for n, (doc_id, relpath) in enumerate(todo, start=1):
        own, _, inner = relpath.partition("::")
        layouts = []
        if not inner:  # a file inside a PDF has no path of its own here: its tables come from its page text only
            full = os.path.join(root, own)
            if full not in layout_cache:
                layout_cache.clear()
                layout_cache[full] = layout_pages(full) if os.path.isfile(full) else []
            layouts = layout_cache[full]
        pages = conn.execute(
            "SELECT page, text FROM public.standard_pages WHERE doc_id = %s ORDER BY page", (doc_id,)
        ).fetchall()
        rows = chunks_of(pages, layouts)
        with conn.transaction():
            conn.execute("DELETE FROM public.standard_chunks WHERE doc_id = %s", (doc_id,))
            if rows:
                with conn.cursor().copy(
                    "COPY public.standard_chunks (doc_id, page, seq, kind, heading, text) FROM STDIN"
                ) as cp:
                    for r in rows:
                        cp.write_row((doc_id, *r))
            conn.execute("UPDATE public.standard_docs SET chunks_version = %s WHERE id = %s", (CHUNKS_VERSION, doc_id))
        made += len(rows)
        if n % 250 == 0:
            print(f"  chunks: {n}/{len(todo)} documents, {made} chunks", flush=True)
    return len(todo), made


# ---------------------------------------------------------------- embeddings (RAG step 3)

EMBED_MODEL = os.environ.get("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
EMBED_BATCH = 64
# "current": only the current editions of Standards and Amendments (the part search needs first); "all": every chunk.
EMBED_SCOPE = os.environ.get("EMBED_SCOPE", "all").strip().lower()
SCOPE_SQL = (
    " AND coalesce(d.version_status, 'Current') IN ('Current', 'Included') AND d.kind IN ('Standard', 'Amendment')"
    if EMBED_SCOPE == "current" else ""
)


def embed_chunks(conn, stop_after_min=None):
    """Embeds every chunk with no vector of EMBED_MODEL yet: the current Standards first, then amendments, manuals and
    older editions. Saved batch by batch, so a stopped run goes on where it left off. Returns (done, left)."""
    try:
        from fastembed import TextEmbedding
    except ImportError:
        print("Embeddings: fastembed not installed, skipped")
        return 0, None
    model = TextEmbedding(EMBED_MODEL, threads=max(1, int(os.environ.get("EMBED_THREADS", "1"))))
    left = conn.execute(
        "SELECT count(*) FROM public.standard_chunks c JOIN public.standard_docs d ON d.id = c.doc_id"
        " WHERE (c.embedding IS NULL OR c.embed_model IS DISTINCT FROM %s)" + SCOPE_SQL,
        (EMBED_MODEL,),
    ).fetchone()[0]
    if not left:
        return 0, 0
    print(f"Embeddings: {left} chunks to embed with {EMBED_MODEL} (scope: {EMBED_SCOPE})", flush=True)
    started, done = time.time(), 0
    while True:
        rows = conn.execute(
            """SELECT c.id, c.heading, c.text FROM public.standard_chunks c
               JOIN public.standard_docs d ON d.id = c.doc_id
               WHERE (c.embedding IS NULL OR c.embed_model IS DISTINCT FROM %s)""" + SCOPE_SQL + """
               ORDER BY (coalesce(d.version_status, 'Current') = 'Current') DESC,
                        CASE d.kind WHEN 'Standard' THEN 0 WHEN 'Amendment' THEN 1 WHEN 'Product Manual' THEN 2 ELSE 3 END,
                        c.id
               LIMIT %s""",
            (EMBED_MODEL, EMBED_BATCH),
        ).fetchall()
        if not rows:
            break
        texts = [((h + "\n") if h else "") + (t or "")[:1800] for _, h, t in rows]
        vectors = list(model.embed(texts, batch_size=EMBED_BATCH))
        with conn.transaction(), conn.cursor() as cur:
            cur.executemany(
                "UPDATE public.standard_chunks SET embedding = %s::extensions.vector, embed_model = %s WHERE id = %s",
                [("[" + ",".join(f"{x:.6f}" for x in v) + "]", EMBED_MODEL, cid) for (cid, _, _), v in zip(rows, vectors)],
            )
        done += len(rows)
        mins = (time.time() - started) / 60
        if done % (EMBED_BATCH * 40) == 0:
            rate = done / max(mins * 60, 1)
            print(f"  embeddings: {done}/{left}, {rate:.1f} per s, about {(left - done) / max(rate, 0.1) / 3600:.1f} h left",
                  flush=True)
        if stop_after_min and mins >= stop_after_min:
            print(f"  embeddings: stopped after {stop_after_min} min ({done} done); the next run goes on", flush=True)
            break
    return done, left - done


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
    no_text = set()  # read again on every run: a better reader (OCR) may now get their text; they are few
    for rel, size, mtime, sha, review in conn.execute(
        "SELECT relpath, bytes, mtime, sha256, review FROM public.standard_docs WHERE source = 'library' AND relpath NOT LIKE '%::%'"
    ):
        if not args.only or args.only.lower() in rel.lower():
            indexed[rel] = (size, mtime, sha)
            if "Almost No Text" in (review or ""):
                no_text.add(rel)

    unchanged, touched, to_read = [], [], []
    for rel, (full, size, mtime) in found.items():
        old = indexed.get(rel)
        if rel in no_text:
            to_read.append(rel)
        elif old and old[0] == size and abs((old[1] or 0) - mtime) < 1:
            unchanged.append(rel)
        else:
            to_read.append(rel)
    gone = [rel for rel in indexed if rel not in found]

    # sha256 of the files to read: an unchanged text (date only) or a move keeps its pages.
    gone_by_sha = {indexed[r][2]: r for r in gone if indexed[r][2]}
    sha_of, moves, reads = {}, [], []
    for rel in to_read:
        old = indexed.get(rel)
        if rel in no_text or (not old and not gone_by_sha):
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
    errors, pages_read, ocr_read, added, changed, renamed = [], 0, 0, 0, 0, 0
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
        renamed = refresh_notes(conn, reviewed_names(root))
        versions = refresh_versions(conn)
        if versions:
            print(f"Version facts: {versions} documents updated")
        chunked, chunks = build_chunks(conn, root)
        if chunked:
            print(f"Chunks: {chunks} made for {chunked} documents")
        limit = float(os.environ.get("EMBED_MAX_MINUTES", "0") or 0) or None
        embedded, left = embed_chunks(conn, limit)
        if embedded:
            print(f"Embeddings: {embedded} chunks embedded" + (f", {left} left for the next run" if left else ""))
        if renamed:
            print(f"Names and first pages checked again: {renamed} documents updated")
        scanned, refs = scan_references(conn)
        if scanned:
            print(f"References: {refs} found in {scanned} Standards")
        conn.execute("SELECT public.standard_refs_refresh()")
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
    if renamed:
        note += f"; notes updated: {renamed}"
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
