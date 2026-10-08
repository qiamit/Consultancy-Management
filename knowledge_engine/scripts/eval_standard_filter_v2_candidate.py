#!/usr/bin/env python3
"""
Offline evaluation of standard_filter_v2_candidate on reliability + pilot suites.

- Does NOT change live answerability / API
- Read-only Chroma open of bis_pilot_representative_v2
- Writes a new versioned report (no overwrite of prior reports)
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

from knowledge_engine.answerability import compute_signals, decide_answerability
from knowledge_engine.config import load_settings
from knowledge_engine.pilot.constants import SECOND_PILOT_COLLECTION_NAME
from knowledge_engine.pilot.standard_filter_v2_candidate import (
    candidate_standard_filter_ok,
    live_standard_filter_ok_snapshot,
    resolve_standard_identity_v2_candidate,
)
from knowledge_engine.scripts.run_post_v2_validation import (
    EXPECTED_V2_COUNT,
    _gold_rank,
    _ranked_hits,
    _standard_leaks,
    open_v2_readonly,
)
from knowledge_engine.search_pipeline import standard_key

REL_PATH = Path(__file__).resolve().parents[1] / "eval" / "reliability_eval_v1.json"
PILOT_PATH = Path(__file__).resolve().parents[1] / "eval" / "pilot_eval_v1.json"


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_suite(
    collection: Any,
    *,
    collection_name: str,
    cases_answerable: list[dict],
    cases_unanswerable: list[dict],
    mode: str,
) -> dict[str, Any]:
    """mode: live | candidate_v2 | prior_shadow_loose"""
    rows: list[dict[str, Any]] = []

    def decide_for(case: dict, results: list[dict], std: str):
        if not results:
            from knowledge_engine.answerability import evaluate_answerability

            return evaluate_answerability(query=case["query"], ranked_hits=[], selected_standard=std)
        sig = compute_signals(query=case["query"], ranked_hits=results[:5], selected_standard=std)
        top = results[0]
        if mode == "live":
            return decide_answerability(sig)
        if mode == "candidate_v2":
            s = deepcopy(sig)
            decision = candidate_standard_filter_ok(top, std)
            s.standard_filter_ok = bool(decision["standard_filter_ok"])
            return decide_answerability(s)
        if mode == "prior_shadow_loose":
            # Previous diagnose shadow: "9666"/"2676" anywhere in path
            s = deepcopy(sig)
            rel = top.get("source_relative_path") or ""
            sample = (top.get("sample_label") or "").strip()
            is_no = (top.get("is_number") or "").strip()
            if std == "IS 9666":
                s.standard_filter_ok = sample == "native_text" or "9666" in is_no or "9666" in rel
            elif std == "IS 2676":
                s.standard_filter_ok = (
                    sample == "scanned" or "2676" in is_no or "2676" in rel or "STD 21/" in rel
                )
            else:
                s.standard_filter_ok = True
            return decide_answerability(s)
        raise ValueError(mode)

    for case in list(cases_answerable) + list(cases_unanswerable):
        packed = _ranked_hits(collection, case, limit=5)
        results = packed["results"]
        std = packed["standard"]
        gold = case.get("gold_label") or "CHUNK"
        rank = _gold_rank(results, case.get("expect_chunk_id"), case.get("expect_clause"))
        ans = decide_for(case, results, std)
        top = results[0] if results else {}
        ident = resolve_standard_identity_v2_candidate(top) if top else None
        cand = candidate_standard_filter_ok(top, std) if top else None
        state = ans.state
        pass_at_1 = pass_at_3 = pass_at_5 = None
        if gold != "NOT_FOUND":
            pass_at_1 = rank == 1
            pass_at_3 = rank is not None and rank <= 3
            pass_at_5 = rank is not None and rank <= 5
            if rank == 1 and state == "not_found":
                verdict = "false_negative"
            elif state == "not_found":
                verdict = "miss_and_reject"
            elif pass_at_1 and state in ("supported", "uncertain"):
                verdict = "pass"
            else:
                verdict = "other"
        else:
            if state == "not_found":
                verdict = "pass_reject"
            elif state == "uncertain":
                verdict = "soft_reject"
            else:
                verdict = "false_positive"

        rows.append(
            {
                "id": case["id"],
                "gold_label": gold,
                "standard": std,
                "collection_used": collection_name,
                "mode": mode,
                "retrieval_gold_rank": rank,
                "pass_at_1": pass_at_1,
                "pass_at_3": pass_at_3,
                "pass_at_5": pass_at_5,
                "answerability_state": state,
                "evidence_reasons": list(ans.reasons),
                "verdict": verdict,
                "standard_leak_chunk_ids": _standard_leaks(results, std),
                "live_standard_filter_ok": live_standard_filter_ok_snapshot(top, std) if top else None,
                "candidate_decision": cand,
                "identity": ident.to_dict() if ident else None,
                "unknown_or_review_identity": bool(
                    ident and ident.confidence in ("unknown", "review_required")
                ),
            }
        )

    answerable = [r for r in rows if r["gold_label"] != "NOT_FOUND"]
    unanswerable = [r for r in rows if r["gold_label"] == "NOT_FOUND"]
    metrics = {
        "answerable_total": len(answerable),
        "pass_at_1": sum(1 for r in answerable if r["pass_at_1"]),
        "pass_at_3": sum(1 for r in answerable if r["pass_at_3"]),
        "pass_at_5": sum(1 for r in answerable if r["pass_at_5"]),
        "states": dict(Counter(r["answerability_state"] for r in answerable)),
        "false_negatives": sum(1 for r in answerable if r["verdict"] == "false_negative"),
        "unanswerable_total": len(unanswerable),
        "not_found_hard_reject": sum(1 for r in unanswerable if r["verdict"] == "pass_reject"),
        "not_found_soft_reject": sum(1 for r in unanswerable if r["verdict"] == "soft_reject"),
        "false_positives": sum(1 for r in unanswerable if r["verdict"] == "false_positive"),
        "standard_leaks": sum(1 for r in rows if r["standard_leak_chunk_ids"]),
        "unknown_or_review_identity_hits": sum(1 for r in rows if r["unknown_or_review_identity"]),
    }
    return {"metrics": metrics, "cases": rows}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline eval of v2 standard filter candidate")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--out-md", type=Path, default=None)
    args = parser.parse_args(argv)

    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: vector db unset", file=sys.stderr)
        return 2

    out = args.out or (
        settings.vector_db_path
        / "diagnostics"
        / "pilot"
        / "standard_filter_v2_candidate_eval_v1.json"
    )
    out_md = args.out_md or (
        settings.vector_db_path
        / "diagnostics"
        / "pilot"
        / "standard_filter_v2_candidate_eval_v1.md"
    )
    for p in (out, out_md):
        if p.exists():
            print(f"ERROR: exists {p.name}", file=sys.stderr)
            return 2
        if p.name in {
            "post_v2_retrieval_validation_v1.json",
            "post_v2_answerability_diagnosis_v1.json",
            "reliability_eval_v1.json",
            "manifest.json",
        }:
            print("ERROR: refusing protected name", file=sys.stderr)
            return 2

    _model, collection, col_name, _persist = open_v2_readonly(settings.vector_db_path)
    count = int(collection.count())
    print(f"collection={col_name} chunks={count}", flush=True)
    if col_name != SECOND_PILOT_COLLECTION_NAME or count != EXPECTED_V2_COUNT:
        print("ABORT: unexpected collection/count", file=sys.stderr)
        return 3

    rel = json.loads(REL_PATH.read_text(encoding="utf-8"))
    pilot = json.loads(PILOT_PATH.read_text(encoding="utf-8"))

    suites = {}
    for mode in ("live", "prior_shadow_loose", "candidate_v2"):
        print(f"Evaluating mode={mode} …", flush=True)
        rel_out = _run_suite(
            collection,
            collection_name=col_name,
            cases_answerable=rel["answerable"],
            cases_unanswerable=rel["unanswerable"],
            mode=mode,
        )
        pil_out = _run_suite(
            collection,
            collection_name=col_name,
            cases_answerable=pilot["answerable"],
            cases_unanswerable=pilot["unanswerable"],
            mode=mode,
        )
        suites[mode] = {"reliability_eval_v1": rel_out, "pilot_eval_v1": pil_out}

    # Proposed unverified table (read existing file; do not modify gold)
    prop_path = (
        settings.vector_db_path
        / "diagnostics"
        / "pilot"
        / "proposed_unverified_gold_v2_plus20_v1.json"
    )
    proposed_table = []
    if prop_path.is_file():
        prop = json.loads(prop_path.read_text(encoding="utf-8"))
        for c in prop.get("candidates") or []:
            ev = c.get("evidence_reference") or {}
            proposed_table.append(
                {
                    "id": c.get("proposed_id"),
                    "status": c.get("status"),
                    "lang": c.get("lang_guess"),
                    "query": c.get("query"),
                    "expected_answer": c.get("expected_answer"),
                    "gold_label": c.get("gold_label"),
                    "chunk_id": ev.get("chunk_id"),
                    "clause": ev.get("clause_number"),
                    "source_relative_path": ev.get("source_relative_path"),
                    "human_review": c.get("human_review"),
                }
            )

    report = {
        "report_id": "standard_filter_v2_candidate_eval_v1",
        "generated_at": _utc(),
        "live_answerability_changed": False,
        "candidate_wired_to_api": False,
        "collection": {"name": col_name, "count": count, "fallback_used": False},
        "design_notes": {
            "live_mismatch_cause": (
                "Live standard_filter_ok requires sample_label native_text/scanned "
                "or substring in is_number; v2 uses doc_* sample_label and empty is_number."
            ),
            "v2_signals": {
                "verified_is_number": "chunk metadata is_number (usually empty on v2 today)",
                "legacy_sample_label": "native_text→IS 9666, scanned→IS 2676",
                "filename_IS_token": "explicit IS <n> in filename (unverified provenance)",
                "std_folder_alone": "STD <n>/… → review_required; never silent IS",
            },
            "prior_shadow_loose": (
                "Earlier diagnose used '9666'/'2676' anywhere in relative_path "
                "(including folder). Candidate is stricter: folder-only is NOT enough."
            ),
        },
        "suites": suites,
        "comparison": {
            "reliability": {
                mode: suites[mode]["reliability_eval_v1"]["metrics"]
                for mode in suites
            },
            "pilot": {
                mode: suites[mode]["pilot_eval_v1"]["metrics"] for mode in suites
            },
        },
        "proposed_unverified_gold_table": proposed_table,
        "proposed_unverified_source_file": prop_path.name if prop_path.is_file() else None,
        "authoritative_gold_unchanged": True,
        "writes": {
            "chroma": False,
            "live_filter": False,
            "api_restart": False,
            "reindex": False,
            "commit": False,
        },
        "remaining_ambiguity": [
            "Filename IS token is still heuristic (unverified) — human may reject edge cases.",
            "Folder-only PDFs (e.g. STD 10951/10951_Amd3.pdf) stay review_required under candidate.",
            "Candidate not production-wired; separate approval required to change live filter.",
            "Do not overfit promotion decision on this 60-case set alone.",
        ],
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Markdown summary + proposed table
    lines = [
        "# standard_filter_v2_candidate — offline eval v1",
        "",
        f"- Generated: `{report['generated_at']}`",
        f"- Collection: `{col_name}` (count={count})",
        "- Live answerability / API: **unchanged** (candidate not wired)",
        "",
        "## Reliability suite comparison",
        "",
        "| Mode | Pass@1 | Pass@3 | Pass@5 | FN | NOT_FOUND hard | FP | supported |",
        "|------|-------:|-------:|-------:|---:|---------------:|---:|----------:|",
    ]
    for mode, m in report["comparison"]["reliability"].items():
        states = m.get("states") or {}
        lines.append(
            f"| {mode} | {m['pass_at_1']}/35 | {m['pass_at_3']} | {m['pass_at_5']} | "
            f"{m['false_negatives']} | {m['not_found_hard_reject']}/16 | {m['false_positives']} | "
            f"{states.get('supported', 0)} |"
        )
    lines += [
        "",
        "## Pilot suite (6+3)",
        "",
        "| Mode | Pass@1 | FN | NOT_FOUND hard | FP |",
        "|------|-------:|---:|---------------:|---:|",
    ]
    for mode, m in report["comparison"]["pilot"].items():
        lines.append(
            f"| {mode} | {m['pass_at_1']}/6 | {m['false_negatives']} | "
            f"{m['not_found_hard_reject']}/3 | {m['false_positives']} |"
        )
    lines += [
        "",
        "## 20 proposed_unverified gold questions (human review)",
        "",
        "| ID | Lang | Query | Clause | Source path | expected_answer |",
        "|----|------|-------|--------|-------------|-----------------|",
    ]
    for row in proposed_table:
        q = (row.get("query") or "").replace("|", "/")
        src = (row.get("source_relative_path") or "").replace("|", "/")
        lines.append(
            f"| {row.get('id')} | {row.get('lang')} | {q} | {row.get('clause')} | "
            f"`{src}` | `{row.get('expected_answer')}` |"
        )
    lines += [
        "",
        "_Authoritative gold JSON files were not modified._",
        "",
        "## Remaining ambiguity",
        "",
    ]
    for a in report["remaining_ambiguity"]:
        lines.append(f"- {a}")
    lines.append("")
    out_md.write_text("\n".join(lines), encoding="utf-8")

    print("=== Candidate offline eval ===")
    for mode, m in report["comparison"]["reliability"].items():
        print(
            f"{mode}: Pass@1={m['pass_at_1']}/35 FN={m['false_negatives']} "
            f"NOT_FOUND={m['not_found_hard_reject']}/16 FP={m['false_positives']} "
            f"supported={m['states'].get('supported', 0)}"
        )
    print(f"wrote={out.name}")
    print(f"wrote_md={out_md.name}")
    print("live_unchanged=true candidate_not_wired=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
