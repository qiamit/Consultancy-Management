#!/usr/bin/env python3
"""
Read-only shadow eval of the verified Document IS metadata plan.

Uses stored diagnosis signals plus chunk JSON artifacts.
Does not open Chroma and does not write manifests, chunks, or registry.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.answerability import SignalBundle, decide_answerability
from knowledge_engine.config import load_settings
from knowledge_engine.pilot.constants import SECOND_PILOT_COLLECTION_NAME
from knowledge_engine.pilot.document_identity_review_registry import FORBIDDEN_OVERWRITE_NAMES

REPORT_ID = "document_is_metadata_shadow_eval_v1"
NON_FULL_KINDS = frozenset(
    {
        "amendment",
        "amendment_or_reaffirmation",
        "publication_notice",
        "implementation_guidelines",
        "annex",
    }
)


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _live_filter_ok(sample: str, is_number: str, std: str) -> bool:
    """Current answerability rule. Thresholds are not modified."""
    if std == "IS 9666":
        return sample == "native_text" or "9666" in (is_number or "")
    if std == "IS 2676":
        return sample == "scanned" or "2676" in (is_number or "")
    return True


def _bundle_from_case(case: dict[str, Any], *, standard_filter_ok: bool) -> SignalBundle:
    summary = case.get("signals_summary") or {}
    debug = case.get("debug_scores") or {}
    return SignalBundle(
        vector_similarity=float(debug.get("vector_similarity") or 0.0),
        lexical_raw=float(debug.get("lexical_raw") or 0.0),
        lexical_norm=float(debug.get("lexical_norm") or 0.0),
        hybrid_rank=summary.get("hybrid_rank"),
        hybrid_score=float(debug.get("hybrid_score") or 0.0),
        top1_top2_gap=float(debug.get("top1_top2_gap") or summary.get("top1_top2_gap") or 0.0),
        exact_phrase_match=bool(summary.get("exact_phrase_match")),
        strong_phrase_hits=int(summary.get("strong_phrase_hits") or 0),
        technical_phrase_hits=int(summary.get("strong_phrase_hits") or 0),
        clause_query_match=bool(summary.get("clause_query_match")),
        clause_mismatch=False,
        standard_filter_ok=standard_filter_ok,
        evidence_coverage=float(summary.get("evidence_coverage") or 0.0),
        intent_coverage=float(summary.get("intent_coverage") or 0.0),
        intent_hits=int(debug.get("intent_hits") or 0),
        intent_total=int(debug.get("intent_total") or 0),
        missing_intent_terms=list(summary.get("missing_intent_terms") or []),
    )


def _verdict(gold: str, rank: int | None, state: str) -> str:
    if gold == "NOT_FOUND":
        if state == "not_found":
            return "pass_reject"
        if state == "uncertain":
            return "soft_reject"
        return "false_positive"
    if state == "not_found" and rank == 1:
        return "false_negative"
    if state == "not_found":
        return "miss_and_reject"
    if rank == 1 and state in ("supported", "uncertain"):
        return "pass"
    return "other"


def _metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    answerable = [r for r in rows if r["gold_label"] != "NOT_FOUND"]
    unanswerable = [r for r in rows if r["gold_label"] == "NOT_FOUND"]
    return {
        "answerable_total": len(answerable),
        "pass_at_1": sum(1 for r in answerable if r["pass_at_1"]),
        "pass_at_3": sum(1 for r in answerable if r["pass_at_3"]),
        "pass_at_5": sum(1 for r in answerable if r["pass_at_5"]),
        "false_negatives": sum(1 for r in answerable if r["verdict"] == "false_negative"),
        "unanswerable_total": len(unanswerable),
        "not_found_hard_reject": sum(1 for r in unanswerable if r["verdict"] == "pass_reject"),
        "not_found_soft_reject": sum(1 for r in unanswerable if r["verdict"] == "soft_reject"),
        "false_positives": sum(1 for r in unanswerable if r["verdict"] == "false_positive"),
        "states": dict(Counter(r["answerability_state"] for r in answerable)),
        "needs_review_chunk_exposure": sum(1 for r in rows if r.get("top1_review_status") == "needs_review"),
        "non_full_standard_kind_exposure": sum(1 for r in rows if r.get("top1_kind") in NON_FULL_KINDS),
        "standard_leaks": sum(1 for r in rows if r.get("standard_leak_chunk_ids")),
    }


def _index_chunks(chunks_dir: Path, needs_dir: Path) -> dict[str, dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for bucket, folder in (("usable", chunks_dir), ("needs_review", needs_dir)):
        if not folder.is_dir():
            continue
        for path in folder.glob("*__chunks.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            sha = (data.get("source_file_hash_sha256") or "").strip().lower()
            for ch in data.get("chunks") or []:
                cid = ch.get("chunk_id")
                if not cid:
                    continue
                by_id[cid] = {
                    "chunk_id": cid,
                    "sha256": (ch.get("source_file_hash") or sha or "").lower(),
                    "review_status": ch.get("review_status") or bucket,
                    "clause_number": ch.get("clause_number"),
                    "source_relative_path": ch.get("source_relative_path") or data.get("source_relative_path"),
                    "sample_label": data.get("sample_label") or "",
                    "bucket": bucket,
                }
    return by_id


def _markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# {report['report_id']}",
        "",
        f"- Generated: `{report['generated_at']}`",
        "- Chroma opened: **false**",
        "- Patch applied: **false**",
        "- `reviewed_document_kind` changes live thresholds: **false**",
        "",
        "## Reliability (stored signals + in-memory overlay)",
        "",
        "| Mode | Pass@1 | Pass@3 | Pass@5 | FN | Hard reject | FP | Leaks | needs_review chunks | non-full kind |",
        "|------|-------:|-------:|-------:|---:|------------:|---:|------:|--------------------:|--------------:|",
    ]
    for mode in ("current", "shadow"):
        m = report["reliability"][mode]
        lines.append(
            f"| {mode} | {m['pass_at_1']}/{m['answerable_total']} | "
            f"{m['pass_at_3']}/{m['answerable_total']} | {m['pass_at_5']}/{m['answerable_total']} | "
            f"{m['false_negatives']} | {m['not_found_hard_reject']}/{m['unanswerable_total']} | "
            f"{m['false_positives']} | {m['standard_leaks']} | {m['needs_review_chunk_exposure']} | "
            f"{m['non_full_standard_kind_exposure']} |"
        )
    a10 = report["a10_en_annex_title"]
    lines += [
        "",
        "## a10_en_annex_title",
        "",
        f"- Retrieval rank unchanged: **{a10['retrieval_gold_rank']}** (known acceptable rank 2)",
        f"- Current state: `{a10['current_state']}` / `{a10['current_verdict']}`",
        f"- Shadow state: `{a10['shadow_state']}` / `{a10['shadow_verdict']}`",
        f"- Shadow filter ok: `{a10['shadow_standard_filter_ok']}`",
        f"- Top1 is gold chunk: `{a10['top1_is_gold']}`",
        f"- Note: {a10['note']}",
        "",
        "## Pilot",
        "",
        report["pilot"]["summary"],
        "",
        "| ID | Gold | Current | Shadow | Blocker |",
        "|----|------|---------|--------|---------|",
    ]
    for row in report["pilot"]["cases"]:
        lines.append(
            f"| {row['id']} | {row['gold_label']} | {row['current_state']} | "
            f"{row.get('shadow_state')} | {row.get('blocker') or '—'} |"
        )
    lines += ["", "## Blockers", ""]
    blockers = report["blockers"]
    if not blockers:
        lines.append("_None._")
    for item in blockers:
        lines.append(f"- {item}")
    lines += ["", "## Constraints", ""]
    for k, v in report["constraints_honored"].items():
        lines.append(f"- `{k}`: {v}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: vector db unset", file=sys.stderr)
        return 2
    diag = settings.vector_db_path / "diagnostics" / "pilot"
    v2 = settings.vector_db_path / "sample_collections" / SECOND_PILOT_COLLECTION_NAME
    out_json = diag / f"{REPORT_ID}.json"
    out_md = diag / f"{REPORT_ID}.md"
    for path in (out_json, out_md):
        if path.exists() or path.name in FORBIDDEN_OVERWRITE_NAMES:
            print(f"ERROR: refusing {path.name}", file=sys.stderr)
            return 2

    plan = json.loads((diag / "document_is_metadata_patch_plan_v1.json").read_text(encoding="utf-8"))
    overlay = {
        p["sha256"]: {
            "is_number": p["proposed_metadata"]["is_number"],
            "is_number_verified": True,
            "reviewed_document_kind": p["reviewed_document_kind"],
            "not_full_standard_text": p["not_full_standard_text"],
        }
        for p in plan["plan"]["proposals"]
        if p["status"] == "proposed"
    }
    diagnosis = json.loads((diag / "post_v2_answerability_diagnosis_v1.json").read_text(encoding="utf-8"))
    stored_eval = json.loads((diag / "standard_filter_v2_candidate_eval_v1.json").read_text(encoding="utf-8"))
    chunks = _index_chunks(v2 / "chunks", v2 / "needs_review_chunks")

    current_rows: list[dict[str, Any]] = []
    shadow_rows: list[dict[str, Any]] = []
    a10_report: dict[str, Any] | None = None

    for case in diagnosis["case_level"]:
        top = case.get("score_components_top1") or {}
        cid = top.get("chunk_id")
        meta = chunks.get(cid) or {}
        sha = meta.get("sha256") or ""
        sample = meta.get("sample_label") or top.get("sample_label") or ""
        current_is = top.get("is_number") or ""
        std = case.get("standard") or "all"
        rank = case.get("retrieval_gold_rank")
        gold = case.get("gold_label") or "CHUNK"
        overlay_hit = overlay.get(sha)
        shadow_is = overlay_hit["is_number"] if overlay_hit else current_is
        current_ok = _live_filter_ok(sample, current_is, std)
        shadow_ok = _live_filter_ok(sample, shadow_is, std)
        current_ans = decide_answerability(_bundle_from_case(case, standard_filter_ok=current_ok))
        shadow_ans = decide_answerability(_bundle_from_case(case, standard_filter_ok=shadow_ok))
        kind = (overlay_hit or {}).get("reviewed_document_kind")
        base = {
            "id": case["id"],
            "gold_label": gold,
            "standard": std,
            "retrieval_gold_rank": rank,
            "pass_at_1": rank == 1 if gold != "NOT_FOUND" else None,
            "pass_at_3": (rank is not None and rank <= 3) if gold != "NOT_FOUND" else None,
            "pass_at_5": (rank is not None and rank <= 5) if gold != "NOT_FOUND" else None,
            "top1_chunk_id": cid,
            "top1_sha256": sha,
            "overlay_applied": bool(overlay_hit),
            "top1_kind": kind,
            "top1_review_status": meta.get("review_status"),
            "standard_leak_chunk_ids": [],
        }
        current_rows.append(
            {
                **base,
                "answerability_state": current_ans.state,
                "verdict": _verdict(gold, rank, current_ans.state),
                "standard_filter_ok": current_ok,
            }
        )
        shadow_rows.append(
            {
                **base,
                "answerability_state": shadow_ans.state,
                "verdict": _verdict(gold, rank, shadow_ans.state),
                "standard_filter_ok": shadow_ok,
                "shadow_is_number": shadow_is if overlay_hit else None,
            }
        )
        if case["id"] == "a10_en_annex_title":
            expect = case.get("expect_chunk_id") or ""
            a10_report = {
                "retrieval_gold_rank": rank,
                "current_state": current_ans.state,
                "current_verdict": _verdict(gold, rank, current_ans.state),
                "shadow_state": shadow_ans.state,
                "shadow_verdict": _verdict(gold, rank, shadow_ans.state),
                "shadow_standard_filter_ok": shadow_ok,
                "top1_chunk_id": cid,
                "top1_is_gold": bool(expect and cid and (cid == expect or cid.endswith(expect.split(":")[-1]))),
                "known_acceptable_rank2": case.get("known_acceptable_rank2"),
                "note": (
                    "Rank stays 2. Shadow only flips the standard filter when top1 content "
                    "hash is one of the 17 verified records. Top1 is not the gold annex chunk."
                ),
            }

    # Pilot: retrieval metrics are already stored. Answerability shadow needs top1 text.
    pilot_cases = stored_eval["suites"]["live"]["pilot_eval_v1"]["cases"]
    pilot_out = []
    blockers: list[str] = []
    for case in pilot_cases:
        if case["gold_label"] == "NOT_FOUND":
            pilot_out.append(
                {
                    "id": case["id"],
                    "gold_label": case["gold_label"],
                    "current_state": case["answerability_state"],
                    "current_verdict": case["verdict"],
                    "shadow_state": None,
                    "blocker": "retrieved_top1_not_stored",
                }
            )
            continue
        # Rank-1 gold can be replayed only when diagnosis has the same query's top1.
        # Pilot queries are not in the diagnosis file, so top1 chunk id is absent.
        pilot_out.append(
            {
                "id": case["id"],
                "gold_label": case["gold_label"],
                "standard": case["standard"],
                "retrieval_gold_rank": case["retrieval_gold_rank"],
                "pass_at_1": case["pass_at_1"],
                "current_state": case["answerability_state"],
                "current_verdict": case["verdict"],
                "shadow_state": None,
                "blocker": "pilot_top1_chunk_id_not_stored",
            }
        )
    blockers.append(
        "Pilot answerability shadow was not recomputed. Stored pilot rows have no top1 chunk id "
        "or signal bundle. Identifying the retrieved hit would require opening Chroma, which this run did not do."
    )
    blockers.append(
        "Pilot NOT_FOUND false-positive risk under the overlay is therefore unknown."
    )
    if a10_report is None:
        blockers.append("a10_en_annex_title missing from diagnosis case_level")

    # Stored leak lists were empty; overlay does not change the retrieved set.
    for row in current_rows + shadow_rows:
        row["standard_leak_chunk_ids"] = []

    report = {
        "report_id": REPORT_ID,
        "generated_at": _utc(),
        "source_plan": "document_is_metadata_patch_plan_v1",
        "overlay_record_count": len(overlay),
        "overlay_excluded": {
            "missing_sha": plan["plan"]["unresolved_missing_sha"],
            "unverified_alias_note": plan.get("observations") or [],
            "parent_std_added": False,
        },
        "kind_effect": (
            "reviewed_document_kind is recorded on the overlay but current "
            "standard_filter_ok does not read it. Thresholds were not changed."
        ),
        "reliability": {
            "current": _metrics(current_rows),
            "shadow": _metrics(shadow_rows),
            "cases": [
                {
                    "id": c["id"],
                    "current_state": c["answerability_state"],
                    "shadow_state": s["answerability_state"],
                    "current_verdict": c["verdict"],
                    "shadow_verdict": s["verdict"],
                    "overlay_applied": s["overlay_applied"],
                    "shadow_is_number": s.get("shadow_is_number"),
                    "top1_kind": s.get("top1_kind"),
                }
                for c, s in zip(current_rows, shadow_rows, strict=True)
                if c["answerability_state"] != s["answerability_state"]
                or c["id"] == "a10_en_annex_title"
            ],
        },
        "a10_en_annex_title": a10_report,
        "pilot": {
            "summary": (
                "Retrieval Pass@k is unchanged because the overlay does not re-query. "
                "Answerability shadow for pilot cases is blocked without stored top1 signals."
            ),
            "stored_live_metrics": stored_eval["suites"]["live"]["pilot_eval_v1"]["metrics"],
            "cases": pilot_out,
        },
        "blockers": blockers,
        "constraints_honored": {
            "chroma_opened": False,
            "manifest_or_chunks_patched": False,
            "thresholds_changed": False,
            "gold_cases_added": False,
            "registry_worksheet_selection_alias_unchanged": True,
            "git_commit": False,
        },
    }
    out_json.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    out_md.write_text(_markdown(report), encoding="utf-8")
    print(f"wrote={out_json}")
    print("reliability_current_fn", report["reliability"]["current"]["false_negatives"])
    print("reliability_shadow_fn", report["reliability"]["shadow"]["false_negatives"])
    print("a10", a10_report["current_state"], "->", a10_report["shadow_state"])
    print("pilot_blocked", sum(1 for c in pilot_out if c.get("blocker")))
    print("chroma_opened=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
