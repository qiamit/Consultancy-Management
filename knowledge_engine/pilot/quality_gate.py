"""
Pilot quality gate: classify chunks usable vs needs_review without inventing facts.

Does not silently promote known-bad IS 2676 page 8.
"""

from __future__ import annotations

import re
from typing import Any

from knowledge_engine.chunk_extract import Chunk

# Reasons that must keep a chunk out of trusted retrieval.
CRITICAL_REASON_RE = re.compile(
    r"(digitization_noise|devanagari_garble|devanagari_cid|replacement_chars|"
    r"private_use_area|dense_table_likely|possible_table_scramble|"
    r"formula_linearized|formula_structure|layout_table|cid_garble)",
    re.I,
)

# Previously excluded IS 2676 thickness page — never trusted unless explicitly re-verified.
FORBIDDEN_PAGES: dict[str, set[int]] = {
    # match by path substring
    "IS 2676": {8},
    "STD 21/": {8},
}


def _is_forbidden_page(rel: str, pages: list[int]) -> bool:
    for key, bad in FORBIDDEN_PAGES.items():
        if key in (rel or ""):
            if bad.intersection(pages):
                return True
    return False


def apply_pilot_quality_gate(chunks: list[Chunk]) -> list[Chunk]:
    """
    Reclassify for pilot indexing:
    - Critical quality / forbidden pages → needs_review
    - text_quality fail → needs_review
    - visual pending alone with clean text → usable (pilot-scale; no human QA yet)
    """
    out: list[Chunk] = []
    for ch in chunks:
        reasons = list(ch.review_reasons or [])
        pages = list(ch.pdf_pages or [])
        rel = ch.source_relative_path or ""

        if _is_forbidden_page(rel, pages):
            reasons.append("forbidden_page_is2676_p8")
            ch.review_status = "needs_review"
            ch.review_reasons = _dedupe(reasons)
            ch.visual_verification_status = "failed"
            out.append(ch)
            continue

        critical = [r for r in reasons if CRITICAL_REASON_RE.search(r or "")]
        tq = ch.text_quality_status or "pass"

        if tq == "fail" or critical:
            ch.review_status = "needs_review"
            if tq == "fail" and "text_quality_fail" not in reasons:
                reasons.append("text_quality_fail")
            ch.review_reasons = _dedupe(reasons)
            out.append(ch)
            continue

        # Soft warnings (warn) → needs_review
        if tq == "warn":
            ch.review_status = "needs_review"
            if "text_quality_warn" not in reasons:
                reasons.append("text_quality_warn")
            ch.review_reasons = _dedupe(reasons)
            out.append(ch)
            continue

        # Clean text: allow usable even if visual was only pending (pilot policy)
        soft_only = [
            r
            for r in reasons
            if r
            in (
                "visual_verification_pending",
                "native_text_quality_warnings",
                "uncertain_clause_id",
            )
        ]
        other = [r for r in reasons if r not in soft_only]
        if other:
            ch.review_status = "needs_review"
            ch.review_reasons = _dedupe(reasons)
            out.append(ch)
            continue

        ch.review_status = "usable"
        ch.review_reasons = []
        if ch.visual_verification_status == "pending":
            ch.visual_verification_status = "pilot_auto"
        out.append(ch)
    return out


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def filter_usable_for_index(chunks: list[Chunk]) -> list[Chunk]:
    usable = []
    for ch in chunks:
        if ch.review_status != "usable":
            continue
        if _is_forbidden_page(ch.source_relative_path or "", list(ch.pdf_pages or [])):
            continue
        if len((ch.text or "").strip()) < 40:
            continue
        usable.append(ch)
    return usable


def chunk_to_metadata(ch: Chunk, *, sample_label: str, document_type: str | None) -> dict[str, Any]:
    from knowledge_engine.local_vector_test import is_number_from_source_path
    import json

    is_no = is_number_from_source_path(ch.source_relative_path) or ""
    year = None
    m = re.search(r"\b(19\d{2}|20[0-2]\d)\b", ch.source_relative_path or "")
    if m:
        year = int(m.group(1))
    meta: dict[str, Any] = {
        "chunk_id": ch.chunk_id,
        "source_relative_path": ch.source_relative_path,
        "source_file_hash": ch.source_file_hash,
        "pdf_pages": json.dumps(ch.pdf_pages),
        "clause_number": ch.clause_number or "",
        "extraction_method": ch.extraction_method,
        "review_status": ch.review_status,
        "text_quality_status": ch.text_quality_status,
        "visual_verification_status": ch.visual_verification_status,
        "sample_label": sample_label,
        "text_sha256": ch.text_sha256,
        "text_version": ch.text_version,
        "is_number": is_no,
        "document_type": document_type or "",
        "corpus": "pilot",
    }
    if year is not None:
        meta["year_from_path"] = year
    return meta
