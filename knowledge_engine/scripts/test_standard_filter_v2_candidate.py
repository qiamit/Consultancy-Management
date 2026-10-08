#!/usr/bin/env python3
"""
Mock tests for offline standard_filter_v2_candidate (no Chroma / live wire).
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.standard_filter_v2_candidate import (
    candidate_standard_filter_ok,
    live_standard_filter_ok_snapshot,
    resolve_standard_identity_v2_candidate,
)


def _check(name: str, cond: bool, detail: str = "") -> tuple[str, bool, str]:
    return name, bool(cond), detail


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    # 1) Verified metadata match
    verified = {
        "is_number": "IS 9666",
        "sample_label": "doc_abc",
        "source_relative_path": "STD 9999/anything.pdf",
    }
    idv = resolve_standard_identity_v2_candidate(verified)
    checks.append(_check("verified.confidence", idv.confidence == "verified_metadata"))
    checks.append(_check("verified.is", idv.is_number == "IS 9666"))
    okv = candidate_standard_filter_ok(verified, "IS 9666")
    checks.append(_check("verified.filter_ok", okv["standard_filter_ok"] is True))
    # Live also accepts non-empty is_number containing "9666"
    checks.append(
        _check(
            "verified.live_also_ok_via_is_number",
            live_standard_filter_ok_snapshot(verified, "IS 9666") is True,
        )
    )

    # 2) Explicit filename signal
    fname = {
        "is_number": "",
        "sample_label": "doc_bababe0a4a01",
        "source_relative_path": "STD 9666/IS 9666 2023 - 00.pdf",
    }
    idf = resolve_standard_identity_v2_candidate(fname)
    checks.append(_check("filename.confidence", idf.confidence == "filename_heuristic_unverified"))
    checks.append(_check("filename.is", idf.is_number == "IS 9666"))
    checks.append(_check("filename.provenance", "filename_IS_token" in idf.provenance))
    okf = candidate_standard_filter_ok(fname, "IS 9666")
    checks.append(_check("filename.filter_ok", okf["standard_filter_ok"] is True))
    checks.append(
        _check(
            "filename.live_fails",
            live_standard_filter_ok_snapshot(fname, "IS 9666") is False,
        )
    )

    # 2b) IS 2676 filename under STD 21
    f2676 = {
        "is_number": "",
        "sample_label": "doc_0784f2f3049c",
        "source_relative_path": "STD 21/Test Method/IS 2676 1981 - 00.pdf",
    }
    id2676 = resolve_standard_identity_v2_candidate(f2676)
    checks.append(_check("2676.filename", id2676.is_number == "IS 2676"))
    checks.append(
        _check(
            "2676.folder_not_identity",
            id2676.std_folder_token == "21" and id2676.confidence == "filename_heuristic_unverified",
        )
    )
    checks.append(
        _check(
            "2676.filter_ok",
            candidate_standard_filter_ok(f2676, "IS 2676")["standard_filter_ok"] is True,
        )
    )

    # 3) Ambiguous folder-only (g5-like): STD 10951 without IS in filename
    amb = {
        "is_number": "",
        "sample_label": "doc_58c6073ef08e",
        "source_relative_path": "STD 10951/10951_Amd3.pdf",
    }
    ida = resolve_standard_identity_v2_candidate(amb)
    checks.append(_check("ambiguous.review", ida.confidence == "review_required"))
    checks.append(_check("ambiguous.no_is", ida.is_number is None))
    checks.append(
        _check(
            "ambiguous.not_ok_for_9666",
            candidate_standard_filter_ok(amb, "IS 9666")["standard_filter_ok"] is False,
        )
    )
    checks.append(
        _check(
            "ambiguous.reason",
            candidate_standard_filter_ok(amb, "IS 9666")["reason"] == "ambiguous_review_required",
        )
    )
    # Must NOT invent IS 10951 from folder
    checks.append(_check("ambiguous.no_folder_as_is", ida.is_number != "IS 10951"))

    # 4) Unknown standard selected with verified other IS
    unk = candidate_standard_filter_ok(verified, "IS 1234")
    checks.append(_check("unknown_std.mismatch", unk["standard_filter_ok"] is False))
    checks.append(_check("unknown_std.reason", unk["reason"] == "identity_mismatch"))
    # all mode
    checks.append(
        _check(
            "all_mode.ok",
            candidate_standard_filter_ok(amb, "all")["standard_filter_ok"] is True,
        )
    )

    # 5) Hard NOT_FOUND path: wrong standard must not pass filter
    wrong = {
        "is_number": "",
        "sample_label": "doc_x",
        "source_relative_path": "STD 1500/Test Method/IS 1500 Part 1 2019 - 00.pdf",
    }
    wr = candidate_standard_filter_ok(wrong, "IS 9666")
    checks.append(_check("not_found.wrong_std_blocked", wr["standard_filter_ok"] is False))

    # Legacy sample label still works
    leg = {
        "is_number": "",
        "sample_label": "native_text",
        "source_relative_path": "Standards/legacy.pdf",
    }
    idl = resolve_standard_identity_v2_candidate(leg)
    checks.append(_check("legacy.label", idl.confidence == "legacy_sample_label" and idl.is_number == "IS 9666"))
    checks.append(
        _check(
            "legacy.live_also_ok",
            live_standard_filter_ok_snapshot(leg, "IS 9666") is True,
        )
    )

    # Candidate never claims live_wired
    checks.append(_check("not_live_wired", okf.get("live_wired") is False))

    failed = [c for c in checks if not c[1]]
    for name, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  {detail}" if detail and not ok else ""))
    print("ALL PASS" if not failed else f"{len(failed)} FAILED")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
