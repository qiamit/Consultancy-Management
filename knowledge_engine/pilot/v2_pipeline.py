"""
Second-pilot (v2) indexing pipeline — content-hash identity + move/rename resilience.

- Target collection: bis_pilot_representative_v2 ONLY
- Protected v1 collections / manifests / chunks are read-only reuse sources
- Injectable adapters enable mock tests without PDF/Chroma/OCR

Do NOT run live indexing from this module unless explicitly invoked by the
approved runner with --i-understand-start-indexing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from knowledge_engine.pilot.collection_guards import (
    ProtectedCollectionError,
    assert_collection_writable,
    assert_second_pilot_target,
)
from knowledge_engine.pilot.constants import (
    PILOT_COLLECTION_NAME,
    SECOND_PILOT_COLLECTION_NAME,
)
from knowledge_engine.pilot.document_identity import (
    document_id_from_sha256,
    make_chunk_id,
    normalize_rel_path,
    sample_label_for_content,
)
from knowledge_engine.pilot.alias_policy import (
    AliasPolicyError,
    ContentIdentityRecord,
    assert_no_v1_writes,
    dedupe_search_hits_by_content,
    require_alias_policy_ready,
)
from knowledge_engine.pilot.source_reconcile import (
    ReconcileDecision,
    ScanEntry,
    reconcile_scan,
    should_run_embed,
    should_run_extraction,
    should_run_ocr,
)


class ExtractAdapter(Protocol):
    def __call__(self, *, document_id: str, sha256: str, relative_path: str) -> dict[str, Any]: ...


class OcrAdapter(Protocol):
    def __call__(self, *, document_id: str, sha256: str, relative_path: str) -> dict[str, Any]: ...


class EmbedAdapter(Protocol):
    def __call__(
        self,
        *,
        document_id: str,
        sha256: str,
        relative_path: str,
        chunk_ids: list[str],
    ) -> list[str]: ...


class DeleteIdsAdapter(Protocol):
    def __call__(self, *, ids: list[str], reason: str) -> None: ...


@dataclass
class SpyCounters:
    extract_calls: int = 0
    ocr_calls: int = 0
    embed_calls: int = 0
    delete_calls: int = 0
    collection_writes: int = 0
    metadata_updates: int = 0
    extract_paths: list[str] = field(default_factory=list)
    embed_paths: list[str] = field(default_factory=list)
    deleted_id_batches: list[list[str]] = field(default_factory=list)


@dataclass
class V2PipelineAdapters:
    extract: ExtractAdapter
    ocr: OcrAdapter
    embed_upsert: EmbedAdapter
    delete_ids: DeleteIdsAdapter
    spies: SpyCounters = field(default_factory=SpyCounters)


def make_spy_adapters() -> V2PipelineAdapters:
    """In-memory adapters for unit tests (no PDF / Chroma / OCR)."""
    spies = SpyCounters()

    def extract(*, document_id: str, sha256: str, relative_path: str) -> dict[str, Any]:
        spies.extract_calls += 1
        spies.extract_paths.append(relative_path)
        return {"pages": 1, "text_ok": True}

    def ocr(*, document_id: str, sha256: str, relative_path: str) -> dict[str, Any]:
        spies.ocr_calls += 1
        return {"ocr_pages": 0}

    def embed_upsert(
        *,
        document_id: str,
        sha256: str,
        relative_path: str,
        chunk_ids: list[str],
    ) -> list[str]:
        spies.embed_calls += 1
        spies.collection_writes += 1
        spies.embed_paths.append(relative_path)
        return list(chunk_ids)

    def delete_ids(*, ids: list[str], reason: str) -> None:
        spies.delete_calls += 1
        spies.deleted_id_batches.append(list(ids))

    return V2PipelineAdapters(
        extract=extract,
        ocr=ocr,
        embed_upsert=embed_upsert,
        delete_ids=delete_ids,
        spies=spies,
    )


def verify_v1_reuse_evidence(
    *,
    sha256: str,
    v1_artifact: dict[str, Any] | None,
) -> tuple[bool, str]:
    """
    Allow reuse of v1 extraction/chunks only when artifact SHA-256 matches.

    Returns (ok, reason). Never claim reuse on mismatch/missing evidence.
    """
    if not v1_artifact:
        return False, "v1_artifact_missing"
    stored = (v1_artifact.get("sha256") or v1_artifact.get("source_file_hash_sha256") or "").lower()
    if not stored:
        return False, "v1_artifact_hash_missing"
    if stored != sha256.lower():
        return False, "v1_artifact_hash_mismatch"
    if not (v1_artifact.get("indexed_chunk_ids") or v1_artifact.get("chunks")):
        return False, "v1_artifact_chunks_missing"
    return True, "sha256_match"


@dataclass
class V2ProcessResult:
    decisions: list[ReconcileDecision]
    documents: dict[str, dict[str, Any]]
    spies: SpyCounters
    blocked: bool = False
    block_reason: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)


def apply_v2_reconcile_actions(
    *,
    previous_documents: dict[str, dict[str, Any]],
    scan: list[ScanEntry],
    adapters: V2PipelineAdapters,
    collection_name: str = SECOND_PILOT_COLLECTION_NAME,
    v1_artifacts_by_sha: dict[str, dict[str, Any]] | None = None,
    dry_run: bool = False,
    simulate_process_failure_for: str | None = None,
) -> V2ProcessResult:
    """
    Apply reconcile decisions through adapters.

    - skip_reuse / path update: metadata only (zero extract/ocr/embed)
    - content_changed: delete previous ids of *superseded content only after successful
      new process* — on failure, retain prior indexed chunks
    - missing_stale: mark only — never delete vectors
    - duplicate_hash_conflict: review_required — no process / no merge
    - new_document / reprocess: extract → ocr → embed (unless dry_run)
    """
    assert_second_pilot_target(collection_name)
    assert_collection_writable(collection_name, operation="v2_pipeline")
    if collection_name == PILOT_COLLECTION_NAME:
        raise ProtectedCollectionError("v2 pipeline must not write v1 collection")

    recon = reconcile_scan(previous_documents=previous_documents, scan=scan)
    docs = recon.documents
    spies = adapters.spies
    v1_artifacts_by_sha = v1_artifacts_by_sha or {}

    for decision in recon.decisions:
        did = decision.document_id
        if not did:
            continue
        rec = docs.get(did) or {}

        if decision.process == "review_required":
            rec["status"] = "review_required"
            docs[did] = rec
            continue

        if decision.process == "mark_missing":
            # Retain indexed_chunk_ids; no vector delete.
            rec["status"] = "stale_source"
            docs[did] = rec
            continue

        if decision.process == "skip_reuse":
            # Path/filename metadata already updated by reconcile_scan.
            spies.metadata_updates += 1
            docs[did] = rec
            continue

        if decision.process in ("process_new", "reprocess_content"):
            sha = (decision.sha256 or rec.get("sha256") or "").lower()
            rel = decision.new_path or rec.get("source_relative_path") or ""
            rel = normalize_rel_path(rel)

            # Optional v1 reuse — only with matching hash evidence.
            reuse_ok, reuse_reason = verify_v1_reuse_evidence(
                sha256=sha, v1_artifact=v1_artifacts_by_sha.get(sha)
            )
            rec["v1_reuse"] = {"ok": reuse_ok, "reason": reuse_reason}

            if dry_run:
                rec["status"] = "pending_dry_run"
                docs[did] = rec
                continue

            prior_ids = list(rec.get("indexed_chunk_ids") or [])
            # For content_changed, old doc is superseded; new doc starts empty.
            if decision.action == "content_changed":
                prior_ids = []

            try:
                if should_run_extraction(decision) and not reuse_ok:
                    adapters.extract(document_id=did, sha256=sha, relative_path=rel)
                    if should_run_ocr(decision):
                        adapters.ocr(document_id=did, sha256=sha, relative_path=rel)

                if simulate_process_failure_for and (
                    simulate_process_failure_for in (rel, did, sha)
                ):
                    raise RuntimeError("simulated_processing_failure")

                chunk_ids = [
                    make_chunk_id(sha256=sha, page_number=1, ordinal=1),
                    make_chunk_id(sha256=sha, page_number=1, ordinal=2),
                ]
                if reuse_ok:
                    # Reuse stored chunk ids from v1 artifact when present.
                    art = v1_artifacts_by_sha[sha]
                    chunk_ids = list(art.get("indexed_chunk_ids") or chunk_ids)

                if should_run_embed(decision) or reuse_ok:
                    written = adapters.embed_upsert(
                        document_id=did,
                        sha256=sha,
                        relative_path=rel,
                        chunk_ids=chunk_ids,
                    )
                    rec["indexed_chunk_ids"] = written
                    rec["sample_label"] = sample_label_for_content(sha)
                    rec["status"] = "indexed"
                    # Only after successful write may superseded chunk ids be removed.
                    # Never delete on failure; never delete on missing/stale.
                    if decision.action == "content_changed":
                        for other in docs.values():
                            if (
                                other.get("status") == "superseded"
                                and other.get("superseded_by") == did
                                and other.get("indexed_chunk_ids")
                                and not other.get("indexed_chunk_ids_deleted")
                            ):
                                adapters.delete_ids(
                                    ids=list(other["indexed_chunk_ids"]),
                                    reason="superseded_after_successful_reprocess",
                                )
                                other["indexed_chunk_ids_deleted"] = True
                docs[did] = rec
            except Exception as exc:  # noqa: BLE001
                # Failure: keep any previously indexed chunks; do not delete.
                rec["status"] = "failed"
                rec["error"] = str(exc)[:300]
                if prior_ids and not rec.get("indexed_chunk_ids"):
                    rec["indexed_chunk_ids"] = prior_ids
                rec["retained_chunks_after_failure"] = True
                docs[did] = rec

    return V2ProcessResult(
        decisions=list(recon.decisions),
        documents=docs,
        spies=spies,
        events=list(recon.events),
    )


def scan_entries_from_selection_rows(
    rows: list[dict[str, Any]],
    *,
    sha_lookup: dict[str, str],
) -> list[ScanEntry]:
    """Build scan entries from selection rows + precomputed sha map (tests/mocks)."""
    out: list[ScanEntry] = []
    for row in rows:
        rel = normalize_rel_path(str(row.get("relative_path") or ""))
        sha = sha_lookup.get(rel)
        if not sha:
            raise ValueError(f"missing sha for {rel}")
        out.append(
            ScanEntry(
                relative_path=rel,
                sha256=sha,
                file_size=row.get("size_bytes"),
            )
        )
    return out


def gate_v2_with_alias_policy(
    *,
    selection: dict[str, Any],
    collection_name: str = SECOND_PILOT_COLLECTION_NAME,
    observed_hashes_by_path: dict[str, str] | None = None,
    policy_path: Any = None,
) -> dict[str, Any]:
    """
    Fail-closed pre-index gate: alias policy must load and validate.
    Never writes v1. Does not start live indexing.
    """
    assert_second_pilot_target(collection_name)
    assert_no_v1_writes(collection_name)
    try:
        policy, records, units = require_alias_policy_ready(
            selection=selection,
            policy_path=policy_path,
            observed_hashes_by_path=observed_hashes_by_path,
        )
    except AliasPolicyError:
        raise
    return {
        "ok": True,
        "policy_id": policy.get("policy_id"),
        "content_units": len(units),
        "aliased_paths": sum(len(r.source_aliases) for r in records),
        "selection_rows": len(selection.get("selected") or []),
        "units": units,
        "records": records,
    }


def apply_alias_extract_once_plan(
    *,
    units: list[dict[str, Any]],
    adapters: V2PipelineAdapters,
    dry_run: bool = True,
) -> dict[str, Any]:
    """
    Mock-friendly: for each content unit call extract/embed at most once,
    regardless of how many alias paths exist (A or B).
    """
    spies = adapters.spies
    processed: list[dict[str, Any]] = []
    for unit in units:
        sha = unit["sha256"]
        did = unit["document_id"]
        aliases = list(unit["source_aliases"])
        primary = unit.get("v1_reuse_candidate_path") or aliases[0]
        if dry_run:
            processed.append(
                {
                    "document_id": did,
                    "sha256": sha,
                    "extract_planned_once": True,
                    "embed_planned_once": True,
                    "aliases": aliases,
                    "primary_path": primary,
                    "quality_review_status": unit.get("quality_review_status"),
                }
            )
            continue
        adapters.extract(document_id=did, sha256=sha, relative_path=primary)
        adapters.ocr(document_id=did, sha256=sha, relative_path=primary)
        chunk_ids = [
            f"{unit['shared_chunk_id_prefix']}:p0001:c001",
            f"{unit['shared_chunk_id_prefix']}:p0001:c002",
        ]
        adapters.embed_upsert(
            document_id=did,
            sha256=sha,
            relative_path=primary,
            chunk_ids=chunk_ids,
        )
        processed.append(
            {
                "document_id": did,
                "sha256": sha,
                "chunk_ids": chunk_ids,
                "aliases": aliases,
                "extract_calls_for_unit": 1,
            }
        )
    return {
        "processed": processed,
        "extract_calls": spies.extract_calls,
        "embed_calls": spies.embed_calls,
        "units": len(units),
    }


# Re-export for tests / planning boundary
__all__ = [
    "V2PipelineAdapters",
    "SpyCounters",
    "make_spy_adapters",
    "apply_v2_reconcile_actions",
    "verify_v1_reuse_evidence",
    "gate_v2_with_alias_policy",
    "apply_alias_extract_once_plan",
    "dedupe_search_hits_by_content",
    "ContentIdentityRecord",
    "assert_no_v1_writes",
    "AliasPolicyError",
    "require_alias_policy_ready",
]
