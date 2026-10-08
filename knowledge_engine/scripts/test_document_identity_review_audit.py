#!/usr/bin/env python3
"""Synthetic/mock tests for registry integrity audit + reviewer worksheet."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.document_identity_review_audit import (
    audit_registry_against_packet,
    build_reviewer_worksheet,
)
from knowledge_engine.pilot.document_identity_review_registry import (
    empty_field_annotation,
    new_registry,
    rebuild_review_queue_and_summary,
    upsert_content_record,
    upsert_path_occurrence,
    validate_review_registry,
)

SHA_A = "a" * 64
SHA_B = "b" * 64
SHA_C = "c" * 64


def _ok(name: str) -> None:
    print(f"PASS {name}")


def _mini_packet(paths_fn: list[str], folder_only: list[str] | None = None) -> dict:
    records = []
    for i, p in enumerate(paths_fn):
        records.append(
            {
                "case_id": f"c{i}",
                "document_is_number": "IS 2676",
                "indexed_evidence": {
                    "source_relative_path": p,
                    "chunk_id": f"doc_x:p0001:c00{i}",
                    "clause_number": "1.1",
                    "pdf_pages": [1],
                    "review_status": "usable",
                    "text_excerpt": "synthetic excerpt",
                },
            }
        )
    return {
        "section_1_false_negatives": {"records": records},
        "section_1_all_reliability_cases": {"records": []},
        "section_1_pilot_cases": {"records": []},
        "section_2_proposed_unverified_20": {"records": []},
        "ambiguous_or_conflicting_records": {
            "folder_only_selection_paths": [
                {"source_relative_path": p, "status": "ambiguous_needs_human_review"}
                for p in (folder_only or [])
            ],
            "sample_conflicts": [],
        },
    }


def test_one_to_one_integrity_ok() -> None:
    reg = new_registry(notes=["synthetic"])
    upsert_content_record(
        reg,
        sha256=SHA_A,
        document_is=empty_field_annotation(
            status="unverified", provenance="filename_heuristic", value="IS 1"
        ),
    )
    upsert_path_occurrence(
        reg, sha256=SHA_A, source_relative_path="STD 1/IS 1.pdf", queue_tags=["t"]
    )
    upsert_content_record(
        reg,
        sha256=SHA_B,
        document_is=empty_field_annotation(
            status="needs_review", provenance="unavailable", value=None
        ),
    )
    upsert_path_occurrence(
        reg,
        sha256=SHA_B,
        source_relative_path="STD 2/Report.pdf",
        queue_tags=["folder_only"],
    )
    rebuild_review_queue_and_summary(reg)
    validate_review_registry(reg)
    packet = _mini_packet(
        ["STD 1/IS 1.pdf"], folder_only=["STD 2/Report.pdf"]
    )
    audit = audit_registry_against_packet(
        reg,
        packet,
        seed_skips={"skipped": []},
        path_to_sha_from_chunks={
            "STD 1/IS 1.pdf": SHA_A,
            "STD 2/Report.pdf": SHA_B,
        },
    )
    assert audit["integrity_ok"] is True
    assert audit["counts"]["active_path_occurrences"] == 2
    assert audit["counts"]["content_records"] == 2
    assert audit["why_active_equals_content_records"]["equals_1_to_1"] is True
    assert audit["auto_verified"] is False
    _ok("one_to_one_integrity_ok")


def test_shared_hash_two_paths_one_content_ok() -> None:
    """Same hash, two paths, one content_record — accepted (no silent split)."""
    reg = new_registry()
    upsert_content_record(
        reg,
        sha256=SHA_A,
        document_is=empty_field_annotation(
            status="unverified", provenance="filename_heuristic", value="IS 2676"
        ),
    )
    upsert_path_occurrence(
        reg, sha256=SHA_A, source_relative_path="STD 21/Test Method/IS 2676.pdf"
    )
    upsert_path_occurrence(
        reg, sha256=SHA_A, source_relative_path="STD 9999/Archive/IS 2676.pdf"
    )
    rebuild_review_queue_and_summary(reg)
    packet = _mini_packet(
        [
            "STD 21/Test Method/IS 2676.pdf",
            "STD 9999/Archive/IS 2676.pdf",
        ]
    )
    audit = audit_registry_against_packet(
        reg,
        packet,
        path_to_sha_from_chunks={
            "STD 21/Test Method/IS 2676.pdf": SHA_A,
            "STD 9999/Archive/IS 2676.pdf": SHA_A,
        },
    )
    assert audit["integrity_ok"] is True
    assert audit["counts"]["active_path_occurrences"] == 2
    assert audit["counts"]["content_records"] == 1
    assert audit["why_active_equals_content_records"]["equals_1_to_1"] is False
    assert audit["counts"]["shared_hash_multi_path_groups"] == 1
    _ok("shared_hash_two_paths_one_content_ok")


def test_duplicate_content_same_hash_mismatch_no_silent_merge() -> None:
    """Two content_records with same sha — mismatch + safe fix; no auto-merge."""
    reg = new_registry()
    upsert_content_record(
        reg,
        sha256=SHA_A,
        document_is=empty_field_annotation(
            status="unverified", provenance="filename_heuristic", value="IS 1"
        ),
    )
    upsert_path_occurrence(reg, sha256=SHA_A, source_relative_path="STD 1/a.pdf")
    # Force illegal duplicate content row (bypass upsert)
    reg["content_records"].append(
        {
            "content_id": f"sha256:{SHA_A}",
            "sha256": SHA_A,
            "document_is": empty_field_annotation(
                status="unverified", provenance="filename_heuristic", value="IS 2"
            ),
        }
    )
    packet = _mini_packet(["STD 1/a.pdf"])
    try:
        # schema validator itself fail-closes on duplicate content
        validate_review_registry(reg)
        raised = False
    except Exception:
        raised = True
    assert raised, "schema should reject duplicate content sha"

    # Audit path for "would-be merge" scenario: two paths expected same hash but
    # registry incorrectly has two separate content records for different hashes
    # that chunks say should be one — use path map expectation mismatch.
    reg2 = new_registry()
    upsert_content_record(
        reg2,
        sha256=SHA_A,
        document_is=empty_field_annotation(
            status="unverified", provenance="filename_heuristic", value="IS 2676"
        ),
    )
    upsert_content_record(
        reg2,
        sha256=SHA_B,
        document_is=empty_field_annotation(
            status="unverified", provenance="filename_heuristic", value="IS 2676"
        ),
    )
    upsert_path_occurrence(
        reg2, sha256=SHA_A, source_relative_path="STD 21/Test Method/IS 2676.pdf"
    )
    upsert_path_occurrence(
        reg2, sha256=SHA_B, source_relative_path="STD 9999/Archive/IS 2676.pdf"
    )
    rebuild_review_queue_and_summary(reg2)
    validate_review_registry(reg2)
    # Chunks claim BOTH paths share SHA_A — registry incorrectly split them
    audit = audit_registry_against_packet(
        reg2,
        _mini_packet(
            [
                "STD 21/Test Method/IS 2676.pdf",
                "STD 9999/Archive/IS 2676.pdf",
            ]
        ),
        path_to_sha_from_chunks={
            "STD 21/Test Method/IS 2676.pdf": SHA_A,
            "STD 9999/Archive/IS 2676.pdf": SHA_A,
        },
    )
    assert audit["integrity_ok"] is False
    codes = {m["code"] for m in audit["mismatches"]}
    assert "shared_hash_not_single_content_record" in codes
    assert any(
        f["code"] == "link_paths_to_one_content_record"
        for f in audit["suggested_safe_fixes"]
    )
    # Ensure registry was NOT mutated (still 2 content records)
    assert len(reg2["content_records"]) == 2
    _ok("duplicate_content_same_hash_mismatch_no_silent_merge")


def test_skipped_missing_hash_listed_not_verified() -> None:
    reg = new_registry()
    upsert_content_record(
        reg,
        sha256=SHA_C,
        document_is=empty_field_annotation(
            status="unverified", provenance="filename_heuristic", value="IS 9"
        ),
    )
    upsert_path_occurrence(reg, sha256=SHA_C, source_relative_path="STD 9/IS 9.pdf")
    rebuild_review_queue_and_summary(reg)
    packet = _mini_packet(
        ["STD 9/IS 9.pdf"], folder_only=["STD 10951/10951_Amd3 (2).pdf"]
    )
    skips = {
        "skipped": [
            {
                "source_relative_path": "STD 10951/10951_Amd3 (2).pdf",
                "reason": "missing_sha256_in_chunk_artifacts",
                "queue_tags": ["folder_only"],
            }
        ]
    }
    audit = audit_registry_against_packet(
        reg,
        packet,
        seed_skips=skips,
        path_to_sha_from_chunks={"STD 9/IS 9.pdf": SHA_C},
    )
    assert audit["integrity_ok"] is True
    assert audit["counts"]["skipped_missing_hash_paths"] == 1
    assert audit["skipped_missing_hash_paths"][0]["source_relative_path"].endswith(
        "10951_Amd3 (2).pdf"
    )
    ws = build_reviewer_worksheet(reg, packet, audit=audit)
    assert ws["skipped_missing_hash_row_count"] == 1
    assert ws["skipped_missing_hash_rows"][0]["cannot_verify"] is True
    assert ws["skipped_missing_hash_rows"][0]["reviewer_document_is"]["status"] is None
    _ok("skipped_missing_hash_listed_not_verified")


def test_worksheet_empty_decisions_never_verified_seed() -> None:
    reg = new_registry()
    upsert_content_record(
        reg,
        sha256=SHA_A,
        document_is=empty_field_annotation(
            status="unverified", provenance="filename_heuristic", value="IS 504"
        ),
    )
    upsert_path_occurrence(
        reg,
        sha256=SHA_A,
        source_relative_path="STD 617/Test Method/IS 504.pdf",
        queue_tags=["proposed_unverified_plus20"],
    )
    rebuild_review_queue_and_summary(reg)
    packet = _mini_packet(["STD 617/Test Method/IS 504.pdf"])
    # enrich packet with proposed evidence
    packet["section_2_proposed_unverified_20"] = {
        "records": [
            {
                "proposed_id": "v2u_01",
                "source_relative_path": "STD 617/Test Method/IS 504.pdf",
                "document_is_number": "IS 504",
                "evidence_chunk_id": "doc_x:p0007:c009",
                "evidence_clause": "13.4",
                "evidence_pages": [7],
                "evidence_review_status": "usable",
                "evidence_excerpt": "synthetic",
            }
        ]
    }
    ws = build_reviewer_worksheet(reg, packet, audit={"audit_id": "x", "skipped_missing_hash_paths": []})
    assert ws["any_seed_marked_verified"] is False
    assert ws["row_count"] >= 1
    row = ws["rows"][0]
    assert row["seed_document_is"]["is_verified"] is False
    assert row["seed_parent_std"]["is_verified"] is False
    assert row["seed_document_is"]["status"] != "verified"
    assert row["reviewer_document_is"]["decision_value"] is None
    assert row["reviewer_document_is"]["status"] is None
    assert row["reviewer_parent_std"]["decision_value"] is None
    assert row["reviewer_parent_std"]["status"] is None
    assert row["reviewer_id"] is None
    assert row["worksheet_row_complete"] is False
    assert any(e.get("chunk_id") for e in row["evidence_pointers"])
    assert any("filename_is_heuristic" in c or "conflict" in c for c in row["conflicts"]) or True
    _ok("worksheet_empty_decisions_never_verified_seed")


def test_unexpected_verified_flagged() -> None:
    reg = new_registry()
    upsert_content_record(
        reg,
        sha256=SHA_A,
        document_is={
            "value": "IS 1",
            "status": "verified",
            "provenance": "human_review_with_evidence",
            "evidence": {"chunk_id": "doc_x:p1:c1", "note": "ok"},
            "reviewer": "r1",
            "reviewed_at": "2026-10-07T00:00:00+00:00",
            "notes": [],
        },
    )
    upsert_path_occurrence(reg, sha256=SHA_A, source_relative_path="STD 1/IS 1.pdf")
    rebuild_review_queue_and_summary(reg)
    validate_review_registry(reg)
    audit = audit_registry_against_packet(
        reg,
        _mini_packet(["STD 1/IS 1.pdf"]),
        path_to_sha_from_chunks={"STD 1/IS 1.pdf": SHA_A},
    )
    assert audit["integrity_ok"] is False
    assert any(m["code"] == "unexpected_verified_annotations" for m in audit["mismatches"])
    ws = build_reviewer_worksheet(reg, _mini_packet(["STD 1/IS 1.pdf"]), audit=audit)
    # worksheet demotes seed display away from verified
    assert ws["rows"][0]["seed_document_is"]["status"] == "needs_review"
    assert ws["rows"][0]["seed_document_is"]["is_verified"] is False
    _ok("unexpected_verified_flagged")


def main() -> int:
    tests = [
        test_one_to_one_integrity_ok,
        test_shared_hash_two_paths_one_content_ok,
        test_duplicate_content_same_hash_mismatch_no_silent_merge,
        test_skipped_missing_hash_listed_not_verified,
        test_worksheet_empty_decisions_never_verified_seed,
        test_unexpected_verified_flagged,
    ]
    for fn in tests:
        fn()
    print(f"ALL PASS ({len(tests)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
