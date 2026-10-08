"""
Read-only planner for verified Document IS metadata patches.

Does not open Chroma, read PDFs, or write manifests/chunks/registry.
"""

from __future__ import annotations

from typing import Any

PROTECTED_COLLECTIONS = frozenset(
    {
        "bis_two_sample_usable_v1",
        "bis_two_sample_usable_multilingual_exp_v1",
        "bis_pilot_representative_v1",
    }
)
TARGET_COLLECTION = "bis_pilot_representative_v2"

# Existing manifest ``document_type`` is a folder role. Do not overwrite it.
PROPOSED_KIND_FIELD = "reviewed_document_kind"


def _sha(value: str | None) -> str:
    return (value or "").strip().lower()


def plan_verified_document_is_patch(
    *,
    registry: dict[str, Any],
    manifest: dict[str, Any],
    chunk_bundles_by_sha: dict[str, dict[str, Any]],
    missing_sha_paths: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Match verified Document IS content records to v2 artifacts by SHA-256 only.

    ``chunk_bundles_by_sha`` values:
      {sha256, source_relative_path, chunk_count, chunk_ids, current_is_number}
    """
    collection = manifest.get("collection_name")
    if collection in PROTECTED_COLLECTIONS:
        raise ValueError(f"refusing plan against protected collection {collection}")
    if collection != TARGET_COLLECTION:
        raise ValueError(f"target collection must be {TARGET_COLLECTION}, got {collection!r}")

    docs = manifest.get("documents") or {}
    by_sha: dict[str, list[dict[str, Any]]] = {}
    for key, rec in docs.items():
        sha = _sha(rec.get("sha256") or str(key).removeprefix("sha256:"))
        if len(sha) != 64:
            continue
        by_sha.setdefault(sha, []).append(rec)

    proposals: list[dict[str, Any]] = []
    blocked: list[dict[str, Any]] = []

    verified = [
        c
        for c in registry.get("content_records") or []
        if (c.get("document_is") or {}).get("status") == "verified"
    ]

    for crec in verified:
        sha = _sha(crec.get("sha256"))
        doc_is = crec.get("document_is") or {}
        proposed_value = doc_is.get("value")
        kind = crec.get("document_type")
        occurrences = [
            o
            for o in registry.get("path_occurrences") or []
            if _sha(o.get("sha256")) == sha
        ]
        flags: list[str] = []
        if len(sha) != 64:
            blocked.append(
                {
                    "sha256": sha,
                    "reason": "invalid_registry_sha256",
                    "status": "blocked",
                    "proposed_document_is": proposed_value,
                }
            )
            continue
        if doc_is.get("provenance") != "human_review_with_evidence":
            flags.append("verified_without_human_review_provenance")
        if not proposed_value:
            blocked.append(
                {
                    "sha256": sha,
                    "reason": "verified_missing_value",
                    "status": "blocked",
                }
            )
            continue

        manifest_recs = by_sha.get(sha) or []
        bundle = chunk_bundles_by_sha.get(sha)
        if not manifest_recs or not bundle:
            blocked.append(
                {
                    "sha256": sha,
                    "content_id": crec.get("content_id"),
                    "proposed_document_is": proposed_value,
                    "reviewed_document_kind": kind,
                    "registry_paths": [o.get("source_relative_path") for o in occurrences],
                    "reason": "no_exact_hash_match"
                    if not manifest_recs
                    else "chunk_artifact_missing_for_hash",
                    "status": "blocked",
                    "manifest_match_count": len(manifest_recs),
                    "chunk_artifact_present": bool(bundle),
                }
            )
            continue

        bundle_sha = _sha(bundle.get("sha256"))
        if bundle_sha != sha:
            blocked.append(
                {
                    "sha256": sha,
                    "reason": "chunk_bundle_hash_mismatch",
                    "status": "blocked",
                    "bundle_sha256": bundle_sha,
                }
            )
            continue

        if len(manifest_recs) != 1:
            flags.append("multiple_manifest_records_for_hash")

        man = manifest_recs[0]
        man_sha = _sha(man.get("sha256"))
        if man_sha != sha:
            flags.append("manifest_key_hash_mismatch")
            blocked.append(
                {
                    "sha256": sha,
                    "reason": "manifest_hash_mismatch",
                    "status": "blocked",
                    "manifest_sha256": man_sha,
                }
            )
            continue

        manifest_paths = []
        for p in [man.get("source_relative_path"), *(man.get("source_aliases") or [])]:
            if p and p not in manifest_paths:
                manifest_paths.append(p)
        registry_paths = [o.get("source_relative_path") for o in occurrences if o.get("source_relative_path")]
        if set(registry_paths) != set(manifest_paths) and set(registry_paths) - set(manifest_paths):
            flags.append("registry_path_not_in_manifest_aliases")
        extra_aliases = [p for p in manifest_paths if p not in registry_paths]

        current = {
            "is_number": man.get("is_number"),
            "is_number_verified": bool(man.get("is_number_verified")),
            "reviewed_document_kind": man.get(PROPOSED_KIND_FIELD),
            "existing_manifest_document_type_folder_role": man.get("document_type"),
            "chunk_is_number": bundle.get("current_is_number"),
        }
        proposed = {
            "is_number": proposed_value,
            "is_number_verified": True,
            "is_number_provenance": "human_review_with_evidence",
            PROPOSED_KIND_FIELD: kind,
            "parent_std": None,
            "parent_std_status": "needs_review",
            "do_not_overwrite_manifest_document_type": True,
        }
        already = (
            current["is_number"] == proposed_value
            and current["is_number_verified"] is True
            and current["reviewed_document_kind"] == kind
            and bundle.get("current_is_number") == proposed_value
        )
        if already:
            flags.append("already_applied_idempotent_noop")

        chunk_ids = list(bundle.get("chunk_ids") or man.get("indexed_chunk_ids") or [])
        proposals.append(
            {
                "status": "proposed" if not already else "noop",
                "content_id": crec.get("content_id") or f"sha256:{sha}",
                "sha256": sha,
                "target_collection": TARGET_COLLECTION,
                "v2_document_id": man.get("document_id") or f"sha256:{sha}",
                "source_relative_path": man.get("source_relative_path"),
                "source_aliases": list(man.get("source_aliases") or []),
                "registry_path_occurrences": [
                    {
                        "occurrence_id": o.get("occurrence_id"),
                        "source_relative_path": o.get("source_relative_path"),
                        "path_status": o.get("path_status"),
                        "parent_std_value": (o.get("parent_std") or {}).get("value"),
                        "parent_std_status": (o.get("parent_std") or {}).get("status"),
                        "document_type": o.get("document_type"),
                    }
                    for o in occurrences
                ],
                "manifest_only_alias_paths": extra_aliases,
                "chunk_count": int(bundle.get("chunk_count") or len(chunk_ids)),
                "chunk_ids": chunk_ids,
                "reviewed_document_kind": kind,
                "not_full_standard_text": bool(crec.get("not_full_standard_text")),
                "current_metadata": current,
                "proposed_metadata": proposed,
                "flags": flags,
                "parent_std_proposed": False,
            }
        )

    unresolved = []
    for item in missing_sha_paths or []:
        unresolved.append(
            {
                "source_relative_path": item.get("source_relative_path"),
                "reason": item.get("reason") or "missing_sha256",
                "status": "unmapped",
                "note": "Not joined to a content identity and not included in any proposed patch.",
            }
        )

    return {
        "target_collection": TARGET_COLLECTION,
        "protected_collections_excluded": sorted(PROTECTED_COLLECTIONS),
        "parent_std_updates_proposed": 0,
        "proposals": proposals,
        "blocked": blocked,
        "unresolved_missing_sha": unresolved,
        "totals": {
            "verified_content_records": len(verified),
            "proposed_documents": sum(1 for p in proposals if p["status"] == "proposed"),
            "noop_documents": sum(1 for p in proposals if p["status"] == "noop"),
            "blocked_records": len(blocked),
            "unresolved_missing_sha": len(unresolved),
            "proposed_chunks": sum(p["chunk_count"] for p in proposals if p["status"] == "proposed"),
            "matched_documents": len(proposals),
            "unmatched_documents": len(blocked),
        },
    }
