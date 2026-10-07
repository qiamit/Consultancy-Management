"""
Stable document / chunk identity for move-rename resilience.

Primary identity = content SHA-256 (document_id).
source_relative_path / filename are mutable metadata only.

Protected collections are never rewritten by this module.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from knowledge_engine.pilot.constants import CHUNK_ID_SCHEME_V2

# Legacy path-hash sample labels used in v1 pilot (path-dependent).
_DOC_PATH_LABEL_RE = re.compile(r"^doc_[0-9a-f]{12}$")

# Validated two-sample labels (kept for regression continuity).
LEGACY_BASELINE_LABELS: dict[str, str] = {
    "STD 9666/IS 9666 2023 - 00.pdf": "native_text",
    "STD 21/Test Method/IS 2676 1981 - 00.pdf": "scanned",
}


def normalize_rel_path(rel: str) -> str:
    return str(rel).replace("\\", "/").strip().lstrip("./")


def document_id_from_sha256(sha256: str) -> str:
    """Stable document identity from full content digest."""
    digest = (sha256 or "").strip().lower()
    if len(digest) < 16 or any(c not in "0123456789abcdef" for c in digest):
        raise ValueError(f"invalid sha256 for document_id: {sha256!r}")
    return f"sha256:{digest}"


def short_document_token(sha256: str) -> str:
    """12-hex token used inside chunk IDs (content-based, path-independent)."""
    digest = (sha256 or "").strip().lower()
    if len(digest) < 12:
        raise ValueError(f"sha256 too short for chunk token: {sha256!r}")
    return digest[:12]


def sample_label_for_content(sha256: str) -> str:
    """New chunk-id prefix for second-pilot+ indexing."""
    return f"doc_{short_document_token(sha256)}"


def legacy_path_sample_label(rel: str) -> str:
    """v1 behaviour: baseline labels or path-hash prefix (PATH-DEPENDENT)."""
    rel_n = normalize_rel_path(rel)
    if rel_n in LEGACY_BASELINE_LABELS:
        return LEGACY_BASELINE_LABELS[rel_n]
    digest = hashlib.sha256(rel_n.encode("utf-8")).hexdigest()[:12]
    return f"doc_{digest}"


def make_chunk_id(
    *,
    sha256: str,
    page_number: int,
    ordinal: int,
    scheme: str = CHUNK_ID_SCHEME_V2,
) -> str:
    """Stable chunk id: document content token + page + ordinal."""
    if scheme != CHUNK_ID_SCHEME_V2:
        raise ValueError(f"unsupported chunk id scheme: {scheme}")
    return f"{sample_label_for_content(sha256)}:p{int(page_number):04d}:c{int(ordinal):03d}"


def is_path_dependent_sample_label(label: str) -> bool:
    """True when label was derived from source path (v1 non-baseline)."""
    return bool(_DOC_PATH_LABEL_RE.match(label or "")) and label not in (
        "native_text",
        "scanned",
    )


def metadata_priority_notes() -> list[str]:
    return [
        "1. Verified PDF/document content (preferred)",
        "2. Reliable filename / embedded document metadata",
        "3. Folder/path inference (weakest; never invent if uncertain)",
    ]


def folder_context_from_path(rel: str) -> str | None:
    """Weak path inference — may be wrong after folder restructure."""
    parts = Path(normalize_rel_path(rel)).parts
    low = [p.lower() for p in parts]
    if any(p in ("test method", "test methods") for p in low):
        return "test_method"
    if any("master document" in p for p in low):
        return "master_documents"
    if any("amend" in p for p in low):
        return "amendment_folder"
    if parts:
        return "standard_root"
    return None


def infer_is_from_filename(name: str) -> str | None:
    m = re.search(r"\bIS\s*(\d+)", name, re.I)
    return f"IS {m.group(1)}" if m else None


def infer_year_from_filename(name: str) -> int | None:
    years = [int(y) for y in re.findall(r"\b(19\d{2}|20[0-2]\d)\b", name)]
    return max(years) if years else None


def build_document_record(
    *,
    sha256: str,
    source_relative_path: str,
    file_size: int | None = None,
    status: str = "pending",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rel = normalize_rel_path(source_relative_path)
    name = Path(rel).name
    rec: dict[str, Any] = {
        "document_id": document_id_from_sha256(sha256),
        "sha256": sha256.lower(),
        "source_relative_path": rel,
        "filename": name,
        "file_size": file_size,
        "status": status,
        "folder_context_inferred": folder_context_from_path(rel),
        "is_number_from_filename": infer_is_from_filename(name),
        "year_from_filename": infer_year_from_filename(name),
        "sample_label": sample_label_for_content(sha256),
        "chunk_id_scheme": CHUNK_ID_SCHEME_V2,
        "path_history": [rel],
        "events": [],
        "indexed_chunk_ids": [],
        "last_seen_at": None,
        "missing_since": None,
    }
    if extra:
        rec.update(extra)
    return rec
