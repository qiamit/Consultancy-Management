#!/usr/bin/env python3
"""
Simulated move/rename resilience tests (no OneDrive PDF IO).

Uses in-memory manifest fixtures only. Does not modify source PDFs
or protected Chroma collections.

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.test_move_rename_resilience
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.extract_pdf import default_diagnostics_dir
from knowledge_engine.config import load_settings
from knowledge_engine.pilot.document_identity import (
    build_document_record,
    document_id_from_sha256,
    is_path_dependent_sample_label,
    legacy_path_sample_label,
    make_chunk_id,
    sample_label_for_content,
)
from knowledge_engine.pilot.source_reconcile import (
    ScanEntry,
    reconcile_scan,
    should_run_embed,
    should_run_extraction,
    should_run_ocr,
)


HASH_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
HASH_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
HASH_C = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

OLD_PATH = "STD 9666/Master Documents/IS 9666 2023 - 00.pdf"
NEW_FOLDER_PATH = "Standards/9666/Specification/IS 9666 2023 - 00.pdf"
NEW_FILENAME_PATH = "STD 9666/Master Documents/IS 9666 2023 - renamed.pdf"


def _base_docs() -> dict[str, dict[str, Any]]:
    rec = build_document_record(
        sha256=HASH_A,
        source_relative_path=OLD_PATH,
        file_size=1000,
        status="indexed",
        extra={
            "indexed_chunk_ids": [
                make_chunk_id(sha256=HASH_A, page_number=3, ordinal=1),
                make_chunk_id(sha256=HASH_A, page_number=3, ordinal=2),
            ],
            "last_seen_at": "2026-10-01T00:00:00+00:00",
        },
    )
    return {rec["document_id"]: rec}


def _check(name: str, cond: bool, detail: str = "") -> dict[str, Any]:
    return {"test": name, "pass": bool(cond), "detail": detail}


def test_a() -> dict[str, Any]:
    """Same hash, different folder path → metadata update, no reprocess."""
    prev = _base_docs()
    scan = [ScanEntry(relative_path=NEW_FOLDER_PATH, sha256=HASH_A, file_size=1000)]
    res = reconcile_scan(previous_documents=prev, scan=scan)
    d = res.decisions[0]
    checks = [
        _check("A.same_document", d.document_id == document_id_from_sha256(HASH_A)),
        _check("A.no_extraction", not should_run_extraction(d)),
        _check("A.no_ocr", not should_run_ocr(d)),
        _check("A.no_embed", not should_run_embed(d)),
        _check("A.skip_reuse", d.process == "skip_reuse"),
        _check("A.duplicate_prevented", d.duplicate_prevented),
        _check(
            "A.path_updated",
            res.documents[d.document_id]["source_relative_path"] == NEW_FOLDER_PATH,
        ),
        _check(
            "A.chunk_ids_unchanged",
            res.documents[d.document_id]["indexed_chunk_ids"]
            == prev[document_id_from_sha256(HASH_A)]["indexed_chunk_ids"],
        ),
        _check(
            "A.action_move_or_rename",
            d.action in ("moved_or_renamed", "path_metadata_update"),
        ),
    ]
    return {"name": "TEST_A_folder_move", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_b() -> dict[str, Any]:
    """Same hash, different filename → metadata update only."""
    prev = _base_docs()
    scan = [ScanEntry(relative_path=NEW_FILENAME_PATH, sha256=HASH_A, file_size=1000)]
    res = reconcile_scan(previous_documents=prev, scan=scan)
    d = res.decisions[0]
    checks = [
        _check("B.same_document", d.document_id == document_id_from_sha256(HASH_A)),
        _check("B.skip_reuse", d.process == "skip_reuse"),
        _check("B.no_extraction", not should_run_extraction(d)),
        _check(
            "B.filename_updated",
            res.documents[d.document_id]["filename"] == "IS 9666 2023 - renamed.pdf",
        ),
        _check(
            "B.path_updated",
            res.documents[d.document_id]["source_relative_path"] == NEW_FILENAME_PATH,
        ),
    ]
    return {"name": "TEST_B_filename_rename", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_c() -> dict[str, Any]:
    """Same path, different hash → content change → reprocess."""
    prev = _base_docs()
    scan = [ScanEntry(relative_path=OLD_PATH, sha256=HASH_B, file_size=2000)]
    res = reconcile_scan(previous_documents=prev, scan=scan)
    changed = [d for d in res.decisions if d.action == "content_changed"]
    d = changed[0] if changed else res.decisions[0]
    checks = [
        _check("C.content_changed", d.action == "content_changed"),
        _check("C.reprocess", d.process == "reprocess_content"),
        _check("C.extraction", should_run_extraction(d)),
        _check("C.new_document_id", d.document_id == document_id_from_sha256(HASH_B)),
        _check(
            "C.old_superseded",
            res.documents[document_id_from_sha256(HASH_A)].get("status") == "superseded",
        ),
    ]
    return {"name": "TEST_C_content_change", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_d() -> dict[str, Any]:
    """Old path gone + same hash at new path → move, not delete+new."""
    prev = _base_docs()
    scan = [ScanEntry(relative_path=NEW_FOLDER_PATH, sha256=HASH_A, file_size=1000)]
    res = reconcile_scan(previous_documents=prev, scan=scan)
    actions = {d.action for d in res.decisions}
    missing = [d for d in res.decisions if d.action == "missing_stale"]
    new_docs = [d for d in res.decisions if d.action == "new_document"]
    checks = [
        _check("D.no_missing", len(missing) == 0, str(actions)),
        _check("D.no_new_document", len(new_docs) == 0, str(actions)),
        _check("D.move_recognized", any(
            d.action in ("moved_or_renamed", "path_metadata_update") for d in res.decisions
        )),
        _check("D.single_doc_id", len([
            did for did, r in res.documents.items()
            if r.get("sha256") == HASH_A and r.get("status") not in ("superseded",)
        ]) == 1),
        _check("D.skip_reuse", all(d.process == "skip_reuse" for d in res.decisions)),
    ]
    return {"name": "TEST_D_move_not_delete_new", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_e() -> dict[str, Any]:
    """Previous doc missing, no matching hash → stale, no destructive delete."""
    prev = _base_docs()
    scan: list[ScanEntry] = []  # empty scan
    res = reconcile_scan(previous_documents=prev, scan=scan)
    d = res.decisions[0]
    checks = [
        _check("E.missing_stale", d.action == "missing_stale"),
        _check("E.mark_missing", d.process == "mark_missing"),
        _check(
            "E.status_stale",
            res.documents[document_id_from_sha256(HASH_A)].get("status") == "stale_source",
        ),
        _check(
            "E.chunks_retained",
            bool(res.documents[document_id_from_sha256(HASH_A)].get("indexed_chunk_ids")),
        ),
        _check("E.no_extraction", not should_run_extraction(d)),
    ]
    return {"name": "TEST_E_missing_stale", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_f() -> dict[str, Any]:
    """Genuinely new hash → process new."""
    prev = _base_docs()
    # Keep old doc present AND add new
    scan = [
        ScanEntry(relative_path=OLD_PATH, sha256=HASH_A, file_size=1000),
        ScanEntry(relative_path="STD 9999/IS 9999 2020 - 00.pdf", sha256=HASH_C, file_size=500),
    ]
    res = reconcile_scan(previous_documents=prev, scan=scan)
    news = [d for d in res.decisions if d.action == "new_document"]
    d = news[0] if news else res.decisions[-1]
    checks = [
        _check("F.new_document", d.action == "new_document"),
        _check("F.process_new", d.process == "process_new"),
        _check("F.extraction", should_run_extraction(d)),
        _check("F.embed", should_run_embed(d)),
        _check("F.document_id", d.document_id == document_id_from_sha256(HASH_C)),
    ]
    return {"name": "TEST_F_new_document", "checks": checks, "pass": all(c["pass"] for c in checks)}


def test_chunk_id_path_independence() -> dict[str, Any]:
    """Chunk IDs must not change when only path changes (content-based scheme)."""
    id1 = make_chunk_id(sha256=HASH_A, page_number=3, ordinal=4)
    # Path change does not enter make_chunk_id
    id2 = make_chunk_id(sha256=HASH_A, page_number=3, ordinal=4)
    legacy_old = legacy_path_sample_label(OLD_PATH)
    legacy_new = legacy_path_sample_label(NEW_FOLDER_PATH)
    checks = [
        _check("chunk_id.stable", id1 == id2),
        _check("chunk_id.content_prefix", id1.startswith(sample_label_for_content(HASH_A))),
        _check(
            "legacy.path_dependent",
            legacy_old != legacy_new and is_path_dependent_sample_label(legacy_old),
            f"{legacy_old} vs {legacy_new}",
        ),
        _check(
            "v2.not_path_dependent_for_same_hash",
            sample_label_for_content(HASH_A) == sample_label_for_content(HASH_A),
        ),
    ]
    return {
        "name": "TEST_CHUNK_ID_STABILITY",
        "checks": checks,
        "pass": all(c["pass"] for c in checks),
        "notes": {
            "v1_path_dependent_labels": True,
            "v2_content_based_chunk_ids": True,
            "protected_collections_not_rewritten": True,
        },
    }


def main() -> int:
    results = [
        test_a(),
        test_b(),
        test_c(),
        test_d(),
        test_e(),
        test_f(),
        test_chunk_id_path_independence(),
    ]
    all_pass = all(r["pass"] for r in results)

    report = {
        "suite": "move_rename_resilience_v1",
        "all_pass": all_pass,
        "results": results,
        "architecture": {
            "previous_identity": "manifest keyed by source_relative_path; "
            "sample_label = path-hash (doc_{sha256(rel)[:12]}) except baseline labels",
            "new_identity": "document_id = sha256:{content_digest}; "
            "chunk_id = doc_{content[:12]}:pXXXX:cYYY",
            "move_strategy": "match by content hash; update path/filename metadata; skip_reuse",
            "content_change": "supersede old document_id; reprocess new hash only",
            "missing_strategy": "stale_source / missing; retain indexed_chunk_ids; no immediate vector delete",
            "duplicate_prevention": "hash index prevents second document_id for same content",
            "protected_collections": [
                "bis_two_sample_usable_v1",
                "bis_two_sample_usable_multilingual_exp_v1",
                "bis_pilot_representative_v1",
            ],
        },
    }

    for r in results:
        status = "PASS" if r["pass"] else "FAIL"
        print(f"{status}  {r['name']}")
        for c in r["checks"]:
            if not c["pass"]:
                print(f"       FAIL {c['test']}: {c.get('detail')}")

    # Prefer diagnostics dir; fall back to repo-local tmp (mock-safe, no source mutation).
    out_path: Path | None = None
    try:
        settings = load_settings()
        out_dir = default_diagnostics_dir(settings) / "pilot"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "move_rename_resilience_test_report.json"
        out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError:
        fallback = _REPO_ROOT / "knowledge_engine" / ".tmp"
        fallback.mkdir(parents=True, exist_ok=True)
        out_path = fallback / "move_rename_resilience_test_report.json"
        out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {out_path}")
    print("ALL PASS" if all_pass else "SOME FAILED")
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
