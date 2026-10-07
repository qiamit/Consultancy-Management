"""
Build retrieval chunks from hybrid extraction diagnostics (no embeddings).

Clause-aware when headings are clear; otherwise page-aware.
Text-quality and visual-verification are separate fields.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path


CLAUSE_HEADING_RE = re.compile(
    r"(?m)^(?P<label>"
    r"(?:ANNEX\s+[A-Z]\b[^\n]{0,80})|"
    r"(?:A-\d+(?:\.\d+)*\s+[A-Z][^\n]{0,60})|"
    r"(?:\d+\.\d+(?:\.\d+)*\s+\S[^\n]{0,80})|"
    r"(?:\d+\.\s+[A-Z][A-Z0-9 /,—\-]{2,80})|"
    r"(?:0\.\s*FOREWORD\b[^\n]{0,40})|"
    r"(?:[1-9]\d?\.\s+(?:SCOPE|TERMINOLOGY|REFERENCES|TYPES|REQUIREMENTS|"
    r"PACKING|MARKING|SAMPLING|TESTS|TOLERANCES|DIMENSIONS|DIMENSIBNS)\b[^\n]{0,40})"
    r")\s*$"
)

PAGE_META_RE = re.compile(r"(?m)^#\s*method=.*\n?")


@dataclass
class Chunk:
    chunk_id: str
    source_relative_path: str
    source_file_hash: str
    pdf_pages: list[int]
    clause_number: str | None
    extraction_method: str
    review_status: str  # usable | needs_review | skipped_blank
    text: str
    char_count: int
    text_quality_status: str = "pass"  # pass | warn | fail
    visual_verification_status: str = "pending"  # pending | verified | failed
    review_reasons: list[str] = field(default_factory=list)
    text_sha256: str = ""
    text_version: int = 1
    native_text: str | None = None
    ocr_text: str | None = None
    preferred_source: str | None = None
    layout_crop_path: str | None = None


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _strip_page_meta(text: str) -> str:
    return PAGE_META_RE.sub("", text or "").strip()


def _normalize_clause_id(label: str) -> str | None:
    raw = " ".join(label.strip().split())
    if not raw:
        return None
    m = re.match(r"^(ANNEX\s+[A-Z])\b", raw, re.I)
    if m:
        return m.group(1).upper()
    m = re.match(r"^(A-\d+(?:\.\d+)*)\b", raw, re.I)
    if m:
        return m.group(1).upper()
    m = re.match(r"^(\d+(?:\.\d+)*)\b", raw)
    if m:
        return m.group(1)
    m = re.match(r"^(0\.\s*FOREWORD)\b", raw, re.I)
    if m:
        return "0"
    return None


def _quality_flags_for_page(page_number: int, text: str, relative_path: str) -> list[str]:
    from knowledge_engine.text_quality import analyze_text_quality

    report = analyze_text_quality(text, context=f"p{page_number}")
    flags = list(report.quality_warnings)
    t = text or ""
    if "णिणिणि" in t and "devanagari_cid_garble" not in "".join(flags):
        flags.append("devanagari_garble")
    if re.search(r"Table\s+\d+", t, re.I) and re.search(r"\n\d+\s*\n\d+\s*\n", t):
        flags.append("possible_table_scramble")
    if "𝑀" in t or re.search(r"M\s*\n\s*M1\s*\+\s*M", t):
        flags.append("formula_linearized")
    if relative_path.startswith("STD 21/") and page_number >= 9:
        flags.append("dense_table_likely")
    return flags


def _split_clause_segments(text: str) -> list[tuple[str | None, str]]:
    matches = list(CLAUSE_HEADING_RE.finditer(text))
    if len(matches) < 2:
        return []

    segments: list[tuple[str | None, str]] = []
    if matches[0].start() > 0:
        preface = text[: matches[0].start()].strip()
        if preface:
            segments.append((None, preface))

    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        if not body:
            continue
        clause = _normalize_clause_id(m.group("label"))
        segments.append((clause, body))
    return segments


def _page_visual_default(relative_path: str, page_number: int, page: dict) -> str:
    """
    Visual verification is independent of text-quality heuristics.
    Pages without inspected renders stay pending — never auto-ok.
    """
    explicit = page.get("visual_verification_status")
    if explicit:
        return explicit
    # Known blank pages already skipped / inspected in two-sample run.
    if page.get("method") == "blank_skipped":
        return "verified"
    return "pending"


def build_chunks_from_summary(
    summary: dict,
    *,
    source_file_hash: str,
    sample_label: str,
    prior_chunks: list[dict] | None = None,
) -> list[Chunk]:
    relative_path = summary["relative_path"]
    chunks: list[Chunk] = []
    seq = 0
    prior_by_id = {c["chunk_id"]: c for c in (prior_chunks or [])}

    for page in summary["pages"]:
        page_number = int(page["page_number"])
        method = page.get("method") or "native"
        raw = page.get("text") or ""
        text = _strip_page_meta(raw)

        if method == "blank_skipped" or not text.strip():
            continue

        page_flags = list(page.get("quality_warnings") or [])
        page_flags.extend(_quality_flags_for_page(page_number, text, relative_path))
        # de-dupe preserving order
        seen: set[str] = set()
        flags: list[str] = []
        for f in page_flags:
            if f not in seen:
                seen.add(f)
                flags.append(f)

        tq = page.get("text_quality_status") or (
            "fail" if flags else "pass"
        )
        vv = _page_visual_default(relative_path, page_number, page)

        page_reasons: list[str] = []
        if flags:
            page_reasons.extend(flags)
        if vv == "pending":
            page_reasons.append("visual_verification_pending")
        if method == "native_with_warnings":
            page_reasons.append("native_text_quality_warnings")
        if page.get("review_reasons"):
            page_reasons.extend(page["review_reasons"])

        # usable only when text-quality is pass AND visual verified.
        def _status(extra: list[str] | None = None) -> tuple[str, list[str]]:
            reasons = list(page_reasons)
            if extra:
                reasons.extend(extra)
            # de-dupe
            out: list[str] = []
            seen_r: set[str] = set()
            for r in reasons:
                if r not in seen_r:
                    seen_r.add(r)
                    out.append(r)
            if tq != "pass" or vv != "verified" or out:
                # Allow usable when visually verified AND quality pass AND no reasons
                if tq == "pass" and vv == "verified" and not out:
                    return "usable", []
                # Drop visual pending alone for pages explicitly verified blank handled above
                if tq == "pass" and vv == "verified" and not [
                    r for r in out if r != "visual_verification_pending"
                ]:
                    return "usable", []
                return "needs_review", out
            return "usable", []

        segments = _split_clause_segments(text)
        use_clause = bool(segments) and any(c for c, _ in segments)

        if use_clause:
            for clause, seg in segments:
                if len(seg.strip()) < 40:
                    continue
                clause_id = clause if clause else None
                extra = []
                if clause_id is None:
                    extra.append("uncertain_clause_id")
                review, reasons = _status(extra)
                seq += 1
                chunk_id = f"{sample_label}:p{page_number:04d}:c{seq:03d}"
                prior = prior_by_id.get(chunk_id)
                version = 1
                if prior:
                    prior_hash = prior.get("text_sha256") or sha256_text(prior.get("text", ""))
                    if prior_hash != sha256_text(seg):
                        version = int(prior.get("text_version") or 1) + 1
                    else:
                        version = int(prior.get("text_version") or 1)
                chunks.append(
                    Chunk(
                        chunk_id=chunk_id,
                        source_relative_path=relative_path,
                        source_file_hash=source_file_hash,
                        pdf_pages=[page_number],
                        clause_number=clause_id,
                        extraction_method=method,
                        review_status=review,
                        text=seg,
                        char_count=len(seg),
                        text_quality_status=tq,
                        visual_verification_status=vv,
                        review_reasons=reasons,
                        text_sha256=sha256_text(seg),
                        text_version=version,
                        native_text=page.get("native_text"),
                        ocr_text=page.get("ocr_text"),
                        preferred_source=page.get("preferred_source"),
                        layout_crop_path=page.get("layout_crop_path"),
                    )
                )
        else:
            review, reasons = _status()
            seq += 1
            chunk_id = f"{sample_label}:p{page_number:04d}:c{seq:03d}"
            prior = prior_by_id.get(chunk_id)
            version = 1
            if prior:
                prior_hash = prior.get("text_sha256") or sha256_text(prior.get("text", ""))
                if prior_hash != sha256_text(text):
                    version = int(prior.get("text_version") or 1) + 1
                else:
                    version = int(prior.get("text_version") or 1)
            chunks.append(
                Chunk(
                    chunk_id=chunk_id,
                    source_relative_path=relative_path,
                    source_file_hash=source_file_hash,
                    pdf_pages=[page_number],
                    clause_number=None,
                    extraction_method=method,
                    review_status=review,
                    text=text,
                    char_count=len(text),
                    text_quality_status=tq,
                    visual_verification_status=vv,
                    review_reasons=reasons,
                    text_sha256=sha256_text(text),
                    text_version=version,
                    native_text=page.get("native_text"),
                    ocr_text=page.get("ocr_text"),
                    preferred_source=page.get("preferred_source"),
                    layout_crop_path=page.get("layout_crop_path"),
                )
            )

    return chunks


def write_chunks_bundle(
    *,
    out_dir: Path,
    sample_label: str,
    relative_path: str,
    source_file_hash: str,
    chunks: list[Chunk],
    summary_stats: dict,
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{sample_label}__chunks.json"
    payload = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sample_label": sample_label,
        "source_relative_path": relative_path,
        "source_file_hash_sha256": source_file_hash,
        "chunk_count": len(chunks),
        "summary_stats": summary_stats,
        "chunks": [asdict(c) for c in chunks],
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path
