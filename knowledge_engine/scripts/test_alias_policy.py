#!/usr/bin/env python3
"""
Mock tests for second-pilot alias policy v1 (no PDF / Chroma / indexing).
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.alias_policy import (
    AliasPolicyError,
    build_content_identity_records,
    dedupe_search_hits_by_content,
    default_policy_path,
    load_alias_policy,
    plan_indexing_units,
    require_alias_policy_ready,
    validate_alias_policy_against_selection,
)
from knowledge_engine.pilot.collection_guards import ProtectedCollectionError
from knowledge_engine.pilot.constants import PILOT_COLLECTION_NAME, SECOND_PILOT_COLLECTION_NAME
from knowledge_engine.pilot.v2_pipeline import (
    apply_alias_extract_once_plan,
    assert_no_v1_writes,
    gate_v2_with_alias_policy,
    make_spy_adapters,
)


def _minimal_selection_from_policy(policy: dict) -> dict:
    rows = []
    for g in policy["groups"]:
        for p in g["paths"]:
            rows.append({"relative_path": p, "pilot_wave": "second_pilot_addition"})
    # pad to keep structure; validation of 150 is separate
    return {
        "selection_id": "pilot_selection_v2",
        "proposed_collection": SECOND_PILOT_COLLECTION_NAME,
        "selected": rows,
    }


def _check(name: str, cond: bool, detail: str = "") -> tuple[str, bool, str]:
    return name, bool(cond), detail


def main() -> int:
    checks: list[tuple[str, bool, str]] = []
    policy = load_alias_policy()
    checks.append(_check("policy_file_exists", default_policy_path().is_file()))
    checks.append(_check("policy_not_live_indexed", policy.get("applied_to_live_index") is False))

    decisions = {g["group_id"]: g["decision"] for g in policy["groups"]}
    expected = {
        "g1_is3203_cross_std": "B",
        "g2_is1500_cross_std": "B",
        "g3_is1956_amd1_filename_variants": "A",
        "g4_is4367_amd1_filename_variants": "A",
        "g5_10951_amd3_filename_variants": "A",
        "g6_is1570_amd1_filename_variants_suspect": "A",
        "g7_is2074_amd1_filename_variants": "A",
    }
    checks.append(_check("decisions_match", decisions == expected, str(decisions)))

    sel = _minimal_selection_from_policy(policy)
    # Observed hashes match policy
    observed = {}
    for g in policy["groups"]:
        for p in g["paths"]:
            observed[p] = g["sha256"]
    summary = validate_alias_policy_against_selection(
        policy, selection=sel, observed_hashes_by_path=observed
    )
    checks.append(_check("validate_ok", summary["ok"]))
    checks.append(_check("seven_groups", summary["group_count"] == 7))
    checks.append(_check("aliased_paths_20", summary["aliased_path_count"] == 20))

    records = build_content_identity_records(policy)
    units = plan_indexing_units(records)
    checks.append(_check("seven_content_units", len(units) == 7))
    checks.append(_check("extract_once_each", all(u["extract_once"] and u["embed_once"] for u in units)))

    # A groups: one canonical + aliases
    for rec in records:
        if rec.decision == "A":
            cans = [p for p in rec.path_records if p.role == "canonical"]
            checks.append(_check(f"{rec.group_id}_one_canonical", len(cans) == 1))
            checks.append(
                _check(
                    f"{rec.group_id}_aliases_cover",
                    set(rec.source_aliases) == {p.relative_path for p in rec.path_records},
                )
            )
        else:
            checks.append(
                _check(
                    f"{rec.group_id}_all_path_records_b",
                    all(p.role == "path_record_b" for p in rec.path_records),
                )
            )
            # path-specific STD contexts retained and may differ
            stds = {p.path_std_context for p in rec.path_records}
            checks.append(_check(f"{rec.group_id}_multi_std_context", len(stds) >= 2))

    # Heuristic never verified
    checks.append(_check("no_verified_is_number", all(not r.is_number_verified for r in records)))

    # Group 5: null is_number, forbid folder inference
    g5 = next(r for r in records if r.group_id.startswith("g5"))
    checks.append(_check("g5_is_null", g5.is_number_heuristic is None))
    checks.append(_check("g5_forbid_folder_is", g5.forbid_folder_inferred_is_number))

    # Group 6 suspect
    g6 = next(r for r in records if r.group_id.startswith("g6"))
    checks.append(_check("g6_suspect", g6.quality_classification == "suspect"))
    checks.append(_check("g6_needs_review", g6.quality_review_status == "needs_review"))

    # v1 mapping plan present for g1/g2/g3/g4
    g1 = next(r for r in records if r.group_id.startswith("g1"))
    checks.append(_check("g1_reuse_candidate", bool(g1.v1_reuse_candidate_path)))
    checks.append(_check("g1_alias_only_v1_path", len(g1.v1_alias_only_paths) == 1))
    g2 = next(r for r in records if r.group_id.startswith("g2"))
    checks.append(_check("g2_reuse_candidate", "18384" in (g2.v1_reuse_candidate_path or "")))

    # Extract/embed once across multi-path units
    adapters = make_spy_adapters()
    result = apply_alias_extract_once_plan(units=units, adapters=adapters, dry_run=False)
    checks.append(_check("spy_extract_7", adapters.spies.extract_calls == 7, str(adapters.spies.extract_calls)))
    checks.append(_check("spy_embed_7", adapters.spies.embed_calls == 7))
    checks.append(_check("spy_not_20", adapters.spies.extract_calls != 20))

    # Search dedupe: same chunk / content must not repeat; aliases attached
    fake_hits = []
    for rec in records:
        for i, path in enumerate(rec.source_aliases):
            fake_hits.append(
                {
                    "chunk_id": f"{rec.shared_chunk_id_prefix}:p0001:c001",
                    "source_relative_path": path,
                    "source_file_hash": rec.sha256,
                    "review_status": "usable",
                    "is_number": rec.is_number_heuristic,
                    "rank": i + 1,
                }
            )
    deduped = dedupe_search_hits_by_content(fake_hits, alias_records=records)
    checks.append(_check("dedupe_to_7", len(deduped) == 7, str(len(deduped))))
    for h in deduped:
        checks.append(_check("aliases_present", len(h.get("source_aliases") or []) >= 2))
        checks.append(_check("hit_not_verified_is", h.get("is_number_verified") is False))

    # g6 must not stay usable after dedupe enrichment
    g6_hit = next(h for h in deduped if h["source_file_hash"] == g6.sha256)
    checks.append(_check("g6_not_usable", g6_hit.get("review_status") != "usable", str(g6_hit.get("review_status"))))

    # g5 must not invent IS from empty
    g5_hit = next(h for h in deduped if h["source_file_hash"] == g5.sha256)
    checks.append(_check("g5_hit_is_null", g5_hit.get("is_number") in (None, "")))

    # Fail-closed: missing policy
    try:
        require_alias_policy_ready(selection=sel, policy_path=Path("/nonexistent/alias_policy_v1.json"))
        checks.append(_check("missing_policy_fails", False))
    except AliasPolicyError:
        checks.append(_check("missing_policy_fails", True))

    # Fail-closed: hash mismatch
    bad_obs = dict(observed)
    bad_obs[policy["groups"][0]["paths"][0]] = "0" * 64
    try:
        validate_alias_policy_against_selection(
            policy, selection=sel, observed_hashes_by_path=bad_obs
        )
        checks.append(_check("hash_mismatch_fails", False))
    except AliasPolicyError:
        checks.append(_check("hash_mismatch_fails", True))

    # Fail-closed: duplicate mapping conflict
    bad_policy = copy.deepcopy(policy)
    bad_policy["groups"][1]["paths"].append(policy["groups"][0]["paths"][0])
    try:
        validate_alias_policy_against_selection(bad_policy, selection=sel)
        checks.append(_check("dup_mapping_fails", False))
    except AliasPolicyError:
        checks.append(_check("dup_mapping_fails", True))

    # v1 write forbidden
    try:
        assert_no_v1_writes(PILOT_COLLECTION_NAME)
        checks.append(_check("v1_write_blocked", False))
    except ProtectedCollectionError:
        checks.append(_check("v1_write_blocked", True))

    gated = gate_v2_with_alias_policy(selection=sel, observed_hashes_by_path=observed)
    checks.append(_check("gate_ok", gated["ok"] and gated["content_units"] == 7))
    checks.append(_check("selection_rows_not_deleted", gated["selection_rows"] == len(sel["selected"])))

    # Shared chunk prefix identity across aliases in a unit
    for u in units:
        prefix = u["shared_chunk_id_prefix"]
        checks.append(_check("prefix_doc_", prefix.startswith("doc_") and len(prefix) == 16))

    failed = [c for c in checks if not c[1]]
    for name, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  {detail}" if detail and not ok else ""))
    print("ALL PASS" if not failed else f"{len(failed)} FAILED")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
