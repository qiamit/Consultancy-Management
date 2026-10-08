#!/usr/bin/env python3
"""
Mock-only integration: alias policy ↔ v2 planning/pipeline ↔ search assembly.

No PDF reads, OCR, embedding backends, Chroma clients, or live indexing.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.alias_policy import (
    AliasPolicyError,
    build_content_identity_records,
    load_alias_policy,
    require_alias_policy_ready,
)
from knowledge_engine.pilot.collection_guards import ProtectedCollectionError
from knowledge_engine.pilot.constants import (
    PILOT_COLLECTION_NAME,
    SECOND_PILOT_COLLECTION_NAME,
)
from knowledge_engine.pilot.v2_pipeline import (
    apply_alias_extract_once_plan,
    assert_no_v1_writes,
    gate_v2_with_alias_policy,
    make_spy_adapters,
)
from knowledge_engine.pilot.v2_plan import V2PlanError, build_second_pilot_plan
from knowledge_engine.search_pipeline import assemble_hybrid_search_results


def _check(name: str, cond: bool, detail: str = "") -> tuple[str, bool, str]:
    return name, bool(cond), detail


def _selection_150_from_policy(policy: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build a valid 150-row v2 selection containing all policy paths."""
    policy_paths: list[str] = []
    for g in policy["groups"]:
        for p in g["paths"]:
            policy_paths.append(p)
    # First 40 unique paths as existing_pilot (pad if needed)
    existing_paths = list(dict.fromkeys(policy_paths))[:40]
    while len(existing_paths) < 40:
        existing_paths.append(f"STD EXISTING/pad_{len(existing_paths)}.pdf")
    # Remaining policy paths + pads as additions
    remaining_policy = [p for p in policy_paths if p not in existing_paths]
    additions: list[str] = list(remaining_policy)
    i = 0
    while len(additions) < 110:
        cand = f"STD ADD/addition_{i}.pdf"
        if cand not in existing_paths and cand not in additions:
            additions.append(cand)
        i += 1
    assert len(existing_paths) == 40 and len(additions) == 110
    selected = (
        [{"relative_path": p, "pilot_wave": "existing_pilot", "classification": "usable"} for p in existing_paths]
        + [
            {"relative_path": p, "pilot_wave": "second_pilot_addition", "classification": "usable"}
            for p in additions
        ]
    )
    # Force g6 paths to suspect in selection if present
    g6 = next(g for g in policy["groups"] if g["group_id"].startswith("g6"))
    g6_paths = set(g6["paths"])
    for row in selected:
        if row["relative_path"] in g6_paths:
            row["classification"] = "suspect"

    v2 = {
        "selection_id": "pilot_selection_v2",
        "proposed_collection": SECOND_PILOT_COLLECTION_NAME,
        "reuse_from_collection": PILOT_COLLECTION_NAME,
        "selected": selected,
    }
    v1 = {
        "selection_id": "pilot_selection_v1",
        "proposed_collection": PILOT_COLLECTION_NAME,
        "selected": [{"relative_path": p} for p in existing_paths],
    }
    return v2, v1


def _fake_v1_manifest_for_policy(policy: dict[str, Any]) -> dict[str, dict[str, Any]]:
    docs: dict[str, dict[str, Any]] = {}
    for g in policy["groups"]:
        for entry in g.get("v1_path_keyed_chunk_sets") or []:
            rel = entry["source_relative_path"]
            docs[rel] = {
                "sha256": g["sha256"],
                "status": "indexed",
                "usable_chunk_count": entry.get("usable_chunk_count"),
                "indexed_chunk_ids": [
                    f"{g['v2_content_mapping']['shared_chunk_id_prefix']}:p0001:c001"
                ],
                "sample_label": entry.get("legacy_sample_label"),
            }
    return docs


class ChromaInitSpy:
    """Fails if any Chroma-style client construction is attempted."""

    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        self.calls += 1
        raise AssertionError("Chroma initialization must not run in planning/integration mocks")


def main() -> int:
    checks: list[tuple[str, bool, str]] = []
    chroma_spy = ChromaInitSpy()
    # Patch symbols that would open Chroma if planning leaked
    import knowledge_engine.search_pipeline as sp

    original_open = getattr(sp, "open_existing_chroma_collection", None)
    sp.open_existing_chroma_collection = chroma_spy  # type: ignore[assignment]

    try:
        policy = load_alias_policy()
        records = build_content_identity_records(policy)
        sel, v1_sel = _selection_150_from_policy(policy)
        v1_docs = _fake_v1_manifest_for_policy(policy)
        observed = {p: g["sha256"] for g in policy["groups"] for p in g["paths"]}

        # --- Gate before Chroma ---
        gated = gate_v2_with_alias_policy(selection=sel, observed_hashes_by_path=observed)
        checks.append(_check("gate.ok", gated["ok"] and gated["content_units"] == 7))
        checks.append(_check("gate.no_chroma", chroma_spy.calls == 0))

        # Missing policy fails before Chroma
        try:
            gate_v2_with_alias_policy(
                selection=sel,
                policy_path=Path("/nonexistent/alias_policy_v1.json"),
            )
            checks.append(_check("gate.missing_policy_fail", False))
        except AliasPolicyError:
            checks.append(_check("gate.missing_policy_fail", True))
        checks.append(_check("gate.missing_still_no_chroma", chroma_spy.calls == 0))

        # Hash mismatch fails closed
        bad = dict(observed)
        bad[policy["groups"][0]["paths"][0]] = "f" * 64
        try:
            gate_v2_with_alias_policy(selection=sel, observed_hashes_by_path=bad)
            checks.append(_check("gate.hash_mismatch_fail", False))
        except AliasPolicyError:
            checks.append(_check("gate.hash_mismatch_fail", True))

        # Protected v1 write path blocked
        try:
            assert_no_v1_writes(PILOT_COLLECTION_NAME)
            checks.append(_check("v1.write_blocked", False))
        except ProtectedCollectionError:
            checks.append(_check("v1.write_blocked", True))
        try:
            gate_v2_with_alias_policy(selection=sel, collection_name=PILOT_COLLECTION_NAME)
            checks.append(_check("gate.v1_collection_blocked", False))
        except Exception:
            checks.append(_check("gate.v1_collection_blocked", True))

        # --- Planning only ---
        plan = build_second_pilot_plan(
            selection=sel,
            existing_v1_selection=v1_sel,
            v1_manifest_docs=v1_docs,
        )
        checks.append(_check("plan.mode", plan["mode"] == "planning_only"))
        checks.append(_check("plan.no_chroma_flag", plan["chroma_initialized"] is False))
        checks.append(_check("plan.no_pdf", plan["pdf_reads"] is False))
        checks.append(_check("plan.no_index", plan["indexing_started"] is False))
        checks.append(_check("plan.paths_150", plan["selection_path_count"] == 150))
        checks.append(_check("plan.groups_7", plan["alias_policy_group_count"] == 7))
        est = plan["unique_content_estimate_from_known_alias_groups_only"][
            "estimated_unique_if_only_these_7_groups_collapse"
        ]
        checks.append(_check("plan.unique_137_from_7_groups", est == 137, str(est)))
        checks.append(_check("plan.chroma_spy_still_0", chroma_spy.calls == 0))

        # Group 1 B: two v1 paths → shared content; alias_only stays alias
        g1 = next(r for r in records if r.group_id.startswith("g1"))
        g1_actions = {
            p["relative_path"]: p["action"]
            for p in plan["per_path_actions"]
            if p.get("group_id") == g1.group_id
        }
        checks.append(
            _check(
                "g1.reuse_candidate",
                g1_actions.get(g1.v1_reuse_candidate_path or "") == "reuse",
            )
        )
        for ap in g1.v1_alias_only_paths:
            checks.append(_check("g1.alias_only", g1_actions.get(ap) == "alias", ap))

        # Group 2: only 18384 reuse; 3443/617 alias
        g2 = next(r for r in records if r.group_id.startswith("g2"))
        g2_actions = {
            p["relative_path"]: p["action"]
            for p in plan["per_path_actions"]
            if p.get("group_id") == g2.group_id
        }
        checks.append(
            _check(
                "g2.18384_reuse",
                any("18384" in p and a == "reuse" for p, a in g2_actions.items()),
                str(g2_actions),
            )
        )
        checks.append(
            _check(
                "g2.3443_alias",
                any("3443" in p and a == "alias" for p, a in g2_actions.items()),
            )
        )
        checks.append(
            _check(
                "g2.617_alias",
                any(
                    ("STD 617/" in p or "/STD 617/" in f"/{p}") and a == "alias"
                    for p, a in g2_actions.items()
                )
                or any(p.startswith("STD 617/") and a == "alias" for p, a in g2_actions.items()),
            )
        )

        # Group 5: is_number null / unverified
        g5_rows = [p for p in plan["per_path_actions"] if (p.get("group_id") or "").startswith("g5")]
        checks.append(_check("g5.rows", len(g5_rows) >= 2))
        checks.append(
            _check(
                "g5.is_null",
                all(r.get("is_number_heuristic") in (None, "") for r in g5_rows),
            )
        )
        checks.append(
            _check("g5.not_verified", all(r.get("is_number_verified") is False for r in g5_rows))
        )

        # Group 6: needs_review on all aliases; never usable
        g6_rows = [p for p in plan["per_path_actions"] if (p.get("group_id") or "").startswith("g6")]
        checks.append(_check("g6.rows", len(g6_rows) >= 2))
        checks.append(
            _check(
                "g6.needs_review",
                all(
                    r.get("quality_review_status") == "needs_review"
                    or r.get("forced_review_status") == "needs_review"
                    for r in g6_rows
                ),
            )
        )
        checks.append(
            _check(
                "g6.never_usable_promote",
                all(r.get("never_promote_to_usable") is True for r in g6_rows),
            )
        )

        # Bad selection / missing policy → plan fails before Chroma
        try:
            build_second_pilot_plan(
                selection=sel,
                existing_v1_selection=v1_sel,
                policy_path=Path("/nonexistent/alias_policy_v1.json"),
            )
            checks.append(_check("plan.missing_policy_fail", False))
        except V2PlanError:
            checks.append(_check("plan.missing_policy_fail", True))
        checks.append(_check("plan.fail_still_no_chroma", chroma_spy.calls == 0))

        # --- Extract/embed once per unique content (spies) ---
        _, _, units = require_alias_policy_ready(selection=sel, observed_hashes_by_path=observed)
        adapters = make_spy_adapters()
        apply_alias_extract_once_plan(units=units, adapters=adapters, dry_run=False)
        checks.append(_check("spy.extract_once_7", adapters.spies.extract_calls == 7))
        checks.append(_check("spy.embed_once_7", adapters.spies.embed_calls == 7))
        checks.append(_check("spy.not_per_alias_20", adapters.spies.extract_calls < 20))
        checks.append(_check("spy.no_delete_on_v1", adapters.spies.delete_calls == 0))

        # --- Search assembly dedupe (real path, mock hits) ---
        fake_hits: list[dict[str, Any]] = []
        for rec in records:
            for i, path in enumerate(rec.source_aliases):
                fake_hits.append(
                    {
                        "chunk_id": f"{rec.shared_chunk_id_prefix}:p0001:c001",
                        "text": f"shared evidence for {rec.group_id}",
                        "source_relative_path": path,
                        "source_file_hash": rec.sha256,
                        "review_status": "usable",
                        "is_number": rec.is_number_heuristic,
                        "clause_number": "1",
                        "pdf_pages": [1],
                        "sample_label": rec.shared_chunk_id_prefix,
                        "rank": i + 1,
                        "hybrid_score": 1.0 - i * 0.01,
                    }
                )
        assembled = assemble_hybrid_search_results(
            query="alias dedupe probe",
            standard="all",
            limit=20,
            ranked_hits=fake_hits,
            alias_records=records,
            answerability_public={
                "answerability_state": "supported",
                "message_hi": "ok",
                "evidence_reasons": [],
                "signals_summary": {},
                "debug_scores": {},
            },
        )
        checks.append(_check("search.dedupe_flag", assembled.get("alias_dedupe_applied") is True))
        checks.append(
            _check(
                "search.before_20",
                assembled.get("ranked_before_dedupe") == len(fake_hits),
                str(assembled.get("ranked_before_dedupe")),
            )
        )
        checks.append(
            _check(
                "search.after_7",
                assembled.get("ranked_after_dedupe") == 7
                and assembled.get("result_count") == 7,
                str(assembled.get("ranked_after_dedupe")),
            )
        )
        # B groups retain path contexts / aliases
        b_hits = [h for h in assembled["results"] if h.get("alias_decision") == "B"]
        checks.append(_check("search.b_hits", len(b_hits) == 2))
        for h in b_hits:
            checks.append(_check("search.b_aliases", len(h.get("source_aliases") or []) >= 2))
            checks.append(
                _check(
                    "search.b_path_contexts",
                    len(h.get("path_std_contexts") or {}) >= 2,
                )
            )

        g5_rec = next(r for r in records if r.group_id.startswith("g5"))
        g6_rec = next(r for r in records if r.group_id.startswith("g6"))
        g5_hit = next(h for h in assembled["results"] if h.get("content_document_id") == g5_rec.document_id)
        g6_hit = next(h for h in assembled["results"] if h.get("content_document_id") == g6_rec.document_id)
        checks.append(_check("search.g5_is_null", g5_hit.get("is_number") in (None, "")))
        checks.append(_check("search.g5_unverified", g5_hit.get("is_number_verified") is False))
        checks.append(_check("search.g6_not_usable", g6_hit.get("review_status") != "usable"))

        # run_hybrid_search must call assemble (smoke via mock collection without chroma open for pool)
        # We only verify assemble path; do not open Chroma.
        checks.append(_check("final.chroma_never_opened", chroma_spy.calls == 0))

    finally:
        if original_open is not None:
            sp.open_existing_chroma_collection = original_open  # type: ignore[assignment]

    failed = [c for c in checks if not c[1]]
    for name, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  {detail}" if detail and not ok else ""))
    print("ALL PASS" if not failed else f"{len(failed)} FAILED")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
