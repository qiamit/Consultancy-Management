#!/usr/bin/env python3
"""
Controlled retrieval reliability evaluation (19 usable chunks).

- Does not modify/delete production collection
- No DeepSeek answers, no bulk indexing, no Railway deploy
- Gold labels come from reliability_eval_v1.json (hand-authored)

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_reliability_eval
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import default_diagnostics_dir
from knowledge_engine.search_pipeline import (
    open_search_collection,
    run_hybrid_search,
    standard_key,
)

EVAL_PATH = Path(__file__).resolve().parents[1] / "eval" / "reliability_eval_v1.json"


def _gold_rank(results: list[dict[str, Any]], expect_chunk_id: str | None, expect_clause: str | None) -> int | None:
    if not expect_chunk_id and not expect_clause:
        return None
    for r in results:
        if expect_chunk_id and r.get("chunk_id") == expect_chunk_id:
            return int(r.get("rank") or 0) or None
    for r in results:
        if expect_clause and r.get("clause_number") == expect_clause:
            return int(r.get("rank") or 0) or None
    return None


def _run_case(collection: Any, case: dict[str, Any]) -> dict[str, Any]:
    std = standard_key(case.get("standard") or "all")
    out = run_hybrid_search(
        collection=collection,
        query=case["query"],
        standard=std,
        limit=5,
    )
    gold = case.get("gold_label") or "CHUNK"
    state = out.get("answerability_state")
    rank = _gold_rank(
        out.get("results") or [],
        case.get("expect_chunk_id"),
        case.get("expect_clause"),
    )
    top = (out.get("results") or [None])[0]

    if gold == "NOT_FOUND":
        # Rejection success: not_found is Pass; uncertain is soft-fail; supported is FP
        if state == "not_found":
            verdict = "pass_reject"
        elif state == "uncertain":
            verdict = "soft_reject"
        else:
            verdict = "false_positive"
        pass_at_1 = None
    else:
        pass_at_1 = rank == 1
        if state == "not_found" and pass_at_1:
            # Ranked correctly but rejected → false_negative on answerability
            verdict = "false_negative"
        elif state == "not_found":
            verdict = "miss_and_reject"
        elif pass_at_1 and state in ("supported", "uncertain"):
            verdict = "pass"
        elif pass_at_1:
            verdict = "pass_rank_only"
        elif rank is not None and rank <= 3 and state in ("supported", "uncertain"):
            verdict = "pass_at_3"
        else:
            verdict = "fail"

    # Hard standard isolation check for filtered modes
    leak = []
    if std == "IS 9666":
        for r in out.get("results") or []:
            if (r.get("sample_label") or "") != "native_text":
                leak.append(r.get("chunk_id"))
    elif std == "IS 2676":
        for r in out.get("results") or []:
            if (r.get("sample_label") or "") != "scanned":
                leak.append(r.get("chunk_id"))

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
        "answerability_state": state,
        "verdict": verdict,
        "message_hi": out.get("message_hi"),
        "evidence_reasons": out.get("evidence_reasons"),
        "signals_summary": out.get("signals_summary"),
        "debug_scores": out.get("debug_scores"),
        "top1": {
            "chunk_id": top.get("chunk_id") if top else None,
            "clause_number": top.get("clause_number") if top else None,
            "is_number": top.get("is_number") if top else None,
        },
        "standard_leak_chunk_ids": leak,
        "top5": [
            {
                "rank": r.get("rank"),
                "chunk_id": r.get("chunk_id"),
                "clause_number": r.get("clause_number"),
            }
            for r in (out.get("results") or [])
        ],
    }


def main() -> int:
    settings = load_settings()
    if settings.vector_db_path is None:
        print("KNOWLEDGE_VECTOR_DB_PATH unset", file=sys.stderr)
        return 2

    dataset = json.loads(EVAL_PATH.read_text(encoding="utf-8"))
    model, collection, col_name, persist = open_search_collection(settings.vector_db_path)

    answerable = dataset["answerable"]
    unanswerable = dataset["unanswerable"]

    a_results = [_run_case(collection, c) for c in answerable]
    u_results = [_run_case(collection, c) for c in unanswerable]

    a_pass1 = sum(1 for r in a_results if r["pass_at_1"])
    a_supported = sum(1 for r in a_results if r["answerability_state"] == "supported")
    a_uncertain = sum(1 for r in a_results if r["answerability_state"] == "uncertain")
    a_not_found = sum(1 for r in a_results if r["answerability_state"] == "not_found")
    false_neg = sum(1 for r in a_results if r["verdict"] == "false_negative")
    a_fail = sum(1 for r in a_results if r["verdict"] in ("fail", "miss_and_reject"))

    u_reject = sum(1 for r in u_results if r["verdict"] == "pass_reject")
    u_soft = sum(1 for r in u_results if r["verdict"] == "soft_reject")
    false_pos = sum(1 for r in u_results if r["verdict"] == "false_positive")

    leaks = sum(1 for r in a_results + u_results if r["standard_leak_chunk_ids"])

    # Spotlight cases
    r5 = next((r for r in a_results if r["id"] == "a11_en_principle_r5"), None)
    hi_lhc = next((r for r in a_results if r["id"] == "a17_hi_lhc_formula"), None)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": str(EVAL_PATH.relative_to(_REPO_ROOT)),
        "collection": col_name,
        "persist_dir": str(persist),
        "model": model,
        "production_collection_unmodified": True,
        "counts": {
            "answerable_queries": len(a_results),
            "unanswerable_queries": len(u_results),
        },
        "answerable_metrics": {
            "pass_at_1": a_pass1,
            "pass_at_1_rate": round(a_pass1 / max(len(a_results), 1), 4),
            "answerability_supported": a_supported,
            "answerability_uncertain": a_uncertain,
            "answerability_not_found": a_not_found,
            "false_negatives": false_neg,
            "retrieval_fails": a_fail,
        },
        "unanswerable_metrics": {
            "hard_reject_not_found": u_reject,
            "soft_reject_uncertain": u_soft,
            "false_positives_supported": false_pos,
            "reject_rate_strict": round(u_reject / max(len(u_results), 1), 4),
            "reject_rate_soft_ok": round((u_reject + u_soft) / max(len(u_results), 1), 4),
        },
        "standard_filter_leaks": leaks,
        "spotlight": {
            "r5_principle": {
                "id": r5["id"] if r5 else None,
                "gold_rank": r5["gold_rank"] if r5 else None,
                "answerability_state": r5["answerability_state"] if r5 else None,
                "top1": r5["top1"] if r5 else None,
                "before_note": "Prior hybrid C: expected A-1 at Rank 2 (lexical over-boost)",
            },
            "hindi_lhc": {
                "id": hi_lhc["id"] if hi_lhc else None,
                "gold_rank": hi_lhc["gold_rank"] if hi_lhc else None,
                "answerability_state": hi_lhc["answerability_state"] if hi_lhc else None,
                "top1": hi_lhc["top1"] if hi_lhc else None,
                "before_note": "Prior hybrid C: A-3 at Rank 1 (must not regress)",
            },
        },
        "answerable_results": a_results,
        "unanswerable_results": u_results,
    }

    out_dir = default_diagnostics_dir(settings) / "vector_search_test"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "reliability_eval_v1_report.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("=== Reliability Eval v1 ===")
    print(f"collection={col_name} model={model}")
    print(
        f"Answerable Pass@1: {a_pass1}/{len(a_results)} "
        f"({report['answerable_metrics']['pass_at_1_rate']})"
    )
    print(
        f"Answerability A: supported={a_supported} uncertain={a_uncertain} "
        f"not_found={a_not_found} FN={false_neg}"
    )
    print(
        f"NOT_FOUND reject: hard={u_reject}/{len(u_results)} soft={u_soft} FP={false_pos}"
    )
    print(f"Standard leaks: {leaks}")
    if r5:
        print(f"r5_principle gold_rank={r5['gold_rank']} state={r5['answerability_state']} top1={r5['top1']}")
    if hi_lhc:
        print(f"Hindi LHC gold_rank={hi_lhc['gold_rank']} state={hi_lhc['answerability_state']} top1={hi_lhc['top1']}")
    print(f"Report: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
