#!/usr/bin/env python3
"""Synthetic tests for the verified Document IS patch planner. No PDF/Chroma/API."""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.document_is_metadata_patch_plan import (
    plan_verified_document_is_patch,
)

SHA = "a" * 64
SHA_B = "b" * 64


def _ok(name: str) -> None:
    print(f"PASS {name}")


def _registry(value: str = "IS 1501 Part 2", kind: str = "standard_part") -> dict:
    return {
        "content_records": [
            {
                "content_id": f"sha256:{SHA}",
                "sha256": SHA,
                "document_type": kind,
                "not_full_standard_text": False,
                "document_is": {
                    "value": value,
                    "status": "verified",
                    "provenance": "human_review_with_evidence",
                },
            }
        ],
        "path_occurrences": [
            {
                "occurrence_id": "occ1",
                "sha256": SHA,
                "source_relative_path": "STD 1501/1501_2.pdf",
                "path_status": "active",
                "document_type": kind,
                "parent_std": {"value": "STD 1501", "status": "needs_review"},
            }
        ],
    }


def _manifest() -> dict:
    return {
        "collection_name": "bis_pilot_representative_v2",
        "documents": {
            f"sha256:{SHA}": {
                "document_id": f"sha256:{SHA}",
                "sha256": SHA,
                "source_relative_path": "STD 1501/1501_2.pdf",
                "source_aliases": ["STD 1501/1501_2.pdf"],
                "document_type": "standard_root",
                "is_number": None,
                "is_number_verified": False,
                "indexed_chunk_ids": ["doc_aaa:p0001:c001"],
            }
        },
    }


def test_part_preserved_and_parent_not_proposed() -> None:
    plan = plan_verified_document_is_patch(
        registry=_registry(),
        manifest=_manifest(),
        chunk_bundles_by_sha={
            SHA: {
                "sha256": SHA,
                "chunk_count": 1,
                "chunk_ids": ["doc_aaa:p0001:c001"],
                "current_is_number": None,
            }
        },
    )
    assert plan["totals"]["proposed_documents"] == 1
    prop = plan["proposals"][0]
    assert prop["proposed_metadata"]["is_number"] == "IS 1501 Part 2"
    assert prop["proposed_metadata"]["parent_std"] is None
    assert prop["parent_std_proposed"] is False
    assert prop["proposed_metadata"]["do_not_overwrite_manifest_document_type"] is True
    assert prop["current_metadata"]["existing_manifest_document_type_folder_role"] == "standard_root"
    _ok("part_preserved_and_parent_not_proposed")


def test_no_exact_hash_is_blocked() -> None:
    reg = _registry()
    reg["content_records"][0]["sha256"] = SHA_B
    reg["content_records"][0]["content_id"] = f"sha256:{SHA_B}"
    reg["path_occurrences"][0]["sha256"] = SHA_B
    reg["path_occurrences"][0]["source_relative_path"] = "STD 9/other.pdf"
    plan = plan_verified_document_is_patch(
        registry=reg,
        manifest=_manifest(),
        chunk_bundles_by_sha={},
        missing_sha_paths=[{"source_relative_path": "STD 10951/10951_Amd3 (2).pdf", "reason": "missing_sha256"}],
    )
    assert plan["totals"]["blocked_records"] == 1
    assert plan["blocked"][0]["status"] == "blocked"
    assert plan["unresolved_missing_sha"][0]["status"] == "unmapped"
    assert plan["totals"]["proposed_documents"] == 0
    _ok("no_exact_hash_is_blocked")


def test_protected_collection_refused() -> None:
    man = _manifest()
    man["collection_name"] = "bis_pilot_representative_v1"
    try:
        plan_verified_document_is_patch(
            registry=_registry(), manifest=man, chunk_bundles_by_sha={}
        )
        raise AssertionError("expected refusal")
    except ValueError as exc:
        assert "protected" in str(exc) or "target collection" in str(exc)
    _ok("protected_collection_refused")


def test_same_hash_two_paths_one_content() -> None:
    reg = _registry(value="IS 2676", kind="standard_specification")
    reg["path_occurrences"].append(
        {
            "occurrence_id": "occ2",
            "sha256": SHA,
            "source_relative_path": "STD 9999/Archive/IS 2676.pdf",
            "path_status": "active",
            "document_type": "standard_specification",
            "parent_std": {"value": "STD 9999", "status": "needs_review"},
        }
    )
    plan = plan_verified_document_is_patch(
        registry=reg,
        manifest=_manifest(),
        chunk_bundles_by_sha={
            SHA: {"sha256": SHA, "chunk_count": 2, "chunk_ids": ["c1", "c2"], "current_is_number": None}
        },
    )
    assert len(plan["proposals"]) == 1
    paths = [o["source_relative_path"] for o in plan["proposals"][0]["registry_path_occurrences"]]
    assert paths == ["STD 1501/1501_2.pdf", "STD 9999/Archive/IS 2676.pdf"]
    assert plan["proposals"][0]["registry_path_occurrences"][0]["parent_std_value"] != (
        plan["proposals"][0]["registry_path_occurrences"][1]["parent_std_value"]
    )
    _ok("same_hash_two_paths_one_content")


def main() -> int:
    for fn in (
        test_part_preserved_and_parent_not_proposed,
        test_no_exact_hash_is_blocked,
        test_protected_collection_refused,
        test_same_hash_two_paths_one_content,
    ):
        fn()
    print("ALL PASS (4)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
