"""
Second-pilot planning-only surface (no Chroma, no PDF IO, no OCR/embed).

Reads existing selection JSON + alias policy + optional v1 manifest metadata.
Writes nothing to collections. Safe before any Chroma client initialization.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from knowledge_engine.pilot.alias_policy import (
    AliasPolicyError,
    ContentIdentityRecord,
    assert_no_v1_writes,
    require_alias_policy_ready,
)
from knowledge_engine.pilot.collection_guards import assert_second_pilot_target
from knowledge_engine.pilot.constants import (
    PILOT_COLLECTION_NAME,
    SECOND_PILOT_COLLECTION_NAME,
)
from knowledge_engine.pilot.document_identity import normalize_rel_path
from knowledge_engine.pilot.selection_validate import (
    SelectionValidationError,
    validate_second_pilot_selection,
)

PlanAction = Literal[
    "reuse",
    "alias",
    "new-content-plan",
    "review-required",
    "blocked",
]


class V2PlanError(RuntimeError):
    """Fail-closed planning error (before any Chroma init)."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_v1_manifest_metadata(manifest_path: Path | None) -> dict[str, dict[str, Any]]:
    """Read-only path-keyed manifest docs. No Chroma."""
    if not manifest_path or not manifest_path.is_file():
        return {}
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    docs = data.get("documents") or {}
    return {normalize_rel_path(k): v for k, v in docs.items() if isinstance(v, dict)}


def _primary_path_for_record(rec: ContentIdentityRecord) -> str:
    if rec.v1_reuse_candidate_path:
        return rec.v1_reuse_candidate_path
    cans = [p.relative_path for p in rec.path_records if p.role == "canonical"]
    if cans:
        return cans[0]
    return rec.source_aliases[0]


def _decide_action(
    *,
    rel: str,
    wave: str | None,
    rec: ContentIdentityRecord | None,
    role: str | None,
    v1: dict[str, Any] | None,
) -> PlanAction:
    if rec is None:
        if v1 and (v1.get("sha256") or v1.get("indexed_chunk_ids")):
            return "reuse"
        if wave == "existing_pilot" and not v1:
            return "review-required"
        return "new-content-plan"

    primary = _primary_path_for_record(rec)

    if rec.decision == "A":
        if rel == primary:
            if rec.v1_reuse_candidate_path == rel or v1:
                return "reuse"
            return "new-content-plan"
        return "alias"

    # Decision B — path-specific records, shared content identity
    if rel in rec.v1_alias_only_paths:
        return "alias"
    if rec.v1_reuse_candidate_path == rel:
        return "reuse"
    if rec.v1_reuse_candidate_path and rel != rec.v1_reuse_candidate_path:
        return "alias"
    if v1:
        return "reuse"
    return "new-content-plan"


def build_second_pilot_plan(
    *,
    selection: dict[str, Any],
    existing_v1_selection: dict[str, Any] | None = None,
    v1_manifest_docs: dict[str, dict[str, Any]] | None = None,
    policy_path: Path | None = None,
    collection_name: str = SECOND_PILOT_COLLECTION_NAME,
) -> dict[str, Any]:
    """
    Planning-only. Must not open Chroma or PDFs.

    Per-path actions derived from alias policy + v1 manifest presence.
    Unique-content estimate for the seven known alias groups only.
    """
    try:
        assert_second_pilot_target(collection_name)
        assert_no_v1_writes(collection_name)
    except Exception as exc:  # noqa: BLE001
        raise V2PlanError(str(exc)) from exc

    try:
        validate_second_pilot_selection(selection, existing_v1_selection=existing_v1_selection)
    except SelectionValidationError as exc:
        raise V2PlanError(f"selection_invalid:{exc}") from exc

    try:
        policy, records, units = require_alias_policy_ready(
            selection=selection,
            policy_path=policy_path,
            observed_hashes_by_path=None,  # no PDF hashing in planning-only
        )
    except AliasPolicyError as exc:
        raise V2PlanError(f"alias_policy_fail:{exc}") from exc

    v1_docs = v1_manifest_docs or {}
    path_to_rec: dict[str, ContentIdentityRecord] = {}
    path_to_role: dict[str, str] = {}
    for rec in records:
        for pr in rec.path_records:
            path_to_rec[pr.relative_path] = rec
            path_to_role[pr.relative_path] = pr.role

    aliased_path_count = sum(len(r.source_aliases) for r in records)
    known_group_unique = len(records)
    known_group_extra_slots = aliased_path_count - known_group_unique
    selection_paths = [
        normalize_rel_path(str(r.get("relative_path") or ""))
        for r in (selection.get("selected") or [])
    ]
    selection_path_count = len(selection_paths)

    per_path: list[dict[str, Any]] = []
    action_counts: dict[str, int] = {
        "reuse": 0,
        "alias": 0,
        "new-content-plan": 0,
        "review-required": 0,
        "blocked": 0,
    }

    for row in selection.get("selected") or []:
        rel = normalize_rel_path(str(row.get("relative_path") or ""))
        wave = row.get("pilot_wave")
        cls = row.get("classification")
        rec = path_to_rec.get(rel)
        role = path_to_role.get(rel)
        v1 = v1_docs.get(rel)
        action = _decide_action(rel=rel, wave=wave, rec=rec, role=role, v1=v1)

        detail: dict[str, Any] = {
            "relative_path": rel,
            "pilot_wave": wave,
            "selection_classification": cls,
            "in_alias_policy": rec is not None,
            "action": action,
        }

        if rec is not None:
            detail.update(
                {
                    "group_id": rec.group_id,
                    "decision": rec.decision,
                    "sha256": rec.sha256,
                    "document_id": rec.document_id,
                    "shared_chunk_id_prefix": rec.shared_chunk_id_prefix,
                    "role": role,
                    "primary_path": _primary_path_for_record(rec),
                    "source_aliases": list(rec.source_aliases),
                    "path_std_context": next(
                        (p.path_std_context for p in rec.path_records if p.relative_path == rel),
                        None,
                    ),
                    "is_number_heuristic": rec.is_number_heuristic,
                    "is_number_verified": False,
                    "quality_review_status": rec.quality_review_status,
                    "quality_classification": rec.quality_classification,
                    "v1_reuse_candidate_path": rec.v1_reuse_candidate_path,
                    "v1_alias_only_paths": list(rec.v1_alias_only_paths),
                }
            )
            # Group 5/6 invariants — never promote heuristics / usable trust
            if rec.forbid_folder_inferred_is_number or rec.group_id.startswith("g5"):
                detail["is_number_heuristic"] = None
                detail["is_number_metadata_status"] = "unverified_null"
            if rec.quality_classification == "suspect" or rec.quality_review_status == "needs_review":
                detail["forced_review_status"] = rec.quality_review_status or "needs_review"
                detail["never_promote_to_usable"] = True
                if detail.get("selection_classification") == "usable":
                    detail["selection_classification_override"] = "suspect"
        else:
            if v1:
                detail["v1_manifest_status"] = v1.get("status")
                detail["v1_usable_chunk_count"] = v1.get("usable_chunk_count")
            elif wave == "existing_pilot":
                detail["reason"] = "existing_pilot_missing_v1_manifest_record"

        action_counts[action] = action_counts.get(action, 0) + 1
        per_path.append(detail)

    content_units = []
    for unit in units:
        content_units.append(
            {
                "group_id": unit["group_id"],
                "decision": unit["decision"],
                "sha256": unit["sha256"],
                "document_id": unit["document_id"],
                "extract_once": True,
                "embed_once": True,
                "source_aliases": unit["source_aliases"],
                "v1_reuse_candidate_path": unit.get("v1_reuse_candidate_path"),
                "quality_review_status": unit.get("quality_review_status"),
                "quality_classification": unit.get("quality_classification"),
            }
        )

    return {
        "plan_id": "second_pilot_plan_v1",
        "generated_at": _utc_now(),
        "mode": "planning_only",
        "chroma_initialized": False,
        "pdf_reads": False,
        "ocr": False,
        "embedding": False,
        "indexing_started": False,
        "collection_target": SECOND_PILOT_COLLECTION_NAME,
        "protected_collections_untouched": [
            "bis_two_sample_usable_v1",
            "bis_two_sample_usable_multilingual_exp_v1",
            PILOT_COLLECTION_NAME,
        ],
        "policy_id": policy.get("policy_id"),
        "selection_path_count": selection_path_count,
        "alias_policy_group_count": known_group_unique,
        "alias_policy_aliased_paths": aliased_path_count,
        "unique_content_estimate_from_known_alias_groups_only": {
            "formula": (
                f"{selection_path_count} path rows − {known_group_extra_slots} "
                "extra alias slots in 7 groups"
            ),
            "estimated_unique_if_only_these_7_groups_collapse": (
                selection_path_count - known_group_extra_slots
            ),
            "note": (
                "137 is estimated from the seven known same-hash groups only "
                "(150 − 13). Full-corpus hash dedupe was NOT claimed or computed "
                "in this plan."
            ),
        },
        "action_counts": action_counts,
        "content_units": content_units,
        "per_path_actions": per_path,
        "fail_closed": {
            "missing_or_invalid_alias_policy": "V2PlanError before Chroma",
            "selection_invalid": "V2PlanError before Chroma",
            "protected_collection_target": "blocked",
        },
    }


def write_plan_report(plan: dict[str, Any], out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out_path
