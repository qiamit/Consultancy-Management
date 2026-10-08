#!/usr/bin/env python3
"""Mock tests for selection validation, standards filter, and API helpers (no Chroma/PDF)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.constants import (
    PILOT_COLLECTION_NAME,
    SECOND_PILOT_COLLECTION_NAME,
)
from knowledge_engine.pilot.selection_validate import (
    SelectionValidationError,
    validate_second_pilot_selection,
)
from knowledge_engine.search_pipeline import (
    matches_standard,
    standard_key,
    verified_is_number,
)
from knowledge_engine.scripts import serve_knowledge_search_api as api


def _check(name: str, cond: bool, detail: str = "") -> tuple[str, bool, str]:
    return name, bool(cond), detail


def test_selection_validation() -> list[tuple[str, bool, str]]:
    existing = [{"relative_path": f"STD {i}/a.pdf", "pilot_wave": "existing_pilot"} for i in range(40)]
    additions = [
        {"relative_path": f"STD X/{i}.pdf", "pilot_wave": "second_pilot_addition"} for i in range(110)
    ]
    good = {
        "selection_id": "pilot_selection_v2",
        "proposed_collection": SECOND_PILOT_COLLECTION_NAME,
        "reuse_from_collection": PILOT_COLLECTION_NAME,
        "selected": existing + additions,
    }
    v1 = {
        "selection_id": "pilot_selection_v1",
        "proposed_collection": PILOT_COLLECTION_NAME,
        "selected": [{"relative_path": r["relative_path"]} for r in existing],
    }
    out = validate_second_pilot_selection(good, existing_v1_selection=v1)
    checks = [
        _check("sel.ok", out["ok"] and out["total"] == 150),
        _check("sel.existing", out["existing_count"] == 40),
        _check("sel.additions", out["additions_count"] == 110),
    ]

    bad_col = dict(good)
    bad_col["proposed_collection"] = PILOT_COLLECTION_NAME
    try:
        validate_second_pilot_selection(bad_col, existing_v1_selection=v1)
        checks.append(_check("sel.reject_v1_target", False))
    except SelectionValidationError:
        checks.append(_check("sel.reject_v1_target", True))

    bad_count = dict(good)
    bad_count["selected"] = existing + additions[:50]
    try:
        validate_second_pilot_selection(bad_count, existing_v1_selection=v1)
        checks.append(_check("sel.reject_wrong_total", False))
    except SelectionValidationError:
        checks.append(_check("sel.reject_wrong_total", True))

    dup = dict(good)
    dup["selected"] = existing + additions[:-1] + [dict(additions[0])]
    try:
        validate_second_pilot_selection(dup, existing_v1_selection=v1)
        checks.append(_check("sel.reject_dup_path", False))
    except SelectionValidationError:
        checks.append(_check("sel.reject_dup_path", True))

    return checks


def test_standards_filter() -> list[tuple[str, bool, str]]:
    ch9666 = {"is_number": "IS 9666", "source_relative_path": "Standards/other/x.pdf", "sample_label": "doc_abc"}
    ch_empty = {"is_number": "", "source_relative_path": "STD 9999/foo.pdf", "sample_label": "doc_xyz"}
    checks = [
        _check("std.key_all", standard_key("all") == "all"),
        _check("std.key_is", standard_key("IS 1234") == "IS 1234"),
        _check("std.verified", verified_is_number(ch9666) == "IS 9666"),
        _check("std.match_meta", matches_standard(ch9666, "IS 9666")),
        _check("std.no_path_guess", not matches_standard(ch_empty, "IS 9999")),
        _check("std.all", matches_standard(ch_empty, "all")),
    ]
    return checks


def test_api_helpers() -> list[tuple[str, bool, str]]:
    checks = [
        _check("api.localhost_default", api.HOST == "127.0.0.1"),
        _check("api.body_limit", api.MAX_BODY_BYTES == 32_768),
        _check("api.query_limit", api.MAX_QUERY_CHARS == 2_000),
        _check(
            "api.cors_local_only",
            "http://127.0.0.1:5173" in api.ALLOWED_CORS_ORIGINS
            and "*" not in api.ALLOWED_CORS_ORIGINS,
        ),
        _check(
            "api.cors_deny_star",
            api._cors_headers("https://evil.example") == api._cors_headers(None)
            or "Access-Control-Allow-Origin" not in api._cors_headers("https://evil.example"),
        ),
        _check(
            "api.cors_allow_vite",
            api._cors_headers("http://127.0.0.1:5173").get("Access-Control-Allow-Origin")
            == "http://127.0.0.1:5173",
        ),
        _check(
            "api.safe_error_no_path",
            "/Users/" not in api._safe_error_message(FileNotFoundError("/Users/secret/.env")),
        ),
    ]
    banners = api._corpus_banners("bis_pilot_representative_v1", 1156, is_pilot=True)
    checks.append(_check("api.banner_no_19", "19 chunk" not in banners["banner_en"].lower()))
    checks.append(_check("api.banner_has_count", "1156" in banners["banner_en"]))

    # standards payload uses cache; mock STATE
    api.STATE.collection = object()
    api.STATE.collection_name = "bis_pilot_representative_v1"
    api.STATE.collection_count = 1156
    api.STATE.standards_cache = [
        {"id": "IS 9666", "label": "IS 9666"},
        {"id": "IS 2676", "label": "IS 2676"},
        {"id": "IS 10500", "label": "IS 10500"},
    ]
    payload = api.build_standards_payload()
    ids = [s["id"] for s in payload["standards"]]
    checks.append(_check("api.standards_all_first", ids[0] == "all"))
    checks.append(_check("api.standards_multi", "IS 10500" in ids))
    checks.append(_check("api.standards_no_stale_19", "19" not in json.dumps(payload)))
    return checks


def main() -> int:
    checks: list[tuple[str, bool, str]] = []
    checks.extend(test_selection_validation())
    checks.extend(test_standards_filter())
    checks.extend(test_api_helpers())
    failed = [c for c in checks if not c[1]]
    for name, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  {detail}" if detail and not ok else ""))
    print("ALL PASS" if not failed else f"{len(failed)} FAILED")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
