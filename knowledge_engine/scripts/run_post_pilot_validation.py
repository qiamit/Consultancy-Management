#!/usr/bin/env python3
"""
Post-pilot retrieval validation on bis_pilot_representative_v1 (no re-index).

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_post_pilot_validation
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import default_diagnostics_dir
from knowledge_engine.search_pipeline import (
    load_pool_chunks,
    matches_standard,
    open_search_collection,
    run_hybrid_search,
    standard_key,
)

REL_PATH = Path(__file__).resolve().parents[1] / "eval" / "reliability_eval_v1.json"
PILOT_PATH = Path(__file__).resolve().parents[1] / "eval" / "pilot_eval_v1.json"

OLD_BASELINE = {
    "answerable_pass_at_1": "34/35",
    "not_found": "16/16",
    "r5_principle": 1,
    "hindi_lhc": 1,
    "corpus_chunks": 19,
}


def _gold_rank(results: list[dict[str, Any]], expect_chunk_id: str | None, expect_clause: str | None) -> int | None:
    if not expect_chunk_id and not expect_clause:
        return None
    for r in results:
        if expect_chunk_id and r.get("chunk_id") == expect_chunk_id:
            return int(r.get("rank") or 0) or None
    for r in results:
        if expect_clause and (r.get("clause_number") or "") == expect_clause:
            return int(r.get("rank") or 0) or None
    return None


def _ranked_hits_for_eval(collection: Any, case: dict[str, Any], *, limit: int = 5) -> dict[str, Any]:
    """
    Search with answerability, but for ranking metrics use debug_nearest when
    not_found clears public results.
    """
    std = standard_key(case.get("standard") or "all")
    t0 = time.perf_counter()
    out = run_hybrid_search(collection=collection, query=case["query"], standard=std, limit=limit)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    results = list(out.get("results") or [])
    if not results and out.get("debug_nearest"):
        # Reconstruct public-shaped rows for gold-rank only (not treating as answers)
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
                    "review_status": r.get("review_status"),
                    "text": r.get("text"),
                }
            )
    return {"out": out, "results": results, "elapsed_ms": elapsed_ms, "standard": std}


def _standard_leaks(results: list[dict[str, Any]], std: str) -> list[str]:
    leaks = []
    for r in results:
        if not matches_standard(r, std):
            leaks.append(r.get("chunk_id") or "")
    return [x for x in leaks if x]


def _run_case(collection: Any, case: dict[str, Any]) -> dict[str, Any]:
    packed = _ranked_hits_for_eval(collection, case, limit=5)
    out = packed["out"]
    results = packed["results"]
    std = packed["standard"]
    gold = case.get("gold_label") or "CHUNK"
    state = out.get("answerability_state")
    rank = _gold_rank(results, case.get("expect_chunk_id"), case.get("expect_clause"))
    top = results[0] if results else None

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
        "standard_leak_chunk_ids": _standard_leaks(results, std) if std != "all" else [],
        "top1": {
            "chunk_id": top.get("chunk_id") if top else None,
            "clause_number": top.get("clause_number") if top else None,
            "is_number": top.get("is_number") if top else None,
            "source_relative_path": top.get("source_relative_path") if top else None,
        },
        "top5": [
            {
                "rank": r.get("rank"),
                "chunk_id": r.get("chunk_id"),
                "clause_number": r.get("clause_number"),
                "is_number": r.get("is_number"),
                "source_relative_path": r.get("source_relative_path"),
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
    }


def _latency_bench(collection: Any) -> dict[str, Any]:
    q = "Liquid Holding Capacity formula"
    # cold
    t0 = time.perf_counter()
    run_hybrid_search(collection=collection, query=q, standard="IS 9666", limit=5)
    cold_ms = (time.perf_counter() - t0) * 1000.0
    # warm (3 runs)
    warms = []
    for _ in range(3):
        t0 = time.perf_counter()
        run_hybrid_search(collection=collection, query=q, standard="IS 9666", limit=5)
        warms.append((time.perf_counter() - t0) * 1000.0)
    # breakdown approximate: pool load + vector query dominates inside run_hybrid_search
    # Instrument lightly
    from knowledge_engine.hybrid_retrieval import hybrid_rank, lexical_score_chunks
    from knowledge_engine.search_pipeline import distance_to_similarity

    pool = load_pool_chunks(collection, standard="IS 9666")
    t0 = time.perf_counter()
    n = min(max(len(pool), 5), 50)
    raw = collection.query(query_texts=[q], n_results=n)
    vector_ms = (time.perf_counter() - t0) * 1000.0
    ids = (raw.get("ids") or [[]])[0]
    dists = (raw.get("distances") or [[]])[0]
    vec_ids = list(ids)
    pool_ids = [c["chunk_id"] for c in pool]
    for cid in pool_ids:
        if cid not in vec_ids:
            vec_ids.append(cid)
    allowed = set(pool_ids)
    vec_ids = [cid for cid in vec_ids if cid in allowed]
    t0 = time.perf_counter()
    lex = lexical_score_chunks(q, pool)
    hybrid_rank(vector_ranked_ids=vec_ids, lexical=lex, chunk_ids=pool_ids)
    hybrid_ms = (time.perf_counter() - t0) * 1000.0
    _ = distance_to_similarity(dists[0] if dists else None)
    return {
        "query": q,
        "cold_ms": round(cold_ms, 2),
        "warm_ms_runs": [round(x, 2) for x in warms],
        "warm_ms_avg": round(sum(warms) / len(warms), 2),
        "vector_retrieval_ms": round(vector_ms, 2),
        "hybrid_rerank_ms": round(hybrid_ms, 2),
        "pool_size_is_9666": len(pool),
    }


def main() -> int:
    settings = load_settings()
    if settings.vector_db_path is None:
        print("KNOWLEDGE_VECTOR_DB_PATH unset", file=sys.stderr)
        return 2

    model, collection, col_name, persist = open_search_collection(settings.vector_db_path)
    count = int(collection.count())
    print(f"collection={col_name} chunks={count} model={model}")
    if col_name != "bis_pilot_representative_v1":
        print(f"WARN: expected bis_pilot_representative_v1, got {col_name}", file=sys.stderr)
    if count != 1156:
        print(f"WARN: expected 1156 chunks, got {count}", file=sys.stderr)

    rel = json.loads(REL_PATH.read_text(encoding="utf-8"))
    pilot = json.loads(PILOT_PATH.read_text(encoding="utf-8"))

    print("Running reliability_eval_v1 …", flush=True)
    a_rel = [_run_case(collection, c) for c in rel["answerable"]]
    u_rel = [_run_case(collection, c) for c in rel["unanswerable"]]
    rel_metrics = _suite_metrics(a_rel, u_rel)

    r5 = next((r for r in a_rel if r["id"] == "a11_en_principle_r5"), None)
    hi_lhc = next((r for r in a_rel if r["id"] == "a17_hi_lhc_formula"), None)
    hi_ext = next((r for r in a_rel if r["id"] == "a02_hi_extraneous"), None)

    print("Running pilot_eval_v1 …", flush=True)
    a_p = [_run_case(collection, c) for c in pilot["answerable"]]
    u_p = [_run_case(collection, c) for c in pilot["unanswerable"]]
    pilot_metrics = _suite_metrics(a_p, u_p)
    by_lang: dict[str, dict[str, int]] = {}
    for r in a_p:
        lang = r.get("lang") or "unknown"
        by_lang.setdefault(lang, {"n": 0, "p1": 0, "p3": 0, "p5": 0})
        by_lang[lang]["n"] += 1
        if r["pass_at_1"]:
            by_lang[lang]["p1"] += 1
        if r["pass_at_3"]:
            by_lang[lang]["p3"] += 1
        if r["pass_at_5"]:
            by_lang[lang]["p5"] += 1

    # Spotlight Top-5 queries
    spot_queries = [
        {
            "id": "spotlight_hi_extraneous",
            "query": "कणिकाओं में बाहरी पदार्थ के बारे में क्या आवश्यकता है?",
            "standard": "IS 9666",
            "expect_clause": "4.1",
            "expect_chunk_id": "native_text:p0003:c004",
            "gold_label": "CHUNK",
        },
        {
            "id": "spotlight_hi_lhc",
            "query": "लिक्विड होल्डिंग कैपेसिटी का सूत्र क्या है?",
            "standard": "IS 9666",
            "expect_clause": "A-3",
            "expect_chunk_id": "native_text:p0005:c018",
            "gold_label": "CHUNK",
        },
    ]
    spotlights = [_run_case(collection, c) for c in spot_queries]

    # Standard filter tests
    filter_tests = []
    for q, std in [
        ("Liquid Holding Capacity formula", "IS 9666"),
        ("dimensions and tolerances aluminium", "IS 2676"),
        ("Liquid Holding Capacity formula", "all"),
    ]:
        out = run_hybrid_search(collection=collection, query=q, standard=std, limit=5)
        rows = out.get("results") or out.get("debug_nearest") or []
        leaks = _standard_leaks(rows, std) if std != "all" else []
        is_numbers = sorted({(r.get("is_number") or "") for r in rows})
        filter_tests.append(
            {
                "query": q,
                "standard": std,
                "result_count": len(rows),
                "is_numbers": is_numbers,
                "leaks": leaks,
                "pass": len(leaks) == 0,
            }
        )

    print("Latency bench …", flush=True)
    latency = _latency_bench(collection)

    fp_examples = [r for r in u_rel if r["verdict"] == "false_positive"]
    fn_examples = [r for r in a_rel if r["verdict"] == "false_negative"]
    fail_examples = [r for r in a_rel if r["verdict"] in ("fail", "miss_and_reject")]

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "authoritative_runtime": {
            "collection": col_name,
            "usable_chunk_total": count,
            "model": model,
            "persist_dir": str(persist),
            "api": "127.0.0.1:3851",
        },
        "old_baseline_19_chunk": OLD_BASELINE,
        "reliability_eval_v1_on_pilot": {
            "metrics": rel_metrics,
            "r5_principle": {
                "gold_rank": r5["gold_rank"] if r5 else None,
                "state": r5["answerability_state"] if r5 else None,
                "top1": r5["top1"] if r5 else None,
            },
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
                for r in fp_examples
            ],
            "false_negative_examples": [
                {"id": r["id"], "query": r["query"], "rank": r["gold_rank"], "state": r["answerability_state"]}
                for r in fn_examples
            ],
            "retrieval_fail_examples": [
                {"id": r["id"], "query": r["query"], "rank": r["gold_rank"], "verdict": r["verdict"], "top1": r["top1"]}
                for r in fail_examples
            ],
            "answerable_results": a_rel,
            "unanswerable_results": u_rel,
        },
        "spotlights": spotlights,
        "standard_filter_tests": filter_tests,
        "pilot_eval_v1": {
            "metrics": pilot_metrics,
            "by_lang": by_lang,
            "answerable_results": a_p,
            "unanswerable_results": u_p,
        },
        "latency": latency,
        "note": "Failed/aborted background API restarts excluded. No re-index/OCR in this run.",
    }

    out_dir = default_diagnostics_dir(settings) / "pilot"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "post_pilot_retrieval_validation.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    m = rel_metrics
    print("=== Post-pilot validation ===")
    print(
        f"Reliability Pass@1={m['pass_at_1']}/{m['answerable_total']} "
        f"Pass@3={m['pass_at_3']} Pass@5={m['pass_at_5']}"
    )
    print(
        f"NOT_FOUND hard={m['not_found_hard_reject']}/{m['unanswerable_total']} "
        f"soft={m['not_found_soft_reject']} FP={m['false_positives']} FN={m['false_negatives']}"
    )
    print(f"r5={r5['gold_rank'] if r5 else None} hindi_lhc={hi_lhc['gold_rank'] if hi_lhc else None} "
          f"hindi_ext={hi_ext['gold_rank'] if hi_ext else None}")
    pm = pilot_metrics
    print(f"Pilot Pass@1={pm['pass_at_1']}/{pm['answerable_total']} NOT_FOUND={pm['not_found_hard_reject']}/{pm['unanswerable_total']}")
    print(f"Latency cold={latency['cold_ms']}ms warm_avg={latency['warm_ms_avg']}ms "
          f"vector={latency['vector_retrieval_ms']}ms hybrid={latency['hybrid_rerank_ms']}ms")
    print(f"Report: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
