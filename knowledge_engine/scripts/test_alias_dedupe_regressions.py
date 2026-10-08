#!/usr/bin/env python3
"""
Mock regressions for alias-policy search dedupe (no Chroma / PDF / indexing).

Guarantees:
- Sibling chunks (same SHA, different chunk_id) are NOT collapsed
- Identical text across different documents is NOT collapsed
- Alias-equivalent same chunk_id appearing twice → one hit with aliases
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.alias_policy import (
    build_content_identity_records,
    dedupe_search_hits_by_content,
    load_alias_policy,
)


def _check(name: str, cond: bool, detail: str = "") -> tuple[str, bool, str]:
    return name, bool(cond), detail


def main() -> int:
    checks: list[tuple[str, bool, str]] = []
    policy = load_alias_policy()
    records = build_content_identity_records(policy)
    g1 = next(r for r in records if r.group_id.startswith("g1"))

    # --- Sibling chunks same SHA / same text must BOTH survive ---
    sibling_hits = [
        {
            "chunk_id": f"{g1.shared_chunk_id_prefix}:p0001:c001",
            "text": "identical sibling text body for regression",
            "source_relative_path": g1.source_aliases[0],
            "source_file_hash": g1.sha256,
            "clause_number": "1",
            "rank": 1,
        },
        {
            "chunk_id": f"{g1.shared_chunk_id_prefix}:p0002:c002",
            "text": "identical sibling text body for regression",
            "source_relative_path": g1.source_aliases[0],
            "source_file_hash": g1.sha256,
            "clause_number": "2",
            "rank": 2,
        },
    ]
    sib = dedupe_search_hits_by_content(sibling_hits, alias_records=records)
    checks.append(_check("siblings_both_kept", len(sib) == 2, str(len(sib))))
    checks.append(
        _check(
            "siblings_aliases_attached",
            all(len(h.get("source_aliases") or []) >= 2 for h in sib),
        )
    )
    checks.append(
        _check(
            "siblings_distinct_chunk_ids",
            {h["chunk_id"] for h in sib} == {sibling_hits[0]["chunk_id"], sibling_hits[1]["chunk_id"]},
        )
    )

    # --- Same alias chunk_id twice (two paths) → one result + aliases ---
    alias_dup_hits = [
        {
            "chunk_id": f"{g1.shared_chunk_id_prefix}:p0001:c001",
            "text": "shared alias chunk",
            "source_relative_path": g1.source_aliases[0],
            "source_file_hash": g1.sha256,
            "rank": 1,
        },
        {
            "chunk_id": f"{g1.shared_chunk_id_prefix}:p0001:c001",
            "text": "shared alias chunk",
            "source_relative_path": g1.source_aliases[1],
            "source_file_hash": g1.sha256,
            "rank": 2,
        },
    ]
    ad = dedupe_search_hits_by_content(alias_dup_hits, alias_records=records)
    checks.append(_check("alias_dup_once", len(ad) == 1, str(len(ad))))
    checks.append(
        _check(
            "alias_dup_aliases_cover",
            set(ad[0].get("source_aliases") or []) == set(g1.source_aliases),
        )
    )

    # --- Same text, different documents / identities → both kept ---
    g2 = next(r for r in records if r.group_id.startswith("g2"))
    same_text_diff_docs = [
        {
            "chunk_id": f"{g1.shared_chunk_id_prefix}:p0001:c001",
            "text": "exactly the same wording across docs",
            "source_relative_path": g1.source_aliases[0],
            "source_file_hash": g1.sha256,
            "rank": 1,
        },
        {
            "chunk_id": f"{g2.shared_chunk_id_prefix}:p0001:c001",
            "text": "exactly the same wording across docs",
            "source_relative_path": g2.source_aliases[0],
            "source_file_hash": g2.sha256,
            "rank": 2,
        },
    ]
    diff = dedupe_search_hits_by_content(same_text_diff_docs, alias_records=records)
    checks.append(_check("same_text_diff_docs_kept", len(diff) == 2, str(len(diff))))
    checks.append(
        _check(
            "not_collapsed_by_document_sha",
            {h["source_file_hash"] for h in diff} == {g1.sha256, g2.sha256},
        )
    )

    # --- Policy multi-path same chunk still collapses to one per unit ---
    multi = []
    for rec in records:
        for path in rec.source_aliases:
            multi.append(
                {
                    "chunk_id": f"{rec.shared_chunk_id_prefix}:p0001:c001",
                    "source_relative_path": path,
                    "source_file_hash": rec.sha256,
                    "text": f"unit {rec.group_id}",
                }
            )
    multi_out = dedupe_search_hits_by_content(multi, alias_records=records)
    checks.append(_check("seven_alias_units", len(multi_out) == 7, str(len(multi_out))))

    # --- With siblings + aliases: 7 units × 2 siblings = 14 ---
    multi_sib = []
    for rec in records:
        for path in rec.source_aliases:
            for page in (1, 2):
                multi_sib.append(
                    {
                        "chunk_id": f"{rec.shared_chunk_id_prefix}:p{page:04d}:c{page:03d}",
                        "source_relative_path": path,
                        "source_file_hash": rec.sha256,
                        "text": f"sibling page {page}",
                    }
                )
    multi_sib_out = dedupe_search_hits_by_content(multi_sib, alias_records=records)
    checks.append(
        _check(
            "seven_units_times_two_siblings",
            len(multi_sib_out) == 14,
            str(len(multi_sib_out)),
        )
    )

    failed = [c for c in checks if not c[1]]
    for name, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  {detail}" if detail and not ok else ""))
    print("ALL PASS" if not failed else f"{len(failed)} FAILED")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
