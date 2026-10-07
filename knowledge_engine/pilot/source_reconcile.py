"""
Reconcile a filesystem scan against a document-id keyed manifest.

Detects: move, rename, content change, missing/stale, new documents.
Never deletes vectors immediately on missing — marks stale_source / missing.

This module is pure logic (no OneDrive / PDF IO). Safe for unit tests.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from knowledge_engine.pilot.document_identity import (
    build_document_record,
    document_id_from_sha256,
    normalize_rel_path,
)

ScanAction = Literal[
    "unchanged",
    "path_metadata_update",  # same hash, path and/or filename changed
    "content_changed",  # same path OR linked doc with new hash → reprocess
    "moved_or_renamed",  # old path gone, same hash at new path
    "missing_stale",  # previously known, not in scan, no matching hash
    "new_document",  # new hash not seen before
]

ProcessAction = Literal[
    "skip_reuse",  # no extraction / OCR / embed
    "reprocess_content",  # extraction + OCR + chunk + embed for this doc only
    "process_new",  # full process new doc
    "mark_missing",  # no vector delete
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ScanEntry:
    relative_path: str
    sha256: str
    file_size: int | None = None
    filename: str | None = None

    def __post_init__(self) -> None:
        self.relative_path = normalize_rel_path(self.relative_path)
        self.sha256 = (self.sha256 or "").strip().lower()
        if not self.filename:
            self.filename = self.relative_path.rsplit("/", 1)[-1]


@dataclass
class ReconcileDecision:
    action: ScanAction
    process: ProcessAction
    document_id: str | None
    sha256: str | None
    old_path: str | None = None
    new_path: str | None = None
    reason: str = ""
    duplicate_prevented: bool = False


@dataclass
class ReconcileResult:
    decisions: list[ReconcileDecision] = field(default_factory=list)
    documents: dict[str, dict[str, Any]] = field(default_factory=dict)  # by document_id
    events: list[dict[str, Any]] = field(default_factory=list)

    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for d in self.decisions:
            out[d.action] = out.get(d.action, 0) + 1
        return out


def _index_by_path(docs: dict[str, dict[str, Any]]) -> dict[str, str]:
    """path → document_id (active paths only; skip missing)."""
    idx: dict[str, str] = {}
    for did, rec in docs.items():
        if rec.get("status") in ("missing", "stale_source"):
            continue
        rel = normalize_rel_path(rec.get("source_relative_path") or "")
        if rel:
            idx[rel] = did
    return idx


def _index_by_hash(docs: dict[str, dict[str, Any]]) -> dict[str, str]:
    """sha256 → document_id (prefer non-missing)."""
    idx: dict[str, str] = {}
    for did, rec in docs.items():
        h = (rec.get("sha256") or "").lower()
        if not h:
            continue
        # Prefer active; allow missing to be resurrected by hash match
        if h not in idx or rec.get("status") not in ("missing", "stale_source"):
            idx[h] = did
    return idx


def documents_from_path_keyed_manifest(legacy: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """
    Convert v1 path-keyed manifest documents → document_id keyed map.
    Read-only helper for migration planning / reuse (does not write protected stores).
    """
    out: dict[str, dict[str, Any]] = {}
    for rel, raw in (legacy.get("documents") or {}).items():
        sha = (raw.get("sha256") or "").lower()
        if not sha:
            continue
        did = document_id_from_sha256(sha)
        rec = build_document_record(
            sha256=sha,
            source_relative_path=raw.get("source_relative_path") or rel,
            file_size=raw.get("file_size"),
            status=raw.get("status") or "indexed",
            extra={
                "usable_chunk_count": raw.get("usable_chunk_count"),
                "needs_review_chunk_count": raw.get("needs_review_chunk_count"),
                "indexed_chunk_ids": list(raw.get("indexed_chunk_ids") or []),
                "legacy_sample_label": raw.get("sample_label"),
                "legacy_path_key": rel,
                "page_count": raw.get("page_count"),
                "source_mode": raw.get("source_mode"),
                "completed_at": raw.get("completed_at"),
            },
        )
        # Preserve legacy chunk IDs for reuse into v2 without re-OCR.
        # New indexing for NEW docs uses content-based sample_label.
        out[did] = rec
    return out


def reconcile_scan(
    *,
    previous_documents: dict[str, dict[str, Any]],
    scan: list[ScanEntry],
    now: str | None = None,
) -> ReconcileResult:
    """
    Compare current scan entries to previous document_id-keyed records.

    Rules:
    - same hash + different path/filename → metadata update only (skip_reuse)
    - same path + different hash → content_changed (reprocess)
    - old path gone + same hash at new path → moved_or_renamed (skip_reuse)
    - previous doc not in scan and hash not seen → missing_stale (mark_missing)
    - new hash → new_document (process_new)
    """
    ts = now or utc_now()
    docs: dict[str, dict[str, Any]] = {
        k: dict(v) for k, v in previous_documents.items()
    }
    by_path = _index_by_path(docs)
    by_hash = _index_by_hash(docs)

    result = ReconcileResult(documents=docs)
    seen_hashes: set[str] = set()
    seen_paths: set[str] = set()
    handled_doc_ids: set[str] = set()

    for entry in scan:
        rel = entry.relative_path
        sha = entry.sha256
        seen_paths.add(rel)
        seen_hashes.add(sha)
        did = document_id_from_sha256(sha)

        path_match_id = by_path.get(rel)
        hash_match_id = by_hash.get(sha)

        # Case: same path, possibly same or different content
        if path_match_id is not None:
            prev = docs[path_match_id]
            prev_sha = (prev.get("sha256") or "").lower()
            if prev_sha == sha:
                # Unchanged content at same path (filename same by definition of path)
                prev["last_seen_at"] = ts
                prev["status"] = prev.get("status") if prev.get("status") not in (
                    "missing",
                    "stale_source",
                ) else "indexed"
                result.decisions.append(
                    ReconcileDecision(
                        action="unchanged",
                        process="skip_reuse",
                        document_id=path_match_id,
                        sha256=sha,
                        old_path=rel,
                        new_path=rel,
                        reason="same_path_same_hash",
                    )
                )
                handled_doc_ids.add(path_match_id)
                continue

            # Content changed at same path — retire old identity, create/update new
            prev["status"] = "superseded"
            prev["superseded_at"] = ts
            prev["superseded_by"] = did
            event = {
                "type": "content_changed",
                "at": ts,
                "old_sha256": prev_sha,
                "new_sha256": sha,
                "path": rel,
            }
            prev.setdefault("events", []).append(event)
            result.events.append(event)

            if did in docs and docs[did].get("document_id") == did:
                new_rec = docs[did]
            else:
                new_rec = build_document_record(
                    sha256=sha,
                    source_relative_path=rel,
                    file_size=entry.file_size,
                    status="pending",
                )
                docs[did] = new_rec
            new_rec["source_relative_path"] = rel
            new_rec["filename"] = entry.filename
            new_rec["file_size"] = entry.file_size
            new_rec["last_seen_at"] = ts
            new_rec["status"] = "pending"
            new_rec.setdefault("events", []).append(event)
            result.decisions.append(
                ReconcileDecision(
                    action="content_changed",
                    process="reprocess_content",
                    document_id=did,
                    sha256=sha,
                    old_path=rel,
                    new_path=rel,
                    reason="same_path_different_hash",
                )
            )
            handled_doc_ids.add(did)
            handled_doc_ids.add(path_match_id)
            continue

        # Case: hash already known under a different path → move/rename
        if hash_match_id is not None:
            prev = docs[hash_match_id]
            old_path = normalize_rel_path(prev.get("source_relative_path") or "")
            old_name = prev.get("filename") or old_path.rsplit("/", 1)[-1]
            new_name = entry.filename or rel.rsplit("/", 1)[-1]
            only_filename = old_path.rsplit("/", 1)[0] == rel.rsplit("/", 1)[0] and old_name != new_name
            action: ScanAction = "path_metadata_update" if only_filename or old_path != rel else "unchanged"
            if old_path != rel:
                action = "moved_or_renamed" if old_path not in seen_paths else "path_metadata_update"
                # If we're seeing new path while scanning sequentially, treat as move
                action = "moved_or_renamed" if old_path != rel else action

            event = {
                "type": "move_or_rename" if old_path != rel else "filename_rename",
                "at": ts,
                "old_path": old_path,
                "new_path": rel,
                "sha256": sha,
            }
            hist = list(prev.get("path_history") or [])
            if rel not in hist:
                hist.append(rel)
            prev["path_history"] = hist
            prev["source_relative_path"] = rel
            prev["filename"] = new_name
            prev["file_size"] = entry.file_size if entry.file_size is not None else prev.get("file_size")
            prev["last_seen_at"] = ts
            prev["missing_since"] = None
            if prev.get("status") in ("missing", "stale_source"):
                prev["status"] = "indexed" if prev.get("indexed_chunk_ids") else "pending"
            prev.setdefault("events", []).append(event)
            result.events.append(event)
            result.decisions.append(
                ReconcileDecision(
                    action=action if action != "unchanged" else "path_metadata_update",
                    process="skip_reuse",
                    document_id=hash_match_id,
                    sha256=sha,
                    old_path=old_path,
                    new_path=rel,
                    reason="same_hash_different_path_or_name",
                    duplicate_prevented=True,
                )
            )
            handled_doc_ids.add(hash_match_id)
            continue

        # Genuinely new content hash
        new_rec = build_document_record(
            sha256=sha,
            source_relative_path=rel,
            file_size=entry.file_size,
            status="pending",
        )
        new_rec["last_seen_at"] = ts
        docs[did] = new_rec
        event = {"type": "new_document", "at": ts, "path": rel, "sha256": sha}
        new_rec.setdefault("events", []).append(event)
        result.events.append(event)
        result.decisions.append(
            ReconcileDecision(
                action="new_document",
                process="process_new",
                document_id=did,
                sha256=sha,
                new_path=rel,
                reason="new_content_hash",
            )
        )
        handled_doc_ids.add(did)

    # Missing: previous active docs whose path and hash not seen
    for did, rec in list(docs.items()):
        if did in handled_doc_ids:
            continue
        if rec.get("status") in ("superseded", "missing", "stale_source"):
            continue
        sha = (rec.get("sha256") or "").lower()
        rel = normalize_rel_path(rec.get("source_relative_path") or "")
        if sha in seen_hashes:
            continue  # handled via move
        if rel in seen_paths:
            continue
        rec["status"] = "stale_source"
        rec["missing_since"] = ts
        event = {
            "type": "missing_stale",
            "at": ts,
            "path": rel,
            "sha256": sha,
            "note": "No matching hash in scan; do not delete vectors yet "
            "(may be OneDrive unhydrated, temporary, or true delete).",
        }
        rec.setdefault("events", []).append(event)
        result.events.append(event)
        result.decisions.append(
            ReconcileDecision(
                action="missing_stale",
                process="mark_missing",
                document_id=did,
                sha256=sha,
                old_path=rel,
                reason="path_and_hash_absent_from_scan",
            )
        )

    result.documents = docs
    return result


def should_run_extraction(decision: ReconcileDecision) -> bool:
    return decision.process in ("reprocess_content", "process_new")


def should_run_ocr(decision: ReconcileDecision) -> bool:
    return should_run_extraction(decision)


def should_run_embed(decision: ReconcileDecision) -> bool:
    return should_run_extraction(decision)


def would_create_duplicate_chunks(decision: ReconcileDecision) -> bool:
    """True if a naive path-keyed indexer would duplicate; reconcile prevents it."""
    return decision.duplicate_prevented or decision.process == "skip_reuse"
