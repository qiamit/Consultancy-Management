#!/usr/bin/env python3
"""
Read-only answerability diagnosis on bis_pilot_representative_v2.

- Does NOT change live thresholds/defaults
- Shadow/offline sweeps only (reported, not applied)
- No OCR/embed/re-index/Chroma mutation
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.answerability import (
    SignalBundle,
    compute_signals,
    decide_answerability,
    evaluate_answerability,
)
from knowledge_engine.config import load_settings
from knowledge_engine.pilot.constants import SECOND_PILOT_COLLECTION_NAME
from knowledge_engine.scripts.run_post_v2_validation import (
    EXPECTED_V2_COUNT,
    _gold_rank,
    _ranked_hits,
    open_v2_readonly,
)
from knowledge_engine.search_pipeline import standard_key

REL_PATH = Path(__file__).resolve().parents[1] / "eval" / "reliability_eval_v1.json"


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _path_aware_standard_ok(hit: dict[str, Any], selected_standard: str) -> bool:
    """Shadow-only: align with matches_standard-style baseline path check."""
    std = (selected_standard or "all").strip()
    if std in ("", "all"):
        return True
    sample = (hit.get("sample_label") or "").strip()
    is_no = (hit.get("is_number") or "").strip()
    rel = hit.get("source_relative_path") or ""
    if std == "IS 9666":
        return sample == "native_text" or "9666" in is_no or "9666" in rel
    if std == "IS 2676":
        return sample == "scanned" or "2676" in is_no or "2676" in rel or "STD 21/" in rel
    return True


def _shadow_decide(
    sig: SignalBundle,
    *,
    intent_ok_min: float | None = None,
    intent_missing_max: float | None = None,
    vector_ok_min: float | None = None,
    support_votes_min: int | None = None,
    force_standard_ok: bool | None = None,
) -> Any:
    """Clone of decide_answerability with optional shadow overrides (offline only)."""
    s = deepcopy(sig)
    if force_standard_ok is not None:
        s.standard_filter_ok = force_standard_ok

    # Temporarily patch module-level logic by reimplementing with overrides
    from knowledge_engine.answerability import (
        MSG_NOT_FOUND_HI,
        MSG_SUPPORTED_HI,
        MSG_UNCERTAIN_HI,
        AnswerabilityResult,
    )
    from dataclasses import asdict

    reasons: list[str] = []
    debug = {
        "vector_similarity": round(s.vector_similarity, 4),
        "lexical_raw": round(s.lexical_raw, 4),
        "lexical_norm": round(s.lexical_norm, 4),
        "hybrid_score": round(s.hybrid_score, 6),
        "top1_top2_gap": round(s.top1_top2_gap, 6),
        "evidence_coverage": round(s.evidence_coverage, 4),
        "intent_coverage": round(s.intent_coverage, 4),
        "strong_phrase_hits": s.strong_phrase_hits,
        "intent_hits": s.intent_hits,
        "intent_total": s.intent_total,
        "missing_intent_terms": list(s.missing_intent_terms),
        "shadow_overrides": {
            "intent_ok_min": intent_ok_min,
            "intent_missing_max": intent_missing_max,
            "vector_ok_min": vector_ok_min,
            "support_votes_min": support_votes_min,
            "force_standard_ok": force_standard_ok,
        },
    }
    signals = asdict(s)

    if not s.standard_filter_ok:
        return AnswerabilityResult(
            state="not_found",
            message_hi=MSG_NOT_FOUND_HI,
            reasons=["standard_filter_mismatch"],
            signals=signals,
            debug_scores=debug,
        )

    if s.hybrid_rank is None and s.hybrid_score == 0 and s.vector_similarity == 0:
        return AnswerabilityResult(
            state="not_found",
            message_hi=MSG_NOT_FOUND_HI,
            reasons=["no_candidates"],
            signals=signals,
            debug_scores=debug,
        )

    i_ok = intent_ok_min if intent_ok_min is not None else 0.6
    i_miss = intent_missing_max if intent_missing_max is not None else 0.34
    v_ok = vector_ok_min if vector_ok_min is not None else 0.42
    votes_need = support_votes_min if support_votes_min is not None else 4

    strong_phrase = s.exact_phrase_match and s.strong_phrase_hits >= 1
    intent_ok = s.intent_coverage >= i_ok and s.intent_hits >= 1
    intent_partial = s.intent_coverage >= i_miss and s.intent_hits >= 1
    intent_missing = s.intent_total > 0 and s.intent_coverage < i_miss
    clause_ok = s.clause_query_match
    separated = s.top1_top2_gap >= 0.0008
    vector_ok = s.vector_similarity >= v_ok
    lex_ok = s.lexical_raw >= 4.0

    if intent_missing and not clause_ok and not strong_phrase:
        reasons.append("intent_anchors_not_in_evidence")
        if s.missing_intent_terms:
            reasons.append("missing:" + ",".join(s.missing_intent_terms[:6]))
        return AnswerabilityResult(
            state="not_found",
            message_hi=MSG_NOT_FOUND_HI,
            reasons=reasons,
            signals=signals,
            debug_scores=debug,
        )

    if not strong_phrase and not intent_ok and not clause_ok and s.intent_total >= 2:
        if s.intent_coverage < 0.5:
            return AnswerabilityResult(
                state="not_found",
                message_hi=MSG_NOT_FOUND_HI,
                reasons=["domain_overlap_without_intent_support"],
                signals=signals,
                debug_scores=debug,
            )

    if s.clause_mismatch and not strong_phrase and not intent_ok:
        return AnswerabilityResult(
            state="not_found",
            message_hi=MSG_NOT_FOUND_HI,
            reasons=["clause_mismatch_without_supporting_evidence"],
            signals=signals,
            debug_scores=debug,
        )

    support_votes = 0
    support_reasons: list[str] = []
    if strong_phrase:
        support_votes += 2
        support_reasons.append("exact_technical_phrase_match")
    if intent_ok:
        support_votes += 2
        support_reasons.append("intent_anchors_covered")
    elif intent_partial:
        support_votes += 1
        support_reasons.append("partial_intent_coverage")
    if clause_ok:
        support_votes += 2
        support_reasons.append("clause_id_match")
    if vector_ok:
        support_votes += 1
        support_reasons.append("adequate_vector_similarity")
    if lex_ok:
        support_votes += 1
        support_reasons.append("adequate_lexical_overlap")
    if separated:
        support_votes += 1
        support_reasons.append("top1_separated_from_top2")

    core_ok = intent_ok or clause_ok or (strong_phrase and intent_partial)
    if core_ok and support_votes >= votes_need:
        return AnswerabilityResult(
            state="supported", message_hi=MSG_SUPPORTED_HI, reasons=support_reasons,
            signals=signals, debug_scores=debug,
        )
    if (intent_ok or clause_ok) and support_votes >= max(3, votes_need - 1):
        return AnswerabilityResult(
            state="supported", message_hi=MSG_SUPPORTED_HI, reasons=support_reasons,
            signals=signals, debug_scores=debug,
        )
    if strong_phrase and intent_ok and support_votes >= 3:
        return AnswerabilityResult(
            state="supported", message_hi=MSG_SUPPORTED_HI, reasons=support_reasons,
            signals=signals, debug_scores=debug,
        )
    if core_ok or intent_partial:
        return AnswerabilityResult(
            state="uncertain",
            message_hi=MSG_UNCERTAIN_HI,
            reasons=(support_reasons or ["partial_signal_match"]) + ["needs_human_verification"],
            signals=signals,
            debug_scores=debug,
        )
    return AnswerabilityResult(
        state="not_found",
        message_hi=MSG_NOT_FOUND_HI,
        reasons=reasons or ["insufficient_multi_signal_evidence"],
        signals=signals,
        debug_scores=debug,
    )


def _classify_failure_layer(row: dict[str, Any]) -> str:
    gold = row.get("gold_label")
    rank = row.get("retrieval_gold_rank")
    state = row.get("answerability_state")
    reasons = row.get("evidence_reasons") or []
    if gold == "NOT_FOUND":
        if state == "not_found":
            return "ok_reject"
        return "answerability_gate_false_positive"
    if rank is None:
        return "retrieval_miss"
    if rank == 1 and state == "not_found":
        if "standard_filter_mismatch" in reasons:
            return "answerability_gate_standard_filter"
        if any(r.startswith("intent_anchors") or r.startswith("missing:") for r in reasons):
            return "answerability_gate_intent"
        return "answerability_gate_other"
    if rank > 1 and state == "not_found":
        return "retrieval_not_top1_and_gate_reject"
    if rank == 1 and state in ("supported", "uncertain"):
        return "ok"
    if rank is not None and rank <= 5 and state == "not_found":
        return "evidence_top5_but_gate_reject"
    return "other"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Diagnose v2 answerability (read-only)")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args(argv)

    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: KNOWLEDGE_VECTOR_DB_PATH unset", file=sys.stderr)
        return 2

    out_path = args.out or (
        settings.vector_db_path
        / "diagnostics"
        / "pilot"
        / "post_v2_answerability_diagnosis_v1.json"
    )
    if out_path.exists():
        print(f"ERROR: report exists, will not overwrite: {out_path.name}", file=sys.stderr)
        return 2
    if out_path.name in {
        "post_v2_retrieval_validation_v1.json",
        "post_pilot_retrieval_validation.json",
        "reliability_eval_v1.json",
    }:
        print("ERROR: refusing protected report name", file=sys.stderr)
        return 2

    model, collection, col_name, _persist = open_v2_readonly(settings.vector_db_path)
    count = int(collection.count())
    print(f"collection={col_name} chunks={count}", flush=True)
    if col_name != SECOND_PILOT_COLLECTION_NAME or count != EXPECTED_V2_COUNT:
        print("ABORT: unexpected collection/count", file=sys.stderr)
        return 3

    rel = json.loads(REL_PATH.read_text(encoding="utf-8"))
    cases = list(rel["answerable"]) + list(rel["unanswerable"])

    case_rows: list[dict[str, Any]] = []
    for case in cases:
        packed = _ranked_hits(collection, case, limit=5)
        out = packed["out"]
        results = packed["results"]
        std = packed["standard"]
        # Live answerability (unchanged defaults) — already inside run_hybrid_search,
        # but recompute on post-dedupe ranked hits for signal dump.
        ans = evaluate_answerability(
            query=case["query"],
            ranked_hits=results[: max(5, 3)],
            selected_standard=std,
        )
        pub = ans.to_public_dict()
        rank = _gold_rank(results, case.get("expect_chunk_id"), case.get("expect_clause"))
        top = results[0] if results else None
        sig = compute_signals(query=case["query"], ranked_hits=results[:5], selected_standard=std)

        row = {
            "id": case["id"],
            "query": case["query"],
            "lang": case.get("lang"),
            "standard": std,
            "gold_label": case.get("gold_label") or "CHUNK",
            "expect_chunk_id": case.get("expect_chunk_id"),
            "expect_clause": case.get("expect_clause"),
            "collection_used": col_name,
            "retrieval_gold_rank": rank,
            "answerability_state": pub["answerability_state"],
            "pipeline_answerability_state": out.get("answerability_state"),
            "evidence_reasons": pub["evidence_reasons"],
            "signals_summary": pub["signals_summary"],
            "debug_scores": pub["debug_scores"],
            "score_components_top1": {
                "hybrid_score": top.get("hybrid_score") if top else None,
                "vector_similarity": top.get("vector_similarity") if top else None,
                "lexical_raw": top.get("lexical_raw") if top else None,
                "lexical_norm": top.get("lexical_norm") if top else None,
                "sample_label": top.get("sample_label") if top else None,
                "is_number": top.get("is_number") if top else None,
                "source_relative_path": top.get("source_relative_path") if top else None,
                "chunk_id": top.get("chunk_id") if top else None,
                "clause_number": top.get("clause_number") if top else None,
            },
            "standard_filter_ok_live": sig.standard_filter_ok,
            "standard_filter_ok_path_aware_shadow": _path_aware_standard_ok(top or {}, std)
            if top
            else False,
            "failure_layer": None,
        }
        row["failure_layer"] = _classify_failure_layer(row)
        # a10 special
        if case["id"] == "a10_en_annex_title":
            row["known_acceptable_rank2"] = rank == 2
            row["treated_as_regression"] = False
        case_rows.append(row)

    answerable = [r for r in case_rows if r["gold_label"] != "NOT_FOUND"]
    unanswerable = [r for r in case_rows if r["gold_label"] == "NOT_FOUND"]

    fn = [
        r
        for r in answerable
        if r["retrieval_gold_rank"] == 1 and r["answerability_state"] == "not_found"
    ]
    fn_by_reason: dict[str, list[str]] = defaultdict(list)
    for r in fn:
        key = ",".join(r["evidence_reasons"] or ["unknown"])
        fn_by_reason[key].append(r["id"])

    layer_counts = Counter(r["failure_layer"] for r in case_rows)

    # --- Shadow sweeps (offline only) ---
    shadow_configs = [
        {"id": "baseline_live", "desc": "Current live decide_answerability (no changes)"},
        {
            "id": "shadow_path_aware_standard_filter",
            "desc": "Force standard_filter_ok using path/legacy baseline rules (not applied live)",
            "force_path_aware_standard": True,
        },
        {
            "id": "shadow_intent_ok_0.5",
            "desc": "intent_ok threshold 0.5 (shadow)",
            "intent_ok_min": 0.5,
            "force_path_aware_standard": True,
        },
        {
            "id": "shadow_intent_ok_0.34",
            "desc": "intent_ok threshold 0.34 (shadow)",
            "intent_ok_min": 0.34,
            "force_path_aware_standard": True,
        },
        {
            "id": "shadow_vector_0.35",
            "desc": "vector_ok 0.35 + path-aware standard (shadow)",
            "vector_ok_min": 0.35,
            "force_path_aware_standard": True,
        },
        {
            "id": "shadow_votes_3_path_aware",
            "desc": "support_votes_min=3 + path-aware standard (shadow)",
            "support_votes_min": 3,
            "force_path_aware_standard": True,
        },
    ]

    # Cache ranked hits per case id (one retrieval pass for shadows)
    hits_cache: dict[str, list[dict[str, Any]]] = {}
    for case in cases:
        packed = _ranked_hits(collection, case, limit=5)
        hits_cache[case["id"]] = packed["results"]

    shadow_results = []
    for cfg in shadow_configs:
        a_pass1 = a_pass3 = a_pass5 = 0
        fn_n = fp_n = hard = soft = supported = uncertain = not_found_a = 0
        for case in cases:
            results = hits_cache[case["id"]]
            std = standard_key(case.get("standard") or "all")
            gold = case.get("gold_label") or "CHUNK"
            rank = _gold_rank(results, case.get("expect_chunk_id"), case.get("expect_clause"))
            sig = compute_signals(query=case["query"], ranked_hits=results[:5], selected_standard=std)
            force_ok = None
            if cfg.get("force_path_aware_standard"):
                force_ok = _path_aware_standard_ok(results[0], std) if results else False
            if cfg["id"] == "baseline_live":
                ans = decide_answerability(sig)
            else:
                ans = _shadow_decide(
                    sig,
                    intent_ok_min=cfg.get("intent_ok_min"),
                    intent_missing_max=cfg.get("intent_missing_max"),
                    vector_ok_min=cfg.get("vector_ok_min"),
                    support_votes_min=cfg.get("support_votes_min"),
                    force_standard_ok=force_ok,
                )
            state = ans.state
            if gold == "NOT_FOUND":
                if state == "not_found":
                    hard += 1
                elif state == "uncertain":
                    soft += 1
                else:
                    fp_n += 1
            else:
                if rank == 1:
                    a_pass1 += 1
                if rank is not None and rank <= 3:
                    a_pass3 += 1
                if rank is not None and rank <= 5:
                    a_pass5 += 1
                if rank == 1 and state == "not_found":
                    fn_n += 1
                if state == "supported":
                    supported += 1
                elif state == "uncertain":
                    uncertain += 1
                else:
                    not_found_a += 1
        shadow_results.append(
            {
                "config_id": cfg["id"],
                "description": cfg["desc"],
                "applied_to_live": False,
                "retrieval_pass_at_1": a_pass1,
                "retrieval_pass_at_3": a_pass3,
                "retrieval_pass_at_5": a_pass5,
                "answerable_supported": supported,
                "answerable_uncertain": uncertain,
                "answerable_not_found": not_found_a,
                "false_negatives_rank1_but_not_found": fn_n,
                "not_found_hard_reject": hard,
                "not_found_soft_reject": soft,
                "false_positives": fp_n,
                "note": (
                    "Retrieval Pass@ unchanged across shadows (ranking fixed); "
                    "answerability state counts vary. Do not select overfit threshold from n=51."
                ),
            }
        )

    report = {
        "report_id": "post_v2_answerability_diagnosis_v1",
        "generated_at": _utc(),
        "mode": "read_only_diagnosis",
        "live_thresholds_changed": False,
        "collection": {"name": col_name, "count": count, "fallback_used": False},
        "root_cause_summary": {
            "primary_fn_reason": "standard_filter_mismatch",
            "explanation": (
                "compute_signals sets standard_filter_ok only when sample_label is "
                "native_text/scanned OR is_number contains 9666/2676. "
                "v2 usable chunks use content-hash sample_label (doc_…) and empty is_number, "
                "so IS 9666/2676 filtered queries hard-fail answerability despite correct retrieval."
            ),
            "failure_is": "answerability_gate (not retrieval)",
            "dedupe_note": "Sibling-chunk collapse was a separate search-assembly bug; fixed separately.",
        },
        "metrics_live": {
            "answerable": len(answerable),
            "retrieval_pass_at_1": sum(1 for r in answerable if r["retrieval_gold_rank"] == 1),
            "retrieval_pass_at_3": sum(
                1 for r in answerable if r["retrieval_gold_rank"] is not None and r["retrieval_gold_rank"] <= 3
            ),
            "retrieval_pass_at_5": sum(
                1 for r in answerable if r["retrieval_gold_rank"] is not None and r["retrieval_gold_rank"] <= 5
            ),
            "false_negatives_rank1_not_found": len(fn),
            "not_found_hard": sum(1 for r in unanswerable if r["answerability_state"] == "not_found"),
            "false_positives": sum(
                1 for r in unanswerable if r["answerability_state"] == "supported"
            ),
        },
        "fn_grouped_by_evidence_reasons": {k: v for k, v in sorted(fn_by_reason.items(), key=lambda x: -len(x[1]))},
        "failure_layer_counts": dict(layer_counts),
        "case_level": case_rows,
        "shadow_threshold_sweep": {
            "warning": (
                "Offline only. Do not promote a candidate from this 51-case set without "
                "larger verified gold. Live defaults unchanged."
            ),
            "configs": shadow_results,
        },
        "a10_en_annex_title": next((r for r in case_rows if r["id"] == "a10_en_annex_title"), None),
        "writes": {
            "answerability_defaults": False,
            "chroma": False,
            "source_pdfs": False,
            "reindex": False,
        },
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("=== Answerability diagnosis ===")
    print(f"FN rank1+not_found={len(fn)} / {len(answerable)}")
    print(f"FN reason groups={dict((k, len(v)) for k, v in fn_by_reason.items())}")
    print(f"layers={dict(layer_counts)}")
    for s in shadow_results:
        print(
            f"shadow {s['config_id']}: FN={s['false_negatives_rank1_but_not_found']} "
            f"supported={s['answerable_supported']} NOT_FOUND_hard={s['not_found_hard_reject']} "
            f"FP={s['false_positives']}"
        )
    print(f"wrote={out_path.name}")
    print("live_thresholds_unchanged=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
