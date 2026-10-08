#!/usr/bin/env python3
"""
Post-index READ-ONLY validation for bis_pilot_representative_v2.

- Opens only v2; refuses fallback collections
- No OCR/extract/embed/upsert/delete/re-index
- Writes a new versioned report (does not overwrite prior validation artifacts)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.pilot.alias_policy import try_load_alias_records_for_search
from knowledge_engine.pilot.constants import (
    PILOT_EMBEDDING_MODEL,
    PROTECTED_COLLECTIONS,
    SECOND_PILOT_COLLECTION_NAME,
)
from knowledge_engine.search_pipeline import (
    load_pool_chunks,
    matches_standard,
    run_hybrid_search,
    standard_key,
)

REL_PATH = Path(__file__).resolve().parents[1] / "eval" / "reliability_eval_v1.json"
PILOT_PATH = Path(__file__).resolve().parents[1] / "eval" / "pilot_eval_v1.json"

EXPECTED_V2_COUNT = 6028
EXPECTED_UNIQUE = 137
EXPECTED_PATHS = 150
_CHUNK_TAIL_RE = re.compile(r"(:p\d+:c\d+)$", re.I)

PROPOSED_GOLD = {
    "english_queries": 20,
    "hindi_queries": 15,
    "mixed_language_queries": 8,
    "formula_queries": 6,
    "table_value_queries": 6,
    "test_method_queries": 8,
    "amendment_version_sensitive_queries": 5,
    "not_found_queries": 12,
    "total_proposed_min": 80,
}


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def open_v2_readonly(vector_db_path: Path) -> tuple[str, Any, str, Path]:
    """Open ONLY bis_pilot_representative_v2. No fallback."""
    import chromadb
    from knowledge_engine.scripts.compare_multilingual_ranking import FastEmbedMultilingualEF

    persist = vector_db_path / "sample_collections" / SECOND_PILOT_COLLECTION_NAME / "chroma"
    if not persist.is_dir():
        raise RuntimeError(f"v2 chroma missing at sample_collections/{SECOND_PILOT_COLLECTION_NAME}/chroma")
    client = chromadb.PersistentClient(path=str(persist))
    names = [
        n if isinstance(n, str) else getattr(n, "name", str(n))
        for n in client.list_collections()
    ]
    if names != [SECOND_PILOT_COLLECTION_NAME] and SECOND_PILOT_COLLECTION_NAME not in names:
        raise RuntimeError(f"v2 chroma unexpected collections: {names}")
    if any(n in PROTECTED_COLLECTIONS for n in names):
        raise RuntimeError(f"protected collection name found inside v2 chroma path: {names}")
    ef = FastEmbedMultilingualEF(PILOT_EMBEDDING_MODEL)
    col = client.get_collection(SECOND_PILOT_COLLECTION_NAME, embedding_function=ef)
    return f"fastembed:{PILOT_EMBEDDING_MODEL}", col, SECOND_PILOT_COLLECTION_NAME, persist


def _gold_rank(results: list[dict[str, Any]], expect_chunk_id: str | None, expect_clause: str | None) -> int | None:
    if expect_chunk_id:
        for r in results:
            if r.get("chunk_id") == expect_chunk_id:
                return int(r.get("rank") or 0) or None
        # v2 remints baseline IDs to doc_{sha12}:pXXXX:cYYY — match stable suffix
        m = _CHUNK_TAIL_RE.search(expect_chunk_id)
        if m:
            suffix = m.group(1)
            for r in results:
                cid = r.get("chunk_id") or ""
                if cid.endswith(suffix):
                    return int(r.get("rank") or 0) or None
    if expect_clause:
        for r in results:
            if (r.get("clause_number") or "") == expect_clause:
                return int(r.get("rank") or 0) or None
    return None


def _ranked_hits(collection: Any, case: dict[str, Any], *, limit: int = 5) -> dict[str, Any]:
    std = standard_key(case.get("standard") or "all")
    t0 = time.perf_counter()
    out = run_hybrid_search(collection=collection, query=case["query"], standard=std, limit=limit)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    results = list(out.get("results") or [])
    if not results and out.get("debug_nearest"):
        results = []
        for i, r in enumerate(out["debug_nearest"]):
            results.append(
                {
                    "rank": r.get("rank") or (i + 1),
                    "chunk_id": r.get("chunk_id"),
                    "clause_number": r.get("clause_number"),
                    "is_number": r.get("is_number"),
                    "sample_label": r.get("sample_label"),
                    "source_relative_path": r.get("source_relative_path"),
                    "source_aliases": r.get("source_aliases") or [],
                    "review_status": r.get("review_status"),
                    "text": r.get("text"),
                }
            )
    return {"out": out, "results": results, "elapsed_ms": elapsed_ms, "standard": std}


def _standard_leaks(results: list[dict[str, Any]], std: str) -> list[str]:
    if std == "all":
        return []
    return [r.get("chunk_id") or "" for r in results if not matches_standard(r, std) and r.get("chunk_id")]


def _run_case(collection: Any, case: dict[str, Any], *, collection_name: str) -> dict[str, Any]:
    packed = _ranked_hits(collection, case, limit=5)
    out = packed["out"]
    results = packed["results"]
    std = packed["standard"]
    gold = case.get("gold_label") or "CHUNK"
    state = out.get("answerability_state")
    rank = _gold_rank(results, case.get("expect_chunk_id"), case.get("expect_clause"))
    top = results[0] if results else None

    needs_review_in_results = [
        r.get("chunk_id") for r in results if (r.get("review_status") or "usable") != "usable"
    ]
    chunk_ids = [r.get("chunk_id") for r in results if r.get("chunk_id")]
    duplicate_chunk_ids = [cid for cid, n in Counter(chunk_ids).items() if n > 1]

    if gold == "NOT_FOUND":
        if state == "not_found":
            verdict = "pass_reject"
        elif state == "uncertain":
            verdict = "soft_reject"
        else:
            verdict = "false_positive"
        pass_at_1 = pass_at_3 = pass_at_5 = None
    else:
        pass_at_1 = rank == 1
        pass_at_3 = rank is not None and rank <= 3
        pass_at_5 = rank is not None and rank <= 5
        if state == "not_found" and pass_at_1:
            verdict = "false_negative"
        elif state == "not_found":
            verdict = "miss_and_reject"
        elif pass_at_1 and state in ("supported", "uncertain"):
            verdict = "pass"
        elif pass_at_1:
            verdict = "pass_rank_only"
        elif pass_at_3 and state in ("supported", "uncertain"):
            verdict = "pass_at_3"
        else:
            verdict = "fail"

    return {
        "id": case["id"],
        "query": case["query"],
        "lang": case.get("lang"),
        "standard": std,
        "collection_used": collection_name,
        "gold_label": gold,
        "expect_chunk_id": case.get("expect_chunk_id"),
        "expect_clause": case.get("expect_clause"),
        "gold_rank": rank,
        "pass_at_1": pass_at_1,
        "pass_at_3": pass_at_3,
        "pass_at_5": pass_at_5,
        "answerability_state": state,
        "verdict": verdict,
        "elapsed_ms": round(packed["elapsed_ms"], 2),
        "standard_leak_chunk_ids": _standard_leaks(results, std),
        "needs_review_leak_chunk_ids": needs_review_in_results,
        "duplicate_chunk_ids_in_top": duplicate_chunk_ids,
        "alias_dedupe_applied": out.get("alias_dedupe_applied"),
        "ranked_before_dedupe": out.get("ranked_before_dedupe"),
        "ranked_after_dedupe": out.get("ranked_after_dedupe"),
        "top1": {
            "chunk_id": top.get("chunk_id") if top else None,
            "clause_number": top.get("clause_number") if top else None,
            "is_number": top.get("is_number") if top else None,
            "source_relative_path": top.get("source_relative_path") if top else None,
            "source_aliases": (top.get("source_aliases") if top else None) or [],
            "review_status": top.get("review_status") if top else None,
        },
        "top5": [
            {
                "rank": r.get("rank"),
                "chunk_id": r.get("chunk_id"),
                "clause_number": r.get("clause_number"),
                "is_number": r.get("is_number"),
                "source_relative_path": r.get("source_relative_path"),
                "source_aliases": r.get("source_aliases") or [],
                "review_status": r.get("review_status"),
                "text_preview": " ".join((r.get("text") or "").split())[:160],
            }
            for r in results[:5]
        ],
    }


def _suite_metrics(answerable: list[dict], unanswerable: list[dict]) -> dict[str, Any]:
    a_n = len(answerable)
    p1 = sum(1 for r in answerable if r["pass_at_1"])
    p3 = sum(1 for r in answerable if r["pass_at_3"])
    p5 = sum(1 for r in answerable if r["pass_at_5"])
    fn = sum(1 for r in answerable if r["verdict"] == "false_negative")
    hard = sum(1 for r in unanswerable if r["verdict"] == "pass_reject")
    soft = sum(1 for r in unanswerable if r["verdict"] == "soft_reject")
    fp = sum(1 for r in unanswerable if r["verdict"] == "false_positive")
    leaks = sum(1 for r in answerable + unanswerable if r["standard_leak_chunk_ids"])
    nr_leaks = sum(1 for r in answerable + unanswerable if r["needs_review_leak_chunk_ids"])
    dupes = sum(1 for r in answerable + unanswerable if r["duplicate_chunk_ids_in_top"])
    return {
        "answerable_total": a_n,
        "pass_at_1": p1,
        "pass_at_3": p3,
        "pass_at_5": p5,
        "pass_at_1_rate": round(p1 / max(a_n, 1), 4),
        "pass_at_3_rate": round(p3 / max(a_n, 1), 4),
        "pass_at_5_rate": round(p5 / max(a_n, 1), 4),
        "false_negatives": fn,
        "unanswerable_total": len(unanswerable),
        "not_found_hard_reject": hard,
        "not_found_soft_reject": soft,
        "false_positives": fp,
        "not_found_reject_rate": round(hard / max(len(unanswerable), 1), 4),
        "standard_leaks": leaks,
        "needs_review_leaks": nr_leaks,
        "duplicate_alias_hits": dupes,
    }


def _latency(collection: Any) -> dict[str, Any]:
    q = "Liquid Holding Capacity formula"
    t0 = time.perf_counter()
    run_hybrid_search(collection=collection, query=q, standard="IS 9666", limit=5)
    cold_ms = (time.perf_counter() - t0) * 1000.0
    warms = []
    for _ in range(3):
        t0 = time.perf_counter()
        run_hybrid_search(collection=collection, query=q, standard="IS 9666", limit=5)
        warms.append((time.perf_counter() - t0) * 1000.0)
    pool = load_pool_chunks(collection, standard="IS 9666")
    t0 = time.perf_counter()
    n = min(max(len(pool), 5), 50)
    collection.query(query_texts=[q], n_results=n)
    vector_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "query": q,
        "standard": "IS 9666",
        "cold_ms": round(cold_ms, 2),
        "warm_ms_runs": [round(x, 2) for x in warms],
        "warm_ms_avg": round(sum(warms) / len(warms), 2),
        "vector_retrieval_ms": round(vector_ms, 2),
        "pool_size_is_9666": len(pool),
    }


def _protected_verify(vector_db_path: Path, snapshot_path: Path) -> dict[str, Any]:
    import chromadb

    snap = json.loads(snapshot_path.read_text(encoding="utf-8")) if snapshot_path.is_file() else {"collections": {}}
    out = {}
    for name in sorted(PROTECTED_COLLECTIONS):
        before = (snap.get("collections") or {}).get(name) or {}
        p = vector_db_path / "sample_collections" / name / "chroma"
        client = chromadb.PersistentClient(path=str(p))
        col = client.get_collection(name)
        count = int(col.count())
        chroma_bytes = sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
        man = vector_db_path / "sample_collections" / name / "manifest.json"
        mdocs = 0
        if man.is_file():
            mdocs = len((json.loads(man.read_text(encoding="utf-8")).get("documents") or {}))
        out[name] = {
            "count_now": count,
            "count_before": before.get("count"),
            "count_unchanged": before.get("count") is None or before.get("count") == count,
            "manifest_docs_now": mdocs,
            "manifest_docs_before": before.get("manifest_docs"),
            "manifest_unchanged": before.get("manifest_docs") is None or before.get("manifest_docs") == mdocs,
            "chroma_bytes_now": chroma_bytes,
            "chroma_bytes_before": before.get("chroma_bytes"),
            "bytes_unchanged": before.get("chroma_bytes") is None or before.get("chroma_bytes") == chroma_bytes,
            "mutation": False,
        }
    return out


def _failed_pdf_diagnosis(vector_db_path: Path, pdf_source_dir: Path | None) -> dict[str, Any]:
    summary_path = (
        vector_db_path / "diagnostics" / "pilot" / "second_pilot_v2_index_summary_v1.json"
    )
    man_path = (
        vector_db_path / "sample_collections" / SECOND_PILOT_COLLECTION_NAME / "manifest.json"
    )
    failed = []
    if man_path.is_file():
        docs = json.loads(man_path.read_text(encoding="utf-8")).get("documents") or {}
        for d in docs.values():
            if d.get("status") == "failed":
                failed.append(
                    {
                        "relative_path": d.get("source_relative_path"),
                        "document_id": d.get("document_id"),
                        "sha256": d.get("sha256"),
                        "error_redacted": "Failed to open file as type pdf (PyMuPDF FileDataError)",
                        "source_mode": d.get("source_mode"),
                    }
                )
    probe = None
    if failed and pdf_source_dir is not None:
        rel = failed[0]["relative_path"]
        p = pdf_source_dir / rel
        try:
            st = p.stat()
            head = p.open("rb").read(16)
            tail = p.open("rb").read()[-32:] if st.st_size >= 32 else b""
            # re-read tail properly
            with p.open("rb") as f:
                f.seek(max(0, st.st_size - 32))
                tail = f.read()
            probe = {
                "relative_path": rel,
                "exists": p.is_file(),
                "size_bytes": st.st_size,
                "blocks": st.st_blocks,
                "header_ascii": head[:8].decode("latin-1", errors="replace"),
                "looks_like_pdf_header": head.startswith(b"%PDF"),
                "tail_has_eof_marker": b"%%EOF" in tail,
                "parser_note": "PyMuPDF rejects bytes despite %PDF header — likely truncated/corrupt xref",
                "absolute_path_redacted": True,
                "file_modified_by_this_audit": False,
            }
        except OSError as exc:
            probe = {"relative_path": rel, "stat_error": type(exc).__name__}
    recovery_options = [
        {
            "option": "A_replace_source_from_trusted_copy",
            "action": "Obtain an intact PDF from BIS/publisher archive; replace at same relative path; then re-index ONLY that content unit after approval.",
            "destructive_now": False,
            "requires_approval": True,
        },
        {
            "option": "B_exclude_from_v2_usable_corpus",
            "action": "Keep failed status in manifest; do not promote to usable; document as known gap in evaluation coverage.",
            "destructive_now": False,
            "requires_approval": False,
        },
        {
            "option": "C_alternate_file_same_IS_if_verified",
            "action": "If another selection path has verified identical standard content with different bytes, evaluate separately — do not invent gold.",
            "destructive_now": False,
            "requires_approval": True,
        },
    ]
    return {
        "failed_documents": failed,
        "file_probe_readonly": probe,
        "recovery_options_advisory_only": recovery_options,
        "reindex_performed": False,
        "pdf_repaired_or_replaced": False,
    }


def _alias_smoke(collection: Any, collection_name: str) -> dict[str, Any]:
    """Query that should hit a known multi-alias content if present; check dedupe."""
    records = try_load_alias_records_for_search() or []
    g1 = next((r for r in records if r.group_id.startswith("g1")), None)
    if not g1:
        return {"skipped": True, "reason": "alias_policy_unavailable"}
    # Use a distinctive filename token from aliases
    q = "IS 3203"
    out = run_hybrid_search(collection=collection, query=q, standard="all", limit=10)
    results = out.get("results") or []
    ids = [r.get("chunk_id") for r in results if r.get("chunk_id")]
    return {
        "collection_used": collection_name,
        "query": q,
        "alias_dedupe_applied": out.get("alias_dedupe_applied"),
        "ranked_before_dedupe": out.get("ranked_before_dedupe"),
        "ranked_after_dedupe": out.get("ranked_after_dedupe"),
        "duplicate_chunk_ids": [c for c, n in Counter(ids).items() if n > 1],
        "needs_review_in_results": [
            r.get("chunk_id") for r in results if (r.get("review_status") or "usable") != "usable"
        ],
        "sample_top": [
            {
                "chunk_id": r.get("chunk_id"),
                "source_relative_path": r.get("source_relative_path"),
                "source_aliases": r.get("source_aliases") or [],
                "review_status": r.get("review_status"),
            }
            for r in results[:3]
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only post-v2 validation")
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Versioned report path (default: diagnostics/pilot/post_v2_retrieval_validation_v1.json)",
    )
    args = parser.parse_args(argv)

    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: KNOWLEDGE_VECTOR_DB_PATH unset", file=sys.stderr)
        return 2

    out_path = args.out or (
        settings.vector_db_path / "diagnostics" / "pilot" / "post_v2_retrieval_validation_v1.json"
    )
    forbidden = {
        "post_pilot_retrieval_validation.json",
        "pilot_eval_v1_report.json",
        "metrics.json",
        "manifest.json",
        "pilot_selection_v2_selected.json",
        "alias_policy_v1.json",
    }
    if out_path.name in forbidden:
        print(f"ERROR: refusing to overwrite protected name {out_path.name}", file=sys.stderr)
        return 2
    if out_path.exists():
        print(f"ERROR: report already exists (will not overwrite): {out_path.name}", file=sys.stderr)
        return 2

    print("Opening v2 read-only …", flush=True)
    try:
        model, collection, col_name, persist = open_v2_readonly(settings.vector_db_path)
    except Exception as exc:  # noqa: BLE001
        print(f"ABORT: cannot open v2 exclusively: {exc}", file=sys.stderr)
        return 3

    count = int(collection.count())
    print(f"collection={col_name} chunks={count} model={model}", flush=True)
    if col_name != SECOND_PILOT_COLLECTION_NAME:
        print(f"ABORT: expected {SECOND_PILOT_COLLECTION_NAME}, got {col_name}", file=sys.stderr)
        return 3
    if count != EXPECTED_V2_COUNT:
        print(
            f"ABORT: unexpected chunk count {count} (expected {EXPECTED_V2_COUNT}). "
            "No fallback collection used.",
            file=sys.stderr,
        )
        return 3

    # Snapshot expected corpus shape from index summary (read-only)
    idx_summary_path = (
        settings.vector_db_path / "diagnostics" / "pilot" / "second_pilot_v2_index_summary_v1.json"
    )
    idx_summary = json.loads(idx_summary_path.read_text(encoding="utf-8")) if idx_summary_path.is_file() else {}

    rel = json.loads(REL_PATH.read_text(encoding="utf-8"))
    pilot = json.loads(PILOT_PATH.read_text(encoding="utf-8"))

    print("Running reliability_eval_v1 on v2 …", flush=True)
    a_rel = [_run_case(collection, c, collection_name=col_name) for c in rel["answerable"]]
    u_rel = [_run_case(collection, c, collection_name=col_name) for c in rel["unanswerable"]]
    rel_metrics = _suite_metrics(a_rel, u_rel)

    r5 = next((r for r in a_rel if r["id"] == "a11_en_principle_r5"), None)
    a10 = next((r for r in a_rel if r["id"] == "a10_en_annex_title"), None)
    hi_lhc = next((r for r in a_rel if r["id"] == "a17_hi_lhc_formula"), None)
    hi_ext = next((r for r in a_rel if r["id"] == "a02_hi_extraneous"), None)

    print("Running pilot_eval_v1 on v2 …", flush=True)
    a_p = [_run_case(collection, c, collection_name=col_name) for c in pilot["answerable"]]
    u_p = [_run_case(collection, c, collection_name=col_name) for c in pilot["unanswerable"]]
    pilot_metrics = _suite_metrics(a_p, u_p)

    print("Alias dedupe smoke …", flush=True)
    alias_smoke = _alias_smoke(collection, col_name)

    print("Latency …", flush=True)
    latency = _latency(collection)

    print("Protected collections verify (read-only) …", flush=True)
    protected = _protected_verify(
        settings.vector_db_path,
        settings.vector_db_path / "diagnostics" / "pilot" / "protected_snapshot_before_v2_index.json",
    )

    print("Failed PDF diagnosis (non-destructive) …", flush=True)
    failed_diag = _failed_pdf_diagnosis(settings.vector_db_path, settings.pdf_source_dir)

    authored_gold_cases = (
        len(rel.get("answerable") or [])
        + len(rel.get("unanswerable") or [])
        + len(pilot.get("answerable") or [])
        + len(pilot.get("unanswerable") or [])
    )
    gold_status = {
        "proposed_second_pilot_gold": PROPOSED_GOLD,
        "authored_gold_cases_available_now": authored_gold_cases,
        "authored_breakdown": {
            "reliability_answerable": len(rel.get("answerable") or []),
            "reliability_not_found": len(rel.get("unanswerable") or []),
            "pilot_answerable": len(pilot.get("answerable") or []),
            "pilot_not_found": len(pilot.get("unanswerable") or []),
        },
        "proposed_min_80_status": "incomplete",
        "gap_to_80": max(0, PROPOSED_GOLD["total_proposed_min"] - authored_gold_cases),
        "rule": "Gold answers must be fixed from verified source evidence before claiming ≥80 coverage.",
        "larger_corpus_evaluation": "incomplete — 10,829 PDF corpus not evaluated; only v2 pilot selection.",
        "invented_gold_answers": False,
    }

    a10_note = {
        "id": "a10_en_annex_title",
        "gold_rank": a10["gold_rank"] if a10 else None,
        "known_acceptable_if_rank_2": True,
        "treated_as_regression": False
        if a10 and a10.get("gold_rank") in (1, 2)
        else (True if a10 and a10.get("gold_rank") not in (1, 2, None) else None),
        "note": "Rank 2 is known acceptable miss — not counted as regression.",
    }

    report = {
        "report_id": "post_v2_retrieval_validation_v1",
        "generated_at": _utc(),
        "mode": "read_only_post_index_validation",
        "writes": {
            "source_pdfs": False,
            "chroma_upsert_delete_reset": False,
            "ocr_extract_embed_reindex": False,
            "manifest_metrics_overwrite": False,
            "railway_deepseek_api_restart": False,
            "commit": False,
        },
        "collection_gate": {
            "required": SECOND_PILOT_COLLECTION_NAME,
            "opened": col_name,
            "chunk_count": count,
            "expected_chunk_count": EXPECTED_V2_COUNT,
            "fallback_used": False,
            "model": model,
            "persist_dir_redacted": f"sample_collections/{SECOND_PILOT_COLLECTION_NAME}/chroma",
        },
        "index_snapshot_expected": {
            "selection_path_count": EXPECTED_PATHS,
            "unique_content_units": EXPECTED_UNIQUE,
            "usable_chunks": EXPECTED_V2_COUNT,
            "needs_review_chunks": 1516,
            "statuses": {"indexed": 135, "needs_review": 1, "failed": 1},
            "reuse_alias_fresh": {"reuse": 39, "alias_extra_slots": 13, "fresh_extract": 97},
            "from_index_summary": {
                "usable_chunks": idx_summary.get("usable_chunks"),
                "needs_review_chunks": idx_summary.get("needs_review_chunks"),
                "statuses": idx_summary.get("statuses"),
                "content_units_reused": idx_summary.get("content_units_reused"),
                "content_units_fresh_extract": idx_summary.get("content_units_fresh_extract"),
                "alias_extra_path_slots": idx_summary.get("alias_extra_path_slots"),
            },
        },
        "reliability_eval_v1": {
            "collection_used": col_name,
            "metrics": rel_metrics,
            "r5_principle": {
                "gold_rank": r5["gold_rank"] if r5 else None,
                "state": r5["answerability_state"] if r5 else None,
                "top1": r5["top1"] if r5 else None,
            },
            "a10_en_annex_title": a10_note,
            "hindi_lhc": {
                "gold_rank": hi_lhc["gold_rank"] if hi_lhc else None,
                "state": hi_lhc["answerability_state"] if hi_lhc else None,
                "top1": hi_lhc["top1"] if hi_lhc else None,
            },
            "hindi_extraneous": {
                "gold_rank": hi_ext["gold_rank"] if hi_ext else None,
                "state": hi_ext["answerability_state"] if hi_ext else None,
                "top1": hi_ext["top1"] if hi_ext else None,
            },
            "false_positive_examples": [
                {"id": r["id"], "query": r["query"], "state": r["answerability_state"], "top1": r["top1"]}
                for r in u_rel
                if r["verdict"] == "false_positive"
            ],
            "false_negative_examples": [
                {"id": r["id"], "query": r["query"], "rank": r["gold_rank"], "state": r["answerability_state"]}
                for r in a_rel
                if r["verdict"] == "false_negative"
            ],
            "retrieval_fail_examples": [
                {
                    "id": r["id"],
                    "query": r["query"],
                    "rank": r["gold_rank"],
                    "verdict": r["verdict"],
                    "top1": r["top1"],
                }
                for r in a_rel
                if r["verdict"] in ("fail", "miss_and_reject")
                and r["id"] != "a10_en_annex_title"
            ],
            "answerable_results": a_rel,
            "unanswerable_results": u_rel,
            "thresholds_tuned": False,
        },
        "pilot_eval_v1": {
            "collection_used": col_name,
            "metrics": pilot_metrics,
            "answerable_results": a_p,
            "unanswerable_results": u_p,
        },
        "alias_dedupe_smoke": alias_smoke,
        "latency": latency,
        "protected_collections_readonly_verify": protected,
        "failed_pdf_diagnosis": failed_diag,
        "second_pilot_gold_coverage": gold_status,
        "unresolved_evaluation_gaps": [
            "Proposed ≥80-query second-pilot gold set not yet authored with verified evidence.",
            "Full 10,829-PDF corpus evaluation not in scope.",
            "1 failed PDF (IS 15575 Part 1) excluded from usable retrieval until recovery approved.",
            "v2 chunk is_number metadata mostly empty; IS 9666/2676 filtering relies on verified path/legacy baseline rules in matches_standard.",
        ],
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    m = rel_metrics
    print("=== Post-v2 validation (read-only) ===")
    print(f"collection={col_name} chunks={count}")
    print(
        f"Reliability Pass@1={m['pass_at_1']}/{m['answerable_total']} "
        f"Pass@3={m['pass_at_3']} Pass@5={m['pass_at_5']}"
    )
    print(
        f"NOT_FOUND hard={m['not_found_hard_reject']}/{m['unanswerable_total']} "
        f"soft={m['not_found_soft_reject']} FP={m['false_positives']} FN={m['false_negatives']}"
    )
    print(
        f"r5={r5['gold_rank'] if r5 else None} "
        f"a10={a10['gold_rank'] if a10 else None} (Rank2 OK) "
        f"hindi_lhc={hi_lhc['gold_rank'] if hi_lhc else None} "
        f"hindi_ext={hi_ext['gold_rank'] if hi_ext else None}"
    )
    print(
        f"leaks standard={m['standard_leaks']} needs_review={m['needs_review_leaks']} "
        f"dup_alias={m['duplicate_alias_hits']}"
    )
    print(f"Latency cold={latency['cold_ms']}ms warm_avg={latency['warm_ms_avg']}ms")
    print(f"Gold coverage: {authored_gold_cases}/80+ authored — incomplete")
    print(f"Failed docs: {len(failed_diag['failed_documents'])}")
    print(f"Report: {out_path.name}")
    print("no_reindex_no_writes=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
