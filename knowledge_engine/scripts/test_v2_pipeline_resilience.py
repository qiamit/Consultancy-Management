#!/usr/bin/env python3
"""
Pipeline-level move/rename resilience tests with spy adapters.

No real PDFs, OneDrive paths, or Chroma. Verifies extract/OCR/embed call counts
and that failures/missing do not delete prior indexed chunks.
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.document_identity import (
    build_document_record,
    document_id_from_sha256,
    make_chunk_id,
)
from knowledge_engine.pilot.source_reconcile import ScanEntry
from knowledge_engine.pilot.v2_pipeline import (
    apply_v2_reconcile_actions,
    make_spy_adapters,
    verify_v1_reuse_evidence,
)

HASH_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
HASH_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
HASH_C = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
OLD = "STD 9666/Master Documents/IS 9666 2023 - 00.pdf"
NEW_DIR = "Standards/9666/Specification/IS 9666 2023 - 00.pdf"
NEW_NAME = "STD 9666/Master Documents/IS 9666 2023 - renamed.pdf"


def _indexed_doc(sha: str, path: str) -> dict:
    did = document_id_from_sha256(sha)
    rec = build_document_record(
        sha256=sha,
        source_relative_path=path,
        file_size=100,
        status="indexed",
        extra={
            "indexed_chunk_ids": [
                make_chunk_id(sha256=sha, page_number=1, ordinal=1),
                make_chunk_id(sha256=sha, page_number=1, ordinal=2),
            ],
        },
    )
    return {did: rec}


def _check(name: str, cond: bool, detail: str = "") -> dict:
    return {"test": name, "pass": bool(cond), "detail": detail}


def test_a_folder_move() -> dict:
    adapters = make_spy_adapters()
    prev = _indexed_doc(HASH_A, OLD)
    prior_ids = list(prev[document_id_from_sha256(HASH_A)]["indexed_chunk_ids"])
    res = apply_v2_reconcile_actions(
        previous_documents=prev,
        scan=[ScanEntry(relative_path=NEW_DIR, sha256=HASH_A)],
        adapters=adapters,
    )
    spies = adapters.spies
    checks = [
        _check("A.extract_zero", spies.extract_calls == 0),
        _check("A.ocr_zero", spies.ocr_calls == 0),
        _check("A.embed_zero", spies.embed_calls == 0),
        _check("A.delete_zero", spies.delete_calls == 0),
        _check("A.metadata_update", spies.metadata_updates >= 1),
        _check(
            "A.path_updated",
            res.documents[document_id_from_sha256(HASH_A)]["source_relative_path"] == NEW_DIR,
        ),
        _check(
            "A.chunks_same",
            res.documents[document_id_from_sha256(HASH_A)]["indexed_chunk_ids"] == prior_ids,
        ),
    ]
    return {"name": "PIPE_A_folder_move", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_b_rename() -> dict:
    adapters = make_spy_adapters()
    prev = _indexed_doc(HASH_A, OLD)
    res = apply_v2_reconcile_actions(
        previous_documents=prev,
        scan=[ScanEntry(relative_path=NEW_NAME, sha256=HASH_A)],
        adapters=adapters,
    )
    spies = adapters.spies
    checks = [
        _check("B.no_process", spies.extract_calls == 0 and spies.embed_calls == 0),
        _check(
            "B.filename",
            res.documents[document_id_from_sha256(HASH_A)]["filename"]
            == "IS 9666 2023 - renamed.pdf",
        ),
    ]
    return {"name": "PIPE_B_filename_rename", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_c_content_change() -> dict:
    adapters = make_spy_adapters()
    prev = _indexed_doc(HASH_A, OLD)
    res = apply_v2_reconcile_actions(
        previous_documents=prev,
        scan=[ScanEntry(relative_path=OLD, sha256=HASH_B)],
        adapters=adapters,
    )
    spies = adapters.spies
    new_did = document_id_from_sha256(HASH_B)
    checks = [
        _check("C.extract", spies.extract_calls == 1),
        _check("C.embed", spies.embed_calls == 1),
        _check("C.old_superseded", res.documents[document_id_from_sha256(HASH_A)]["status"] == "superseded"),
        _check("C.new_indexed", res.documents[new_did]["status"] == "indexed"),
        _check("C.delete_after_success", spies.delete_calls == 1),
    ]
    return {"name": "PIPE_C_content_change", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_d_move_not_duplicate() -> dict:
    adapters = make_spy_adapters()
    prev = _indexed_doc(HASH_A, OLD)
    res = apply_v2_reconcile_actions(
        previous_documents=prev,
        scan=[ScanEntry(relative_path=NEW_DIR, sha256=HASH_A)],
        adapters=adapters,
    )
    active = [
        d
        for d in res.documents.values()
        if d.get("sha256") == HASH_A and d.get("status") not in ("superseded",)
    ]
    checks = [
        _check("D.single_active", len(active) == 1),
        _check("D.no_embed", adapters.spies.embed_calls == 0),
        _check("D.no_new_doc_action", not any(d.action == "new_document" for d in res.decisions)),
    ]
    return {"name": "PIPE_D_move", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_e_missing_no_delete() -> dict:
    adapters = make_spy_adapters()
    prev = _indexed_doc(HASH_A, OLD)
    prior = list(prev[document_id_from_sha256(HASH_A)]["indexed_chunk_ids"])
    res = apply_v2_reconcile_actions(
        previous_documents=prev,
        scan=[],
        adapters=adapters,
    )
    rec = res.documents[document_id_from_sha256(HASH_A)]
    checks = [
        _check("E.stale", rec.get("status") == "stale_source"),
        _check("E.chunks_kept", rec.get("indexed_chunk_ids") == prior),
        _check("E.no_delete", adapters.spies.delete_calls == 0),
        _check("E.no_extract", adapters.spies.extract_calls == 0),
    ]
    return {"name": "PIPE_E_missing", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_f_new_document() -> dict:
    adapters = make_spy_adapters()
    prev = _indexed_doc(HASH_A, OLD)
    res = apply_v2_reconcile_actions(
        previous_documents=prev,
        scan=[
            ScanEntry(relative_path=OLD, sha256=HASH_A),
            ScanEntry(relative_path="STD 9999/IS 9999.pdf", sha256=HASH_C),
        ],
        adapters=adapters,
    )
    checks = [
        _check("F.extract_once", adapters.spies.extract_calls == 1),
        _check("F.embed_once", adapters.spies.embed_calls == 1),
        _check(
            "F.new_indexed",
            res.documents[document_id_from_sha256(HASH_C)]["status"] == "indexed",
        ),
    ]
    return {"name": "PIPE_F_new", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_failure_retains_chunks() -> dict:
    adapters = make_spy_adapters()
    # New doc that will fail mid-process — no prior chunks to delete.
    # Content change failure must not delete superseded until success.
    prev = _indexed_doc(HASH_A, OLD)
    prior = list(prev[document_id_from_sha256(HASH_A)]["indexed_chunk_ids"])
    res = apply_v2_reconcile_actions(
        previous_documents=prev,
        scan=[ScanEntry(relative_path=OLD, sha256=HASH_B)],
        adapters=adapters,
        simulate_process_failure_for=OLD,
    )
    old = res.documents[document_id_from_sha256(HASH_A)]
    new = res.documents[document_id_from_sha256(HASH_B)]
    checks = [
        _check("fail.new_failed", new.get("status") == "failed"),
        _check("fail.old_chunks_present", old.get("indexed_chunk_ids") == prior),
        _check("fail.no_delete", adapters.spies.delete_calls == 0),
        _check("fail.old_not_deleted_flag", not old.get("indexed_chunk_ids_deleted")),
    ]
    return {"name": "PIPE_failure_retains", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_duplicate_hash_conflict() -> dict:
    adapters = make_spy_adapters()
    prev = _indexed_doc(HASH_A, OLD)
    res = apply_v2_reconcile_actions(
        previous_documents=prev,
        scan=[
            ScanEntry(relative_path=OLD, sha256=HASH_A),
            ScanEntry(relative_path=NEW_DIR, sha256=HASH_A),
        ],
        adapters=adapters,
    )
    checks = [
        _check(
            "dup.review",
            any(d.action == "duplicate_hash_conflict" for d in res.decisions),
        ),
        _check("dup.no_extract", adapters.spies.extract_calls == 0),
        _check("dup.no_embed", adapters.spies.embed_calls == 0),
        _check(
            "dup.status",
            res.documents[document_id_from_sha256(HASH_A)].get("status") == "review_required",
        ),
    ]
    return {"name": "PIPE_duplicate_hash", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_v1_reuse_hash_gate() -> dict:
    ok, reason = verify_v1_reuse_evidence(
        sha256=HASH_A,
        v1_artifact={"sha256": HASH_A, "indexed_chunk_ids": ["x"]},
    )
    bad, reason2 = verify_v1_reuse_evidence(
        sha256=HASH_A,
        v1_artifact={"sha256": HASH_B, "indexed_chunk_ids": ["x"]},
    )
    missing, reason3 = verify_v1_reuse_evidence(sha256=HASH_A, v1_artifact=None)
    checks = [
        _check("reuse.ok", ok and reason == "sha256_match"),
        _check("reuse.mismatch", (not bad) and reason2 == "v1_artifact_hash_mismatch"),
        _check("reuse.missing", (not missing) and reason3 == "v1_artifact_missing"),
    ]
    return {"name": "PIPE_v1_reuse_gate", "checks": checks, "pass": all(c["pass"] for c in checks)}


def main() -> int:
    results = [
        test_a_folder_move(),
        test_b_rename(),
        test_c_content_change(),
        test_d_move_not_duplicate(),
        test_e_missing_no_delete(),
        test_f_new_document(),
        test_failure_retains_chunks(),
        test_duplicate_hash_conflict(),
        test_v1_reuse_hash_gate(),
    ]
    all_pass = all(r["pass"] for r in results)
    for r in results:
        print(f"{'PASS' if r['pass'] else 'FAIL'}  {r['name']}")
        for c in r["checks"]:
            if not c["pass"]:
                print(f"       FAIL {c['test']}: {c.get('detail')}")
    print("ALL PASS" if all_pass else "SOME FAILED")
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
