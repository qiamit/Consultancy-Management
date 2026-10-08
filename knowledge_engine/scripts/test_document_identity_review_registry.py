#!/usr/bin/env python3
"""Synthetic/mock tests for document identity review registry (Phase A).

No real PDFs, Chroma, API, OCR, embedding, indexing, gold, or git.
"""

from __future__ import annotations

import copy
import json
import sys
import tempfile
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.document_identity_review_registry import (
    REGISTRY_ID,
    SCHEMA_VERSION,
    ReviewRegistryValidationError,
    empty_field_annotation,
    example_registry_dict,
    link_path_rename,
    load_registry,
    make_occurrence_id,
    new_registry,
    rebuild_review_queue_and_summary,
    upsert_content_record,
    upsert_path_occurrence,
    validate_review_registry,
)

SHA1 = "1" * 64
SHA2 = "2" * 64
SHA3 = "3" * 64


def _ok(name: str) -> None:
    print(f"PASS {name}")


def test_example_and_module_example_validate() -> None:
    reg = example_registry_dict()
    stats = validate_review_registry(reg)
    assert stats["ok"] is True
    assert reg["registry_id"] == REGISTRY_ID
    assert reg["schema_version"] == SCHEMA_VERSION

    example_path = (
        Path(__file__).resolve().parents[1]
        / "pilot"
        / "document_identity_review_registry_v1.example.json"
    )
    data = json.loads(example_path.read_text(encoding="utf-8"))
    # Rebuild queue so summary is consistent, then validate structure
    validate_review_registry(data)
    _ok("example_and_module_example_validate")


def test_content_vs_occurrence_separation() -> None:
    reg = new_registry(notes=["synthetic"])
    upsert_content_record(
        reg,
        sha256=SHA1,
        document_is=empty_field_annotation(
            status="unverified", provenance="filename_heuristic", value="IS 2676"
        ),
    )
    upsert_path_occurrence(
        reg,
        sha256=SHA1,
        source_relative_path="STD 21/Test Method/IS 2676.pdf",
    )
    upsert_path_occurrence(
        reg,
        sha256=SHA1,
        source_relative_path="STD 9999/Copy/IS 2676.pdf",
    )
    validate_review_registry(reg)
    parents = {
        o["source_relative_path"]: o["parent_std"]["value"]
        for o in reg["path_occurrences"]
    }
    assert parents["STD 21/Test Method/IS 2676.pdf"] == "STD 21"
    assert parents["STD 9999/Copy/IS 2676.pdf"] == "STD 9999"
    assert len(reg["content_records"]) == 1
    assert reg["content_records"][0]["document_is"]["value"] == "IS 2676"
    _ok("content_vs_occurrence_separation")


def test_heuristic_cannot_be_verified() -> None:
    reg = new_registry()
    upsert_content_record(
        reg,
        sha256=SHA1,
        document_is=empty_field_annotation(
            status="verified",
            provenance="filename_heuristic",
            value="IS 9666",
        ),
    )
    upsert_path_occurrence(
        reg, sha256=SHA1, source_relative_path="STD 9666/IS 9666.pdf"
    )
    try:
        validate_review_registry(reg)
        raise AssertionError("expected validation failure")
    except ReviewRegistryValidationError as exc:
        assert "cannot be status=verified" in str(exc)
    _ok("heuristic_cannot_be_verified")


def test_verified_requires_human_evidence_and_reviewer() -> None:
    reg = new_registry()
    upsert_content_record(
        reg,
        sha256=SHA1,
        document_is={
            "value": "IS 9666",
            "status": "verified",
            "provenance": "human_review_with_evidence",
            "evidence": None,
            "reviewer": None,
            "reviewed_at": None,
            "notes": [],
        },
    )
    upsert_path_occurrence(
        reg, sha256=SHA1, source_relative_path="STD 9666/IS 9666.pdf"
    )
    try:
        validate_review_registry(reg)
        raise AssertionError("expected validation failure")
    except ReviewRegistryValidationError as exc:
        assert "missing evidence" in str(exc) or "incomplete" in str(exc)

    reg2 = new_registry()
    upsert_content_record(
        reg2,
        sha256=SHA1,
        document_is={
            "value": "IS 9666",
            "status": "verified",
            "provenance": "human_review_with_evidence",
            "evidence": {"chunk_id": "doc_abc:p0001:c001", "note": "clause 1.1"},
            "reviewer": "reviewer.a",
            "reviewed_at": "2026-10-07T12:00:00+00:00",
            "notes": [],
        },
    )
    upsert_path_occurrence(
        reg2, sha256=SHA1, source_relative_path="STD 9666/IS 9666.pdf"
    )
    validate_review_registry(reg2)
    _ok("verified_requires_human_evidence_and_reviewer")


def test_duplicate_active_path_fails() -> None:
    reg = new_registry()
    upsert_content_record(reg, sha256=SHA1)
    upsert_content_record(reg, sha256=SHA2)
    upsert_path_occurrence(
        reg, sha256=SHA1, source_relative_path="STD 1/a.pdf"
    )
    # Force a second active row with same path but different occurrence_id
    reg["path_occurrences"].append(
        {
            "occurrence_id": "occ_forced_duplicate",
            "sha256": SHA2,
            "source_relative_path": "STD 1/a.pdf",
            "path_status": "active",
            "replaced_by_occurrence_id": None,
            "replaces_occurrence_id": None,
            "parent_std": empty_field_annotation(
                status="unverified",
                provenance="path_folder_heuristic",
                value="STD 1",
            ),
            "filename_is_heuristic": None,
            "queue_tags": [],
            "seed_notes": [],
        }
    )
    reg["path_occurrences"][-1]["parent_std"]["number"] = "1"
    try:
        validate_review_registry(reg)
        raise AssertionError("expected duplicate path failure")
    except ReviewRegistryValidationError as exc:
        assert "duplicate/ambiguous active path" in str(exc)
    _ok("duplicate_active_path_fails")


def test_invalid_hash_and_missing_provenance_fail() -> None:
    reg = new_registry()
    reg["content_records"].append(
        {
            "content_id": "sha256:not-a-hash",
            "sha256": "not-a-hash",
            "document_is": empty_field_annotation(),
        }
    )
    try:
        validate_review_registry(reg)
        raise AssertionError("expected invalid hash failure")
    except ReviewRegistryValidationError as exc:
        assert "invalid sha256" in str(exc)

    reg2 = new_registry()
    upsert_content_record(reg2, sha256=SHA1)
    # Strip provenance
    reg2["content_records"][0]["document_is"]["provenance"] = None
    upsert_path_occurrence(
        reg2, sha256=SHA1, source_relative_path="STD 1/x.pdf"
    )
    try:
        validate_review_registry(reg2)
        raise AssertionError("expected missing provenance failure")
    except ReviewRegistryValidationError as exc:
        assert "provenance" in str(exc)
    _ok("invalid_hash_and_missing_provenance_fail")


def test_path_rename_preserves_old_occurrence() -> None:
    reg = new_registry()
    upsert_content_record(
        reg,
        sha256=SHA3,
        document_is=empty_field_annotation(
            status="needs_review", provenance="unavailable", value=None
        ),
    )
    old = upsert_path_occurrence(
        reg,
        sha256=SHA3,
        source_relative_path="STD 50/Old Name.pdf",
        queue_tags=["folder_only"],
        seed_notes=["original annotation"],
    )
    old_id = old["occurrence_id"]
    new = link_path_rename(
        reg,
        old_occurrence_id=old_id,
        new_source_relative_path="STD 50/New Name.pdf",
    )
    validate_review_registry(reg)
    by_id = {o["occurrence_id"]: o for o in reg["path_occurrences"]}
    assert by_id[old_id]["path_status"] == "superseded"
    assert by_id[old_id]["seed_notes"] == ["original annotation"]
    assert by_id[old_id]["replaced_by_occurrence_id"] == new["occurrence_id"]
    assert new["replaces_occurrence_id"] == old_id
    assert new["path_status"] == "active"
    assert any(l["relation"] == "renamed_to" for l in reg["occurrence_links"])
    # Content Document IS unchanged / still on content record
    assert len(reg["content_records"]) == 1
    _ok("path_rename_preserves_old_occurrence")


def test_status_provenance_separate_and_queue() -> None:
    reg = new_registry()
    upsert_content_record(
        reg,
        sha256=SHA1,
        document_is=empty_field_annotation(
            status="unverified", provenance="filename_heuristic", value="IS 504"
        ),
    )
    upsert_path_occurrence(
        reg,
        sha256=SHA1,
        source_relative_path="STD 617/Test Method/IS 504.pdf",
        queue_tags=["proposed_unverified_seed"],
    )
    rebuild_review_queue_and_summary(reg)
    validate_review_registry(reg)
    assert reg["unresolved_summary"]["filename_vs_parent_conflicts"] >= 1
    assert reg["unresolved_summary"]["queue_item_count"] >= 1
    item = reg["review_queue"][0]
    assert item["ui_hint"] == "Unverified / needs review"
    assert item["document_is_status"] == "unverified"
    assert item["parent_std_status"] == "unverified"
    _ok("status_provenance_separate_and_queue")


def test_dump_refuses_forbidden_and_overwrite() -> None:
    from knowledge_engine.pilot.document_identity_review_registry import (
        assert_safe_output_path,
        dump_registry,
    )

    try:
        assert_safe_output_path(Path("alias_policy_v1.json"))
        raise AssertionError("expected forbidden name")
    except ReviewRegistryValidationError:
        pass

    reg = example_registry_dict()
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "document_identity_review_registry_v1.json"
        dump_registry(out, reg)
        loaded = load_registry(out)
        assert loaded["registry_id"] == REGISTRY_ID
        try:
            dump_registry(out, reg)
            raise AssertionError("expected overwrite refusal")
        except ReviewRegistryValidationError as exc:
            assert "refusing overwrite" in str(exc)
    _ok("dump_refuses_forbidden_and_overwrite")


def test_seed_merge_conflict_document_is() -> None:
    reg = new_registry()
    upsert_content_record(
        reg,
        sha256=SHA1,
        document_is=empty_field_annotation(
            status="unverified", provenance="filename_heuristic", value="IS 1111"
        ),
    )
    upsert_content_record(
        reg,
        sha256=SHA1,
        document_is=empty_field_annotation(
            status="unverified", provenance="filename_heuristic", value="IS 2222"
        ),
    )
    doc = reg["content_records"][0]["document_is"]
    assert doc["status"] == "needs_review"
    assert "conflicting" in " ".join(doc.get("notes") or [])
    upsert_path_occurrence(reg, sha256=SHA1, source_relative_path="STD 1/x.pdf")
    validate_review_registry(reg)
    _ok("seed_merge_conflict_document_is")


def main() -> int:
    tests = [
        test_example_and_module_example_validate,
        test_content_vs_occurrence_separation,
        test_heuristic_cannot_be_verified,
        test_verified_requires_human_evidence_and_reviewer,
        test_duplicate_active_path_fails,
        test_invalid_hash_and_missing_provenance_fail,
        test_path_rename_preserves_old_occurrence,
        test_status_provenance_separate_and_queue,
        test_dump_refuses_forbidden_and_overwrite,
        test_seed_merge_conflict_document_is,
    ]
    for fn in tests:
        fn()
    print(f"ALL PASS ({len(tests)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
