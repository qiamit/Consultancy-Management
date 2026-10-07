"""Persistent per-PDF manifest for resumable pilot indexing."""

from __future__ import annotations

import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from knowledge_engine.pilot.constants import (
    CHUNK_VERSION,
    EXTRACTION_VERSION,
    PILOT_COLLECTION_NAME,
    PILOT_EMBEDDING_BACKEND,
    PILOT_EMBEDDING_MODEL,
    QUALITY_GATE_VERSION,
)

# Path used only for filename derivation in new_doc_record.


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def empty_manifest() -> dict[str, Any]:
    return {
        "collection_name": PILOT_COLLECTION_NAME,
        "extraction_version": EXTRACTION_VERSION,
        "chunk_version": CHUNK_VERSION,
        "quality_gate_version": QUALITY_GATE_VERSION,
        "embedding_model": PILOT_EMBEDDING_MODEL,
        "embedding_backend": PILOT_EMBEDDING_BACKEND,
        "updated_at": utc_now(),
        "documents": {},
    }


def load_manifest(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return empty_manifest()
    data = json.loads(path.read_text(encoding="utf-8"))
    if "documents" not in data:
        data["documents"] = {}
    return data


def save_manifest(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = utc_now()
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    # Atomic write
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", delete=False, dir=str(path.parent), suffix=".tmp"
    ) as tmp:
        tmp.write(payload)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


def new_doc_record(rel: str, *, sha256: str, size_bytes: int | None) -> dict[str, Any]:
    """Create a document record.

    Prefer keying manifests by document_id (sha256:…) for v2+; path remains mutable.
    """
    doc_id = f"sha256:{sha256.lower()}" if sha256 else None
    return {
        "document_id": doc_id,
        "source_relative_path": rel,
        "filename": Path(rel).name if rel else None,
        "sha256": sha256,
        "file_size": size_bytes,
        "page_count": None,
        "extraction_version": EXTRACTION_VERSION,
        "chunk_version": CHUNK_VERSION,
        "quality_gate_version": QUALITY_GATE_VERSION,
        "embedding_model": PILOT_EMBEDDING_MODEL,
        "embedding_backend": PILOT_EMBEDDING_BACKEND,
        "status": "pending",
        "started_at": None,
        "completed_at": None,
        "usable_chunk_count": 0,
        "needs_review_chunk_count": 0,
        "native_page_count": 0,
        "ocr_page_count": 0,
        "blank_skipped_page_count": 0,
        "indexed_chunk_ids": [],
        "path_history": [rel] if rel else [],
        "events": [],
        "error": None,
        "source_mode": None,  # validated_import | freshly_extracted
        "timings_sec": {},
    }


def should_skip_unchanged(rec: dict[str, Any] | None, *, sha256: str) -> bool:
    if not rec:
        return False
    if rec.get("sha256") != sha256:
        return False
    if rec.get("status") == "indexed":
        return True
    # needs_review with completed processing and same hash — still skip re-OCR
    if rec.get("status") == "needs_review" and rec.get("completed_at"):
        return True
    return False


def mark_stale_processing(manifest: dict[str, Any]) -> int:
    """Reset stuck 'processing' docs to pending for safe recovery."""
    n = 0
    for rec in manifest.get("documents", {}).values():
        if rec.get("status") == "processing":
            rec["status"] = "pending"
            rec["error"] = "recovered_from_interrupted_processing"
            n += 1
    return n
